import {
  ActionCategory,
  PermissionLevel,
  PolicyContext,
  PolicyDecision,
  RiskLevel,
} from '../../core-types/dist/index.js';

export class DeterministicPolicyEngine {
  /**
   * Evaluate whether a requested action can be performed under the active policy & context.
   * This is a purely deterministic function. LLMs cannot bypass or override this evaluation.
   */
  public evaluateAction(
    category: ActionCategory,
    toolName: string,
    params: Record<string, unknown>,
    context: PolicyContext
  ): PolicyDecision {
    // 1. NON-NEGOTIABLE HARD SECURITY BLOCKS
    if (this.isForbiddenAction(toolName, params)) {
      return {
        allowed: false,
        permissionLevel: PermissionLevel.LEVEL_2_EXPLICIT_CONFIRMATION,
        requiresApproval: false,
        requiresTakeover: true,
        riskLevel: RiskLevel.CRITICAL,
        reason: 'Action violates non-negotiable security rules (arbitrary script/shell execution, direct credential exfiltration).',
      };
    }

    // 2. LEVEL 2: EXPLICIT CONFIRMATION REQUIRED (Credentials, Authentication, Purchases, Financial)
    if (category === 'AUTHENTICATION' || category === 'PAYMENT' || toolName.includes('credential') || toolName.includes('password') || toolName.includes('checkout') || toolName.includes('purchase')) {
      return {
        allowed: true,
        permissionLevel: PermissionLevel.LEVEL_2_EXPLICIT_CONFIRMATION,
        requiresApproval: true,
        requiresTakeover: false,
        riskLevel: RiskLevel.CRITICAL,
        reason: 'Using saved credentials, entering passwords, or executing financial transactions requires explicit user confirmation.',
      };
    }

    // 3. CHECK AUTONOMOUS MISSION SCOPE
    if (context.isAutonomousMission && context.missionAllowedTools) {
      if (!context.missionAllowedTools.includes(toolName)) {
        return {
          allowed: false,
          permissionLevel: PermissionLevel.LEVEL_1_CONTEXT_CONFIRMATION,
          requiresApproval: true,
          requiresTakeover: false,
          riskLevel: RiskLevel.HIGH,
          reason: `Tool '${toolName}' is not in the explicit allowlist for this autonomous mission.`,
        };
      }
    }

    // 4. CATEGORY PERMISSION & RISK EVALUATION
    switch (category) {
      // LEVEL 0: AUTOMATIC EXECUTION
      case 'READ_PAGE':
      case 'TAB_NAVIGATION':
      case 'INTERACT_DOM':
      case 'FORM_PREVIEW':
        return {
          allowed: true,
          permissionLevel: PermissionLevel.LEVEL_0_AUTOMATIC,
          requiresApproval: false,
          requiresTakeover: false,
          riskLevel: RiskLevel.LOW,
          reason: 'Page inspection, navigation, scrolling, and harmless interactions are automatically permitted.',
        };

      // LEVEL 1: CONTEXTUAL CONFIRMATION REQUIRED
      case 'DOWNLOAD_FILE':
      case 'FILE_UPLOAD':
      case 'FILE_MODIFY':
      case 'SEND_COMMUNICATION':
      case 'INSTALL_CONNECTOR':
        return {
          allowed: true,
          permissionLevel: PermissionLevel.LEVEL_1_CONTEXT_CONFIRMATION,
          requiresApproval: true,
          requiresTakeover: false,
          riskLevel: RiskLevel.MEDIUM,
          reason: 'File operations and communication drafts require contextual user confirmation.',
        };

      // LEVEL 2: DESTRUCTIVE OR SENSITIVE SUBMISSION
      case 'FORM_SUBMIT':
        return {
          allowed: true,
          permissionLevel: PermissionLevel.LEVEL_1_CONTEXT_CONFIRMATION,
          requiresApproval: !context.isAutonomousMission,
          requiresTakeover: false,
          riskLevel: RiskLevel.MEDIUM,
          reason: 'Form submission requires final user confirmation before submitting.',
        };

      case 'FILE_DELETE':
        return {
          allowed: true,
          permissionLevel: PermissionLevel.LEVEL_2_EXPLICIT_CONFIRMATION,
          requiresApproval: true,
          requiresTakeover: false,
          riskLevel: RiskLevel.HIGH,
          reason: 'Deleting files requires explicit confirmation.',
        };

      default:
        return {
          allowed: false,
          permissionLevel: PermissionLevel.LEVEL_2_EXPLICIT_CONFIRMATION,
          requiresApproval: true,
          requiresTakeover: false,
          riskLevel: RiskLevel.HIGH,
          reason: 'Unrecognized action category defaults to explicit confirmation.',
        };
    }
  }

  private isForbiddenAction(toolName: string, params: Record<string, unknown>): boolean {
    const forbiddenTools = [
      'execute_arbitrary_js',
      'eval_script',
      'terminal_command',
      'shell_exec',
      'raw_sql_query',
      'read_passwords',
      'extract_cookies',
      'dump_keychain',
      'bypass_captcha',
    ];

    const lowerTool = toolName.toLowerCase();
    if (forbiddenTools.some(f => lowerTool.includes(f))) {
      return true;
    }

    if (params) {
      const serialized = JSON.stringify(params).toLowerCase();
      if (
        serialized.includes('eval(') ||
        serialized.includes('child_process') ||
        serialized.includes('/etc/passwd')
      ) {
        return true;
      }
    }

    return false;
  }
}
