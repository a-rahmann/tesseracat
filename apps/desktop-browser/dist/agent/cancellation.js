"use strict";
/**
 * Task Cancellation Tokens.
 * Enables immediate cancellation of active browser automation when user says "Stop" or presses Esc.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.CancellationToken = void 0;
class CancellationToken {
    _isCancelled = false;
    cancelCallbacks = [];
    get isCancelled() {
        return this._isCancelled;
    }
    cancel() {
        if (this._isCancelled)
            return;
        this._isCancelled = true;
        for (const cb of this.cancelCallbacks) {
            try {
                cb();
            }
            catch (err) {
                console.error('[CancellationToken] Error executing callback:', err);
            }
        }
    }
    onCancel(cb) {
        if (this._isCancelled) {
            cb();
        }
        else {
            this.cancelCallbacks.push(cb);
        }
    }
    throwIfCancelled() {
        if (this._isCancelled) {
            throw new Error('Task was cancelled by user');
        }
    }
}
exports.CancellationToken = CancellationToken;
//# sourceMappingURL=cancellation.js.map