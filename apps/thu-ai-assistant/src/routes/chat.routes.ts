import { Router } from "express";
import { chat, chatStream } from "../agent/ai-service";
import { callGLM } from "../agent/llm-client";
import { ChatMessage } from "../agent/types";
import { executeTool } from "../agent/tools";
import { sessionManager } from "../session/session-manager";

export const chatRouter = Router();

const isConfirmationMessage = (message: string) =>
    /^(确认|确定|执行|下单|充值|打开|确认充值|确认执行|确认打开|可以|是的|对)$/i.test(message.trim());

const formatActionReply = (result: any) => {
    if (!result.success) {
        return `执行失败：${result.error || result.message || "未知错误"}`;
    }
    const parts = [
        result.message || "动作已执行。",
        result.summary ? `\n\n${result.summary}` : "",
    ];
    return parts.filter(Boolean).join("");
};

const writeSse = (res: any, event: string, data: unknown) => {
    res.write(`event: ${event}\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
};

const parseLlmConfig = (body: any) => {
    const llm = body?.llm;
    if (!llm || llm.mode !== "custom") return undefined;

    const apiUrl = String(llm.apiUrl || "").trim();
    const apiKey = String(llm.apiKey || "").trim();
    const model = String(llm.model || "").trim();
    const provider = String(llm.provider || "custom").trim() || "custom";

    if (!apiUrl || !apiKey || !model) {
        throw new Error("自定义 LLM 配置不完整，请填写 API URL、API Key 和模型名");
    }
    if (!/^https?:\/\//i.test(apiUrl)) {
        throw new Error("自定义 LLM API URL 必须以 http:// 或 https:// 开头");
    }

    return { apiUrl, apiKey, model, provider };
};

const saveSession = (req: any) =>
    new Promise<void>((resolve, reject) => {
        req.session.save((error: Error | undefined) => {
            if (error) reject(error);
            else resolve();
        });
    });

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

        const pendingActions = sessionManager.listPendingActions(sessionId);
        if (isConfirmationMessage(message) && pendingActions.length > 0) {
            const latestAction = pendingActions[pendingActions.length - 1];
            console.log(`[API] 检测到确认意图，直接执行待确认动作: ${latestAction.actionType}`);
            const rawResult = await executeTool(
                helper,
                "confirm_pending_action",
                { confirmation_token: latestAction.token },
                sessionId,
            );
            const result = JSON.parse(rawResult);
            const reply = formatActionReply(result);
            history.push({ role: "assistant", content: reply });
            req.session.chatHistory = history.slice(-20);
            return res.json({ reply, actionResult: result, actions: result.actions || [] });
        }

        console.log(`[API] 调用AI，历史消息数: ${history.length}`);
        const startTime = Date.now();
        const { reply, updatedMessages, toolResults, actions } = await chat(
            helper,
            history,
            sessionId,
            parseLlmConfig(req.body),
        );

        const elapsed = Date.now() - startTime;
        console.log(`[API] AI回复完成，耗时: ${elapsed}ms，回复长度: ${reply.length}`);

        req.session.chatHistory = updatedMessages.slice(-20);

        return res.json({ reply, toolResults, actions });
    } catch (e: any) {
        console.error("[API] Chat Error:", e.message, e.stack);
        return res.status(500).json({
            error: "AI 回复失败: " + (e.message || "未知错误"),
        });
    }
});

chatRouter.post("/api/chat/stream", async (req, res) => {
    const sessionId = req.session.sessionId;
    console.log(`[API] POST /api/chat/stream - sessionId=${sessionId}, isLoggedIn=${sessionId ? sessionManager.isLoggedIn(sessionId) : false}`);

    res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders?.();

    if (!sessionId || !sessionManager.isLoggedIn(sessionId)) {
        writeSse(res, "error", { error: "请先登录" });
        res.end();
        return;
    }

    const helper = sessionManager.getHelper(sessionId);
    if (!helper) {
        writeSse(res, "error", { error: "会话已过期，请重新登录" });
        res.end();
        return;
    }

    const { message } = req.body;
    if (!message) {
        writeSse(res, "error", { error: "请输入消息" });
        res.end();
        return;
    }

    try {
        const history: ChatMessage[] = req.session.chatHistory || [];
        history.push({ role: "user", content: message });

        const pendingActions = sessionManager.listPendingActions(sessionId);
        if (isConfirmationMessage(message) && pendingActions.length > 0) {
            const latestAction = pendingActions[pendingActions.length - 1];
            writeSse(res, "status", { message: `正在执行待确认动作：${latestAction.actionType}` });
            const rawResult = await executeTool(
                helper,
                "confirm_pending_action",
                { confirmation_token: latestAction.token },
                sessionId,
            );
            const result = JSON.parse(rawResult);
            const reply = formatActionReply(result);
            writeSse(res, "delta", { text: reply });
            history.push({ role: "assistant", content: reply });
            req.session.chatHistory = history.slice(-20);
            await saveSession(req);
            writeSse(res, "done", { reply, actionResult: result, actions: result.actions || [] });
            res.end();
            return;
        }

        const llmConfig = parseLlmConfig(req.body);
        const result = await chatStream(helper, history, sessionId, (event) => {
            if (event.type === "done") return;
            if (event.type === "delta") writeSse(res, "delta", { text: event.text });
            if (event.type === "status") writeSse(res, "status", { message: event.message });
            if (event.type === "tool_result") {
                writeSse(res, "tool_result", {
                    name: event.name,
                    args: event.args,
                    result: event.result,
                });
            }
        }, llmConfig);

        req.session.chatHistory = result.updatedMessages.slice(-20);
        await saveSession(req);
        writeSse(res, "done", {
            reply: result.reply,
            toolResults: result.toolResults || [],
            actions: result.actions || [],
        });
        res.end();
    } catch (e: any) {
        console.error("[API] Chat Stream Error:", e.message, e.stack);
        writeSse(res, "error", { error: "AI 流式回复失败: " + (e.message || "未知错误") });
        res.end();
    }
});

chatRouter.post("/api/llm/test", async (req, res) => {
    try {
        const llmConfig = parseLlmConfig(req.body);
        const startedAt = Date.now();
        const response = await callGLM([
            { role: "user", content: "请只回复 ok，用于连接测试。" },
        ], llmConfig);
        const content = response.choices?.[0]?.message?.content || "";
        res.json({
            status: "ok",
            provider: llmConfig?.provider || "builtin",
            model: llmConfig?.model,
            elapsedMs: Date.now() - startedAt,
            sample: content.slice(0, 80),
        });
    } catch (e: any) {
        res.status(400).json({ error: e.message || "LLM 连接测试失败" });
    }
});

chatRouter.post("/api/chat/clear", (req, res) => {
    const sessionId = req.session.sessionId;
    console.log(`[API] POST /api/chat/clear - sessionId=${sessionId}`);

    if (!sessionId || !sessionManager.isLoggedIn(sessionId)) {
        return res.status(401).json({ error: "请先登录" });
    }

    req.session.chatHistory = [];
    res.json({ status: "ok" });
});
