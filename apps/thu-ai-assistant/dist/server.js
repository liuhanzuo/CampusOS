"use strict";
/**
 * THU AI Assistant - Express 服务器
 * 提供登录、2FA验证、AI对话等 API
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
// Node.js 环境 polyfill（某些依赖需要 window 对象）
if (typeof globalThis.window === "undefined") {
    globalThis.window = globalThis;
}
const express_1 = __importDefault(require("express"));
const express_session_1 = __importDefault(require("express-session"));
const cors_1 = __importDefault(require("cors"));
const path_1 = __importDefault(require("path"));
const uuid_1 = require("uuid");
const session_manager_1 = require("./session-manager");
const ai_service_1 = require("./ai-service");
const thu_data_service_1 = require("./thu-data-service");
const app = (0, express_1.default)();
const PORT = process.env.PORT || 3000;
// 中间件
app.use((0, cors_1.default)({ origin: true, credentials: true }));
app.use(express_1.default.json());
app.use(express_1.default.urlencoded({ extended: true }));
app.use((0, express_session_1.default)({
    secret: "thu-ai-assistant-secret-" + Date.now(),
    resave: false,
    saveUninitialized: true,
    cookie: { maxAge: 2 * 60 * 60 * 1000 }, // 2小时
}));
// 静态文件
app.use(express_1.default.static(path_1.default.join(__dirname, "..", "public")));
// ==================== 认证相关 API ====================
/**
 * POST /api/login - 开始登录
 */
app.post("/api/login", async (req, res) => {
    const { userId, password } = req.body;
    if (!userId || !password) {
        return res.status(400).json({ error: "请输入学号和密码" });
    }
    const sessionId = (0, uuid_1.v4)();
    req.session.sessionId = sessionId;
    req.session.chatHistory = [];
    console.log(`[API] POST /api/login - userId=${userId}, sessionId=${sessionId}`);
    try {
        // 启动登录流程（可能会触发 2FA，所以是异步的）
        const loginPromise = session_manager_1.sessionManager.startLogin(sessionId, userId, password);
        // 等待一小段时间看是否需要 2FA 或者直接成功
        const result = await Promise.race([
            loginPromise.then(() => ({ status: "success" })),
            new Promise((resolve) => setTimeout(() => resolve({ status: "pending" }), 5000)),
        ]);
        if (result.status === "success") {
            console.log(`[API] 登录直接成功（无需2FA）`);
            return res.json({ status: "success", message: "登录成功" });
        }
        // 检查是否有 2FA 请求
        const twoFactorStatus = session_manager_1.sessionManager.getTwoFactorStatus(sessionId);
        if (twoFactorStatus) {
            console.log(`[API] 需要2FA验证, type=${twoFactorStatus.type}`);
            return res.json({
                status: "two_factor",
                twoFactor: twoFactorStatus,
            });
        }
        // 检查是否已经出错
        const loginError = session_manager_1.sessionManager.getLoginError(sessionId);
        if (loginError) {
            console.log(`[API] 登录出错: ${loginError}`);
            return res.status(401).json({ error: loginError });
        }
        // 仍在登录中，让前端轮询
        console.log(`[API] 登录仍在进行中，返回 pending`);
        return res.json({ status: "pending", message: "登录中..." });
    }
    catch (e) {
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
    if (session_manager_1.sessionManager.isLoggedIn(sessionId)) {
        console.log(`[API] GET /api/login/status -> success`);
        return res.json({
            status: "success",
            userId: session_manager_1.sessionManager.getUserId(sessionId),
        });
    }
    // 检查是否有登录错误
    const loginError = session_manager_1.sessionManager.getLoginError(sessionId);
    if (loginError) {
        console.log(`[API] GET /api/login/status -> error: ${loginError}`);
        return res.json({ status: "error", error: loginError });
    }
    // 检查是否有 2FA 请求
    const twoFactorStatus = session_manager_1.sessionManager.getTwoFactorStatus(sessionId);
    if (twoFactorStatus) {
        console.log(`[API] GET /api/login/status -> two_factor (${twoFactorStatus.type})`);
        return res.json({
            status: "two_factor",
            twoFactor: twoFactorStatus,
        });
    }
    // 检查是否仍在进行中
    if (session_manager_1.sessionManager.isLoginInProgress(sessionId)) {
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
    const success = session_manager_1.sessionManager.submitTwoFactorMethod(sessionId, method);
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
    const success = session_manager_1.sessionManager.submitTwoFactorCode(sessionId, code);
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
    const success = session_manager_1.sessionManager.submitTrustDevice(sessionId, !!trust);
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
        await session_manager_1.sessionManager.logout(sessionId);
    }
    req.session.destroy(() => { });
    res.json({ status: "ok" });
});
// ==================== AI 对话 API ====================
/**
 * POST /api/chat - 发送消息给 AI
 */
app.post("/api/chat", async (req, res) => {
    const sessionId = req.session.sessionId;
    console.log(`[API] POST /api/chat - sessionId=${sessionId}, isLoggedIn=${sessionId ? session_manager_1.sessionManager.isLoggedIn(sessionId) : false}`);
    if (!sessionId || !session_manager_1.sessionManager.isLoggedIn(sessionId)) {
        return res.status(401).json({ error: "请先登录" });
    }
    const helper = session_manager_1.sessionManager.getHelper(sessionId);
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
        const history = req.session.chatHistory || [];
        // 添加用户消息
        history.push({ role: "user", content: message });
        console.log(`[API] 调用AI，历史消息数: ${history.length}`);
        const startTime = Date.now();
        // 调用 AI
        const { reply, updatedMessages } = await (0, ai_service_1.chat)(helper, history);
        const elapsed = Date.now() - startTime;
        console.log(`[API] AI回复完成，耗时: ${elapsed}ms，回复长度: ${reply.length}`);
        // 保存更新后的历史（限制长度避免 token 过多）
        req.session.chatHistory = updatedMessages.slice(-20);
        return res.json({ reply });
    }
    catch (e) {
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
    if (!sessionId || !session_manager_1.sessionManager.isLoggedIn(sessionId)) {
        return res.status(401).json({ error: "请先登录" });
    }
    const helper = session_manager_1.sessionManager.getHelper(sessionId);
    if (!helper) {
        return res.status(401).json({ error: "会话已过期，请重新登录" });
    }
    const { amount, payMethod } = req.body;
    if (!amount || amount <= 0) {
        return res.status(400).json({ error: "请输入有效的充值金额" });
    }
    console.log(`[API] 校园卡充值: amount=${amount}, payMethod=${payMethod || 'wechat'}`);
    try {
        const result = await (0, thu_data_service_1.rechargeCardInfo)(helper, amount, payMethod || "wechat");
        return res.json(result);
    }
    catch (e) {
        console.error(`[API] 充值失败:`, e.message);
        return res.status(500).json({ error: e.message || "充值失败" });
    }
});
// ==================== 页面路由 ====================
app.get("/", (_req, res) => {
    res.sendFile(path_1.default.join(__dirname, "..", "public", "index.html"));
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
exports.default = app;
//# sourceMappingURL=server.js.map