/**
 * Connected Services UI & Status Manager for Tesseract.
 *
 * Manages OAuth-connected accounts (Google Workspace, media services).
 * Invariant: Never renders password inputs. Only OAuth Connect/Disconnect workflows.
 */

import { ConnectorRegistry, ServiceConnector } from '../services/connectors/service-connector.js';

export interface ServiceDisplayItem {
  id: string;
  name: string;
  icon: string;
  status: 'CONNECTED' | 'DISCONNECTED' | 'EXPIRED' | 'REQUIRES_SETUP';
  description: string;
  capabilities: string[];
}

export class ConnectedServicesManager {
  private static instance: ConnectedServicesManager | null = null;
  private registry = ConnectorRegistry.getInstance();

  private constructor() {}

  public static getInstance(): ConnectedServicesManager {
    if (!ConnectedServicesManager.instance) {
      ConnectedServicesManager.instance = new ConnectedServicesManager();
    }
    return ConnectedServicesManager.instance;
  }

  public async getServiceStatusList(): Promise<ServiceDisplayItem[]> {
    const connectors = this.registry.listConnectors();
    const results: ServiceDisplayItem[] = [];

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

  public async connect(serviceId: string, scopes?: string[]): Promise<boolean> {
    const connector = this.registry.getConnector(serviceId);
    if (!connector) {
      throw new Error(`Unknown service: ${serviceId}`);
    }
    return connector.connect(scopes);
  }

  public async disconnect(serviceId: string): Promise<boolean> {
    const connector = this.registry.getConnector(serviceId);
    if (!connector) {
      throw new Error(`Unknown service: ${serviceId}`);
    }
    return connector.disconnect();
  }

  /**
   * Generates a sleek dark-mode HTML fragment for the browser settings overlay.
   */
  public generateModalHtml(services: ServiceDisplayItem[]): string {
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
            : `<button class="btn-connect" onclick="window.tesseractAPI?.connectService('${s.id}')">Connect with OAuth</button>`
          }
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

  private getIconForService(serviceId: string): string {
    switch (serviceId.toLowerCase()) {
      case 'google': return '🌐';
      case 'youtube': return '▶️';
      case 'microsoft': return '🪟';
      default: return '🔌';
    }
  }

  private getDescriptionForService(serviceId: string): string {
    switch (serviceId.toLowerCase()) {
      case 'google': return 'Direct REST access for Gmail, Google Calendar, Google Drive, and YouTube playback.';
      default: return 'Native service connector.';
    }
  }
}
