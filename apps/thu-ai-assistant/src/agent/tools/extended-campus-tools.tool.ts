import {
    checkLibraryRoomAvailabilityInfo,
    getBankPaymentInfo,
    getCampusCardTransactionsInfo,
    getCourseRegistrationInfo,
    getDegreeProgramInfo,
    getDormScoreInfo,
    getElectricityRecordsInfo,
    getGraduateIncomeInfo,
    getInvoiceListInfo,
    getLibraryBookingRecordsInfo,
    getLibraryFloorInfo,
    getLibraryRoomBookingRecordsInfo,
    getLibraryRoomResourcesInfo,
    getLibrarySeatInfo,
    getLibrarySectionInfo,
    getNetworkInfo,
    getNewsDetailInfo,
    getNewsFavoritesInfo,
    getNewsSubscriptionsInfo,
    getOnlineDevicesInfo,
    getPhysicalExamInfo,
    getReservesLibraryDetailInfo,
    getSchoolCalendarImageInfo,
    searchCourseRegistrationCoursesInfo,
    getSportsBookingRecordsInfo,
    getTeachingAssessmentListInfo,
    peekCourseScoreInfo,
    rechargeElectricityInfo,
    searchReservesLibraryInfo,
    sportsIdInfoList,
} from "../../services/thu/data-service";
import { sessionManager } from "../../session/session-manager";
import { AgentTool } from "./types";

const pendingAction = (
    actionType: string,
    summary: string,
    unsupportedReason = "该能力涉及真实操作或多步 UI 流程，当前 MVP 只完成 Agent 工具识别和参数准备，暂不自动执行。",
) => ({
    success: false,
    status: "unsupported_or_pending",
    action_type: actionType,
    summary,
    unsupported_reason: unsupportedReason,
    next_actions: [
        "继续补统一 pending action 和确认协议。",
        "确认服务层接口稳定后，再开放真实执行。",
    ],
});

const findSportsVenue = (venueName: string) => {
    const normalized = venueName.trim();
    return sportsIdInfoList.find((venue) =>
        venue.name.includes(normalized) ||
        normalized.includes(venue.name) ||
        (normalized.includes("羽毛球") && venue.name.includes("羽毛球")) ||
        (normalized.includes("篮球") && venue.name.includes("篮球")) ||
        (normalized.includes("乒乓球") && venue.name.includes("乒乓球")) ||
        (normalized.includes("台球") && venue.name.includes("台球")) ||
        (normalized.includes("网球") && venue.name.includes("网球"))
    );
};

export const getCampusCardTransactionsTool: AgentTool = {
    definition: {
        type: "function",
        function: {
            name: "get_campus_card_transactions",
            description: "查询校园卡交易记录/消费记录，可指定起止日期。",
            parameters: {
                type: "object",
                properties: {
                    start: { type: "string", description: "开始日期，YYYY-MM-DD。默认最近30天。" },
                    end: { type: "string", description: "结束日期，YYYY-MM-DD。默认今天。" },
                    type: { type: "number", description: "交易类型，-1 表示全部。" },
                },
                required: [],
            },
        },
    },
    run: ({ helper }, args) => getCampusCardTransactionsInfo(helper, args.start, args.end, args.type ?? -1),
};

export const peekCourseScoreTool: AgentTool = {
    definition: {
        type: "function",
        function: {
            name: "peek_course_score",
            description: "按课程号查询单门课程成绩。",
            parameters: {
                type: "object",
                properties: {
                    course_id: { type: "string", description: "课程号。" },
                },
                required: ["course_id"],
            },
        },
    },
    run: ({ helper }, args) => peekCourseScoreInfo(helper, args.course_id),
};

export const getElectricityRecordsTool: AgentTool = {
    definition: {
        type: "function",
        function: {
            name: "get_electricity_records",
            description: "查询宿舍电费充值记录。",
            parameters: { type: "object", properties: {}, required: [] },
        },
    },
    run: ({ helper }) => getElectricityRecordsInfo(helper),
};

