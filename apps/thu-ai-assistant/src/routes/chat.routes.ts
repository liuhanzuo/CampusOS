import { Router } from "express";
import { chat } from "../agent/ai-service";
import { ChatMessage } from "../agent/types";
import { sessionManager } from "../session/session-manager";

export const chatRouter = Router();

chatRouter.post("/api/chat", async (req, res) => {
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

    console.log(`[API] 用户消息: "${message.substring(0, 50)}${message.length > 50 ? "..." : ""}"`);

    try {
        const history: ChatMessage[] = req.session.chatHistory || [];
        history.push({ role: "user", content: message });

        console.log(`[API] 调用AI，历史消息数: ${history.length}`);
        const startTime = Date.now();
        const { reply, updatedMessages } = await chat(helper, history);

        const elapsed = Date.now() - startTime;
        console.log(`[API] AI回复完成，耗时: ${elapsed}ms，回复长度: ${reply.length}`);

        req.session.chatHistory = updatedMessages.slice(-20);

        return res.json({ reply });
    } catch (e: any) {
        console.error("[API] Chat Error:", e.message, e.stack);
        return res.status(500).json({
            error: "AI 回复失败: " + (e.message || "未知错误"),
        });
    }
});

chatRouter.post("/api/chat/clear", (req, res) => {
    console.log("[API] POST /api/chat/clear");
    req.session.chatHistory = [];
    res.json({ status: "ok" });
});
