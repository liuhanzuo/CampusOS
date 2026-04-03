"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.sportsIdInfoList = void 0;
exports.getScheduleInfo = getScheduleInfo;
exports.getSportsResourceInfo = getSportsResourceInfo;
exports.getReportInfo = getReportInfo;
exports.getCardInfo = getCardInfo;
exports.getElectricityInfo = getElectricityInfo;
exports.getLibraryInfo = getLibraryInfo;
exports.getNewsInfo = getNewsInfo;
exports.getCalendarInfo = getCalendarInfo;
exports.getClassroomInfo = getClassroomInfo;
exports.rechargeCardInfo = rechargeCardInfo;
const recharge_1 = require("@thu-info/lib/src/models/card/recharge");
const dayjs_1 = __importDefault(require("dayjs"));
// 体育场馆 ID 信息（从 thu-info-lib 中提取）
exports.sportsIdInfoList = [
    { name: "气膜馆羽毛球场", gymId: "3998000", itemId: "4045681" },
    { name: "气膜馆乒乓球场", gymId: "3998000", itemId: "4037036" },
    { name: "综体篮球场", gymId: "4797914", itemId: "4797898" },
    { name: "综体羽毛球场", gymId: "4797914", itemId: "4797899" },
    { name: "西体羽毛球场", gymId: "4836273", itemId: "4836196" },
    { name: "西体台球", gymId: "4836273", itemId: "14567218" },
    { name: "紫荆网球场", gymId: "5843934", itemId: "5845263" },
    { name: "西网球场", gymId: "5843934", itemId: "10120539" },
];
/**
 * 获取课表信息
 */
async function getScheduleInfo(helper) {
    try {
        console.log(`[Data] 开始获取课表...`);
        const startTime = Date.now();
        const { schedule, calendar } = await helper.getSchedule();
        console.log(`[Data] 课表获取成功，耗时: ${Date.now() - startTime}ms, 课程数: ${schedule.length}`);
        const courses = schedule.map((s) => ({
            name: s.name,
            location: s.location,
            category: s.category,
            times: s.activeTime.base.map((t) => ({
                dayOfWeek: t.dayOfWeek,
                beginTime: t.beginTime.format("YYYY-MM-DD HH:mm"),
                endTime: t.endTime.format("HH:mm"),
            })),
        }));
        return {
            success: true,
            data: {
                courses,
                firstDay: calendar.firstDay,
                weekCount: calendar.weekCount,
                semesterName: calendar.semesterName || "当前学期",
                semesterId: calendar.semesterId,
            },
        };
    }
    catch (e) {
        console.error(`[Data] 获取课表失败:`, e.message, e.stack?.substring(0, 300));
        return { success: false, error: e.message || "获取课表失败" };
    }
}
/**
 * 查询体育场馆资源
 */
async function getSportsResourceInfo(helper, sportName, date) {
    try {
        const targetDate = date || (0, dayjs_1.default)().format("YYYY-MM-DD");
        console.log(`[Data] 查询体育场馆: sport=${sportName || '全部'}, date=${targetDate}`);
        // 根据名称匹配场馆
        let venues = exports.sportsIdInfoList;
        if (sportName) {
            const keyword = sportName.toLowerCase();
            venues = exports.sportsIdInfoList.filter((v) => v.name.toLowerCase().includes(keyword) ||
                keyword.includes("羽毛球") && v.name.includes("羽毛球") ||
                keyword.includes("篮球") && v.name.includes("篮球") ||
                keyword.includes("乒乓球") && v.name.includes("乒乓球") ||
                keyword.includes("台球") && v.name.includes("台球") ||
                keyword.includes("网球") && v.name.includes("网球"));
            if (venues.length === 0) {
                venues = exports.sportsIdInfoList; // 没匹配到就返回全部
            }
        }
        const results = [];
        for (const venue of venues) {
            try {
                console.log(`[Data] 查询场馆: ${venue.name} (gymId=${venue.gymId}, itemId=${venue.itemId})`);
                const resStart = Date.now();
                const resources = await helper.getSportsResources(venue.gymId, venue.itemId, targetDate);
                console.log(`[Data] ${venue.name} 查询成功，耗时: ${Date.now() - resStart}ms, 字段数: ${resources.data.length}`);
                results.push({
                    venueName: venue.name,
                    date: targetDate,
                    maxBookable: resources.count,
                    available: resources.init > 0,
                    phone: resources.phone,
                    fields: resources.data.map((r) => ({
                        fieldName: r.fieldName,
                        timeSession: r.timeSession,
                        cost: r.cost || 0,
                        isBooked: !!r.bookId,
                        canBook: r.canNetBook && !r.bookId,
                        userType: r.userType,
                    })),
                });
            }
            catch (e) {
                console.error(`[Data] ${venue.name} 查询失败: ${e.message}`, e.stack?.substring(0, 300));
                results.push({
                    venueName: venue.name,
                    date: targetDate,
                    error: e.message || "查询失败",
                });
            }
        }
        return { success: true, data: results };
    }
    catch (e) {
        return { success: false, error: e.message || "查询体育场馆失败" };
    }
}
/**
 * 获取成绩单
 */
async function getReportInfo(helper) {
    try {
        console.log(`[Data] 开始获取成绩单...`);
        const startTime = Date.now();
        const courses = await helper.getReport(false, true);
        console.log(`[Data] 成绩单获取成功，耗时: ${Date.now() - startTime}ms, 课程数: ${courses.length}`);
        return {
            success: true,
            data: courses.map((c) => ({
                name: c.name,
                credit: c.credit,
                grade: c.grade,
                point: c.point,
                semester: c.semester,
            })),
        };
    }
    catch (e) {
        console.error(`[Data] 获取成绩失败:`, e.message);
        return { success: false, error: e.message || "获取成绩失败" };
    }
}
/**
 * 获取校园卡信息
 */
