/**
 * THU 数据服务 - 封装 thu-info-lib 的各种数据查询功能
 * 所有方法都复用已登录的 InfoHelper 实例，无需重新认证
 */
import { InfoHelper } from "@thu-info/lib";
import { CardRechargeType } from "@thu-info/lib/src/models/card/recharge";
import { PHYSICAL_EXAM_URL } from "@thu-info/lib/src/constants/strings";
import { roamingWrapperWithMocks } from "@thu-info/lib/src/lib/core";
import { uFetch } from "@thu-info/lib/src/utils/network";
import dayjs from "dayjs";

// 体育场馆 ID 信息（从 thu-info-lib 中提取）
export const sportsIdInfoList = [
    { name: "气膜馆羽毛球场", gymId: "3998000", itemId: "4045681" },
    { name: "北体乒乓球场", gymId: "3998000", itemId: "4037036" },
    { name: "综体篮球场", gymId: "4797914", itemId: "4797898" },
    { name: "综体羽毛球场", gymId: "4797914", itemId: "4797899" },
    { name: "西体羽毛球场", gymId: "4836273", itemId: "4836196" },
    { name: "西体台球", gymId: "4836273", itemId: "14567218" },
    { name: "紫荆网球场", gymId: "5843934", itemId: "5845263" },
    { name: "西网球场", gymId: "5843934", itemId: "10120539" },
];

const SPORTS_DIRECT_SITE_BASE = "https://www.sports.tsinghua.edu.cn/venue/site";

