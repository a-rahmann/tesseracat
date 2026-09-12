/**
 * OFFLINE DOOM - Player Entity & State Machine
 * Handles movement physics, health/armor damage mitigation, inventory, and weapon switching.
 */
class Player {
    constructor() {
        this.x = 2.5;
        this.y = 2.5;
        this.angle = 0; // In radians
        this.pitch = 0; // Vertical look offset (pixels)
        this.radius = 0.28; // Collision bounding radius

        // Core Stats
        this.health = 100;
        this.maxHealth = 100;
        this.superHealthMax = 200;
        this.armor = 0;
        this.maxArmor = 200;
        this.score = 0;
        this.kills = 0;
        this.isDead = false;

        // Inventory & Ammo (Starting with AK-47 & 25 Ammo)
        this.ammo = {
            bullets: 25,
            maxBullets: 150,
            shells: 8,
            maxShells: 60,
            plasma: 0,
            maxPlasma: 300
        };
        this.weapons = {
            knife: true,
            ak47: true,
            supershotgun: false,
            plasma: false
        };
        this.currentWeapon = 'ak47';

        // Keycards
        this.keys = {
            blue: false,
            red: false
        };

        // Movement Configuration
        this.baseSpeed = 3.6;
        this.sprintSpeed = 5.8;
        this.strafeSpeed = 3.2;
        this.rotSpeed = 2.4; // Radians per sec

        // Visual FX & Bobbing
        this.bob = 0;
        this.bobTimer = 0;
        this.swayX = 0;
        this.swayY = 0;
        this.damageFlash = 0;
        this.pickupFlash = 0;
        this.screenShake = 0;

        // Weapon Recoil Dynamics (AK-47 Muzzle Kick & Recovery)
        this.recoilPitch = 0;
        this.recoilAngleX = 0;
        this.recoilVisualX = 0;
        this.recoilVisualY = 0;
        this.continuousFireTime = 0;

        // Animated Marine Face State
        this.faceState = 'healthy';
        this.faceTimer = 0;
    }

    reset(spawnX = 3.5, spawnY = 3.5, angle = 0) {
        this.x = spawnX;
        this.y = spawnY;
        this.angle = angle;
        this.pitch = 0;
        this.health = 100;
        this.armor = 0;
        this.score = 0;
        this.kills = 0;
        this.isDead = false;
        this.ammo.bullets = 25;
        this.ammo.shells = 8;
        this.ammo.plasma = 0;
        this.weapons.knife = true;
        this.weapons.ak47 = true;
        this.weapons.supershotgun = false;
        this.weapons.plasma = false;
        this.currentWeapon = 'ak47';
        this.keys.blue = false;
        this.keys.red = false;
        this.damageFlash = 0;
        this.pickupFlash = 0;
        this.screenShake = 0;
        this.recoilPitch = 0;
        this.recoilAngleX = 0;
        this.recoilVisualX = 0;
        this.recoilVisualY = 0;
        this.continuousFireTime = 0;
        this.faceState = 'healthy';
        this.faceTimer = 0;
    }

