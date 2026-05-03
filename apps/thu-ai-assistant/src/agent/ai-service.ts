import { InfoHelper } from "@thu-info/lib";
import { callGLM, callGLMStream, LlmConfig } from "./llm-client";
import { buildSystemPrompt } from "./prompt";
import { ChatMessage, ChatResult } from "./types";
import { executeTool } from "./tools";
import { extractToolActions } from "./tools/tool-result";

/**
 * 与 GLM4-Flash 进行对话
 */
export async function chat(
    helper: InfoHelper,
    messages: ChatMessage[],
    sessionId?: string,
    llmConfig?: LlmConfig,
): Promise<ChatResult> {
    const toolResults: ChatResult["toolResults"] = [];
    const actions: NonNullable<ChatResult["actions"]> = [];
    const actionKeys = new Set<string>();

    const collectToolResult = (toolName: string, args: Record<string, unknown>, rawResult: string) => {
        try {
            const result = JSON.parse(rawResult);
            for (const action of extractToolActions(result)) {
                const key = JSON.stringify(action);
                if (actionKeys.has(key)) continue;
                actionKeys.add(key);
                actions.push(action);
            }
            toolResults.push({ name: toolName, args, result });
        } catch {
            // Tool results should be JSON, but trace collection is best-effort.
        }
    };

    // 构建完整的消息列表
    const fullMessages: ChatMessage[] = [
        { role: "system", content: buildSystemPrompt() },
        ...messages,
    ];

    console.log(`[AI] 开始对话，消息数: ${messages.length}`);

    // 第一次调用 GLM
    console.log(`[AI] 第1次调用GLM...`);
    let glmStart = Date.now();
    let response = await callGLM(fullMessages, llmConfig);
    console.log(`[AI] GLM响应耗时: ${Date.now() - glmStart}ms`);
    let assistantMessage = response.choices[0].message;

    // 处理工具调用循环（最多 5 轮）
    let iterations = 0;
    while (assistantMessage.tool_calls && iterations < 5) {
        iterations++;
        console.log(`[AI] === 工具调用轮次 ${iterations} ===`);

        // 将 assistant 的工具调用消息加入历史
        fullMessages.push({
            role: "assistant",
            content: assistantMessage.content || "",
            tool_calls: assistantMessage.tool_calls,
        });

        // 执行所有工具调用
        for (const toolCall of assistantMessage.tool_calls) {
            const args = typeof toolCall.function.arguments === "string"
                ? JSON.parse(toolCall.function.arguments)
                : toolCall.function.arguments;

            console.log(`[AI] 调用工具: ${toolCall.function.name}`, JSON.stringify(args));
            const toolStart = Date.now();
            const result = await executeTool(helper, toolCall.function.name, args, sessionId);
            collectToolResult(toolCall.function.name, args || {}, result);
            console.log(`[AI] 工具 ${toolCall.function.name} 耗时: ${Date.now() - toolStart}ms, 结果长度: ${result.length}`);
            
            // 打印结果摘要（前200字符）
            console.log(`[AI] 工具结果摘要: ${result.substring(0, 200)}${result.length > 200 ? '...' : ''}`);

            fullMessages.push({
                role: "tool",
                content: result,
                tool_call_id: toolCall.id,
            });
        }

        // 再次调用 GLM 获取最终回复
        console.log(`[AI] 第${iterations + 1}次调用GLM（带工具结果）...`);
        glmStart = Date.now();
        response = await callGLM(fullMessages, llmConfig);
        console.log(`[AI] GLM响应耗时: ${Date.now() - glmStart}ms`);
        assistantMessage = response.choices[0].message;
    }

    const reply = assistantMessage.content || "抱歉，我暂时无法回答这个问题。";
    console.log(`[AI] 最终回复长度: ${reply.length}, 工具调用轮次: ${iterations}`);

    // 更新消息历史（不包含 system prompt）
    const updatedMessages = [...messages, { role: "assistant" as const, content: reply }];

    return { reply, updatedMessages, toolResults, actions };
}

type ChatStreamEvent =
    | { type: "status"; message: string }
    | { type: "delta"; text: string }
    | { type: "tool_result"; name: string; args: Record<string, unknown>; result: Record<string, unknown> }
    | { type: "done"; reply: string; updatedMessages: ChatMessage[]; toolResults: NonNullable<ChatResult["toolResults"]>; actions: NonNullable<ChatResult["actions"]> };

export async function chatStream(
    helper: InfoHelper,
    messages: ChatMessage[],
    sessionId: string | undefined,
    emit: (event: ChatStreamEvent) => void,
    llmConfig?: LlmConfig,
): Promise<ChatResult> {
    const toolResults: NonNullable<ChatResult["toolResults"]> = [];
    const actions: NonNullable<ChatResult["actions"]> = [];
    const actionKeys = new Set<string>();
    const fullMessages: ChatMessage[] = [
        { role: "system", content: buildSystemPrompt() },
        ...messages,
    ];

    const collectToolResult = (toolName: string, args: Record<string, unknown>, rawResult: string) => {
        try {
            const result = JSON.parse(rawResult);
            for (const action of extractToolActions(result)) {
                const key = JSON.stringify(action);
                if (actionKeys.has(key)) continue;
                actionKeys.add(key);
                actions.push(action);
            }
            toolResults.push({ name: toolName, args, result });
            emit({ type: "tool_result", name: toolName, args, result });
        } catch {
            // Best-effort tracing only.
        }
    };

    let iterations = 0;
    let finalReply = "";

    while (iterations < 6) {
        emit({ type: "status", message: iterations === 0 ? "正在思考..." : "正在整理工具结果..." });
        const response = await callGLMStream(fullMessages, {
            onContent: (delta) => {
                finalReply += delta;
                emit({ type: "delta", text: delta });
            },
        }, llmConfig);
        const assistantMessage = response.choices[0].message;

        if (!assistantMessage.tool_calls?.length) {
            const reply = finalReply || assistantMessage.content || "抱歉，我暂时无法回答这个问题。";
            const updatedMessages = [...messages, { role: "assistant" as const, content: reply }];
            emit({ type: "done", reply, updatedMessages, toolResults, actions });
            return { reply, updatedMessages, toolResults, actions };
        }

        finalReply = "";
        fullMessages.push({
            role: "assistant",
            content: assistantMessage.content || "",
            tool_calls: assistantMessage.tool_calls,
        });

        for (const toolCall of assistantMessage.tool_calls) {
            const args = typeof toolCall.function.arguments === "string"
                ? JSON.parse(toolCall.function.arguments || "{}")
                : toolCall.function.arguments || {};

            emit({ type: "status", message: `正在调用工具：${toolCall.function.name}` });
            const result = await executeTool(helper, toolCall.function.name, args, sessionId);
            collectToolResult(toolCall.function.name, args || {}, result);
            fullMessages.push({
                role: "tool",
                content: result,
                tool_call_id: toolCall.id,
            });
        }

        iterations++;
    }

    throw new Error("工具调用轮次过多，请缩小任务范围后重试");
}
