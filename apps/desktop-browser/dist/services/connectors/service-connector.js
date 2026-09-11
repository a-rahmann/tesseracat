"use strict";
/**
 * Common Service Connector Interface and Registry for Tesseract.
 *
 * Provides a standardized contract for native API integrations (Google Workspace, Microsoft,
 * productivity tools, media platforms), bypassing DOM manipulation for maximum speed,
 * reliability, and deterministic execution.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.ConnectorRegistry = void 0;
class ConnectorRegistry {
    static instance = null;
    connectors = new Map();
    constructor() { }
    static getInstance() {
        if (!ConnectorRegistry.instance) {
            ConnectorRegistry.instance = new ConnectorRegistry();
        }
        return ConnectorRegistry.instance;
    }
    registerConnector(connector) {
        this.connectors.set(connector.id, connector);
        console.log(`[ConnectorRegistry] Registered connector: ${connector.name} (${connector.id})`);
    }
    getConnector(id) {
        return this.connectors.get(id);
    }
    listConnectors() {
        return Array.from(this.connectors.values());
    }
    findConnectorForTool(toolName) {
        for (const connector of this.connectors.values()) {
            if (connector.getCapabilities().some(c => c.name === toolName)) {
                return connector;
            }
        }
        return undefined;
    }
    async executeServiceTool(toolName, params) {
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
exports.ConnectorRegistry = ConnectorRegistry;
//# sourceMappingURL=service-connector.js.map