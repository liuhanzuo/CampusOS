import { Router } from "express";
import { sessionManager } from "../session/session-manager";
import { rechargeCardInfo } from "../services/thu/data-service";

export const cardRouter = Router();

cardRouter.post("/api/card/recharge", async (req, res) => {
    const sessionId = req.session.sessionId;
    console.log(`[API] POST /api/card/recharge - sessionId=${sessionId}`);

    if (!sessionId || !sessionManager.isLoggedIn(sessionId)) {
        return res.status(401).json({ error: "请先登录" });
    }

    const helper = sessionManager.getHelper(sessionId);
    if (!helper) {
        return res.status(401).json({ error: "会话已过期，请重新登录" });
    }

    const { amount, payMethod } = req.body;
    if (!amount || amount <= 0) {
        return res.status(400).json({ error: "请输入有效的充值金额" });
    }

    console.log(`[API] 校园卡充值: amount=${amount}, payMethod=${payMethod || "wechat"}`);

    try {
        const result = await rechargeCardInfo(helper, amount, payMethod || "wechat");
        return res.json(result);
    } catch (e: any) {
        console.error("[API] 充值失败:", e.message);
        return res.status(500).json({ error: e.message || "充值失败" });
    }
});
