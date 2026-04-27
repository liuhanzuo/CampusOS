import { getLibraryInfo } from "../../services/thu/data-service";
import { AgentTool } from "./types";

export const getLibraryTool: AgentTool = {
    definition: {
        type: "function",
        function: {
            name: "get_library",
            description: "获取图书馆信息，包括各图书馆的座位情况",
            parameters: {
                type: "object",
                properties: {},
                required: [],
            },
        },
    },
    run: ({ helper }) => getLibraryInfo(helper),
};
