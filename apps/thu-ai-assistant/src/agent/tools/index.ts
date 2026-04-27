import { InfoHelper } from "@thu-info/lib";
import { getCalendarTool } from "./calendar.tool";
import { rechargeCampusCardTool } from "./campus-card-recharge.tool";
import { getCardInfoTool } from "./card-info.tool";
import { getClassroomTool } from "./classroom.tool";
import { getElectricityTool } from "./electricity.tool";
import { getLibraryTool } from "./library.tool";
import { getNewsTool } from "./news.tool";
import { getReportTool } from "./report.tool";
import { getScheduleTool } from "./schedule.tool";
import { getSportsResourcesTool } from "./sports-resources.tool";
import { getAvailableSportsVenuesTool } from "./sports-venues.tool";
import { AgentTool } from "./types";

const toolRegistry: AgentTool[] = [
    getScheduleTool,
    getSportsResourcesTool,
    getReportTool,
    getCardInfoTool,
    getElectricityTool,
    getLibraryTool,
    getNewsTool,
    getCalendarTool,
    getClassroomTool,
    getAvailableSportsVenuesTool,
    rechargeCampusCardTool,
];

export const tools = toolRegistry.map((tool) => tool.definition);

export async function executeTool(
    helper: InfoHelper,
    toolName: string,
    args: any = {},
): Promise<string> {
    try {
        const tool = toolRegistry.find((item) => item.definition.function.name === toolName);
        if (!tool) {
            return JSON.stringify({ error: `未知工具: ${toolName}` });
        }
        const result = await tool.run({ helper }, args);
        return JSON.stringify(result);
    } catch (e: any) {
        return JSON.stringify({ error: e.message || "工具执行失败" });
    }
}
