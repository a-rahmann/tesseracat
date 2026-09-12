/**
 * OFFLINE DOOM - Core Game Controller & Loop
 * Orchestrates game state transitions, entity updates, rendering, and win/loss conditions.
 */
class Game {
    constructor() {
        this.state = 'MENU'; // MENU, PLAYING, PAUSED, GAMEOVER, VICTORY
        this.lastTime = 0;
        this.fps = 60;
        this.fpsCounter = 0;
        this.fpsTimer = 0;
        this.gameTime = 0;

        this.canvas = null;
        this.renderer = null;
        this.enemies = [];
        this.projectiles = [];
        this.isInitialized = false;
    }

    init(canvas) {
        if (this.isInitialized) return;
        this.canvas = canvas;

        // Initialize sub-systems
        window.assetManager.init();
        this.renderer = new window.RaycastRenderer(canvas);
        window.inputManager.init(canvas);

        this.isInitialized = true;
        this.startLoop();
    }

    startNewGame() {
        window.soundEngine.init();
        window.soundEngine.resume();

        this.loadLevel(1, false);

        // Transition State
        this.state = 'PLAYING';
        window.mainUI.showScreen('game');
        window.inputManager.requestPointerLock();
        window.inputManager.updatePrompt();

        // Start Ambient OST if music enabled
        if (window.storageManager.get('musicVolume') > 0) {
            window.soundEngine.startMusic();
        }
    }

    loadLevel(levelIndex = 1, preservePlayer = false) {
        this.currentLevelIndex = levelIndex;
        const levelData = (levelIndex === 2 && window.LEVEL_2_DATA) ? window.LEVEL_2_DATA : window.LEVEL_1_DATA;

        window.mapManager.loadLevel(levelData);

        const pStart = levelData.playerStart;
        if (!preservePlayer) {
            window.player.reset(pStart.x, pStart.y, pStart.angle);
            window.weaponManager.reset();
            this.gameTime = 0;
        } else {
            window.player.x = pStart.x;
            window.player.y = pStart.y;
            window.player.angle = pStart.angle;
            window.player.pitch = 0;
            window.player.keys = { blue: false, red: false };
        }

        this.enemies = levelData.enemies.map(e => new window.Enemy(e.type, e.x, e.y));
        this.projectiles = [];
        this.renderer.vfx.reset();

        window.hudManager.messages = [];
        window.hudManager.addMessage(`MISSION: ${levelData.name} - PURGE DEMONS & ESCAPE`, '#00ffcc');
    }

    pauseGame() {
        if (this.state !== 'PLAYING') return;
        this.state = 'PAUSED';
        window.inputManager.exitPointerLock();
        window.inputManager.updatePrompt();
        window.mainUI.showScreen('pause');
    }

    resumeGame() {
        if (this.state !== 'PAUSED') return;
        this.state = 'PLAYING';
        window.mainUI.showScreen('game');
        window.inputManager.requestPointerLock();
        window.inputManager.updatePrompt();
    }

    restartGame() {
        this.startNewGame();
    }

    goToMenu() {
        this.state = 'MENU';
        window.soundEngine.stopMusic();
        window.inputManager.exitPointerLock();
        window.inputManager.updatePrompt();
        window.mainUI.showScreen('main-menu');
    }

    triggerGameOver() {
        this.state = 'GAMEOVER';
        window.soundEngine.stopMusic();
        window.inputManager.exitPointerLock();
        window.inputManager.updatePrompt();

        // Save records
        const isNewHigh = window.storageManager.recordScore(
            window.player.score,
            Math.floor(this.gameTime),
            window.player.kills
        );

        window.mainUI.showGameOverScreen({
            score: window.player.score,
            kills: window.player.kills,
            time: Math.floor(this.gameTime),
            isNewHigh
        });
    }

    triggerVictory() {
        this.state = 'VICTORY';
        window.soundEngine.stopMusic();
        window.soundEngine.playVictory();
        window.inputManager.exitPointerLock();
        window.inputManager.updatePrompt();

        // Save records
        const isNewHigh = window.storageManager.recordScore(
            window.player.score,
            Math.floor(this.gameTime),
            window.player.kills
        );

        window.mainUI.showVictoryScreen({
            score: window.player.score,
            kills: window.player.kills,
            time: Math.floor(this.gameTime),
            isNewHigh
        });
    }

    startLoop() {
        this.lastTime = performance.now();
        const loop = (now) => {
            const dt = Math.min(0.1, (now - this.lastTime) / 1000);
            this.lastTime = now;

            this.updateFPS(dt);
            this.update(dt);
            this.render();

            window.inputManager.endFrame();
            requestAnimationFrame(loop);
        };
        requestAnimationFrame(loop);
    }

    updateFPS(dt) {
        this.fpsTimer += dt;
        this.fpsCounter++;
        if (this.fpsTimer >= 0.5) {
            this.fps = Math.round((this.fpsCounter / this.fpsTimer));
            this.fpsCounter = 0;
            this.fpsTimer = 0;
        }
    }

    update(dt) {
        // Handle Pause Toggle (ESC or P)
        if (window.inputManager.isKeyJustPressed('Escape') || window.inputManager.isKeyJustPressed('KeyP')) {
            if (this.state === 'PLAYING') {
                this.pauseGame();
            } else if (this.state === 'PAUSED') {
                if (window.mainUI && window.mainUI.currentScreen === 'settings') {
                    window.mainUI.showScreen('pause');
                } else {
                    this.resumeGame();
                }
            }
        }

        // Toggle Minimap (Tab)
        if (window.inputManager.isKeyJustPressed('Tab')) {
            window.hudManager.showMinimap = !window.hudManager.showMinimap;
        }

        if (this.state !== 'PLAYING') return;

        this.gameTime += dt;

        // 1. Update Player
        window.player.update(dt, window.inputManager, window.collisionSystem, window.mapManager);

        // Check if player died
        if (window.player.isDead) {
            this.triggerGameOver();
            return;
        }

        // 2. Update Weapons
        window.weaponManager.update(
            dt,
            window.player,
            window.inputManager,
            this.enemies,
            window.mapManager,
            this.renderer.vfx
        );

        // 3. Update Enemies & AI
        for (let i = this.enemies.length - 1; i >= 0; i--) {
            const enemy = this.enemies[i];
            enemy.update(
                dt,
                window.player,
                window.mapManager,
                window.collisionSystem,
                this.projectiles,
                this.renderer.vfx
            );
        }

        // 4. Update Projectiles
        for (let i = this.projectiles.length - 1; i >= 0; i--) {
            const proj = this.projectiles[i];
            proj.update(dt, window.player, window.mapManager, this.renderer.vfx);
            if (proj.isDead) {
                this.projectiles.splice(i, 1);
            }
        }

        // 5. Update VFX & HUD
        this.renderer.vfx.update(dt);
        window.hudManager.update(dt);

        // 6. Check Level Progression / Campaign Victory Condition
        if (window.mapManager.isExit(window.player.x, window.player.y)) {
            this.triggerVictory();
        }
    }

    render() {
        if (this.state === 'MENU') return;

        // 1. 3D Raycasting & Sprite Render Pass
        this.renderer.render(
            window.player,
            window.mapManager,
            this.enemies,
            this.projectiles,
            window.weaponManager
        );

        // 2. 2D HUD & Overlay Render Pass
        window.hudManager.render(
            this.renderer.ctx,
            this.renderer.width,
            this.renderer.height,
            window.player,
            window.mapManager,
            this.enemies
        );
    }
}

window.game = new Game();
