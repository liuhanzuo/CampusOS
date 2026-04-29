export interface ChatMessage {
    role: "system" | "user" | "assistant" | "tool";
    content: string;
    tool_calls?: any[];
    tool_call_id?: string;
}

export interface ChatAction {
    type: "payment_qr" | "open_url" | "sports_captcha";
    label: string;
    url?: string;
    panel?: "current";
}

export interface ChatResult {
    reply: string;
    updatedMessages: ChatMessage[];
    toolResults?: Array<{
        name: string;
        args: Record<string, unknown>;
        result: Record<string, unknown>;
    }>;
    actions?: ChatAction[];
}
