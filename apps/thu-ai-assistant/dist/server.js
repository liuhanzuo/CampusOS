"use strict";
/**
 * THU AI Assistant - Express server entrypoint.
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
if (typeof globalThis.window === "undefined") {
    globalThis.window = globalThis;
}
const express_1 = __importDefault(require("express"));
const express_session_1 = __importDefault(require("express-session"));
const cors_1 = __importDefault(require("cors"));
const path_1 = __importDefault(require("path"));
const env_1 = require("./config/env");
const routes_1 = require("./routes");
require("./session/session-types");
const app = (0, express_1.default)();
app.use((0, cors_1.default)({ origin: true, credentials: true }));
app.use(express_1.default.json());
app.use(express_1.default.urlencoded({ extended: true }));
app.use((0, express_session_1.default)({
    secret: env_1.env.sessionSecret,
    resave: false,
    saveUninitialized: true,
    cookie: { maxAge: 2 * 60 * 60 * 1000 },
}));
app.use(express_1.default.static(path_1.default.join(__dirname, "..", "public")));
(0, routes_1.registerRoutes)(app);
app.get("/", (_req, res) => {
    res.sendFile(path_1.default.join(__dirname, "..", "public", "index.html"));
});
app.listen(env_1.env.port, () => {
    console.log(`\n🎓 清华AI助手已启动！`);
    console.log(`📍 访问地址: http://localhost:${env_1.env.port}`);
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