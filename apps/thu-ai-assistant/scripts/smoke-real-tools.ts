import "dotenv/config";
import fs from "fs";
import path from "path";

if (typeof (globalThis as any).window === "undefined") {
    (globalThis as any).window = globalThis;
}

type ExpectedStatus = string;

interface ToolCase {
    capability: string;
    tool: string;
    args?: Record<string, unknown>;
    expected?: ExpectedStatus[];
    risk: "read" | "prepare" | "skip";
    note?: string;
}

interface ToolProbeResult {
    capability: string;
    tool: string;
    risk: ToolCase["risk"];
    status: "pass" | "fail" | "skip";
    resultStatus?: string;
    elapsedMs?: number;
    error?: string | null;
    note?: string;
}

const userId = process.env.THU_USER_ID;
const password = process.env.THU_PASSWORD;
const sessionId = `real-tools-${Date.now()}`;
const failOnFailure = process.env.REAL_TOOLS_FAIL_ON_FAILURE === "1";
const today = new Date();
const tomorrow = new Date(today.getTime() + 24 * 60 * 60 * 1000);
const formatDate = (date: Date) => date.toISOString().slice(0, 10);
const formatCompactDate = (date: Date) => formatDate(date).replace(/-/g, "");

const cases: ToolCase[] = [
    { capability: "能力目录", tool: "list_capabilities", risk: "read" },
    { capability: "课程表", tool: "get_schedule", risk: "read" },
    { capability: "成绩单", tool: "get_report", risk: "read" },
    { capability: "教学日历", tool: "get_calendar", risk: "read" },
    { capability: "教学日历图片", tool: "get_school_calendar_image", args: { year: 2025, semester: "autumn", lang: "zh" }, risk: "read" },
    { capability: "教室列表", tool: "get_classroom", risk: "read" },
    { capability: "体测成绩", tool: "get_physical_exam", risk: "read" },
    { capability: "评教列表", tool: "get_teaching_assessment_list", risk: "read" },
    { capability: "选课学期", tool: "get_course_registration_info", risk: "read", note: "只查询可用学期，不提交选退课。" },
    { capability: "选课搜索", tool: "search_course_registration_courses", args: { semester_id: "2025-2026-1", name: "人工智能", page: 1 }, risk: "read", note: "TODO 已记录该真实链路可能失败。" },
    { capability: "培养方案", tool: "get_degree_program_info", args: { full: false }, risk: "read" },
    { capability: "校园卡余额", tool: "get_card_info", risk: "read" },
    { capability: "校园卡交易", tool: "get_campus_card_transactions", args: { type: -1 }, risk: "read" },
    { capability: "校园卡充值", tool: "recharge_campus_card", risk: "skip", note: "会创建真实支付链路，标准真实测试不直接执行。" },
    { capability: "电费余额", tool: "get_electricity", risk: "read" },
    { capability: "电费记录", tool: "get_electricity_records", risk: "read" },
    { capability: "电费充值准备", tool: "prepare_electricity_recharge", args: { amount: 1 }, expected: ["awaiting_confirmation"], risk: "prepare" },
    { capability: "宿舍卫生成绩", tool: "get_dorm_score", risk: "read" },
    { capability: "宿舍密码重置准备", tool: "prepare_reset_dorm_password", args: { new_password: "TestOnly123456" }, expected: ["unsupported_or_pending"], risk: "prepare" },
    { capability: "体育场馆列表", tool: "get_available_sports_venues", risk: "read" },
    { capability: "体育余量", tool: "get_sports_resources", args: { sport_name: "羽毛球", date: formatDate(tomorrow) }, risk: "read" },
    { capability: "体育预约记录", tool: "get_sports_booking_records", risk: "read" },
    { capability: "体育预约准备", tool: "prepare_sports_booking", args: { venue_name: "羽毛球", date: formatDate(tomorrow), time_slot: "19:00-20:00" }, expected: ["awaiting_confirmation"], risk: "prepare" },
    { capability: "体育取消准备", tool: "cancel_sports_booking", args: { booking_id: "test-only" }, expected: ["unsupported_or_pending"], risk: "prepare" },
    { capability: "打开体育预约页", tool: "open_sports_booking_page", risk: "skip", note: "会启动 Selenium / 打开真实预约页面，单独人工验证。" },
    { capability: "图书馆列表", tool: "get_library", risk: "read" },
    { capability: "图书馆楼层", tool: "get_library_floors", args: { library: "北馆" }, risk: "read" },
    { capability: "图书馆区域", tool: "get_library_sections", risk: "read", note: "脚本会先查询真实楼层，再用第一个楼层继续测试。" },
    { capability: "图书馆座位", tool: "get_library_seats", risk: "read", note: "脚本会先查询真实楼层和区域，再用第一个区域继续测试。" },
    { capability: "图书馆座位预约记录", tool: "get_library_booking_records", risk: "read" },
    { capability: "研读间类型", tool: "get_library_room_resources", expected: ["need_more_parameters"], risk: "read" },
    { capability: "研读间预约记录", tool: "get_library_room_booking_records", risk: "read" },
    { capability: "图书馆取消准备", tool: "cancel_library_booking", args: { booking_id: "test-only", booking_type: "seat" }, expected: ["unsupported_or_pending"], risk: "prepare" },
    { capability: "新闻列表", tool: "get_news", risk: "read" },
    { capability: "新闻搜索", tool: "get_news", args: { keyword: "奖学金" }, risk: "read" },
    { capability: "新闻订阅", tool: "get_news_subscriptions", risk: "read" },
    { capability: "新闻收藏", tool: "get_news_favorites", args: { page: 1 }, risk: "read" },
    { capability: "银行代发", tool: "get_bank_payment", risk: "read" },
    { capability: "研究生收入", tool: "get_graduate_income", risk: "read" },
    { capability: "电子发票", tool: "get_invoice_list", args: { page: 1 }, risk: "read" },
    { capability: "校园网余额", tool: "get_network_info", risk: "read" },
    { capability: "在线设备", tool: "get_online_devices", risk: "read" },
    { capability: "校园网设备操作准备", tool: "prepare_network_device_action", args: { action: "logout", device_id: "test-only" }, expected: ["unsupported_or_pending"], risk: "prepare" },
    { capability: "教参搜索", tool: "search_reserves_library", args: { keyword: "高等数学", page: 1 }, risk: "read", note: "TODO 已记录该真实链路可能失败。" },
    { capability: "第三方生活服务", tool: "get_life_service_status", args: { service: "washer" }, expected: ["unsupported_or_pending"], risk: "read" },
];

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const summarizeError = (value: unknown) => {
    const text = String(value || "");
    return text.length > 260 ? `${text.slice(0, 260)}...` : text;
};

