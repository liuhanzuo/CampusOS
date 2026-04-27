import { rechargeCardInfo } from "../../services/thu/data-service";
import { AgentTool } from "./types";

export const rechargeCampusCardTool: AgentTool = {
    definition: {
        type: "function",
        function: {
            name: "recharge_campus_card",
            description: "校园卡充值，生成微信或支付宝支付二维码。用户可以扫码完成充值。充值金额范围为0.01~500元。",
            parameters: {
                type: "object",
                properties: {
                    amount: {
                        type: "number",
                        description: "充值金额（元），范围0.01~500。",
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
    run: ({ helper }, args) => rechargeCardInfo(
        helper,
        args.amount,
        args.pay_method || "wechat",
    ),
};
