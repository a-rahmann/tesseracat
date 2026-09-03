export enum RiskLevel {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  CRITICAL = 'CRITICAL',
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
  requiresApproval: boolean;
  requiresTakeover: boolean;
  riskLevel: RiskLevel;
  ruleId?: string;
  reason: string;
}
