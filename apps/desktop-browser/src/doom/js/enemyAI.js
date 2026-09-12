/**
 * OFFLINE DOOM - Enemy AI System
 * Implements line-of-sight detection, wall avoidance, pathing, demonic rushing audio, and attack execution.
 */
class EnemyAI {
    constructor() {}

    updateEnemy(enemy, dt, player, map, collision, projectiles, vfxSystem) {
        if (enemy.isDead || player.isDead) return;

        const dx = player.x - enemy.x;
        const dy = player.y - enemy.y;
        const dist = Math.hypot(dx, dy);

        // 1. Detection Phase (Balanced Sightlines & Agro)
        if (enemy.state === 'IDLE') {
            const hasLOS = (dist < 9.0) && collision.hasLineOfSight(enemy.x, enemy.y, player.x, player.y, map);
            const isNear = dist < 3.0; // Close hearing range

            if (hasLOS || isNear) {
                enemy.state = 'DETECT';
                if (!enemy.alertPlayed) {
                    enemy.alertPlayed = true;
                    window.soundEngine.playDemonAlert(enemy.type, enemy.x, enemy.y, player);
                }
            }
            return;
        }

        if (enemy.state === 'DETECT') {
            enemy.state = 'CHASE';
        }

        // 2. Periodic Demon Rushing / Growling Sounds (3D Spatial Panning)
        if (enemy.state === 'CHASE') {
            enemy.growlTimer -= dt;
            if (enemy.growlTimer <= 0) {
                if (dist < 20.0) {
                    window.soundEngine.playDemonRushSound(enemy.type, enemy.x, enemy.y, player);
                }
                enemy.growlTimer = 2.2 + Math.random() * 2.8;
            }
        }

        // 3. Attack Execution / Range Evaluation
        if (enemy.type === 'crawler') {
            // Crawler Demon (Physical Melee Claw Swipe - 25% Health Damage)
            if (dist <= enemy.attackRange) {
                enemy.state = 'ATTACK';
                if (enemy.attackTimer <= 0) {
                    enemy.attackTimer = enemy.attackCooldownMax;
                    window.soundEngine.playClawAttack(enemy.x, enemy.y, player);
                    player.takeDamage(enemy.attackDamage);
                    if (vfxSystem) {
                        vfxSystem.spawnBlood(player.x, player.y);
                    }
                }
                return;
            } else {
                enemy.state = 'CHASE';
            }
        } else if (enemy.type === 'imp') {
            // Hell Imp (Physical Melee Slasher - 25% Health Damage, No Fireballs)
            if (dist <= enemy.attackRange) {
                enemy.state = 'ATTACK';
                if (enemy.attackTimer <= 0) {
                    enemy.attackTimer = enemy.attackCooldownMax;
                    window.soundEngine.playClawAttack(enemy.x, enemy.y, player);
                    player.takeDamage(enemy.attackDamage);
                    if (vfxSystem) {
                        vfxSystem.spawnBlood(player.x, player.y);
                    }
                }
                return;
            } else {
                enemy.state = 'CHASE';
            }
        } else if (enemy.type === 'brute') {
            // Cyber-Brute Boss (50% Half-Health Damage per Strike!)
            const hasLOS = collision.hasLineOfSight(enemy.x, enemy.y, player.x, player.y, map);
            if (dist <= 1.8) {
                // Point-blank thunderous melee slam (Reduces health by 50%!)
                enemy.state = 'ATTACK';
                if (enemy.attackTimer <= 0) {
                    enemy.attackTimer = enemy.attackCooldownMax;
                    window.soundEngine.playClawAttack(enemy.x, enemy.y, player);
                    player.takeDamage(enemy.attackDamage);
                    if (vfxSystem) {
                        vfxSystem.spawnBlood(player.x, player.y);
                    }
                }
                return;
            } else if (dist <= enemy.attackRange && hasLOS) {
                // Heavy cybernetic cannon blast (Reduces health by 50%!)
                enemy.state = 'ATTACK';
                if (enemy.attackTimer <= 0) {
                    enemy.attackTimer = enemy.attackCooldownMax;
                    window.soundEngine.playFireballLaunch(enemy.x, enemy.y, player);
                    projectiles.push(new window.EnemyProjectile(
                        enemy.x,
                        enemy.y,
                        player.x,
                        player.y,
                        5.2,
                        enemy.attackDamage,
                        'fireball'
                    ));
                }
                return;
            } else {
                enemy.state = 'CHASE';
            }
        }

        // 4. Movement & Pathing toward Player
        if (enemy.state === 'CHASE') {
            if (dist > 0.4) {
                const baseDirX = dx / dist;
                const baseDirY = dy / dist;

                // Test primary direction
                const moveStep = enemy.speed * dt;
                let res = collision.moveWithSlide(enemy.x, enemy.y, baseDirX * moveStep, baseDirY * moveStep, enemy.radius, map);

                // If fully stuck against a corner, try slight lateral steering angles (+45 deg, -45 deg)
                if (res.collided && (res.x === enemy.x && res.y === enemy.y)) {
                    const angle = Math.atan2(dy, dx);
                    const leftAngle = angle + Math.PI / 4;
                    const rightAngle = angle - Math.PI / 4;

                    const leftRes = collision.moveWithSlide(enemy.x, enemy.y, Math.cos(leftAngle) * moveStep, Math.sin(leftAngle) * moveStep, enemy.radius, map);
                    if (!leftRes.collided) {
                        res = leftRes;
                    } else {
                        res = collision.moveWithSlide(enemy.x, enemy.y, Math.cos(rightAngle) * moveStep, Math.sin(rightAngle) * moveStep, enemy.radius, map);
                    }
                }

                enemy.x = res.x;
                enemy.y = res.y;
            }
        }
    }
}

window.enemyAI = new EnemyAI();
