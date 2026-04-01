import {
    CHECK_CURRENT_DEVICE_URL,
    CR_LOGIN_HOME_URL,
    DELETE_DEVICE_URL,
    DOUBLE_AUTH_URL,
    GET_COOKIE_URL,
    GET_DEVICE_LIST_URL,
    GITLAB_AUTH_URL,
    GITLAB_LOGIN_URL,
    ID_BASE_URL,
    ID_HOST_URL,
    ID_LOGIN_URL,
    ID_WEBSITE_BASE_URL,
    ID_WEBSITE_LOGIN_URL,
    INVOICE_LOGIN_URL,
    LOGIN_URL,
    LOGOUT_URL,
    MADMODEL_AUTH_LOGIN_URL,
    ROAMING_URL,
    SAVE_FINGER_URL,
    USER_DATA_URL,
    WEB_VPN_OAUTH_LOGIN_URL,
} from "../constants/strings";
import * as cheerio from "cheerio";
import {InfoHelper} from "../index";
import {clearCookies, getRedirectUrl, uFetch} from "../utils/network";
import {IdAuthError, LibError, LoginError, UrlError} from "../utils/error";
import {sm2} from "sm-crypto";

let getRedirectLocation: ((url: string) => Promise<string | null | undefined>) | undefined = undefined;
try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-require-imports
    const rtn_network_utils = require("rtn-network-utils").RTNNetworkUtils;
    if (rtn_network_utils) {
        getRedirectLocation = rtn_network_utils.getRedirectLocation;
    }
} catch { /* empty */ }

type RoamingPolicy = "default" | "id" | "id_website" | "card" | "cab" | "gitlab" | "cr";

const HOST_MAP: { [key: string]: string } = {
    "zhjw.cic": "77726476706e69737468656265737421eaff4b8b69336153301c9aa596522b20bc86e6e559a9b290",
    "jxgl.cic": "77726476706e69737468656265737421faef469069336153301c9aa596522b20e33c1eb39606919f",
    "zhjwxk.cic": "77726476706e69737468656265737421faef469069336153301c9aa596522b20e33c1eb39606919f",
    "ecard": "77726476706e69737468656265737421f5f4408e237e7c4377068ea48d546d303341e9882a",
    "learn": "77726476706e69737468656265737421fcf2408e297e7c4377068ea48d546d30ca8cc97bcc",
    "mails": "77726476706e69737468656265737421fdf64890347e7c4377068ea48d546d3011ff591d40",
    "50": "77726476706e69737468656265737421a5a70f8834396657761d88e29d51367b6a00",
    "www.sports": "77726476706e69737468656265737421e7e056d2342067426a1bc7b88b5c2d32e0ef2d0b7581aac05baf",
    "166.111.14.8": "77726476706e69737468656265737421a1a117d27661391e2f5cc7f4",
    "fa-online": "77726476706e69737468656265737421f6f60c93293c615e7b469dbf915b243daf0f96e17deaf447b4",
    "dzpj": "77726476706e69737468656265737421f4ed519669247b59700f81b9991b2631aee63c51",
    "jjhyhdf": "77726476706e69737468656265737421fafd49852f346e1e6a1b80a29f5d36342bb9c40cf69277",
    "yhdf": "77726476706e69737468656265737421e9ff459a69247b59700f81b9991b26317dbd36ae",
    "usereg": "77726476706e69737468656265737421e5e4448e223726446d0187ab9040227b54b6c80fcd73",
    "thos": "77726476706e69737468656265737421e4ff4e8f69247b59700f81b9991b2631ca359dd4",
    "zzjl.graduate": "77726476706e69737468656265737421eaed4b9069377a517a1d88b89d1b37269c624d2b1c6925f37faea82b8d",
    "madmodel.cs": "77726476706e69737468656265737421fdf6459128346d5c300b9ae28c462a3b27469fc32211fa26a3e464",
};

const SM2_MAGIC_NUMBER = "04";

const getWebVPNUrl = (urlIn: string): string => {
    if (urlIn.search("oauth.tsinghua.edu.cn") !== -1) {
        return urlIn;
    }

    const url = new URL(urlIn);
    const scheme = url.protocol.replace(":", "");
    const host = url.hostname;
    const port = url.port || (scheme == "https" ? "443" : "80");
    const uri = url.pathname + (url.search ? url.search : "") + (url.hash ? url.hash : "");
    return `https://oauth.tsinghua.edu.cn/lb-auth/lbredirect?scheme=${scheme}&host=${host}&port=${port}&uri=${uri}`;
};

