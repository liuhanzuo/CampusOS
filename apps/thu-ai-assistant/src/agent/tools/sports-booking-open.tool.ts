import { sportsSeleniumService } from "../../services/sports-selenium/sports-selenium-service";
import { sportsIdInfoList } from "../../services/thu/data-service";
import { AgentTool } from "./types";
import { parseRelativeDate } from "./utils";

const findVenue = (venueName: string) => {
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

const getSportsTokens = () => ({
    token: (globalThis as any).__sportsJwtToken,
    refreshToken: (globalThis as any).__sportsRefreshToken,
});

export const openSportsBookingPageTool: AgentTool = {
    definition: {
        type: "function",
        function: {
            name: "open_sports_booking_page",
            description: "打开体育场馆真实预约页面。用于用户已经明确要预约某个体育场馆时，让用户在浏览器中完成日期、时段、滑块验证码和最终确认。查询是否有余量时不要调用本工具，应调用 get_sports_resources。",
            parameters: {
                type: "object",
                properties: {
                    venue_name: {
                        type: "string",
                        description: "场馆名称，例如：气膜馆羽毛球场、综体羽毛球场、西体羽毛球前馆、西体羽毛球后馆、紫荆网球场、北体网球场。",
                    },
                    date: {
                        type: "string",
                        description: "预约日期，格式为 YYYY-MM-DD，也支持明天、后天等相对日期。",
                    },
                },
                required: ["venue_name"],
            },
        },
    },
    run: async ({ helper }, args) => {
        const date = parseRelativeDate(args.date) || args.date;
        const venue = findVenue(args.venue_name);
        if (venue) {
            await helper.getSportsResources(
                venue.gymId,
                venue.itemId,
                date || new Date().toISOString().slice(0, 10),
            ).catch((e: any) => {
                console.log(`[Sports] 打开预约页前获取 token/余量失败，继续尝试打开页面: ${e.message}`);
            });
        }
        const result = await sportsSeleniumService.openInteractiveBookingPage(args.venue_name, date, getSportsTokens());
        return {
            ...result,
            captchaPanelMarker: result.success ? "[SPORTS_CAPTCHA:current]" : undefined,
        };
    },
};
