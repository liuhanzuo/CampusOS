import { Router } from "express";
import { sessionManager } from "../session/session-manager";
import { sportsSeleniumService } from "../services/sports-selenium/sports-selenium-service";
import { sportsIdInfoList } from "../services/thu/data-service";

export const sportsRouter = Router();

sportsRouter.get("/api/sports/venues", (_req, res) => {
    console.log("[API] GET /api/sports/venues");
    res.json({
        success: true,
        data: sportsIdInfoList,
    });
});

sportsRouter.post("/api/sports/login", async (req, res) => {
    const sessionId = req.session.sessionId;
    console.log(`[API] POST /api/sports/login - sessionId=${sessionId}`);

    if (!sessionId || !sessionManager.isLoggedIn(sessionId)) {
        return res.status(401).json({ error: "请先登录主系统" });
    }

    const helper = sessionManager.getHelper(sessionId);
    if (!helper) {
        return res.status(401).json({ error: "会话已过期，请重新登录" });
    }

    try {
        const success = await sportsSeleniumService.login(
            helper.userId,
            helper.password,
            {
                onProgress: (msg) => console.log(`[Sports] ${msg}`),
                onError: (err) => console.error(`[Sports] ${err}`),
                onSuccess: () => console.log("[Sports] 登录成功"),
            },
            true,
        );

        res.json({ success, message: "登录成功" });
    } catch (e: any) {
        console.error("[API] 体育系统登录失败:", e.message);
        res.status(500).json({ error: e.message || "登录失败" });
    }
});

sportsRouter.post("/api/sports/query", async (req, res) => {
    const sessionId = req.session.sessionId;
    console.log(`[API] POST /api/sports/query - sessionId=${sessionId}`);

    if (!sessionId || !sessionManager.isLoggedIn(sessionId)) {
        return res.status(401).json({ error: "请先登录" });
    }

    const { venueName, date } = req.body;

    if (!venueName || !date) {
        return res.status(400).json({ error: "请提供场馆名称和日期" });
    }

    console.log(`[API] 查询体育场馆: venue=${venueName}, date=${date}`);

    try {
        const result = await sportsSeleniumService.queryVenue(venueName, date);
        console.log(`[API] 查询成功，找到 ${result.slots.length} 个时段`);
        res.json({ success: true, data: result });
    } catch (e: any) {
        console.error("[API] 查询体育场馆失败:", e.message);
        res.status(500).json({ error: e.message || "查询失败" });
    }
});

sportsRouter.post("/api/sports/book", async (req, res) => {
    const sessionId = req.session.sessionId;
    console.log(`[API] POST /api/sports/book - sessionId=${sessionId}`);

    if (!sessionId || !sessionManager.isLoggedIn(sessionId)) {
        return res.status(401).json({ error: "请先登录" });
    }

    const { venueName, date, timeSlot } = req.body;

    if (!venueName || !date || !timeSlot) {
        return res.status(400).json({ error: "请提供完整信息（场馆名称、日期、时间段）" });
    }

    console.log(`[API] 预约体育场地: venue=${venueName}, date=${date}, time=${timeSlot}`);

    try {
        const result = await sportsSeleniumService.bookVenue(venueName, date, timeSlot);
        console.log(`[API] 预约${result.success ? "成功" : "失败"}: ${result.message}`);
        res.json(result);
    } catch (e: any) {
        console.error("[API] 预约体育场地失败:", e.message);
        res.status(500).json({ error: e.message || "预约失败" });
    }
});

sportsRouter.post("/api/sports/open-booking", async (req, res) => {
    const sessionId = req.session.sessionId;
    console.log(`[API] POST /api/sports/open-booking - sessionId=${sessionId}`);

    if (!sessionId || !sessionManager.isLoggedIn(sessionId)) {
        return res.status(401).json({ error: "请先登录" });
    }

    const { venueName, date } = req.body;

    if (!venueName) {
        return res.status(400).json({ error: "请提供场馆名称" });
    }

    try {
        const result = await sportsSeleniumService.openInteractiveBookingPage(venueName, date);
        res.json(result);
    } catch (e: any) {
        console.error("[API] 打开体育预约页失败:", e.message);
        res.status(500).json({ error: e.message || "打开预约页失败" });
    }
});

sportsRouter.get("/api/sports/captcha/screenshot", async (req, res) => {
    const sessionId = req.session.sessionId;
    console.log(`[API] GET /api/sports/captcha/screenshot - sessionId=${sessionId}`);

    if (!sessionId || !sessionManager.isLoggedIn(sessionId)) {
        return res.status(401).json({ error: "请先登录" });
    }

    try {
        const result = await sportsSeleniumService.getCaptchaSnapshot();
        res.json(result);
    } catch (e: any) {
        console.error("[API] 获取体育验证码截图失败:", e.message);
        res.status(500).json({ error: e.message || "获取验证码截图失败" });
    }
});

sportsRouter.post("/api/sports/captcha/drag", async (req, res) => {
    const sessionId = req.session.sessionId;
    console.log(`[API] POST /api/sports/captcha/drag - sessionId=${sessionId}`);

    if (!sessionId || !sessionManager.isLoggedIn(sessionId)) {
        return res.status(401).json({ error: "请先登录" });
    }

    const { points } = req.body;
    if (!Array.isArray(points)) {
        return res.status(400).json({ error: "请提供拖动轨迹 points" });
    }

    try {
        const result = await sportsSeleniumService.replayCaptchaDrag(points);
        res.json(result);
    } catch (e: any) {
        console.error("[API] 回放体育验证码拖动失败:", e.message);
        res.status(500).json({ error: e.message || "回放拖动失败" });
    }
});

sportsRouter.post("/api/sports/logout", async (_req, res) => {
    try {
        await sportsSeleniumService.close();
        res.json({ success: true, message: "已登出体育系统" });
    } catch (e: any) {
        console.error("[API] 登出体育系统失败:", e.message);
        res.status(500).json({ error: e.message || "登出失败" });
    }
});
