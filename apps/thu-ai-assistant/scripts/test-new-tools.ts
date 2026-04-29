import assert from "assert";

if (typeof (globalThis as any).window === "undefined") {
    (globalThis as any).window = globalThis;
}

const mockHelper = {
    getSchedule: async () => ({
        schedule: [{
            name: "人工智能导论",
            location: "六教6A001",
            category: "专业课",
            activeTime: {
                base: [{
                    dayOfWeek: 2,
                    beginTime: { format: (fmt: string) => fmt.includes("YYYY") ? "2026-04-28 09:50" : "09:50" },
                    endTime: { format: () => "11:25" },
                }],
            },
        }],
        calendar: {
            firstDay: "2026-02-23",
            weekCount: 16,
            semesterName: "2025-2026 春",
            semesterId: "2025-2026-2",
        },
    }),
    getReport: async () => [
        { name: "人工智能导论", credit: 3, grade: "A", point: 4, semester: "2025-2026-2" },
    ],
    loginCampusCard: async () => undefined,
    getCampusCardInfo: async () => ({
        userName: "测试用户",
        balance: 88.8,
        cardStatus: "正常",
        cardId: "card-1",
        departmentName: "测试院系",
    }),
    getEleRemainder: async () => ({ remainder: 12.3, updateTime: "2026-04-28 12:00" }),
    getNewsList: async () => [
        {
            name: "测试通知",
            date: "2026-04-28",
            source: "教务处",
            url: "https://example.edu/news/notice",
            channel: "LM_JWGG",
        },
    ],
    searchNewsList: async (_page: number, keyword: string) => [
        {
            name: `${keyword}通知`,
            date: "2026-04-28",
            source: "教务处",
            url: "https://example.edu/news/search",
            channel: "LM_JWGG",
        },
    ],
    getCalendar: async () => ({
        firstDay: "2026-02-23",
        weekCount: 16,
        semesterName: "2025-2026 春",
    }),
    getClassroomList: async () => [
        { name: "六教", searchName: "第六教学楼" },
    ],
    getClassroomState: async () => ({ building: "六教", freeRooms: ["6A001"] }),
    getSportsResources: async () => ({
        count: 2,
        phone: "010-00000000",
        statusCode: "ok",
        data: [{
            fieldName: "篮球场1",
            timeSession: "19:00-20:00",
            cost: 0,
            bookId: "",
            canNetBook: true,
            userType: "student",
        }],
    }),
    getPhysicalExamResult: async () => [
        ["身高体重", "90"],
        ["肺活量", "85"],
    ],
    getAssessmentList: async () => [
        ["人工智能导论", false, "https://example.edu/assessment/ai"],
        ["体育", true, "https://example.edu/assessment/pe"],
    ],
    getInvoiceList: async (page: number) => ({
        count: 1,
        data: [{
            uuid: 123,
            file_name: "invoice.pdf",
            inv_date: "2026-04-01",
            inv_amount: 42,
            bill_amount: 42,
            tax_amount: 0,
            inv_typeStr: "电子发票",
            cust_name: "测试用户",
            financial_dept_name: "测试部门",
            financial_item_name: "测试项目",
            payment_item_type_name: "测试类型",
            inv_code: "INV-CODE",
            inv_no: "INV-NO",
            is_allow_reimbursement: "Y",
            page,
        }],
    }),
    getCalendarYear: async () => 2025,
    getCalendarImageUrl: async (year: number, semester: string, lang: string) =>
        `https://example.edu/calendar/${year}-${semester}-${lang}.png`,
    getNewsDetail: async () => [
        "测试新闻",
        "正文".repeat(4000),
        "摘要",
    ],
    getNewsSubscriptionList: async () => [
        {
            id: "sub-1",
            title: "奖学金通知",
            keyword: "奖学金",
            channel: "LM_XSBGGG",
            order: 1,
        },
    ],
    getFavorNewsList: async (page: number) => [[
        {
            name: "收藏新闻",
            xxid: "fav-1",
            url: "https://example.edu/news/fav-1",
            date: "2026-04-01",
            source: "教务处",
            topped: false,
            channel: "LM_JWGG",
            inFav: true,
        },
    ], page],
    getLibraryList: async () => [
        {
            id: 1,
            zhName: "北馆",
            enName: "North Library",
            zhNameTrace: "北馆",
            enNameTrace: "North Library",
            valid: true,
        },
    ],
    getLibraryFloorList: async () => [
        {
            id: 11,
            zhName: "一层",
            enName: "1F",
            zhNameTrace: "北馆-一层",
            enNameTrace: "North Library-1F",
            valid: true,
        },
    ],
    getLibrarySectionList: async () => [
        {
            id: 111,
            zhName: "阅览区A",
            enName: "Area A",
            zhNameTrace: "北馆-一层-阅览区A",
            enNameTrace: "North Library-1F-Area A",
            valid: true,
            total: 20,
            available: 6,
            posX: 1,
            posY: 2,
        },
    ],
    getLibrarySeatList: async () => [
        {
            id: 11101,
            zhName: "A001",
            enName: "A001",
            zhNameTrace: "北馆-一层-阅览区A-A001",
            enNameTrace: "North Library-1F-Area A-A001",
            valid: true,
            type: 0,
            status: "available",
        },
    ],
    getReservesLibBookDetail: async () => ({
        img: "https://example.edu/book.jpg",
        title: "高等数学",
        author: "同济大学数学系",
        publisher: "高等教育出版社",
        ISBN: "9787040000000",
        version: "第七版",
        volume: "上册",
        chapters: [
            { title: "第一章 函数与极限", href: "/chapter/1" },
            { title: "第二章 导数", href: "/chapter/2" },
        ],
    }),
    searchCrCourses: async (params: any) => ({
        currPage: params.page ?? 1,
        totalPage: 1,
        totalCount: 1,
        courses: [{
            department: "计算机系",
            id: "30240243",
            seq: 1,
            name: params.name || "人工智能导论",
            credits: 3,
            teacher: "张老师",
            bksCap: 100,
            yjsCap: 20,
            time: "周二 3-4",
            note: "",
            feature: "",
            year: "2026",
            secondary: "否",
            reUseCap: "否",
            restrict: "否",
            culture: "",
            capacity: 120,
            remaining: 8,
            queue: 0,
        }],
    }),
};

