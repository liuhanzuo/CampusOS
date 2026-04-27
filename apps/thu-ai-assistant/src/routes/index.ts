import type { Express } from "express";
import { authRouter } from "./auth.routes";
import { cardRouter } from "./card.routes";
import { chatRouter } from "./chat.routes";
import { sportsRouter } from "./sports.routes";

export function registerRoutes(app: Express): void {
    app.use(authRouter);
    app.use(chatRouter);
    app.use(cardRouter);
    app.use(sportsRouter);
}
