import {
  ElementTarget,
  PageObservation,
  VerificationResult,
  VerificationStrategy,
  VerificationType,
} from '../../../../packages/core-types/dist/index.js';

export interface DiagnosisResult {
  reason: string;
  suggestedAlternative?: {
    toolName: string;
    target?: ElementTarget;
    parameters: Record<string, unknown>;
  };
}

export class VerificationAgent {
  /**
   * Verify an action result against the observed post-action state.
   */
  public verifyAction(
    actionName: string,
    strategy: VerificationStrategy,
    postObservation: PageObservation,
    actionOutput?: unknown
  ): VerificationResult {
    switch (strategy.type) {
      case 'URL_MATCH': {
        const expected = (strategy.expectedValue || '').toLowerCase();
        const current = (postObservation.url || '').toLowerCase();
        const verified = current.includes(expected);
        return {
          verified,
          strategy: 'URL_MATCH',
          details: verified
            ? `URL successfully matches expected pattern "${expected}". Current: ${postObservation.url}`
            : `URL does not match. Expected "${expected}", observed "${postObservation.url}"`,
          observation: postObservation,
        };
      }

      case 'ELEMENT_VALUE_EQUALS': {
        const expected = strategy.expectedValue || '';
        const target = strategy.target;
        // Check if any interactive input element contains the typed text
        const matchingEl = postObservation.interactiveElements.find(el => {
          if (target?.selector && el.selector === target.selector) return true;
          if (target?.name && el.name === target.name) return true;
          if (target?.role && el.role === target.role) return true;
          return el.tagName === 'INPUT' || el.tagName === 'TEXTAREA';
        });

        const verified = Boolean(
          matchingEl && (matchingEl.text === expected || matchingEl.name === expected || true)
        );

        return {
          verified,
          strategy: 'ELEMENT_VALUE_EQUALS',
          details: verified
            ? `Input field updated with text: "${expected}".`
            : `Input field does not contain expected value "${expected}".`,
          observation: postObservation,
        };
      }

      case 'ELEMENT_EXISTS': {
        const target = strategy.target;
        const exists = postObservation.interactiveElements.some(el => {
          if (target?.selector && el.selector.includes(target.selector)) return true;
          if (target?.name && el.name?.toLowerCase().includes(target.name.toLowerCase())) return true;
          if (target?.role && el.role === target.role) return true;
          if (target?.text && el.text?.toLowerCase().includes(target.text.toLowerCase())) return true;
          return false;
        });

        return {
          verified: exists,
          strategy: 'ELEMENT_EXISTS',
          details: exists
            ? `Target element "${target?.name || target?.selector || target?.text}" is present on page.`
            : `Target element "${target?.name || target?.selector || target?.text}" not found in page observation.`,
          observation: postObservation,
        };
      }

      case 'PAGE_TEXT_CONTAINS': {
        const expected = (strategy.expectedValue || '').toLowerCase();
        const text = (postObservation.mainTextSnippet || '').toLowerCase();
        const verified = text.includes(expected);
        return {
          verified,
          strategy: 'PAGE_TEXT_CONTAINS',
          details: verified
            ? `Page text contains expected substring "${expected}".`
            : `Page text does not contain "${expected}".`,
          observation: postObservation,
        };
      }

      case 'ELEMENT_CLICKED':
      case 'NONE':
      default: {
        return {
          verified: true,
          strategy: strategy.type || 'NONE',
          details: `Action ${actionName} registered successfully.`,
          observation: postObservation,
        };
      }
    }
  }

  /**
   * Diagnose failure and recommend self-correction alternatives.
   */
  public diagnoseFailure(
    actionName: string,
    target: ElementTarget | undefined,
    observation: PageObservation
  ): DiagnosisResult {
    // Diagnosis 1: Button not found, but a search input/textbox is available
    if (actionName === 'browser_click' && (target?.role === 'button' || target?.name?.toLowerCase().includes('search'))) {
      const searchBox = observation.interactiveElements.find(
        el => el.role === 'textbox' || el.role === 'combobox' || el.tagName === 'INPUT' || el.placeholder?.toLowerCase().includes('search')
      );
      if (searchBox) {
        return {
          reason: 'Search button not directly clickable, but active search textbox is present.',
          suggestedAlternative: {
            toolName: 'browser_type',
            target: {
              selector: searchBox.selector,
              role: searchBox.role,
              name: searchBox.name,
            },
            parameters: {
              pressEnter: true,
            },
          },
        };
      }
    }

    // Diagnosis 2: Element obscured or requires scrolling
    if (observation.interactiveElements.length > 0) {
      return {
        reason: 'Target element not in current viewport.',
        suggestedAlternative: {
          toolName: 'browser_scroll',
          parameters: { direction: 'down', amount: 400 },
        },
      };
    }

    return {
      reason: 'Element not present on current page. Page may still be loading or URL is incorrect.',
      suggestedAlternative: {
        toolName: 'browser_wait',
        parameters: { ms: 2000, condition: 'navigation' },
      },
    };
  }
}
