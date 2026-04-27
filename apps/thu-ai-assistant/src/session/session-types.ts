import { ChatMessage } from "../agent/types";

declare module "express-session" {
    interface SessionData {
        sessionId: string;
        chatHistory: ChatMessage[];
    }
}

export {};
