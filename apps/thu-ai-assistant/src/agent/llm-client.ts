import fetch from "cross-fetch";
import { env } from "../config/env";
import { ChatMessage } from "./types";
import { tools } from "./tools";

export type LlmConfig = {
    apiUrl?: string;
    apiKey?: string;
    model?: string;
    provider?: string;
};

const resolveLlmConfig = (config: LlmConfig = {}) => ({
    apiUrl: config.apiUrl || env.glmApiUrl,
    apiKey: config.apiKey || env.glmApiKey,
    model: config.model || env.glmModel,
    provider: config.provider || "builtin",
});

export async function callGLM(messages: ChatMessage[], config: LlmConfig = {}): Promise<any> {
    const llm = resolveLlmConfig(config);
    if (!llm.apiKey) {
        throw new Error("缺少 LLM API Key，请在后端 .env 配置 GLM_API_KEY，或在 App 的自定义 LLM 模式中填写 API Key");
    }

    const msgSummary = messages
        .map((m) => `${m.role}(${m.content?.length || 0}${m.tool_calls ? "+tools" : ""}${m.tool_call_id ? "+tool_id" : ""})`)
        .join(", ");
    console.log(`[LLM:${llm.provider}] 发送请求，model=${llm.model}, 消息: [${msgSummary}]`);

    const response = await fetch(llm.apiUrl, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${llm.apiKey}`,
        },
        body: JSON.stringify({
            model: llm.model,
            messages,
            tools,
            tool_choice: "auto",
            temperature: 0.7,
            max_tokens: 2048,
        }),
    });

    if (!response.ok) {
        const errorText = await response.text();
        console.error("[LLM API Error]", response.status, errorText);
        throw new Error(`LLM API 调用失败: ${response.status} - ${errorText.substring(0, 200)}`);
    }

    const data = await response.json();
    const choice = data.choices?.[0];
    if (choice) {
        console.log(`[LLM:${llm.provider}] 响应: finish_reason=${choice.finish_reason}, has_tool_calls=${!!choice.message?.tool_calls}, content_length=${choice.message?.content?.length || 0}`);
    }
    return data;
}

type StreamCallbacks = {
    onContent?: (delta: string) => void;
};

const decodeSseLines = (chunk: string, onLine: (line: string) => void) => {
    for (const line of chunk.split(/\r?\n/)) {
        if (!line.startsWith("data:")) continue;
        onLine(line.slice(5).trim());
    }
};

const mergeToolCallDelta = (toolCalls: any[], deltaToolCalls: any[]) => {
    for (const delta of deltaToolCalls) {
        const index = delta.index ?? toolCalls.length;
        const existing = toolCalls[index] || {
            id: "",
            type: "function",
            function: { name: "", arguments: "" },
        };
        if (delta.id) existing.id = delta.id;
        if (delta.type) existing.type = delta.type;
        if (delta.function?.name) existing.function.name += delta.function.name;
        if (delta.function?.arguments) existing.function.arguments += delta.function.arguments;
        toolCalls[index] = existing;
    }
};

export async function callGLMStream(
    messages: ChatMessage[],
    callbacks: StreamCallbacks = {},
    config: LlmConfig = {},
): Promise<any> {
    const llm = resolveLlmConfig(config);
    if (!llm.apiKey) {
        throw new Error("缺少 LLM API Key，请在后端 .env 配置 GLM_API_KEY，或在 App 的自定义 LLM 模式中填写 API Key");
    }

    const response = await fetch(llm.apiUrl, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${llm.apiKey}`,
        },
        body: JSON.stringify({
            model: llm.model,
            messages,
            tools,
            tool_choice: "auto",
            temperature: 0.7,
            max_tokens: 2048,
            stream: true,
        }),
    });

    if (!response.ok) {
        const errorText = await response.text();
        console.error("[LLM Stream API Error]", response.status, errorText);
        throw new Error(`LLM API 流式调用失败: ${response.status} - ${errorText.substring(0, 200)}`);
    }

    const message = { role: "assistant", content: "", tool_calls: [] as any[] };
    let finishReason = "";
    let buffer = "";
    const decoder = new TextDecoder();
    const body: any = response.body;

    const handlePayload = (payload: string) => {
        if (!payload || payload === "[DONE]") return;
        const data = JSON.parse(payload);
        const choice = data.choices?.[0];
        const delta = choice?.delta || {};
        finishReason = choice?.finish_reason || finishReason;

        if (delta.content) {
            message.content += delta.content;
            callbacks.onContent?.(delta.content);
        }
        if (Array.isArray(delta.tool_calls)) {
            mergeToolCallDelta(message.tool_calls, delta.tool_calls);
        }
    };

    if (body?.getReader) {
        const reader = body.getReader();
        while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            const parts = buffer.split(/\n\n/);
            buffer = parts.pop() || "";
            for (const part of parts) {
                decodeSseLines(part, handlePayload);
            }
        }
        if (buffer) decodeSseLines(buffer, handlePayload);
    } else {
        const text = await response.text();
        decodeSseLines(text, handlePayload);
    }

    message.tool_calls = message.tool_calls.filter((toolCall) => toolCall?.function?.name);
    return {
        choices: [{
            finish_reason: finishReason,
            message: {
                ...message,
                tool_calls: message.tool_calls.length ? message.tool_calls : undefined,
            },
        }],
    };
}
