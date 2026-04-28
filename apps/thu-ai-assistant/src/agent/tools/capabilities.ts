export type CapabilityStatus = "ready" | "partial" | "planned";

export interface CampusCapability {
    id: string;
    name: string;
    category: string;
    status: CapabilityStatus;
    toolNames: string[];
    examples: string[];
    notes?: string;
}

export const campusCapabilities: CampusCapability[] = [
    {
        id: "schedule",
        name: "课程表",
        category: "学习",
        status: "ready",
        toolNames: ["get_schedule"],
        examples: ["今天下午有什么课", "查一下本学期课表"],
    },
    {
        id: "report",
        name: "成绩单",
        category: "学习",
        status: "ready",
        toolNames: ["get_report", "peek_course_score"],
        examples: ["查一下我的成绩", "帮我查某门课成绩"],
    },
    {
        id: "calendar",
        name: "教学日历",
        category: "学习",
        status: "ready",
        toolNames: ["get_calendar"],
        examples: ["现在是第几周", "查教学日历"],
    },
    {
        id: "classroom",
        name: "教室查询",
        category: "学习",
        status: "ready",
        toolNames: ["get_classroom"],
        examples: ["六教有哪些教室", "查一下三教当前周教室状态"],
    },
    {
        id: "course_registration",
        name: "选课与培养方案",
        category: "学习",
        status: "partial",
        toolNames: ["get_course_registration_info", "get_degree_program_info"],
        examples: ["查选课学期", "查培养方案完成情况"],
        notes: "查询类能力先开放，选课/退课等真实操作暂不自动执行。",
    },
    {
        id: "campus_card",
        name: "校园卡",
        category: "生活",
        status: "ready",
        toolNames: ["get_card_info", "get_campus_card_transactions", "recharge_campus_card"],
        examples: ["查校园卡余额", "查最近校园卡消费", "校园卡充 50"],
        notes: "充值会返回支付链接，用户需自行扫码确认支付。",
    },
    {
        id: "electricity",
        name: "宿舍电费",
        category: "生活",
        status: "partial",
        toolNames: ["get_electricity", "get_electricity_records", "prepare_electricity_recharge"],
        examples: ["查电费余额", "查电费充值记录"],
        notes: "电费充值仅准备订单信息，MVP 不自动完成支付。",
    },
    {
        id: "dorm",
        name: "宿舍服务",
        category: "生活",
        status: "partial",
        toolNames: ["get_dorm_score", "prepare_reset_dorm_password"],
        examples: ["查卫生成绩", "重置家园网密码"],
        notes: "重置密码属于敏感操作，MVP 只做准备和确认提示。",
    },
    {
        id: "sports",
        name: "体育场馆",
        category: "预约",
        status: "partial",
        toolNames: [
            "get_available_sports_venues",
            "get_sports_resources",
            "get_sports_booking_records",
            "open_sports_booking_page",
            "prepare_sports_booking",
            "cancel_sports_booking",
        ],
        examples: ["明天羽毛球场有空吗", "打开气膜馆羽毛球预约页"],
        notes: "自动预约、取消和支付需要强确认，今天先以查询和打开真实页面为主。",
    },
    {
        id: "library",
        name: "图书馆与研读间",
        category: "预约",
        status: "partial",
        toolNames: [
            "get_library",
            "get_library_booking_records",
            "get_library_room_resources",
            "get_library_room_booking_records",
            "prepare_library_room_booking",
            "cancel_library_booking",
        ],
        examples: ["查图书馆列表", "查研读间类型", "查我的图书馆预约"],
        notes: "座位/研读间真实预约和取消需要后续接统一确认协议。",
    },
    {
        id: "news",
        name: "校内新闻通知",
        category: "信息",
        status: "ready",
        toolNames: ["get_news"],
        examples: ["查最新通知", "搜索奖学金通知"],
    },
    {
        id: "finance",
        name: "财务与收入",
        category: "生活",
        status: "partial",
        toolNames: ["get_bank_payment", "get_graduate_income"],
        examples: ["查银行代发", "查研究生收入"],
    },
    {
        id: "network",
        name: "校园网",
        category: "生活",
        status: "partial",
        toolNames: ["get_network_info", "get_online_devices", "prepare_network_device_action"],
        examples: ["查校园网余额", "查在线设备"],
        notes: "登录/登出设备属于真实网络操作，MVP 先不自动执行。",
    },
    {
        id: "reserves_lib",
        name: "教参平台",
        category: "学习",
        status: "partial",
        toolNames: ["search_reserves_library"],
        examples: ["搜索高等数学教参"],
    },
    {
        id: "third_party_life",
        name: "饮水、洗衣和地图",
        category: "生活",
        status: "planned",
        toolNames: ["get_life_service_status"],
        examples: ["洗衣机还有空的吗", "校园地图怎么走"],
        notes: "这些能力在原 App 中依赖第三方或 UI 流程，今天先进入能力目录。",
    },
];
