/**
 * THU AI Assistant - Express server entrypoint.
 */

if (typeof globalThis.window === "undefined") {
    (globalThis as any).window = globalThis;
}

import express from "express";
import session from "express-session";
import cors from "cors";
import path from "path";
import { env } from "./config/env";
import { registerRoutes } from "./routes";
import "./session/session-types";

const app = express();

app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(
    session({
        secret: env.sessionSecret,
        resave: false,
        saveUninitialized: true,
        cookie: { maxAge: 2 * 60 * 60 * 1000 },
    }) as any,
);

app.use(express.static(path.join(__dirname, "..", "public")));
registerRoutes(app);

app.get("/", (_req, res) => {
    res.sendFile(path.join(__dirname, "..", "public", "index.html"));
});

app.listen(env.port, () => {
    console.log(`\n🎓 清华AI助手已启动！`);
    console.log(`📍 访问地址: http://localhost:${env.port}`);
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
