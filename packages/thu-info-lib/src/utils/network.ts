import {CONTENT_TYPE_FORM, CR_TIMETABLE_URL, USER_AGENT} from "../constants/strings";
import iconv from "iconv-lite";
import fetch from "cross-fetch";
import AbortController from "abort-controller";
import { ResponseStatusError } from "./error";

/**
 * WebVPN hash 到原始域名的反向映射
 * 当 WebVPN 隧道失败时，用于通过 lb-auth/lbredirect 自动建立隧道
 */
const WEBVPN_HASH_TO_ORIGIN: { [hash: string]: { scheme: string; host: string; port: string } } = {
    // www.sports.tsinghua.edu.cn:443 - 体育场馆预约系统
    "77726476706e69737468656265737421e7e056d2342067426a1bc7b88b5c2d32e0ef2d0b7581aac05baf": {
        scheme: "https", host: "www.sports.tsinghua.edu.cn", port: "443",
    },
    // 50.tsinghua.edu.cn:80 - 体育场馆预约系统（旧域名）
    "77726476706e69737468656265737421a5a70f8834396657761d88e29d51367b6a00": {
        scheme: "http", host: "50.tsinghua.edu.cn", port: "80",
    },
    // myhome.tsinghua.edu.cn:443 - 宿舍/卫生成绩（HTTPS）
    "77726476706e69737468656265737421fdb94c852f3f6555301c9aa596522b20e7a45e0b22fda391": {
        scheme: "https", host: "myhome.tsinghua.edu.cn", port: "443",
    },
    // myhome.tsinghua.edu.cn:80 - 电费/充值/改密（HTTP）
    "77726476706e69737468656265737421fdee49932a3526446d0187ab9040227bca90a6e14cc9": {
        scheme: "http", host: "myhome.tsinghua.edu.cn", port: "80",
    },
};

/**
 * 将 WebVPN hash URL 转换为 lb-auth/lbredirect URL
 * 例如: https://webvpn.tsinghua.edu.cn/https/HASH/path → https://oauth.tsinghua.edu.cn/lb-auth/lbredirect?scheme=https&host=xxx&port=443&uri=/path
 */
const webvpnUrlToLbAuth = (webvpnUrl: string): string | null => {
    const match = /webvpn\.tsinghua\.edu\.cn\/(https?)\/([\da-f]+)(\/.*)/.exec(webvpnUrl);
    if (!match) return null;
    const hash = match[2];
    const path = match[3];
    const origin = WEBVPN_HASH_TO_ORIGIN[hash];
    if (!origin) return null;
    return `https://oauth.tsinghua.edu.cn/lb-auth/lbredirect?scheme=${origin.scheme}&host=${origin.host}&port=${origin.port}&uri=${path}`;
};

export const cookies: { [key: string]: string } = {};

const isRedirectStatus = (status: number) =>
    status === 301 || status === 302 || status === 303 || status === 307 || status === 308;

/**
 * Clear the cookies.
 */
export const clearCookies = () => {
    Object.keys(cookies).forEach((key) => delete cookies[key]);
};

/**
 * Manually set a cookie.
 */
export const setCookie = (key: string, value: string) => {
    cookies[key] = value;
};

/**
 * 从响应头中提取并保存 cookies
 */
const parseCookiesFromResponse = (response: Response) => {
    response.headers.forEach((value: string, key: string) => {
        if (key === "set-cookie") {
            if (value.includes("Expires")) {
                const segment = value.split(";")[0];
                const [item, val] = segment.split("=");
                cookies[item.trim()] = val.trim();
            } else {
                for (const v of value.split(",")) {
                    const segment = v.split(";")[0];
                    const [item, val] = segment.split("=");
                    if (val) {
                        cookies[item.trim()] = val.trim();
                    }
                }
            }
        }
    });
};

/**
 * 构建包含最新 cookies 的请求头
 */
const buildHeaders = (contentType: string, extra?: Record<string, string>) => {
    const base = {
        "Content-Type": contentType,
        "User-Agent": USER_AGENT,
        ...(extra || {}),
    };
    if (global.FileReader === undefined) {
        return {
            ...base,
            Cookie: Object.keys(cookies).map((key) => `${key}=${cookies[key]}`).join(";"),
        };
    }
    return base;
};

/**
 * An enhanced implementation of `encodeURIComponent`, which supports
 * arbitrary charset.
 */
export const arbitraryEncode = (s: string, encoding = "UTF-8") =>
    encoding === "UTF-8" ? encodeURIComponent(s) : String(s)
        .split("")
        .map((ch) => RegExp(/^[\u4e00-\u9fa5]*$/).test(ch)
            ? iconv.encode(ch, encoding).reduce((a: string, b: number) => a + "%" + b.toString(16), "")
            : ch,
        )
        .join("");

/**
 * Converts form data into url-encoded format (utf-8).
 */
export const stringify = (form: any, paramEncoding = "UTF-8") =>
    Object.keys(form)
        .map((key) => `${arbitraryEncode(key, paramEncoding)}=${arbitraryEncode(form[key], paramEncoding)}`)
        .join("&");

