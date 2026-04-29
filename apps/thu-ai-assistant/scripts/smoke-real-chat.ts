import "dotenv/config";
import { spawn } from "child_process";

const port = Number(process.env.SMOKE_PORT || 3133);
const baseUrl = `http://127.0.0.1:${port}`;
const userId = process.env.THU_USER_ID;
const password = process.env.THU_PASSWORD;
const messages = (process.env.SMOKE_MESSAGES || "你能做什么？||查一下我的体测成绩")
    .split("||")
    .map((message) => message.trim())
    .filter(Boolean);
const expectedReplies = (process.env.SMOKE_EXPECT || "")
    .split("||")
    .map((message) => message.trim());
const expectedTools = (process.env.SMOKE_EXPECT_TOOLS || "")
    .split("||")
    .map((message) => message.trim());
const expectedActions = (process.env.SMOKE_EXPECT_ACTIONS || "")
    .split("||")
    .map((message) => message.trim());

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const waitForHealth = async (timeoutMs = 30000) => {
    const startedAt = Date.now();
    while (Date.now() - startedAt < timeoutMs) {
        try {
            const response = await fetch(`${baseUrl}/api/health`);
            if (response.ok) return;
        } catch {
            // Server is still starting.
        }
        await sleep(500);
    }
    throw new Error(`服务在 ${timeoutMs}ms 内没有启动成功: ${baseUrl}`);
};

const assertServerAlive = (server: ReturnType<typeof spawn> | undefined) => {
    if (!server || server.exitCode !== null) {
        throw new Error(`服务进程已退出，exitCode=${server?.exitCode}`);
    }
};

const collectCookie = (response: Response, oldCookie = "") => {
    const raw = response.headers.get("set-cookie");
    if (!raw) return oldCookie;
    const nextCookie = raw.split(",")
        .map((item) => item.split(";")[0].trim())
        .filter(Boolean)
        .join("; ");
    return [oldCookie, nextCookie].filter(Boolean).join("; ");
};

const postJson = async (path: string, body: unknown, cookie = "") => {
    let response: Response;
    try {
        response = await fetch(`${baseUrl}${path}`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                ...(cookie ? { Cookie: cookie } : {}),
            },
            body: JSON.stringify(body),
        });
    } catch (error: any) {
        throw new Error(`请求 ${path} 失败: ${error.message || error}`);
    }
    const text = await response.text();
    let parsed: any;
    try {
        parsed = JSON.parse(text);
    } catch {
        parsed = { raw: text };
    }
    return { response, body: parsed };
};

const isTransientLoginError = (status: any) => {
    const error = String(status?.error || status?.message || "");
    return /fetch failed|socket|ECONNRESET|ETIMEDOUT|TLS|network|503|502/i.test(error);
};

const waitForLogin = async (cookie: string) => {
    for (let i = 0; i < 20; i++) {
        await sleep(1000);
        const statusResponse = await fetch(`${baseUrl}/api/login/status`, {
            headers: cookie ? { Cookie: cookie } : undefined,
        });
        cookie = collectCookie(statusResponse, cookie);
        const statusBody: any = await statusResponse.json();
        console.log(`[smoke] login status ${i + 1}: ${summarize(statusBody, 500)}`);
        if (statusBody.status === "success") return { cookie, status: statusBody };
        if (statusBody.status === "two_factor") return { cookie, status: statusBody };
        if (statusBody.status === "error") return { cookie, status: statusBody };
    }
    throw new Error("登录状态轮询超时");
};

const loginWithRetry = async () => {
    const maxAttempts = Number(process.env.SMOKE_LOGIN_ATTEMPTS || 3);
    let lastStatus: any;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        const loginResult = await postJson("/api/login", { userId, password });
        let cookie = collectCookie(loginResult.response);
        console.log(`[smoke] login response ${attempt}/${maxAttempts}: ${summarize(loginResult.body, 500)}`);

        let loginStatus = loginResult.body;
        if (loginStatus.status === "pending") {
            const waited = await waitForLogin(cookie);
            cookie = waited.cookie;
            loginStatus = waited.status;
        }

        if (loginStatus.status === "success" || loginStatus.status === "two_factor") {
            return { cookie, status: loginStatus };
        }

        lastStatus = loginStatus;
        if (!isTransientLoginError(loginStatus) || attempt === maxAttempts) {
            break;
        }

        console.log("[smoke] 登录链路疑似临时网络错误，准备重试。");
        await sleep(1500 * attempt);
    }

    throw new Error(lastStatus?.error || `登录未成功: ${summarize(lastStatus)}`);
};

