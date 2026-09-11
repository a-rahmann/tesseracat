/**
 * Native Service Connectors Index and Initialization.
 */

import { ConnectorRegistry } from './service-connector.js';
import { GoogleConnector } from './google-connector.js';
import { GmailTools } from './gmail-tools.js';
import { CalendarTools } from './calendar-tools.js';
import { DriveTools } from './drive-tools.js';
import { YouTubeTools } from './youtube-tools.js';

export * from './service-connector.js';
export * from './credential-vault.js';
export * from './google-connector.js';
export * from './gmail-tools.js';
export * from './calendar-tools.js';
export * from './drive-tools.js';
export * from './youtube-tools.js';

export function initializeConnectors(): ConnectorRegistry {
  const registry = ConnectorRegistry.getInstance();
  const google = GoogleConnector.getInstance();

  // Register domain tools on the Google connector
  GmailTools.register(google);
  CalendarTools.register(google);
  DriveTools.register(google);
  YouTubeTools.register(google);

  // Register Google connector with the central registry
  registry.registerConnector(google);

  return registry;
}
