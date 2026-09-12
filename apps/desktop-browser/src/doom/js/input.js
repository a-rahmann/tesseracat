/**
 * OFFLINE DOOM - High Precision 360° FPS Input System
 * Provides raw mouse aiming (Valorant style), pointer lock capture, and responsive weapon controls.
 */
class InputManager {
    constructor() {
        this.keys = {};
        this.justPressed = {};
        this.mouseDeltaX = 0;
        this.mouseDeltaY = 0;
        this.isMouseDown = false;
        this.isPointerLocked = false;
        this.canvas = null;
        this.lastClientX = null;
        this.lastClientY = null;
        this.boundListeners = false;
    }

    init(canvas) {
        this.canvas = canvas;
        if (this.boundListeners) return;
        this.boundListeners = true;

        // 1. Keyboard Events
        window.addEventListener('keydown', (e) => {
            if (!this.keys[e.code]) {
                this.justPressed[e.code] = true;
            }
            this.keys[e.code] = true;

            // Prevent default browser scrolling on gameplay keys
            if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab', 'PageUp', 'PageDown'].includes(e.code)) {
                e.preventDefault();
            }
        });

        window.addEventListener('keyup', (e) => {
            this.keys[e.code] = false;
        });

        // 2. Mouse Click & Pointer Lock Capture
        const requestLock = () => {
            if (window.game && window.game.state === 'PLAYING') {
                this.requestPointerLock();
            }
        };

        this.canvas.addEventListener('mousedown', (e) => {
            if (e.button === 0) {
                this.isMouseDown = true;
                requestLock();
            }
        });

        window.addEventListener('mouseup', (e) => {
            if (e.button === 0) {
                this.isMouseDown = false;
            }
        });

        // Document level click capture during gameplay
        document.addEventListener('click', (e) => {
            if (window.game && window.game.state === 'PLAYING' && !this.isPointerLocked) {
                // If not clicking a button, lock cursor
                if (!e.target.closest('button')) {
                    this.requestPointerLock();
                }
            }
        });

        // 3. Pointer Lock Change State (With Transition Spike Suppression)
        let skipMouseFrames = 0;

        document.addEventListener('pointerlockchange', () => {
            this.isPointerLocked = (document.pointerLockElement === this.canvas || document.pointerLockElement === document.body);
            this.lastClientX = null;
            this.lastClientY = null;
            this.mouseDeltaX = 0;
            this.mouseDeltaY = 0;
            skipMouseFrames = 3; // Suppress browser transition spikes
            this.updatePrompt();
        });

        // 4. Smooth 360° Mouse Look Aiming
        const onMouseMove = (e) => {
            if (skipMouseFrames > 0) {
                skipMouseFrames--;
                return;
            }

            let dx = 0;
            let dy = 0;

            if (this.isPointerLocked) {
                dx = e.movementX || 0;
                dy = e.movementY || 0;
            } else if (window.game && window.game.state === 'PLAYING') {
                if (this.lastClientX !== null && this.lastClientY !== null) {
                    dx = e.clientX - this.lastClientX;
                    dy = e.clientY - this.lastClientY;
                }
                this.lastClientX = e.clientX;
                this.lastClientY = e.clientY;
            }

            // Smoothly clamp single-frame delta to prevent camera flipping / jarring spikes
            if (Math.abs(dx) < 160 && Math.abs(dy) < 160) {
                this.mouseDeltaX += Math.max(-50, Math.min(50, dx));
                this.mouseDeltaY += Math.max(-50, Math.min(50, dy));
            }
        };

        window.addEventListener('mousemove', onMouseMove);
        window.addEventListener('mouseleave', () => {
            this.lastClientX = null;
            this.lastClientY = null;
            skipMouseFrames = 2;
        });

        // 5. Mouse Wheel (Weapon Cycle)
        window.addEventListener('wheel', (e) => {
            if (window.player && window.player.cycleWeapon) {
                window.player.cycleWeapon();
            }
        }, { passive: true });
    }

    updatePrompt() {
        const prompt = document.getElementById('pointer-lock-prompt');
        if (!prompt) return;
        if (window.game && window.game.state === 'PLAYING' && !this.isPointerLocked) {
            prompt.classList.add('active');
        } else {
            prompt.classList.remove('active');
        }
    }

    requestPointerLock() {
        try {
            if (this.canvas && this.canvas.requestPointerLock) {
                this.canvas.requestPointerLock();
            }
        } catch (err) {
            // Browser security or user gesture exception
        }
    }

    exitPointerLock() {
        try {
            if (document.exitPointerLock && document.pointerLockElement) {
                document.exitPointerLock();
            }
        } catch (err) {}
    }

    isKeyDown(code) {
        return !!this.keys[code];
    }

    isKeyJustPressed(code) {
        return !!this.justPressed[code];
    }

    endFrame() {
        this.mouseDeltaX = 0;
        this.mouseDeltaY = 0;
        this.justPressed = {};
    }
}

window.inputManager = new InputManager();
