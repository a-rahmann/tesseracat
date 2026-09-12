/**
 * OFFLINE DOOM - Weapon System & Ballistics (Enhanced Arsenal)
 * Manages 4 Weapons: Knife, AK-47 Assault Rifle, Super Shotgun (SSG), and Plasma Carbine.
 * Supports dynamic muzzle illumination, rapid full-auto ballistics, barrel detonation, and gore VFX.
 */
class WeaponManager {
    constructor() {
        this.state = 'idle'; // idle, slash, fire, recoil, open, reload
        this.timer = 0;
        this.cooldown = 0;
        this.muzzleFlashActive = false;
        this.muzzleColor = '#ffaa00';
    }

    reset() {
        this.state = 'idle';
        this.timer = 0;
        this.cooldown = 0;
        this.muzzleFlashActive = false;
    }

    update(dt, player, input, enemies, map, vfxSystem) {
        if (this.cooldown > 0) {
            this.cooldown -= dt;
        }

        // State machine animation timer
        if (this.state !== 'idle') {
            this.timer += dt;
            const weaponType = player.currentWeapon;

            if (weaponType === 'knife') {
                if (this.timer < 0.12) {
                    this.state = 'slash';
                } else {
                    this.state = 'idle';
                    this.timer = 0;
                }
            } else if (weaponType === 'ak47' || weaponType === 'shotgun') {
                if (this.timer < 0.05) {
                    this.state = 'fire';
                    this.muzzleFlashActive = true;
                    this.muzzleColor = '#ffaa00';
                } else if (this.timer < 0.11) {
                    this.state = 'recoil';
                    this.muzzleFlashActive = false;
                } else {
                    this.state = 'idle';
                    this.timer = 0;
                }
            } else if (weaponType === 'supershotgun') {
                if (this.timer < 0.12) {
                    this.state = 'fire';
                    this.muzzleFlashActive = true;
                    this.muzzleColor = '#ff8800';
                } else if (this.timer < 0.35) {
                    this.state = 'recoil';
                    this.muzzleFlashActive = false;
                } else if (this.timer < 0.68) {
                    this.state = 'open';
                } else if (this.timer < 1.05) {
                    this.state = 'reload';
                } else {
                    this.state = 'idle';
                    this.timer = 0;
                }
            } else if (weaponType === 'plasma') {
                if (this.timer < 0.06) {
                    this.state = 'fire';
                    this.muzzleFlashActive = true;
                    this.muzzleColor = '#00ffff';
                } else if (this.timer < 0.12) {
                    this.state = 'recoil';
                    this.muzzleFlashActive = false;
                } else {
                    this.state = 'idle';
                    this.timer = 0;
                }
            }
        }

        // Handle Fire Request (Left Click or Space)
        if (input.isMouseDown || input.isKeyDown('Space')) {
            if (this.cooldown <= 0 && this.state === 'idle' && !player.isDead) {
                this.shoot(player, enemies, map, vfxSystem);
            }
        }
    }

