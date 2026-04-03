/**
 * 会话管理器 - 管理已登录的 InfoHelper 实例
 * 确保登录一次后，后续所有操作复用同一个会话，无需重新验证
 */
import { InfoHelper } from "@thu-info/lib";
declare class SessionManager {
    private sessions;
    private readonly SESSION_TIMEOUT;
    /**
     * 创建新的 InfoHelper 实例并配置 2FA hooks
     */
    createHelper(sessionId: string): InfoHelper;
    /**
     * 开始登录流程（异步，不等待完成）
     * 返回一个 Promise，登录完成后 resolve
     */
    /**
     * 基于 userId 生成固定的设备指纹
     * 这样信任设备后，后续登录/roaming 都能复用信任状态，避免重复 2FA
     */
    private generateFingerprint;
    startLogin(sessionId: string, userId: string, password: string): Promise<void>;
    /**
     * 获取 2FA 状态
     */
    getTwoFactorStatus(sessionId: string): {
        type: "method_selection" | "code_input" | "trust_device";
        hasWeChatBool?: boolean;
        phone?: string | null;
        hasTotp?: boolean;
    } | null;
    /**
     * 获取登录错误信息
     */
    getLoginError(sessionId: string): string | null;
    /**
     * 提交 2FA 方法选择
     */
    submitTwoFactorMethod(sessionId: string, method: "wechat" | "mobile" | "totp"): boolean;
    /**
     * 提交 2FA 验证码
     */
    submitTwoFactorCode(sessionId: string, code: string): boolean;
    /**
     * 提交信任设备选择
     */
    submitTrustDevice(sessionId: string, trust: boolean): boolean;
    /**
     * 获取已登录的 helper 实例（仅在登录完成后返回）
     */
    getHelper(sessionId: string): InfoHelper | null;
    /**
     * 检查是否已登录（登录流程完全完成）
     */
    isLoggedIn(sessionId: string): boolean;
    /**
     * 检查登录是否仍在进行中（未完成也未失败）
     */
    isLoginInProgress(sessionId: string): boolean;
    /**
     * 获取用户ID
     */
    getUserId(sessionId: string): string | null;
    /**
     * 登出
     */
    logout(sessionId: string): Promise<void>;
    /**
     * 清理过期会话
     */
    cleanup(): void;
}
export declare const sessionManager: SessionManager;
export {};
//# sourceMappingURL=session-manager.d.ts.map