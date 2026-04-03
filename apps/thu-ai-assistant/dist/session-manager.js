"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.sessionManager = void 0;
/**
 * 会话管理器 - 管理已登录的 InfoHelper 实例
 * 确保登录一次后，后续所有操作复用同一个会话，无需重新验证
 */
const lib_1 = require("@thu-info/lib");
const crypto_1 = __importDefault(require("crypto"));
class SessionManager {
    constructor() {
        this.sessions = new Map();
        // 会话超时时间：2小时
        this.SESSION_TIMEOUT = 2 * 60 * 60 * 1000;
    }
    /**
     * 创建新的 InfoHelper 实例并配置 2FA hooks
     */
    createHelper(sessionId) {
        const helper = new lib_1.InfoHelper();
        // 配置 2FA 方法选择 hook
        helper.twoFactorMethodHook = async (hasWeChatBool, phone, hasTotp) => {
            const session = this.sessions.get(sessionId);
            if (!session)
                throw new Error("会话不存在");
            console.log(`[2FA] 需要二次验证 - 微信:${hasWeChatBool}, 手机:${phone}, TOTP:${hasTotp}`);
            // 设置待处理的 2FA 状态
            session.pendingTwoFactor = {
                type: "method_selection",
                hasWeChatBool,
                phone,
                hasTotp,
            };
            // 等待前端选择验证方式
            return new Promise((resolve) => {
                session.twoFactorMethodResolver = resolve;
            });
        };
        // 配置 2FA 验证码输入 hook
        helper.twoFactorAuthHook = async () => {
            const session = this.sessions.get(sessionId);
            if (!session)
                throw new Error("会话不存在");
            console.log("[2FA] 等待用户输入验证码...");
            session.pendingTwoFactor = {
                type: "code_input",
            };
            return new Promise((resolve) => {
                session.twoFactorCodeResolver = resolve;
            });
        };
        // 配置信任设备 hook - 自动信任设备
        // 使用固定 fingerprint + 自动信任，确保后续 roaming 不再触发 2FA
        helper.trustFingerprintHook = async () => {
            console.log("[2FA] 自动信任设备（使用固定指纹，避免后续重复2FA）");
            return true;
        };
        helper.trustFingerprintNameHook = async () => "THU AI Assistant";
        // 2FA 超限 hook - 设备数量达上限时不报错，静默跳过
        helper.twoFactorAuthLimitHook = async () => {
            console.log("[2FA] 设备数量已达上限，跳过信任设备（已有信任设备，不影响使用）");
        };
        // 登录错误 hook
        helper.loginErrorHook = (e) => {
            console.error("[Login] 登录错误:", e.message);
            const session = this.sessions.get(sessionId);
            if (session) {
                session.loginError = e.message;
            }
        };
        return helper;
    }
    /**
     * 开始登录流程（异步，不等待完成）
     * 返回一个 Promise，登录完成后 resolve
     */
    /**
     * 基于 userId 生成固定的设备指纹
     * 这样信任设备后，后续登录/roaming 都能复用信任状态，避免重复 2FA
     */
    generateFingerprint(userId) {
        return "thu-ai-" + crypto_1.default.createHash("md5").update(`thu-ai-assistant-${userId}`).digest("hex").substring(0, 16);
    }
    startLogin(sessionId, userId, password) {
        const helper = this.createHelper(sessionId);
        // 使用基于 userId 的固定 fingerprint，确保信任设备后不再触发 2FA
        helper.fingerprint = this.generateFingerprint(userId);
        console.log(`[Login] 使用固定设备指纹: ${helper.fingerprint}`);
        const session = {
            helper,
            userId,
            loginTime: Date.now(),
            lastActive: Date.now(),
            loginCompleted: false,
        };
        this.sessions.set(sessionId, session);
        console.log(`[Login] 开始登录 userId=${userId}, sessionId=${sessionId}`);
        // 返回登录 Promise，但在内部处理完成/失败状态
        const loginPromise = helper.login({ userId, password }).then(() => {
            session.loginCompleted = true;
            session.pendingTwoFactor = undefined;
            console.log(`[Login] 登录成功! userId=${userId}`);
        }).catch((e) => {
            console.error(`[Login] 登录失败: ${e.message}`);
            session.loginError = e.message;
            // 不删除 session，让前端能获取到错误信息
            throw e;
        });
        return loginPromise;
    }
    /**
     * 获取 2FA 状态
     */
    getTwoFactorStatus(sessionId) {
        const session = this.sessions.get(sessionId);
        if (!session)
            return null;
        return session.pendingTwoFactor || null;
    }
    /**
     * 获取登录错误信息
     */
    getLoginError(sessionId) {
        const session = this.sessions.get(sessionId);
        return session?.loginError || null;
    }
    /**
     * 提交 2FA 方法选择
     */
    submitTwoFactorMethod(sessionId, method) {
        const session = this.sessions.get(sessionId);
        if (!session || !session.twoFactorMethodResolver) {
            console.log(`[2FA] submitTwoFactorMethod 失败: session=${!!session}, resolver=${!!session?.twoFactorMethodResolver}`);
            return false;
        }
        console.log(`[2FA] 用户选择验证方式: ${method}`);
        session.twoFactorMethodResolver(method);
        session.twoFactorMethodResolver = undefined;
        return true;
    }
    /**
     * 提交 2FA 验证码
     */
    submitTwoFactorCode(sessionId, code) {
        const session = this.sessions.get(sessionId);
        if (!session || !session.twoFactorCodeResolver) {
            console.log(`[2FA] submitTwoFactorCode 失败: session=${!!session}, resolver=${!!session?.twoFactorCodeResolver}`);
            return false;
        }
        console.log(`[2FA] 用户提交验证码: ${code.substring(0, 2)}***`);
        session.twoFactorCodeResolver(code);
        session.twoFactorCodeResolver = undefined;
        return true;
    }
    /**
     * 提交信任设备选择
     */
    submitTrustDevice(sessionId, trust) {
        const session = this.sessions.get(sessionId);
        if (!session || !session.twoFactorTrustResolver) {
            console.log(`[2FA] submitTrustDevice 失败: session=${!!session}, resolver=${!!session?.twoFactorTrustResolver}`);
            return false;
        }
        console.log(`[2FA] 用户选择信任设备: ${trust}`);
        session.twoFactorTrustResolver(trust);
        session.twoFactorTrustResolver = undefined;
        return true;
    }
    /**
     * 获取已登录的 helper 实例（仅在登录完成后返回）
     */
    getHelper(sessionId) {
        const session = this.sessions.get(sessionId);
        if (!session) {
            console.log(`[Session] getHelper: session 不存在 (${sessionId})`);
            return null;
        }
        // 必须登录完成才返回 helper
        if (!session.loginCompleted) {
            console.log(`[Session] getHelper: 登录尚未完成 (${sessionId})`);
            return null;
        }
        // 检查会话是否超时
        if (Date.now() - session.lastActive > this.SESSION_TIMEOUT) {
            console.log(`[Session] getHelper: 会话已超时 (${sessionId})`);
            this.sessions.delete(sessionId);
            return null;
        }
        session.lastActive = Date.now();
        return session.helper;
    }
    /**
     * 检查是否已登录（登录流程完全完成）
     */
    isLoggedIn(sessionId) {
        const session = this.sessions.get(sessionId);
        if (!session)
            return false;
        if (!session.loginCompleted)
            return false;
        if (Date.now() - session.lastActive > this.SESSION_TIMEOUT) {
            this.sessions.delete(sessionId);
            return false;
        }
        return true;
    }
    /**
     * 检查登录是否仍在进行中（未完成也未失败）
     */
    isLoginInProgress(sessionId) {
        const session = this.sessions.get(sessionId);
        if (!session)
            return false;
        return !session.loginCompleted && !session.loginError;
    }
    /**
     * 获取用户ID
     */
    getUserId(sessionId) {
        const session = this.sessions.get(sessionId);
        return session?.userId || null;
    }
    /**
     * 登出
     */
    async logout(sessionId) {
        const session = this.sessions.get(sessionId);
        if (session) {
            console.log(`[Session] 登出 userId=${session.userId}`);
            try {
                if (session.loginCompleted) {
                    await session.helper.logout();
                }
            }
            catch {
                // 忽略登出错误
            }
            this.sessions.delete(sessionId);
        }
    }
    /**
     * 清理过期会话
     */
    cleanup() {
        const now = Date.now();
        let cleaned = 0;
        for (const [id, session] of this.sessions.entries()) {
            if (now - session.lastActive > this.SESSION_TIMEOUT) {
                this.sessions.delete(id);
                cleaned++;
            }
        }
        if (cleaned > 0) {
            console.log(`[Session] 清理了 ${cleaned} 个过期会话`);
        }
    }
}
exports.sessionManager = new SessionManager();
// 每 10 分钟清理一次过期会话
setInterval(() => exports.sessionManager.cleanup(), 10 * 60 * 1000);
//# sourceMappingURL=session-manager.js.map