import { sportsSeleniumService } from "../../services/sports-selenium/sports-selenium-service";
import { AgentTool } from "./types";
import { parseRelativeDate } from "./utils";

export const openSportsBookingPageTool: AgentTool = {
    definition: {
        type: "function",
        function: {
            name: "open_sports_booking_page",
            description: "打开体育场馆真实预约页面。用于用户已经明确要预约某个体育场馆时，让用户在浏览器中完成日期、时段、滑块验证码和最终确认。",
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
    run: async (_ctx, args) => {
        const date = parseRelativeDate(args.date) || args.date;
        const result = await sportsSeleniumService.openInteractiveBookingPage(args.venue_name, date);
        return {
            ...result,
            captchaPanelMarker: result.success ? "[SPORTS_CAPTCHA:current]" : undefined,
        };
    },
};