    shoot(player, enemies, map, vfxSystem) {
        const weaponType = player.currentWeapon;

        if (weaponType === 'knife') {
            this.state = 'slash';
            this.timer = 0;
            this.cooldown = 0.22;
            this.muzzleFlashActive = false;
            window.soundEngine.playKnifeSlash();
            this.raycastShot(player.x, player.y, player.angle, 38, enemies, map, vfxSystem, 'knife', 1.6);

        } else if (weaponType === 'ak47' || weaponType === 'shotgun') {
            // AK-47 Assault Rifle (Rapid Fire 7.62mm Rounds with Recoil)
            if (player.ammo.bullets <= 0) {
                window.soundEngine.playMenuClick();
                this.cooldown = 0.3;
                return;
            }

            player.ammo.bullets--;
            this.state = 'fire';
            this.timer = 0;
            this.cooldown = 0.11; // ~540 RPM full-auto / burst
            this.muzzleFlashActive = true;
            this.muzzleColor = '#ffaa00';
            player.screenShake = 0.28;

            // AK-47 Recoil Dynamics
            // 1. Vertical camera pitch jump (snappy upward kick)
            player.recoilPitch = Math.min(22, (player.recoilPitch || 0) + 3.8);

            // 2. Full-auto continuous spray accumulation
            player.continuousFireTime = (player.continuousFireTime || 0) + 0.11;
            const sprayFactor = Math.min(2.8, 1.0 + player.continuousFireTime * 2.0);

            // 3. Horizontal spray drift (accumulates slightly during sustained fire)
            const driftKick = (Math.random() - 0.49) * 0.007 * sprayFactor;
            player.recoilAngleX = (player.recoilAngleX || 0) + driftKick;

            // 4. Weapon viewmodel kick-back impulse (synced visual feedback)
            player.recoilVisualY = 8;
            player.recoilVisualX = (Math.random() - 0.5) * 3;

            window.soundEngine.playAK47Fire();

            // Ballistics calculation incorporates horizontal recoil drift + spread bloom
            const spread = (Math.random() - 0.5) * (0.024 * sprayFactor);
            const rayAngle = player.angle + player.recoilAngleX + spread;
            const damage = Math.floor(25 + Math.random() * 12);
            this.raycastShot(player.x, player.y, rayAngle, damage, enemies, map, vfxSystem, 'bullet', 35.0);

        } else if (weaponType === 'supershotgun') {
            if (player.ammo.shells < 2) {
                window.soundEngine.playMenuClick();
                this.cooldown = 0.4;
                return;
            }

            player.ammo.shells -= 2;
            this.state = 'fire';
            this.timer = 0;
            this.cooldown = 1.15;
            this.muzzleFlashActive = true;
            this.muzzleColor = '#ff8800';
            player.screenShake = 1.2;

            // Heavy shotgun kick
            player.recoilPitch = Math.min(30, (player.recoilPitch || 0) + 8.5);
            player.recoilVisualY = 12;
            player.recoilVisualX = (Math.random() - 0.5) * 4;

            window.soundEngine.playSuperShotgunFire();

            // Fire 14 heavy spread pellets (Devastating point-blank burst!)
            const pelletCount = 14;
            const spreadAngle = 0.16;

            for (let i = 0; i < pelletCount; i++) {
                const spread = (Math.random() - 0.5) * spreadAngle;
                const rayAngle = player.angle + (player.recoilAngleX || 0) + spread;
                const damage = Math.floor(18 + Math.random() * 14);
                this.raycastShot(player.x, player.y, rayAngle, damage, enemies, map, vfxSystem, 'pellet', 22.0);
            }

        } else if (weaponType === 'plasma') {
            if (player.ammo.plasma <= 0) {
                window.soundEngine.playMenuClick();
                this.cooldown = 0.25;
                return;
            }

            player.ammo.plasma--;
            this.state = 'fire';
            this.timer = 0;
            this.cooldown = 0.11;
            this.muzzleFlashActive = true;
            this.muzzleColor = '#00ffff';
            player.screenShake = 0.15;

            // Plasma energy impulse
            player.recoilPitch = Math.min(16, (player.recoilPitch || 0) + 1.6);
            player.recoilVisualY = 4;
            player.recoilVisualX = (Math.random() - 0.5) * 1.5;

            window.soundEngine.playPlasmaFire();

            const spread = (Math.random() - 0.5) * 0.02;
            const rayAngle = player.angle + (player.recoilAngleX || 0) + spread;
            const damage = Math.floor(28 + Math.random() * 12);
            this.raycastShot(player.x, player.y, rayAngle, damage, enemies, map, vfxSystem, 'plasma', 30.0);
        }
    }

