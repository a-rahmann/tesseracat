/**
 * OFFLINE DOOM - Retro FPS HUD System
 * Renders status bar, animated marine face, digital counters, crosshair, messages, and minimap.
 */
class HUDManager {
    constructor() {
        this.messages = [];
        this.showMinimap = false;
    }

    addMessage(text, color = '#ffcc00') {
        this.messages.push({
            text,
            color,
            time: 3.5
        });
        if (this.messages.length > 4) {
            this.messages.shift();
        }
    }

    update(dt) {
        for (let i = this.messages.length - 1; i >= 0; i--) {
            this.messages[i].time -= dt;
            if (this.messages[i].time <= 0) {
                this.messages.splice(i, 1);
            }
        }
    }

    render(ctx, width, height, player, map, enemies) {
        ctx.save();

        // 1. Tactical Objective Banner (Top of Screen)
        this.renderObjectiveBanner(ctx, width, height, player, map);

        // 2. Crosshair in Screen Center (Moving in all directions with mouse & pitch look)
        this.renderCrosshair(ctx, width, height, player, enemies);

        // 3. Pickup Messages Log
        this.renderMessages(ctx, width, height);

        // 4. Minimap (if enabled)
        if (this.showMinimap) {
            this.renderMinimap(ctx, width, height, player, map, enemies);
        }

        // 5. Retro Status Bar (Bottom 52px)
        this.renderStatusBar(ctx, width, height, player, map);

        ctx.restore();
    }

    renderObjectiveBanner(ctx, width, height, player, map) {
        let objectiveText = '';
        let badgeColor = '#00ffcc';
        let subHint = '';

        const blueKey = (map && map.blueKeyLocation) ? map.blueKeyLocation : { x: 59.5, y: 4.5 };
        const blueDoor = (map && map.blueDoorLocation) ? map.blueDoorLocation : { x: 16, y: 19 };
        const redKey = (map && map.redKeyLocation) ? map.redKeyLocation : { x: 59.5, y: 37.5 };
        const redDoor = (map && map.redDoorLocation) ? map.redDoorLocation : { x: 16, y: 41 };
        const exitPos = (map && map.exitPos) ? map.exitPos : { x: 59.5, y: 59.5 };

        if (!player.keys.blue) {
            const dx = blueKey.x - player.x;
            const dy = blueKey.y - player.y;
            const dist = Math.round(Math.hypot(dx, dy));
            badgeColor = '#00aaff';
            objectiveText = `🎯 OBJECTIVE: FIND BLUE KEYCARD [${dist}m EAST ➔]`;
            subHint = 'EXPLORE EAST WING VAULT TO ACQUIRE KEYCARD';
        } else if (player.y < blueDoor.y + 0.5) {
            const dx = blueDoor.x - player.x;
            const dy = blueDoor.y - player.y;
            const dist = Math.round(Math.hypot(dx, dy));
            badgeColor = '#00aaff';
            objectiveText = `🔑 BLUE KEYCARD ACQUIRED: UNSEAL BLUE DOOR [PRESS E]`;
            subHint = `HEAD TO BLUE DOOR AT SOUTH WALL [${dist}m ➔ X:${blueDoor.x}, Y:${blueDoor.y}]`;
        } else if (!player.keys.red) {
            const dx = redKey.x - player.x;
            const dy = redKey.y - player.y;
            const dist = Math.round(Math.hypot(dx, dy));
            badgeColor = '#ff3311';
            objectiveText = `💀 OBJECTIVE: FIND RED SKULL KEY [${dist}m SOUTHEAST ➔]`;
            subHint = 'SECTOR 2 CORNER CATACOMBS (GUARDED BY CYBER-BRUTE)';
        } else if (player.y < redDoor.y + 0.5) {
            const dx = redDoor.x - player.x;
            const dy = redDoor.y - player.y;
            const dist = Math.round(Math.hypot(dx, dy));
            badgeColor = '#ff3311';
            objectiveText = `💀 RED SKULL KEY ACQUIRED: UNSEAL RED GATE [PRESS E]`;
            subHint = `HEAD TO RED DEMONIC GATE [${dist}m ➔ X:${redDoor.x}, Y:${redDoor.y}]`;
        } else {
            const dx = exitPos.x - player.x;
            const dy = exitPos.y - player.y;
            const dist = Math.round(Math.hypot(dx, dy));
            badgeColor = '#00ff66';
            objectiveText = `🚀 EVACUATION AIRLOCK UNLOCKED: ENTER PORTAL TO ESCAPE!`;
            subHint = `SECTOR 3 SOUTHEAST CORNER [${dist}m ➔ PURGE BOSS DEMONS]`;
        }

        const bannerW = Math.min(width * 0.9, 440);
        const bannerH = 34;
        const bx = (width - bannerW) / 2;
        const by = 8;

        // Background pill
        ctx.fillStyle = 'rgba(10, 14, 20, 0.82)';
        ctx.fillRect(bx, by, bannerW, bannerH);
        ctx.strokeStyle = badgeColor;
        ctx.lineWidth = 1.5;
        ctx.strokeRect(bx, by, bannerW, bannerH);

        // Text
        ctx.textAlign = 'center';
        ctx.fillStyle = badgeColor;
        ctx.font = 'bold 11px "Courier New", monospace';
        ctx.fillText(objectiveText, width / 2, by + 14);

        ctx.fillStyle = '#8b949e';
        ctx.font = 'bold 9px "Courier New", monospace';
        ctx.fillText(subHint, width / 2, by + 27);
    }

