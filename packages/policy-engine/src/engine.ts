import {
  ActionCategory,
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
    // 1. NON-NEGOTIABLE SECURITY BLOCKS
    if (this.isForbiddenAction(toolName, params)) {
      return {
        allowed: false,
        requiresApproval: false,
        requiresTakeover: true,
        riskLevel: RiskLevel.CRITICAL,
        reason: 'Action violates non-negotiable security rules (e.g. arbitrary JS, raw terminal commands, credential access).',
      };
    }

    // 2. CHECK SENSITIVE AUTHENTICATION / PAYMENT TAKEOVER
    if (category === 'AUTHENTICATION' || category === 'PAYMENT') {
      return {
        allowed: false,
        requiresApproval: false,
        requiresTakeover: true,
        riskLevel: RiskLevel.CRITICAL,
        reason: 'Authentication, CAPTCHAs, OTPs, passkeys and payment completion require user takeover.',
      };
    }

    // 3. CHECK AUTONOMOUS MISSION SCOPE
    if (context.isAutonomousMission) {
      if (
        context.missionAllowedTools &&
        !context.missionAllowedTools.includes(toolName)
      ) {
        return {
          allowed: false,
          requiresApproval: false,
          requiresTakeover: false,
          riskLevel: RiskLevel.HIGH,
          reason: `Tool '${toolName}' is not in the explicit allowlist for this autonomous mission.`,
        };
      }
    }

    // 4. CATEGORY RISK EVALUATION
    switch (category) {
      case 'READ_PAGE':
      case 'TAB_NAVIGATION':
      case 'INTERACT_DOM':
        return {
          allowed: true,
          requiresApproval: false,
          requiresTakeover: false,
          riskLevel: RiskLevel.LOW,
          reason: 'Read-only page inspection and navigation are permitted.',
        };

      case 'DOWNLOAD_FILE':
      case 'FORM_PREVIEW':
        return {
          allowed: true,
          requiresApproval: false,
          requiresTakeover: false,
          riskLevel: RiskLevel.LOW,
          reason: 'Safe preview and ordinary downloads are allowed.',
        };

      case 'FORM_SUBMIT':
        return {
          allowed: true,
          requiresApproval: !context.isAutonomousMission,
          requiresTakeover: false,
          riskLevel: RiskLevel.MEDIUM,
          reason: 'Form submission requires explicit final user confirmation unless permitted by mission scope.',
        };

      case 'FILE_UPLOAD':
      case 'FILE_MODIFY':
        return {
          allowed: true,
          requiresApproval: true,
          requiresTakeover: false,
          riskLevel: RiskLevel.MEDIUM,
          reason: 'File modification and uploads require user confirmation showing source and destination.',
        };

      case 'FILE_DELETE':
        return {
          allowed: true,
          requiresApproval: true,
          requiresTakeover: false,
          riskLevel: RiskLevel.HIGH,
          reason: 'Broad deletion is not allowed by default; requires explicit confirmation and trash fallback.',
        };

      case 'SEND_COMMUNICATION':
        return {
          allowed: true,
          requiresApproval: true,
          requiresTakeover: false,
          riskLevel: RiskLevel.HIGH,
          reason: 'Sending emails or posting publicly requires explicit user approval.',
        };

      case 'INSTALL_CONNECTOR':
        return {
          allowed: true,
          requiresApproval: true,
          requiresTakeover: false,
          riskLevel: RiskLevel.HIGH,
          reason: 'Installing connectors or granting new capabilities requires explicit user approval.',
        };

      default:
        return {
          allowed: false,
          requiresApproval: true,
          requiresTakeover: false,
          riskLevel: RiskLevel.HIGH,
          reason: 'Unrecognized action category defaults to restricted state.',
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
    ];

    if (forbiddenTools.includes(toolName.toLowerCase())) {
      return true;
    }

    // Check if parameters contain dangerous code execution requests
    const paramsStr = JSON.stringify(params).toLowerCase();
    if (paramsStr.includes('javascript:') || paramsStr.includes('<script>') || paramsStr.includes('eval(')) {
      return true;
    }

    return false;
  }
}
