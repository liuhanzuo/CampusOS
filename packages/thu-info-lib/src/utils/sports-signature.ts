import * as crypto from "crypto";

/**
 * 体育场馆新API签名工具
 */

const APP_ID = "1497016617475903488";

/**
 * 生成32位随机字符串（nonce）
 */
export function generateNonce(): string {
    return crypto.randomBytes(16).toString("hex");
}

/**
 * 生成13位时间戳
 */
export function generateTimestamp(): string {
    return Date.now().toString();
}

/**
 * 计算API签名
 * 签名算法：MD5(appId + timeStamp + nonce)
 */
export function calculateSign(appId: string, timeStamp: string, nonce: string): string {
    const text = appId + timeStamp + nonce;
    return crypto.createHash("md5").update(text).digest("hex");
}

/**
 * 生成完整的签名参数
 * @returns { appId, timeStamp, nonce, sign }
 */
export function generateSignatureParams() {
    const appId = APP_ID;
    const timeStamp = generateTimestamp();
    const nonce = generateNonce();
    const sign = calculateSign(appId, timeStamp, nonce);

    return {
        appId,
        timeStamp,
        nonce,
        sign,
    };
}

/**
 * 构建带签名的API URL
 * @param baseUrl API基础URL（如：https://www.sports.tsinghua.edu.cn/venue/site/api/list）
 * @param extraParams 额外的查询参数
 */
export function buildSignedUrl(baseUrl: string, extraParams: Record<string, string> = {}): string {
    const signature = generateSignatureParams();

    // 确保baseUrl没有现有的查询参数
    const url = new URL(baseUrl);
    // 清除现有查询参数
    url.search = "";

    // 添加签名参数和其他参数
    Object.entries({...signature, ...extraParams}).forEach(([key, value]) => {
        url.searchParams.append(key, value);
    });

    return url.toString();
}