const sportsApiFetch = async (path: string, method = "GET", body?: unknown) => {
    const token = (globalThis as any).__sportsJwtToken;
    if (!token) {
        throw new Error("缺少体育系统 token，请先查询一次体育余量以完成体育系统登录。");
    }

    const response = await fetch(`${SPORTS_DIRECT_SITE_BASE}${path}`, {
        method,
        headers: {
            "Content-Type": "application/json",
            "x-api-version": "2.0.0",
            "Language-Set": "zh_CN",
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            token,
        },
        body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await response.text();
    let parsed: any;
    try {
        parsed = JSON.parse(text);
    } catch {
        parsed = { raw: text };
    }
    if (!response.ok) {
        throw new Error(`体育接口 ${path} HTTP ${response.status}: ${text.slice(0, 200)}`);
    }
    const code = parsed?.code === undefined ? undefined : Number(parsed.code);
    if (parsed?.success === false || (code !== undefined && code !== 0 && code !== 200)) {
        throw new Error(parsed?.message || parsed?.msg || `体育接口 ${path} 返回失败`);
    }
    return parsed;
};

const normalizeSportsDateValue = (value: unknown, fallbackDate: string) => {
    const text = String(value || "").trim();
    if (/^\d{8}$/.test(text)) {
        return `${text.slice(0, 4)}-${text.slice(4, 6)}-${text.slice(6, 8)}`;
    }
    if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
    return fallbackDate;
};

const normalizePayType = (payType: unknown) => {
    const value = Number(payType);
    if ((value & 2) === 2 && (value & 1) !== 1) return "PAY_OFFLINE";
    return "PAY_ONLINE";
};

const publicSportsField = (resource: any) => ({
    fieldName: resource.fieldName,
    timeSession: resource.timeSession,
    cost: resource.cost || 0,
    canBook: Boolean(resource.canNetBook && !resource.bookId),
    siteUuid: resource.siteUuid,
    sessionDetailUuid: resource.sessionDetailUuid,
});

const findSportsVenueForBooking = (venueName: string) => {
    const normalized = String(venueName || "").trim().toLowerCase();
    const exact = sportsIdInfoList.find((item) => item.name.toLowerCase() === normalized);
    if (exact) return exact;

    const directional = sportsIdInfoList.find((item) =>
        item.name.includes(venueName) || venueName.includes(item.name),
    );
    if (directional) return directional;

    return sportsIdInfoList.find((item) =>
        (venueName.includes("羽毛球") && item.name.includes("羽毛球")) ||
        (venueName.includes("篮球") && item.name.includes("篮球")) ||
        (venueName.includes("乒乓球") && item.name.includes("乒乓球")) ||
        (venueName.includes("台球") && item.name.includes("台球")) ||
        (venueName.includes("网球") && item.name.includes("网球")),
    );
};

const sportsAvailabilityBlocker = (resources: any) => {
    const data = Array.isArray(resources?.data) ? resources.data : [];
    const statusCode = String(resources?.statusCode || "");
    const statusMessage = String(resources?.statusMessage || resources?.message || "").trim();
    if (data.length > 0 || !statusMessage) return null;
    if (
        statusCode === "not_open" ||
        /不在当前可预约|未开放|不可预约|over limit/i.test(statusMessage)
    ) {
        return {
            status: "booking_window_unavailable",
            error: statusMessage,
        };
    }
    if (statusCode === "unknown") {
        return {
            status: "availability_unconfirmed",
            error: statusMessage,
        };
    }
    return null;
};

const findAvailableSportsResource = async (
    helper: InfoHelper,
    venue: typeof sportsIdInfoList[number],
    date: string,
    timeSlot?: string,
    fieldName?: string,
) => {
    const resources = await helper.getSportsResources(venue.gymId, venue.itemId, date);
    const available = resources.data.filter((resource: any) => resource.canNetBook && !resource.bookId);
    const matched = available.filter((resource: any) =>
        (!timeSlot || resource.timeSession === timeSlot) &&
        (!fieldName || resource.fieldName === fieldName || String(resource.fieldName || "").includes(fieldName)),
    );
    return {
        resources,
        available,
        candidates: (timeSlot || fieldName ? matched : available).slice(0, 20),
        selected: (timeSlot || fieldName ? matched : available)[0],
    };
};

const classifySportsSubmitError = (message: string) => {
    if (/SCENE_UUID_NOT_EMPTY/i.test(message)) {
        return {
            status: "invalid_payload",
            error: "提交体育预约缺少场景 ID(sceneUuid)，请重新查询空位后再确认。",
        };
    }
    if (/COMMON_TIME_RANGE_EMPTY/i.test(message)) {
        return {
            status: "invalid_payload",
            error: "提交体育预约缺少有效预约时间段，请重新查询空位后再确认。",
        };
    }
    if (/RESERVE_SITE_NOT_EMPTY|场地.*(已被|占用)|已不可预约|已被预约/i.test(message)) {
        return {
            status: "slot_unavailable",
            error: "提交时体育系统返回该场地/时段已被占用，请重新查询并选择新的空位。",
        };
    }
    if (/captcha|验证码|verify/i.test(message)) {
        return {
            status: "captcha_required_or_failed",
            error: message,
        };
    }
    return {
        status: "failed",
        error: message || "提交体育预约失败",
    };
};

const isSportsCaptchaRequired = async () => {
    try {
        const result = await sportsApiFetch("/api/reserve/enableValidCode");
        return Boolean(Number(result?.data?.sysValue || 0) & 1);
    } catch (e: any) {
        console.log(`[Sports] 查询验证码开关失败，继续尝试提交: ${e.message}`);
        return false;
    }
};

/**
 * 获取课表信息
 */
export async function getScheduleInfo(helper: InfoHelper) {
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
    } catch (e: any) {
        console.error(`[Data] 获取课表失败:`, e.message, e.stack?.substring(0, 300));
        return { success: false, error: e.message || "获取课表失败" };
    }
}

/**
 * 查询体育场馆资源
 */
export async function getSportsResourceInfo(
    helper: InfoHelper,
    sportName?: string,
    date?: string,
) {
    try {
        const targetDate = date || dayjs().format("YYYY-MM-DD");
        console.log(`[Data] 查询体育场馆: sport=${sportName || '全部'}, date=${targetDate}`);

        // 根据名称匹配场馆
        let venues = sportsIdInfoList;
        if (sportName) {
            const keyword = sportName.toLowerCase();
            venues = sportsIdInfoList.filter(
                (v) =>
                    v.name.toLowerCase().includes(keyword) ||
                    keyword.includes("羽毛球") && v.name.includes("羽毛球") ||
                    keyword.includes("篮球") && v.name.includes("篮球") ||
                    keyword.includes("乒乓球") && v.name.includes("乒乓球") ||
                    keyword.includes("台球") && v.name.includes("台球") ||
                    keyword.includes("网球") && v.name.includes("网球"),
            );
            if (venues.length === 0) {
                venues = sportsIdInfoList; // 没匹配到就返回全部
            }
        }

        const results = [];
        for (const venue of venues) {
            try {
                console.log(`[Data] 查询场馆: ${venue.name} (gymId=${venue.gymId}, itemId=${venue.itemId})`);
                const resStart = Date.now();
                const resources = await helper.getSportsResources(
                    venue.gymId,
                    venue.itemId,
                    targetDate,
                );
                console.log(`[Data] ${venue.name} 查询成功，耗时: ${Date.now() - resStart}ms, 字段数: ${resources.data.length}`);
                const fields = resources.data.map((r) => ({
                    fieldName: r.fieldName,
                    timeSession: r.timeSession,
                    cost: r.cost || 0,
                    isBooked: !!r.bookId,
                    canBook: r.canNetBook && !r.bookId,
                    userType: r.userType,
                }));
                const availableFields = fields.filter((field) => field.canBook);
                const availableByTime = availableFields.reduce((acc, field) => {
                    const key = field.timeSession || "未知时段";
                    acc[key] = (acc[key] || 0) + 1;
                    return acc;
                }, {} as Record<string, number>);
                results.push({
                    venueName: venue.name,
                    date: targetDate,
                    maxBookable: resources.count,
                    available: availableFields.length > 0,
                    availableCount: availableFields.length,
                    totalFieldRecords: fields.length,
                    availableByTime,
                    phone: resources.phone,
                    statusCode: resources.statusCode || "unknown",
                    statusMessage: availableFields.length > 0
                        ? `${venue.name} 在 ${targetDate} 还有 ${availableFields.length} 条可预约场地/时段记录。`
                        : resources.statusMessage || `${venue.name} 在 ${targetDate} 暂未查到可预约余量。`,
                    fields,
                });
            } catch (e: any) {
                console.error(`[Data] ${venue.name} 查询失败: ${e.message}`, e.stack?.substring(0, 300));
                results.push({
                    venueName: venue.name,
                    date: targetDate,
                    error: e.message || "查询失败",
                });
            }
        }

        return { success: true, data: results };
    } catch (e: any) {
        return { success: false, error: e.message || "查询体育场馆失败" };
    }
}

export async function resolveSportsBookingCandidateInfo(
    helper: InfoHelper,
    venueName: string,
    date: string,
    timeSlot?: string,
    fieldName?: string,
) {
    const venue = findSportsVenueForBooking(venueName);
    if (!venue) {
        return {
            success: false,
            status: "venue_not_found",
            error: `没有找到匹配的体育场馆：${venueName}`,
            candidates: sportsIdInfoList.map((item) => item.name),
        };
    }

    try {
        const { resources, available, candidates, selected } = await findAvailableSportsResource(
            helper,
            venue,
            date,
            timeSlot,
            fieldName,
        );
        if (!selected) {
            const blocker = available.length === 0 ? sportsAvailabilityBlocker(resources) : null;
            if (blocker) {
                return {
                    success: false,
                    status: blocker.status,
                    error: `${venue.name} 在 ${date} 暂不能确认可预约空位：${blocker.error}`,
                    data: {
                        venue,
                        date,
                        requestedTimeSlot: timeSlot,
                        requestedFieldName: fieldName,
                        totalFieldRecords: resources.data.length,
                        availableCount: available.length,
                        statusCode: resources.statusCode || "unknown",
                        statusMessage: blocker.error,
                        candidates: [],
                    },
                };
            }
            return {
                success: false,
                status: "no_available_slot",
                error: timeSlot
                    ? `${venue.name} 在 ${date} 的 ${timeSlot} 暂无可预约空位。`
                    : `${venue.name} 在 ${date} 暂无可预约空位。`,
                data: {
                    venue,
                    date,
                    requestedTimeSlot: timeSlot,
                    requestedFieldName: fieldName,
                    totalFieldRecords: resources.data.length,
                    availableCount: available.length,
                    candidates: available.slice(0, 20).map(publicSportsField),
                },
            };
        }

        return {
            success: true,
            status: "ok",
            data: {
                venue,
                date,
                selected,
                candidates: candidates.map(publicSportsField),
                availableCount: available.length,
                totalFieldRecords: resources.data.length,
            },
        };
    } catch (e: any) {
        return { success: false, status: "error", error: e.message || "准备体育预约失败" };
    }
}

export async function submitSportsBookingInfo(
    helper: InfoHelper,
    userId: string,
    booking: any,
    captchaVerification = "",
) {
    const venue = booking.venue;
    const target = booking.resource;
    if (!venue || !target) {
        return { success: false, status: "invalid_payload", error: "待确认体育预约缺少场馆或时段信息。" };
    }

    try {
        if (!captchaVerification && await isSportsCaptchaRequired()) {
            return {
                success: false,
                status: "captcha_required_or_failed",
                error: "体育系统当前要求滑块验证码。请打开真实预约页完成滑块，或在验证码通过后携带 captcha_verification 再确认提交。",
            };
        }

        const { selected } = await findAvailableSportsResource(
            helper,
            venue,
            booking.date,
            target.timeSession,
            target.fieldName,
        );
        if (!selected || selected.sessionDetailUuid !== target.sessionDetailUuid) {
            return {
                success: false,
                status: "slot_unavailable",
                error: "确认前复查发现该场地/时段已不可预约，请重新查询余量。",
            };
        }

        const missingFields = [
            ["sceneUuid", selected.sceneUuid],
            ["siteUuid", selected.siteUuid],
            ["siteType", selected.siteType],
            ["sessionDetailUuid", selected.sessionDetailUuid],
            ["beginTime", selected.beginTime],
            ["endTime", selected.endTime],
        ].filter(([, value]) => value === undefined || value === null || String(value).trim() === "");
        if (missingFields.length > 0) {
            return {
                success: false,
                status: "invalid_payload",
                error: `提交体育预约缺少必要字段：${missingFields.map(([field]) => field).join(", ")}。请重新查询空位后再确认。`,
            };
        }

        const beginDate = normalizeSportsDateValue(selected.beginDate, booking.date);
        const endDate = normalizeSportsDateValue(selected.endDate, booking.date);
        const timeRange = {
            startTime: `${beginDate} ${selected.beginTime}:00`,
            endTime: `${endDate} ${selected.endTime}:00`,
        };
        const siteSessionReserve = {
            sessionDetailUuid: selected.sessionDetailUuid,
            reserveTime: timeRange,
        };
        const addReservePayload = {
            sceneUuid: selected.sceneUuid,
            sceneUseType: selected.sceneUseType,
            siteUuid: selected.siteUuid,
            siteType: selected.siteType,
            reserveTime: [timeRange],
            siteSessionReserve: [siteSessionReserve],
            resvMember: [userId],
            resvKind: "CURRENT_RESERVE",
            payType: booking.payType || normalizePayType(selected.payType),
            purchaseUuid: booking.purchaseUuid || "",
            formParam: {
                formId: selected.formUuid || "",
                deployUuid: "",
                variables: {},
                chooseCandidates: {},
            },
            captcha: captchaVerification,
        };
        const addResult = await sportsApiFetch("/api/reserve/addReserve", "POST", addReservePayload);
        const resvIds = addResult?.data?.resvIds || (Array.isArray(addResult?.data) ? addResult.data : []);
        const orderCheck = resvIds.length
            ? await sportsApiFetch("/resv/order/check", "POST", { resvUuidList: resvIds, userId })
            : null;

        return {
            success: true,
            status: "executed",
            data: {
                venueName: venue.name,
                date: booking.date,
                fieldName: selected.fieldName,
                timeSession: selected.timeSession,
                cost: selected.cost || 0,
                resvIds,
                orderCheck: orderCheck?.data || null,
                requiresPayment: Boolean(orderCheck?.data?.orderGenerated && !orderCheck?.data?.freeOrder),
            },
            message: orderCheck?.data?.orderGenerated && !orderCheck?.data?.freeOrder
                ? "体育预约已提交，并生成待支付订单。"
                : "体育预约已提交成功。",
        };
    } catch (e: any) {
        const classified = classifySportsSubmitError(e.message || "");
        return {
            success: false,
            status: classified.status,
            error: classified.error,
            rawError: e.message || undefined,
        };
    }
}

export async function cancelSportsBookingInfo(helper: InfoHelper, bookingId: string) {
    const resvUuid = String(bookingId || "").trim();
    if (!resvUuid) {
        return { success: false, status: "invalid_payload", error: "缺少体育预约 ID。" };
    }

    try {
        if (!(globalThis as any).__sportsJwtToken) {
            await helper.getSportsReservationRecords();
        }
        const result = await sportsApiFetch("/api/reserve/cancelReserve", "POST", { resvUuid });
        return {
            success: true,
            status: "executed",
            data: {
                bookingId: resvUuid,
                result: result?.data ?? result,
            },
            message: "体育预约取消请求已提交。",
        };
    } catch (e: any) {
        const primaryError = e.message || "体育预约取消失败";
        try {
            await helper.unsubscribeSportsReservation(resvUuid);
            return {
                success: true,
                status: "executed",
                data: {
                    bookingId: resvUuid,
                    fallback: "legacy_unsubscribe",
                    primaryError,
                },
                message: "体育预约已通过旧版接口提交取消。",
            };
        } catch (fallbackError: any) {
            return {
                success: false,
                status: "failed",
                error: primaryError,
                fallbackError: fallbackError.message || undefined,
            };
        }
    }
}

/**
 * 获取成绩单
 */
export async function getReportInfo(helper: InfoHelper) {
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
    } catch (e: any) {
        console.error(`[Data] 获取成绩失败:`, e.message);
        return { success: false, error: e.message || "获取成绩失败" };
    }
}

