/**
 * OFFLINE DOOM - Web Audio API Procedural Synthesizer (Enhanced)
 * 100% Offline, Zero external audio files or network dependencies.
 * Features 3D Stereo Panning, Super Shotgun blasts, Hydraulic doors, and E1M1 Metal OST.
 */
class SoundEngine {
    constructor() {
        this.ctx = null;
        this.masterGain = null;
        this.sfxGain = null;
        this.musicGain = null;
        this.masterVolume = 1.0;
        this.soundVolume = 0.8;
        this.musicVolume = 0.5;
        this.isMasterMuted = false;
        this.isSfxMuted = false;
        this.isMusicMuted = false;
        this.isMusicPlaying = false;
        this.musicTimer = null;
        this.musicStep = 0;
        this.isUnlocked = false;

        const unlock = () => {
            this.init();
            this.resume();
            if (this.isUnlocked) {
                window.removeEventListener('click', unlock);
                window.removeEventListener('keydown', unlock);
                window.removeEventListener('mousedown', unlock);
                window.removeEventListener('touchstart', unlock);
            }
        };
        window.addEventListener('click', unlock);
        window.addEventListener('keydown', unlock);
        window.addEventListener('mousedown', unlock);
        window.addEventListener('touchstart', unlock);
    }

    init() {
        if (!this.ctx) {
            try {
                const AudioCtx = window.AudioContext || window.webkitAudioContext;
                this.ctx = new AudioCtx();

                this.masterGain = this.ctx.createGain();
                const actualMaster = this.isMasterMuted ? 0 : this.masterVolume;
                this.masterGain.gain.setValueAtTime(actualMaster, this.ctx.currentTime);
                this.masterGain.connect(this.ctx.destination);

                this.sfxGain = this.ctx.createGain();
                const actualSfx = this.isSfxMuted ? 0 : this.soundVolume;
                this.sfxGain.gain.setValueAtTime(actualSfx, this.ctx.currentTime);
                this.sfxGain.connect(this.masterGain);

                this.musicGain = this.ctx.createGain();
                const actualMusic = this.isMusicMuted ? 0 : this.musicVolume;
                this.musicGain.gain.setValueAtTime(actualMusic, this.ctx.currentTime);
                this.musicGain.connect(this.masterGain);
            } catch (e) {
                console.warn('Web Audio API init error:', e);
            }
        }

        if (this.ctx && this.ctx.state === 'suspended') {
            this.ctx.resume().then(() => {
                this.isUnlocked = true;
            }).catch(() => {});
        } else if (this.ctx && this.ctx.state === 'running') {
            this.isUnlocked = true;
        }
    }

    resume() {
        if (this.ctx && this.ctx.state === 'suspended') {
            this.ctx.resume().catch(() => {});
        }
    }

    setMasterVolume(val) {
        this.masterVolume = Math.max(0, Math.min(1, val));
        if (this.masterGain && this.ctx) {
            const actual = this.isMasterMuted ? 0 : this.masterVolume;
            this.masterGain.gain.setValueAtTime(actual, this.ctx.currentTime);
        }
    }

    setMasterMute(muted) {
        this.isMasterMuted = !!muted;
        if (this.masterGain && this.ctx) {
            const actual = this.isMasterMuted ? 0 : this.masterVolume;
            this.masterGain.gain.setValueAtTime(actual, this.ctx.currentTime);
        }
    }

    toggleMasterMute() {
        this.setMasterMute(!this.isMasterMuted);
        return this.isMasterMuted;
    }

    setSoundVolume(val) {
        this.soundVolume = Math.max(0, Math.min(1, val));
        if (this.sfxGain && this.ctx) {
            const actual = this.isSfxMuted ? 0 : this.soundVolume;
            this.sfxGain.gain.setValueAtTime(actual, this.ctx.currentTime);
        }
    }

    setSfxMute(muted) {
        this.isSfxMuted = !!muted;
        if (this.sfxGain && this.ctx) {
            const actual = this.isSfxMuted ? 0 : this.soundVolume;
            this.sfxGain.gain.setValueAtTime(actual, this.ctx.currentTime);
        }
    }

    toggleSfxMute() {
        this.setSfxMute(!this.isSfxMuted);
        return this.isSfxMuted;
    }

    setMusicVolume(val) {
        this.musicVolume = Math.max(0, Math.min(1, val));
        if (this.musicGain && this.ctx) {
            const actual = this.isMusicMuted ? 0 : this.musicVolume;
            this.musicGain.gain.setValueAtTime(actual, this.ctx.currentTime);
        }
    }

    setMusicMute(muted) {
        this.isMusicMuted = !!muted;
        if (this.musicGain && this.ctx) {
            const actual = this.isMusicMuted ? 0 : this.musicVolume;
            this.musicGain.gain.setValueAtTime(actual, this.ctx.currentTime);
        }
    }

    toggleMusicMute() {
        this.setMusicMute(!this.isMusicMuted);
        return this.isMusicMuted;
    }

    adjustMasterVolume(delta) {
        const next = Math.max(0, Math.min(1, Math.round((this.masterVolume + delta) * 10) / 10));
        this.setMasterMute(false);
        this.setMasterVolume(next);
        return next;
    }