    /**
     * Hitscan raycast checking for wall collisions, explosive barrels, and enemy intersections
     */
    raycastShot(startX, startY, angle, damage, enemies, map, vfxSystem, type, maxDist = 20.0) {
        const stepSize = 0.08;
        const dirX = Math.cos(angle);
        const dirY = Math.sin(angle);

        let hitTarget = null;
        let hitType = null;
        let hitX = startX + dirX * maxDist;
        let hitY = startY + dirY * maxDist;

        // Step ray forward
        for (let dist = 0.2; dist < maxDist; dist += stepSize) {
            const curX = startX + dirX * dist;
            const curY = startY + dirY * dist;

            // 1. Check Wall Hit
            if (map.isWall(curX, curY)) {
                hitType = 'wall';
                hitX = curX;
                hitY = curY;
                if (vfxSystem) {
                    vfxSystem.spawnSparks(curX, curY, type === 'plasma' ? '#00ffff' : '#ffcc00');
                }
                break;
            }

            // 2. Check Barrel Hit
            for (const p of map.pickups) {
                if (p.type === 'barrel' && !p.collected) {
                    const bDistX = curX - p.x;
                    const bDistY = curY - p.y;
                    if ((bDistX * bDistX + bDistY * bDistY) < 0.25) {
                        hitTarget = p;
                        hitType = 'barrel';
                        hitX = curX;
                        hitY = curY;
                        break;
                    }
                }
            }
            if (hitTarget) break;

            // 3. Check Enemy Hit
            for (const enemy of enemies) {
                if (enemy.isDead) continue;
                const eDistX = curX - enemy.x;
                const eDistY = curY - enemy.y;
                if ((eDistX * eDistX + eDistY * eDistY) < (enemy.radius * enemy.radius)) {
                    hitTarget = enemy;
                    hitType = 'enemy';
                    hitX = curX;
                    hitY = curY;
                    break;
                }
            }
            if (hitTarget) break;
        }

        // Apply Hits
        if (hitType === 'enemy' && hitTarget) {
            hitTarget.takeDamage(damage, window.player);
            if (vfxSystem) {
                vfxSystem.spawnBlood(hitX, hitY);
            }
        } else if (hitType === 'barrel' && hitTarget) {
            hitTarget.collected = true;
            window.soundEngine.playBarrelExplode(hitTarget.x, hitTarget.y, window.player);
            if (vfxSystem) {
                vfxSystem.spawnExplosion(hitTarget.x, hitTarget.y);
            }

            // AoE Splash Damage
            const splashRadius = 3.5;
            for (const enemy of enemies) {
                if (enemy.isDead) continue;
                const edx = enemy.x - hitTarget.x;
                const edy = enemy.y - hitTarget.y;
                const edist = Math.hypot(edx, edy);
                if (edist < splashRadius) {
                    const splashDmg = Math.floor((1 - edist / splashRadius) * 120);
                    enemy.takeDamage(splashDmg, window.player);
                }
            }

            const pdx = window.player.x - hitTarget.x;
            const pdy = window.player.y - hitTarget.y;
            const pdist = Math.hypot(pdx, pdy);
            if (pdist < splashRadius) {
                const splashDmg = Math.floor((1 - pdist / splashRadius) * 60);
                window.player.takeDamage(splashDmg);
            }
        }
    }

    getRenderSprite(player) {
        const weaponType = player.currentWeapon;
        const assets = window.assetManager;
        if (!assets || !assets.weapons) return null;

        if (weaponType === 'knife') {
            const w = assets.weapons.knife;
            return this.state === 'slash' ? w.slash : w.idle;
        } else if (weaponType === 'ak47' || weaponType === 'shotgun') {
            const w = assets.weapons.ak47 || assets.weapons.shotgun;
            if (this.state === 'fire') return w.fire;
            if (this.state === 'recoil') return w.recoil;
            if (this.state === 'reload') return w.reload;
            return w.idle;
        } else if (weaponType === 'supershotgun') {
            const w = assets.weapons.supershotgun;
            if (this.state === 'fire') return w.fire;
            if (this.state === 'recoil') return w.recoil;
            if (this.state === 'open') return w.open;
            if (this.state === 'reload') return w.reload;
            return w.idle;
        } else if (weaponType === 'plasma') {
            const w = assets.weapons.plasma;
            if (this.state === 'fire') return w.fire;
            if (this.state === 'recoil') return w.recoil;
            return w.idle;
        }
        return null;
    }
}

window.weaponManager = new WeaponManager();