async function main() {
    const { executeTool } = await import("../src/agent/tools");
    const { extractToolActions, normalizeToolResult } = await import("../src/agent/tools/tool-result");
    const { webvpnUrlToLbAuth } = await import("@thu-info/lib/src/utils/network");
    const runTool = async (name: string, args: Record<string, unknown> = {}) =>
        JSON.parse(await executeTool(mockHelper as any, name, args, "test-session"));
    const assertToolEnvelope = (result: any, expectedSuccess?: boolean) => {
        assert.equal(typeof result.success, "boolean");
        if (expectedSuccess !== undefined) assert.equal(result.success, expectedSuccess);
        assert.equal(typeof result.status, "string");
        assert.ok("data" in result);
        assert.ok("meta" in result);
        assert.ok("error" in result);
    };

    const reservesLbAuth = webvpnUrlToLbAuth(
        "https://webvpn.tsinghua.edu.cn/http/77726476706e69737468656265737421e2f2529935266d43300480aed641303c455d43259619a3eaf6eebb99/Search/ResBooks?bookName=test",
    );
    assert.ok(reservesLbAuth);
    assert.ok(reservesLbAuth.includes("host=reserves.lib.tsinghua.edu.cn"));
    assert.ok(reservesLbAuth.includes("port=80"));
    assert.ok(reservesLbAuth.includes("uri=/Search/ResBooks?bookName=test"));

    const physicalExam = await runTool("get_physical_exam");
    assertToolEnvelope(physicalExam, true);
    assert.deepEqual(physicalExam.data[0], { item: "身高体重", score: "90" });

    const assessments = await runTool("get_teaching_assessment_list");
    assertToolEnvelope(assessments, true);
    assert.equal(assessments.meta.unevaluatedCount, 1);
    assert.equal(assessments.data[0].evaluated, false);

    const invoices = await runTool("get_invoice_list", { page: 1 });
    assertToolEnvelope(invoices, true);
    assert.equal(invoices.data[0].uuid, 123);
    assert.equal(invoices.meta.returned, 1);

    const schoolCalendar = await runTool("get_school_calendar_image", {
        year: 2025,
        semester: "spring",
        lang: "zh",
    });
    assertToolEnvelope(schoolCalendar, true);
    assert.match(schoolCalendar.data.imageUrl, /2025-spring-zh/);

    const newsDetail = await runTool("get_news_detail", {
        url: "https://example.edu/news/1",
    });
    assertToolEnvelope(newsDetail, true);
    assert.equal(newsDetail.data.truncated, true);
    assert.ok(newsDetail.data.content.length < 6100);

    const newsSubscriptions = await runTool("get_news_subscriptions");
    assertToolEnvelope(newsSubscriptions, true);
    assert.equal(newsSubscriptions.data[0].keyword, "奖学金");

    const newsFavorites = await runTool("get_news_favorites", { page: 1 });
    assertToolEnvelope(newsFavorites, true);
    assert.equal(newsFavorites.data[0].title, "收藏新闻");
    assert.equal(newsFavorites.meta.totalPages, 1);

    const floors = await runTool("get_library_floors", { library: "北馆" });
    assertToolEnvelope(floors, true);
    assert.equal(floors.data.floors[0].name, "一层");

    const sections = await runTool("get_library_sections", {
        library: "北馆",
        floor: "一层",
    });
    assertToolEnvelope(sections, true);
    assert.equal(sections.data.sections[0].available, 6);

    const seats = await runTool("get_library_seats", {
        library: "北馆",
        floor: "一层",
        section: "阅览区A",
    });
    assertToolEnvelope(seats, true);
    assert.equal(seats.data.seats[0].socketStatus, "available");

    const missing = await runTool("get_library_floors", { library: "不存在" });
    assertToolEnvelope(missing, false);
    assert.equal(missing.status, "library_not_found");
    assert.equal(missing.candidates.length, 1);

    const reservesDetail = await runTool("get_reserves_library_detail", {
        book_id: "book-1",
    });
    assertToolEnvelope(reservesDetail, true);
    assert.equal(reservesDetail.data.title, "高等数学");
    assert.equal(reservesDetail.data.chapterCount, 2);

    const crSearch = await runTool("search_course_registration_courses", {
        semester_id: "2025-2026-1",
        name: "人工智能导论",
        page: 1,
    });
    assertToolEnvelope(crSearch, true);
    assert.equal(crSearch.data.courses[0].remaining, 8);

    const highFrequencyChecks: Array<[string, Record<string, unknown>, (result: any) => void]> = [
        ["get_schedule", {}, (result) => assert.equal(result.data.courses[0].name, "人工智能导论")],
        ["get_report", {}, (result) => assert.equal(result.data[0].grade, "A")],
        ["get_card_info", {}, (result) => assert.equal(result.data.balance, 88.8)],
        ["get_electricity", {}, (result) => assert.equal(result.data.remainder, 12.3)],
        ["get_library", {}, (result) => assert.equal(result.data[0].name, "北馆")],
        ["get_news", { keyword: "奖学金" }, (result) => assert.equal(result.data[0].title, "奖学金通知")],
        ["get_calendar", {}, (result) => assert.equal(result.data.weekCount, 16)],
        ["get_classroom", {}, (result) => assert.equal(result.data[0].name, "六教")],
        ["get_sports_resources", { sport_name: "篮球", date: "2026-04-28" }, (result) => assert.equal(result.data[0].availableCount, 1)],
        ["get_available_sports_venues", {}, (result) => assert.ok(result.data.includes("综体篮球场"))],
    ];

    for (const [name, args, validate] of highFrequencyChecks) {
        const result = await runTool(name, args);
        assertToolEnvelope(result, true);
        validate(result);
    }

    const unknownTool = await runTool("missing_tool");
    assertToolEnvelope(unknownTool, false);
    assert.equal(unknownTool.status, "unknown_tool");

    const normalizedPayment = normalizeToolResult({
        success: true,
        paymentMarker: "[PAY_QR:alipayqr://example]",
    });
    assert.deepEqual(normalizedPayment.actions, [{
        type: "payment_qr",
        label: "支付二维码",
        url: "alipayqr://example",
    }]);

    const extractedActions = extractToolActions({
        success: true,
        paymentMarker: "[PAY_QR:alipayqr://example]",
        openUrlMarker: "[OPEN_URL:https://example.edu/book]",
        captchaPanelMarker: "[SPORTS_CAPTCHA:current]",
    });
    assert.deepEqual(extractedActions.map((action: any) => action.type), [
        "payment_qr",
        "open_url",
        "sports_captcha",
    ]);

    console.log("new tool tests passed");
    process.exit(0);
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
