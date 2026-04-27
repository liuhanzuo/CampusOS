import { getReportInfo } from "../../services/thu/data-service";
import { AgentTool } from "./types";

export const getReportTool: AgentTool = {
    definition: {
        type: "function",
        function: {
            name: "get_report",
            description: "获取用户的成绩单/成绩信息，包括课程名称、学分、成绩、绩点等",
            parameters: {
                type: "object",
                properties: {},
                required: [],
            },
        },
    },
    run: ({ helper }) => getReportInfo(helper),
};
