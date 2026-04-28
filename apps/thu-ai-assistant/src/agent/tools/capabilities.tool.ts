import { campusCapabilities } from "./capabilities";
import { AgentTool } from "./types";

export const listCapabilitiesTool: AgentTool = {
    definition: {
        type: "function",
        function: {
            name: "list_capabilities",
            description: "列出 Campus Agent 当前支持和计划支持的全部校园功能，以及每个功能对应的工具和示例问法。",
            parameters: {
                type: "object",
                properties: {
                    category: {
                        type: "string",
                        description: "可选。按分类过滤，例如：学习、生活、预约、信息。",
                    },
                    include_planned: {
                        type: "boolean",
                        description: "是否包含 planned 状态的能力，默认 true。",
                    },
                },
                required: [],
            },
        },
    },
    run: async (_ctx, args) => {
        const includePlanned = args.include_planned !== false;
        const category = typeof args.category === "string" ? args.category : undefined;
        const data = campusCapabilities.filter((capability) => {
            if (!includePlanned && capability.status === "planned") return false;
            if (category && capability.category !== category) return false;
            return true;
        });

        return {
            success: true,
            status: "ok",
            data,
            message: `当前共 ${data.length} 个校园能力模块。`,
            next_actions: [
                "可以直接用自然语言发起查询，例如：查课表、查校园卡余额、明天羽毛球场有空吗。",
                "对预约、支付、取消、改密等真实操作，Agent 会先准备信息并要求用户确认。",
            ],
        };
    },
};
