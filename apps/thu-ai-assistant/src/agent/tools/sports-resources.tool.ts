import { getSportsResourceInfo } from "../../services/thu/data-service";
import { AgentTool } from "./types";
import { parseRelativeDate } from "./utils";

export const getSportsResourcesTool: AgentTool = {
    definition: {
        type: "function",
        function: {
            name: "get_sports_resources",
            description: "查询体育场馆某天是否还有可预约余量/空位，并返回可预约场地、时段和剩余记录数。用户问“有没有空位”“还有没有位置”“余量”时必须调用本工具。",
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
