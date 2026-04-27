import { getScheduleInfo } from "../../services/thu/data-service";
import { AgentTool } from "./types";

export const getScheduleTool: AgentTool = {
    definition: {
        type: "function",
        function: {
            name: "get_schedule",
            description: "获取用户的课程表/课表信息，包括课程名称、上课时间、上课地点等",
            parameters: {
                type: "object",
                properties: {},
                required: [],
            },
        },
    },
    run: ({ helper }) => getScheduleInfo(helper),
};
