/**
 * OFFLINE DOOM - Main Entry Point & UI Controller
 * 100% Offline Game for Agentic Browser
 */

class MainUI {
    constructor() {
        this.currentScreen = 'main-menu';
        this.container = document.getElementById('game-container');
        this.canvas = document.getElementById('game-canvas');
    }

    init() {
        this.previousScreen = 'main-menu';
        this.bindEvents();
        this.loadSettingsToUI();
        this.updateMenuScores();

        // Apply CRT effect from storage
        const crtEnabled = window.storageManager.get('crtEffect');
        this.setCRT(crtEnabled);

        // Apply Audio Configuration
        window.soundEngine.setMasterVolume(window.storageManager.get('masterVolume'));
        window.soundEngine.setMasterMute(window.storageManager.get('masterMuted'));
        window.soundEngine.setSoundVolume(window.storageManager.get('soundVolume'));
        window.soundEngine.setSfxMute(window.storageManager.get('sfxMuted'));
        window.soundEngine.setMusicVolume(window.storageManager.get('musicVolume'));
        window.soundEngine.setMusicMute(window.storageManager.get('musicMuted'));

        // Initialize Game Canvas
        window.game.init(this.canvas);
    }

    setCRT(enabled) {
        if (enabled) {
            this.container.classList.add('crt-active');
        } else {
            this.container.classList.remove('crt-active');
        }
    }

    showScreen(screenId) {
        if (this.currentScreen !== 'settings' && this.currentScreen !== screenId) {
            this.previousScreen = this.currentScreen;
        }
        this.currentScreen = screenId;
        const screens = document.querySelectorAll('.ui-screen');
        screens.forEach(s => s.classList.remove('active'));

        if (screenId === 'game') {
            // All modal screens hidden
            return;
        }

        const target = document.getElementById(`screen-${screenId}`);
        if (target) {
            target.classList.add('active');
        }

        if (screenId === 'main-menu') {
            this.updateMenuScores();
        }
    }

    openSettings(fromScreen = 'main-menu') {
        if (window.soundEngine) window.soundEngine.playMenuClick();
        this.previousScreen = fromScreen;
        this.loadSettingsToUI();
        this.showScreen('settings');
    }

    closeSettings() {
        if (window.soundEngine) window.soundEngine.playMenuClick();
        if (this.previousScreen === 'pause' || (window.game && window.game.state === 'PAUSED')) {
            this.showScreen('pause');
        } else {
            this.showScreen('main-menu');
        }
    }

    updateMenuScores() {
        const highScore = window.storageManager.get('highScore') || 0;
        const bestKills = window.storageManager.get('killsRecord') || 0;
        const bestTime = window.storageManager.get('bestTime') || 0;

        const elScore = document.getElementById('menu-high-score');
        const elKills = document.getElementById('menu-best-kills');
        const elTime = document.getElementById('menu-best-time');

        if (elScore) elScore.innerText = highScore.toLocaleString();
        if (elKills) elKills.innerText = bestKills;
        if (elTime) {
            if (bestTime > 0) {
                const m = Math.floor(bestTime / 60).toString().padStart(2, '0');
                const s = (bestTime % 60).toString().padStart(2, '0');
                elTime.innerText = `${m}:${s}`;
            } else {
                elTime.innerText = '--:--';
            }
        }
    }

    loadSettingsToUI() {
        const sMaster = document.getElementById('setting-master');
        const sSound = document.getElementById('setting-sound');
        const sMusic = document.getElementById('setting-music');
        const sSens = document.getElementById('setting-sens');
        const sCrt = document.getElementById('setting-crt');

        const vMaster = document.getElementById('val-master');
        const vSound = document.getElementById('val-sound');
        const vMusic = document.getElementById('val-music');
        const vSens = document.getElementById('val-sens');
        const vCrt = document.getElementById('val-crt');

        const btnMuteMaster = document.getElementById('btn-mute-master');
        const btnMuteSfx = document.getElementById('btn-mute-sfx');
        const btnMuteMusic = document.getElementById('btn-mute-music');

        if (sMaster) {
            sMaster.value = window.storageManager.get('masterVolume');
            vMaster.innerText = `${Math.round(sMaster.value * 100)}%`;
        }
        if (sSound) {
            sSound.value = window.storageManager.get('soundVolume');
            vSound.innerText = `${Math.round(sSound.value * 100)}%`;
        }
        if (sMusic) {
            sMusic.value = window.storageManager.get('musicVolume');
            vMusic.innerText = `${Math.round(sMusic.value * 100)}%`;
        }
        if (sSens) {
            sSens.value = window.storageManager.get('mouseSensitivity');
            vSens.innerText = `${parseFloat(sSens.value).toFixed(1)}x`;
        }
        if (sCrt) {
            sCrt.checked = window.storageManager.get('crtEffect');
            vCrt.innerText = sCrt.checked ? 'ENABLED' : 'DISABLED';
        }

        // Mute state buttons
        const isMasterMuted = window.storageManager.get('masterMuted');
        const isSfxMuted = window.storageManager.get('sfxMuted');
        const isMusicMuted = window.storageManager.get('musicMuted');

        if (btnMuteMaster) {
            btnMuteMaster.innerText = isMasterMuted ? '🔇 MUTED' : '🔊 MUTE';
            btnMuteMaster.classList.toggle('muted', isMasterMuted);
        }
        if (btnMuteSfx) {
            btnMuteSfx.innerText = isSfxMuted ? '🔇 MUTED' : '🔊 MUTE';
            btnMuteSfx.classList.toggle('muted', isSfxMuted);
        }
        if (btnMuteMusic) {
            btnMuteMusic.innerText = isMusicMuted ? '🔇 MUTED' : '🎵 MUTE';
            btnMuteMusic.classList.toggle('muted', isMusicMuted);
        }
    }