async function getCardInfo(helper) {
    try {
        console.log(`[Data] 开始获取校园卡信息...`);
        await helper.loginCampusCard();
        console.log(`[Data] 校园卡登录成功`);
        const info = await helper.getCampusCardInfo();
        console.log(`[Data] 校园卡信息获取成功`);
        return {
            success: true,
            data: {
                name: info.userName,
                balance: info.balance,
                cardStatus: info.cardStatus,
                cardId: info.cardId,
                department: info.departmentName,
            },
        };
    }
    catch (e) {
        return { success: false, error: e.message || "获取校园卡信息失败" };
    }
}
/**
 * 获取电费余额
 */
async function getElectricityInfo(helper) {
    try {
        console.log(`[Data] 开始获取电费余额...`);
        const { remainder, updateTime } = await helper.getEleRemainder();
        console.log(`[Data] 电费余额: ${remainder}, 更新时间: ${updateTime}`);
        return {
            success: true,
            data: { remainder, updateTime },
        };
    }
    catch (e) {
        return { success: false, error: e.message || "获取电费余额失败" };
    }
}
/**
 * 获取图书馆座位信息
 */
async function getLibraryInfo(helper) {
    try {
        console.log(`[Data] 开始获取图书馆信息...`);
        const libraries = await helper.getLibraryList();
        console.log(`[Data] 图书馆信息获取成功，数量: ${libraries.length}`);
        return {
            success: true,
            data: libraries.map((lib) => ({
                id: lib.id,
                name: lib.zhName || lib.enName,
                valid: lib.valid,
            })),
        };
    }
    catch (e) {
        return { success: false, error: e.message || "获取图书馆信息失败" };
    }
}
/**
 * 获取新闻列表
 */
async function getNewsInfo(helper, keyword) {
    try {
        console.log(`[Data] 开始获取新闻, keyword=${keyword || '无'}`);
        let newsList;
        if (keyword) {
            newsList = await helper.searchNewsList(1, keyword);
        }
        else {
            newsList = await helper.getNewsList(1, 10);
        }
        return {
            success: true,
            data: newsList.map((n) => ({
                title: n.name,
                date: n.date,
                source: n.source,
                url: n.url,
                channel: n.channel,
            })),
        };
    }
    catch (e) {
        return { success: false, error: e.message || "获取新闻失败" };
    }
}
/**
 * 获取教学日历
 */
async function getCalendarInfo(helper) {
    try {
        console.log(`[Data] 开始获取教学日历...`);
        const calendar = await helper.getCalendar();
        console.log(`[Data] 教学日历获取成功`);
        return {
            success: true,
            data: {
                firstDay: calendar.firstDay,
                weekCount: calendar.weekCount,
                semesterName: calendar.semesterName,
                currentWeek: Math.ceil((0, dayjs_1.default)().diff((0, dayjs_1.default)(calendar.firstDay), "day") / 7),
            },
        };
    }
    catch (e) {
        return { success: false, error: e.message || "获取教学日历失败" };
    }
}
/**
 * 获取教室状态
 */
async function getClassroomInfo(helper, building, week) {
    try {
        console.log(`[Data] 开始获取教室信息, building=${building || '全部'}, week=${week || '当前'}`);
        if (!building) {
            const classrooms = await helper.getClassroomList();
            return {
                success: true,
                data: classrooms.map((c) => ({
                    name: c.name,
                    searchName: c.searchName,
                })),
            };
        }
        const targetWeek = week || Math.ceil((0, dayjs_1.default)().diff((0, dayjs_1.default)(), "day") / 7) + 1;
        const state = await helper.getClassroomState(building, targetWeek);
        return { success: true, data: state };
    }
    catch (e) {
        return { success: false, error: e.message || "获取教室信息失败" };
    }
}
/**
 * 校园卡充值 - 生成微信/支付宝支付二维码
 * @param helper InfoHelper 实例
 * @param amount 充值金额（元）
 * @param payMethod 支付方式: "wechat" | "alipay"
 * @returns 包含支付URL的结果
 */
async function rechargeCardInfo(helper, amount, payMethod = "wechat") {
    try {
        console.log(`[Data] 开始校园卡充值: amount=${amount}, method=${payMethod}`);
        if (amount <= 0 || amount > 500) {
            return { success: false, error: "充值金额需在 0.01~500 元之间" };
        }
        // 先获取校园卡信息（确保已登录校园卡系统）
        await helper.loginCampusCard();
        const cardInfo = await helper.getCampusCardInfo();
        console.log(`[Data] 校园卡当前余额: ${cardInfo.balance}元`);
        const type = payMethod === "alipay" ? recharge_1.CardRechargeType.Alipay : recharge_1.CardRechargeType.Wechat;
        // 调用充值接口，获取支付URL
        // rechargeCampusCard 对于微信/支付宝返回支付URL字符串
        const payUrl = await helper.rechargeCampusCard(amount, "", type);
        console.log(`[Data] 充值订单创建成功, payUrl长度=${typeof payUrl === 'string' ? payUrl.length : 0}`);
        return {
            success: true,
            data: {
                payUrl: payUrl,
                amount,
                payMethod,
                cardBalance: cardInfo.balance,
                cardId: cardInfo.cardId,
                userName: cardInfo.userName,
            },
        };
    }
    catch (e) {
        console.error(`[Data] 校园卡充值失败:`, e.message, e.stack?.substring(0, 300));
        return { success: false, error: e.message || "校园卡充值失败" };
    }
}
//# sourceMappingURL=thu-data-service.js.map