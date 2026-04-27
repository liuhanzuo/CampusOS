import {roamingWrapperWithMocks} from "./core";
import {InfoHelper} from "../index";
import {uFetch} from "../utils/network";
import fetch from "cross-fetch";
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
const SPORTS_FRONTEND_API_BASE = `${SPORTS_DIRECT_BASE}/venue/site/api`;

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

    const headers: Record<string, string> = {
        "Content-Type": "application/json",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    };
    if (jwtToken) {
        headers["token"] = jwtToken;
    }

    const init: any = { method, headers };
    if (method === "POST" && body) {
        init.body = body;
    }

    try {
        const response = await fetch(url, init);
        if (response.status !== 200 && response.status !== 201) {
            const errBody = await response.text().catch(() => "");
            console.error(`[Sports] sportsFetch 错误: HTTP ${response.status}, body=${errBody.substring(0, 200)}`);
            throw new Error(`Unexpected response status code: ${response.status} (${url.split("/").pop()})`);
        }
        const result = await response.text();
        console.log(`[Sports] sportsFetch: 响应长度=${result.length}, 前200字符: ${result.substring(0, 200)}`);
        return result;
    } catch (e: any) {
        console.error(`[Sports] sportsFetch 错误: ${e.message}`);
        throw e;
    }
};

type PlainRecord = Record<string, any>;
type SportsSceneRecord = PlainRecord & {
    sceneName?: string;
    sceneUuid?: string;
    uuid?: string;
    siteType?: string;
    classTypeUuid?: string;
    classTypeEnum?: string;
    siteKindId?: string | number;
};
type SportsAvailabilityStatus = {
    statusCode: "bookable" | "fully_booked" | "not_open" | "unknown";
    statusMessage: string;
};

const asRecord = (value: unknown): PlainRecord | null =>
    value !== null && typeof value === "object" && !Array.isArray(value)
        ? value as PlainRecord
        : null;

const asNumber = (value: unknown): number | undefined => {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && value.trim() !== "") {
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : undefined;
    }
    return undefined;
};

const asBoolean = (value: unknown): boolean | undefined => {
    if (typeof value === "boolean") return value;
    if (typeof value === "number") return value !== 0;
    if (typeof value === "string") {
        const normalized = value.trim().toLowerCase();
        if (["1", "true", "yes", "y"].includes(normalized)) return true;
        if (["0", "false", "no", "n"].includes(normalized)) return false;
    }
    return undefined;
};

const firstString = (record: PlainRecord, keys: string[]): string | undefined => {
    for (const key of keys) {
        const value = record[key];
        if (typeof value === "string" && value.trim() !== "") {
            return value.trim();
        }
    }
    return undefined;
};

const formatTimePart = (value: unknown): string | undefined => {
    if (typeof value !== "string" || value.trim() === "") return undefined;
    const directMatch = value.match(/\b\d{1,2}:\d{2}\b/);
    if (directMatch) return directMatch[0];
    const compactMatch = value.match(/T(\d{2}:\d{2})/);
    if (compactMatch) return compactMatch[1];
    return undefined;
};

const buildTimeSession = (record: PlainRecord): string => {
    const direct = firstString(record, [
        "timeSession",
        "time",
        "period",
        "timePeriod",
        "reserveTime",
    ]);
    if (direct) return direct;

    const start = formatTimePart(record.startTime ?? record.reserveStartDate ?? record.beginTime);
    const end = formatTimePart(record.endTime ?? record.reserveEndDate ?? record.finishTime);
    if (start && end) return `${start}-${end}`;
    return "";
};

const looksLikeResourceRecord = (record: PlainRecord): boolean =>
    Boolean(
        firstString(record, ["siteName", "fieldName", "field", "name", "siteLabel", "siteNo"]) ||
        firstString(record, ["timeSession", "time", "period", "timePeriod"]) ||
        formatTimePart(record.startTime ?? record.reserveStartDate ?? record.beginTime) ||
        record.siteUuid || record.resId || record.id || record.uuid,
    );

