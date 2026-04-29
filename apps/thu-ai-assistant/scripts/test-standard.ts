import "dotenv/config";
import { spawnSync } from "child_process";

const run = (command: string, args: string[], extraEnv: Record<string, string> = {}) => {
    console.log(`\n[standard] $ ${[command, ...args].join(" ")}`);
    const result = spawnSync(command, args, {
        cwd: process.cwd(),
        env: {
            ...process.env,
            ...extraEnv,
        },
        stdio: "inherit",
    });
    if (result.status !== 0) {
        throw new Error(`命令失败: ${[command, ...args].join(" ")}`);
    }
};

const hasRealCredentials = Boolean(process.env.THU_USER_ID && process.env.THU_PASSWORD);
const skipReal = process.env.STANDARD_SKIP_REAL === "1";
const runRealChat = process.env.STANDARD_SKIP_REAL_CHAT !== "1";

async function main() {
    run("npm", ["run", "build"]);
    run("npm", ["run", "test:tools"]);

    if (skipReal) {
        console.log("\n[standard] STANDARD_SKIP_REAL=1，跳过真实账号冒烟。");
        return;
    }

    if (!hasRealCredentials) {
        throw new Error("缺少 THU_USER_ID 或 THU_PASSWORD；如只跑离线标准测试，请设置 STANDARD_SKIP_REAL=1。");
    }

    run("npm", ["run", "smoke:real-api"], {
        SMOKE_API_PORT: process.env.SMOKE_API_PORT || "3132",
    });

    if (runRealChat) {
        run("npm", ["run", "smoke:real-chat"], {
            SMOKE_PORT: process.env.SMOKE_PORT || "3133",
            SMOKE_MESSAGES: process.env.SMOKE_MESSAGES || "你能做什么？||查一下我的体测成绩",
            SMOKE_EXPECT_TOOLS: process.env.SMOKE_EXPECT_TOOLS || "list_capabilities||get_physical_exam",
        });
    } else {
        console.log("\n[standard] STANDARD_SKIP_REAL_CHAT=1，跳过真实 LLM 聊天冒烟。");
    }

    console.log("\n[standard] standard tests passed");
}

main().catch((error) => {
    console.error(`[standard] failed: ${error.message || error}`);
    process.exit(1);
});
