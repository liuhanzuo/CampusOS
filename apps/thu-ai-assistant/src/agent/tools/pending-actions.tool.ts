import {
    bookLibraryRoomInfo,
    bookLibrarySeatInfo,
    cancelLibraryBookingInfo,
    cancelSportsBookingInfo,
    rechargeCardInfo,
    rechargeElectricityInfo,
    submitSportsBookingInfo,
} from "../../services/thu/data-service";
import { sportsSeleniumService } from "../../services/sports-selenium/sports-selenium-service";
import { sessionManager } from "../../session/session-manager";
import { AgentTool } from "./types";

const getSportsTokens = () => ({
    token: (globalThis as any).__sportsJwtToken,
    refreshToken: (globalThis as any).__sportsRefreshToken,
});

export const listPendingActionsTool: AgentTool = {
    definition: {
        type: "function",
        function: {
            name: "list_pending_actions",
            description: "列出当前会话中等待用户确认的真实动作，例如充值、预约页打开、取消预约等。",
            parameters: {
                type: "object",
                properties: {},
                required: [],
            },
        },
    },
    run: async ({ sessionId }) => {
        if (!sessionId) {
            return { success: false, error: "缺少会话，无法读取待确认动作" };
        }
        const actions = sessionManager.listPendingActions(sessionId);
        return {
            success: true,
            status: "ok",
            data: actions.map((action) => ({
                action_type: action.actionType,
                summary: action.summary,
                confirmation_token: action.token,
                expires_at: new Date(action.expiresAt).toISOString(),
                risk: action.risk,
            })),
        };
    },
};

export const confirmPendingActionTool: AgentTool = {
    definition: {
        type: "function",
        function: {
            name: "confirm_pending_action",
            description: "在用户明确确认后执行一个真实动作。可执行校园卡充值下单、电费充值下单、打开体育预约页、提交/取消图书馆座位或研读间预约、提交/取消体育预约等。",
            parameters: {
                type: "object",
                properties: {
                    confirmation_token: {
                        type: "string",
                        description: "prepare 工具返回的确认 token。",
                    },
                    captcha_verification: {
                        type: "string",
                        description: "可选，体育预约滑块验证码通过后返回的校验串。",
                    },
                },
                required: ["confirmation_token"],
            },
        },
    },
    run: async ({ helper, sessionId }, args) => {
        if (!sessionId) {
            return { success: false, error: "缺少会话，无法确认动作" };
        }
        const action = sessionManager.consumePendingAction(sessionId, args.confirmation_token);
        if (!action) {
            return {
                success: false,
                status: "not_found_or_expired",
                error: "待确认动作不存在或已过期，请重新发起。",
            };
        }

        if (action.actionType === "campus_card_recharge") {
            const result = await rechargeCardInfo(
                helper,
                action.payload.amount,
                action.payload.payMethod,
            );
            return {
                ...result,
                status: result.success ? "executed" : "failed",
                action_type: action.actionType,
                summary: action.summary,
                paymentMarker: result.success ? `[PAY_QR:${(result as any).data.payUrl}]` : undefined,
                message: result.success
                    ? "校园卡充值订单已创建，请使用返回的支付链接或二维码完成支付。"
                    : (result as any).error,
            };
        }

        if (action.actionType === "electricity_recharge") {
            const result = await rechargeElectricityInfo(helper, action.payload.amount);
            return {
                ...result,
                status: result.success ? "executed" : "failed",
                action_type: action.actionType,
                summary: action.summary,
                paymentMarker: result.success ? `[PAY_QR:${(result as any).data.payUrl}]` : undefined,
            };
        }

        if (action.actionType === "library_room_booking") {
            const result = await bookLibraryRoomInfo(
                helper,
                action.payload.roomName,
                action.payload.date,
                action.payload.start,
                action.payload.end,
                action.payload.members || [],
            );
            return {
                ...result,
                status: result.success ? "executed" : "failed",
                action_type: action.actionType,
                summary: action.summary,
            };
        }

        if (action.actionType === "library_seat_booking") {
            const result = await bookLibrarySeatInfo(helper, action.payload);
            return {
                ...result,
                status: result.success ? "executed" : (result as any).status || "failed",
                action_type: action.actionType,
                summary: action.summary,
            };
        }

        if (action.actionType === "cancel_library_booking") {
            const result = await cancelLibraryBookingInfo(
                helper,
                action.payload.bookingId,
                action.payload.bookingType,
            );
            return {
                ...result,
                status: result.success ? "executed" : (result as any).status || "failed",
                action_type: action.actionType,
                summary: action.summary,
            };
        }

        if (action.actionType === "sports_booking") {
            const userId = sessionManager.getUserId(sessionId);
            if (!userId) {
                return { success: false, status: "missing_user", error: "缺少当前用户 ID，无法提交体育预约。" };
            }
            const result = await submitSportsBookingInfo(
                helper,
                userId,
                action.payload,
                args.captcha_verification || "",
            );
            const renewedAction = (result as any).status === "captcha_required_or_failed"
                ? sessionManager.createPendingAction(sessionId, {
                    actionType: action.actionType,
                    payload: action.payload,
                    summary: action.summary,
                    risk: action.risk,
                })
                : null;
            return {
                ...result,
                action_type: action.actionType,
                summary: action.summary,
                confirmation_token: renewedAction?.token,
                expires_at: renewedAction ? new Date(renewedAction.expiresAt).toISOString() : undefined,
                message: result.success
                    ? (result as any).message || "体育预约已提交。"
                    : (result as any).error,
                next_actions: (result as any).status === "captcha_required_or_failed"
                    ? [
                        "请调用 open_sports_booking_page 打开真实预约页完成滑块验证码。",
                        "如果前端拿到了 captcha_verification，可用新的 confirmation_token 再次确认提交。",
                    ]
                    : undefined,
            };
        }

        if (action.actionType === "cancel_sports_booking") {
            const result = await cancelSportsBookingInfo(helper, action.payload.bookingId);
            return {
                ...result,
                status: result.success ? "executed" : (result as any).status || "failed",
                action_type: action.actionType,
                summary: action.summary,
            };
        }

        if (action.actionType === "open_sports_booking_page") {
            if (action.payload.gymId && action.payload.itemId) {
                await helper.getSportsResources(
                    action.payload.gymId,
                    action.payload.itemId,
                    action.payload.date || new Date().toISOString().slice(0, 10),
                ).catch((e: any) => {
                    console.log(`[Sports] 确认打开预约页前获取 token/余量失败，继续尝试打开页面: ${e.message}`);
                });
            }
            const result = await sportsSeleniumService.openInteractiveBookingPage(
                action.payload.venueName,
                action.payload.date,
                getSportsTokens(),
            );
            return {
                ...result,
                status: result.success ? "executed" : "failed",
                action_type: action.actionType,
                summary: action.summary,
                captchaPanelMarker: result.success ? "[SPORTS_CAPTCHA:current]" : undefined,
                message: result.success
                    ? "已在服务端 Chrome 中打开真实体育预约页面，并复用当前登录态。请用户通过已打开的浏览器窗口或验证码辅助面板完成时段选择、滑块验证码和最终确认。"
                    : result.message,
            };
        }

        return {
            success: false,
            status: "unsupported_action",
            action_type: action.actionType,
            error: "该待确认动作暂未接入执行器。",
        };
    },
};
