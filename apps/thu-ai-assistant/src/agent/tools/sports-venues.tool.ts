import { sportsIdInfoList } from "../../services/thu/data-service";
import { AgentTool } from "./types";

export const getAvailableSportsVenuesTool: AgentTool = {
    definition: {
        type: "function",
        function: {
            name: "get_available_sports_venues",
            description: "获取所有可预约的体育场馆列表",
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
