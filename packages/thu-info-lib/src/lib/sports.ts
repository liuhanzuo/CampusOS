import {roamingWrapperWithMocks} from "./core";
import {InfoHelper} from "../index";
import {uFetch} from "../utils/network";
import {
    SPORTS_BASE_URL,
    SPORTS_CAPTCHA_BASE_URL,
    SPORTS_DETAIL_URL,
    SPORTS_MAKE_ORDER_URL,
    SPORTS_MAKE_PAYMENT_LATER_URL,
    SPORTS_MAKE_PAYMENT_URL,
    SPORTS_PAID_URL,
    SPORTS_PAYMENT_ACTION_URL,
    SPORTS_PAYMENT_CHECK_URL,
    SPORTS_QUERY_PHONE_URL,
    SPORTS_UNPAID_URL,
    SPORTS_UNSUBSCRIBE_URL,
    SPORTS_UPDATE_PHONE_URL,
} from "../constants/strings";
import {SportsIdInfo, SportsReservationRecord, SportsResource, SportsResourcesInfo} from "../models/home/sports";
import {MOCK_RECORDS, MOCK_RESOURCES} from "../mocks/sports";
import * as cheerio from "cheerio";
import type {ElementType} from "domelementtype";
import type {Element} from "domhandler";
type TagElement = Element & {type: ElementType.Tag};
import {generalGetPayCode} from "../utils/alipay";
import {getCheerioText} from "../utils/cheerio";
import {LibError, SportsError} from "../utils/error";

export const VALID_RECEIPT_TITLES = ["清华大学", "清华大学工会", "清华大学教育基金会"] as const;
export type ValidReceiptTypes = typeof VALID_RECEIPT_TITLES[number];

/**
 * 体育场馆新 API 的基础 URL（直连，不通过 WebVPN）
 * 新的场馆系统使用 JWT token 认证，可以直接访问
 */
const SPORTS_DIRECT_BASE = "https://www.sports.tsinghua.edu.cn";

/**
 * 访问体育场馆新 API 的 fetch 方法（直连模式）
 *
 * 新的体育场馆系统使用 JWT token 认证，可以直接访问 www.sports.tsinghua.edu.cn，
 * 不需要通过 WebVPN 隧道。这与 roam 函数中的认证流程一致。
 */
const sportsFetch = async (url: string, method = "GET", body?: string): Promise<string> => {
    const jwtToken = (globalThis as any).__sportsJwtToken;

    console.log(`[Sports] sportsFetch: ${method} ${url}`);
    console.log(`[Sports] sportsFetch: token=${jwtToken ? jwtToken.substring(0, 30) + '...' : 'none'}`);

    // 构建额外的 headers（JWT token）
    const extraHeaders: Record<string, string> = {};
    if (jwtToken) {
        extraHeaders["token"] = jwtToken;
    }

    try {
        // 使用 uFetch 发送请求（直连模式，带 JWT token）
        if (method === "POST" && body) {
            const result = await uFetch(url, body as any, 60000, "UTF-8", true, "application/json", extraHeaders);
            console.log(`[Sports] sportsFetch: 响应长度=${result.length}, 前200字符: ${result.substring(0, 200)}`);
            return result;
        } else {
            const result = await uFetch(url, undefined, 60000, "UTF-8", false, "application/json", extraHeaders);
            console.log(`[Sports] sportsFetch: 响应长度=${result.length}`);
            // 打印完整响应用于调试
            console.log(`[Sports] sportsFetch: 完整响应: ${result.substring(0, 1000)}`);
            return result;
        }
    } catch (e: any) {
        console.error(`[Sports] sportsFetch 错误: ${e.message}`);
        throw e;
    }
};

const getSportsResourceLimit = async (
    helper: InfoHelper,
    gymId: string,
    itemId: string,
    date: string, // yyyy-MM-dd
) => {
    // 直接使用旧 API（通过 WebVPN）
    const rawHtml = await uFetch(`${SPORTS_BASE_URL}&gymnasium_id=${gymId}&item_id=${itemId}&time_date=${date}`);
    console.log(`[Sports] getSportsResourceLimit: rawHtml长度=${rawHtml.length}, 前200字符: ${rawHtml.substring(0, 200).replace(/\n/g, ' ')}`);
    const countSearch = /var limitBookCount = '(\d+?)';/.exec(rawHtml);
    const initSearch = /var limitBookInit = '(\d+?)';/.exec(rawHtml);
    if (countSearch === null || initSearch === null) {
        throw new SportsError("Exception occurred during getting sports resource limit");
    }
    return {count: Number(countSearch[1]), init: Number(initSearch[1])};
};