    bindEvents() {
        const playBtnSound = () => window.soundEngine.playMenuClick();

        // 1. Main Menu Buttons
        document.getElementById('btn-play')?.addEventListener('click', () => {
            playBtnSound();
            window.game.startNewGame();
        });

        document.getElementById('btn-how-to-play')?.addEventListener('click', () => {
            playBtnSound();
            this.showScreen('how-to-play');
        });

        document.getElementById('btn-settings')?.addEventListener('click', () => {
            playBtnSound();
            this.previousScreen = 'main-menu';
            this.loadSettingsToUI();
            this.showScreen('settings');
        });

        document.getElementById('btn-credits')?.addEventListener('click', () => {
            playBtnSound();
            this.showScreen('credits');
        });

        // 2. Back to Main Menu Buttons
        document.getElementById('btn-back-how-to-play')?.addEventListener('click', () => {
            playBtnSound();
            this.showScreen('main-menu');
        });

        document.getElementById('btn-back-credits')?.addEventListener('click', () => {
            playBtnSound();
            this.showScreen('main-menu');
        });

        // 3. Settings Form Listeners
        const sMaster = document.getElementById('setting-master');
        const sSound = document.getElementById('setting-sound');
        const sMusic = document.getElementById('setting-music');
        const sSens = document.getElementById('setting-sens');
        const sCrt = document.getElementById('setting-crt');

        const btnMuteMaster = document.getElementById('btn-mute-master');
        const btnMuteSfx = document.getElementById('btn-mute-sfx');
        const btnMuteMusic = document.getElementById('btn-mute-music');

        sMaster?.addEventListener('input', (e) => {
            const val = parseFloat(e.target.value);
            document.getElementById('val-master').innerText = `${Math.round(val * 100)}%`;
            window.soundEngine.setMasterVolume(val);
            window.storageManager.set('masterVolume', val);
            if (window.soundEngine.isMasterMuted) {
                window.soundEngine.setMasterMute(false);
                window.storageManager.set('masterMuted', false);
                if (btnMuteMaster) {
                    btnMuteMaster.innerText = '🔊 MUTE';
                    btnMuteMaster.classList.remove('muted');
                }
            }
        });

        sSound?.addEventListener('input', (e) => {
            const val = parseFloat(e.target.value);
            document.getElementById('val-sound').innerText = `${Math.round(val * 100)}%`;
            window.soundEngine.setSoundVolume(val);
            window.storageManager.set('soundVolume', val);
            if (window.soundEngine.isSfxMuted) {
                window.soundEngine.setSfxMute(false);
                window.storageManager.set('sfxMuted', false);
                if (btnMuteSfx) {
                    btnMuteSfx.innerText = '🔊 MUTE';
                    btnMuteSfx.classList.remove('muted');
                }
            }
        });

        sMusic?.addEventListener('input', (e) => {
            const val = parseFloat(e.target.value);
            document.getElementById('val-music').innerText = `${Math.round(val * 100)}%`;
            window.soundEngine.setMusicVolume(val);
            window.storageManager.set('musicVolume', val);
            if (window.soundEngine.isMusicMuted) {
                window.soundEngine.setMusicMute(false);
                window.storageManager.set('musicMuted', false);
                if (btnMuteMusic) {
                    btnMuteMusic.innerText = '🎵 MUTE';
                    btnMuteMusic.classList.remove('muted');
                }
            }
        });

        btnMuteMaster?.addEventListener('click', () => {
            playBtnSound();
            const isMuted = window.soundEngine.toggleMasterMute();
            window.storageManager.set('masterMuted', isMuted);
            btnMuteMaster.innerText = isMuted ? '🔇 MUTED' : '🔊 MUTE';
            btnMuteMaster.classList.toggle('muted', isMuted);
        });

        btnMuteSfx?.addEventListener('click', () => {
            playBtnSound();
            const isMuted = window.soundEngine.toggleSfxMute();
            window.storageManager.set('sfxMuted', isMuted);
            btnMuteSfx.innerText = isMuted ? '🔇 MUTED' : '🔊 MUTE';
            btnMuteSfx.classList.toggle('muted', isMuted);
        });

        btnMuteMusic?.addEventListener('click', () => {
            playBtnSound();
            const isMuted = window.soundEngine.toggleMusicMute();
            window.storageManager.set('musicMuted', isMuted);
            btnMuteMusic.innerText = isMuted ? '🔇 MUTED' : '🎵 MUTE';
            btnMuteMusic.classList.toggle('muted', isMuted);
        });

        sSens?.addEventListener('input', (e) => {
            const val = parseFloat(e.target.value);
            document.getElementById('val-sens').innerText = `${val.toFixed(1)}x`;
            window.storageManager.set('mouseSensitivity', val);
        });

        sCrt?.addEventListener('change', (e) => {
            const val = e.target.checked;
            document.getElementById('val-crt').innerText = val ? 'ENABLED' : 'DISABLED';
            this.setCRT(val);
            window.storageManager.set('crtEffect', val);
        });

        document.getElementById('btn-save-settings')?.addEventListener('click', () => {
            playBtnSound();
            if (this.previousScreen === 'pause' && window.game && window.game.state === 'PAUSED') {
                this.showScreen('pause');
            } else {
                this.showScreen('main-menu');
            }
        });

        // 4. Pause Screen Buttons
        document.getElementById('btn-resume')?.addEventListener('click', () => {
            playBtnSound();
            window.game.resumeGame();
        });

        document.getElementById('btn-settings-pause')?.addEventListener('click', () => {
            playBtnSound();
            this.previousScreen = 'pause';
            this.loadSettingsToUI();
            this.showScreen('settings');
        });

        document.getElementById('btn-restart-pause')?.addEventListener('click', () => {
            playBtnSound();
            window.game.restartGame();
        });

        document.getElementById('btn-menu-pause')?.addEventListener('click', () => {
            playBtnSound();
            window.game.goToMenu();
        });

        // 5. Game Over Screen Buttons
        document.getElementById('btn-retry')?.addEventListener('click', () => {
            playBtnSound();
            window.game.startNewGame();
        });

        document.getElementById('btn-menu-go')?.addEventListener('click', () => {
            playBtnSound();
            window.game.goToMenu();
        });

        // 6. Victory Screen Buttons
        document.getElementById('btn-play-again')?.addEventListener('click', () => {
            playBtnSound();
            window.game.startNewGame();
        });

        document.getElementById('btn-menu-vic')?.addEventListener('click', () => {
            playBtnSound();
            window.game.goToMenu();
        });
    }