export async function peekCourseScoreInfo(helper: InfoHelper, courseId: string) {
    try {
        const result = await helper.getScoreByCourseId(courseId);
        return { success: true, data: result };
    } catch (e: any) {
        return { success: false, error: e.message || "查询单门课程成绩失败" };
    }
}

/**
 * 获取校园卡信息
 */
export async function getCardInfo(helper: InfoHelper) {
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
    } catch (e: any) {
        return { success: false, error: e.message || "获取校园卡信息失败" };
    }
}

/**
 * 获取电费余额
 */
export async function getElectricityInfo(helper: InfoHelper) {
    try {
        console.log(`[Data] 开始获取电费余额...`);
        const { remainder, updateTime } = await helper.getEleRemainder();
        console.log(`[Data] 电费余额: ${remainder}, 更新时间: ${updateTime}`);
        return {
            success: true,
            data: { remainder, updateTime },
        };
    } catch (e: any) {
        return { success: false, error: e.message || "获取电费余额失败" };
    }
}

/**
 * 获取图书馆座位信息
 */
export async function getLibraryInfo(helper: InfoHelper) {
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
    } catch (e: any) {
        return { success: false, error: e.message || "获取图书馆信息失败" };
    }
}

const normalizeLibraryText = (value: unknown) =>
    String(value || "")
        .trim()
        .toLowerCase()
        .replace(/\s+/g, "");

const libraryBaseToJson = (item: any) => ({
    id: item.id,
    name: item.zhName || item.enName,
    zhName: item.zhName,
    enName: item.enName,
    zhNameTrace: item.zhNameTrace,
    enNameTrace: item.enNameTrace,
    valid: item.valid,
});

const sameLibraryItem = (item: any, target?: string | number) => {
    if (target === undefined || target === null || target === "") return false;
    const targetText = normalizeLibraryText(target);
    return String(item.id) === String(target) ||
        [item.zhName, item.enName, item.zhNameTrace, item.enNameTrace]
            .map(normalizeLibraryText)
            .filter(Boolean)
            .some((candidate) =>
                candidate === targetText ||
                candidate.includes(targetText) ||
                targetText.includes(candidate),
            );
};

export async function getLibraryFloorInfo(
    helper: InfoHelper,
    library?: string | number,
    dateChoice: 0 | 1 = 0,
) {
    try {
        const libraries = await helper.getLibraryList();
        const targetLibrary = libraries.find((item: any) => sameLibraryItem(item, library));
        if (!targetLibrary) {
            return {
                success: false,
                status: "library_not_found",
                error: "没有找到对应图书馆，请先调用 get_library 获取图书馆列表。",
                candidates: libraries.map(libraryBaseToJson),
            };
        }
        const floors = await helper.getLibraryFloorList(targetLibrary, dateChoice);
        return {
            success: true,
            data: {
                library: libraryBaseToJson(targetLibrary),
                dateChoice,
                floors: floors.map(libraryBaseToJson),
            },
        };
    } catch (e: any) {
        return { success: false, error: e.message || "获取图书馆楼层失败" };
    }
}

export async function getLibrarySectionInfo(
    helper: InfoHelper,
    library?: string | number,
    floor?: string | number,
    dateChoice: 0 | 1 = 0,
) {
    try {
        const libraries = await helper.getLibraryList();
        const targetLibrary = libraries.find((item: any) => sameLibraryItem(item, library));
        if (!targetLibrary) {
            return {
                success: false,
                status: "library_not_found",
                error: "没有找到对应图书馆，请先调用 get_library 获取图书馆列表。",
                candidates: libraries.map(libraryBaseToJson),
            };
        }
        const floors = await helper.getLibraryFloorList(targetLibrary, dateChoice);
        const targetFloor = floors.find((item: any) => sameLibraryItem(item, floor));
        if (!targetFloor) {
            return {
                success: false,
                status: "floor_not_found",
                error: "没有找到对应楼层，请先调用 get_library_floors 获取楼层列表。",
                library: libraryBaseToJson(targetLibrary),
                candidates: floors.map(libraryBaseToJson),
            };
        }
        const sections = await helper.getLibrarySectionList(targetFloor, dateChoice);
        return {
            success: true,
            data: {
                library: libraryBaseToJson(targetLibrary),
                floor: libraryBaseToJson(targetFloor),
                dateChoice,
                sections: sections.map((section: any) => ({
                    ...libraryBaseToJson(section),
                    total: section.total,
                    available: section.available,
                    posX: section.posX,
                    posY: section.posY,
                })),
            },
        };
    } catch (e: any) {
        return { success: false, error: e.message || "获取图书馆区域失败" };
    }
}

export async function getLibrarySeatInfo(
    helper: InfoHelper,
    library?: string | number,
    floor?: string | number,
    section?: string | number,
    dateChoice: 0 | 1 = 0,
) {
    try {
        const libraries = await helper.getLibraryList();
        const targetLibrary = libraries.find((item: any) => sameLibraryItem(item, library));
        if (!targetLibrary) {
            return {
                success: false,
                status: "library_not_found",
                error: "没有找到对应图书馆，请先调用 get_library 获取图书馆列表。",
                candidates: libraries.map(libraryBaseToJson),
            };
        }
        const floors = await helper.getLibraryFloorList(targetLibrary, dateChoice);
        const targetFloor = floors.find((item: any) => sameLibraryItem(item, floor));
        if (!targetFloor) {
            return {
                success: false,
                status: "floor_not_found",
                error: "没有找到对应楼层，请先调用 get_library_floors 获取楼层列表。",
                library: libraryBaseToJson(targetLibrary),
                candidates: floors.map(libraryBaseToJson),
            };
        }
        const sections = await helper.getLibrarySectionList(targetFloor, dateChoice);
        const targetSection = sections.find((item: any) => sameLibraryItem(item, section));
        if (!targetSection) {
            return {
                success: false,
                status: "section_not_found",
                error: "没有找到对应区域，请先调用 get_library_sections 获取区域列表。",
                library: libraryBaseToJson(targetLibrary),
                floor: libraryBaseToJson(targetFloor),
                candidates: sections.map((item: any) => ({
                    ...libraryBaseToJson(item),
                    total: item.total,
                    available: item.available,
                })),
            };
        }
        const seats = await helper.getLibrarySeatList(targetSection, dateChoice);
        return {
            success: true,
            data: {
                library: libraryBaseToJson(targetLibrary),
                floor: libraryBaseToJson(targetFloor),
                section: {
                    ...libraryBaseToJson(targetSection),
                    total: targetSection.total,
                    available: targetSection.available,
                },
                dateChoice,
                seats: seats.slice(0, 200).map((seat: any) => ({
                    ...libraryBaseToJson(seat),
                    type: seat.type,
                    socketStatus: seat.status,
                })),
                meta: {
                    count: seats.length,
                    returned: Math.min(seats.length, 200),
                },
            },
        };
    } catch (e: any) {
        return { success: false, error: e.message || "获取图书馆座位失败" };
    }
}

