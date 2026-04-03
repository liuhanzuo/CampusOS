/**
 * THU AI Assistant - Express 服务器
 * 提供登录、2FA验证、AI对话等 API
 */
import { ChatMessage } from "./ai-service";
declare const app: import("express-serve-static-core").Express;
declare module "express-session" {
    interface SessionData {
        sessionId: string;
        chatHistory: ChatMessage[];
    }
}
export default app;
//# sourceMappingURL=server.d.ts.map