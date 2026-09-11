/**
 * Connected Services UI & Status Manager for Tesseract.
 *
 * Manages OAuth-connected accounts (Google Workspace, media services).
 * Invariant: Never renders password inputs. Only OAuth Connect/Disconnect workflows.
 */
export interface ServiceDisplayItem {
    id: string;
    name: string;
    icon: string;
    status: 'CONNECTED' | 'DISCONNECTED' | 'EXPIRED' | 'REQUIRES_SETUP';
    description: string;
    capabilities: string[];
}
export declare class ConnectedServicesManager {
    private static instance;
    private registry;
    private constructor();
    static getInstance(): ConnectedServicesManager;
    getServiceStatusList(): Promise<ServiceDisplayItem[]>;
    connect(serviceId: string, scopes?: string[]): Promise<boolean>;
    disconnect(serviceId: string): Promise<boolean>;
    /**
     * Generates a sleek dark-mode HTML fragment for the browser settings overlay.
     */
    generateModalHtml(services: ServiceDisplayItem[]): string;
    private getIconForService;
    private getDescriptionForService;
}
//# sourceMappingURL=connected-services.d.ts.map