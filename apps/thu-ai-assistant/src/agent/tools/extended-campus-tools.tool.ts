import {
    checkLibraryRoomAvailabilityInfo,
    getBankPaymentInfo,
    getCampusCardTransactionsInfo,
    getCourseRegistrationInfo,
    getDegreeProgramInfo,
    getDormScoreInfo,
    getElectricityRecordsInfo,
    getGraduateIncomeInfo,
    getLibraryBookingRecordsInfo,
    getLibraryRoomBookingRecordsInfo,
    getLibraryRoomResourcesInfo,
    getNetworkInfo,
    getOnlineDevicesInfo,
    getSportsBookingRecordsInfo,
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
    prepareResetDormPasswordTool,
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
    searchReservesLibraryTool,
    getDegreeProgramTool,
    getCourseRegistrationInfoTool,
    getNetworkInfoTool,
    getOnlineDevicesTool,
    prepareNetworkDeviceActionTool,
    getLifeServiceStatusTool,
];
