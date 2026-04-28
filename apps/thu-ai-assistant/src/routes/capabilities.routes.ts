import { Router } from "express";
import { campusCapabilities } from "../agent/tools/capabilities";

export const capabilitiesRouter = Router();

capabilitiesRouter.get("/api/capabilities", (req, res) => {
    const category = typeof req.query.category === "string" ? req.query.category : undefined;
    const includePlanned = req.query.include_planned !== "false";
    const data = campusCapabilities.filter((capability) => {
        if (!includePlanned && capability.status === "planned") return false;
        if (category && capability.category !== category) return false;
        return true;
    });

    res.json({
        success: true,
        data,
        count: data.length,
    });
});
