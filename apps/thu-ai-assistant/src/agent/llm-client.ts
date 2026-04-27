import fetch from "cross-fetch";
import { env } from "../config/env";
import { ChatMessage } from "./types";
import { tools } from "./tools";

export async function callGLM(messages: ChatMessage[]): Promise<any> {
    if (!env.glmApiKey) {
        throw new Error("缺少 GLM_API_KEY 环境变量，请参考 apps/thu-ai-assistant/.env.example 配置");
    }

    const msgSummary = messages
        .map((m) => `${m.role}(${m.content?.length || 0}${m.tool_calls ? "+tools" : ""}${m.tool_call_id ? "+tool_id" : ""})`)
        .join(", ");
    console.log(`[GLM] 发送请求，消息: [${msgSummary}]`);

    const response = await fetch(env.glmApiUrl, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${env.glmApiKey}`,
        },
        body: JSON.stringify({
            model: env.glmModel,
            messages,
            tools,
            tool_choice: "auto",
            temperature: 0.7,
            max_tokens: 2048,
        }),
    });

    if (!response.ok) {
        const errorText = await response.text();
        console.error("[GLM API Error]", response.status, errorText);
        throw new Error(`GLM API 调用失败: ${response.status} - ${errorText.substring(0, 200)}`);
    }

    const data = await response.json();
    const choice = data.choices?.[0];
    if (choice) {
        console.log(`[GLM] 响应: finish_reason=${choice.finish_reason}, has_tool_calls=${!!choice.message?.tool_calls}, content_length=${choice.message?.content?.length || 0}`);
    }
    return data;
}