    showGameOverScreen(data) {
        document.getElementById('go-score').innerText = data.score.toLocaleString();
        document.getElementById('go-kills').innerText = data.kills;
        document.getElementById('go-time').innerText = `${data.time}s`;

        const newHighTag = document.getElementById('go-new-high');
        if (newHighTag) {
            newHighTag.style.display = data.isNewHigh ? 'block' : 'none';
        }

        this.showScreen('gameover');
    }

    showVictoryScreen(data) {
        document.getElementById('vic-score').innerText = data.score.toLocaleString();
        document.getElementById('vic-kills').innerText = data.kills;
        document.getElementById('vic-time').innerText = `${data.time}s`;

        const newHighTag = document.getElementById('vic-new-high');
        if (newHighTag) {
            newHighTag.style.display = data.isNewHigh ? 'block' : 'none';
        }

        this.showScreen('victory');
    }
}

window.mainUI = new MainUI();

// Automatic Initialization when DOM is ready
window.addEventListener('DOMContentLoaded', () => {
    window.mainUI.init();
});

/**
 * Public Integration Function for Agentic Browser
 * Can be invoked programmatically when offline connection is detected.
 */
window.startOfflineGame = function(containerElement, options = {}) {
    console.log('[Agentic Browser] Initializing Offline DOOM...');
    if (window.mainUI) {
        window.mainUI.init();
        window.game.startNewGame();
    }
};
