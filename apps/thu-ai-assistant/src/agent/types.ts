export interface ChatMessage {
    role: "system" | "user" | "assistant" | "tool";
    content: string;
    tool_calls?: any[];
    tool_call_id?: string;
}

export interface ChatResult {
    reply: string;
    updatedMessages: ChatMessage[];
}