    // Helper: Create 3D Stereo Panner & Proximity Distance Attenuation Node
    createPanner(x = null, y = null, player = null, maxDist = 20.0) {
        if (!this.ctx || x === null || y === null || !player) {
            return this.sfxGain;
        }
        try {
            const dx = x - player.x;
            const dy = y - player.y;
            const dist = Math.hypot(dx, dy);

            // Proximity loudness scaling: Closer demons get loud, menacing and punchy!
            // When demon is within point-blank range (< 1.5m), volume is boosted (120%).
            // As demon distance increases, volume falls off smoothly.
            const distRatio = Math.max(0.0, Math.min(1.0, dist / maxDist));
            const volumeGain = Math.max(0.05, Math.pow(1.0 - distRatio, 1.2) * 1.35);

            const distGainNode = this.ctx.createGain();
            distGainNode.gain.setValueAtTime(Math.min(1.4, volumeGain), this.ctx.currentTime);
            distGainNode.connect(this.sfxGain);

            if (this.ctx.createStereoPanner) {
                const panner = this.ctx.createStereoPanner();
                const angleToSound = Math.atan2(dy, dx);
                let relAngle = angleToSound - player.angle;
                // Normalize to [-PI, PI]
                while (relAngle < -Math.PI) relAngle += Math.PI * 2;
                while (relAngle > Math.PI) relAngle -= Math.PI * 2;

                const pan = Math.max(-1, Math.min(1, Math.sin(relAngle)));
                panner.pan.setValueAtTime(pan, this.ctx.currentTime);
                panner.connect(distGainNode);
                return panner;
            } else {
                return distGainNode;
            }
        } catch (e) {
            return this.sfxGain;
        }
    }

