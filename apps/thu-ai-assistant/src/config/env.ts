export const env = {
    port: process.env.PORT || "3000",
    glmApiUrl: process.env.GLM_API_URL || "https://open.bigmodel.cn/api/paas/v4/chat/completions",
    glmApiKey: process.env.GLM_API_KEY || "",
    glmModel: process.env.GLM_MODEL || "glm-4-flash",
    sessionSecret: process.env.SESSION_SECRET || "thu-ai-assistant-secret-" + Date.now(),
};
