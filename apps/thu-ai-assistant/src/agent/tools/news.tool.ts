import { getNewsInfo } from "../../services/thu/data-service";
import { AgentTool } from "./types";

export const getNewsTool: AgentTool = {
    definition: {
        type: "function",
        function: {
            name: "get_news",
            description: "获取清华校内新闻/通知/公告，可以按关键词搜索",
            parameters: {
                type: "object",
                properties: {
                    keyword: {
                        type: "string",
                        description: "搜索关键词，不填则获取最新新闻",
                    },
                },
                required: [],
            },
        },
    },
    run: ({ helper }, args) => getNewsInfo(helper, args.keyword),
};
