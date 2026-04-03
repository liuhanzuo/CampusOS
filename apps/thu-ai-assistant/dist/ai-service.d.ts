import { InfoHelper } from "@thu-info/lib";
export interface ChatMessage {
    role: "system" | "user" | "assistant" | "tool";
    content: string;
    tool_calls?: any[];
    tool_call_id?: string;
}
/**
 * 与 GLM4-Flash 进行对话
 */
export declare function chat(helper: InfoHelper, messages: ChatMessage[]): Promise<{
    reply: string;
    updatedMessages: ChatMessage[];
}>;
//# sourceMappingURL=ai-service.d.ts.map