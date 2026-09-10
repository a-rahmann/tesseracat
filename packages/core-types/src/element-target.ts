export interface ElementCoordinates {
  x: number;
  y: number;
}

export interface ElementTarget {
  /** CSS selector, ID, or data attribute (e.g. "#search", "[name='q']") */
  selector?: string;
  /** Accessibility role (e.g. "button", "textbox", "link", "combobox") */
  role?: string;
  /** Accessible name or aria-label (e.g. "Search", "Submit", "Google Search") */
  name?: string;
  /** Exact or partial visible text */
  text?: string;
  /** Placeholder attribute value */
  placeholder?: string;
  /** Visual coordinate fallback */
  point?: ElementCoordinates;
}

export interface ObservedElement {
  id?: string;
  tagName: string;
  role?: string;
  name?: string;
  text?: string;
  type?: string;
  placeholder?: string;
  selector: string;
  isVisible: boolean;
  isEnabled: boolean;
  rect?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

export interface PageObservation {
  url: string;
  title: string;
  ready: boolean;
  focusedElement?: ObservedElement;
  interactiveElements: ObservedElement[];
  mainTextSnippet: string;
  timestamp: string;
}

export type VerificationType =
  | 'URL_MATCH'
  | 'ELEMENT_EXISTS'
  | 'ELEMENT_TEXT_EQUALS'
  | 'ELEMENT_VALUE_EQUALS'
  | 'PAGE_TEXT_CONTAINS'
  | 'ELEMENT_CLICKED'
  | 'NONE';

export interface VerificationStrategy {
  type: VerificationType;
  expectedValue?: string;
  target?: ElementTarget;
  timeoutMs?: number;
}

export interface VerificationResult {
  verified: boolean;
  strategy: VerificationType;
  details: string;
  observation?: PageObservation;
  diagnostics?: string;
}
