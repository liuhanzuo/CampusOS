import { sportsIdInfoList } from "../../services/thu/data-service";
import { AgentTool } from "./types";

export const getAvailableSportsVenuesTool: AgentTool = {
    definition: {
        type: "function",
        function: {
            name: "get_available_sports_venues",
            description: "仅列出系统支持查询的体育场馆名称，不表示这些场馆当前有余量。用户问某天某项目是否还有位置/空位时，必须调用 get_sports_resources。",
            parameters: {
                type: "object",
                properties: {},
                required: [],
            },
        },
    },
    run: async () => ({
        success: true,
        data: sportsIdInfoList.map((v) => v.name),
    }),
};
