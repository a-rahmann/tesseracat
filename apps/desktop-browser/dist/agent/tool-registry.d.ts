/**
 * ToolRegistry: Central repository for all autonomous browser tools with safety categorization.
 */
import { CancellationToken } from './cancellation.js';
export type ActionSafetyCategory = 'READ' | 'LOW_RISK_ACTION' | 'EXTERNAL_COMMUNICATION' | 'PURCHASE' | 'CREDENTIAL' | 'DESTRUCTIVE';
export interface AgentTool {
    name: string;
    category: ActionSafetyCategory;
    description: string;
    parameters: string;
    execute: (args: any, token?: CancellationToken) => Promise<any>;
}
export declare class ToolRegistry {
    private static instance;
    private tools;
    private constructor();
    static getInstance(): ToolRegistry;
    getTool(name: string): AgentTool | undefined;
    listTools(): AgentTool[];
    registerTool(tool: AgentTool): void;
    private registerDefaultTools;
}
//# sourceMappingURL=tool-registry.d.ts.map