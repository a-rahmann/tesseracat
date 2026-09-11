"use strict";
/**
 * Connected Services UI & Status Manager for Tesseract.
 *
 * Manages OAuth-connected accounts (Google Workspace, media services).
 * Invariant: Never renders password inputs. Only OAuth Connect/Disconnect workflows.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.ConnectedServicesManager = void 0;
const service_connector_js_1 = require("../services/connectors/service-connector.js");
class ConnectedServicesManager {
    static instance = null;
    registry = service_connector_js_1.ConnectorRegistry.getInstance();
    constructor() { }
    static getInstance() {
        if (!ConnectedServicesManager.instance) {
            ConnectedServicesManager.instance = new ConnectedServicesManager();
        }
        return ConnectedServicesManager.instance;
    }
    async getServiceStatusList() {
        const connectors = this.registry.listConnectors();
        const results = [];
        for (const connector of connectors) {
            const health = await connector.healthCheck().catch(() => ({ ok: false, status: 'Error' }));
            results.push({
                id: connector.id,
                name: connector.name,
                icon: this.getIconForService(connector.id),
                status: connector.authenticationState,
                description: this.getDescriptionForService(connector.id),
                capabilities: connector.getCapabilities().map(c => c.name),
            });
        }
        return results;
    }
    async connect(serviceId, scopes) {
        const connector = this.registry.getConnector(serviceId);
        if (!connector) {
            throw new Error(`Unknown service: ${serviceId}`);
        }
        return connector.connect(scopes);
    }
    async disconnect(serviceId) {
        const connector = this.registry.getConnector(serviceId);
        if (!connector) {
            throw new Error(`Unknown service: ${serviceId}`);
        }
        return connector.disconnect();
    }
    /**
     * Generates a sleek dark-mode HTML fragment for the browser settings overlay.
     */
    generateModalHtml(services) {
        const itemsHtml = services.map(s => `
      <div class="service-card" data-service-id="${s.id}">
        <div class="service-header">
          <div class="service-icon">${s.icon}</div>
          <div class="service-info">
            <h4 class="service-name">${s.name}</h4>
            <p class="service-desc">${s.description}</p>
          </div>
          <div class="service-status badge-${s.status.toLowerCase()}">${s.status}</div>
        </div>
        <div class="service-capabilities">
          ${s.capabilities.map(c => `<span class="cap-tag">${c}</span>`).join('')}
        </div>
        <div class="service-actions">
          ${s.status === 'CONNECTED'
            ? `<button class="btn-disconnect" onclick="window.tesseractAPI?.disconnectService('${s.id}')">Disconnect</button>`
            : `<button class="btn-connect" onclick="window.tesseractAPI?.connectService('${s.id}')">Connect with OAuth</button>`}
        </div>
      </div>
    `).join('\n');
        return `
      <div class="connected-services-modal">
        <div class="modal-header">
          <h3>Connected Services</h3>
          <p>Native API integrations bypass the DOM for instant, 100% reliable execution.</p>
        </div>
        <div class="services-list">
          ${itemsHtml}
        </div>
      </div>
    `;
    }
    getIconForService(serviceId) {
        switch (serviceId.toLowerCase()) {
            case 'google': return '🌐';
            case 'youtube': return '▶️';
            case 'microsoft': return '🪟';
            default: return '🔌';
        }
    }
    getDescriptionForService(serviceId) {
        switch (serviceId.toLowerCase()) {
            case 'google': return 'Direct REST access for Gmail, Google Calendar, Google Drive, and YouTube playback.';
            default: return 'Native service connector.';
        }
    }
}
exports.ConnectedServicesManager = ConnectedServicesManager;
//# sourceMappingURL=connected-services.js.map