export const prepareElectricityRechargeTool: AgentTool = {
    definition: {
        type: "function",
        function: {
            name: "prepare_electricity_recharge",
            description: "准备宿舍电费充值。MVP 中不会自动支付，只返回需要确认的信息。",
            parameters: {
                type: "object",
                properties: {
                    amount: { type: "number", description: "充值金额，单位元。" },
                },
                required: ["amount"],
            },
        },
    },
    run: async ({ sessionId }, args) => {
        if (!sessionId) {
            return { success: false, error: "缺少会话，无法创建待确认动作" };
        }
        const amount = Number(args.amount);
        if (!Number.isInteger(amount) || amount <= 0 || amount > 500) {
            return { success: false, error: "电费充值金额需为 1~500 元之间的整数" };
        }
        const action = sessionManager.createPendingAction(sessionId, {
            actionType: "electricity_recharge",
            payload: { amount },
            summary: `宿舍电费充值 ${amount} 元，支付方式：支付宝`,
            risk: "medium",
        });
        return {
            success: true,
            status: "awaiting_confirmation",
            action_type: action.actionType,
            summary: action.summary,
            confirmation_token: action.token,
            expires_at: new Date(action.expiresAt).toISOString(),
            risk: action.risk,
            next_actions: [
                "请向用户复述充值金额。",
                "只有用户明确说确认后，才调用 confirm_pending_action 创建支付订单。",
            ],
        };
    },
};

export const getDormScoreTool: AgentTool = {
    definition: {
        type: "function",
        function: {
            name: "get_dorm_score",
            description: "查询宿舍卫生成绩。",
            parameters: { type: "object", properties: {}, required: [] },
        },
    },
    run: ({ helper }) => getDormScoreInfo(helper),
};

export const getPhysicalExamTool: AgentTool = {
    definition: {
        type: "function",
        function: {
            name: "get_physical_exam",
            description: "查询体测成绩。",
            parameters: { type: "object", properties: {}, required: [] },
        },
    },
    run: ({ helper }) => getPhysicalExamInfo(helper),
};

export const getTeachingAssessmentListTool: AgentTool = {
    definition: {
        type: "function",
        function: {
            name: "get_teaching_assessment_list",
            description: "查询教学评估/评教列表，只返回课程是否已评和表单链接，不自动提交评教。",
            parameters: { type: "object", properties: {}, required: [] },
        },
    },
    run: ({ helper }) => getTeachingAssessmentListInfo(helper),
};

export const getInvoiceListTool: AgentTool = {
    definition: {
        type: "function",
        function: {
            name: "get_invoice_list",
            description: "查询电子发票列表。用于查看可下载/可报销发票记录，不直接返回 PDF 文件。",
            parameters: {
                type: "object",
                properties: {
                    page: { type: "number", description: "页码，默认 1。" },
                },
                required: [],
            },
        },
    },
    run: ({ helper }, args) => getInvoiceListInfo(helper, args.page || 1),
};

export const prepareResetDormPasswordTool: AgentTool = {
    definition: {
        type: "function",
        function: {
            name: "prepare_reset_dorm_password",
            description: "准备重置家园网/宿舍密码。MVP 中不会自动改密。",
            parameters: {
                type: "object",
                properties: {
                    new_password: { type: "string", description: "新密码。" },
                },
                required: [],
            },
        },
    },
    run: async (_ctx, args) => pendingAction(
        "reset_dorm_password",
        args.new_password ? "已收到新密码参数，等待确认协议开放后可执行改密。" : "需要用户提供新密码后才能准备改密。",
        "改密属于敏感操作，需要统一确认协议和二次确认 UI。",
    ),
};

export const getLibraryFloorsTool: AgentTool = {
    definition: {
        type: "function",
        function: {
            name: "get_library_floors",
            description: "查询某个图书馆的楼层列表。先调用 get_library 获取图书馆 id 或名称。",
            parameters: {
                type: "object",
                properties: {
                    library: { type: "string", description: "图书馆 id 或名称，例如 北馆、文图、1。" },
                    date_choice: { type: "number", enum: [0, 1], description: "0 表示今天，1 表示明天，默认 0。" },
                },
                required: ["library"],
            },
        },
    },
    run: ({ helper }, args) => getLibraryFloorInfo(helper, args.library, args.date_choice ?? 0),
};

export const getLibrarySectionsTool: AgentTool = {
    definition: {
        type: "function",
        function: {
            name: "get_library_sections",
            description: "查询某个图书馆楼层下的阅览区/座位区域及余量。",
            parameters: {
                type: "object",
                properties: {
                    library: { type: "string", description: "图书馆 id 或名称。" },
                    floor: { type: "string", description: "楼层 id 或名称。" },
                    date_choice: { type: "number", enum: [0, 1], description: "0 表示今天，1 表示明天，默认 0。" },
                },
                required: ["library", "floor"],
            },
        },
    },
    run: ({ helper }, args) => getLibrarySectionInfo(helper, args.library, args.floor, args.date_choice ?? 0),
};