    renderCrosshair(ctx, width, height, player, enemies = []) {
        const cx = Math.floor(width / 2);
        const cy = Math.floor((height - 50) / 2); // Perfectly centered in the 3D action viewport

        // Check if aiming at any live demon enemy within crosshair cone
        let targetLocked = false;
        if (enemies && enemies.length > 0) {
            for (const e of enemies) {
                if (e.isDead) continue;
                const dx = e.x - player.x;
                const dy = e.y - player.y;
                const dist = Math.hypot(dx, dy);
                if (dist > 0.5 && dist < 25) {
                    let enemyAngle = Math.atan2(dy, dx) - player.angle;
                    while (enemyAngle < -Math.PI) enemyAngle += Math.PI * 2;
                    while (enemyAngle > Math.PI) enemyAngle -= Math.PI * 2;
                    if (Math.abs(enemyAngle) < (0.35 / dist)) {
                        targetLocked = true;
                        break;
                    }
                }
            }
        }

        const isMoving = Math.abs(player.bob) > 0.4;
        const isFiring = window.weaponManager && (window.weaponManager.state === 'fire' || window.weaponManager.state === 'recoil');
        const recoilSpread = Math.min(10, (player.recoilPitch || 0) * 0.45 + (player.continuousFireTime || 0) * 8);
        const baseSpread = isFiring ? 6 : (isMoving ? 4.5 : 3);
        const spread = Math.floor(baseSpread + recoilSpread);
        const size = 5;

        const mainColor = targetLocked ? '#ff2211' : (player.damageFlash > 0.3 ? '#ff4444' : '#00ffcc');
        
        // 1. Dark Outline for High Contrast (Valorant Style)
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.75)';
        ctx.lineWidth = 3;
        ctx.beginPath();
        // Top
        ctx.moveTo(cx, cy - spread - size - 1);
        ctx.lineTo(cx, cy - spread + 1);
        // Bottom
        ctx.moveTo(cx, cy + spread - 1);
        ctx.lineTo(cx, cy + spread + size + 1);
        // Left
        ctx.moveTo(cx - spread - size - 1, cy);
        ctx.lineTo(cx - spread + 1, cy);
        // Right
        ctx.moveTo(cx + spread - 1, cy);
        ctx.lineTo(cx + spread + size + 1, cy);
        ctx.stroke();