const getSportsResourceData = async (
    helper: InfoHelper,
    gymId: string,
    itemId: string,
    date: string, // yyyy-MM-dd
): Promise<SportsResource[]> => {
    // 直接使用旧 API（通过 WebVPN）
    const rawHtml = await uFetch(`${SPORTS_DETAIL_URL}&gymnasium_id=${gymId}&item_id=${itemId}&time_date=${date}`);
    const result: { [key: string]: SportsResource } = {};

    // Step one: get total resources
    const p1 = /resourceArray\.push\({id:'(.*?)',time_session:'(.*?)',field_name:'(.*?)',overlaySize:'(.*?)',can_net_book:'(.*?)'}\);[\s\S]+?resourcesm\.put\('(.*?)', '(.*?)'\)/gm;
    for (let r1 = p1.exec(rawHtml); r1 != null; r1 = p1.exec(rawHtml)) {
        if (r1[1] === r1[6]) {
            result[r1[1]] = {
                resId: r1[1],
                resHash: r1[7],
                timeSession: r1[2],
                fieldName: r1[3],
                overlaySize: Number(r1[4]),
                canNetBook: r1[5] === "1",
            } as SportsResource;
        }
    }

    // Step two: update cost
    const p2 = /addCost\('(.*?)','(.*?)'\);/g;
    for (let r2 = p2.exec(rawHtml); r2 != null; r2 = p2.exec(rawHtml)) {
        if (result[r2[1]] !== undefined) {
            result[r2[1]].cost = Number(r2[2]);
        }
    }

    // Step three: mark res status
    const p3 = /markResStatus\('(.*?)','(.*?)','(.*?)'\);/g;
    for (let r3 = p3.exec(rawHtml); r3 != null; r3 = p3.exec(rawHtml)) {
        if (result[r3[2]] !== undefined) {
            result[r3[2]].bookId = r3[1];
            result[r3[2]].locked = r3[3] === "1";
        }
    }

    // Step four: mark status color
    const p4 = /markStatusColor\('(.*?)','(.*?)','(.*?)','(.*?)'\);/g;
    for (let r4 = p4.exec(rawHtml); r4 != null; r4 = p4.exec(rawHtml)) {
        if (result[r4[1]] !== undefined) {
            result[r4[1]].userType = r4[2];
            result[r4[1]].paymentStatus = r4[3] === "1";
        }
    }

    return Object.keys(result).map(key => result[key]);
};

const getSportsPhoneNumber = async (): Promise<string | undefined> =>
    uFetch(SPORTS_QUERY_PHONE_URL).then((msg) => msg === "do_not" ? undefined : msg);

export const updateSportsPhoneNumber = async (
    helper: InfoHelper,
    phone: string,
): Promise<void> =>
    roamingWrapperWithMocks(
        helper,
        "default",
        "5539ECF8CD815C7D3F5A8EE0A2D72441",
        async () => {
            if (!/^(1[3-9][0-9]|15[036789]|18[89])\d{8}$/.test(phone)) {
                throw new SportsError("请正确填写手机号码!");
            }
            const response = await uFetch(`${SPORTS_UPDATE_PHONE_URL}${phone}&gzzh=${helper.userId}`, {});
            if (response.includes("找回密码")) {
                throw new LibError();
            }
        },
        undefined,
    );