    createNoiseBuffer(duration = 1.0) {
        if (!this.ctx) return null;
        const bufferSize = Math.floor(this.ctx.sampleRate * duration);
        const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        const output = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
            output[i] = (Math.random() * 2 - 1);
        }
        return buffer;
    }

    // 1. Knife / Melee Slash
    playKnifeSlash() {
        this.init();
        if (!this.ctx || this.soundVolume <= 0) return;
        this.resume();
        const t = this.ctx.currentTime;

        const buf = this.createNoiseBuffer(0.12);
        if (buf) {
            const noise = this.ctx.createBufferSource();
            noise.buffer = buf;
            const filter = this.ctx.createBiquadFilter();
            filter.type = 'highpass';
            filter.frequency.setValueAtTime(1200, t);
            filter.frequency.exponentialRampToValueAtTime(4500, t + 0.08);

            const gain = this.ctx.createGain();
            gain.gain.setValueAtTime(0.4, t);
            gain.gain.exponentialRampToValueAtTime(0.01, t + 0.12);

            noise.connect(filter);
            filter.connect(gain);
            gain.connect(this.sfxGain);
            noise.start(t);
            noise.stop(t + 0.12);
        }
    }

    // 2. AK-47 Assault Rifle Gunfire & Reload (7.62mm Heavy Crack & Bolt Ping)
    playAK47Fire() {
        this.init();
        if (!this.ctx || this.soundVolume <= 0) return;
        this.resume();
        const t = this.ctx.currentTime;

        // 1. Initial High-Velocity Gunshot Crack (Noise Blast)
        const noiseBuf = this.createNoiseBuffer(0.24);
        if (noiseBuf) {
            const noise = this.ctx.createBufferSource();
            noise.buffer = noiseBuf;
            const filter = this.ctx.createBiquadFilter();
            filter.type = 'bandpass';
            filter.frequency.setValueAtTime(3200, t);
            filter.frequency.exponentialRampToValueAtTime(300, t + 0.18);
            filter.Q.setValueAtTime(3.0, t);

            const gain = this.ctx.createGain();
            gain.gain.setValueAtTime(1.3, t);
            gain.gain.exponentialRampToValueAtTime(0.01, t + 0.22);

            noise.connect(filter);
            filter.connect(gain);
            gain.connect(this.sfxGain);
            noise.start(t);
            noise.stop(t + 0.24);
        }

        // 2. Heavy 7.62mm Sub-Bass Punch & Thump
        const osc = this.ctx.createOscillator();
        const oscGain = this.ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(190, t);
        osc.frequency.exponentialRampToValueAtTime(38, t + 0.16);

        oscGain.gain.setValueAtTime(1.1, t);
        oscGain.gain.exponentialRampToValueAtTime(0.01, t + 0.18);

        osc.connect(oscGain);
        oscGain.connect(this.sfxGain);
        osc.start(t);
        osc.stop(t + 0.18);

        // 3. Metallic AK-47 Bolt Cycle & Brass Ejection Ping
        const boltOsc = this.ctx.createOscillator();
        const boltGain = this.ctx.createGain();
        boltOsc.type = 'square';
        boltOsc.frequency.setValueAtTime(880, t + 0.04);
        boltOsc.frequency.setValueAtTime(1400, t + 0.08);
        boltGain.gain.setValueAtTime(0.0, t);
        boltGain.gain.setValueAtTime(0.25, t + 0.04);
        boltGain.gain.exponentialRampToValueAtTime(0.01, t + 0.12);

        boltOsc.connect(boltGain);
        boltGain.connect(this.sfxGain);
        boltOsc.start(t + 0.04);
        boltOsc.stop(t + 0.12);
    }

    playAK47Reload() {
        this.init();
        if (!this.ctx || this.soundVolume <= 0) return;
        this.resume();
        const t = this.ctx.currentTime;

        // Mag Out Click
        const osc1 = this.ctx.createOscillator();
        const g1 = this.ctx.createGain();
        osc1.type = 'square';
        osc1.frequency.setValueAtTime(540, t);
        osc1.frequency.setValueAtTime(220, t + 0.06);
        g1.gain.setValueAtTime(0.4, t);
        g1.gain.exponentialRampToValueAtTime(0.01, t + 0.1);
        osc1.connect(g1);
        g1.connect(this.sfxGain);
        osc1.start(t);
        osc1.stop(t + 0.1);

        // Mag In Click
        const osc2 = this.ctx.createOscillator();
        const g2 = this.ctx.createGain();
        osc2.type = 'square';
        osc2.frequency.setValueAtTime(320, t + 0.22);
        osc2.frequency.setValueAtTime(780, t + 0.28);
        g2.gain.setValueAtTime(0.0, t);
        g2.gain.setValueAtTime(0.5, t + 0.22);
        g2.gain.exponentialRampToValueAtTime(0.01, t + 0.35);
        osc2.connect(g2);
        g2.connect(this.sfxGain);
        osc2.start(t + 0.22);
        osc2.stop(t + 0.35);

        // Bolt Cocking Pull & Snap
        const osc3 = this.ctx.createOscillator();
        const g3 = this.ctx.createGain();
        osc3.type = 'sawtooth';
        osc3.frequency.setValueAtTime(450, t + 0.45);
        osc3.frequency.setValueAtTime(1100, t + 0.52);
        g3.gain.setValueAtTime(0.0, t);
        g3.gain.setValueAtTime(0.6, t + 0.45);
        g3.gain.exponentialRampToValueAtTime(0.01, t + 0.6);
        osc3.connect(g3);
        g3.connect(this.sfxGain);
        osc3.start(t + 0.45);
        osc3.stop(t + 0.6);
    }

    // 2. Heavy Combat Shotgun Blast
    playShotgunFire() {
        this.playAK47Fire();
    }

    playPumpAction() {
        if (!this.ctx || this.soundVolume <= 0) return;
        const t = this.ctx.currentTime;

        const osc1 = this.ctx.createOscillator();
        const g1 = this.ctx.createGain();
        osc1.type = 'square';
        osc1.frequency.setValueAtTime(750, t);
        osc1.frequency.setValueAtTime(320, t + 0.05);
        g1.gain.setValueAtTime(0.35, t);
        g1.gain.exponentialRampToValueAtTime(0.01, t + 0.09);
        osc1.connect(g1);
        g1.connect(this.sfxGain);
        osc1.start(t);
        osc1.stop(t + 0.09);

        const osc2 = this.ctx.createOscillator();
        const g2 = this.ctx.createGain();
        osc2.type = 'square';
        osc2.frequency.setValueAtTime(380, t + 0.14);
        osc2.frequency.setValueAtTime(920, t + 0.18);
        g2.gain.setValueAtTime(0.0, t);
        g2.gain.setValueAtTime(0.45, t + 0.14);
        g2.gain.exponentialRampToValueAtTime(0.01, t + 0.24);
        osc2.connect(g2);
        g2.connect(this.sfxGain);
        osc2.start(t + 0.14);
        osc2.stop(t + 0.24);
    }

    // 3. Super Shotgun (SSG) Devastating Double Blast
    playSuperShotgunFire() {
        this.init();
        if (!this.ctx || this.soundVolume <= 0) return;
        this.resume();
        const t = this.ctx.currentTime;

        // Massive thunderous roar
        const noiseBuf = this.createNoiseBuffer(0.65);
        if (noiseBuf) {
            const noise = this.ctx.createBufferSource();
            noise.buffer = noiseBuf;
            const filter = this.ctx.createBiquadFilter();
            filter.type = 'lowpass';
            filter.frequency.setValueAtTime(6000, t);
            filter.frequency.exponentialRampToValueAtTime(100, t + 0.55);

            const gain = this.ctx.createGain();
            gain.gain.setValueAtTime(1.6, t);
            gain.gain.exponentialRampToValueAtTime(0.01, t + 0.65);

            noise.connect(filter);
            filter.connect(gain);
            gain.connect(this.sfxGain);
            noise.start(t);
            noise.stop(t + 0.65);
        }

        // Deep dual sub-bass kick
        const osc = this.ctx.createOscillator();
        const oscGain = this.ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(260, t);
        osc.frequency.exponentialRampToValueAtTime(22, t + 0.45);
        oscGain.gain.setValueAtTime(1.3, t);
        oscGain.gain.exponentialRampToValueAtTime(0.01, t + 0.45);
        osc.connect(oscGain);
        oscGain.connect(this.sfxGain);
        osc.start(t);
        osc.stop(t + 0.45);

        // Break-action dual shell eject & reload clack
        setTimeout(() => this.playSuperShotgunReload(), 450);
    }

    playSuperShotgunReload() {
        if (!this.ctx || this.soundVolume <= 0) return;
        const t = this.ctx.currentTime;

        // Open break-action
        const osc1 = this.ctx.createOscillator();
        const g1 = this.ctx.createGain();
        osc1.type = 'square';
        osc1.frequency.setValueAtTime(500, t);
        osc1.frequency.setValueAtTime(280, t + 0.08);
        g1.gain.setValueAtTime(0.4, t);
        g1.gain.exponentialRampToValueAtTime(0.01, t + 0.12);
        osc1.connect(g1);
        g1.connect(this.sfxGain);
        osc1.start(t);
        osc1.stop(t + 0.12);

        // Shell insertion & Snap shut
        const osc2 = this.ctx.createOscillator();
        const g2 = this.ctx.createGain();
        osc2.type = 'square';
        osc2.frequency.setValueAtTime(320, t + 0.28);
        osc2.frequency.setValueAtTime(1100, t + 0.35);
        g2.gain.setValueAtTime(0.0, t);
        g2.gain.setValueAtTime(0.6, t + 0.28);
        g2.gain.exponentialRampToValueAtTime(0.01, t + 0.45);
        osc2.connect(g2);
        g2.connect(this.sfxGain);
        osc2.start(t + 0.28);
        osc2.stop(t + 0.45);
    }

    // 4. Plasma Carbine Laser Fire
    playPlasmaFire() {
        this.init();
        if (!this.ctx || this.soundVolume <= 0) return;
        this.resume();
        const t = this.ctx.currentTime;

        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        const filter = this.ctx.createBiquadFilter();

        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(1100, t);
        osc.frequency.exponentialRampToValueAtTime(90, t + 0.14);

        filter.type = 'bandpass';
        filter.frequency.setValueAtTime(1500, t);
        filter.Q.setValueAtTime(5, t);

        gain.gain.setValueAtTime(0.55, t);
        gain.gain.exponentialRampToValueAtTime(0.01, t + 0.14);

        osc.connect(filter);
        filter.connect(gain);
        gain.connect(this.sfxGain);
        osc.start(t);
        osc.stop(t + 0.14);
    }

    // 5. Demonic Roars, Guttural Bellows, Pain & Death Demise (With 3D Spatial Panning)
    playDemonAlert(type = 'crawler', x = null, y = null, player = null) {
        this.init();
        if (!this.ctx || this.soundVolume <= 0) return;
        this.resume();
        const dest = this.createPanner(x, y, player);
        const t = this.ctx.currentTime;

        if (type === 'crawler') {
            // Blood-curdling quadruped fiend screech & guttural throat scream
            const dur = 0.55;
            const osc = this.ctx.createOscillator();
            const mod = this.ctx.createOscillator();
            const modGain = this.ctx.createGain();
            const gain = this.ctx.createGain();
            const filter = this.ctx.createBiquadFilter();

            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(320, t);
            osc.frequency.linearRampToValueAtTime(720, t + 0.18);
            osc.frequency.exponentialRampToValueAtTime(120, t + dur);

            // Throat gargle FM
            mod.type = 'sawtooth';
            mod.frequency.setValueAtTime(45, t);
            modGain.gain.setValueAtTime(110, t);
            mod.connect(osc.frequency);

            filter.type = 'bandpass';
            filter.frequency.setValueAtTime(1800, t);
            filter.Q.setValueAtTime(4, t);

            gain.gain.setValueAtTime(1.1, t);
            gain.gain.exponentialRampToValueAtTime(0.01, t + dur);

            osc.connect(filter);
            filter.connect(gain);
            gain.connect(dest);
            mod.start(t);
            osc.start(t);
            mod.stop(t + dur);
            osc.stop(t + dur);

        } else if (type === 'imp') {
            // Hell Imp classic raspy throat roar with flame ignition
            const dur = 0.75;
            const osc = this.ctx.createOscillator();
            const mod = this.ctx.createOscillator();
            const modGain = this.ctx.createGain();
            const gain = this.ctx.createGain();
            const filter = this.ctx.createBiquadFilter();

            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(180, t);
            osc.frequency.linearRampToValueAtTime(420, t + 0.28);
            osc.frequency.exponentialRampToValueAtTime(70, t + dur);

            mod.type = 'square';
            mod.frequency.setValueAtTime(38, t);
            modGain.gain.setValueAtTime(120, t);
            mod.connect(osc.frequency);

            filter.type = 'lowpass';
            filter.frequency.setValueAtTime(2000, t);
            filter.Q.setValueAtTime(5, t);

            gain.gain.setValueAtTime(1.2, t);
            gain.gain.exponentialRampToValueAtTime(0.01, t + dur);

            osc.connect(filter);
            filter.connect(gain);
            gain.connect(dest);
            mod.start(t);
            osc.start(t);
            mod.stop(t + dur);
            osc.stop(t + dur);

        } else {
            // Cyber-Brute gigantic apocalyptic bellow & hydraulic ground tremor
            const dur = 1.1;
            const osc = this.ctx.createOscillator();
            const sub = this.ctx.createOscillator();
            const mod = this.ctx.createOscillator();
            const modGain = this.ctx.createGain();
            const gain = this.ctx.createGain();
            const filter = this.ctx.createBiquadFilter();

            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(85, t);
            osc.frequency.linearRampToValueAtTime(160, t + 0.4);
            osc.frequency.exponentialRampToValueAtTime(25, t + dur);

            sub.type = 'square';
            sub.frequency.setValueAtTime(40, t);
            sub.frequency.exponentialRampToValueAtTime(18, t + dur);

            mod.type = 'sawtooth';
            mod.frequency.setValueAtTime(24, t);
            modGain.gain.setValueAtTime(65, t);
            mod.connect(osc.frequency);

            filter.type = 'lowpass';
            filter.frequency.setValueAtTime(1400, t);
            filter.Q.setValueAtTime(7, t);

            gain.gain.setValueAtTime(1.4, t);
            gain.gain.exponentialRampToValueAtTime(0.01, t + dur);

            osc.connect(filter);
            sub.connect(filter);
            filter.connect(gain);
            gain.connect(dest);

            mod.start(t);
            osc.start(t);
            sub.start(t);
            mod.stop(t + dur);
            osc.stop(t + dur);
            sub.stop(t + dur);
        }
    }

    // Menacing hunting snarls and charging growls as demons sprint towards the player
    playDemonRushSound(type = 'crawler', x = null, y = null, player = null) {
        this.init();
        if (!this.ctx || this.soundVolume <= 0) return;
        this.resume();
        const dest = this.createPanner(x, y, player);
        const t = this.ctx.currentTime;

        if (type === 'crawler') {
            // Rapid rabid charge snarl
            const dur = 0.38;
            const osc = this.ctx.createOscillator();
            const mod = this.ctx.createOscillator();
            const modGain = this.ctx.createGain();
            const gain = this.ctx.createGain();

            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(340, t);
            osc.frequency.exponentialRampToValueAtTime(95, t + dur);

            mod.type = 'sawtooth';
            mod.frequency.setValueAtTime(50, t);
            modGain.gain.setValueAtTime(80, t);
            mod.connect(osc.frequency);

            gain.gain.setValueAtTime(0.9, t);
            gain.gain.exponentialRampToValueAtTime(0.01, t + dur);

            osc.connect(gain);
            gain.connect(dest);
            mod.start(t);
            osc.start(t);
            mod.stop(t + dur);
            osc.stop(t + dur);

        } else if (type === 'imp') {
            // Hell Imp fiery guttural snarl
            const dur = 0.48;
            const osc = this.ctx.createOscillator();
            const mod = this.ctx.createOscillator();
            const modGain = this.ctx.createGain();
            const gain = this.ctx.createGain();

            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(210, t);
            osc.frequency.exponentialRampToValueAtTime(60, t + dur);

            mod.type = 'square';
            mod.frequency.setValueAtTime(32, t);
            modGain.gain.setValueAtTime(75, t);
            mod.connect(osc.frequency);

            gain.gain.setValueAtTime(1.0, t);
            gain.gain.exponentialRampToValueAtTime(0.01, t + dur);

            osc.connect(gain);
            gain.connect(dest);
            mod.start(t);
            osc.start(t);
            mod.stop(t + dur);
            osc.stop(t + dur);

        } else {
            // Cyber-Brute heavy war stomp & pneumatic growl
            const dur = 0.65;
            const osc = this.ctx.createOscillator();
            const sub = this.ctx.createOscillator();
            const gain = this.ctx.createGain();

            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(110, t);
            osc.frequency.exponentialRampToValueAtTime(28, t + dur);

            sub.type = 'square';
            sub.frequency.setValueAtTime(45, t);
            sub.frequency.exponentialRampToValueAtTime(20, t + dur);

            gain.gain.setValueAtTime(1.15, t);
            gain.gain.exponentialRampToValueAtTime(0.01, t + dur);

            osc.connect(gain);
            sub.connect(gain);
            gain.connect(dest);

            osc.start(t);
            sub.start(t);
            osc.stop(t + dur);
            sub.stop(t + dur);
        }
    }

    // Demon Pain Hurt Sound (Demonic Yelp & Flesh Splat)
    playDemonHurt(x = null, y = null, player = null) {
        this.init();
        if (!this.ctx || this.soundVolume <= 0) return;
        this.resume();
        const dest = this.createPanner(x, y, player);
        const t = this.ctx.currentTime;

        // Pained demonic screech
        const dur = 0.22;
        const osc = this.ctx.createOscillator();
        const mod = this.ctx.createOscillator();
        const modGain = this.ctx.createGain();
        const gain = this.ctx.createGain();
        const filter = this.ctx.createBiquadFilter();

        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(420, t);
        osc.frequency.exponentialRampToValueAtTime(110, t + dur);

        mod.type = 'square';
        mod.frequency.setValueAtTime(60, t);
        modGain.gain.setValueAtTime(90, t);
        mod.connect(osc.frequency);

        filter.type = 'bandpass';
        filter.frequency.setValueAtTime(1600, t);
        filter.Q.setValueAtTime(3, t);

        gain.gain.setValueAtTime(0.9, t);
        gain.gain.exponentialRampToValueAtTime(0.01, t + dur);

        osc.connect(filter);
        filter.connect(gain);
        gain.connect(dest);

        mod.start(t);
        osc.start(t);
        mod.stop(t + dur);
        osc.stop(t + dur);

        // Flesh bullet impact crunch
        const buf = this.createNoiseBuffer(0.12);
        if (buf) {
            const noise = this.ctx.createBufferSource();
            noise.buffer = buf;
            const nFilter = this.ctx.createBiquadFilter();
            nFilter.type = 'lowpass';
            nFilter.frequency.setValueAtTime(800, t);
            const nGain = this.ctx.createGain();
            nGain.gain.setValueAtTime(0.6, t);
            nGain.gain.exponentialRampToValueAtTime(0.01, t + 0.12);
            noise.connect(nFilter);
            nFilter.connect(nGain);
            nGain.connect(dest);
            noise.start(t);
            noise.stop(t + 0.12);
        }
    }

    // Demon Death Demise Sound (Gruesome Gargling Death Cry & Splat)
    playDemonDeath(isBrute = false, x = null, y = null, player = null) {
        this.init();
        if (!this.ctx || this.soundVolume <= 0) return;
        this.resume();
        const dest = this.createPanner(x, y, player);
        const t = this.ctx.currentTime;

        const dur = isBrute ? 0.95 : 0.65;
        const osc = this.ctx.createOscillator();
        const sub = this.ctx.createOscillator();
        const mod = this.ctx.createOscillator();
        const modGain = this.ctx.createGain();
        const gain = this.ctx.createGain();
        const filter = this.ctx.createBiquadFilter();

        const startFreq = isBrute ? 140 : 280;
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(startFreq, t);
        osc.frequency.linearRampToValueAtTime(startFreq * 1.5, t + 0.15);
        osc.frequency.exponentialRampToValueAtTime(25, t + dur);

        sub.type = 'square';
        sub.frequency.setValueAtTime(isBrute ? 50 : 80, t);
        sub.frequency.exponentialRampToValueAtTime(15, t + dur);

        // Agonized death gargle FM
        mod.type = 'sawtooth';
        mod.frequency.setValueAtTime(30, t);
        modGain.gain.setValueAtTime(isBrute ? 70 : 100, t);
        mod.connect(osc.frequency);

        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(isBrute ? 1200 : 1800, t);
        filter.Q.setValueAtTime(6, t);

        gain.gain.setValueAtTime(isBrute ? 1.3 : 1.05, t);
        gain.gain.exponentialRampToValueAtTime(0.01, t + dur);

        osc.connect(filter);
        sub.connect(filter);
        filter.connect(gain);
        gain.connect(dest);

        mod.start(t);
        osc.start(t);
        sub.start(t);
        mod.stop(t + dur);
        osc.stop(t + dur);
        sub.stop(t + dur);

        // Fleshy corpse squelch
        const buf = this.createNoiseBuffer(0.25);
        if (buf) {
            const noise = this.ctx.createBufferSource();
            noise.buffer = buf;
            const nFilter = this.ctx.createBiquadFilter();
            nFilter.type = 'lowpass';
            nFilter.frequency.setValueAtTime(600, t + 0.15);
            const nGain = this.ctx.createGain();
            nGain.gain.setValueAtTime(0.7, t + 0.15);
            nGain.gain.exponentialRampToValueAtTime(0.01, t + 0.4);
            noise.connect(nFilter);
            nFilter.connect(nGain);
            nGain.connect(dest);
            noise.start(t + 0.15);
            noise.stop(t + 0.4);
        }
    }

    playDemonRoar(isBrute = false, x = null, y = null, player = null) {
        this.playDemonAlert(isBrute ? 'brute' : 'crawler', x, y, player);
    }

    playClawAttack(x = null, y = null, player = null) {
        this.init();
        if (!this.ctx || this.soundVolume <= 0) return;
        this.resume();
        const dest = this.createPanner(x, y, player);
        const t = this.ctx.currentTime;

        const buf = this.createNoiseBuffer(0.22);
        if (buf) {
            const noise = this.ctx.createBufferSource();
            noise.buffer = buf;
            const filter = this.ctx.createBiquadFilter();
            filter.type = 'highpass';
            filter.frequency.setValueAtTime(600, t);
            filter.frequency.exponentialRampToValueAtTime(3200, t + 0.12);

            const gain = this.ctx.createGain();
            gain.gain.setValueAtTime(0.5, t);
            gain.gain.exponentialRampToValueAtTime(0.01, t + 0.22);

            noise.connect(filter);
            filter.connect(gain);
            gain.connect(dest);
            noise.start(t);
            noise.stop(t + 0.22);
        }
    }

    playFireballLaunch(x = null, y = null, player = null) {
        this.init();
        if (!this.ctx || this.soundVolume <= 0) return;
        this.resume();
        const dest = this.createPanner(x, y, player);
        const t = this.ctx.currentTime;

        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(180, t);
        osc.frequency.exponentialRampToValueAtTime(600, t + 0.3);

        gain.gain.setValueAtTime(0.5, t);
        gain.gain.exponentialRampToValueAtTime(0.01, t + 0.3);

        osc.connect(gain);
        gain.connect(dest);
        osc.start(t);
        osc.stop(t + 0.3);
    }

    playFireballImpact(x = null, y = null, player = null) {
        this.init();
        if (!this.ctx || this.soundVolume <= 0) return;
        this.resume();
        const dest = this.createPanner(x, y, player);
        const t = this.ctx.currentTime;

        const buf = this.createNoiseBuffer(0.35);
        if (buf) {
            const noise = this.ctx.createBufferSource();
            noise.buffer = buf;
            const filter = this.ctx.createBiquadFilter();
            filter.type = 'lowpass';
            filter.frequency.setValueAtTime(900, t);
            filter.frequency.exponentialRampToValueAtTime(80, t + 0.3);

            const gain = this.ctx.createGain();
            gain.gain.setValueAtTime(0.7, t);
            gain.gain.exponentialRampToValueAtTime(0.01, t + 0.35);

            noise.connect(filter);
            filter.connect(gain);
            gain.connect(dest);
            noise.start(t);
            noise.stop(t + 0.35);
        }
    }

    // 6. Barrel Detonation Explosions
    playBarrelExplode(x = null, y = null, player = null) {
        this.init();
        if (!this.ctx || this.soundVolume <= 0) return;
        this.resume();
        const dest = this.createPanner(x, y, player);
        const t = this.ctx.currentTime;

        const buf = this.createNoiseBuffer(0.7);
        if (buf) {
            const noise = this.ctx.createBufferSource();
            noise.buffer = buf;
            const filter = this.ctx.createBiquadFilter();
            filter.type = 'lowpass';
            filter.frequency.setValueAtTime(2000, t);
            filter.frequency.exponentialRampToValueAtTime(50, t + 0.65);

            const gain = this.ctx.createGain();
            gain.gain.setValueAtTime(1.5, t);
            gain.gain.exponentialRampToValueAtTime(0.01, t + 0.7);

            noise.connect(filter);
            filter.connect(gain);
            gain.connect(dest);
            noise.start(t);
            noise.stop(t + 0.7);
        }

        const osc = this.ctx.createOscillator();
        const oscGain = this.ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(140, t);
        osc.frequency.exponentialRampToValueAtTime(20, t + 0.5);
        oscGain.gain.setValueAtTime(1.0, t);
        oscGain.gain.exponentialRampToValueAtTime(0.01, t + 0.5);
        osc.connect(oscGain);
        oscGain.connect(dest);
        osc.start(t);
        osc.stop(t + 0.5);
    }

    // 7. Hydraulic Doors & Keycards
    playDoorOpen() {
        this.init();
        if (!this.ctx || this.soundVolume <= 0) return;
        this.resume();
        const t = this.ctx.currentTime;

        // Pneumatic hiss + heavy motor hum
        const buf = this.createNoiseBuffer(0.5);
        if (buf) {
            const noise = this.ctx.createBufferSource();
            noise.buffer = buf;
            const filter = this.ctx.createBiquadFilter();
            filter.type = 'bandpass';
            filter.frequency.setValueAtTime(1200, t);
            const gain = this.ctx.createGain();
            gain.gain.setValueAtTime(0.35, t);
            gain.gain.exponentialRampToValueAtTime(0.01, t + 0.5);
            noise.connect(filter);
            filter.connect(gain);
            gain.connect(this.sfxGain);
            noise.start(t);
            noise.stop(t + 0.5);
        }

        const osc = this.ctx.createOscillator();
        const oscGain = this.ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(110, t);
        osc.frequency.linearRampToValueAtTime(220, t + 0.45);
        oscGain.gain.setValueAtTime(0.3, t);
        oscGain.gain.exponentialRampToValueAtTime(0.01, t + 0.5);
        osc.connect(oscGain);
        oscGain.connect(this.sfxGain);
        osc.start(t);
        osc.stop(t + 0.5);
    }

    playDoorLocked() {
        this.init();
        if (!this.ctx || this.soundVolume <= 0) return;
        this.resume();
        const t = this.ctx.currentTime;

        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'square';
        osc.frequency.setValueAtTime(180, t);
        osc.frequency.setValueAtTime(140, t + 0.08);
        gain.gain.setValueAtTime(0.4, t);
        gain.gain.exponentialRampToValueAtTime(0.01, t + 0.2);
        osc.connect(gain);
        gain.connect(this.sfxGain);
        osc.start(t);
        osc.stop(t + 0.2);
    }

    playSecretFound() {
        this.init();
        if (!this.ctx || this.soundVolume <= 0) return;
        this.resume();
        const t = this.ctx.currentTime;

        const notes = [440, 554.37, 659.25, 880];
        notes.forEach((freq, idx) => {
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            const noteT = t + idx * 0.08;
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(freq, noteT);
            gain.gain.setValueAtTime(0.4, noteT);
            gain.gain.exponentialRampToValueAtTime(0.01, noteT + 0.25);
            osc.connect(gain);
            gain.connect(this.sfxGain);
            osc.start(noteT);
            osc.stop(noteT + 0.25);
        });
    }

    // 8. Demon Hurt & Death
    playDemonHurt(x = null, y = null, player = null) {
        this.init();
        if (!this.ctx || this.soundVolume <= 0) return;
        this.resume();
        const dest = this.createPanner(x, y, player);
        const t = this.ctx.currentTime;

        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(320, t);
        osc.frequency.exponentialRampToValueAtTime(80, t + 0.16);

        gain.gain.setValueAtTime(0.55, t);
        gain.gain.exponentialRampToValueAtTime(0.01, t + 0.16);

        osc.connect(gain);
        gain.connect(dest);
        osc.start(t);
        osc.stop(t + 0.16);
    }

    playDemonDeath(isBrute = false, x = null, y = null, player = null) {
        this.init();
        if (!this.ctx || this.soundVolume <= 0) return;
        this.resume();
        const dest = this.createPanner(x, y, player);
        const t = this.ctx.currentTime;
        const dur = isBrute ? 0.85 : 0.5;

        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        const filter = this.ctx.createBiquadFilter();

        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(isBrute ? 180 : 260, t);
        osc.frequency.exponentialRampToValueAtTime(25, t + dur);

        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(1400, t);
        filter.frequency.exponentialRampToValueAtTime(100, t + dur);

        gain.gain.setValueAtTime(0.8, t);
        gain.gain.exponentialRampToValueAtTime(0.01, t + dur);

        osc.connect(filter);
        filter.connect(gain);
        gain.connect(dest);
        osc.start(t);
        osc.stop(t + dur);
    }

    // 9. Player Hurt
    playPlayerHurt() {
        this.init();
        if (!this.ctx || this.soundVolume <= 0) return;
        this.resume();
        const t = this.ctx.currentTime;

        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'square';
        osc.frequency.setValueAtTime(150, t);
        osc.frequency.exponentialRampToValueAtTime(40, t + 0.22);

        gain.gain.setValueAtTime(0.7, t);
        gain.gain.exponentialRampToValueAtTime(0.01, t + 0.22);

        osc.connect(gain);
        gain.connect(this.sfxGain);
        osc.start(t);
        osc.stop(t + 0.22);
    }

    // 10. Pickups
    playHealthPickup() {
        this.init();
        if (!this.ctx || this.soundVolume <= 0) return;
        this.resume();
        const t = this.ctx.currentTime;

        const notes = [330, 440, 660, 880];
        notes.forEach((freq, idx) => {
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            const noteT = t + idx * 0.045;
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(freq, noteT);
            gain.gain.setValueAtTime(0.4, noteT);
            gain.gain.exponentialRampToValueAtTime(0.01, noteT + 0.12);
            osc.connect(gain);
            gain.connect(this.sfxGain);
            osc.start(noteT);
            osc.stop(noteT + 0.12);
        });
    }

    playAmmoPickup() {
        this.init();
        if (!this.ctx || this.soundVolume <= 0) return;
        this.resume();
        const t = this.ctx.currentTime;

        const osc1 = this.ctx.createOscillator();
        const osc2 = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc1.type = 'square';
        osc2.type = 'sawtooth';
        osc1.frequency.setValueAtTime(523.25, t);
        osc1.frequency.setValueAtTime(659.25, t + 0.05);
        osc2.frequency.setValueAtTime(1046.5, t + 0.05);

        gain.gain.setValueAtTime(0.35, t);
        gain.gain.exponentialRampToValueAtTime(0.01, t + 0.16);

        osc1.connect(gain);
        osc2.connect(gain);
        gain.connect(this.sfxGain);

        osc1.start(t);
        osc2.start(t);
        osc1.stop(t + 0.16);
        osc2.stop(t + 0.16);
    }

    playArmorPickup() {
        this.init();
        if (!this.ctx || this.soundVolume <= 0) return;
        this.resume();
        const t = this.ctx.currentTime;

        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(440, t);
        osc.frequency.exponentialRampToValueAtTime(1760, t + 0.22);

        gain.gain.setValueAtTime(0.45, t);
        gain.gain.exponentialRampToValueAtTime(0.01, t + 0.25);

        osc.connect(gain);
        gain.connect(this.sfxGain);
        osc.start(t);
        osc.stop(t + 0.25);
    }

    playMenuClick() {
        this.init();
        if (!this.ctx || this.soundVolume <= 0) return;
        this.resume();
        const t = this.ctx.currentTime;

        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'square';
        osc.frequency.setValueAtTime(880, t);
        osc.frequency.setValueAtTime(440, t + 0.03);

        gain.gain.setValueAtTime(0.25, t);
        gain.gain.exponentialRampToValueAtTime(0.01, t + 0.06);

        osc.connect(gain);
        gain.connect(this.sfxGain);
        osc.start(t);
        osc.stop(t + 0.06);
    }

    playVictory() {
        this.init();
        if (!this.ctx || this.soundVolume <= 0) return;
        this.resume();
        const t = this.ctx.currentTime;
        const chords = [
            [261.63, 329.63, 392.00],
            [293.66, 369.99, 440.00],
            [329.63, 415.30, 493.88],
            [523.25, 659.25, 783.99]
        ];

        chords.forEach((chord, idx) => {
            const chordT = t + idx * 0.24;
            const dur = idx === chords.length - 1 ? 1.2 : 0.22;
            chord.forEach(freq => {
                const osc = this.ctx.createOscillator();
                const gain = this.ctx.createGain();
                osc.type = 'sawtooth';
                osc.frequency.setValueAtTime(freq, chordT);
                gain.gain.setValueAtTime(0.25, chordT);
                gain.gain.exponentialRampToValueAtTime(0.01, chordT + dur);
                osc.connect(gain);
                gain.connect(this.sfxGain);
                osc.start(chordT);
                osc.stop(chordT + dur);
            });
        });
    }

    playGameOver() {
        this.init();
        if (!this.ctx || this.soundVolume <= 0) return;
        this.resume();
        const t = this.ctx.currentTime;
        const notes = [220, 207.65, 196, 185, 130];
        notes.forEach((freq, idx) => {
            const noteT = t + idx * 0.28;
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(freq, noteT);
            gain.gain.setValueAtTime(0.35, noteT);
            gain.gain.exponentialRampToValueAtTime(0.01, noteT + 0.45);
            osc.connect(gain);
            gain.connect(this.sfxGain);
            osc.start(noteT);
            osc.stop(noteT + 0.45);
        });
    }

    // 11. Procedural 90s DOOM E1M1-Style Heavy Metal OST
    startMusic() {
        this.init();
        this.resume();
        if (this.isMusicPlaying) return;
        this.isMusicPlaying = true;
        this.musicStep = 0;

        const riffNotes = [
            41.20, 41.20, 82.41, 41.20, 41.20, 73.42, 41.20, 41.20,
            65.41, 41.20, 41.20, 58.27, 61.74, 41.20, 41.20, 82.41
        ];

        const leadNotes = [
            164.81, 0, 164.81, 0, 196.00, 0, 220.00, 246.94,
            220.00, 0, 196.00, 0, 164.81, 146.83, 164.81, 0
        ];

        const stepTime = 135;

        this.musicTimer = setInterval(() => {
            if (!this.ctx || this.musicVolume <= 0 || !this.isMusicPlaying) return;
            const t = this.ctx.currentTime;
            const step = this.musicStep % 16;

            // Bassline
            const bassFreq = riffNotes[step];
            if (bassFreq > 0) {
                const bassOsc = this.ctx.createOscillator();
                const bassGain = this.ctx.createGain();
                const bassFilter = this.ctx.createBiquadFilter();

                bassOsc.type = 'sawtooth';
                bassOsc.frequency.setValueAtTime(bassFreq, t);

                bassFilter.type = 'lowpass';
                bassFilter.frequency.setValueAtTime(750, t);
                bassFilter.frequency.exponentialRampToValueAtTime(200, t + 0.18);
                bassFilter.Q.setValueAtTime(4, t);

                bassGain.gain.setValueAtTime(0.35, t);
                bassGain.gain.exponentialRampToValueAtTime(0.01, t + 0.22);

                bassOsc.connect(bassFilter);
                bassFilter.connect(bassGain);
                bassGain.connect(this.musicGain);

                bassOsc.start(t);
                bassOsc.stop(t + 0.22);
            }

            // Lead Synth
            const leadFreq = leadNotes[step];
            if (leadFreq > 0 && Math.floor(this.musicStep / 16) % 2 === 1) {
                const leadOsc = this.ctx.createOscillator();
                const leadGain = this.ctx.createGain();
                const leadFilter = this.ctx.createBiquadFilter();

                leadOsc.type = 'square';
                leadOsc.frequency.setValueAtTime(leadFreq * 2, t);

                leadFilter.type = 'bandpass';
                leadFilter.frequency.setValueAtTime(1400, t);
                leadFilter.Q.setValueAtTime(6, t);

                leadGain.gain.setValueAtTime(0.18, t);
                leadGain.gain.exponentialRampToValueAtTime(0.01, t + 0.24);

                leadOsc.connect(leadFilter);
                leadFilter.connect(leadGain);
                leadGain.connect(this.musicGain);

                leadOsc.start(t);
                leadOsc.stop(t + 0.24);
            }

            // Kick
            if (step % 4 === 0) {
                const kickOsc = this.ctx.createOscillator();
                const kickGain = this.ctx.createGain();
                kickOsc.type = 'sine';
                kickOsc.frequency.setValueAtTime(140, t);
                kickOsc.frequency.exponentialRampToValueAtTime(35, t + 0.1);
                kickGain.gain.setValueAtTime(0.6, t);
                kickGain.gain.exponentialRampToValueAtTime(0.01, t + 0.12);
                kickOsc.connect(kickGain);
                kickGain.connect(this.musicGain);
                kickOsc.start(t);
                kickOsc.stop(t + 0.12);
            }

            // Snare
            if (step === 4 || step === 12) {
                const noiseBuf = this.createNoiseBuffer(0.14);
                if (noiseBuf) {
                    const noise = this.ctx.createBufferSource();
                    noise.buffer = noiseBuf;
                    const noiseFilter = this.ctx.createBiquadFilter();
                    noiseFilter.type = 'highpass';
                    noiseFilter.frequency.setValueAtTime(1000, t);
                    const noiseGain = this.ctx.createGain();
                    noiseGain.gain.setValueAtTime(0.3, t);
                    noiseGain.gain.exponentialRampToValueAtTime(0.01, t + 0.14);
                    noise.connect(noiseFilter);
                    noiseFilter.connect(noiseGain);
                    noiseGain.connect(this.musicGain);
                    noise.start(t);
                    noise.stop(t + 0.14);
                }
            }

            // Hi-Hat
            const hatBuf = this.createNoiseBuffer(0.04);
            if (hatBuf) {
                const hat = this.ctx.createBufferSource();
                hat.buffer = hatBuf;
                const hatFilter = this.ctx.createBiquadFilter();
                hatFilter.type = 'highpass';
                hatFilter.frequency.setValueAtTime(7000, t);
                const hatGain = this.ctx.createGain();
                hatGain.gain.setValueAtTime(step % 2 === 0 ? 0.08 : 0.04, t);
                hatGain.gain.exponentialRampToValueAtTime(0.005, t + 0.04);
                hat.connect(hatFilter);
                hatFilter.connect(hatGain);
                hatGain.connect(this.musicGain);
                hat.start(t);
                hat.stop(t + 0.04);
            }

            this.musicStep++;
        }, stepTime);
    }

    stopMusic() {
        this.isMusicPlaying = false;
        if (this.musicTimer) {
            clearInterval(this.musicTimer);
            this.musicTimer = null;
        }
    }
}

window.soundEngine = new SoundEngine();
