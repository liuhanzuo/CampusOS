import { InfoHelper } from "@thu-info/lib";

export interface ToolContext {
    helper: InfoHelper;
}

export interface AgentTool {
    definition: {
        type: "function";
        function: {
            name: string;
            description: string;
            parameters: Record<string, unknown>;
        };
    };
    run: (ctx: ToolContext, args: any) => Promise<unknown>;
}
