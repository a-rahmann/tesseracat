/**
 * ToolRegistry: Comprehensive Tool Repository with Structured JSON Schemas & Safety Rules.
 */
import { CancellationToken } from './cancellation.js';
export type ActionSafetyCategory = 'READ' | 'LOW_RISK_ACTION' | 'EXTERNAL_COMMUNICATION' | 'PURCHASE' | 'CREDENTIAL' | 'DESTRUCTIVE' | 'HUMAN_HANDOFF';
export interface AgentTool {
    name: string;
    category: ActionSafetyCategory;
    description: string;
    parametersSchema: Record<string, any>;
    execute: (args: any, token?: CancellationToken) => Promise<any>;
}
export declare class ToolRegistry {
    private static instance;
    private tools;
    private constructor();
    static getInstance(): ToolRegistry;
    getTool(name: string): AgentTool | undefined;
    listTools(): AgentTool[];
    listToolNames(): string[];
    registerTool(tool: AgentTool): void;
    private registerDefaultTools;
}
//# sourceMappingURL=tool-registry.d.ts.map