const parseUrl = (urlIn: string) => {
    const rawRes = /http:\/\/(\d+.\d+.\d+.\d+):(\d+)\/(.+)/g.exec(urlIn);
    if (rawRes !== null && rawRes[1] !== undefined && rawRes[2] !== undefined && rawRes[3] !== undefined) {
        const hostHash = HOST_MAP[rawRes[1]];
        if (hostHash === undefined) {
            console.log(`[Core] parseUrl: IP ${rawRes[1]} 不在 HOST_MAP 中，使用 getWebVPNUrl 动态生成`);
            return getWebVPNUrl(urlIn);
        }
        return `https://webvpn.tsinghua.edu.cn/http-${rawRes[2]}/${hostHash}/${rawRes[3]}`;
    }
    const protocol = urlIn.substring(0, urlIn.indexOf(":"));
    const regRes = /:\/\/(.+?).tsinghua.edu.cn(:(\d+))?\/(.+)/.exec(urlIn);
    if (regRes === null || regRes[1] === undefined || regRes[4] === undefined) {
        throw new UrlError();
    }
    const host = regRes[1];
    const hostHash = HOST_MAP[host];
    if (hostHash === undefined) {
        console.log(`[Core] parseUrl: host "${host}" 不在 HOST_MAP 中，使用 getWebVPNUrl 动态生成`);
        return getWebVPNUrl(urlIn);
    }
    const protocolFull = regRes[3] === undefined ? protocol : `${protocol}-${regRes[3]}`;
    const path = regRes[4];
    return `https://webvpn.tsinghua.edu.cn/${protocolFull}/${hostHash}/${path}`;
};

export const getCsrfToken = async () => {
    console.log(`[Core] getCsrfToken: 开始获取 CSRF token...`);
    const cookie = await uFetch(GET_COOKIE_URL);
    console.log(`[Core] getCsrfToken: cookie响应长度=${cookie.length}, 内容前100字符: ${cookie.substring(0, 100)}`);
    const q = /XSRF-TOKEN=(.+?);/.exec(cookie + ";");
    if (q === null || q[1] === undefined) {
        console.error(`[Core] getCsrfToken: 未找到 XSRF-TOKEN，cookie内容: ${cookie.substring(0, 200)}`);
        throw new Error("Failed to get csrf token.");
    }
    console.log(`[Core] getCsrfToken: 成功获取 token=${q[1].substring(0, 10)}...`);
    return q[1];
};

let outstandingLoginPromise: Promise<void> | undefined = undefined;

const twoFactorAuth = async (helper: InfoHelper): Promise<string> => {
    const { result: r1, msg: m1, object: o1 } = JSON.parse(await uFetch(DOUBLE_AUTH_URL, {
        action: "FIND_APPROACHES",
    }));
    if (r1 != "success") {
        throw new LoginError(m1);
    }
    if (!helper.twoFactorMethodHook) {
        throw new LoginError("Required to select 2FA method");
    }
    const method = await helper.twoFactorMethodHook(o1.hasWeChatBool, o1.phone, o1.hasTotp);
    if (method === undefined) {
        throw new LoginError("2FA required");
    }
    const { result: r2, msg: m2 } = JSON.parse(await uFetch(DOUBLE_AUTH_URL, {
        action: "SEND_CODE",
        type: method,
    }));
    if (r2 != "success") {
        throw new LoginError(m2);
    }
    if (!helper.twoFactorAuthHook) {
        throw new LoginError("2FA required");
    }
    const code = await helper.twoFactorAuthHook();
    if (code === undefined) {
        throw new LoginError("2FA required");
    }
    const { result: r3, msg: m3, object: o3 } = JSON.parse(await uFetch(DOUBLE_AUTH_URL, {
        action: method === "totp" ? "VERITY_TOTP_CODE" : "VERITY_CODE",
        vericode: code,
    }));
    if (r3 != "success") {
        throw new LoginError(m3);
    }
    if (helper.trustFingerprintHook) {
        const trustFingerprint = await helper.trustFingerprintHook();
        if (trustFingerprint) {
            const { result: r4, msg: m4 } = JSON.parse(await uFetch(SAVE_FINGER_URL, {
                fingerprint: helper.fingerprint,
                deviceName: await helper.trustFingerprintNameHook(),
                radioVal: "是",
            }));
            if (r4 != "success") {
                if (m4.includes("上限") || m4.includes("limit")) {
                    helper.twoFactorAuthLimitHook && await helper.twoFactorAuthLimitHook();
                }
                else {
                    throw new LoginError(m4);
                }
            }
        }
    }
    return await uFetch(ID_HOST_URL + o3.redirectUrl);
};