const firstItem = (items: unknown) => Array.isArray(items) && items.length > 0 ? items[0] : undefined;

const resolveArgs = async (
    executeTool: (helper: any, toolName: string, args?: any, sessionId?: string) => Promise<string>,
    helper: any,
    toolCase: ToolCase,
) => {
    if (toolCase.args) return toolCase.args;
    if (!["get_library_sections", "get_library_seats"].includes(toolCase.tool)) return {};

    const floorsResult = JSON.parse(await executeTool(helper, "get_library_floors", { library: "北馆" }, sessionId));
    const floor = firstItem(floorsResult?.data?.floors);
    if (!floor) return {};

    if (toolCase.tool === "get_library_sections") {
        return { library: floorsResult.data.library.id, floor: floor.id };
    }

    const sectionsResult = JSON.parse(await executeTool(
        helper,
        "get_library_sections",
        { library: floorsResult.data.library.id, floor: floor.id },
        sessionId,
    ));
    const section = firstItem(sectionsResult?.data?.sections);
    if (!section) return { library: floorsResult.data.library.id, floor: floor.id };

    return { library: floorsResult.data.library.id, floor: floor.id, section: section.id };
};

const login = async () => {
    if (!userId || !password) {
        throw new Error("缺少 THU_USER_ID 或 THU_PASSWORD，无法做真实工具测试。");
    }

    const { sessionManager } = await import("../src/session/session-manager");
    const loginPromise = sessionManager.startLogin(sessionId, userId, password);
    const startedAt = Date.now();
    while (Date.now() - startedAt < 45000) {
        const twoFactor = sessionManager.getTwoFactorStatus(sessionId);
        if (twoFactor) {
            return { status: "two_factor" as const, twoFactor };
        }
        const loginError = sessionManager.getLoginError(sessionId);
        if (loginError) {
            throw new Error(loginError);
        }
        if (sessionManager.isLoggedIn(sessionId)) {
            await loginPromise;
            return { status: "success" as const };
        }
        await sleep(500);
    }
    throw new Error("真实登录超时");
};