        // 2. Inner Colored Crosshair Reticle
        ctx.strokeStyle = mainColor;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        // Top
        ctx.moveTo(cx, cy - spread - size);
        ctx.lineTo(cx, cy - spread);
        // Bottom
        ctx.moveTo(cx, cy + spread);
        ctx.lineTo(cx, cy + spread + size);
        // Left
        ctx.moveTo(cx - spread - size, cy);
        ctx.lineTo(cx - spread, cy);
        // Right
        ctx.moveTo(cx + spread, cy);
        ctx.lineTo(cx + spread + size, cy);
        ctx.stroke();

        // 3. Target Lock Brackets on Demon
        if (targetLocked) {
            ctx.strokeStyle = 'rgba(255, 50, 20, 0.9)';
            ctx.lineWidth = 1.5;
            const bDist = 12;
            ctx.beginPath();
            // Left Bracket [
            ctx.moveTo(cx - bDist, cy - 4);
            ctx.lineTo(cx - bDist - 3, cy);
            ctx.lineTo(cx - bDist, cy + 4);
            // Right Bracket ]
            ctx.moveTo(cx + bDist, cy - 4);
            ctx.lineTo(cx + bDist + 3, cy);
            ctx.lineTo(cx + bDist, cy + 4);
            ctx.stroke();
        }

        // 4. Center Precision Dot with Shadow
        ctx.fillStyle = '#000000';
        ctx.fillRect(cx - 1.5, cy - 1.5, 3, 3);
        ctx.fillStyle = targetLocked ? '#ffffff' : '#00ffcc';
        ctx.fillRect(cx - 0.5, cy - 0.5, 1.5, 1.5);