export const login = async (
    helper: InfoHelper,
    userId: string,
    password: string,
): Promise<void> => {
    helper.userId = userId;
    helper.password = password;
    if (helper.userId === "" || helper.password === "") {
        const e = new LoginError("Please login.");
        helper.loginErrorHook && helper.loginErrorHook(e);
        throw e;
    }
    if (!helper.userId.match(/^\d+$/)) {
        const e = new LoginError("请输入学号。");
        helper.loginErrorHook && helper.loginErrorHook(e);
        throw e;
    }
    if (!helper.mocked()) {
        clearCookies();
        await helper.clearCookieHandler();
        if (outstandingLoginPromise === undefined) {
            outstandingLoginPromise = new Promise<void>((resolve, reject) => {
                setTimeout(() => {
                    reject(new LoginError("Login timeout."));
                }, 3 * 60 * 1000);
                (async () => {
                    await uFetch(WEB_VPN_OAUTH_LOGIN_URL);
                    let sm2PublicKey = "";
                    if (getRedirectLocation) {
                        // Patch for OpenHarmony
                        const oauthUrl = await getRedirectLocation(WEB_VPN_OAUTH_LOGIN_URL);
                        if (!oauthUrl) {
                            throw new LoginError("Failed to get oauth url.");
                        }
                        await uFetch(oauthUrl);
                        const idUrl = await getRedirectLocation(oauthUrl);
                        if (!idUrl) {
                            throw new LoginError("Failed to get id url.");
                        }
                        sm2PublicKey = cheerio.load(await uFetch(idUrl))("#sm2publicKey").text();
                    } else {
                        sm2PublicKey = cheerio.load(await uFetch(WEB_VPN_OAUTH_LOGIN_URL))("#sm2publicKey").text();
                    }
                    if (sm2PublicKey === "") {
                        throw new LoginError("Failed to get public key.");
                    }
                    let response = await uFetch(ID_LOGIN_URL, {
                        i_user: helper.userId,
                        i_pass: SM2_MAGIC_NUMBER + sm2.doEncrypt(helper.password, sm2PublicKey),
                        fingerPrint: helper.fingerprint,
                        fingerGenPrint: "",
                        i_captcha: "",
                    });
                    if (response.includes("二次认证")) {
                        response = await twoFactorAuth(helper);
                    }
                    if (!response.includes("登录成功。正在重定向到")) {
                        const $ = cheerio.load(response);
                        const message = $("#msg_note").text().trim();
                        throw new LoginError(message);
                    }
                    const callbackUrl = cheerio.load(response)("a").attr()!.href;
                    const redirectUrl = await (getRedirectLocation ?? getRedirectUrl)(callbackUrl);
                    if (redirectUrl === LOGIN_URL || redirectUrl == null) {
                        throw new LoginError("登录失败，请稍后重试。");
                    }
                    if (getRedirectLocation) {
                        await uFetch(redirectUrl);
                    }
                    await roam(helper, "id", "10000ea055dd8d81d09d5a1ba55d39ad");
                    outstandingLoginPromise = undefined;
                })().then(resolve, (e: any) => {
                    helper.loginErrorHook && helper.loginErrorHook(e);
                    outstandingLoginPromise = undefined;
                    reject(e);
                });
            });
        }
        await outstandingLoginPromise;
    }
};

export const logout = async (helper: InfoHelper): Promise<void> => {
    if (!helper.mocked()) {
        helper.userId = "";
        helper.password = "";
        await uFetch(LOGOUT_URL);
    } else {
        helper.userId = "";
        helper.password = "";
    }
};

