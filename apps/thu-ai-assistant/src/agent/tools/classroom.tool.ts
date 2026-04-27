import { getClassroomInfo } from "../../services/thu/data-service";
import { AgentTool } from "./types";

export const getClassroomTool: AgentTool = {
    definition: {
        type: "function",
        function: {
            name: "get_classroom",
            description: "查询教室使用状态/空闲教室",
            parameters: {
                type: "object",
                properties: {
                    building: {
                        type: "string",
                        description: "教学楼名称，如：六教、三教等。不填则返回所有教学楼列表。",
                    },
                    week: {
                        type: "number",
                        description: "查询的周次，不填则查询当前周",
                    },
                },
                required: [],
            },
        },
    },
    run: ({ helper }, args) => getClassroomInfo(helper, args.building, args.week),
};