const findLibrarySeatBookingTarget = async (
    helper: InfoHelper,
    library?: string | number,
    floor?: string | number,
    section?: string | number,
    seat?: string | number,
    dateChoice: 0 | 1 = 0,
) => {
    const libraries = await helper.getLibraryList();
    const targetLibrary = libraries.find((item: any) => sameLibraryItem(item, library));
    if (!targetLibrary) {
        return {
            success: false,
            status: "library_not_found",
            error: "没有找到对应图书馆，请先调用 get_library 获取图书馆列表。",
            candidates: libraries.map(libraryBaseToJson),
        };
    }

    const floors = await helper.getLibraryFloorList(targetLibrary, dateChoice);
    const targetFloor = floors.find((item: any) => sameLibraryItem(item, floor));
    if (!targetFloor) {
        return {
            success: false,
            status: "floor_not_found",
            error: "没有找到对应楼层，请先调用 get_library_floors 获取楼层列表。",
            library: libraryBaseToJson(targetLibrary),
            candidates: floors.map(libraryBaseToJson),
        };
    }

    const sections = await helper.getLibrarySectionList(targetFloor, dateChoice);
    const targetSection = sections.find((item: any) => sameLibraryItem(item, section));
    if (!targetSection) {
        return {
            success: false,
            status: "section_not_found",
            error: "没有找到对应区域，请先调用 get_library_sections 获取区域列表。",
            library: libraryBaseToJson(targetLibrary),
            floor: libraryBaseToJson(targetFloor),
            candidates: sections.map((item: any) => ({
                ...libraryBaseToJson(item),
                total: item.total,
                available: item.available,
            })),
        };
    }

    const seats = await helper.getLibrarySeatList(targetSection, dateChoice);
    const availableSeats = seats.filter((item: any) => item.valid);
    const targetSeat = seat === undefined || seat === null || String(seat).trim() === ""
        ? availableSeats[0]
        : availableSeats.find((item: any) => sameLibraryItem(item, seat));
    if (!targetSeat) {
        return {
            success: false,
            status: "seat_not_available",
            error: seat
                ? `没有找到可预约座位：${seat}。`
                : "该区域当前没有可预约座位。",
            data: {
                library: libraryBaseToJson(targetLibrary),
                floor: libraryBaseToJson(targetFloor),
                section: {
                    ...libraryBaseToJson(targetSection),
                    total: targetSection.total,
                    available: targetSection.available,
                },
                dateChoice,
                availableSeats: availableSeats.slice(0, 20).map((item: any) => ({
                    ...libraryBaseToJson(item),
                    type: item.type,
                    socketStatus: item.status,
                })),
                availableCount: availableSeats.length,
            },
        };
    }

    return {
        success: true,
        status: "ok",
        data: {
            library: libraryBaseToJson(targetLibrary),
            floor: libraryBaseToJson(targetFloor),
            section: {
                ...libraryBaseToJson(targetSection),
                total: targetSection.total,
                available: targetSection.available,
            },
            seat: {
                ...libraryBaseToJson(targetSeat),
                type: targetSeat.type,
                socketStatus: targetSeat.status,
            },
            rawSection: targetSection,
            rawSeat: targetSeat,
            dateChoice,
            availableCount: availableSeats.length,
            candidates: availableSeats.slice(0, 20).map((item: any) => ({
                ...libraryBaseToJson(item),
                type: item.type,
                socketStatus: item.status,
            })),
        },
    };
};

export async function resolveLibrarySeatBookingCandidateInfo(
    helper: InfoHelper,
    library?: string | number,
    floor?: string | number,
    section?: string | number,
    seat?: string | number,
    dateChoice: 0 | 1 = 0,
) {
    try {
        const result = await findLibrarySeatBookingTarget(
            helper,
            library,
            floor,
            section,
            seat,
            dateChoice,
        );
        if (!result.success) return result;
        const data = (result as any).data;
        return {
            success: true,
            status: "ok",
            data: {
                library: data.library,
                floor: data.floor,
                section: data.section,
                seat: data.seat,
                dateChoice: data.dateChoice,
                availableCount: data.availableCount,
                candidates: data.candidates,
            },
        };
    } catch (e: any) {
        return { success: false, status: "error", error: e.message || "准备图书馆座位预约失败" };
    }
}

export async function bookLibrarySeatInfo(
    helper: InfoHelper,
    booking: {
        library?: string | number;
        floor?: string | number;
        section?: string | number;
        seat?: string | number;
        dateChoice?: 0 | 1;
    },
) {
    try {
        const dateChoice = booking.dateChoice ?? 0;
        const result = await findLibrarySeatBookingTarget(
            helper,
            booking.library,
            booking.floor,
            booking.section,
            booking.seat,
            dateChoice,
        );
        if (!result.success) return result;

        const data = (result as any).data;
        const response = await helper.bookLibrarySeat(data.rawSeat, data.rawSection, dateChoice);
        if (response?.status !== 1) {
            return {
                success: false,
                status: "failed",
                error: response?.msg || "图书馆座位预约提交失败。",
                data: {
                    library: data.library,
                    floor: data.floor,
                    section: data.section,
                    seat: data.seat,
                    dateChoice,
                },
            };
        }

        return {
            success: true,
            status: "executed",
            data: {
                library: data.library,
                floor: data.floor,
                section: data.section,
                seat: data.seat,
                dateChoice,
                response,
            },
            message: "图书馆座位预约已提交成功。",
        };
    } catch (e: any) {
        return { success: false, status: "error", error: e.message || "图书馆座位预约失败" };
    }
}

export async function cancelLibraryBookingInfo(
    helper: InfoHelper,
    bookingId: string,
    bookingType: "seat" | "room",
) {
    const id = String(bookingId || "").trim();
    if (!id) {
        return { success: false, status: "invalid_payload", error: "缺少图书馆预约 ID。" };
    }
    if (bookingType !== "seat" && bookingType !== "room") {
        return { success: false, status: "invalid_payload", error: "预约类型必须是 seat 或 room。" };
    }

    try {
        if (bookingType === "seat") {
            const records = await helper.getBookingRecords();
            const record = records.find((item: any) =>
                String(item.id || "") === id ||
                String(item.delId || "") === id ||
                String(item.reserveId || "") === id ||
                String(item.uuid || "") === id,
            );
            const cancelId = String((record as any)?.delId || id).trim();
            if ((record as any)?.status && String((record as any).status).includes("取消")) {
                return {
                    success: true,
                    status: "already_cancelled",
                    data: {
                        bookingId: id,
                        cancelId,
                        bookingType,
                    },
                    message: "该图书馆座位预约记录已经是取消状态。",
                };
            }
            await helper.cancelBooking(cancelId);
            return {
                success: true,
                status: "executed",
                data: {
                    bookingId: id,
                    cancelId,
                    bookingType,
                },
                message: "图书馆座位预约已取消。",
            };
        } else {
            await helper.cancelLibraryRoomBooking(id);
        }
        return {
            success: true,
            status: "executed",
            data: {
                bookingId: id,
                bookingType,
            },
            message: "图书馆研读间预约已取消。",
        };
    } catch (e: any) {
        return { success: false, status: "failed", error: e.message || "图书馆预约取消失败" };
    }
}

/**
 * 获取新闻列表
 */