    update(dt, input, collision, map) {
        if (this.isDead) return;

        // Decay screen effects
        if (this.damageFlash > 0) this.damageFlash = Math.max(0, this.damageFlash - dt * 2.5);
        if (this.pickupFlash > 0) this.pickupFlash = Math.max(0, this.pickupFlash - dt * 3.0);
        if (this.screenShake > 0) this.screenShake = Math.max(0, this.screenShake - dt * 4.0);

        // Smooth Recoil Recovery (80 - 140ms quick snappy return)
        if (this.recoilPitch > 0) {
            this.recoilPitch = Math.max(0, this.recoilPitch - dt * 32.0);
        }
        if (Math.abs(this.recoilAngleX) > 0.0001) {
            this.recoilAngleX *= Math.pow(0.04, dt);
        } else {
            this.recoilAngleX = 0;
        }
        if (this.recoilVisualY > 0) {
            this.recoilVisualY = Math.max(0, this.recoilVisualY - dt * 45.0);
        }
        if (Math.abs(this.recoilVisualX) > 0.01) {
            this.recoilVisualX *= Math.pow(0.05, dt);
        } else {
            this.recoilVisualX = 0;
        }
        if (!input.isMouseDown && !input.isKeyDown('Space')) {
            this.continuousFireTime = Math.max(0, this.continuousFireTime - dt * 5.0);
        }

        // Update face timer
        if (this.faceTimer > 0) {
            this.faceTimer -= dt;
            if (this.faceTimer <= 0) {
                this.updateFaceMood();
            }
        }

        // 1. Mouse & Keyboard Rotation & Free Aim in All Directions (Valorant Style)
        const sensitivity = (window.storageManager ? window.storageManager.get('mouseSensitivity') : 1.0);
        
        // Full 360° Horizontal Yaw
        if (input.mouseDeltaX !== 0) {
            this.angle += (input.mouseDeltaX * 0.0026 * sensitivity);
            this.angle = (this.angle + Math.PI * 2) % (Math.PI * 2);
        }
        if (input.isKeyDown('ArrowLeft') || input.isKeyDown('KeyJ')) {
            this.angle -= this.rotSpeed * dt;
            this.angle = (this.angle + Math.PI * 2) % (Math.PI * 2);
        }
        if (input.isKeyDown('ArrowRight') || input.isKeyDown('KeyL')) {
            this.angle += this.rotSpeed * dt;
            this.angle = (this.angle + Math.PI * 2) % (Math.PI * 2);
        }

        // Full Vertical Pitch (Look Up & Down)
        if (input.mouseDeltaY !== 0) {
            this.pitch -= input.mouseDeltaY * 0.48 * sensitivity;
        }

        // Keyboard Vertical Look (PageUp / PageDown / I / K / Home to Center)
        if (input.isKeyDown('PageUp') || input.isKeyDown('KeyI')) {
            this.pitch += 160 * dt;
        }
        if (input.isKeyDown('PageDown') || input.isKeyDown('KeyK')) {
            this.pitch -= 160 * dt;
        }
        if (input.isKeyJustPressed('Home') || input.isKeyJustPressed('KeyC')) {
            this.pitch = 0; // Snap crosshair to center
        }

        // Clamp pitch to realistic vertical field of view (Prevents view flipping/warping)
        this.pitch = Math.max(-65, Math.min(65, this.pitch));

        // Dynamic Valorant-style Weapon Inertia & Mouse Lag Sway
        if (!this.swayX) this.swayX = 0;
        if (!this.swayY) this.swayY = 0;
        const targetSwayX = -(input.mouseDeltaX * 0.35 * sensitivity);
        const targetSwayY = -(input.mouseDeltaY * 0.25 * sensitivity);
        this.swayX = this.swayX * 0.80 + targetSwayX * 0.20;
        this.swayY = this.swayY * 0.80 + targetSwayY * 0.20;
        this.swayX = Math.max(-14, Math.min(14, this.swayX));
        this.swayY = Math.max(-10, Math.min(10, this.swayY));

        // 2. Movement Vector Calculation
        const isSprinting = input.isKeyDown('ShiftLeft') || input.isKeyDown('ShiftRight');
        const speed = isSprinting ? this.sprintSpeed : this.baseSpeed;

        let moveX = 0;
        let moveY = 0;

        if (input.isKeyDown('KeyW') || input.isKeyDown('ArrowUp')) {
            moveX += Math.cos(this.angle);
            moveY += Math.sin(this.angle);
        }
        if (input.isKeyDown('KeyS') || input.isKeyDown('ArrowDown')) {
            moveX -= Math.cos(this.angle);
            moveY -= Math.sin(this.angle);
        }

        const strafeAngle = this.angle + Math.PI / 2;
        if (input.isKeyDown('KeyD')) {
            moveX += Math.cos(strafeAngle);
            moveY += Math.sin(strafeAngle);
        }
        if (input.isKeyDown('KeyA')) {
            moveX -= Math.cos(strafeAngle);
            moveY -= Math.sin(strafeAngle);
        }

        // Apply Movement & Collision with Sliding
        const len = Math.hypot(moveX, moveY);
        const isMoving = len > 0.01;

        if (isMoving) {
            const normX = (moveX / len) * speed * dt;
            const normY = (moveY / len) * speed * dt;

            const res = collision.moveWithSlide(this.x, this.y, normX, normY, this.radius, map);
            this.x = res.x;
            this.y = res.y;

            this.bobTimer += dt * (isSprinting ? 12 : 8);
            this.bob = Math.sin(this.bobTimer) * (isSprinting ? 6 : 4);
        } else {
            this.bob = Math.sin(this.bobTimer) * 0.5;
            this.bobTimer = 0;
        }

        // 3. Weapon Swap Keys (1: Knife, 2: AK-47, 3: Super Shotgun / Plasma, 4: Plasma, Q: Cycle)
        if (input.isKeyJustPressed('Digit1') && this.weapons.knife) {
            this.currentWeapon = 'knife';
            window.soundEngine.playKnifeSlash();
        }
        if (input.isKeyJustPressed('Digit2') && (this.weapons.ak47 || this.weapons.shotgun)) {
            this.currentWeapon = 'ak47';
            window.soundEngine.playAK47Reload();
        }
        if (input.isKeyJustPressed('Digit3')) {
            if (this.weapons.supershotgun) {
                this.currentWeapon = 'supershotgun';
                window.soundEngine.playSuperShotgunReload();
            } else if (this.weapons.plasma) {
                this.currentWeapon = 'plasma';
                window.soundEngine.playMenuClick();
            }
        }
        if (input.isKeyJustPressed('Digit4') && this.weapons.plasma) {
            this.currentWeapon = 'plasma';
            window.soundEngine.playMenuClick();
        }
        if (input.isKeyJustPressed('KeyQ')) {
            this.cycleWeapon();
        }

        // 4. In-Game Audio Quick Shortcuts (M: Mute, [: Vol Down, ]: Vol Up)
        if (input.isKeyJustPressed('KeyM')) {
            const isMuted = window.soundEngine.toggleMasterMute();
            window.storageManager.set('masterMuted', isMuted);
            if (window.hudManager) {
                if (isMuted) {
                    window.hudManager.addMessage("🔇 AUDIO MUTED", '#ff4444');
                } else {
                    const pct = Math.round(window.soundEngine.masterVolume * 100);
                    window.hudManager.addMessage(`🔊 AUDIO UNMUTED (${pct}%)`, '#00ffff');
                }
            }
        }
        if (input.isKeyJustPressed('BracketLeft') || input.isKeyJustPressed('Minus') || input.isKeyJustPressed('NumpadSubtract')) {
            const newVol = window.soundEngine.adjustMasterVolume(-0.1);
            window.storageManager.set('masterVolume', newVol);
            window.storageManager.set('masterMuted', false);
            if (window.hudManager) {
                window.hudManager.addMessage(`🔉 MASTER VOLUME: ${Math.round(newVol * 100)}%`, '#ffaa00');
            }
        }
        if (input.isKeyJustPressed('BracketRight') || input.isKeyJustPressed('Equal') || input.isKeyJustPressed('NumpadAdd')) {
            const newVol = window.soundEngine.adjustMasterVolume(0.1);
            window.storageManager.set('masterVolume', newVol);
            window.storageManager.set('masterMuted', false);
            if (window.hudManager) {
                window.hudManager.addMessage(`🔊 MASTER VOLUME: ${Math.round(newVol * 100)}%`, '#00ff66');
            }
        }

        // 5. Door & Switch Interaction (Press E)
        if (input.isKeyJustPressed('KeyE')) {
            this.interactWithFacingTile(map);
        }

        // 6. Check Map Pickups
        const picked = map.checkPickups(this.x, this.y);
        for (const item of picked) {
            this.handlePickup(item);
        }
    }

