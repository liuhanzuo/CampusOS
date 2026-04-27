import { getCardInfo } from "../../services/thu/data-service";
import { AgentTool } from "./types";

export const getCardInfoTool: AgentTool = {
    definition: {
        type: "function",
        function: {
            name: "get_card_info",
            description: "获取校园卡信息，包括余额、状态等",
            parameters: {
                type: "object",
                properties: {},
                required: [],
            },
        },
    },
    run: ({ helper }) => getCardInfo(helper),
};