export const getLibrarySeatsTool: AgentTool = {
    definition: {
        type: "function",
        function: {
            name: "get_library_seats",
            description: "查询某个图书馆区域的座位列表和插座状态。结果最多返回前 200 个座位。",
            parameters: {
                type: "object",
                properties: {
                    library: { type: "string", description: "图书馆 id 或名称。" },
                    floor: { type: "string", description: "楼层 id 或名称。" },
                    section: { type: "string", description: "区域 id 或名称。" },
                    date_choice: { type: "number", enum: [0, 1], description: "0 表示今天，1 表示明天，默认 0。" },
                },
                required: ["library", "floor", "section"],
            },
        },
    },
    run: ({ helper }, args) => getLibrarySeatInfo(helper, args.library, args.floor, args.section, args.date_choice ?? 0),
};

export const getLibraryBookingRecordsTool: AgentTool = {
    definition: {
        type: "function",
        function: {
            name: "get_library_booking_records",
            description: "查询图书馆座位预约记录。",
            parameters: { type: "object", properties: {}, required: [] },
        },
    },
    run: ({ helper }) => getLibraryBookingRecordsInfo(helper),
};

export const getLibraryRoomResourcesTool: AgentTool = {
    definition: {
        type: "function",
        function: {
            name: "get_library_room_resources",
            description: "查询图书馆研读间类型或指定日期/类型下的研读间资源。",
            parameters: {
                type: "object",
                properties: {
                    date: { type: "string", description: "查询日期，格式 yyyyMMdd。不填则返回研读间类型。" },
                    kind_id: { type: "number", description: "研读间类型 ID。不填则返回研读间类型。" },
                },
                required: [],
            },
        },
    },
    run: ({ helper }, args) => getLibraryRoomResourcesInfo(helper, args.date, args.kind_id),
};

export const getLibraryRoomBookingRecordsTool: AgentTool = {
    definition: {
        type: "function",
        function: {
            name: "get_library_room_booking_records",
            description: "查询图书馆研读间预约记录。",
            parameters: { type: "object", properties: {}, required: [] },
        },
    },
    run: ({ helper }) => getLibraryRoomBookingRecordsInfo(helper),
};

export const prepareLibraryRoomBookingTool: AgentTool = {
    definition: {
        type: "function",
        function: {
            name: "prepare_library_room_booking",
            description: "准备研读间预约参数。用户确认后会真实提交预约。",
            parameters: {
                type: "object",
                properties: {
                    room_name: { type: "string", description: "研读间名称。" },
                    date: { type: "string", description: "日期，YYYY-MM-DD。" },
                    start: { type: "string", description: "开始时间，HH:mm。" },
                    end: { type: "string", description: "结束时间，HH:mm。" },
                    members: { type: "array", items: { type: "string" }, description: "成员学号列表。" },
                },
                required: ["room_name", "date", "start", "end"],
            },
        },
    },
    run: async ({ helper, sessionId }, args) => {
        if (!sessionId) {
            return { success: false, error: "缺少会话，无法创建待确认动作" };
        }
        const availability = await checkLibraryRoomAvailabilityInfo(
            helper,
            args.room_name,
            args.date,
            args.start,
            args.end,
        );
        if (!availability.success) {
            return {
                ...availability,
                action_type: "library_room_booking",
                next_actions: [
                    "不要创建待确认动作。",
                    "把占用信息或候选房间名告诉用户，让用户更换房间或时段后再试。",
                ],
            };
        }
        const action = sessionManager.createPendingAction(sessionId, {
            actionType: "library_room_booking",
            payload: {
                roomName: (availability as any).data?.room || args.room_name,
                date: args.date,
                start: args.start,
                end: args.end,
                members: args.members || [],
            },
            summary: `预约 ${args.date} ${args.start}-${args.end} 的 ${(availability as any).data?.room || args.room_name}`,
            risk: "medium",
        });
        return {
            success: true,
            status: "awaiting_confirmation",
            action_type: action.actionType,
            availability: (availability as any).data,
            summary: action.summary,
            confirmation_token: action.token,
            expires_at: new Date(action.expiresAt).toISOString(),
            risk: action.risk,
            next_actions: [
                "请向用户复述研读间、日期和时间。",
                "只有用户明确说确认后，才调用 confirm_pending_action 提交真实预约。",
            ],
        };
    },
};