        // 5. Contextual Interactive Door & Objective Proximity Popup Banner
        const map = window.mapManager;
        if (map && map.getWall) {
            let nearbyDoorTile = null;

            // Check ray in facing direction
            for (let d = 0.6; d <= 2.4; d += 0.4) {
                const fx = Math.floor(player.x + Math.cos(player.angle) * d);
                const fy = Math.floor(player.y + Math.sin(player.angle) * d);
                const t = map.getWall(fx, fy);
                if (t === 8 || t === 9 || t === 6 || t === 11 || t === 12) {
                    nearbyDoorTile = t;
                    break;
                }
            }

            // If not directly facing, check adjacent radius (nearby proximity)
            if (!nearbyDoorTile) {
                const px = Math.floor(player.x);
                const py = Math.floor(player.y);
                for (let dy = -1; dy <= 1; dy++) {
                    for (let dx = -1; dx <= 1; dx++) {
                        const t = map.getWall(px + dx, py + dy);
                        if (t === 8 || t === 9 || t === 12) {
                            nearbyDoorTile = t;
                            break;
                        }
                    }
                    if (nearbyDoorTile) break;
                }
            }

            let promptText = null;
            let promptColor = '#ffffff';
            let pulseBorder = false;

            if (nearbyDoorTile === 8) {
                if (player.keys && player.keys.blue) {
                    promptText = "[ 🔑 PRESS 'E' TO OPEN BLUE DOOR ]";
                    promptColor = '#00ffff';
                    pulseBorder = true;
                } else {
                    promptText = "[ 🔒 LOCKED: REQUIRES BLUE KEYCARD ]";
                    promptColor = '#ff3333';
                }
            } else if (nearbyDoorTile === 9) {
                if (player.keys && player.keys.red) {
                    promptText = "[ 💀 PRESS 'E' TO UNSEAL RED GATE ]";
                    promptColor = '#ff6600';
                    pulseBorder = true;
                } else {
                    promptText = "[ 🔒 LOCKED: REQUIRES RED SKULL KEY ]";
                    promptColor = '#ff3333';
                }
            } else if (nearbyDoorTile === 6 || nearbyDoorTile === 11) {
                promptText = "[ 🚪 EVACUATION AIRLOCK OPEN - STEP INSIDE ]";
                promptColor = '#00ff66';
                pulseBorder = true;
            } else if (nearbyDoorTile === 12) {
                promptText = "[ ★ PRESS 'E' TO INSPECT CONCEALED WALL ★ ]";
                promptColor = '#ffd700';
                pulseBorder = true;
            }

            if (promptText) {
                ctx.save();
                ctx.font = 'bold 10px "Courier New", monospace';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                const textW = ctx.measureText(promptText).width;
                const popY = cy + 26;

                // Dark Semi-transparent Badge Backdrop
                ctx.fillStyle = 'rgba(8, 12, 16, 0.85)';
                ctx.fillRect(cx - textW / 2 - 8, popY - 10, textW + 16, 20);

                // Glowing Border
                ctx.strokeStyle = promptColor;
                ctx.lineWidth = pulseBorder ? 2 : 1;
                ctx.shadowColor = promptColor;
                ctx.shadowBlur = pulseBorder ? 8 : 4;
                ctx.strokeRect(cx - textW / 2 - 8, popY - 10, textW + 16, 20);

                // Text
                ctx.fillStyle = promptColor;
                ctx.shadowBlur = 4;
                ctx.fillText(promptText, cx, popY);
                ctx.restore();
            }
        }
    }

    renderMessages(ctx, width, height) {
        ctx.font = 'bold 12px "Courier New", monospace';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';

        let y = 10;
        for (const msg of this.messages) {
            ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
            const textW = ctx.measureText(msg.text).width;
            ctx.fillRect(10, y - 2, textW + 12, 18);

            ctx.fillStyle = msg.color;
            ctx.fillText(msg.text, 16, y);
            y += 20;
        }
    }

    renderStatusBar(ctx, width, height, player, map) {
        const barH = 50;
        const barY = height - barH;

        // Status Bar Frame (Dark Titanium Industrial Chassis)
        ctx.fillStyle = '#181b20';
        ctx.fillRect(0, barY, width, barH);

        // Metal Bevels
        ctx.fillStyle = '#3a414d';
        ctx.fillRect(0, barY, width, 3);
        ctx.fillStyle = '#0d0f12';
        ctx.fillRect(0, height - 2, width, 2);

        // Sections
        const secW = width / 5;

        // 1. HEALTH Box
        this.renderStatBox(ctx, 0, barY, secW, barH, 'HEALTH', `${player.health}%`, player.health < 25 ? '#ff2222' : '#00ff66');

        // 2. ARMOR Box
        this.renderStatBox(ctx, secW, barY, secW, barH, 'ARMOR', `${player.armor}%`, '#00ccff');

        // 3. CENTER: MARINE AVATAR FACE
        const faceX = Math.floor(secW * 2 + (secW - 44) / 2);
        const faceY = barY + 4;
        const assets = window.assetManager;
        if (assets && assets.ui && assets.ui.faces) {
            const faceCanvas = assets.ui.faces[player.faceState] || assets.ui.faces.healthy;
            if (faceCanvas) {
                ctx.drawImage(faceCanvas, faceX, faceY, 44, 42);
            }
        }

        // 4. AMMO Box (4 Weapons: Knife, AK-47, Super Shotgun, Plasma Carbine)
        let curAmmo = player.ammo.bullets;
        let ammoLabel = 'AK-47';
        let ammoVal = `${curAmmo}`;
        if (player.currentWeapon === 'knife') {
            ammoLabel = 'KNIFE';
            ammoVal = 'INF';
        } else if (player.currentWeapon === 'ak47' || player.currentWeapon === 'shotgun') {
            ammoLabel = 'AK-47';
            ammoVal = `${player.ammo.bullets !== undefined ? player.ammo.bullets : 25}`;
        } else if (player.currentWeapon === 'supershotgun') {
            ammoLabel = 'SHELLS';
            ammoVal = `${player.ammo.shells !== undefined ? player.ammo.shells : 0}`;
        } else if (player.currentWeapon === 'plasma') {
            ammoLabel = 'PLASMA';
            ammoVal = `${player.ammo.plasma}`;
        }
        this.renderStatBox(ctx, secW * 3, barY, secW, barH, ammoLabel, ammoVal, (ammoVal !== 'INF' && parseInt(ammoVal) < 5) ? '#ff3333' : '#ffaa00');

        // 5. KILLS & KEYS Box (Shows total demons killed)
        this.renderStatBox(ctx, secW * 4, barY, secW, barH, 'KILLS', `${player.kills}`, '#00ff66');

        // KEYCARD INDICATORS (Blue & Red Key Badges on HUD)
        if (player.keys.blue) {
            ctx.fillStyle = '#00aaff';
            ctx.shadowColor = '#00ffff';
            ctx.shadowBlur = 4;
            ctx.fillRect(secW * 4 - 24, barY + 12, 10, 14);
            ctx.fillStyle = '#fff';
            ctx.fillRect(secW * 4 - 22, barY + 14, 6, 4);
            ctx.shadowBlur = 0;
        }
        if (player.keys.red) {
            ctx.fillStyle = '#ff2200';
            ctx.shadowColor = '#ff3300';
            ctx.shadowBlur = 4;
            ctx.fillRect(secW * 4 - 10, barY + 12, 10, 14);
            ctx.fillStyle = '#fff';
            ctx.fillRect(secW * 4 - 8, barY + 14, 6, 4);
            ctx.shadowBlur = 0;
        }
    }

    renderStatBox(ctx, x, y, w, h, label, val, valColor) {
        // Inset panel
        ctx.fillStyle = '#0d1014';
        ctx.fillRect(x + 4, y + 5, w - 8, h - 10);
        ctx.strokeStyle = '#2d3540';
        ctx.lineWidth = 1;
        ctx.strokeRect(x + 4, y + 5, w - 8, h - 10);

        // Label
        ctx.fillStyle = '#7a889b';
        ctx.font = 'bold 9px "Courier New", monospace';
        ctx.textAlign = 'center';
        ctx.fillText(label, x + w / 2, y + 15);

        // Digital Value
        ctx.fillStyle = valColor;
        ctx.font = 'bold 16px "Courier New", monospace';
        ctx.fillText(val, x + w / 2, y + 34);
    }

    renderMinimap(ctx, width, height, player, map, enemies) {
        const size = 140;
        const mx = width - size - 12;
        const my = 12;
        const viewRadius = 15; // View 30x30 grid window centered on player for 64x64 map
        const tileSize = size / (viewRadius * 2);

        // Background
        ctx.fillStyle = 'rgba(8, 12, 16, 0.9)';
        ctx.fillRect(mx, my, size, size);
        ctx.strokeStyle = '#00ffcc';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(mx, my, size, size);

        // Clip to minimap box
        ctx.save();
        ctx.beginPath();
        ctx.rect(mx, my, size, size);
        ctx.clip();

        const startGX = Math.floor(player.x - viewRadius);
        const endGX = Math.floor(player.x + viewRadius);
        const startGY = Math.floor(player.y - viewRadius);
        const endGY = Math.floor(player.y + viewRadius);

        // Render Local Grid Tiles
        for (let gy = startGY; gy <= endGY; gy++) {
            for (let gx = startGX; gx <= endGX; gx++) {
                if (gx < 0 || gx >= map.width || gy < 0 || gy >= map.height) {
                    ctx.fillStyle = '#1c2430';
                    const screenX = mx + (gx - (player.x - viewRadius)) * tileSize;
                    const screenY = my + (gy - (player.y - viewRadius)) * tileSize;
                    ctx.fillRect(screenX, screenY, tileSize + 0.5, tileSize + 0.5);
                    continue;
                }

                const tile = map.grid[gy][gx];
                if (tile > 0) {
                    let tileColor = '#3a4a5e';
                    if (tile === 2) tileColor = '#8c1622'; // Demonic
                    if (tile === 3) tileColor = '#007799'; // Tech
                    if (tile === 4) tileColor = '#886600'; // Toxic
                    if (tile === 6 || tile === 11) tileColor = '#00ff66'; // Exit Objective
                    if (tile === 7) tileColor = '#5c0c14'; // Flesh
                    if (tile === 8) tileColor = '#00aaff'; // Blue Door
                    if (tile === 9) tileColor = '#ff2200'; // Red Gate
                    if (tile === 10) tileColor = '#00ff88'; // Waypoint Arrow
                    if (tile === 12) tileColor = '#3a4a5e'; // Concealed secret wall looks like standard wall on radar!

                    ctx.fillStyle = tileColor;
                    const screenX = mx + (gx - (player.x - viewRadius)) * tileSize;
                    const screenY = my + (gy - (player.y - viewRadius)) * tileSize;
                    ctx.fillRect(screenX, screenY, tileSize + 0.5, tileSize + 0.5);
                }
            }
        }

        // Render Local Pickups
        for (const p of map.pickups) {
            if (!p.collected) {
                const screenX = mx + (p.x - (player.x - viewRadius)) * tileSize;
                const screenY = my + (p.y - (player.y - viewRadius)) * tileSize;

                if (p.type === 'key_blue') {
                    // Bright Glowing Blue Key Diamond
                    ctx.fillStyle = '#00ffff';
                    ctx.beginPath();
                    ctx.arc(screenX, screenY, 4.5, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.strokeStyle = '#ffffff';
                    ctx.lineWidth = 1.5;
                    ctx.stroke();
                } else if (p.type === 'key_red') {
                    // Bright Glowing Red Key Diamond
                    ctx.fillStyle = '#ff2200';
                    ctx.beginPath();
                    ctx.arc(screenX, screenY, 4.5, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.strokeStyle = '#ffffff';
                    ctx.lineWidth = 1.5;
                    ctx.stroke();
                } else {
                    ctx.fillStyle = '#ffd700';
                    ctx.fillRect(screenX - 1.5, screenY - 1.5, 3, 3);
                }
            }
        }

        // Render Local Enemies (Red dots)
        for (const e of enemies) {
            if (!e.isDead) {
                ctx.fillStyle = (e.type === 'brute') ? '#ffaa00' : '#ff2222';
                const screenX = mx + (e.x - (player.x - viewRadius)) * tileSize;
                const screenY = my + (e.y - (player.y - viewRadius)) * tileSize;
                const dotSize = e.type === 'brute' ? 4 : 3;
                ctx.fillRect(screenX - dotSize / 2, screenY - dotSize / 2, dotSize, dotSize);
            }
        }

        // Exit Objective Marker
        const exitScreenX = mx + (map.exitPos.x - (player.x - viewRadius)) * tileSize;
        const exitScreenY = my + (map.exitPos.y - (player.y - viewRadius)) * tileSize;
        ctx.fillStyle = '#00ff66';
        ctx.fillRect(exitScreenX - 3, exitScreenY - 3, 6, 6);

        // Player (Center of Minimap)
        const px = mx + size / 2;
        const py = my + size / 2;

        ctx.fillStyle = '#00ffff';
        ctx.beginPath();
        ctx.arc(px, py, 3.5, 0, Math.PI * 2);
        ctx.fill();

        // Direction Sight Line
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(px, py);
        ctx.lineTo(px + Math.cos(player.angle) * 10, py + Math.sin(player.angle) * 10);
        ctx.stroke();

        ctx.restore();

        // Minimap Title
        ctx.fillStyle = '#7a889b';
        ctx.font = 'bold 8px "Courier New", monospace';
        ctx.textAlign = 'right';
        ctx.fillText('TACTICAL RADAR [TAB]', mx + size, my - 3);
    }
}

window.hudManager = new HUDManager();
