import { sessionManager } from "../../session/session-manager";
import { AgentTool } from "./types";

export const rechargeCampusCardTool: AgentTool = {
    definition: {
        type: "function",
        function: {
            name: "recharge_campus_card",
            description: "准备校园卡充值动作，生成确认 token。充值金额范围为10~200元。只有用户确认后，才能调用 confirm_pending_action 创建支付订单。",
            parameters: {
                type: "object",
                properties: {
                    amount: {
                        type: "number",
                        description: "充值金额（元），范围10~200。",
                    },
                    pay_method: {
                        type: "string",
                        enum: ["wechat", "alipay"],
                        description: "支付方式，默认为微信支付(wechat)。可选：wechat（微信）、alipay（支付宝）。",
                    },
                },
                required: ["amount"],
            },
        },
    },
    run: async ({ sessionId }, args) => {
        if (!sessionId) {
            return { success: false, error: "缺少会话，无法创建待确认动作" };
        }
        const amount = Number(args.amount);
        const payMethod = args.pay_method || "wechat";
        if (!Number.isFinite(amount) || amount < 10 || amount > 200) {
            return { success: false, error: "校园卡充值金额需在 10~200 元之间" };
        }
        const action = sessionManager.createPendingAction(sessionId, {
            actionType: "campus_card_recharge",
            payload: { amount, payMethod },
            summary: `校园卡充值 ${amount} 元，支付方式：${payMethod === "alipay" ? "支付宝" : "微信"}`,
            risk: "medium",
        });
        return {
            success: true,
            status: "awaiting_confirmation",
            action_type: action.actionType,
            summary: action.summary,
            confirmation_token: action.token,
            expires_at: new Date(action.expiresAt).toISOString(),
            risk: action.risk,
            next_actions: [
                "请向用户复述金额和支付方式。",
                "只有用户明确说确认后，才调用 confirm_pending_action。",
            ],
        };
    },
};
