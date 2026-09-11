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
  healthCheck(): Promise<{ ok: boolean; status: string }>;
}

export class ConnectorRegistry {
  private static instance: ConnectorRegistry | null = null;
  private connectors: Map<string, ServiceConnector> = new Map();

  private constructor() {}

  public static getInstance(): ConnectorRegistry {
    if (!ConnectorRegistry.instance) {
      ConnectorRegistry.instance = new ConnectorRegistry();
    }
    return ConnectorRegistry.instance;
  }

  public registerConnector(connector: ServiceConnector): void {
    this.connectors.set(connector.id, connector);
    console.log(`[ConnectorRegistry] Registered connector: ${connector.name} (${connector.id})`);
  }

  public getConnector(id: string): ServiceConnector | undefined {
    return this.connectors.get(id);
  }

  public listConnectors(): ServiceConnector[] {
    return Array.from(this.connectors.values());
  }

  public findConnectorForTool(toolName: string): ServiceConnector | undefined {
    for (const connector of this.connectors.values()) {
      if (connector.getCapabilities().some(c => c.name === toolName)) {
        return connector;
      }
    }
    return undefined;
  }

  public async executeServiceTool(toolName: string, params: any): Promise<any> {
    const connector = this.findConnectorForTool(toolName);
    if (!connector) {
      throw new Error(`No service connector found providing tool: "${toolName}"`);
    }

    if (connector.authenticationState !== 'CONNECTED') {
      throw new Error(`Connector "${connector.name}" is not authenticated (state: ${connector.authenticationState}). Run connect() first.`);
    }

    return connector.executeTool(toolName, params);
  }
}
