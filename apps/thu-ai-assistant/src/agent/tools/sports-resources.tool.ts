import { getSportsResourceInfo } from "../../services/thu/data-service";
import { AgentTool } from "./types";
import { parseRelativeDate } from "./utils";

export const getSportsResourcesTool: AgentTool = {
    definition: {
        type: "function",
        function: {
            name: "get_sports_resources",
            description: "查询体育场馆的预约情况，包括羽毛球场、篮球场、乒乓球场、台球、网球场等。可以查看某个日期的场地空闲情况。",
            parameters: {
                type: "object",
                properties: {
                    sport_name: {
                        type: "string",
                        description: "运动类型名称，如：羽毛球、篮球、乒乓球、台球、网球。不填则查询所有场馆。",
                    },
                    date: {
                        type: "string",
                        description: "查询日期，格式为 YYYY-MM-DD。不填则查询今天。支持'明天'、'后天'等相对日期。",
                    },
                },
                required: [],
            },
        },
    },
    run: ({ helper }, args) => {
        const date = parseRelativeDate(args.date) || args.date;
        return getSportsResourceInfo(helper, args.sport_name, date);
    },
};
