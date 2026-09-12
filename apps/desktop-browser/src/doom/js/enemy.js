/**
 * OFFLINE DOOM - Enemy Entity & Projectiles
 * Handles enemy stats, animations, hurt frames, and projectile physics.
 */

class EnemyProjectile {
    constructor(x, y, targetX, targetY, speed = 5.2, damage = 22, type = 'fireball') {
        this.x = x;
        this.y = y;
        this.type = type;
        this.damage = damage;
        this.speed = speed;
        this.radius = 0.22;
        this.isDead = false;

        // Calculate direction vector
        const dx = targetX - x;
        const dy = targetY - y;
        const len = Math.hypot(dx, dy) || 1;
        this.dirX = dx / len;
        this.dirY = dy / len;
        this.lifetime = 5.0; // Seconds before dissipating
    }

    update(dt, player, map, vfxSystem) {
        if (this.isDead) return;

        this.lifetime -= dt;
        if (this.lifetime <= 0) {
            this.isDead = true;
            return;
        }

        // Move projectile
        const moveDist = this.speed * dt;
        this.x += this.dirX * moveDist;
        this.y += this.dirY * moveDist;

        // 1. Check Wall Collision
        if (map.isWall(this.x, this.y)) {
            this.isDead = true;
            window.soundEngine.playFireballImpact();
            if (vfxSystem) {
                vfxSystem.spawnExplosion(this.x, this.y);
            }
            return;
        }

        // 2. Check Player Collision
        const pDistX = this.x - player.x;
        const pDistY = this.y - player.y;
        if ((pDistX * pDistX + pDistY * pDistY) < (this.radius + player.radius) * (this.radius + player.radius)) {
            this.isDead = true;
            player.takeDamage(this.damage);
            window.soundEngine.playFireballImpact();
            if (vfxSystem) {
                vfxSystem.spawnExplosion(this.x, this.y);
            }
        }
    }
}

class Enemy {
    constructor(type, x, y) {
        this.type = type; // 'crawler' or 'brute'
        this.x = x;
        this.y = y;
        this.state = 'IDLE'; // IDLE, DETECT, CHASE, ATTACK, HURT, DEAD
        this.radius = type === 'brute' ? 0.42 : 0.32;

        if (type === 'crawler') {
            this.health = 45;
            this.maxHealth = 45;
            this.speed = 2.1;
            this.attackRange = 1.05;
            this.attackDamage = 25; // Reduces player health by 25%
            this.attackCooldownMax = 1.2;
            this.scoreValue = 100;
        } else if (type === 'imp') {
            // Hell Imp (Physical Melee Slasher)
            this.health = 65;
            this.maxHealth = 65;
            this.speed = 1.65;
            this.attackRange = 1.1;
            this.attackDamage = 25; // Physical attack reduces player health by 25%
            this.attackCooldownMax = 1.2;
            this.scoreValue = 150;
        } else {
            // Brute Cyber-Demon
            this.health = 200;
            this.maxHealth = 200;
            this.speed = 1.25;
            this.attackRange = 9.0;
            this.attackDamage = 50; // Heavy boss attack reduces player health to half (50%)!
            this.attackCooldownMax = 2.0;
            this.scoreValue = 350;
        }

        this.attackTimer = 0;
        this.hurtTimer = 0;
        this.animTimer = 0;
        this.animFrame = 0;
        this.deathTimer = 0;
        this.isDead = false;
        this.alertPlayed = false;
        this.growlTimer = 1.0 + Math.random() * 2.5; // Timer for menacing rushing growls
    }

    takeDamage(amount, player) {
        if (this.isDead) return;

        this.health -= amount;
        this.hurtTimer = 0.18;
        this.state = 'HURT';

        // Alert enemy to player presence immediately
        if (!this.alertPlayed) {
            this.alertPlayed = true;
            window.soundEngine.playDemonAlert(this.type, this.x, this.y, player);
        }

        window.soundEngine.playDemonHurt(this.x, this.y, player);

        if (this.health <= 0) {
            this.die(player);
        }
    }

    die(player) {
        this.health = 0;
        this.isDead = true;
        this.state = 'DEAD';
        this.deathTimer = 0;

        if (player) {
            player.score += this.scoreValue;
            player.kills++;
            player.setTemporaryFace('grin', 1.0);
        }

        if (window.soundEngine) {
            window.soundEngine.playDemonDeath(this.type === 'brute', this.x, this.y, player);
        }

        // Dynamic Enemy Drops upon death
        const map = window.mapManager;
        if (map && map.pickups) {
            if (this.type === 'brute') {
                // Big Cyber-Demon drops BOTH Medikit AND Ammo (with high chance of Plasma Ammo)!
                const isPlasma = Math.random() < 0.60;
                const isSuperHealth = Math.random() < 0.35;

                // Drop 1: Medikit / Mega Health
                map.pickups.push({
                    id: map.pickups.length,
                    type: isSuperHealth ? 'mega_health' : 'health',
                    x: this.x - 0.22,
                    y: this.y,
                    collected: false
                });

                // Drop 2: Ammo (AK-47 Bullets or Plasma Energy Cells)
                map.pickups.push({
                    id: map.pickups.length,
                    type: isPlasma ? 'ammo_plasma' : 'ammo_bullets',
                    x: this.x + 0.22,
                    y: this.y,
                    collected: false
                });
            } else {
                // Regular Demon (Crawler or Imp) drops Medikit OR AK-47 Ammo
                // Prioritize health if player is wounded, otherwise random 50/50
                let dropType = 'ammo_bullets';
                if (player && player.health < 60) {
                    dropType = Math.random() < 0.7 ? 'health' : 'ammo_bullets';
                } else {
                    dropType = Math.random() < 0.5 ? 'health' : 'ammo_bullets';
                }

                map.pickups.push({
                    id: map.pickups.length,
                    type: dropType,
                    x: this.x,
                    y: this.y,
                    collected: false
                });
            }
        }
    }

    update(dt, player, map, collision, projectiles, vfxSystem) {
        if (this.isDead) {
            this.deathTimer += dt;
            return;
        }

        // Handle Hurt State Timer
        if (this.hurtTimer > 0) {
            this.hurtTimer -= dt;
            if (this.hurtTimer <= 0 && !this.isDead) {
                this.state = 'CHASE';
            }
        }

        if (this.attackTimer > 0) {
            this.attackTimer -= dt;
        }

        // Animation Timer
        this.animTimer += dt;
        if (this.animTimer > 0.2) {
            this.animTimer = 0;
            this.animFrame = (this.animFrame + 1) % 4;
        }

        // Run AI behavior
        window.enemyAI.updateEnemy(this, dt, player, map, collision, projectiles, vfxSystem);
    }

    getCurrentSprite() {
        const assets = window.assetManager;
        if (!assets || !assets.sprites) return null;
        const set = assets.sprites[this.type];
        if (!set) return null;

        if (this.state === 'DEAD') {
            const deathFrames = set.die;
            const idx = Math.min(deathFrames.length - 1, Math.floor(this.deathTimer * 6));
            return deathFrames[idx];
        }

        if (this.state === 'HURT') {
            return set.hurt;
        }

        if (this.state === 'ATTACK') {
            const atkFrames = set.attack;
            const idx = Math.min(atkFrames.length - 1, Math.floor(this.animTimer * 10) % atkFrames.length);
            return atkFrames[idx];
        }

        // Walk / Chase / Idle
        return set.walk[this.animFrame % set.walk.length];
    }
}

window.Enemy = Enemy;
window.EnemyProjectile = EnemyProjectile;
