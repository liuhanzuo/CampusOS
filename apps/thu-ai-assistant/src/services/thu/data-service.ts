/**
 * THU 数据服务 - 封装 thu-info-lib 的各种数据查询功能
 * 所有方法都复用已登录的 InfoHelper 实例，无需重新认证
 */
import { InfoHelper } from "@thu-info/lib";
import { CardRechargeType } from "@thu-info/lib/src/models/card/recharge";
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
        if (!date || !kindId) {
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
                message: "已获取研读间类型。查询具体资源还需要 date(yyyyMMdd) 和 kind_id。",
            };
        }

        const resources = await helper.getLibraryRoomBookingResourceList(date, kindId);
        return {
            success: true,
            data: resources.map((res: any) => ({
                id: res.devId ?? res.id,
                name: res.devName ?? res.name,
                kindId: res.kindId ?? kindId,
                kindName: res.kindName,
                labName: res.labName,
                roomName: res.roomName,
                date,
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
        String(record.date) === targetDate &&
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
