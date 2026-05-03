export interface ChatMessage {
	role: "system" | "user" | "assistant" | "tool";
	content: string;
	tool_calls?: any[];
	tool_call_id?: string;
}

export interface ToolResult {
	name: string;
	args: Record<string, unknown>;
	result: Record<string, unknown>;
}

export type ChatAction = {
	type: "payment_qr" | "open_url" | "sports_captcha";
	label?: string;
	url?: string;
	panel?: "current";
};

export type LlmSettings = {
	mode: "builtin" | "custom";
	provider: string;
	apiUrl: string;
	apiKey: string;
	model: string;
};

export type MobileAgentEvent =
	| { type: "status"; message: string }
	| { type: "delta"; text: string }
	| { type: "tool_result"; name: string; args: Record<string, unknown>; result: Record<string, unknown> }
	| { type: "done"; reply: string; updatedMessages: ChatMessage[]; toolResults: ToolResult[]; actions: ChatAction[] };