export const getSportsResources = async (
    helper: InfoHelper,
    gymId: string,
    itemId: string,
    date: string, // yyyy-MM-dd
): Promise<SportsResourcesInfo> => {
    console.log(`[Sports] getSportsResources: gymId=${gymId}, itemId=${itemId}, date=${date}`);

    return roamingWrapperWithMocks(
        helper,
        "default",
        "5539ECF8CD815C7D3F5A8EE0A2D72441",
        async () => {
            // 使用新系统 API（直连，带 JWT token）
            console.log(`[Sports] 使用新系统API查询（直连模式）`);

            // 根据配置文件和抓包结果，API代理路径是 /venue/site/api
            // 尝试多个可能的API端点和参数组合
            const attempts = [
                // 端点1: venue/gym/detail（基于抓包发现的API模式）
                {
                    url: `${SPORTS_DIRECT_BASE}/venue/site/api/venue/gym/detail`,
                    body: { gymnasium_id: gymId, item_id: itemId, time_date: date },
                },
                // 端点2: res/book/getGymBook（原尝试路径）
                {
                    url: `${SPORTS_DIRECT_BASE}/venue/site/api/res/book/getGymBook`,
                    body: { gymnasium_id: gymId, item_id: itemId, time_date: date },
                },
                // 端点3: venue/field/query
                {
                    url: `${SPORTS_DIRECT_BASE}/venue/site/api/venue/field/query`,
                    body: { gymnasium_id: gymId, item_id: itemId, time_date: date },
                },
                // 端点4: reserve/field/list
                {
                    url: `${SPORTS_DIRECT_BASE}/venue/site/api/reserve/field/list`,
                    body: { gymnasium_id: gymId, item_id: itemId, time_date: date },
                },
                // 端点5: site/scene/detail
                {
                    url: `${SPORTS_DIRECT_BASE}/venue/site/api/site/scene/detail`,
                    body: { gymnasium_id: gymId, item_id: itemId, time_date: date },
                },
                // 端点6: book/gym/available
                {
                    url: `${SPORTS_DIRECT_BASE}/venue/site/api/book/gym/available`,
                    body: { gymnasium_id: gymId, item_id: itemId, time_date: date },
                },
                // 端点7: res/resource/list
                {
                    url: `${SPORTS_DIRECT_BASE}/venue/site/api/res/resource/list`,
                    body: { gymnasium_id: gymId, item_id: itemId, time_date: date },
                },
                // 端点8: 直接API路径（备用）
                {
                    url: `${SPORTS_DIRECT_BASE}/venue/api/res/book/getGymBook`,
                    body: { gymnasium_id: gymId, item_id: itemId, time_date: date },
                },
            ];

            let lastError: any = null;

            for (let i = 0; i < attempts.length; i++) {
                const attempt = attempts[i];
                const method: string = (attempt as any).method || 'POST';
                const requestBody = attempt.body ? JSON.stringify(attempt.body) : undefined;

                console.log(`[Sports] 尝试 ${i + 1}/${attempts.length}: ${method} ${attempt.url}`);
                if (requestBody) {
                    console.log(`[Sports] 请求体: ${requestBody}`);
                }

                try {
                    const responseText = await sportsFetch(attempt.url, method, requestBody || '');
                    console.log(`[Sports] 响应: ${responseText.substring(0, 300)}`);

                    const response = JSON.parse(responseText);

                    // 检查是否成功
                    if (response.success && response.code === 0 && response.data) {
                        console.log(`[Sports] ✓ API调用成功!`);

                        // 解析响应数据
                        const apiData = response.data;
                        const resources: SportsResource[] = [];

                        // 根据实际API响应结构映射数据
                        if (apiData.resources && Array.isArray(apiData.resources)) {
                            for (const res of apiData.resources) {
                                resources.push({
                                    resId: res.resId || res.id || "",
                                    resHash: res.resHash || res.hash || "",
                                    bookId: res.bookId,
                                    timeSession: res.timeSession || res.time || "",
                                    fieldName: res.fieldName || res.field || res.name || "",
                                    overlaySize: res.overlaySize || res.size || 0,
                                    canNetBook: res.canNetBook !== undefined ? res.canNetBook : true,
                                    cost: res.cost || res.price,
                                    locked: res.locked,
                                    userType: res.userType,
                                    paymentStatus: res.paymentStatus,
                                } as SportsResource);
                            }
                        }

                        return {
                            count: apiData.limit?.count || apiData.count || 3,
                            init: apiData.limit?.init || apiData.init || 1,
                            phone: apiData.phone || "",
                            data: resources,
                        } as SportsResourcesInfo;
                    } else if (response.code === 404) {
                        console.log(`[Sports] ✗ 404 Not Found，尝试下一个...`);
                        lastError = `404: ${attempt.url}`;
                        continue;
                    } else {
                        console.log(`[Sports] ✗ API返回错误: code=${response.code}, message=${response.message}`);
                        lastError = `code ${response.code}: ${response.message}`;
                        // 如果不是404，可能是参数错误，继续尝试
                        continue;
                    }
                } catch (e: any) {
                    console.log(`[Sports] ✗ 请求失败: ${e.message}`);
                    lastError = e;
                    // 继续尝试下一个端点
                }
            }

            // 所有尝试都失败
            console.error(`[Sports] 所有新API端点均失败。最后错误: ${lastError?.message || lastError}`);
            console.log(`[Sports] 回退到旧系统API...`);

            // 回退到旧API
            const limitData = await getSportsResourceLimit(helper, gymId, itemId, date);
            const resourceData = await getSportsResourceData(helper, gymId, itemId, date);
            const phoneNumber = await getSportsPhoneNumber();

            return {
                count: limitData.count,
                init: limitData.init,
                phone: phoneNumber || "",
                data: resourceData,
            } as SportsResourcesInfo;
        },
        MOCK_RESOURCES,
    );
};

