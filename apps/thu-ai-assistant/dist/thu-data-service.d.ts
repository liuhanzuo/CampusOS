/**
 * THU 数据服务 - 封装 thu-info-lib 的各种数据查询功能
 * 所有方法都复用已登录的 InfoHelper 实例，无需重新认证
 */
import { InfoHelper } from "@thu-info/lib";
export declare const sportsIdInfoList: {
    name: string;
    gymId: string;
    itemId: string;
}[];
/**
 * 获取课表信息
 */
export declare function getScheduleInfo(helper: InfoHelper): Promise<{
    success: boolean;
    data: {
        courses: {
            name: string;
            location: string;
            category: string | undefined;
            times: {
                dayOfWeek: number;
                beginTime: string;
                endTime: string;
            }[];
        }[];
        firstDay: string;
        weekCount: number;
        semesterName: string;
        semesterId: string;
    };
    error?: undefined;
} | {
    success: boolean;
    error: any;
    data?: undefined;
}>;
/**
 * 查询体育场馆资源
 */
export declare function getSportsResourceInfo(helper: InfoHelper, sportName?: string, date?: string): Promise<{
    success: boolean;
    data: ({
        venueName: string;
        date: string;
        maxBookable: number;
        available: boolean;
        phone: string | undefined;
        fields: {
            fieldName: string;
            timeSession: string;
            cost: number;
            isBooked: boolean;
            canBook: boolean;
            userType: string | undefined;
        }[];
        error?: undefined;
    } | {
        venueName: string;
        date: string;
        error: any;
        maxBookable?: undefined;
        available?: undefined;
        phone?: undefined;
        fields?: undefined;
    })[];
    error?: undefined;
} | {
    success: boolean;
    error: any;
    data?: undefined;
}>;
/**
 * 获取成绩单
 */
export declare function getReportInfo(helper: InfoHelper): Promise<{
    success: boolean;
    data: {
        name: string;
        credit: number;
        grade: string;
        point: number;
        semester: string;
    }[];
    error?: undefined;
} | {
    success: boolean;
    error: any;
    data?: undefined;
}>;
/**
 * 获取校园卡信息
 */
export declare function getCardInfo(helper: InfoHelper): Promise<{
    success: boolean;
    data: {
        name: string;
        balance: number;
        cardStatus: string;
        cardId: string;
        department: string;
    };
    error?: undefined;
} | {
    success: boolean;
    error: any;
    data?: undefined;
}>;
/**
 * 获取电费余额
 */
export declare function getElectricityInfo(helper: InfoHelper): Promise<{
    success: boolean;
    data: {
        remainder: number;
        updateTime: string;
    };
    error?: undefined;
} | {
    success: boolean;
    error: any;
    data?: undefined;
}>;
/**
 * 获取图书馆座位信息
 */
export declare function getLibraryInfo(helper: InfoHelper): Promise<{
    success: boolean;
    data: {
        id: number;
        name: string;
        valid: boolean;
    }[];
    error?: undefined;
} | {
    success: boolean;
    error: any;
    data?: undefined;
}>;
/**
 * 获取新闻列表
 */
export declare function getNewsInfo(helper: InfoHelper, keyword?: string): Promise<{
    success: boolean;
    data: {
        title: string;
        date: string;
        source: string;
        url: string;
        channel: "LM_BGTG" | "LM_ZYGG" | "LM_YQFKZT" | "LM_JWGG" | "LM_KYTZ" | "LM_HB" | "LM_XJ_XTWBGTZ" | "LM_XSBGGG" | "LM_TTGGG" | "LM_JYGG" | "LM_XJ_XSSQDT" | "LM_BYJYXX" | "LM_JYZPXX" | "LM_XJ_GJZZSXRZ";
    }[];
    error?: undefined;
} | {
    success: boolean;
    error: any;
    data?: undefined;
}>;
/**
 * 获取教学日历
 */
export declare function getCalendarInfo(helper: InfoHelper): Promise<{
    success: boolean;
    data: {
        firstDay: string;
        weekCount: number;
        semesterName: string;
        currentWeek: number;
    };
    error?: undefined;
} | {
    success: boolean;
    error: any;
    data?: undefined;
}>;
/**
 * 获取教室状态
 */
export declare function getClassroomInfo(helper: InfoHelper, building?: string, week?: number): Promise<{
    success: boolean;
    data: {
        name: string;
        searchName: string;
    }[];
    error?: undefined;
} | {
    success: boolean;
    data: import("@thu-info/lib/src/models/home/classroom").ClassroomStateResult;
    error?: undefined;
} | {
    success: boolean;
    error: any;
    data?: undefined;
}>;
/**
 * 校园卡充值 - 生成微信/支付宝支付二维码
 * @param helper InfoHelper 实例
 * @param amount 充值金额（元）
 * @param payMethod 支付方式: "wechat" | "alipay"
 * @returns 包含支付URL的结果
 */
export declare function rechargeCardInfo(helper: InfoHelper, amount: number, payMethod?: "wechat" | "alipay"): Promise<{
    success: boolean;
    data: {
        payUrl: string;
        amount: number;
        payMethod: "wechat" | "alipay";
        cardBalance: number;
        cardId: string;
        userName: string;
    };
    error?: undefined;
} | {
    success: boolean;
    error: any;
    data?: undefined;
}>;
//# sourceMappingURL=thu-data-service.d.ts.map