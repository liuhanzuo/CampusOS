import "dotenv/config";
import assert from "assert";
import { spawn } from "child_process";

const port = Number(process.env.SMOKE_API_PORT || process.env.SMOKE_PORT || 3132);
const baseUrl = `http://127.0.0.1:${port}`;
const userId = process.env.THU_USER_ID;
const password = process.env.THU_PASSWORD;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const summarize = (value: unknown, limit = 700) => {
    const text = typeof value === "string" ? value : JSON.stringify(value, null, 2);
    return text.length > limit ? `${text.slice(0, limit)}...` : text;
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

const requestJson = async (
    path: string,
    init: RequestInit = {},
    cookie = "",
) => {
    const response = await fetch(`${baseUrl}${path}`, {
        ...init,
        headers: {
            ...(init.body ? { "Content-Type": "application/json" } : {}),
            ...(cookie ? { Cookie: cookie } : {}),
            ...(init.headers || {}),
        },
    });
    const text = await response.text();
    let body: any;
    try {
        body = JSON.parse(text);
    } catch {
        body = { raw: text };
    }
    return { response, body };
};

const postJson = (path: string, body: unknown, cookie = "") =>
    requestJson(path, { method: "POST", body: JSON.stringify(body) }, cookie);

const waitForHealth = async (timeoutMs = 30000) => {
    const startedAt = Date.now();
    while (Date.now() - startedAt < timeoutMs) {
        try {
            const health = await requestJson("/api/health");
            if (health.response.ok && health.body.status === "ok") {
                return health.body;
            }
        } catch {
            // Server is still starting.
        }
        await sleep(500);
    }
    throw new Error(`服务在 ${timeoutMs}ms 内没有启动成功: ${baseUrl}`);
};

const waitForLogin = async (cookie: string) => {
    for (let i = 0; i < 25; i++) {
        await sleep(1000);
        const status = await requestJson("/api/login/status", {}, cookie);
        cookie = collectCookie(status.response, cookie);
        console.log(`[smoke:api] login status ${i + 1}: ${summarize(status.body, 500)}`);
        if (status.body.status === "success") return { cookie, status: status.body };
        if (status.body.status === "two_factor") return { cookie, status: status.body };
        if (status.body.status === "error") {
            return { cookie, status: status.body };
        }
    }
    throw new Error("登录状态轮询超时");
};

const isTransientLoginError = (status: any) => {
    const error = String(status?.error || status?.message || "");
    return /fetch failed|socket|ECONNRESET|ETIMEDOUT|TLS|network|503|502/i.test(error);
};

const loginWithRetry = async () => {
    const maxAttempts = Number(process.env.SMOKE_LOGIN_ATTEMPTS || 3);
    let lastStatus: any;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        const login = await postJson("/api/login", { userId, password });
        let cookie = collectCookie(login.response);
        console.log(`[smoke:api] login response ${attempt}/${maxAttempts}: ${summarize(login.body, 500)}`);

        let loginStatus = login.body;
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

        console.log("[smoke:api] 登录链路疑似临时网络错误，准备重试。");
        await sleep(1500 * attempt);
    }

    throw new Error(lastStatus?.error || `登录未成功: ${summarize(lastStatus)}`);
};

async function main() {
    if (!userId || !password) {
        throw new Error("缺少 THU_USER_ID 或 THU_PASSWORD，无法做真实 API 冒烟测试。");
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
                    NODE_ENV: "test",
                },
                stdio: ["ignore", "pipe", "pipe"],
            },
        );

        server.stdout?.on("data", (chunk) => {
            const text = String(chunk);
            if (/清华AI助手已启动|访问地址/.test(text)) {
                process.stdout.write(text);
            }
        });
        server.stderr?.on("data", (chunk) => process.stderr.write(String(chunk)));

        await sleep(300);
        if (!server || server.exitCode !== null) {
            throw new Error(`服务进程已退出，exitCode=${server?.exitCode}`);
        }

        const health = await waitForHealth();
        console.log(`[smoke:api] health ok: ${summarize(health, 500)}`);

        const unauthorizedChat = await postJson("/api/chat", { message: "未登录测试" });
        assert.equal(unauthorizedChat.response.status, 401);

        const unauthorizedClear = await postJson("/api/chat/clear", {});
        assert.equal(unauthorizedClear.response.status, 401);

        const unauthorizedRecharge = await postJson("/api/card/recharge", { amount: 1 });
        assert.equal(unauthorizedRecharge.response.status, 401);

        const publicVenues = await requestJson("/api/sports/venues");
        assert.equal(publicVenues.response.status, 200);
        assert.equal(publicVenues.body.success, true);
        assert.ok(Array.isArray(publicVenues.body.data));
        assert.ok(publicVenues.body.data.length > 0);
        console.log(`[smoke:api] public sports venues: ${publicVenues.body.data.length}`);

        const { cookie, status: loginStatus } = await loginWithRetry();

        if (loginStatus.status === "two_factor") {
            console.log("[smoke:api] 真实登录需要 2FA，已完成到可验证的二次验证状态。");
            return;
        }

        assert.equal(loginStatus.status, "success");

        const statusAfterLogin = await requestJson("/api/login/status", {}, cookie);
        assert.equal(statusAfterLogin.response.status, 200);
        assert.equal(statusAfterLogin.body.status, "success");
        assert.equal(statusAfterLogin.body.userId, userId);

        const capabilities = await requestJson("/api/capabilities?include_planned=false", {}, cookie);
        assert.equal(capabilities.response.status, 200);
        assert.equal(capabilities.body.success, true);
        assert.ok(capabilities.body.count > 0);

        const emptyChat = await postJson("/api/chat", { message: "" }, cookie);
        assert.equal(emptyChat.response.status, 400);

        const invalidRecharge = await postJson("/api/card/recharge", { amount: 0 }, cookie);
        assert.equal(invalidRecharge.response.status, 400);

        const clear = await postJson("/api/chat/clear", {}, cookie);
        assert.equal(clear.response.status, 200);
        assert.equal(clear.body.status, "ok");

        const logout = await postJson("/api/logout", {}, cookie);
        assert.equal(logout.response.status, 200);
        assert.equal(logout.body.status, "ok");

        console.log("[smoke:api] real API smoke passed");
    } finally {
        if (server && !server.killed) {
            server.kill("SIGTERM");
        }
    }
}

main().catch((error) => {
    console.error(`[smoke:api] failed: ${error.message || error}`);
    process.exit(1);
});