const collectResourceRecords = (value: unknown): PlainRecord[] => {
    const queue: unknown[] = [value];
    const visited = new Set<unknown>();
    const results: PlainRecord[] = [];

    while (queue.length > 0) {
        const current = queue.shift();
        if (current === null || current === undefined || visited.has(current)) continue;
        visited.add(current);

        if (Array.isArray(current)) {
            for (const item of current) {
                queue.push(item);
            }
            continue;
        }

        const record = asRecord(current);
        if (!record) continue;

        if (looksLikeResourceRecord(record)) {
            results.push(record);
        }

        for (const nestedValue of Object.values(record)) {
            if (Array.isArray(nestedValue) || asRecord(nestedValue)) {
                queue.push(nestedValue);
            }
        }
    }

    return results;
};

const normalizeResourceRecord = (record: PlainRecord): SportsResource | null => {
    const fieldName = firstString(record, [
        "fieldName",
        "siteName",
        "field",
        "name",
        "siteLabel",
        "siteNo",
    ]) || "";
    const timeSession = buildTimeSession(record);

    if (!fieldName && !timeSession) {
        return null;
    }

    const canNetBook =
        asBoolean(record.canNetBook ?? record.canBook ?? record.available ?? record.bookable) ??
        !(record.bookId || record.reserveId || record.resvId || record.orderId);

    return {
        resId: firstString(record, ["resId", "siteUuid", "id", "uuid"]) || `${fieldName}-${timeSession}`,
        resHash: firstString(record, ["resHash", "hash", "siteUuid", "id", "uuid"]) || `${fieldName}-${timeSession}`,
        bookId: firstString(record, ["bookId", "reserveId", "resvId", "orderId"]),
        timeSession,
        fieldName,
        overlaySize: asNumber(record.overlaySize ?? record.size) || 0,
        canNetBook,
        cost: asNumber(record.cost ?? record.price ?? record.amount ?? record.money),
        locked: asBoolean(record.locked),
        userType: firstString(record, ["userType", "siteType"]),
        paymentStatus: asBoolean(record.paymentStatus ?? record.paid),
    } as SportsResource;
};

const extractResourcesFromApiData = (apiData: PlainRecord): SportsResource[] => {
    const rawRecords = collectResourceRecords(apiData.resources ?? apiData.data ?? apiData);
    const deduped = new Map<string, SportsResource>();

    for (const record of rawRecords) {
        const resource = normalizeResourceRecord(record);
        if (!resource) continue;
        const key = `${resource.resId}|${resource.fieldName}|${resource.timeSession}`;
        if (!deduped.has(key)) {
            deduped.set(key, resource);
        }
    }

    return Array.from(deduped.values());
};

const extractPhone = (apiData: PlainRecord): string =>
    firstString(apiData, ["phone", "mobile", "contactPhone", "cellPhone"]) || "";

const extractCount = (apiData: PlainRecord, resources: SportsResource[]): number =>
    asNumber(apiData.limit?.count ?? apiData.count ?? apiData.totalCount ?? apiData.total) ?? resources.length;

const extractInit = (apiData: PlainRecord, resources: SportsResource[]): number => {
    const explicit = asNumber(apiData.limit?.init ?? apiData.init);
    if (explicit !== undefined) return explicit;
    return resources.some((resource) => resource.canNetBook && !resource.bookId) ? 1 : 0;
};

const normalizeVenueText = (value: string): string =>
    value
        .toLowerCase()
        .replace(/[（）()]/g, "")
        .replace(/\s+/g, "")
        .replace(/场$/g, "")
        .replace(/馆$/g, "");

const getVenueAliases = (gymId: string, itemId: string): string[] => {
    const venue = sportsIdInfoList.find((item) => item.gymId === gymId && item.itemId === itemId);
    const aliases = new Set<string>();
    if (venue?.name) {
        aliases.add(venue.name);
        aliases.add(venue.name.replace(/场$/g, ""));
    }

    if (itemId === "4836196") {
        aliases.add("西体羽毛球");
        aliases.add("西体羽毛球前馆");
        aliases.add("西体羽毛球后馆");
    }
    if (itemId === "4797899") {
        aliases.add("综体羽毛球");
    }
    if (itemId === "4045681") {
        aliases.add("气膜馆羽毛球");
    }
    if (itemId === "4037036") {
        aliases.add("气膜馆乒乓球");
    }
    if (itemId === "4797898") {
        aliases.add("综体篮球");
    }
    if (itemId === "5845263") {
        aliases.add("紫荆网球");
    }
    if (itemId === "10120539") {
        aliases.add("西网球");
    }
    return Array.from(aliases);
};

