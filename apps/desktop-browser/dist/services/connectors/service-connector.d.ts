/**
 * Common Service Connector Interface and Registry for Tesseract.
 *
 * Provides a standardized contract for native API integrations (Google Workspace, Microsoft,
 * productivity tools, media platforms), bypassing DOM manipulation for maximum speed,
 * reliability, and deterministic execution.
 */
export type AuthenticationState = 'CONNECTED' | 'DISCONNECTED' | 'EXPIRED' | 'REQUIRES_SETUP';
export interface ConnectorCapability {
    name: string;
    description: string;
    requiredScopes: string[];
    isDestructive?: boolean;
}
export interface ServiceConnector {
    id: string;
    name: string;
    authenticationState: AuthenticationState;
    capabilities: ConnectorCapability[];
    connect(scopes?: string[]): Promise<boolean>;
    disconnect(): Promise<boolean>;
    getCapabilities(): ConnectorCapability[];
    executeTool(toolName: string, params: any): Promise<any>;
    healthCheck(): Promise<{
        ok: boolean;
        status: string;
    }>;
}
export declare class ConnectorRegistry {
    private static instance;
    private connectors;
    private constructor();
    static getInstance(): ConnectorRegistry;
    registerConnector(connector: ServiceConnector): void;
    getConnector(id: string): ServiceConnector | undefined;
    listConnectors(): ServiceConnector[];
    findConnectorForTool(toolName: string): ServiceConnector | undefined;
    executeServiceTool(toolName: string, params: any): Promise<any>;
}
//# sourceMappingURL=service-connector.d.ts.map