const runCase = async (toolCase: ToolCase): Promise<ToolProbeResult> => {
    if (toolCase.risk === "skip") {
        return {
            capability: toolCase.capability,
            tool: toolCase.tool,
            risk: toolCase.risk,
            status: "skip",
            note: toolCase.note,
        };
    }

    const { sessionManager } = await import("../src/session/session-manager");
    const { executeTool } = await import("../src/agent/tools");
    const helper = sessionManager.getHelper(sessionId);
    if (!helper) {
        throw new Error("登录状态丢失，无法执行工具。");
    }

    const startedAt = Date.now();
    try {
        const args = await resolveArgs(executeTool, helper, toolCase);
        const raw = await executeTool(helper, toolCase.tool, args, sessionId);
        const parsed = JSON.parse(raw);
        const expected = toolCase.expected || ["ok"];
        const expectedNonOk = expected.some((status) => status !== "ok");
        const passed = expected.includes(parsed.status) && (parsed.success === true || expectedNonOk);
        return {
            capability: toolCase.capability,
            tool: toolCase.tool,
            risk: toolCase.risk,
            status: passed ? "pass" : "fail",
            resultStatus: parsed.status,
            elapsedMs: Date.now() - startedAt,
            error: parsed.error || (passed ? null : parsed.message || "工具返回 success/status 不符合预期"),
            note: toolCase.note,
        };
    } catch (error: any) {
        return {
            capability: toolCase.capability,
            tool: toolCase.tool,
            risk: toolCase.risk,
            status: "fail",
            elapsedMs: Date.now() - startedAt,
            error: summarizeError(error.message || error),
            note: toolCase.note,
        };
    }
};

const renderReport = (results: ToolProbeResult[]) => {
    const now = new Date().toISOString();
    const counts = {
        pass: results.filter((item) => item.status === "pass").length,
        fail: results.filter((item) => item.status === "fail").length,
        skip: results.filter((item) => item.status === "skip").length,
    };
    const rows = results.map((item) => [
        item.status === "pass" ? "PASS" : item.status === "skip" ? "SKIP" : "FAIL",
        item.capability,
        item.tool,
        item.risk,
        item.resultStatus || "",
        item.elapsedMs === undefined ? "" : String(item.elapsedMs),
        (item.error || item.note || "").replace(/\|/g, "\\|").replace(/\n/g, " "),
    ]);

    return [
        "# Real Agent Function Test Report",
        "",
        `Generated: ${now}`,
        "",
        "This report is generated by `npm run smoke:real-tools`. It records tool-level availability only and intentionally omits returned personal data.",
        "",
        `Summary: PASS ${counts.pass}, FAIL ${counts.fail}, SKIP ${counts.skip}.`,
        "",
        "| Result | Capability | Tool | Risk | Tool Status | ms | Note / Error |",
        "| --- | --- | --- | --- | --- | ---: | --- |",
        ...rows.map((row) => `| ${row.join(" | ")} |`),
        "",
    ].join("\n");
};

async function main() {
    const loginResult = await login();
    if (loginResult.status === "two_factor") {
        console.log("[real-tools] 真实登录需要 2FA，已停在可验证状态。请先完成一次信任设备后重跑。");
        return;
    }

    const results: ToolProbeResult[] = [];
    for (const toolCase of cases) {
        const result = await runCase(toolCase);
        results.push(result);
        const label = result.status.toUpperCase().padEnd(4);
        const detail = result.status === "fail"
            ? ` ${result.resultStatus || ""} ${result.error || ""}`
            : result.resultStatus ? ` ${result.resultStatus}` : "";
        console.log(`[real-tools] ${label} ${result.capability} / ${result.tool}${detail}`);
    }

    const report = renderReport(results);
    const reportPath = path.join(process.cwd(), "docs", "REAL_FUNCTION_TEST_REPORT.md");
    fs.writeFileSync(reportPath, report, "utf8");
    console.log(`[real-tools] report written: ${reportPath}`);

    const failed = results.filter((item) => item.status === "fail");
    if (failed.length > 0 && failOnFailure) {
        throw new Error(`${failed.length} 个真实工具测试失败。`);
    }
}

const logout = async () => {
    const { sessionManager } = await import("../src/session/session-manager");
    await sessionManager.logout(sessionId);
};

main().then(async () => {
    await logout();
    process.exit(0);
}).catch(async (error) => {
    console.error(`[real-tools] failed: ${error.message || error}`);
    await logout();
    process.exit(1);
});