export async function getNewsInfo(helper: InfoHelper, keyword?: string) {
    try {
        console.log(`[Data] 开始获取新闻, keyword=${keyword || '无'}`);
        let newsList;
        if (keyword) {
            newsList = await helper.searchNewsList(1, keyword);
        } else {
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
    } catch (e: any) {
        return { success: false, error: e.message || "获取新闻失败" };
    }
}

export async function getNewsDetailInfo(helper: InfoHelper, url: string) {
    try {
        const [title, content, abstract] = await helper.getNewsDetail(url);
        return {
            success: true,
            data: {
                title,
                abstract,
                content: content.length > 6000 ? `${content.slice(0, 6000)}...` : content,
                truncated: content.length > 6000,
            },
        };
    } catch (e: any) {
        return { success: false, error: e.message || "获取新闻详情失败" };
    }
}

export async function getNewsSubscriptionsInfo(helper: InfoHelper) {
    try {
        const subscriptions = await helper.getNewsSubscriptionList();
        return {
            success: true,
            data: subscriptions.map((item: any) => ({
                id: item.id,
                title: item.title,
                keyword: item.keyword,
                channel: item.channel,
                source: item.source,
                order: item.order,
            })),
            meta: {
                count: subscriptions.length,
            },
        };
    } catch (e: any) {
        return { success: false, error: e.message || "获取新闻订阅失败" };
    }
}

export async function getNewsFavoritesInfo(helper: InfoHelper, page = 1) {
    try {
        const [items, totalPages] = await helper.getFavorNewsList(page);
        return {
            success: true,
            data: items.map((item: any) => ({
                title: item.name,
                id: item.xxid,
                url: item.url,
                date: item.date,
                source: item.source,
                channel: item.channel,
                topped: item.topped,
                inFav: item.inFav,
            })),
            meta: {
                page,
                totalPages,
                count: items.length,
            },
        };
    } catch (e: any) {
        return { success: false, error: e.message || "获取新闻收藏失败" };
    }
}

/**
 * 获取教学日历
 */
export async function getCalendarInfo(helper: InfoHelper) {
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
                currentWeek: Math.ceil(
                    dayjs().diff(dayjs(calendar.firstDay), "day") / 7,
                ),
            },
        };
    } catch (e: any) {
        return { success: false, error: e.message || "获取教学日历失败" };
    }
}

export async function getSchoolCalendarImageInfo(
    helper: InfoHelper,
    year?: number,
    semester: "spring" | "autumn" = "autumn",
    lang: "zh" | "en" = "zh",
) {
    try {
        const targetYear = year || await helper.getCalendarYear();
        const imageUrl = await helper.getCalendarImageUrl(targetYear, semester, lang);
        return {
            success: true,
            data: {
                year: targetYear,
                semester,
                lang,
                imageUrl,
            },
        };
    } catch (e: any) {
        return { success: false, error: e.message || "获取校历图片失败" };
    }
}

/**
 * 获取教室状态
 */
