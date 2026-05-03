import {InfoHelper} from "@thu-info/lib";

type ToolContext = {
	helper: InfoHelper;
};

type MobileTool = {
	definition: {
		type: "function";
		function: {
			name: string;
			description: string;
			parameters: Record<string, unknown>;
		};
	};
	run: (context: ToolContext, args: any) => Promise<Record<string, unknown>>;
};

const ok = (data: unknown, extra: Record<string, unknown> = {}) => ({
	success: true,
	status: "ok",
	data,
	...extra,
});

const fail = (error: string, status = "failed", extra: Record<string, unknown> = {}) => ({
	success: false,
	status,
	error,
	...extra,
});

const parseRelativeDate = (value?: string) => {
	if (!value) return new Date().toISOString().slice(0, 10);
	const trimmed = String(value).trim();
	const now = new Date();
	const addDays = (days: number) => {
		const date = new Date(now);
		date.setDate(date.getDate() + days);
		return date.toISOString().slice(0, 10);
	};
	if (trimmed === "今天") return addDays(0);
	if (trimmed === "明天") return addDays(1);
	if (trimmed === "后天") return addDays(2);
	return trimmed;
};

const safeMessage = (error: any, fallback: string) => error?.message || fallback;

const listCapabilitiesTool: MobileTool = {
	definition: {
		type: "function",
		function: {
			name: "list_capabilities",
			description: "列出手机端当前真实可执行的校园 Agent 能力。",
			parameters: {type: "object", properties: {}, required: []},
		},
	},
	run: async () => ok([
		{name: "课表查询", status: "ready", tool: "get_schedule"},
		{name: "校园卡余额", status: "ready", tool: "get_card_info"},
		{name: "图书馆列表", status: "ready", tool: "get_library"},
		{name: "体育场馆余量查询", status: "ready", tool: "get_sports_resources"},
		{name: "预约/充值/支付", status: "planned", note: "手机端查询已迁移，真实动作会继续按确认协议迁移。"},
	]),
};

const getScheduleTool: MobileTool = {
	definition: {
		type: "function",
		function: {
			name: "get_schedule",
			description: "获取用户课程表，包括课程名称、地点和上课时间。",
			parameters: {type: "object", properties: {}, required: []},
		},
	},
	run: async ({helper}) => {
		try {
			const {schedule, calendar} = await helper.getSchedule();
			return ok({
				semesterName: calendar.semesterName || "当前学期",
				semesterId: calendar.semesterId,
				firstDay: calendar.firstDay,
				weekCount: calendar.weekCount,
				courses: schedule.map((item: any) => ({
					name: item.name,
					location: item.location,
					category: item.category,
					times: item.activeTime?.base?.map((time: any) => ({
						dayOfWeek: time.dayOfWeek,
						beginTime: time.beginTime?.format?.("YYYY-MM-DD HH:mm") || String(time.beginTime || ""),
						endTime: time.endTime?.format?.("HH:mm") || String(time.endTime || ""),
					})) || [],
				})),
			});
		} catch (error: any) {
			return fail(safeMessage(error, "获取课表失败"));
		}
	},
};

const getCardInfoTool: MobileTool = {
	definition: {
		type: "function",
		function: {
			name: "get_card_info",
			description: "获取校园卡余额、状态、卡号和院系等信息。",
			parameters: {type: "object", properties: {}, required: []},
		},
	},
	run: async ({helper}) => {
		try {
			await helper.loginCampusCard();
			const info = await helper.getCampusCardInfo();
			return ok({
				name: info.userName,
				balance: info.balance,
				cardStatus: info.cardStatus,
				cardId: info.cardId,
				department: info.departmentName,
			});
		} catch (error: any) {
			return fail(safeMessage(error, "获取校园卡信息失败"));
		}
	},
};

const getLibraryTool: MobileTool = {
	definition: {
		type: "function",
		function: {
			name: "get_library",
			description: "获取图书馆列表及是否可用。",
			parameters: {type: "object", properties: {}, required: []},
		},
	},
	run: async ({helper}) => {
		try {
			const libraries = await helper.getLibraryList();
			return ok(libraries.map((library: any) => ({
				id: library.id,
				name: library.zhName || library.enName,
				zhName: library.zhName,
				enName: library.enName,
				valid: library.valid,
			})));
		} catch (error: any) {
			return fail(safeMessage(error, "获取图书馆信息失败"));
		}
	},
};

const sportsIdInfoList = [
	{name: "气膜馆羽毛球场", gymId: "3998000", itemId: "4045681"},
	{name: "北体乒乓球场", gymId: "3998000", itemId: "4037036"},
	{name: "综体篮球场", gymId: "4797914", itemId: "4797898"},
	{name: "综体羽毛球场", gymId: "4797914", itemId: "4797899"},
	{name: "西体羽毛球场", gymId: "4836273", itemId: "4836196"},
	{name: "西体台球", gymId: "4836273", itemId: "14567218"},
	{name: "紫荆网球场", gymId: "5843934", itemId: "5845263"},
	{name: "西网球场", gymId: "5843934", itemId: "10120539"},
];

const matchSportsVenues = (sportName?: string) => {
	if (!sportName) return sportsIdInfoList;
	const keyword = sportName.toLowerCase();
	const matched = sportsIdInfoList.filter((venue) =>
		venue.name.toLowerCase().includes(keyword) ||
		(keyword.includes("羽毛球") && venue.name.includes("羽毛球")) ||
		(keyword.includes("篮球") && venue.name.includes("篮球")) ||
		(keyword.includes("乒乓") && venue.name.includes("乒乓")) ||
		(keyword.includes("网球") && venue.name.includes("网球")),
	);
	return matched.length ? matched : sportsIdInfoList;
};

const getSportsResourcesTool: MobileTool = {
	definition: {
		type: "function",
		function: {
			name: "get_sports_resources",
			description: "查询体育场馆某天是否还有可预约余量/空位。",
			parameters: {
				type: "object",
				properties: {
					sport_name: {type: "string", description: "运动类型，如羽毛球、篮球、网球。"},
					date: {type: "string", description: "日期，YYYY-MM-DD，也支持今天/明天/后天。"},
				},
				required: [],
			},
		},
	},
	run: async ({helper}, args) => {
		const date = parseRelativeDate(args?.date);
		const venues = matchSportsVenues(args?.sport_name);
		const results = [];
		for (const venue of venues) {
			try {
				const resources = await helper.getSportsResources(venue.gymId, venue.itemId, date);
				const fields = (resources.data || []).map((field: any) => ({
					fieldName: field.fieldName,
					timeSession: field.timeSession,
					cost: field.cost || 0,
					isBooked: Boolean(field.bookId),
					canBook: Boolean(field.canNetBook && !field.bookId),
					userType: field.userType,
				}));
				const available = fields.filter((field: any) => field.canBook);
				results.push({
					venueName: venue.name,
					date,
					available: available.length > 0,
					availableCount: available.length,
					totalFieldRecords: fields.length,
					fields,
				});
			} catch (error: any) {
				results.push({venueName: venue.name, date, error: safeMessage(error, "查询失败")});
			}
		}
		return ok(results);
	},
};

export const mobileTools: MobileTool[] = [
	listCapabilitiesTool,
	getScheduleTool,
	getCardInfoTool,
	getLibraryTool,
	getSportsResourcesTool,
];

export const executeMobileTool = async (helper: InfoHelper, name: string, args: any = {}) => {
	const tool = mobileTools.find((item) => item.definition.function.name === name);
	if (!tool) return fail(`未知工具：${name}`, "unknown_tool");
	return tool.run({helper}, args);
};
