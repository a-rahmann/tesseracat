export enum TaskStatus {
  CREATED = 'CREATED',
  UNDERSTANDING = 'UNDERSTANDING',
  PLANNING = 'PLANNING',
  WAITING_FOR_APPROVAL = 'WAITING_FOR_APPROVAL',
  EXECUTING = 'EXECUTING',
  VERIFYING = 'VERIFYING',
  COMPLETED = 'COMPLETED',
  NEEDS_CLARIFICATION = 'NEEDS_CLARIFICATION',
  WAITING_FOR_USER = 'WAITING_FOR_USER',
  RETRYING_SAFE_STEP = 'RETRYING_SAFE_STEP',
  NEEDS_ALTERNATIVE = 'NEEDS_ALTERNATIVE',
  PAUSED = 'PAUSED',
  FAILED = 'FAILED',
  CANCELLED = 'CANCELLED',
}

export interface TaskStep {
  id: string;
  stepNumber: number;
  description: string;
  toolName?: string;
  toolParameters?: Record<string, unknown>;
  status: 'PENDING' | 'WAITING_APPROVAL' | 'RUNNING' | 'SUCCESS' | 'FAILED' | 'SKIPPED';
  result?: unknown;
  error?: string;
  startedAt?: string;
  completedAt?: string;
}

export interface TaskApprovalRequest {
  id: string;
  taskId: string;
  stepId: string;
  actionType: string;
  targetResource: string;
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  description: string;
  proposedParameters: Record<string, unknown>;
  approved?: boolean;
  decidedAt?: string;
  decidedBy?: string;
}

export interface TaskConfidenceScore {
  percentage: number;
  rating: 'Low' | 'Medium' | 'High';
  factors: {
    sourceAgreementCount: number;
    sourceFreshnessDays: number;
    extractionReliability: number;
    unansweredConstraints: string[];
  };
}

export interface TaskRecord {
  id: string;
  profileId: string;
  userGoal: string;
  status: TaskStatus;
  planSteps: TaskStep[];
  activeStepIndex: number;
  confidence?: TaskConfidenceScore;
  approvals: TaskApprovalRequest[];
  errorHistory: string[];
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
}
