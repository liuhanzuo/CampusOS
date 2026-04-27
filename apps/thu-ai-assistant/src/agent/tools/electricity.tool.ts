import { getElectricityInfo } from "../../services/thu/data-service";
import { AgentTool } from "./types";

export const getElectricityTool: AgentTool = {
    definition: {
        type: "function",
        function: {
            name: "get_electricity",
            description: "获取宿舍电费余额信息",
            parameters: {
                type: "object",
                properties: {},
                required: [],
            },
        },
    },
    run: ({ helper }) => getElectricityInfo(helper),
};