/**
 * Gets the response data from the given `url`.
 *
 * If param `post` is provided, a `POST` request with the given post form will
 * be sent. Otherwise, a `GET` request will be sent.
 *
 * The `timeout` is `60000` by default, in milliseconds.
 *
 * The `paramEncoding` is `UTF-8` by default, used to encode post form params.
 *
 * If `serialized` is `true`, the method will treat `post` as a string that has
 * already been serialized.
 */
export const uFetch = async (
    url: string,
    post?: object,
    timeout = 60000,
    paramEncoding = "UTF-8",
    serialized = false,
    requestContentType = CONTENT_TYPE_FORM,
    extraHeaders?: Record<string, string>,
): Promise<string> => {
    // Prepare request headers
    const defaultHeaders = {
        // Setup content-type and user-agent
        "Content-Type": requestContentType,
        "User-Agent": USER_AGENT,
        ...(extraHeaders || {}),
    };

    const headers = global.FileReader === undefined ? {
        ...defaultHeaders,
        // Cookie should be manually set in Node.js
        Cookie: Object.keys(cookies).map((key) => `${key}=${cookies[key]}`).join(";"),
    } : defaultHeaders;

    // Handle timeout abortion
    const controller = new AbortController();
    const timeoutEvent = setTimeout(() => {
        controller.abort();
    }, timeout);
    const defaultInit = {
        headers: headers,
        signal: controller.signal,
    };

    // Switch method to `POST` if post-body is provided
    const init =
        post === undefined
            ? defaultInit
            : {
                ...defaultInit,
                method: "POST",
                body: serialized ? (post as never as string) : stringify(post, paramEncoding),
            };

    // Perform the network request
    try {
        let response: Response;

        if (global.FileReader === undefined) {
            // Node.js 环境：使用 manual 重定向模式，手动跟随重定向
            // 确保每一步重定向的 set-cookie 都被正确处理
            const manualInit = {
                ...init,
                redirect: "manual" as RequestRedirect,
            };
            // @ts-ignore
            response = await fetch(url, manualInit);
            parseCookiesFromResponse(response);

            // 手动跟随重定向（仅 GET 请求跟随，POST 不跟随）
            let redirectCount = 0;
            let lbAuthAttempted = false; // 防止 lb-auth 重试的无限循环
            while (isRedirectStatus(response.status) && redirectCount < 20) {
                const location = response.headers.get("Location");
                if (!location) break;
                console.log(`[Network] uFetch 重定向 #${redirectCount + 1}: ${response.status} -> ${location.substring(0, 100)}`);
                // 检测 WebVPN 隧道建立失败的重定向
                if (location.includes("wengine-vpn/failed")) {
                    // 尝试通过 lb-auth/lbredirect 自动建立隧道并重试（仅尝试一次）
                    const lbAuthUrl = webvpnUrlToLbAuth(url);
                    if (lbAuthUrl && !lbAuthAttempted) {
                        lbAuthAttempted = true;
                        console.log(`[Network] WebVPN 隧道失败，尝试通过 lb-auth 自动建立隧道: ${url.substring(0, 80)}`);
                        // 通过 lb-auth 重定向来建立隧道
                        const lbInit = {
                            headers: buildHeaders(requestContentType, extraHeaders),
                            signal: controller.signal,
                            redirect: "manual" as RequestRedirect,
                        };
                        // @ts-ignore
                        let lbResponse = await fetch(lbAuthUrl, lbInit);
                        parseCookiesFromResponse(lbResponse);
                        // 跟随 lb-auth 的重定向链
                        let lbRedirectCount = 0;
                        while (isRedirectStatus(lbResponse.status) && lbRedirectCount < 10) {
                            const lbLocation = lbResponse.headers.get("Location");
                            if (!lbLocation) break;
                            console.log(`[Network] lb-auth 重定向 #${lbRedirectCount + 1}: ${lbResponse.status} -> ${lbLocation.substring(0, 100)}`);
                            if (lbLocation.includes("wengine-vpn/failed")) {
                                console.error(`[Network] lb-auth 也失败了，目标URL: ${url.substring(0, 100)}`);
                                throw new ResponseStatusError(`WebVPN tunnel failed for ${url.substring(0, 80)}`);
                            }
                            const lbRedirectInit = {
                                headers: buildHeaders(requestContentType, extraHeaders),
                                signal: controller.signal,
                                redirect: "manual" as RequestRedirect,
                            };
                            // @ts-ignore
                            lbResponse = await fetch(lbLocation, lbRedirectInit);
                            parseCookiesFromResponse(lbResponse);
                            lbRedirectCount++;
                        }
                        console.log(`[Network] lb-auth 隧道建立成功 (status=${lbResponse.status})，重试原始请求...`);
                        // 隧道建立后，重试原始请求
                        const retryInit = {
                            ...init,
                            headers: buildHeaders(requestContentType, extraHeaders),
                            redirect: "manual" as RequestRedirect,
                        };
                        // @ts-ignore
                        response = await fetch(url, retryInit);
                        parseCookiesFromResponse(response);
                        redirectCount = 0;
                        continue; // 继续处理重试后的重定向
                    }
                    console.error(`[Network] WebVPN 隧道失败，目标URL: ${url.substring(0, 100)}`);
                    throw new ResponseStatusError(`WebVPN tunnel failed for ${url.substring(0, 80)}`);
                }
                // 重定向时使用 GET 方法，并携带最新 cookies
                const redirectInit = {
                    headers: buildHeaders(requestContentType, extraHeaders),
                    signal: controller.signal,
                    redirect: "manual" as RequestRedirect,
                };
                // @ts-ignore
                response = await fetch(location, redirectInit);
                parseCookiesFromResponse(response);
                redirectCount++;
            }
            if (redirectCount >= 20) {
                throw new ResponseStatusError("Max redirect times reached.");
            }
        } else {
            // 浏览器/React Native 环境：使用默认的 follow 模式
            // @ts-ignore
            response = await fetch(url, init);
            parseCookiesFromResponse(response);
        }

        if (response.status !== 200 && response.status !== 201) {
            console.error(`[Network] uFetch 非200响应: status=${response.status}, url=${url.substring(0, 100)}`);
            let path = url;
            try {
                const queryBegin = path.lastIndexOf("?");
                if (queryBegin !== -1) {
                    path = path.substring(0, queryBegin);
                }
                if (path.endsWith("/")) {
                    path = path.substring(0, path.length - 1);
                }
                const nameBegin = path.lastIndexOf("/");
                path = path.substring(nameBegin + 1);
            } catch {
                throw new ResponseStatusError(`Unexpected response status code: ${response.status}`);
            }
            throw new ResponseStatusError(`Unexpected response status code: ${response.status} (${path})`);
        }

        // Detect charset based on content-type
        const contentType = response.headers.get("Content-Type");
        let base64 = false;
        let charset = "UTF-8";
        if (contentType) {
            if (contentType.includes("application/octet-stream") || contentType.includes("application/pdf") || contentType.includes("image/")) {
                base64 = true;
                charset = "base64";
            } else {
                const regRes = /charset=(.*?);/.exec(contentType + ";");
                if (regRes !== null && regRes[1] !== undefined) {
                    charset = regRes[1];
                }
            }
        }

        if (url === CR_TIMETABLE_URL) {
            charset = "gb2312";
        }

        if (global.FileReader) {
            // For browser and react-native
            const blob = await response.blob();
            return await new Promise<string>(((resolve, reject) => {
                // Use FileReader to read blob data
                const reader = new FileReader();
                reader.onloadend = () => {
                    if (typeof reader.result === "string") {
                        if (base64) {
                            // Simply return the string data with the MIME header removed
                            const r = /data:.+?;base64,(.+)/g.exec(reader.result);
                            if (r !== null && r[1] !== undefined) {
                                resolve(r[1]);
                            } else {
                                reject(new Error("Failed to parse MIME result in uFetch."));
                            }
                        } else {
                            // The value stored in `reader.result` has already been parsed with the correct encoding
                            resolve(reader.result);
                        }
                    } else if (reader.result === null) {
                        resolve("");
                    } else {
                        // This should not happen
                        reject(new Error("Blob parsing error."));
                    }
                };
                // Read and transform
                if (base64) {
                    reader.readAsDataURL(blob);
                } else {
                    reader.readAsText(blob, charset);
                }
            }));
        } else {
            // For node.js
            const arrayBuffer = await response.arrayBuffer();
            // Use iconv-lite to transform arrayBuffer into string
            return iconv.decode(Buffer.from(arrayBuffer), charset);
        }
    } finally {
        // We have to clear the timeout
        clearTimeout(timeoutEvent);
    }
};

export const getRedirectUrl = async (
    url: string,
    timeout = 60000
): Promise<string> => {
    if (global.FileReader) {
        // For browser and react-native
        return new Promise((resolve) => {
            const req = new XMLHttpRequest();
            req.onreadystatechange = () => {
                if (req.readyState === req.DONE) {
                    resolve(req.responseURL ?? "");
                }
            };
            req.open("GET", url);
            req.send();
        });
    }
    // Handle timeout abortion
    const controller = new AbortController();
    const timeoutEvent = setTimeout(() => {
        controller.abort();
    }, timeout);

    // Perform the network request
    try {
        let location = url;
        for (let i = 0; i < 20; i++) {
            const currentInit: RequestInit = {
                headers: buildHeaders(CONTENT_TYPE_FORM),
                // @ts-ignore
                signal: controller.signal,
                redirect: "manual",
            };

            const response = await fetch(location, currentInit);
            parseCookiesFromResponse(response);

            if (!isRedirectStatus(response.status)) {
                return location;
            }

            location = response.headers.get("Location") ?? "";
        }

        throw new ResponseStatusError("Max redirect times reached.");
    } finally {
        // We have to clear the timeout
        clearTimeout(timeoutEvent);
    }
};
