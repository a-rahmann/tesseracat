/**
 * Task Cancellation Tokens.
 * Enables immediate cancellation of active browser automation when user says "Stop" or presses Esc.
 */

export class CancellationToken {
  private _isCancelled = false;
  private cancelCallbacks: Array<() => void> = [];

  public get isCancelled(): boolean {
    return this._isCancelled;
  }

  public cancel(): void {
    if (this._isCancelled) return;
    this._isCancelled = true;
    for (const cb of this.cancelCallbacks) {
      try {
        cb();
      } catch (err) {
        console.error('[CancellationToken] Error executing callback:', err);
      }
    }
  }

  public onCancel(cb: () => void): void {
    if (this._isCancelled) {
      cb();
    } else {
      this.cancelCallbacks.push(cb);
    }
  }

  public throwIfCancelled(): void {
    if (this._isCancelled) {
      throw new Error('Task was cancelled by user');
    }
  }
}