export const cancelLibraryBookingTool: AgentTool = {
    definition: {
        type: "function",
        function: {
            name: "cancel_library_booking",
            description: "准备取消图书馆座位或研读间预约。MVP 中不直接取消。",
            parameters: {
                type: "object",
                properties: {
                    booking_id: { type: "string", description: "预约记录 ID 或 uuid。" },
                    booking_type: { type: "string", enum: ["seat", "room"], description: "预约类型。" },
                },
                required: ["booking_id", "booking_type"],
            },
        },
    },
    run: async (_ctx, args) => pendingAction(
        "cancel_library_booking",
        `准备取消 ${args.booking_type} 预约：${args.booking_id}。`,
    ),
};

export const getSportsBookingRecordsTool: AgentTool = {
    definition: {
        type: "function",
        function: {
            name: "get_sports_booking_records",
            description: "查询体育场馆预约记录。",
            parameters: { type: "object", properties: {}, required: [] },
        },
    },
    run: ({ helper }) => getSportsBookingRecordsInfo(helper),
};

export const prepareSportsBookingTool: AgentTool = {
    definition: {
        type: "function",
        function: {
            name: "prepare_sports_booking",
            description: "准备体育场馆预约参数。MVP 中不自动下单，可引导用户打开真实预约页。",
            parameters: {
                type: "object",
                properties: {
                    venue_name: { type: "string", description: "场馆名称。" },
                    date: { type: "string", description: "日期，YYYY-MM-DD。" },
                    time_slot: { type: "string", description: "时间段，例如 19:00-20:00。" },
                },
                required: ["venue_name", "date"],
            },
        },
    },
    run: async ({ sessionId }, args) => {
        if (!sessionId) {
            return { success: false, error: "缺少会话，无法创建待确认动作" };
        }
        const venue = findSportsVenue(args.venue_name);
        const action = sessionManager.createPendingAction(sessionId, {
            actionType: "open_sports_booking_page",
            payload: {
                venueName: args.venue_name,
                date: args.date,
                timeSlot: args.time_slot,
                gymId: venue?.gymId,
                itemId: venue?.itemId,
            },
            summary: `打开 ${args.date} ${args.venue_name} 的真实体育预约页面${args.time_slot ? `，目标时段 ${args.time_slot}` : ""}`,
            risk: "low",
        });
        return {
            success: true,
            status: "awaiting_confirmation",
            action_type: action.actionType,
            summary: action.summary,
            confirmation_token: action.token,
            expires_at: new Date(action.expiresAt).toISOString(),
            risk: action.risk,
            next_actions: [
                "请用户确认是否打开真实预约页面。",
                "确认后调用 confirm_pending_action；页面打开后用户手动完成验证码、时段选择和最终提交。",
            ],
        };
    },
};

export const cancelSportsBookingTool: AgentTool = {
    definition: {
        type: "function",
        function: {
            name: "cancel_sports_booking",
            description: "准备取消体育场馆预约。MVP 中不直接取消。",
            parameters: {
                type: "object",
                properties: {
                    booking_id: { type: "string", description: "体育预约 ID。" },
                },
                required: ["booking_id"],
            },
        },
    },
    run: async (_ctx, args) => pendingAction(
        "cancel_sports_booking",
        `准备取消体育预约：${args.booking_id}。`,
    ),
};

export const getNewsDetailTool: AgentTool = {
    definition: {
        type: "function",
        function: {
            name: "get_news_detail",
            description: "根据新闻 URL 查询新闻正文详情。通常先调用 get_news 获取 URL。",
            parameters: {
                type: "object",
                properties: {
                    url: { type: "string", description: "新闻详情 URL。" },
                },
                required: ["url"],
            },
        },
    },
    run: ({ helper }, args) => getNewsDetailInfo(helper, args.url),
};

export const getNewsSubscriptionsTool: AgentTool = {
    definition: {
        type: "function",
        function: {
            name: "get_news_subscriptions",
            description: "查询用户已关注的校内新闻订阅条件，包括关键词、栏目或来源。",
            parameters: { type: "object", properties: {}, required: [] },
        },
    },
    run: ({ helper }) => getNewsSubscriptionsInfo(helper),
};

export const getNewsFavoritesTool: AgentTool = {
    definition: {
        type: "function",
        function: {
            name: "get_news_favorites",
            description: "查询用户收藏的校内新闻列表。",
            parameters: {
                type: "object",
                properties: {
                    page: { type: "number", description: "页码，默认 1。" },
                },
                required: [],
            },
        },
    },
    run: ({ helper }, args) => getNewsFavoritesInfo(helper, args.page || 1),
};

