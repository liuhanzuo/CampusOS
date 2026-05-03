import {InfoHelper} from "@thu-info/lib";
import {ChatAction, ChatMessage, LlmSettings, MobileAgentEvent, ToolResult} from "./agentTypes";
import {callMobileLlmStream} from "./mobileLlm";
import {buildMobileSystemPrompt} from "./mobilePrompt";
import {executeMobileTool} from "./mobileTools";

const extractToolActions = (result: Record<string, unknown>): ChatAction[] => {
	const actions = Array.isArray(result.actions) ? result.actions : [];
	return actions.filter((action: any) => action?.type);
};

export const chatWithMobileAgent = async (
	helper: InfoHelper,
	llmSettings: LlmSettings,
	messages: ChatMessage[],
	emit: (event: MobileAgentEvent) => void,
) => {
	const fullMessages: ChatMessage[] = [
		{role: "system", content: buildMobileSystemPrompt()},
		...messages,
	];
	const toolResults: ToolResult[] = [];
	const actions: ChatAction[] = [];
	const actionKeys = new Set<string>();
	let finalReply = "";

	for (let iteration = 0; iteration < 6; iteration += 1) {
		emit({type: "status", message: iteration === 0 ? "手机端 Agent 正在思考..." : "正在整理手机端工具结果..."});
		const response = await callMobileLlmStream(llmSettings, fullMessages, {
			onContent: (delta) => {
				finalReply += delta;
				emit({type: "delta", text: delta});
			},
		});
		const assistantMessage = response.choices?.[0]?.message || {};
		const toolCalls = assistantMessage.tool_calls || [];

		if (!toolCalls.length) {
			const reply = finalReply || assistantMessage.content || "抱歉，我暂时无法回答这个问题。";
			const updatedMessages = [...messages, {role: "assistant" as const, content: reply}];
			emit({type: "done", reply, updatedMessages, toolResults, actions});
			return {reply, updatedMessages, toolResults, actions};
		}

		finalReply = "";
		fullMessages.push({
			role: "assistant",
			content: assistantMessage.content || "",
			tool_calls: toolCalls,
		});

		for (const toolCall of toolCalls) {
			const args = typeof toolCall.function?.arguments === "string"
				? JSON.parse(toolCall.function.arguments || "{}")
				: toolCall.function?.arguments || {};
			const name = toolCall.function?.name;
			emit({type: "status", message: `手机端调用工具：${name}`});
			const result = await executeMobileTool(helper, name, args);
			for (const action of extractToolActions(result)) {
				const key = JSON.stringify(action);
				if (!actionKeys.has(key)) {
					actionKeys.add(key);
					actions.push(action);
				}
			}
			toolResults.push({name, args, result});
			emit({type: "tool_result", name, args, result});
			fullMessages.push({
				role: "tool",
				content: JSON.stringify(result),
				tool_call_id: toolCall.id,
			});
		}
	}

	throw new Error("工具调用轮次过多，请缩小任务范围后重试");
};