    cycleWeapon() {
        const order = ['knife', 'ak47', 'supershotgun', 'plasma'];
        let idx = order.indexOf(this.currentWeapon);
        if (idx === -1) idx = 1;
        for (let i = 1; i <= order.length; i++) {
            const next = order[(idx + i) % order.length];
            if (this.weapons[next]) {
                this.currentWeapon = next;
                if (next === 'ak47') window.soundEngine.playAK47Reload();
                else if (next === 'supershotgun') window.soundEngine.playSuperShotgunReload();
                else if (next === 'knife') window.soundEngine.playKnifeSlash();
                else window.soundEngine.playMenuClick();
                break;
            }
        }
    }

    interactWithFacingTile(map) {
        let foundTile = 0;
        let doorX = 0;
        let doorY = 0;

        // 1. Ray search in facing direction
        for (let d = 0.5; d <= 2.2; d += 0.3) {
            const fx = Math.floor(this.x + Math.cos(this.angle) * d);
            const fy = Math.floor(this.y + Math.sin(this.angle) * d);
            const t = map.getWall(fx, fy);
            if (t === 8 || t === 9 || t === 12) {
                foundTile = t;
                doorX = fx;
                doorY = fy;
                break;
            }
        }

        // 2. Surrounding tile search if close by
        if (!foundTile) {
            const px = Math.floor(this.x);
            const py = Math.floor(this.y);
            for (let dy = -1; dy <= 1; dy++) {
                for (let dx = -1; dx <= 1; dx++) {
                    const t = map.getWall(px + dx, py + dy);
                    if (t === 8 || t === 9 || t === 12) {
                        foundTile = t;
                        doorX = px + dx;
                        doorY = py + dy;
                        break;
                    }
                }
                if (foundTile) break;
            }
        }

        if (foundTile === 8) { // Blue Security Door
            if (this.keys.blue) {
                map.grid[doorY][doorX] = 0; // Unseal door into walkable floor
                if (window.soundEngine) {
                    window.soundEngine.playDoorOpen();
                    window.soundEngine.playSecretFound();
                }
                this.triggerPickupFlash('blue');
                if (window.hudManager) {
                    window.hudManager.addMessage("BLUE DOOR UNLOCKED! ENTERING CENTRAL PLAZA - SEARCH FOR THE RED SKULL KEY!", '#00ffff');
                }
            } else {
                if (window.soundEngine) window.soundEngine.playDoorLocked();
                if (window.hudManager) window.hudManager.addMessage("YOU NEED THE BLUE KEYCARD TO OPEN THIS DOOR!", '#ff3333');
            }
        } else if (foundTile === 9) { // Red Skull Demonic Gate
            if (this.keys.red) {
                map.grid[doorY][doorX] = 0; // Unseal red gate into walkable floor
                if (window.soundEngine) {
                    window.soundEngine.playDoorOpen();
                    window.soundEngine.playSecretFound();
                }
                this.triggerPickupFlash('red');
                if (window.hudManager) {
                    window.hudManager.addMessage("RED DEMONIC GATE UNSEALED! ENTERING BOSS COLOSSEUM - REACH THE AIRLOCK TO ESCAPE!", '#ff3311');
                }
            } else {
                if (window.soundEngine) window.soundEngine.playDoorLocked();
                if (window.hudManager) window.hudManager.addMessage("YOU NEED THE RED SKULL KEY TO UNSEAL THIS GATE!", '#ff3333');
            }
        } else if (foundTile === 12) { // Secret Pushwall
            map.grid[doorY][doorX] = 0; // Wall slides open!
            if (window.soundEngine) {
                window.soundEngine.playDoorOpen();
                window.soundEngine.playSecretFound();
            }
            this.triggerPickupFlash('gold');
            if (window.hudManager) {
                window.hudManager.addMessage("★ SECRET ROOM UNSEALED! BONUS CACHE REVEALED! ★", '#ffd700');
            }
        } else if (foundTile === 6 || map.isExit(this.x, this.y, 2.2)) {
            if (window.game && window.game.state === 'PLAYING') {
                window.game.triggerVictory();
            }
        }
    }