export const getSportsCaptchaUrlMethod = (): string => `${SPORTS_CAPTCHA_BASE_URL}?${Math.floor(Math.random() * 100)}=`;

export const makeSportsReservation = async (
    helper: InfoHelper,
    totalCost: number,
    phone: string,
    receiptTitle: ValidReceiptTypes | undefined,
    gymId: string,
    itemId: string,
    date: string,  // yyyy-MM-dd
    captcha: string,
    resHashId: string,
    skipPayment: boolean,
): Promise<string | undefined> => {
    if (helper.mocked()) {
        return undefined;
    }
    const orderResult = await uFetch(SPORTS_MAKE_ORDER_URL, {
        "bookData.totalCost": totalCost,
        "bookData.book_person_zjh": "",
        "bookData.book_person_name": "",
        "bookData.book_person_phone": phone,
        "bookData.book_mode": "from-phone",
        "gymnasium_idForCache": gymId,
        "item_idForCache": itemId,
        "time_dateForCache": date,
        "userTypeNumForCache": 1,
        "putongRes": "putongRes",
        "code": captcha,
        "selectedPayWay": 1,
        "allFieldTime": `${resHashId}#${date}`,
    }).then(JSON.parse);
    if (orderResult.msg !== "预定成功") {
        throw new SportsError(orderResult.msg);
    }
    if (totalCost === 0) return undefined;
    if (skipPayment) return undefined;
    const paymentResultForm = await uFetch(SPORTS_MAKE_PAYMENT_URL, {
        is_jsd: receiptTitle === undefined ? "0" : "1",
        xm: receiptTitle ?? "清华大学",
        gymnasium_idForCache: gymId,
        item_idForCache: itemId,
        time_dateForCache: date,
        userTypeNumForCache: 1,
        allFieldTime: `${resHashId}#${date}`,
    }, 60000, "GBK").then((s) => cheerio.load(s)("form"));
    const paymentApiHtml = await uFetch(
        paymentResultForm.attr()!.action, // TODO found a bug here: attr() returns undefined
        paymentResultForm.serialize() as never as object,
        60000,
        "UTF-8",
        true,
    );
    const searchResult = /var id = '(.*)?';\s*?var token = '(.*)?';/.exec(paymentApiHtml);
    if (searchResult === null) {
        throw new SportsError("id and token not found.");
    }
    const paymentCheckResult = await uFetch(SPORTS_PAYMENT_CHECK_URL, {
        id: searchResult[1],
        token: searchResult[2],
    }).then(JSON.parse);
    if (paymentCheckResult.code !== "0") {
        throw new SportsError("Payment check failed: " + paymentCheckResult.message);
    }
    const inputs = cheerio.load(paymentApiHtml)("#payForm input");
    const postForm: { [key: string]: string } = {};
    inputs.each((_, element) => {
        const {attribs} = element as TagElement;
        postForm[attribs.name] = attribs.value;
    });
    postForm.channelId = "0101";
    return await generalGetPayCode(await uFetch(SPORTS_PAYMENT_ACTION_URL, postForm));
};

const getSportsReservationPaidRecords = async (): Promise<SportsReservationRecord[]> => {
    const $ = await uFetch(SPORTS_PAID_URL).then(cheerio.load);
    return $("tr[style='display:none']").toArray().map((e) => {
        const contentRow = cheerio.load(e)("tbody tr").first();
        const items = contentRow.find("td");
        return {
            name: getCheerioText(items[2]),
            field: getCheerioText(items[3]),
            time: getCheerioText(items[4]),
            price: getCheerioText(items[5]),
            method: "已支付",
            bookTimestamp: undefined,
            bookId: undefined,
            payId: undefined,
        };
    });
};

