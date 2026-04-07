/**
 * THU AI Assistant - Express 服务器
 * 提供登录、2FA验证、AI对话等 API
 */

// Node.js 环境 polyfill（某些依赖需要 window 对象）
if (typeof globalThis.window === "undefined") {
    (globalThis as any).window = globalThis;
}

import express from "express";
import session from "express-session";
import cors from "cors";
import path from "path";
import { v4 as uuidv4 } from "uuid";
import { sessionManager } from "./session-manager";
import { chat, ChatMessage } from "./ai-service";
import { rechargeCardInfo } from "./thu-data-service";
import { sportsSeleniumService, sportsIdInfoList } from "./sports-selenium-service";

const app = express();
const PORT = process.env.PORT || 3000;

// 中间件
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(
    session({
        secret: "thu-ai-assistant-secret-" + Date.now(),
        resave: false,
        saveUninitialized: true,
        cookie: { maxAge: 2 * 60 * 60 * 1000 }, // 2小时
    }) as any,
);

// 静态文件
app.use(express.static(path.join(__dirname, "..", "public")));

// 扩展 session 类型
declare module "express-session" {
    interface SessionData {
        sessionId: string;
        chatHistory: ChatMessage[];
    }
}

// ==================== 认证相关 API ====================

/**
 * POST /api/login - 开始登录
 */
app.post("/api/login", async (req, res) => {
    const { userId, password } = req.body;
    if (!userId || !password) {
        return res.status(400).json({ error: "请输入学号和密码" });
    }

    const sessionId = uuidv4();
    req.session.sessionId = sessionId;
    req.session.chatHistory = [];

    console.log(`[API] POST /api/login - userId=${userId}, sessionId=${sessionId}`);

    try {
        // 启动登录流程（可能会触发 2FA，所以是异步的）
        const loginPromise = sessionManager.startLogin(sessionId, userId, password);

        // 等待一小段时间看是否需要 2FA 或者直接成功
        const result = await Promise.race([
            loginPromise.then(() => ({ status: "success" as const })),
            new Promise<{ status: "pending" }>((resolve) =>
                setTimeout(() => resolve({ status: "pending" }), 5000),
            ),
        ]);

        if (result.status === "success") {
            console.log(`[API] 登录直接成功（无需2FA）`);
            return res.json({ status: "success", message: "登录成功" });
        }

        // 检查是否有 2FA 请求
        const twoFactorStatus = sessionManager.getTwoFactorStatus(sessionId);
        if (twoFactorStatus) {
            console.log(`[API] 需要2FA验证, type=${twoFactorStatus.type}`);
            return res.json({
                status: "two_factor",
                twoFactor: twoFactorStatus,
            });
        }

        // 检查是否已经出错
        const loginError = sessionManager.getLoginError(sessionId);
        if (loginError) {
            console.log(`[API] 登录出错: ${loginError}`);
            return res.status(401).json({ error: loginError });
        }

        // 仍在登录中，让前端轮询
        console.log(`[API] 登录仍在进行中，返回 pending`);
        return res.json({ status: "pending", message: "登录中..." });
    } catch (e: any) {
        console.error(`[API] 登录异常: ${e.message}`);
        return res.status(401).json({ error: e.message || "登录失败" });
    }
});

/**
 * GET /api/login/status - 检查登录状态
 */
app.get("/api/login/status", (req, res) => {
    const sessionId = req.session.sessionId;
    if (!sessionId) {
        return res.json({ status: "not_logged_in" });
    }

    // 优先检查是否已完成登录
    if (sessionManager.isLoggedIn(sessionId)) {
        console.log(`[API] GET /api/login/status -> success`);
        return res.json({
            status: "success",
            userId: sessionManager.getUserId(sessionId),
        });
    }

    // 检查是否有登录错误
    const loginError = sessionManager.getLoginError(sessionId);
    if (loginError) {
        console.log(`[API] GET /api/login/status -> error: ${loginError}`);
        return res.json({ status: "error", error: loginError });
    }

    // 检查是否有 2FA 请求
    const twoFactorStatus = sessionManager.getTwoFactorStatus(sessionId);
    if (twoFactorStatus) {
        console.log(`[API] GET /api/login/status -> two_factor (${twoFactorStatus.type})`);
        return res.json({
            status: "two_factor",
            twoFactor: twoFactorStatus,
        });
    }

    // 检查是否仍在进行中
    if (sessionManager.isLoginInProgress(sessionId)) {
        return res.json({ status: "pending" });
    }

    return res.json({ status: "not_logged_in" });
});