    handlePickup(item) {
        let soundPlayed = false;

        switch (item.type) {
            case 'health':
                if (this.health < this.maxHealth) {
                    this.health = Math.min(this.maxHealth, this.health + 25);
                    this.score += 50;
                    this.triggerPickupFlash('green');
                    this.setTemporaryFace('grin', 1.2);
                    window.hudManager.addMessage("+25 HEALTH", '#00ff66');
                    window.soundEngine.playHealthPickup();
                    soundPlayed = true;
                }
                break;
            case 'mega_health':
                this.health = Math.min(this.superHealthMax, this.health + 100);
                this.score += 250;
                this.triggerPickupFlash('blue');
                this.setTemporaryFace('grin', 2.5);
                window.hudManager.addMessage("SUPERCHARGE! +100 HEALTH!", '#00aaff');
                window.soundEngine.playHealthPickup();
                soundPlayed = true;
                break;
            case 'ammo_shells':
                this.ammo.shells = Math.min(this.ammo.maxShells, (this.ammo.shells || 0) + 12);
                this.ammo.bullets = Math.min(this.ammo.maxBullets, (this.ammo.bullets || 0) + 25);
                this.score += 25;
                this.triggerPickupFlash('gold');
                window.hudManager.addMessage("+25 BULLETS & +12 SHELLS", '#ffaa00');
                window.soundEngine.playAmmoPickup();
                soundPlayed = true;
                break;
            case 'ammo_bullets':
                this.ammo.bullets = Math.min(this.ammo.maxBullets, (this.ammo.bullets || 0) + 25);
                this.score += 25;
                this.triggerPickupFlash('gold');
                window.hudManager.addMessage("+25 AK-47 ROUNDS", '#ffaa00');
                window.soundEngine.playAmmoPickup();
                soundPlayed = true;
                break;
            case 'supershotgun':
                this.weapons.supershotgun = true;
                this.ammo.shells = Math.min(this.ammo.maxShells, (this.ammo.shells || 0) + 16);
                this.score += 300;
                this.triggerPickupFlash('gold');
                this.setTemporaryFace('grin', 2.5);
                window.hudManager.addMessage("UNLOCKED: SUPER SHOTGUN (PRESS '3' TO EQUIP)", '#ffaa00');
                window.soundEngine.playSuperShotgunReload();
                soundPlayed = true;
                break;
            case 'ammo_plasma':
                this.ammo.plasma = Math.min(this.ammo.maxPlasma, this.ammo.plasma + 40);
                this.score += 35;
                this.triggerPickupFlash('cyan');
                window.hudManager.addMessage("+40 PLASMA CELLS", '#00ffff');
                window.soundEngine.playAmmoPickup();
                soundPlayed = true;
                break;
            case 'armor':
                this.armor = Math.min(this.maxArmor, this.armor + 50);
                this.score += 50;
                this.triggerPickupFlash('blue');
                window.hudManager.addMessage("+50 COMBAT ARMOR", '#00aaff');
                window.soundEngine.playArmorPickup();
                soundPlayed = true;
                break;
            case 'plasma':
                this.weapons.plasma = true;
                this.ammo.plasma = Math.min(this.ammo.maxPlasma, this.ammo.plasma + 60);
                this.score += 350;
                this.triggerPickupFlash('cyan');
                this.setTemporaryFace('grin', 2.5);
                window.hudManager.addMessage("UNLOCKED: PLASMA CARBINE (PRESS '3' TO EQUIP)", '#00ffff');
                window.soundEngine.playArmorPickup();
                soundPlayed = true;
                break;
            case 'key_blue':
                this.keys.blue = true;
                this.score += 300;
                this.triggerPickupFlash('blue');
                window.hudManager.addMessage("ACQUIRED BLUE SECURITY KEYCARD!", '#00ffff');
                window.soundEngine.playSecretFound();
                soundPlayed = true;
                break;
            case 'key_red':
                this.keys.red = true;
                this.score += 300;
                this.triggerPickupFlash('red');
                window.hudManager.addMessage("ACQUIRED RED DEMONIC SKULL KEY!", '#ff3311');
                window.soundEngine.playSecretFound();
                soundPlayed = true;
                break;
        }

        if (!soundPlayed) {
            window.soundEngine.playAmmoPickup();
        }
    }