export async function getClassroomInfo(helper: InfoHelper, building?: string, week?: number) {
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
        const targetWeek = week || Math.ceil(dayjs().diff(dayjs(), "day") / 7) + 1;
        const state = await helper.getClassroomState(building, targetWeek);
        return { success: true, data: state };
    } catch (e: any) {
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
export async function rechargeCardInfo(
    helper: InfoHelper,
    amount: number,
    payMethod: "wechat" | "alipay" = "wechat",
) {
    try {
        console.log(`[Data] 开始校园卡充值: amount=${amount}, method=${payMethod}`);

        if (amount < 10 || amount > 200) {
            return { success: false, error: "校园卡充值金额需在 10~200 元之间" };
        }

        // 先获取校园卡信息（确保已登录校园卡系统）
        await helper.loginCampusCard();
        const cardInfo = await helper.getCampusCardInfo();
        console.log(`[Data] 校园卡当前余额: ${cardInfo.balance}元`);

        const type = payMethod === "alipay" ? CardRechargeType.Alipay : CardRechargeType.Wechat;

        // 调用充值接口，获取支付URL
        // rechargeCampusCard 对于微信/支付宝返回支付URL字符串
        const payUrl = await helper.rechargeCampusCard(amount, "", type);

        console.log(`[Data] 充值订单创建成功, payUrl长度=${typeof payUrl === 'string' ? payUrl.length : 0}`);

        return {
            success: true,
            data: {
                payUrl: payUrl as string,
                amount,
                payMethod,
                cardBalance: cardInfo.balance,
                cardId: cardInfo.cardId,
                userName: cardInfo.userName,
            },
        };
    } catch (e: any) {
        console.error(`[Data] 校园卡充值失败:`, e.message, e.stack?.substring(0, 300));
        return { success: false, error: e.message || "校园卡充值失败" };
    }
}

export async function getCampusCardTransactionsInfo(
    helper: InfoHelper,
    start?: string,
    end?: string,
    type = -1,
) {
    try {
        const targetEnd = end || dayjs().format("YYYY-MM-DD");
        const targetStart = start || dayjs().subtract(30, "day").format("YYYY-MM-DD");
        const transactions = await helper.getCampusCardTransactions(targetStart, targetEnd, type as any);
        return {
            success: true,
            data: transactions.slice(0, 50).map((item: any) => ({
                time: item.time || item.timestamp || item.date,
                title: item.title || item.name || item.merchant,
                place: item.place || item.location,
                amount: item.amount,
                balance: item.balance,
                type: item.type,
            })),
            meta: {
                start: targetStart,
                end: targetEnd,
                count: transactions.length,
            },
        };
    } catch (e: any) {
        return { success: false, error: e.message || "获取校园卡交易记录失败" };
    }
}

export async function getElectricityRecordsInfo(helper: InfoHelper) {
    try {
        const records = await helper.getElePayRecord();
        return {
            success: true,
            data: records.map(([name, id, time, channel, value, status]) => ({
                name,
                id,
                time,
                channel,
                value,
                status,
            })),
        };
    } catch (e: any) {
        return { success: false, error: e.message || "获取电费充值记录失败" };
    }
}

export async function rechargeElectricityInfo(helper: InfoHelper, amount: number) {
    try {
        if (!Number.isInteger(amount) || amount <= 0 || amount > 500) {
            return { success: false, error: "电费充值金额需为 1~500 元之间的整数" };
        }
        const payCode = await helper.getEleRechargePayCode(amount);
        const payUrl = `alipayqr://platformapi/startapp?saId=10000007&qrcode=https%3A%2F%2Fqr.alipay.com%2F${payCode}`;
        return {
            success: true,
            data: {
                amount,
                payCode,
                payUrl,
                payMethod: "alipay",
            },
            message: "电费充值订单已创建，请使用支付宝完成支付。",
        };
    } catch (e: any) {
        return { success: false, error: e.message || "创建电费充值订单失败" };
    }
}

export async function getDormScoreInfo(helper: InfoHelper) {
    try {
        const imageBase64 = await helper.getDormScore();
        return {
            success: true,
            data: {
                imageBase64,
                format: "base64",
            },
            message: "已获取宿舍卫生成绩图片。",
        };
    } catch (e: any) {
        return { success: false, error: e.message || "获取宿舍卫生成绩失败" };
    }
}

export async function getPhysicalExamInfo(helper: InfoHelper) {
    try {
        const result = typeof (helper as any).mocked === "function"
            ? await getPhysicalExamResultCompat(helper)
            : await helper.getPhysicalExamResult();
        return {
            success: true,
            data: result.map(([item, score]) => ({ item, score })),
        };
    } catch (e: any) {
        return { success: false, error: e.message || "获取体测成绩失败" };
    }
}

const physicalExamResultTotal = (json: any) =>
    Number(json.fhltzfs) * 0.15 +
    Number(json.wsmpfs) * 0.2 +
    Number(json.zwtqqfs) * 0.1 +
    Number(json.ldtyfs) * 0.1 +
    Number(json.ytxsfs) * 0.1 +
    Number(json.yqmpfs) * 0.2 +
    Number(json.ywqzfs) * 0.1 +
    Number(json.bbmpfs) * 0.2 +
    Number(json.sgtzfs) * 0.15;

const parsePhysicalExamPayload = (raw: string) => {
    let text = raw.trim();
    if (text.startsWith("(") && text.endsWith(")")) {
        text = text.slice(1, -1).trim();
    }
    if (text.startsWith("{'") || text.includes("':'")) {
        text = text.replace(/'/g, "\"");
    }
    return JSON.parse(text);
};

const physicalExamJsonToRows = (json: any): [string, string][] => {
    if (json.success === "false" || json.success === false) {
        return [["状态", "暂无可查成绩"]];
    }
    return [
        ["是否免测", json.sfmc],
        ["免测原因", json.mcyy],
        ["总分", json.zf],
        ["标准分", json.bzf],
        ["附加分", json.fjf],
        ["长跑附加分", json.cpfjf],
        ["参考成绩（APP自动结算，仅供参考）", String(physicalExamResultTotal(json))],
        ["身高", json.sg],
        ["体重", json.tz],
        ["身高体重分数", json.sgtzfs],
        ["肺活量", json.fhl],
        ["肺活量分数", json.fhltzfs],
        ["800M跑", json.bbmp],
        ["800M跑分数", json.bbmpfs],
        ["1000M跑", json.yqmp],
        ["1000M跑分数", json.yqmpfs],
        ["50M跑", json.wsmp],
        ["50M跑分数", json.wsmpfs],
        ["立定跳远", json.ldty],
        ["立定跳远分数", json.ldtyfs],
        ["坐位体前屈", json.zwtqq],
        ["坐位体前屈分数", json.zwtqqfs],
        ["仰卧起坐", json.ywqz],
        ["仰卧起坐分数", json.ywqzfs],
        ["引体向上", json.ytxs],
        ["引体向上分数", json.ytxsfs],
        ["体育课成绩", json.tykcj],
    ].map(([item, score]) => [item, score === undefined || score === null ? "" : String(score)]);
};

async function getPhysicalExamResultCompat(helper: InfoHelper): Promise<[string, string][]> {
    return roamingWrapperWithMocks(
        helper,
        "default",
        "8BF4F9A706589060488B6B6179E462E5",
        () => uFetch(PHYSICAL_EXAM_URL).then((raw) => physicalExamJsonToRows(parsePhysicalExamPayload(raw))),
        [["状态", "暂无可查成绩"]],
    );
}

export async function getTeachingAssessmentListInfo(helper: InfoHelper) {
    try {
        const result = await helper.getAssessmentList();
        return {
            success: true,
            status: "ok",
            data: result.map(([course, evaluated, url]) => ({
                course,
                evaluated,
                url,
            })),
            meta: {
                count: result.length,
                unevaluatedCount: result.filter(([, evaluated]) => !evaluated).length,
            },
        };
    } catch (e: any) {
        const message = e.message || "";
        if (message.includes("现在不是填写问卷时间")) {
            return {
                success: true,
                status: "not_open",
                data: [],
                meta: {
                    count: 0,
                    unevaluatedCount: 0,
                    reason: "当前不是评教开放时间。",
                },
            };
        }
        return { success: false, error: e.message || "获取教学评估列表失败" };
    }
}

export async function getInvoiceListInfo(helper: InfoHelper, page = 1) {
    try {
        const result = await helper.getInvoiceList(page);
        return {
            success: true,
            data: result.data.map((invoice: any) => ({
                uuid: invoice.uuid,
                fileName: invoice.file_name,
                date: invoice.inv_date,
                amount: invoice.inv_amount ?? invoice.bill_amount,
                taxAmount: invoice.tax_amount,
                type: invoice.inv_typeStr || invoice.inv_type,
                customerName: invoice.cust_name,
                financialDeptName: invoice.financial_dept_name,
                financialItemName: invoice.financial_item_name,
                paymentItemTypeName: invoice.payment_item_type_name,
                invoiceCode: invoice.inv_code,
                invoiceNo: invoice.inv_no,
                allowReimbursement: invoice.is_allow_reimbursement,
            })),
            meta: {
                page,
                count: result.count,
                returned: result.data.length,
            },
        };
    } catch (e: any) {
        return { success: false, error: e.message || "获取发票列表失败" };
    }
}

export async function getLibraryBookingRecordsInfo(helper: InfoHelper) {
    try {
        const records = await helper.getBookingRecords();
        return { success: true, data: records };
    } catch (e: any) {
        return { success: false, error: e.message || "获取图书馆座位预约记录失败" };
    }
}

export async function getLibraryRoomResourcesInfo(helper: InfoHelper, date?: string, kindId?: number) {
    try {
        await helper.loginLibraryRoomBooking();
        const kinds = await helper.getLibraryRoomBookingInfoList();
        if (!date) {
            return {
                success: true,
                status: "need_more_parameters",
                data: {
                    kinds: kinds.map((kind: any) => ({
                        kindId: kind.kindId ?? kind.id,
                        kindName: kind.kindName ?? kind.name,
                        rooms: (kind.rooms || []).map((room: any) => ({
                            id: room.devId ?? room.id,
                            name: room.devName ?? room.name,
                            minReserveTime: room.minReserveTime,
                        })),
                    })),
                },
                message: "已获取研读间类型。查询具体资源还需要 date(yyyyMMdd)；可选 kind_id 用于缩小类型范围。",
            };
        }

        const targetDate = normalizeDateForLibraryRoom(date);
        const targetKinds = kindId
            ? kinds.filter((kind: any) => Number(kind.kindId) === Number(kindId))
            : kinds;
        if (targetKinds.length === 0) {
            return {
                success: false,
                status: "kind_not_found",
                error: `没有找到 kind_id=${kindId} 的研读间类型。`,
                data: {
                    kinds: kinds.map((kind: any) => ({
                        kindId: kind.kindId ?? kind.id,
                        kindName: kind.kindName ?? kind.name,
                    })),
                },
            };
        }

        const resources = [];
        const failedKinds = [];
        for (const kind of targetKinds as any[]) {
            try {
                const list = await helper.getLibraryRoomBookingResourceList(targetDate, kind.kindId);
                resources.push(...list);
            } catch (e: any) {
                failedKinds.push({
                    kindId: kind.kindId,
                    kindName: kind.kindName,
                    error: e.message || "查询失败",
                });
            }
        }
        if (resources.length === 0 && failedKinds.length > 0) {
            return {
                success: false,
                status: "all_kinds_failed",
                error: "研读间资源查询失败，所有目标类型都没有返回可用结果。",
                meta: {
                    date: targetDate,
                    kindCount: targetKinds.length,
                    failedKinds,
                },
            };
        }
        return {
            success: true,
            status: failedKinds.length > 0 ? "partial" : "ok",
            data: resources.map((res: any) => ({
                id: res.devId ?? res.id,
                name: res.devName ?? res.name,
                kindId: res.kindId ?? kindId,
                kindName: res.kindName,
                labName: res.labName,
                roomName: res.roomName,
                date: targetDate,
                minUser: res.minUser,
                maxUser: res.maxUser,
                minMinute: res.minMinute,
                maxMinute: res.maxMinute,
                openStart: res.openStart,
                openEnd: res.openEnd,
                usage: (res.usage || []).map((usage: any) => ({
                    start: usage.start,
                    end: usage.end,
                    title: usage.title,
                    owner: usage.owner,
                })),
            })),
            meta: {
                date: targetDate,
                kindCount: targetKinds.length,
                roomCount: resources.length,
                failedKinds,
            },
        };
    } catch (e: any) {
        return { success: false, error: e.message || "获取研读间资源失败" };
    }
}

export async function getLibraryRoomBookingRecordsInfo(helper: InfoHelper) {
    try {
        await helper.loginLibraryRoomBooking();
        const records = await helper.getLibraryRoomBookingRecord();
        return { success: true, data: records };
    } catch (e: any) {
        return { success: false, error: e.message || "获取研读间预约记录失败" };
    }
}

const normalizeDateForLibraryRoom = (date: string) => date.replace(/-/g, "");

const normalizeLibraryRoomRecordDate = (value: unknown) => {
    const text = String(value || "").trim();
    if (/^\d{8}$/.test(text)) return text;
    const parsed = dayjs(text);
    return parsed.isValid() ? parsed.format("YYYYMMDD") : text.replace(/-/g, "");
};

const normalizeLibraryRoomTime = (date: string, time: string) => {
    const cleanDate = date.includes("-")
        ? date
        : `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}`;
    return `${cleanDate} ${time.length === 5 ? `${time}:00` : time}`;
};

const timeRangesOverlap = (startA: Date, endA: Date, startB: Date, endB: Date) =>
    startA < endB && startB < endA;

const normalizeRoomText = (value: unknown) =>
    String(value || "")
        .trim()
        .toLowerCase()
        .replace(/\s+/g, "")
        .replace(/[（(].*?[）)]/g, "");

const sameMinute = (a: Date, b: Date) =>
    Math.abs(a.getTime() - b.getTime()) < 60 * 1000;

const parseClockOnDate = (date: string, clock?: string | null) => {
    if (!clock) return null;
    const cleanDate = date.includes("-")
        ? date
        : `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}`;
    const normalizedClock = clock.length === 5 ? `${clock}:00` : clock;
    const parsed = dayjs(`${cleanDate} ${normalizedClock}`);
    return parsed.isValid() ? parsed.toDate() : null;
};

const findExactLibraryRoom = (resources: any[], roomName: string) => {
    const target = normalizeRoomText(roomName);
    if (!target) return undefined;
    return resources.find((res: any) => {
        const candidates = [
            res.devName,
            res.roomName,
            `${res.labName || ""}${res.roomName || ""}`,
            `${res.kindName || ""}${res.devName || ""}`,
        ].map(normalizeRoomText);
        return candidates.some((candidate) =>
            candidate === target ||
            candidate.endsWith(target) ||
            target.endsWith(candidate),
        );
    });
};

const verifyLibraryRoomBooking = async (
    helper: InfoHelper,
    target: any,
    targetDate: string,
    startDate: Date,
    endDate: Date,
) => {
    const records = await helper.getLibraryRoomBookingRecord();
    return records.find((record: any) =>
        normalizeLibraryRoomRecordDate(record.date) === targetDate &&
        normalizeRoomText(record.devName) === normalizeRoomText(target.devName) &&
        sameMinute(new Date(record.begin), startDate) &&
        sameMinute(new Date(record.end), endDate),
    );
};

export async function checkLibraryRoomAvailabilityInfo(
    helper: InfoHelper,
    roomName: string,
    date: string,
    start: string,
    end: string,
) {
    try {
        await helper.loginLibraryRoomBooking();
        const targetDate = normalizeDateForLibraryRoom(date);
        const kinds = await helper.getLibraryRoomBookingInfoList();
        const matchedKinds = kinds.filter((kind: any) => {
            const kindText = `${kind.kindName || ""} ${(kind.rooms || []).map((room: any) => room.devName || "").join(" ")}`;
            return kindText.includes(roomName) || roomName.includes(kind.kindName || "");
        });
        const candidateKinds = matchedKinds.length > 0 ? matchedKinds : kinds;

        const resources = [];
        for (const kind of candidateKinds as any[]) {
            const list = await helper.getLibraryRoomBookingResourceList(targetDate, kind.kindId);
            resources.push(...list);
        }

        const target = findExactLibraryRoom(resources, roomName);
        if (!target) {
            return {
                success: false,
                status: "room_not_found",
                error: `没有精确找到研读间“${roomName}”。请先查询研读间资源，并使用返回的完整房间名。`,
                candidates: resources.slice(0, 20).map((res: any) => ({
                    name: res.devName,
                    kindName: res.kindName,
                    labName: res.labName,
                    roomName: res.roomName,
                })),
            };
        }

        const startText = normalizeLibraryRoomTime(targetDate, start);
        const endText = normalizeLibraryRoomTime(targetDate, end);
        const startDate = dayjs(startText).toDate();
        const endDate = dayjs(endText).toDate();
        if (!dayjs(startText).isValid() || !dayjs(endText).isValid() || startDate >= endDate) {
            return { success: false, status: "invalid_time", error: "研读间预约时间不合法，请使用 YYYY-MM-DD 和 HH:mm。" };
        }

        const occupiedUsage = (target.usage || []).find((usage: any) =>
            timeRangesOverlap(startDate, endDate, new Date(usage.start), new Date(usage.end)),
        );
        if (occupiedUsage) {
            return {
                success: false,
                status: "occupied",
                error: `${target.devName} 在 ${start}-${end} 已被占用。`,
                data: {
                    room: target.devName,
                    date: targetDate,
                    requested: { start: startText, end: endText },
                    occupied: {
                        start: occupiedUsage.start,
                        end: occupiedUsage.end,
                        title: occupiedUsage.title,
                        owner: occupiedUsage.owner,
                    },
                    usage: (target.usage || []).map((usage: any) => ({
                        start: usage.start,
                        end: usage.end,
                        title: usage.title,
                        owner: usage.owner,
                    })),
                },
            };
        }

        return {
            success: true,
            status: "available",
            data: {
                room: target.devName,
                kind: target.kindName,
                lab: target.labName,
                roomName: target.roomName,
                date: targetDate,
                start: startText,
                end: endText,
                usage: (target.usage || []).map((usage: any) => ({
                    start: usage.start,
                    end: usage.end,
                    title: usage.title,
                    owner: usage.owner,
                })),
            },
            message: `${target.devName} 在 ${start}-${end} 未查到冲突预约。`,
        };
    } catch (e: any) {
        return { success: false, status: "error", error: e.message || "检查研读间占用失败" };
    }
}

export async function bookLibraryRoomInfo(
    helper: InfoHelper,
    roomName: string,
    date: string,
    start: string,
    end: string,
    members: string[] = [],
) {
    try {
        await helper.loginLibraryRoomBooking();
        const targetDate = normalizeDateForLibraryRoom(date);
        const kinds = await helper.getLibraryRoomBookingInfoList();
        const matchedKinds = kinds.filter((kind: any) => {
            const kindText = `${kind.kindName || ""} ${(kind.rooms || []).map((room: any) => room.devName || "").join(" ")}`;
            return kindText.includes(roomName) || roomName.includes(kind.kindName || "");
        });
        const candidateKinds = matchedKinds.length > 0 ? matchedKinds : kinds;

        const resources = [];
        for (const kind of candidateKinds as any[]) {
            const list = await helper.getLibraryRoomBookingResourceList(targetDate, kind.kindId);
            resources.push(...list);
        }

        const target = findExactLibraryRoom(resources, roomName);

        if (!target) {
            return {
                success: false,
                error: `没有精确找到研读间“${roomName}”。请先查询研读间资源，并使用返回的完整房间名。`,
                candidates: resources.slice(0, 20).map((res: any) => ({
                    name: res.devName,
                    kindName: res.kindName,
                    labName: res.labName,
                    roomName: res.roomName,
                })),
            };
        }

        const startText = normalizeLibraryRoomTime(targetDate, start);
        const endText = normalizeLibraryRoomTime(targetDate, end);
        const startDate = dayjs(startText).toDate();
        const endDate = dayjs(endText).toDate();
        if (!dayjs(startText).isValid() || !dayjs(endText).isValid() || startDate >= endDate) {
            return { success: false, error: "研读间预约时间不合法，请使用 YYYY-MM-DD 和 HH:mm。" };
        }
        const durationMinutes = Math.round((endDate.getTime() - startDate.getTime()) / 60000);
        if (target.minMinute && durationMinutes < target.minMinute) {
            return { success: false, error: `${target.devName} 最短预约 ${target.minMinute} 分钟。` };
        }
        if (target.maxMinute && durationMinutes > target.maxMinute) {
            return { success: false, error: `${target.devName} 最长预约 ${target.maxMinute} 分钟。` };
        }
        const openStart = parseClockOnDate(targetDate, target.openStart);
        const openEnd = parseClockOnDate(targetDate, target.openEnd);
        if (openStart && startDate < openStart || openEnd && endDate > openEnd) {
            return {
                success: false,
                error: `${target.devName} 开放时间为 ${target.openStart || "未知"}-${target.openEnd || "未知"}，目标时段不在开放范围内。`,
            };
        }

        const refreshedResources = await helper.getLibraryRoomBookingResourceList(targetDate, target.kindId);
        const refreshedTarget = findExactLibraryRoom(refreshedResources, target.devName);
        if (!refreshedTarget) {
            return { success: false, error: `提交前刷新资源失败：找不到 ${target.devName}。` };
        }

        const occupiedUsage = (refreshedTarget.usage || []).find((usage: any) =>
            timeRangesOverlap(startDate, endDate, new Date(usage.start), new Date(usage.end)),
        );
        const occupied = Boolean(occupiedUsage);
        if (occupied) {
            return {
                success: false,
                error: `${refreshedTarget.devName} 在 ${start}-${end} 已被占用。`,
                occupiedBy: {
                    start: occupiedUsage.start,
                    end: occupiedUsage.end,
                    title: occupiedUsage.title,
                    owner: occupiedUsage.owner,
                },
            };
        }

        const memberIds = [helper.getLibraryRoomAccNo()];
        for (const member of members) {
            const keyword = String(member).trim();
            if (!keyword) continue;
            const results = await helper.fuzzySearchLibraryId(keyword);
            const id = results[0]?.id;
            if (id && !memberIds.includes(id)) {
                memberIds.push(id);
            }
        }

        const doBook = () => helper.bookLibraryRoom(refreshedTarget, startText, endText, memberIds);
        try {
            await doBook();
        } catch (e: any) {
            if (!String(e?.message || e).includes("填写邮箱地址")) {
                throw e;
            }
            const { emailName } = await helper.getUserInfo();
            await helper.updateLibraryRoomEmail(`${emailName}@mails.tsinghua.edu.cn`);
            await doBook();
        }

        const verifiedRecord = await verifyLibraryRoomBooking(
            helper,
            refreshedTarget,
            targetDate,
            startDate,
            endDate,
        );

        if (!verifiedRecord) {
            return {
                success: false,
                status: "submitted_but_unverified",
                error: "研读间预约请求已提交，但在预约记录中没有核验到对应记录。请到图书馆预约记录中确认，或稍后重试。",
                data: {
                    room: refreshedTarget.devName,
                    kind: refreshedTarget.kindName,
                    lab: refreshedTarget.labName,
                    date: targetDate,
                    start: startText,
                    end: endText,
                },
            };
        }

        return {
            success: true,
            data: {
                room: refreshedTarget.devName,
                kind: refreshedTarget.kindName,
                lab: refreshedTarget.labName,
                date: targetDate,
                start: startText,
                end: endText,
                bookingId: verifiedRecord.uuid,
                reservationId: verifiedRecord.rsvId,
                members: memberIds.length,
            },
            message: `研读间预约已生效：${refreshedTarget.devName}，${startText} - ${endText}。`,
        };
    } catch (e: any) {
        return { success: false, error: e.message || "研读间预约失败" };
    }
}

export async function getSportsBookingRecordsInfo(helper: InfoHelper) {
    try {
        const records = await helper.getSportsReservationRecords();
        return { success: true, data: records };
    } catch (e: any) {
        return { success: false, error: e.message || "获取体育预约记录失败" };
    }
}

export async function getBankPaymentInfo(helper: InfoHelper, foundation = false) {
    try {
        const result = await helper.getBankPayment(foundation, true);
        return { success: true, data: result };
    } catch (e: any) {
        return { success: false, error: e.message || "获取银行代发记录失败" };
    }
}

export async function getGraduateIncomeInfo(helper: InfoHelper, begin?: string, end?: string) {
    try {
        const targetEnd = end || dayjs().format("YYYYMMDD");
        const targetBegin = begin || dayjs().subtract(180, "day").format("YYYYMMDD");
        const result = await helper.getGraduateIncome(targetBegin, targetEnd);
        return {
            success: true,
            data: result,
            meta: { begin: targetBegin, end: targetEnd },
        };
    } catch (e: any) {
        return { success: false, error: e.message || "获取研究生收入记录失败" };
    }
}

export async function searchReservesLibraryInfo(helper: InfoHelper, keyword: string, page = 1) {
    try {
        const result = await helper.searchReservesLib(keyword, page);
        return { success: true, data: result };
    } catch (e: any) {
        return { success: false, error: e.message || "搜索教参平台失败" };
    }
}

export async function getReservesLibraryDetailInfo(helper: InfoHelper, bookId: string) {
    try {
        const detail = await helper.getReservesLibBookDetail(bookId);
        if (!detail) {
            return {
                success: false,
                status: "not_found",
                error: "没有找到对应教参详情。",
            };
        }
        return {
            success: true,
            data: {
                img: detail.img,
                title: detail.title,
                author: detail.author,
                publisher: detail.publisher,
                ISBN: detail.ISBN,
                version: detail.version,
                volume: detail.volume,
                chapterCount: detail.chapters.length,
                chapters: detail.chapters.slice(0, 50).map((chapter: any) => ({
                    title: chapter.title,
                    href: chapter.href,
                })),
            },
        };
    } catch (e: any) {
        return { success: false, error: e.message || "获取教参详情失败" };
    }
}

export async function getDegreeProgramInfo(helper: InfoHelper, full = false) {
    try {
        const result = full
            ? await helper.getFullDegreeProgram()
            : await helper.getDegreeProgramCompletion();
        return { success: true, data: result };
    } catch (e: any) {
        return { success: false, error: e.message || "获取培养方案信息失败" };
    }
}

export async function getCourseRegistrationInfo(helper: InfoHelper, semesterId?: string) {
    try {
        const semesters = await helper.getCrAvailableSemesters();
        if (!semesterId) {
            return {
                success: true,
                status: "need_more_parameters",
                data: { semesters },
                message: "已获取可用选课学期。如需查询已选课程或选课阶段，请指定 semester_id。",
            };
        }

        const [selectedCourses, stage, queueInfo] = await Promise.allSettled([
            helper.getSelectedCourses(semesterId),
            helper.getCrCurrentStage(semesterId),
            helper.getQueueInfo(semesterId),
        ]);
        return {
            success: true,
            data: {
                semesters,
                selectedCourses: selectedCourses.status === "fulfilled" ? selectedCourses.value : null,
                stage: stage.status === "fulfilled" ? stage.value : null,
                queueInfo: queueInfo.status === "fulfilled" ? queueInfo.value : null,
            },
        };
    } catch (e: any) {
        return { success: false, error: e.message || "获取选课信息失败" };
    }
}

export async function searchCourseRegistrationCoursesInfo(
    helper: InfoHelper,
    args: {
        semesterId: string;
        id?: string;
        name?: string;
        dayOfWeek?: number;
        period?: number;
        page?: number;
    },
) {
    try {
        const result = await helper.searchCrCourses({
            semester: args.semesterId,
            id: args.id,
            name: args.name,
            dayOfWeek: args.dayOfWeek,
            period: args.period,
            page: args.page || 1,
        });
        return {
            success: true,
            data: {
                currPage: result.currPage,
                totalPage: result.totalPage,
                totalCount: result.totalCount,
                courses: result.courses.slice(0, 50).map((course: any) => ({
                    department: course.department,
                    id: course.id,
                    seq: course.seq,
                    name: course.name,
                    credits: course.credits,
                    teacher: course.teacher,
                    time: course.time,
                    capacity: course.capacity,
                    remaining: course.remaining,
                    queue: course.queue,
                    bksCap: course.bksCap,
                    yjsCap: course.yjsCap,
                    note: course.note,
                    feature: course.feature,
                    year: course.year,
                    secondary: course.secondary,
                    restrict: course.restrict,
                    culture: course.culture,
                })),
            },
            meta: {
                semesterId: args.semesterId,
                returned: Math.min(result.courses.length, 50),
            },
        };
    } catch (e: any) {
        return { success: false, error: e.message || "搜索选课课程失败" };
    }
}

export async function getNetworkInfo(helper: InfoHelper) {
    try {
        const [balance, account] = await Promise.allSettled([
            helper.getNetworkBalance(),
            helper.getNetworkAccountInfo(),
        ]);
        return {
            success: true,
            data: {
                balance: balance.status === "fulfilled" ? balance.value : null,
                account: account.status === "fulfilled" ? account.value : null,
                errors: [
                    balance.status === "rejected" ? balance.reason?.message || String(balance.reason) : undefined,
                    account.status === "rejected" ? account.reason?.message || String(account.reason) : undefined,
                ].filter(Boolean),
            },
        };
    } catch (e: any) {
        return { success: false, error: e.message || "获取校园网信息失败" };
    }
}

export async function getOnlineDevicesInfo(helper: InfoHelper) {
    try {
        const devices = await helper.getOnlineDevices();
        return { success: true, data: devices };
    } catch (e: any) {
        return { success: false, error: e.message || "获取在线设备失败" };
    }
}
