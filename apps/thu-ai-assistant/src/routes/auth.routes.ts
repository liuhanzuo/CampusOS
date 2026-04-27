import { Router } from "express";
import { v4 as uuidv4 } from "uuid";
import { sessionManager } from "../session/session-manager";

export const authRouter = Router();

authRouter.post("/api/login", async (req, res) => {
    const { userId, password } = req.body;
    if (!userId || !password) {
        return res.status(400).json({ error: "请输入学号和密码" });
    }

    const sessionId = uuidv4();
    req.session.sessionId = sessionId;
    req.session.chatHistory = [];

    console.log(`[API] POST /api/login - userId=${userId}, sessionId=${sessionId}`);

    try {
        const loginPromise = sessionManager.startLogin(sessionId, userId, password);
        const result = await Promise.race([
            loginPromise.then(() => ({ status: "success" as const })),
            new Promise<{ status: "pending" }>((resolve) =>
                setTimeout(() => resolve({ status: "pending" }), 5000),
            ),
        ]);

        if (result.status === "success") {
            console.log("[API] 登录直接成功（无需2FA）");
            return res.json({ status: "success", message: "登录成功" });
        }

        const twoFactorStatus = sessionManager.getTwoFactorStatus(sessionId);
        if (twoFactorStatus) {
            console.log(`[API] 需要2FA验证, type=${twoFactorStatus.type}`);
            return res.json({
                status: "two_factor",
                twoFactor: twoFactorStatus,
            });
        }

        const loginError = sessionManager.getLoginError(sessionId);
        if (loginError) {
            console.log(`[API] 登录出错: ${loginError}`);
            return res.status(401).json({ error: loginError });
        }

        console.log("[API] 登录仍在进行中，返回 pending");
        return res.json({ status: "pending", message: "登录中..." });
    } catch (e: any) {
        console.error(`[API] 登录异常: ${e.message}`);
        return res.status(401).json({ error: e.message || "登录失败" });
    }
});

authRouter.get("/api/login/status", (req, res) => {
    const sessionId = req.session.sessionId;
    if (!sessionId) {
        return res.json({ status: "not_logged_in" });
    }

    if (sessionManager.isLoggedIn(sessionId)) {
        console.log("[API] GET /api/login/status -> success");
        return res.json({
            status: "success",
            userId: sessionManager.getUserId(sessionId),
        });
    }

    const loginError = sessionManager.getLoginError(sessionId);
    if (loginError) {
        console.log(`[API] GET /api/login/status -> error: ${loginError}`);
        return res.json({ status: "error", error: loginError });
    }

    const twoFactorStatus = sessionManager.getTwoFactorStatus(sessionId);
    if (twoFactorStatus) {
        console.log(`[API] GET /api/login/status -> two_factor (${twoFactorStatus.type})`);
        return res.json({
            status: "two_factor",
            twoFactor: twoFactorStatus,
        });
    }

    if (sessionManager.isLoginInProgress(sessionId)) {
        return res.json({ status: "pending" });
    }

    return res.json({ status: "not_logged_in" });
});

authRouter.post("/api/login/2fa/method", (req, res) => {
    const sessionId = req.session.sessionId;
    if (!sessionId) {
        return res.status(400).json({ error: "无效会话" });
    }

    const { method } = req.body;
    if (!["wechat", "mobile", "totp"].includes(method)) {
        return res.status(400).json({ error: "无效的验证方式" });
    }

    console.log(`[API] POST /api/login/2fa/method - method=${method}`);

    const success = sessionManager.submitTwoFactorMethod(sessionId, method);
    if (success) {
        return res.json({ status: "ok", message: "已发送验证码，请查收" });
    }
    return res.status(400).json({ error: "提交失败，请重试" });
});

authRouter.post("/api/login/2fa/code", async (req, res) => {
    const sessionId = req.session.sessionId;
    if (!sessionId) {
        return res.status(400).json({ error: "无效会话" });
    }

    const { code } = req.body;
    if (!code) {
        return res.status(400).json({ error: "请输入验证码" });
    }

    console.log(`[API] POST /api/login/2fa/code - code=${code.substring(0, 2)}***`);

    const success = sessionManager.submitTwoFactorCode(sessionId, code);
    if (success) {
        return res.json({ status: "ok", message: "验证码已提交，请等待验证" });
    }
    return res.status(400).json({ error: "提交失败，请重试" });
});

authRouter.post("/api/login/2fa/trust", (req, res) => {
    const sessionId = req.session.sessionId;
    if (!sessionId) {
        return res.status(400).json({ error: "无效会话" });
    }

    const { trust } = req.body;
    console.log(`[API] POST /api/login/2fa/trust - trust=${trust}`);

    const success = sessionManager.submitTrustDevice(sessionId, !!trust);
    if (success) {
        return res.json({ status: "ok" });
    }
    return res.status(400).json({ error: "提交失败" });
});

authRouter.post("/api/logout", async (req, res) => {
    const sessionId = req.session.sessionId;
    console.log(`[API] POST /api/logout - sessionId=${sessionId}`);
    if (sessionId) {
        await sessionManager.logout(sessionId);
    }
    req.session.destroy(() => {});
    res.json({ status: "ok" });
});