export const getSchoolCalendarImageTool: AgentTool = {
    definition: {
        type: "function",
        function: {
            name: "get_school_calendar_image",
            description: "查询学校校历图片 URL。可指定学年、春秋季和语言。",
            parameters: {
                type: "object",
                properties: {
                    year: { type: "number", description: "学年起始年份，例如 2025 表示 2025-2026 学年。不填则查询最新学年。" },
                    semester: { type: "string", enum: ["spring", "autumn"], description: "春季或秋季，默认 autumn。" },
                    lang: { type: "string", enum: ["zh", "en"], description: "语言，默认 zh。" },
                },
                required: [],
            },
        },
    },
    run: ({ helper }, args) => getSchoolCalendarImageInfo(helper, args.year, args.semester || "autumn", args.lang || "zh"),
};

export const getReservesLibraryDetailTool: AgentTool = {
    definition: {
        type: "function",
        function: {
            name: "get_reserves_library_detail",
            description: "根据教参平台 book_id 查询教参详情和章节列表。通常先调用 search_reserves_library 获取 book_id。",
            parameters: {
                type: "object",
                properties: {
                    book_id: { type: "string", description: "教参平台 bookId。" },
                },
                required: ["book_id"],
            },
        },
    },
    run: ({ helper }, args) => getReservesLibraryDetailInfo(helper, args.book_id),
};

export const getBankPaymentTool: AgentTool = {
    definition: {
        type: "function",
        function: {
            name: "get_bank_payment",
            description: "查询银行代发记录。",
            parameters: {
                type: "object",
                properties: {
                    foundation: { type: "boolean", description: "是否查询基金会代发。" },
                },
                required: [],
            },
        },
    },
    run: ({ helper }, args) => getBankPaymentInfo(helper, Boolean(args.foundation)),
};

export const getGraduateIncomeTool: AgentTool = {
    definition: {
        type: "function",
        function: {
            name: "get_graduate_income",
            description: "查询研究生收入记录。",
            parameters: {
                type: "object",
                properties: {
                    begin: { type: "string", description: "开始日期，YYYYMMDD。默认最近180天。" },
                    end: { type: "string", description: "结束日期，YYYYMMDD。默认今天。" },
                },
                required: [],
            },
        },
    },
    run: ({ helper }, args) => getGraduateIncomeInfo(helper, args.begin, args.end),
};

export const searchReservesLibraryTool: AgentTool = {
    definition: {
        type: "function",
        function: {
            name: "search_reserves_library",
            description: "搜索教参平台资源。",
            parameters: {
                type: "object",
                properties: {
                    keyword: { type: "string", description: "书名或关键词。" },
                    page: { type: "number", description: "页码，默认 1。" },
                },
                required: ["keyword"],
            },
        },
    },
    run: ({ helper }, args) => searchReservesLibraryInfo(helper, args.keyword, args.page || 1),
};

export const getDegreeProgramTool: AgentTool = {
    definition: {
        type: "function",
        function: {
            name: "get_degree_program_info",
            description: "查询培养方案完成情况或完整培养方案。",
            parameters: {
                type: "object",
                properties: {
                    full: { type: "boolean", description: "是否返回完整培养方案，默认 false。" },
                },
                required: [],
            },
        },
    },
    run: ({ helper }, args) => getDegreeProgramInfo(helper, Boolean(args.full)),
};

export const getCourseRegistrationInfoTool: AgentTool = {
    definition: {
        type: "function",
        function: {
            name: "get_course_registration_info",
            description: "查询选课系统的可用学期、已选课程、选课阶段和队列信息。",
            parameters: {
                type: "object",
                properties: {
                    semester_id: { type: "string", description: "选课学期 ID。不填则只返回可用学期。" },
                },
                required: [],
            },
        },
    },
    run: ({ helper }, args) => getCourseRegistrationInfo(helper, args.semester_id),
};

