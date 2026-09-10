export enum RiskLevel {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  CRITICAL = 'CRITICAL',
}

export enum PermissionLevel {
  /** Level 0: Automatic execution (read page, scroll, navigate, search, inspect DOM, harmless clicks) */
  LEVEL_0_AUTOMATIC = 0,
  /** Level 1: Contextual confirmation (file download, upload, modify document, send email draft) */
  LEVEL_1_CONTEXT_CONFIRMATION = 1,
  /** Level 2: Explicit confirmation required (credentials, password entry, financial action, purchase, delete data) */
  LEVEL_2_EXPLICIT_CONFIRMATION = 2,
}

export type ActionCategory =
  | 'READ_PAGE'
  | 'TAB_NAVIGATION'
  | 'DOWNLOAD_FILE'
  | 'FORM_PREVIEW'
  | 'FORM_SUBMIT'
  | 'FILE_UPLOAD'
  | 'FILE_MODIFY'
  | 'FILE_DELETE'
  | 'SEND_COMMUNICATION'
  | 'AUTHENTICATION'
  | 'PAYMENT'
  | 'INSTALL_CONNECTOR'
  | 'INTERACT_DOM';

export interface PolicyRule {
  id: string;
  category: ActionCategory;
  description: string;
  defaultRisk: RiskLevel;
  permissionLevel: PermissionLevel;
  requiresUserApproval: boolean;
  requiresUserTakeover: boolean;
  isBlockedByDefault: boolean;
  allowlist?: string[];
  denylist?: string[];
}

export interface PolicyContext {
  profileId: string;
  isAutonomousMission: boolean;
  missionAllowedTools?: string[];
  missionAllowedResources?: string[];
  dailyCloudSpendCapUSD: number;
  currentCloudSpendUSD: number;
}

export interface PolicyDecision {
  allowed: boolean;
  permissionLevel: PermissionLevel;
  requiresApproval: boolean;
  requiresTakeover: boolean;
  riskLevel: RiskLevel;
  ruleId?: string;
  reason: string;
}

export interface PermissionRequest {
  id: string;
  taskId: string;
  stepId?: string;
  domain: string;
  permissionLevel: PermissionLevel;
  title: string;
  description: string;
  actionDetails?: Record<string, unknown>;
  createdAt: string;
}

export interface PermissionResponse {
  requestId: string;
  approved: boolean;
  rememberChoice?: boolean;
  decidedAt: string;
}