export const getSportsReservationRecords = async (
    helper: InfoHelper,
) => roamingWrapperWithMocks(
    helper,
    "default",
    "5539ECF8CD815C7D3F5A8EE0A2D72441",
    async () => {
        const $ = await uFetch(SPORTS_UNPAID_URL).then(cheerio.load);
        const tables = $("table");
        if (tables.length === 0) {
            throw new SportsError();
        }
        return $("tbody tr").toArray().map((e) => {
            const name = getCheerioText(e, 1);
            const field = getCheerioText(e, 3);
            const time = getCheerioText(e, 5);
            const price = getCheerioText(e, 7);
            const method = getCheerioText(e, 9);
            const bookTimestampString = cheerio.load((e as TagElement).children[11])("span[time]").attr("time");
            const bookTimestamp = bookTimestampString === undefined ? undefined : Number(bookTimestampString);
            let payId: string | undefined;
            let bookId: string | undefined;
            if (method === "网上支付") {
                const payAction = (((((e as TagElement).children[11] as TagElement).children[5] as TagElement).children[1] as TagElement).attribs.onclick);
                const payRes = /payNow\('(.+?)'/.exec(payAction);
                if (payRes !== null) {
                    payId = payRes[1];
                }
                const unsubscribeAction = (((((e as TagElement).children[11] as TagElement).children[5] as TagElement).children[3] as TagElement).attribs.onclick);
                const unsubscribeRes = /unsubscribeOnline\('(.+?)'/.exec(unsubscribeAction);
                if (unsubscribeRes !== null) {
                    bookId = unsubscribeRes[1];
                }
            } else if (method === "现场支付") {
                const unsubscribeAction = ((((e as TagElement).children[11] as TagElement).children[1] as TagElement).attribs.onclick);
                const unsubscribeRes = /unsubscribe\('(.+?)'/.exec(unsubscribeAction);
                if (unsubscribeRes !== null) {
                    bookId = unsubscribeRes[1];
                }
            }
            return {
                name,
                field,
                time,
                price,
                method,
                bookTimestamp,
                bookId,
                payId,
            } as SportsReservationRecord;
        }).concat(await getSportsReservationPaidRecords());
    },
    MOCK_RECORDS,
);

export const paySportsReservation = async (
    helper: InfoHelper,
    payId: string,
    receiptTitle: ValidReceiptTypes | undefined,
): Promise<string> => {
    if (helper.mocked()) {
        return "";
    }
    const paymentResultForm = await uFetch(SPORTS_MAKE_PAYMENT_LATER_URL, {
        book_ids: payId,
        xm: receiptTitle ?? "清华大学",
    }, 60000, "GBK").then((s) => cheerio.load(s)("form"));
    const paymentApiHtml = await uFetch(
        paymentResultForm.attr()!.action,
        paymentResultForm.serialize() as never as object,
        60000,
        "UTF-8",
        true,
    );
    const searchResult = /var id = '(.*)?';\s*?var token = '(.*)?';/.exec(paymentApiHtml);
    if (searchResult === null) {
        throw new SportsError("id and token not found.");
    }
    const paymentCheckResult = await uFetch(SPORTS_PAYMENT_CHECK_URL, {
        id: searchResult[1],
        token: searchResult[2],
    }).then(JSON.parse);
    if (paymentCheckResult.code !== "0") {
        throw new SportsError("Payment check failed: " + paymentCheckResult.message);
    }
    const inputs = cheerio.load(paymentApiHtml)("#payForm input");
    const postForm: { [key: string]: string } = {};
    inputs.each((_, element) => {
        const {attribs} = element as TagElement;
        postForm[attribs.name] = attribs.value;
    });
    postForm.channelId = "0101";
    return await generalGetPayCode(await uFetch(SPORTS_PAYMENT_ACTION_URL, postForm));
};

export const unsubscribeSportsReservation = async (
    helper: InfoHelper,
    bookId: string,
) => roamingWrapperWithMocks(
    helper,
    "default",
    "5539ECF8CD815C7D3F5A8EE0A2D72441",
    async () => {
        await uFetch(SPORTS_UNSUBSCRIBE_URL, {bookId});
    },
    undefined,
);

export const sportsIdInfoList: SportsIdInfo[] = [
    {
        name: "气膜馆羽毛球场",
        gymId: "3998000",
        itemId: "4045681",
    },
    {
        name: "气膜馆乒乓球场",
        gymId: "3998000",
        itemId: "4037036",
    },
    {
        name: "综体篮球场",
        gymId: "4797914",
        itemId: "4797898",
    },
    {
        name: "综体羽毛球场",
        gymId: "4797914",
        itemId: "4797899",
    },
    {
        name: "西体羽毛球场",
        gymId: "4836273",
        itemId: "4836196",
    },
    {
        name: "西体台球",
        gymId: "4836273",
        itemId: "14567218",
    },
    {
        name: "紫荆网球场",
        gymId: "5843934",
        itemId: "5845263",
    },
    {
        name: "西网球场",
        gymId: "5843934",
        itemId: "10120539",
    },
];
