/**
 * OFFLINE DOOM - Storage & Settings Manager
 * 100% Offline, LocalStorage backed with graceful fallback
 */
class StorageManager {
    constructor() {
        this.STORAGE_KEY = 'offline_doom_save_data';
        this.defaults = {
            masterVolume: 1.0,
            masterMuted: false,
            soundVolume: 0.8,
            sfxMuted: false,
            musicVolume: 0.5,
            musicMuted: false,
            mouseSensitivity: 1.0,
            crtEffect: true,
            highScore: 0,
            bestTime: 0,
            killsRecord: 0
        };
        this.data = this.load();
    }

    load() {
        try {
            const raw = localStorage.getItem(this.STORAGE_KEY);
            if (raw) {
                return { ...this.defaults, ...JSON.parse(raw) };
            }
        } catch (e) {
            console.warn('LocalStorage unavailable, using defaults in memory', e);
        }
        return { ...this.defaults };
    }

    save() {
        try {
            localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.data));
        } catch (e) {
            console.warn('Failed to save to LocalStorage', e);
        }
    }

    get(key) {
        return this.data[key] !== undefined ? this.data[key] : this.defaults[key];
    }

    set(key, value) {
        this.data[key] = value;
        this.save();
    }

    recordScore(score, time, kills) {
        let isNewHigh = false;
        if (score > (this.data.highScore || 0)) {
            this.data.highScore = score;
            isNewHigh = true;
        }
        if (kills > (this.data.killsRecord || 0)) {
            this.data.killsRecord = kills;
        }
        if (!this.data.bestTime || (time > 0 && time < this.data.bestTime)) {
            this.data.bestTime = time;
        }
        this.save();
        return isNewHigh;
    }
}

window.storageManager = new StorageManager();