    takeDamage(amount) {
        if (this.isDead) return;

        // Armor mitigation: Armor absorbs 66% of damage
        let damageToHealth = amount;
        if (this.armor > 0) {
            const absorbed = Math.min(this.armor, Math.round(amount * 0.66));
            this.armor -= absorbed;
            damageToHealth = amount - absorbed;
        }

        this.health -= damageToHealth;
        this.damageFlash = 1.0;
        this.screenShake = 1.0;
        this.setTemporaryFace('hurt', 0.8);

        window.soundEngine.playPlayerHurt();

        if (this.health <= 0) {
            this.health = 0;
            this.isDead = true;
            this.faceState = 'dead';
            window.soundEngine.playGameOver();
        }
    }

    triggerPickupFlash(color = 'gold') {
        this.pickupFlash = 0.8;
        this.pickupFlashColor = color;
    }

    setTemporaryFace(mood, duration = 1.0) {
        if (this.isDead) return;
        this.faceState = mood;
        this.faceTimer = duration;
    }

    updateFaceMood() {
        if (this.isDead) {
            this.faceState = 'dead';
        } else if (this.health <= 25) {
            this.faceState = 'critical';
        } else if (this.health <= 50) {
            this.faceState = 'hurt';
        } else {
            this.faceState = 'healthy';
        }
    }

    get hasKeyBlue() {
        return !!(this.keys && this.keys.blue);
    }

    get hasKeyRed() {
        return !!(this.keys && this.keys.red);
    }

    get killCount() {
        return this.kills;
    }
}

window.Player = Player;
window.player = new Player();