const sceneMatchesVenue = (scene: SportsSceneRecord, aliases: string[]): boolean => {
    const sceneName = normalizeVenueText(
        firstString(scene, ["sceneName", "name", "siteName", "title"]) || "",
    );
    if (!sceneName) {
        return false;
    }
    return aliases.some((alias) => {
        const normalizedAlias = normalizeVenueText(alias);
        return normalizedAlias !== "" &&
            (sceneName.includes(normalizedAlias) || normalizedAlias.includes(sceneName));
    });
};

const parseSportsApiResponse = (responseText: string, endpointName: string): PlainRecord => {
    const response = JSON.parse(responseText);
    if (!response || typeof response !== "object") {
        throw new Error(`${endpointName} 返回了非对象响应`);
    }
    if (response.code !== 0 || response.success === false || response.data === undefined || response.data === null) {
        throw new Error(`${endpointName} 调用失败: code=${response.code}, message=${response.message || "unknown"}`);
    }
    const data = response.data;
    if (Array.isArray(data)) {
        return {...response, data};
    }
    const record = asRecord(data);
    if (!record) {
        throw new Error(`${endpointName} data 不是对象`);
    }
    return {...response, ...record};
};

const getSportsScenes = async (): Promise<SportsSceneRecord[]> => {
    const responseText = await sportsFetch(`${SPORTS_FRONTEND_API_BASE}/site/scene/list`);
    const apiData = parseSportsApiResponse(responseText, "scene/list");
    const list = Array.isArray(apiData.data) ? apiData.data : Array.isArray(apiData.list) ? apiData.list : [];
    const scenes = list
        .map((item) => asRecord(item))
        .filter((item): item is SportsSceneRecord => Boolean(item));
    console.log(`[Sports] scene/list 返回场景数量: ${scenes.length}`);
    return scenes;
};

const buildScenePagePayloads = (scene: SportsSceneRecord, date: string): PlainRecord[] => {
    const sceneUuid = firstString(scene, ["sceneUuid", "uuid"]);
    if (!sceneUuid) {
        return [];
    }

    const basePayload: PlainRecord = {
        pageSize: 1000,
        pageNum: 1,
        reserveDate: date,
        sceneUuid,
    };
    const withSceneMeta: PlainRecord = {...basePayload};
    const classTypeUuid = firstString(scene, ["classTypeUuid"]);
    const classTypeEnum = firstString(scene, ["classTypeEnum"]);
    const siteType = firstString(scene, ["siteType"]);
    const siteKindId = scene.siteKindId;

    if (classTypeUuid) withSceneMeta.classTypeUuid = classTypeUuid;
    if (classTypeEnum) withSceneMeta.classTypeEnum = classTypeEnum;
    if (siteType) withSceneMeta.siteType = siteType;
    if (siteKindId !== undefined && siteKindId !== null && `${siteKindId}` !== "") {
        withSceneMeta.siteKindId = siteKindId;
    }
    withSceneMeta.searchValue = "";

    return [
        {...withSceneMeta, resvKind: "CURRENT_RESERVE"},
        withSceneMeta,
        {...basePayload, resvKind: "CURRENT_RESERVE"},
        basePayload,
    ];
};

const getCurrentReservePageData = async (scene: SportsSceneRecord, date: string): Promise<PlainRecord> => {
    const payloads = buildScenePagePayloads(scene, date);
    let lastError: any = null;

    for (const payload of payloads) {
        try {
            const responseText = await sportsFetch(
                `${SPORTS_FRONTEND_API_BASE}/reserve/current/page`,
                "POST",
                JSON.stringify(payload),
            );
            const apiData = parseSportsApiResponse(responseText, "reserve/current/page");
            console.log(
                `[Sports] reserve/current/page 成功: scene=${firstString(scene, ["sceneName", "name"]) || payload.sceneUuid}, count=${apiData.count ?? "n/a"}`,
            );
            return apiData;
        } catch (e: any) {
            lastError = e;
            console.log(`[Sports] reserve/current/page payload失败: ${e.message}`);
        }
    }

    throw lastError ?? new Error("reserve/current/page 未返回可用数据");
};