export const searchCourseRegistrationCoursesTool: AgentTool = {
    definition: {
        type: "function",
        function: {
            name: "search_course_registration_courses",
            description: "搜索选课系统课程，返回开课信息、余量和排队人数。需要 semester_id；如果没有学期，请先调用 get_course_registration_info。",
            parameters: {
                type: "object",
                properties: {
                    semester_id: { type: "string", description: "选课学期 ID，例如 2025-2026-1。" },
                    id: { type: "string", description: "课程号，可选。" },
                    name: { type: "string", description: "课程名关键词，可选。" },
                    day_of_week: { type: "number", description: "上课星期，1-7，可选。" },
                    period: { type: "number", description: "上课节次，1-6，可选。" },
                    page: { type: "number", description: "页码，默认 1。" },
                },
                required: ["semester_id"],
            },
        },
    },
    run: ({ helper }, args) => searchCourseRegistrationCoursesInfo(helper, {
        semesterId: args.semester_id,
        id: args.id,
        name: args.name,
        dayOfWeek: args.day_of_week,
        period: args.period,
        page: args.page || 1,
    }),
};

export const getNetworkInfoTool: AgentTool = {
    definition: {
        type: "function",
        function: {
            name: "get_network_info",
            description: "查询校园网账号信息和余额。",
            parameters: { type: "object", properties: {}, required: [] },
        },
    },
    run: ({ helper }) => getNetworkInfo(helper),
};

export const getOnlineDevicesTool: AgentTool = {
    definition: {
        type: "function",
        function: {
            name: "get_online_devices",
            description: "查询校园网在线设备。",
            parameters: { type: "object", properties: {}, required: [] },
        },
    },
    run: ({ helper }) => getOnlineDevicesInfo(helper),
};

export const prepareNetworkDeviceActionTool: AgentTool = {
    definition: {
        type: "function",
        function: {
            name: "prepare_network_device_action",
            description: "准备校园网设备登录或登出操作。MVP 中不直接执行。",
            parameters: {
                type: "object",
                properties: {
                    action: { type: "string", enum: ["login", "logout"], description: "操作类型。" },
                    ip: { type: "string", description: "设备 IP，登录时需要。" },
                    device_id: { type: "string", description: "设备 ID，登出时需要。" },
                },
                required: ["action"],
            },
        },
    },
    run: async (_ctx, args) => pendingAction(
        "network_device_action",
        `准备执行校园网设备操作：${args.action}。`,
    ),
};

export const getLifeServiceStatusTool: AgentTool = {
    definition: {
        type: "function",
        function: {
            name: "get_life_service_status",
            description: "识别饮水、洗衣、校园地图等生活服务能力。当前 MVP 先返回能力状态。",
            parameters: {
                type: "object",
                properties: {
                    service: {
                        type: "string",
                        enum: ["water", "washer", "campus_map", "invoice", "physical_exam", "teaching_evaluation"],
                        description: "生活服务类型。",
                    },
                },
                required: ["service"],
            },
        },
    },
    run: async (_ctx, args) => ({
        success: false,
        status: "unsupported_or_pending",
        service: args.service,
        unsupported_reason: "该功能在原 App 中存在，但当前 Agent MVP 尚未接入稳定的服务层工具。",
        next_actions: [
            "保留为 Agent tool func，后续逐项接入 @thu-info/lib 或第三方服务。",
            "今天 demo 中可展示该能力已被 Agent 识别，但不执行真实操作。",
        ],
    }),
};

export const extendedCampusTools: AgentTool[] = [
    peekCourseScoreTool,
    getCampusCardTransactionsTool,
    getElectricityRecordsTool,
    prepareElectricityRechargeTool,
    getDormScoreTool,
    getPhysicalExamTool,
    getTeachingAssessmentListTool,
    getInvoiceListTool,
    prepareResetDormPasswordTool,
    getLibraryFloorsTool,
    getLibrarySectionsTool,
    getLibrarySeatsTool,
    getLibraryBookingRecordsTool,
    getLibraryRoomResourcesTool,
    getLibraryRoomBookingRecordsTool,
    prepareLibraryRoomBookingTool,
    cancelLibraryBookingTool,
    getSportsBookingRecordsTool,
    prepareSportsBookingTool,
    cancelSportsBookingTool,
    getBankPaymentTool,
    getGraduateIncomeTool,
    getNewsDetailTool,
    getNewsSubscriptionsTool,
    getNewsFavoritesTool,
    getSchoolCalendarImageTool,
    searchReservesLibraryTool,
    getReservesLibraryDetailTool,
    getDegreeProgramTool,
    getCourseRegistrationInfoTool,
    searchCourseRegistrationCoursesTool,
    getNetworkInfoTool,
    getOnlineDevicesTool,
    prepareNetworkDeviceActionTool,
    getLifeServiceStatusTool,
];
