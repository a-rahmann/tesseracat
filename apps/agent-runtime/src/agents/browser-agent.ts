import {
  ElementTarget,
  PageObservation,
  VerificationStrategy,
} from '../../../../packages/core-types/dist/index.js';

export interface BrowserBridge {
  navigate(url: string): Promise<{ success: boolean; url?: string; error?: string }>;
  click(target: ElementTarget, options?: { doubleClick?: boolean }): Promise<{ success: boolean; error?: string }>;
  type(target: ElementTarget, text: string, options?: { clearFirst?: boolean; pressEnter?: boolean }): Promise<{ success: boolean; error?: string }>;
  keypress(key: string, modifiers?: string[]): Promise<{ success: boolean; error?: string }>;
  scroll(direction: 'up' | 'down' | 'top' | 'bottom', amount?: number): Promise<{ success: boolean; error?: string }>;
  wait(ms: number): Promise<{ success: boolean }>;
  observe(): Promise<PageObservation>;
  screenshot?(): Promise<string>;
}

export class BrowserAgent {
  private bridge: BrowserBridge;

  constructor(bridge: BrowserBridge) {
    this.bridge = bridge;
  }

  public setBridge(bridge: BrowserBridge): void {
    this.bridge = bridge;
  }

  public async observeCurrentState(): Promise<PageObservation> {
    return this.bridge.observe();
  }

  public async executeNavigate(url: string): Promise<{ success: boolean; error?: string }> {
    return this.bridge.navigate(url);
  }

  public async executeClick(target: ElementTarget): Promise<{ success: boolean; error?: string }> {
    return this.bridge.click(target);
  }

  public async executeType(
    target: ElementTarget,
    text: string,
    pressEnter: boolean = false
  ): Promise<{ success: boolean; error?: string }> {
    return this.bridge.type(target, text, { pressEnter });
  }

  public async executeKeypress(key: string): Promise<{ success: boolean; error?: string }> {
    return this.bridge.keypress(key);
  }

  public async executeScroll(direction: 'up' | 'down' = 'down'): Promise<{ success: boolean; error?: string }> {
    return this.bridge.scroll(direction);
  }

  public async executeWait(ms: number = 1000): Promise<{ success: boolean }> {
    return this.bridge.wait(ms);
  }
}