/**
 * POST /api/login/2fa/method - 提交 2FA 方法选择
 */
app.post("/api/login/2fa/method", (req, res) => {
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

/**
 * POST /api/login/2fa/code - 提交 2FA 验证码
 */
app.post("/api/login/2fa/code", async (req, res) => {
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

/**
 * POST /api/login/2fa/trust - 提交信任设备选择
 */
app.post("/api/login/2fa/trust", (req, res) => {
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

/**
 * POST /api/logout - 登出
 */
app.post("/api/logout", async (req, res) => {
    const sessionId = req.session.sessionId;
    console.log(`[API] POST /api/logout - sessionId=${sessionId}`);
    if (sessionId) {
        await sessionManager.logout(sessionId);
    }
    req.session.destroy(() => {});
    res.json({ status: "ok" });
});

// ==================== AI 对话 API ====================

/**
 * POST /api/chat - 发送消息给 AI
 */
app.post("/api/chat", async (req, res) => {
    const sessionId = req.session.sessionId;
    console.log(`[API] POST /api/chat - sessionId=${sessionId}, isLoggedIn=${sessionId ? sessionManager.isLoggedIn(sessionId) : false}`);

    if (!sessionId || !sessionManager.isLoggedIn(sessionId)) {
        return res.status(401).json({ error: "请先登录" });
    }

    const helper = sessionManager.getHelper(sessionId);
    if (!helper) {
        return res.status(401).json({ error: "会话已过期，请重新登录" });
    }

    const { message } = req.body;
    if (!message) {
        return res.status(400).json({ error: "请输入消息" });
    }

    console.log(`[API] 用户消息: "${message.substring(0, 50)}${message.length > 50 ? '...' : ''}"`);

    try {
        // 获取聊天历史
        const history: ChatMessage[] = req.session.chatHistory || [];

        // 添加用户消息
        history.push({ role: "user", content: message });

        console.log(`[API] 调用AI，历史消息数: ${history.length}`);
        const startTime = Date.now();

        // 调用 AI
        const { reply, updatedMessages } = await chat(helper, history);

        const elapsed = Date.now() - startTime;
        console.log(`[API] AI回复完成，耗时: ${elapsed}ms，回复长度: ${reply.length}`);

        // 保存更新后的历史（限制长度避免 token 过多）
        req.session.chatHistory = updatedMessages.slice(-20);

        return res.json({ reply });
    } catch (e: any) {
        console.error("[API] Chat Error:", e.message, e.stack);
        return res.status(500).json({
            error: "AI 回复失败: " + (e.message || "未知错误"),
        });
    }
});

/**
 * POST /api/chat/clear - 清空聊天历史
 */
app.post("/api/chat/clear", (req, res) => {
    console.log(`[API] POST /api/chat/clear`);
    req.session.chatHistory = [];
    res.json({ status: "ok" });
});

// ==================== 校园卡充值 API ====================

/**
 * POST /api/card/recharge - 校园卡充值，生成支付二维码
 */
app.post("/api/card/recharge", async (req, res) => {
    const sessionId = req.session.sessionId;
    console.log(`[API] POST /api/card/recharge - sessionId=${sessionId}`);

    if (!sessionId || !sessionManager.isLoggedIn(sessionId)) {
        return res.status(401).json({ error: "请先登录" });
    }

    const helper = sessionManager.getHelper(sessionId);
    if (!helper) {
        return res.status(401).json({ error: "会话已过期，请重新登录" });
    }

    const { amount, payMethod } = req.body;
    if (!amount || amount <= 0) {
        return res.status(400).json({ error: "请输入有效的充值金额" });
    }

    console.log(`[API] 校园卡充值: amount=${amount}, payMethod=${payMethod || 'wechat'}`);

    try {
        const result = await rechargeCardInfo(helper, amount, payMethod || "wechat");
        return res.json(result);
    } catch (e: any) {
        console.error(`[API] 充值失败:`, e.message);
        return res.status(500).json({ error: e.message || "充值失败" });
    }
});

// ==================== 体育场馆 API ====================

/**
 * GET /api/sports/venues - 获取场馆列表
 */
app.get("/api/sports/venues", (_req, res) => {
    console.log(`[API] GET /api/sports/venues`);
    res.json({
        success: true,
        data: sportsIdInfoList
    });
});

/**
 * POST /api/sports/login - 登录体育系统
 */
app.post("/api/sports/login", async (req, res) => {
    const sessionId = req.session.sessionId;
    console.log(`[API] POST /api/sports/login - sessionId=${sessionId}`);

    if (!sessionId || !sessionManager.isLoggedIn(sessionId)) {
        return res.status(401).json({ error: "请先登录主系统" });
    }

    const helper = sessionManager.getHelper(sessionId);
    if (!helper) {
        return res.status(401).json({ error: "会话已过期，请重新登录" });
    }

    try {
        // 使用主系统的用户名密码登录体育系统
        // 注意：这里需要处理2FA，所以在API模式下需要前端配合
        const success = await sportsSeleniumService.login(
            helper.userId,
            helper.password,
            {
                onProgress: (msg) => console.log(`[Sports] ${msg}`),
                onError: (err) => console.error(`[Sports] ${err}`),
                onSuccess: () => console.log(`[Sports] 登录成功`)
            },
            true // 使用无头模式
        );

        res.json({ success, message: "登录成功" });
    } catch (e: any) {
        console.error(`[API] 体育系统登录失败:`, e.message);
        res.status(500).json({ error: e.message || "登录失败" });
    }
});

/**
 * POST /api/sports/query - 查询场馆可用时段
 */
app.post("/api/sports/query", async (req, res) => {
    const sessionId = req.session.sessionId;
    console.log(`[API] POST /api/sports/query - sessionId=${sessionId}`);

    if (!sessionId || !sessionManager.isLoggedIn(sessionId)) {
        return res.status(401).json({ error: "请先登录" });
    }

    const { venueName, date } = req.body;

    if (!venueName || !date) {
        return res.status(400).json({ error: "请提供场馆名称和日期" });
    }

    console.log(`[API] 查询体育场馆: venue=${venueName}, date=${date}`);

    try {
        const result = await sportsSeleniumService.queryVenue(venueName, date);
        console.log(`[API] 查询成功，找到 ${result.slots.length} 个时段`);
        res.json({ success: true, data: result });
    } catch (e: any) {
        console.error(`[API] 查询体育场馆失败:`, e.message);
        res.status(500).json({ error: e.message || "查询失败" });
    }
});

/**
 * POST /api/sports/book - 预约场地
 */
app.post("/api/sports/book", async (req, res) => {
    const sessionId = req.session.sessionId;
    console.log(`[API] POST /api/sports/book - sessionId=${sessionId}`);

    if (!sessionId || !sessionManager.isLoggedIn(sessionId)) {
        return res.status(401).json({ error: "请先登录" });
    }

    const { venueName, date, timeSlot } = req.body;

    if (!venueName || !date || !timeSlot) {
        return res.status(400).json({ error: "请提供完整信息（场馆名称、日期、时间段）" });
    }

    console.log(`[API] 预约体育场地: venue=${venueName}, date=${date}, time=${timeSlot}`);

    try {
        const result = await sportsSeleniumService.bookVenue(venueName, date, timeSlot);
        console.log(`[API] 预约${result.success ? '成功' : '失败'}: ${result.message}`);
        res.json(result);
    } catch (e: any) {
        console.error(`[API] 预约体育场地失败:`, e.message);
        res.status(500).json({ error: e.message || "预约失败" });
    }
});

/**
 * POST /api/sports/logout - 登出体育系统
 */
app.post("/api/sports/logout", async (req, res) => {
    const sessionId = req.session.sessionId;
    console.log(`[API] POST /api/sports/logout - sessionId=${sessionId}`);

    try {
        await sportsSeleniumService.close();
        res.json({ success: true, message: "已登出体育系统" });
    } catch (e: any) {
        console.error(`[API] 登出体育系统失败:`, e.message);
        res.status(500).json({ error: e.message || "登出失败" });
    }
});

// ==================== 页面路由 ====================

app.get("/", (_req, res) => {
    res.sendFile(path.join(__dirname, "..", "public", "index.html"));
});

// 启动服务器
app.listen(PORT, () => {
    console.log(`\n🎓 清华AI助手已启动！`);
    console.log(`📍 访问地址: http://localhost:${PORT}`);
    console.log(`⏰ 启动时间: ${new Date().toLocaleString()}`);
    console.log(`\n支持的功能:`);
    console.log(`  📅 课程表查询`);
    console.log(`  🏸 体育场馆预约查询`);
    console.log(`  📊 成绩查询`);
    console.log(`  💳 校园卡余额/充值`);
    console.log(`  ⚡ 电费查询`);
    console.log(`  📚 图书馆信息`);
    console.log(`  📰 校内新闻`);
    console.log(`  📆 教学日历`);
    console.log(`  🏫 教室查询\n`);
});

export default app;