export const roam = async (helper: InfoHelper, policy: RoamingPolicy, payload: string): Promise<string> => {
    switch (policy) {
    case "default": {
        const csrf = await getCsrfToken();
        const {object} = await uFetch(`${ROAMING_URL}?yyfwid=${payload}&_csrf=${csrf}&machine=p`).then(JSON.parse);
        const rawRoamingUrl = object.roamingurl.replace(/&amp;/g, "&");
        console.log(`[Core] roam default: roamingurl完整=${rawRoamingUrl}`);
        const url = parseUrl(rawRoamingUrl);
        console.log(`[Core] roam default: 解析后url完整=${url}`);
        if (url.includes(HOST_MAP["dzpj"])) {
            const roamHtml = await uFetch(url);
            const ticket = /\("ticket"\).value = '(.+?)';/.exec(roamHtml);
            if (ticket === null || ticket[1] === undefined) {
                throw new LibError("Failed to get ticket when roaming to fa-online");
            }
            return await uFetch(INVOICE_LOGIN_URL, {ticket: ticket[1]});
        }
        if (url.includes(HOST_MAP["madmodel.cs"])) {
            const ticket = /ticket=(.+)/.exec(url);
            if (ticket === null || ticket[1] === undefined) {
                throw new LibError("Failed to get ticket of madmodel.cs");
            }
            await uFetch(url);
            return await uFetch(`${MADMODEL_AUTH_LOGIN_URL}/check?ticket=${ticket[1]}`);
        }
        // www.sports 新系统：使用 CAS + JWT token 认证（直连，不通过 WebVPN）
        if (url.includes(HOST_MAP["www.sports"])) {
            const SPORTS_DIRECT_BASE = "https://www.sports.tsinghua.edu.cn";
            console.log(`[Core] roam: www.sports 新系统CAS登录流程开始（直连模式）`);

            try {
                // 第一步：调用 /venue/site/cas/address 获取 CAS 登录 URL
                const loginHtmlUrl = `${SPORTS_DIRECT_BASE}/venue/login.html`;
                const casAddressUrl = `${SPORTS_DIRECT_BASE}/venue/site/cas/address?redirectUrl=${encodeURIComponent(loginHtmlUrl)}&queryParam=${encodeURIComponent(loginHtmlUrl)}&typeCode=16384&extInfo=`;
                console.log(`[Core] roam: 第一步 - 获取CAS地址（直连）...`);
                const casAddressResult = await uFetch(casAddressUrl);
                console.log(`[Core] roam: cas/address响应: ${casAddressResult.substring(0, 300)}`);
                const casAddressParsed = JSON.parse(casAddressResult);
                if (casAddressParsed.code !== 0 || !casAddressParsed.data) {
                    console.error(`[Core] roam: cas/address返回错误`);
                    return await uFetch(url);
                }

                // 第二步：获取 toLoginPage 的重定向目标（id.tsinghua.edu.cn 的登录 URL）
                const casLoginUrl = casAddressParsed.data;
                console.log(`[Core] roam: 第二步 - 获取CAS重定向目标...`);
                const idLoginPageUrl = await getRedirectUrl(casLoginUrl);
                console.log(`[Core] roam: CAS重定向到: ${idLoginPageUrl.substring(0, 120)}`);

                // 第三步：在 id.tsinghua.edu.cn 上用用户名密码登录
                // idLoginPageUrl 类似: https://id.tsinghua.edu.cn/do/off/ui/auth/login/form/{hash}/0?/site/authcenter/doAuth/{session_hash}
                console.log(`[Core] roam: 第三步 - 在id.tsinghua.edu.cn上登录...`);
                const idLoginPageHtml = await uFetch(idLoginPageUrl);
                const sm2PublicKey = cheerio.load(idLoginPageHtml)("#sm2publicKey").text();
                if (sm2PublicKey === "") {
                    console.error(`[Core] roam: 无法获取SM2公钥`);
                    return await uFetch(url);
                }
                let loginResponse = await uFetch(ID_LOGIN_URL, {
                    i_user: helper.userId,
                    i_pass: SM2_MAGIC_NUMBER + sm2.doEncrypt(helper.password, sm2PublicKey),
                    fingerPrint: helper.fingerprint,
                    fingerGenPrint: "",
                    i_captcha: "",
                });
                if (loginResponse.includes("二次认证")) {
                    loginResponse = await twoFactorAuth(helper);
                }
                if (!loginResponse.includes("登录成功。正在重定向到")) {
                    console.error(`[Core] roam: id.tsinghua.edu.cn登录失败`);
                    console.log(`[Core] roam: 登录响应(前500): ${loginResponse.substring(0, 500).replace(/\n/g, ' ')}`);
                    return await uFetch(url);
                }
                console.log(`[Core] roam: id.tsinghua.edu.cn登录成功!`);

                // 第四步：跟随回调重定向到 doAuth，获取 uniToken
                // 登录成功后的回调 URL 会重定向到 www.sports.tsinghua.edu.cn/venue/site/authcenter/doAuth/{hash}?ticket=xxx
                // doAuth 会再重定向到 login.html?uniToken=xxx
                const callbackUrl = cheerio.load(loginResponse)("a").attr()!.href;
                console.log(`[Core] roam: 第四步 - 跟随回调: ${callbackUrl.substring(0, 120)}`);
                const finalUrl = await getRedirectUrl(callbackUrl);
                console.log(`[Core] roam: 最终重定向到: ${finalUrl.substring(0, 200)}`);

                // 从最终 URL 中提取 uniToken
                const uniTokenMatch = /uniToken=([^&"'<>\s]+)/.exec(finalUrl);
                if (uniTokenMatch && uniTokenMatch[1]) {
                    const uniToken = uniTokenMatch[1];
                    console.log(`[Core] roam: 获取到uniToken: ${uniToken.substring(0, 20)}...`);

                    // 第五步：用 uniToken 换取 JWT token（直连）
                    const casTokenUrl = `${SPORTS_DIRECT_BASE}/venue/site/cas/token`;
                    const tokenBody = JSON.stringify({platForm: "CAS", client: "PC", token: uniToken, extInfo: ""});
                    console.log(`[Core] roam: 第五步 - 换取JWT token（直连）...`);
                    const tokenResult = await uFetch(casTokenUrl, tokenBody as any, 60000, "UTF-8", true, "application/json");
                    console.log(`[Core] roam: cas/token响应: ${tokenResult.substring(0, 300)}`);
                    const tokenParsed = JSON.parse(tokenResult);
                    if (tokenParsed.code === 0 && tokenParsed.data?.token) {
                        const jwtToken = tokenParsed.data.token;
                        console.log(`[Core] roam: JWT token获取成功! token=${jwtToken.substring(0, 30)}...`);
                        // 存储 JWT token 到全局，供后续 API 调用使用
                        (globalThis as any).__sportsJwtToken = jwtToken;
                        if (tokenParsed.data.refreshToken) {
                            (globalThis as any).__sportsRefreshToken = tokenParsed.data.refreshToken;
                        }
                        return tokenResult;
                    } else {
                        console.error(`[Core] roam: JWT token获取失败: ${tokenResult}`);
                    }
                } else {
                    // 可能 doAuth 直接返回了 HTML 而不是重定向
                    console.log(`[Core] roam: 未在URL中找到uniToken，尝试从最终页面提取...`);
                    const finalHtml = await uFetch(finalUrl);
                    const htmlTokenMatch = /uniToken=([^&"'<>\s]+)/.exec(finalHtml);
                    if (htmlTokenMatch && htmlTokenMatch[1]) {
                        const uniToken = htmlTokenMatch[1];
                        console.log(`[Core] roam: 从HTML中获取到uniToken: ${uniToken.substring(0, 20)}...`);
                        const casTokenUrl = `${SPORTS_DIRECT_BASE}/venue/site/cas/token`;
                        const tokenBody = JSON.stringify({platForm: "CAS", client: "PC", token: uniToken, extInfo: ""});
                        const tokenResult = await uFetch(casTokenUrl, tokenBody as any, 60000, "UTF-8", true, "application/json");
                        console.log(`[Core] roam: cas/token响应: ${tokenResult.substring(0, 300)}`);
                        const tokenParsed = JSON.parse(tokenResult);
                        if (tokenParsed.code === 0 && tokenParsed.data?.token) {
                            (globalThis as any).__sportsJwtToken = tokenParsed.data.token;
                            if (tokenParsed.data.refreshToken) {
                                (globalThis as any).__sportsRefreshToken = tokenParsed.data.refreshToken;
                            }
                            console.log(`[Core] roam: JWT token获取成功!`);
                            return tokenResult;
                        }
                    }
                    console.log(`[Core] roam: 最终URL: ${finalUrl}`);
                }
            } catch (e: any) {
                console.error(`[Core] roam: www.sports CAS登录流程失败: ${e.message}`);
                console.error(`[Core] roam: stack: ${e.stack?.substring(0, 300)}`);
            }

            // 回退：尝试旧方式
            return await uFetch(url);
        }
        return await uFetch(url);
    }
    case "card":
    case "cab":
    case "cr":
    case "id_website":
    case "id": {
        const idBaseUrl = policy === "card" ? ID_BASE_URL : policy === "id_website" ? ID_WEBSITE_BASE_URL : ID_BASE_URL;
        const idLoginUrl = policy === "card" ? ID_LOGIN_URL : policy === "id_website" ? ID_WEBSITE_LOGIN_URL : ID_LOGIN_URL;
        let response = "";
        const target = policy === "id_website" ? "账号设置" : "登录成功。正在重定向到";
        for (let i = 0; i < 2; i++) {
            const sm2PublicKey = cheerio.load(await uFetch(policy === "cr" ? CR_LOGIN_HOME_URL : (idBaseUrl + payload)))("#sm2publicKey").text();
            if (sm2PublicKey === "") {
                throw new LoginError("Failed to get public key.");
            }
            if (policy === "id_website") {
                response = await uFetch(idLoginUrl, {
                    username: helper.userId,
                    password:  SM2_MAGIC_NUMBER + sm2.doEncrypt(helper.password, sm2PublicKey),
                    fingerPrint: helper.fingerprint,
                    fingerGenPrint: "",
                    i_captcha: "",
                });
            } else {
                response = await uFetch(idLoginUrl, {
                    i_user: helper.userId,
                    i_pass:  SM2_MAGIC_NUMBER + sm2.doEncrypt(helper.password, sm2PublicKey),
                    fingerPrint: helper.fingerprint,
                    fingerGenPrint: "",
                    i_captcha: "",
                });
            }
            if (response.includes("二次认证")) {
                response = await twoFactorAuth(helper);
            }
            if (response.includes(target)) {
                break;
            }
        }
        if (!response.includes(target)) {
            throw new IdAuthError();
        }
        if (policy === "id_website") {
            return response;
        }
        let redirectUrl = cheerio.load(response)("a").attr()!.href;
        if (policy !== "card") {
            redirectUrl = getWebVPNUrl(redirectUrl);
            if (getRedirectLocation) {
                // Patch for OpenHarmony
                const idUrl = await getRedirectLocation(redirectUrl);
                if (!idUrl) {
                    throw new LoginError("Failed to get id url.");
                }
                redirectUrl = idUrl;
            }
        }
        return await uFetch(redirectUrl);
    }
    case "gitlab": {
        const data = await uFetch(GITLAB_LOGIN_URL);
        if (data.includes("sign_out")) return data;
        const authenticity_token = cheerio.load(data)("[name=authenticity_token]").attr()!.value;
        const sm2PublicKey = cheerio.load(await uFetch(GITLAB_AUTH_URL, {authenticity_token}))("#sm2publicKey").text();
        if (sm2PublicKey === "") {
            throw new LoginError("Failed to get public key.");
        }
        let response = await uFetch(ID_LOGIN_URL, {
            i_user: helper.userId,
            i_pass: SM2_MAGIC_NUMBER + sm2.doEncrypt(helper.password, sm2PublicKey),
            fingerPrint: helper.fingerprint,
            fingerGenPrint: "",
            i_captcha: "",
        });
        if (response.includes("二次认证")) {
            response = await twoFactorAuth(helper);
        }
        if (!response.includes("登录成功。正在重定向到")) {
            throw new IdAuthError();
        }
        const redirectUrl = cheerio.load(response)("a").attr()!.href;
        return await uFetch(redirectUrl);
    }
    }
};

export const verifyAndReLogin = async (helper: InfoHelper): Promise<boolean> => {
    console.log(`[Core] verifyAndReLogin: 开始验证登录状态...`);
    if (outstandingLoginPromise) {
        console.log(`[Core] verifyAndReLogin: 有正在进行的登录，等待完成...`);
        await outstandingLoginPromise;
        return true;
    }
    try {
        const csrf = await getCsrfToken();
        const {object} = await uFetch(`${USER_DATA_URL}?_csrf=${csrf}`).then(JSON.parse);
        console.log(`[Core] verifyAndReLogin: 当前用户=${object.ryh}, 期望用户=${helper.userId}`);
        if (object.ryh === helper.userId) {
            return false;
        }
    } catch (e: any) {
        console.error(`[Core] verifyAndReLogin: 验证失败: ${e.message}`);
    }
    console.log(`[Core] verifyAndReLogin: 需要重新登录...`);
    const {userId, password} = helper;
    await login(helper, userId, password);
    return true;
};

export const roamingWrapper = async <R>(
    helper: InfoHelper,
    policy: RoamingPolicy | undefined,
    payload: string,
    operation: (param?: string) => Promise<R>,
): Promise<R> => {
    if (helper.userId === "" || helper.password === "") {
        const e = new LoginError("Please login.");
        helper.loginErrorHook && helper.loginErrorHook(e);
        throw e;
    }
    try {
        if (policy) {
            try {
                console.log(`[Core] roamingWrapper: 第一次尝试直接执行 operation (policy=${policy})`);
                return await operation();
            } catch (e1: any) {
                console.log(`[Core] roamingWrapper: 第一次 operation 失败: ${e1.message}, 尝试 roam...`);
                let result: string;
                try {
                    result = await roam(helper, policy, payload);
                } catch (e2: any) {
                    console.log(`[Core] roamingWrapper: 第一次 roam 失败: ${e2.message}, 重试 roam...`);
                    result = await roam(helper, policy, payload);
                }
                console.log(`[Core] roamingWrapper: roam 成功，重新执行 operation...`);
                return await operation(result);
            }
        } else {
            return await operation();
        }
    } catch (e: any) {
        console.log(`[Core] roamingWrapper: 外层 catch 捕获错误: ${e.message}, 尝试 verifyAndReLogin...`);
        const reLoggedIn = await verifyAndReLogin(helper);
        if (reLoggedIn) {
            console.log(`[Core] roamingWrapper: 重新登录成功，再次尝试 operation...`);
            if (policy) {
                const result = await roam(helper, policy, payload);
                return await operation(result);
            } else {
                return await operation();
            }
        } else {
            // 用户身份验证正确但操作仍然失败（可能是WebVPN隧道过期）
            // 强制重新登录以重建WebVPN session
            console.log(`[Core] roamingWrapper: 用户已登录但操作失败，强制重新登录以重建WebVPN隧道...`);
            try {
                const {userId, password} = helper;
                await login(helper, userId, password);
                if (policy) {
                    const result = await roam(helper, policy, payload);
                    return await operation(result);
                } else {
                    return await operation();
                }
            } catch (loginErr: any) {
                console.error(`[Core] roamingWrapper: 强制重新登录失败: ${loginErr.message}`);
                throw e; // 抛出原始错误
            }
        }
    }
};

export const roamingWrapperWithMocks = async <R>(
    helper: InfoHelper,
    policy: RoamingPolicy | undefined,
    payload: string,
    operation: (param?: string) => Promise<R>,
    fallback: R,
): Promise<R> =>
    helper.mocked()
        ? Promise.resolve(fallback)
        : roamingWrapper(helper, policy, payload, operation);

export const forgetDevice = async (helper: InfoHelper): Promise<void> => {
    await roam(helper, "id_website", "");
    for (let i = 0; i < 10; i++) {
        const {result: r1, msg: m1, object: o1} = JSON.parse(await uFetch(CHECK_CURRENT_DEVICE_URL.replace("{fingerprint}", helper.fingerprint), {}));
        if (r1 != "success") {
            throw new LibError(m1);
        }
        if (o1 === false) {
            break;
        }
        const {result: r2, msg: m2, object: o2} = JSON.parse(await uFetch(GET_DEVICE_LIST_URL, {}));
        if (r2 != "success") {
            throw new LibError(m2);
        }
        const ourDeviceList = o2.filter(({name}: any) => name.startsWith("THU Info APP"));
        if (ourDeviceList.length > 0) {
            const {result: r3, msg: m3} = JSON.parse(await uFetch(DELETE_DEVICE_URL, {uuid: ourDeviceList[ourDeviceList.length - 1].id}));
            if (r3 != "success") {
                throw new LibError(m3);
            }
        } else {
            throw new LibError("No matching device.");
        }
    }
};
