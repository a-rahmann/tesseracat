import { ActionCategory, RiskLevel } from '../../core-types/dist/index.js';

export class RiskClassifier {
  public static classifyTool(toolName: string): { category: ActionCategory; riskLevel: RiskLevel } {
    const lower = toolName.toLowerCase();

    if (lower.includes('read') || lower.includes('inspect') || lower.includes('search') || lower.includes('get')) {
      return { category: 'READ_PAGE', riskLevel: RiskLevel.LOW };
    }

    if (lower.includes('navigate') || lower.includes('switch_tab') || lower.includes('scroll')) {
      return { category: 'TAB_NAVIGATION', riskLevel: RiskLevel.LOW };
    }

    if (lower.includes('fill_preview') || lower.includes('map_profile')) {
      return { category: 'FORM_PREVIEW', riskLevel: RiskLevel.LOW };
    }

    if (lower.includes('submit_form') || lower.includes('click_submit')) {
      return { category: 'FORM_SUBMIT', riskLevel: RiskLevel.MEDIUM };
    }

    if (lower.includes('write_file') || lower.includes('upload_file') || lower.includes('rename')) {
      return { category: 'FILE_MODIFY', riskLevel: RiskLevel.MEDIUM };
    }

    if (lower.includes('delete') || lower.includes('remove') || lower.includes('trash')) {
      return { category: 'FILE_DELETE', riskLevel: RiskLevel.HIGH };
    }

    if (lower.includes('send_email') || lower.includes('post_tweet') || lower.includes('publish')) {
      return { category: 'SEND_COMMUNICATION', riskLevel: RiskLevel.HIGH };
    }

    if (lower.includes('auth') || lower.includes('login') || lower.includes('pay') || lower.includes('checkout')) {
      return { category: 'AUTHENTICATION', riskLevel: RiskLevel.CRITICAL };
    }

    return { category: 'READ_PAGE', riskLevel: RiskLevel.LOW };
  }
}