const summarize = (value: unknown, limit = 900) => {
    const text = typeof value === "string"
        ? value
        : JSON.stringify(value, null, 2);
    return text.length > limit ? `${text.slice(0, limit)}...` : text;
};

async function main() {
    if (!userId || !password) {
        throw new Error("缺少 THU_USER_ID 或 THU_PASSWORD，无法做真实登录冒烟测试。");
    }

    let server: ReturnType<typeof spawn> | undefined;
    try {
        server = spawn(
            process.execPath,
            ["-r", "ts-node/register", "src/server.ts"],
            {
                cwd: process.cwd(),
                env: {
                    ...process.env,
                    PORT: String(port),
                    // Keep smoke output readable; credentials remain in env only.
                    NODE_ENV: "test",
                },
                stdio: ["ignore", "pipe", "pipe"],
            },
        );

        server.stdout?.on("data", (chunk) => {
            const text = String(chunk);
            if (/清华AI助手已启动|访问地址|支持的功能/.test(text)) {
                process.stdout.write(text);
            }
        });
        server.stderr?.on("data", (chunk) => process.stderr.write(String(chunk)));

        server.on("exit", (code) => {
            if (code !== null && code !== 0) {
                console.error(`[smoke] server exited early: ${code}`);
            }
        });

        await sleep(300);
        assertServerAlive(server);
        await waitForHealth();
        assertServerAlive(server);
        console.log(`[smoke] health ok: ${baseUrl}`);

        const loginResult = await loginWithRetry();
        let cookie = loginResult.cookie;

        if (loginResult.status.status === "two_factor") {
            console.log("[smoke] 真实登录需要 2FA，本脚本已停在可验证状态。请先在 Web 前端完成一次信任设备，再重跑 smoke。");
            return;
        }

        const capabilities = await fetch(`${baseUrl}/api/capabilities?include_planned=false`, {
            headers: cookie ? { Cookie: cookie } : undefined,
        }).then((response) => response.json() as Promise<any>);
        console.log(`[smoke] capabilities count: ${capabilities.count}`);

        for (const [index, message] of messages.entries()) {
            console.log(`[smoke] user: ${message}`);
            const chatResult = await postJson("/api/chat", { message }, cookie);
            cookie = collectCookie(chatResult.response, cookie);
            console.log(`[smoke] assistant/status: ${chatResult.response.status}`);
            console.log(`[smoke] assistant/body: ${summarize(chatResult.body, 1200)}`);
            if (!chatResult.response.ok) {
                throw new Error(`chat failed for "${message}"`);
            }
            const toolNames = Array.isArray(chatResult.body.toolResults)
                ? chatResult.body.toolResults.map((item: any) => item.name).filter(Boolean)
                : [];
            const actionTypes = Array.isArray(chatResult.body.actions)
                ? chatResult.body.actions.map((item: any) => item.type).filter(Boolean)
                : [];
            if (toolNames.length) {
                console.log(`[smoke] tools: ${toolNames.join(", ")}`);
            }
            if (actionTypes.length) {
                console.log(`[smoke] actions: ${actionTypes.join(", ")}`);
            }
            const expected = expectedReplies[index];
            if (expected && !String(chatResult.body.reply || "").includes(expected)) {
                throw new Error(`chat reply for "${message}" did not include expected text: ${expected}`);
            }
            const expectedTool = expectedTools[index];
            if (expectedTool && !toolNames.includes(expectedTool)) {
                throw new Error(`chat for "${message}" did not call expected tool: ${expectedTool}. actual=${toolNames.join(",")}`);
            }
            const expectedAction = expectedActions[index];
            if (expectedAction && !actionTypes.includes(expectedAction)) {
                throw new Error(`chat for "${message}" did not return expected action: ${expectedAction}. actual=${actionTypes.join(",")}`);
            }
        }
    } finally {
        if (server && !server.killed) {
            server.kill("SIGTERM");
        }
    }
}

main().catch((error) => {
    console.error(`[smoke] failed: ${error.message || error}`);
    process.exit(1);
});