const looksClosedValue = (value: unknown): boolean => {
    if (typeof value === "boolean") return value === false;
    if (typeof value === "number") return value === 0;
    if (typeof value === "string") {
        const normalized = value.trim().toLowerCase();
        return normalized !== "" && [
            "0",
            "false",
            "close",
            "closed",
            "off",
            "disable",
            "disabled",
            "not_open",
            "notopen",
            "未开放",
            "关闭",
            "不可预约",
        ].some((token) => normalized.includes(token));
    }
    return false;
};

const getSportsAvailabilityStatus = (
    scenes: SportsSceneRecord[],
    resources: SportsResource[],
    totalCount: number,
): SportsAvailabilityStatus => {
    const bookableCount = resources.filter((resource) => resource.canNetBook && !resource.bookId).length;
    if (bookableCount > 0) {
        return {
            statusCode: "bookable",
            statusMessage: `当前有 ${bookableCount} 个可预约场地记录。`,
        };
    }

    const anyClosed = scenes.some((scene) =>
        looksClosedValue(scene.openState) ||
        looksClosedValue(scene.reserveStatus) ||
        looksClosedValue(scene.openFlag) ||
        looksClosedValue(scene.status),
    );
    if (anyClosed) {
        return {
            statusCode: "not_open",
            statusMessage: "场馆当前未开放预约，或不在可预约状态。",
        };
    }

    if (totalCount > 0 || resources.length > 0) {
        return {
            statusCode: "fully_booked",
            statusMessage: "场馆已有可识别场地记录，但当前没有可预约时段，可能已被占满。",
        };
    }

    return {
        statusCode: "unknown",
        statusMessage: "接口未返回可预约场地，暂时无法区分是未开放还是已约满。",
    };
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
            const jwtToken = (globalThis as any).__sportsJwtToken;
            if (!jwtToken) {
                console.log(`[Sports] 无 JWT token，跳过新系统API，直接回退旧系统`);
            } else {
                console.log(`[Sports] 使用新系统API查询（直连模式，token=${jwtToken.substring(0, 20)}...）`);

                try {
                    const aliases = getVenueAliases(gymId, itemId);
                    const scenes = await getSportsScenes();
                    const matchedScenes = scenes.filter((scene) => sceneMatchesVenue(scene, aliases));
                    console.log(
                        `[Sports] 匹配到场景: ${matchedScenes.map((scene) => firstString(scene, ["sceneName", "name"]) || firstString(scene, ["sceneUuid", "uuid"]) || "unknown").join(", ")}`,
                    );

                    if (matchedScenes.length === 0) {
                        throw new Error(`未找到与 ${aliases.join("/")} 对应的场景`);
                    }

                    let totalCount = 0;
                    let totalInit = 0;
                    let phone = "";
                    const deduped = new Map<string, SportsResource>();

                    for (const scene of matchedScenes) {
                        const apiData = await getCurrentReservePageData(scene, date);
                        const resources = extractResourcesFromApiData(apiData);
                        totalCount += extractCount(apiData, resources);
                        totalInit += extractInit(apiData, resources);
                        if (!phone) {
                            phone = extractPhone(apiData);
                        }
                        for (const resource of resources) {
                            const key = `${resource.resId}|${resource.fieldName}|${resource.timeSession}`;
                            if (!deduped.has(key)) {
                                deduped.set(key, resource);
                            }
                        }
                    }

                    const data = Array.from(deduped.values());
                    const status = getSportsAvailabilityStatus(matchedScenes, data, totalCount);
                    console.log(`[Sports] 新系统API汇总资源数量: ${data.length}`);
                    return {
                        count: totalCount || data.length,
                        init: totalInit,
                        phone,
                        statusCode: status.statusCode,
                        statusMessage: status.statusMessage,
                        data,
                    } as SportsResourcesInfo;
                } catch (e: any) {
                    console.error(`[Sports] 新系统API查询失败: ${e.message}`);
                    console.log(`[Sports] 回退到旧系统API...`);
                    const limitData = await getSportsResourceLimit(helper, gymId, itemId, date);
                    const resourceData = await getSportsResourceData(helper, gymId, itemId, date);
                    const phoneNumber = await getSportsPhoneNumber();

                    return {
                        count: limitData.count,
                        init: limitData.init,
                        phone: phoneNumber || "",
                        data: resourceData,
                    } as SportsResourcesInfo;
                }
            }
            console.log(`[Sports] 回退到旧系统API...`);
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
