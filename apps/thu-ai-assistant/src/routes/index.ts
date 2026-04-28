import type { Express } from "express";
import { authRouter } from "./auth.routes";
import { capabilitiesRouter } from "./capabilities.routes";
import { cardRouter } from "./card.routes";
import { chatRouter } from "./chat.routes";
import { sportsRouter } from "./sports.routes";
import { env } from "../config/env";

export function registerRoutes(app: Express): void {
    app.get("/api/health", (_req, res) => {
        res.json({
            status: "ok",
            service: "thu-ai-assistant",
            now: new Date().toISOString(),
            uptimeSeconds: Math.floor(process.uptime()),
            port: Number(env.port),
            llm: {
                model: env.glmModel,
                configured: Boolean(env.glmApiKey),
            },
        });
    });

    app.use(authRouter);
    app.use(capabilitiesRouter);
    app.use(chatRouter);
    app.use(cardRouter);
    app.use(sportsRouter);
}
