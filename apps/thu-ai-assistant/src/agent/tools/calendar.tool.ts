import { getCalendarInfo } from "../../services/thu/data-service";
import { AgentTool } from "./types";

export const getCalendarTool: AgentTool = {
    definition: {
        type: "function",
        function: {
            name: "get_calendar",
            description: "获取教学日历信息，包括学期开始日期、当前周次等",
            parameters: {
                type: "object",
                properties: {},
                required: [],
            },
        },
    },
    run: ({ helper }) => getCalendarInfo(helper),
};
