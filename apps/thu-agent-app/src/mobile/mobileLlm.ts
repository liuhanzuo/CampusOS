import {ChatMessage, LlmSettings} from "./agentTypes";
import {mobileTools} from "./mobileTools";

type StreamCallbacks = {
	onContent?: (delta: string) => void;
};

const mergeToolCallDelta = (toolCalls: any[], deltaToolCalls: any[]) => {
	for (const delta of deltaToolCalls) {
		const index = delta.index ?? toolCalls.length;
		const existing = toolCalls[index] || {
			id: "",
			type: "function",
			function: {name: "", arguments: ""},
		};
		if (delta.id) existing.id = delta.id;
		if (delta.type) existing.type = delta.type;
		if (delta.function?.name) existing.function.name += delta.function.name;
		if (delta.function?.arguments) existing.function.arguments += delta.function.arguments;
		toolCalls[index] = existing;
	}
};

export const callMobileLlmStream = (
	settings: LlmSettings,
	messages: ChatMessage[],
	callbacks: StreamCallbacks = {},
) =>
	new Promise<any>((resolve, reject) => {
		if (settings.mode !== "custom") {
			reject(new Error("手机直连模式需要在“我的”页面配置自定义 LLM API Key"));
			return;
		}
		if (!settings.apiUrl || !settings.apiKey || !settings.model) {
			reject(new Error("自定义 LLM 配置不完整，请填写 API URL、API Key 和模型名"));
			return;
		}

		const xhr = new XMLHttpRequest();
		let cursor = 0;
		let buffer = "";
		const message = {role: "assistant", content: "", tool_calls: [] as any[]};
		let finishReason = "";
		let settled = false;

		const finish = (error?: Error) => {
			if (settled) return;
			settled = true;
			if (error) reject(error);
			else {
				message.tool_calls = message.tool_calls.filter((toolCall) => toolCall?.function?.name);
				resolve({
					choices: [{
						finish_reason: finishReason,
						message: {
							...message,
							tool_calls: message.tool_calls.length ? message.tool_calls : undefined,
						},
					}],
				});
			}
		};

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

		const handleBlock = (block: string) => {
			for (const line of block.split(/\r?\n/)) {
				if (!line.startsWith("data:")) continue;
				handlePayload(line.slice(5).trim());
			}
		};

		xhr.onreadystatechange = () => {
			if (xhr.readyState === xhr.LOADING || xhr.readyState === xhr.DONE) {
				const chunk = xhr.responseText.slice(cursor);
				cursor = xhr.responseText.length;
				buffer += chunk;
				const blocks = buffer.split(/\n\n/);
				buffer = blocks.pop() || "";
				for (const block of blocks) handleBlock(block);
			}
			if (xhr.readyState === xhr.DONE && !settled) {
				if (xhr.status < 200 || xhr.status >= 300) {
					finish(new Error(`LLM API 调用失败：HTTP ${xhr.status} ${xhr.responseText.slice(0, 160)}`));
					return;
				}
				if (buffer.trim()) handleBlock(buffer);
				finish();
			}
		};
		xhr.onerror = () => finish(new Error("无法连接 LLM API，请检查 API URL 和网络"));
		xhr.ontimeout = () => finish(new Error("LLM API 请求超时"));
		xhr.open("POST", settings.apiUrl.replace(/\/+$/, ""));
		xhr.setRequestHeader("Content-Type", "application/json");
		xhr.setRequestHeader("Accept", "text/event-stream");
		xhr.setRequestHeader("Authorization", `Bearer ${settings.apiKey}`);
		xhr.timeout = 120000;
		xhr.send(JSON.stringify({
			model: settings.model,
			messages,
			tools: mobileTools.map((tool) => tool.definition),
			tool_choice: "auto",
			temperature: 0.7,
			max_tokens: 2048,
			stream: true,
		}));
	});
