/**
 * OFFLINE DOOM - 3D Raycasting Engine & Renderer
 * High-performance DDA raycaster, Z-buffer sprite billboarding, depth lighting, and particle effects.
 */

class VFXSystem {
    constructor() {
        this.particles = [];
    }

    reset() {
        this.particles = [];
    }

    spawnBlood(x, y, count = 8) {
        for (let i = 0; i < count; i++) {
            this.particles.push({
                type: 'blood',
                x: x + (Math.random() - 0.5) * 0.2,
                y: y + (Math.random() - 0.5) * 0.2,
                vx: (Math.random() - 0.5) * 1.5,
                vy: (Math.random() - 0.5) * 1.5,
                life: 0.4 + Math.random() * 0.3,
                maxLife: 0.7,
                size: 3 + Math.random() * 3,
                color: '#b30000'
            });
        }
    }

    spawnSparks(x, y, color = '#ffcc00', count = 6) {
        for (let i = 0; i < count; i++) {
            this.particles.push({
                type: 'spark',
                x: x,
                y: y,
                vx: (Math.random() - 0.5) * 2.5,
                vy: (Math.random() - 0.5) * 2.5,
                life: 0.2 + Math.random() * 0.2,
                maxLife: 0.4,
                size: 2 + Math.random() * 2,
                color: color
            });
        }
    }

    spawnExplosion(x, y) {
        this.spawnSparks(x, y, '#ff5500', 12);
        this.spawnSparks(x, y, '#ffcc00', 8);
    }

    update(dt) {
        for (let i = this.particles.length - 1; i >= 0; i--) {
            const p = this.particles[i];
            p.life -= dt;
            if (p.life <= 0) {
                this.particles.splice(i, 1);
                continue;
            }
            p.x += p.vx * dt;
            p.y += p.vy * dt;
        }
    }
}

class RaycastRenderer {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.ctx.imageSmoothingEnabled = false;

        // Internal rendering resolution (480x270 for optimal retro balance)
        this.width = 480;
        this.height = 270;
        this.canvas.width = this.width;
        this.canvas.height = this.height;

        this.zBuffer = new Float32Array(this.width);
        this.fovPlaneRatio = 1.0; // ~90 degree modern tactical shooter FOV (Valorant style)

        this.vfx = new VFXSystem();
    }

    render(player, map, enemies, projectiles, weaponManager) {
        const ctx = this.ctx;
        const W = this.width;
        const H = this.height;

        ctx.save();

        // 1. Render Ceiling & Floor Gradients (Rigid and Rock-Solid)
        this.renderCeilingAndFloor(player);

        // 3. DDA Wall Raycasting
        this.renderWalls(player, map);

        // 4. Render 3D Sprites (Pickups, Enemies, Projectiles, VFX)
        this.renderSprites(player, map, enemies, projectiles);

        // 5. Render Weapon in View
        this.renderWeapon(player, weaponManager);

        // 6. Render Screen Overlays (Damage, Pickups)
        this.renderOverlays(player);

        ctx.restore();
    }

    renderCeilingAndFloor(player) {
        const ctx = this.ctx;
        const W = this.width;
        const H = this.height;
        const totalPitch = (player.pitch || 0) + (player.recoilPitch || 0);
        const horizon = Math.max(25, Math.min(H - 25, Math.floor(H / 2 + totalPitch)));

        // Ceiling Gradient (Dark Industrial Hell Sky)
        const ceilGrad = ctx.createLinearGradient(0, 0, 0, horizon);
        ceilGrad.addColorStop(0, '#0a0507');
        ceilGrad.addColorStop(0.7, '#1f0d14');
        ceilGrad.addColorStop(1, '#3b141f');
        ctx.fillStyle = ceilGrad;
        ctx.fillRect(0, 0, W, horizon);

        // Floor Gradient (Dark Metallic Concrete / Fog falloff)
        const floorGrad = ctx.createLinearGradient(0, horizon, 0, H);
        floorGrad.addColorStop(0, '#211c19');
        floorGrad.addColorStop(0.5, '#141210');
        floorGrad.addColorStop(1, '#080706');
        ctx.fillStyle = floorGrad;
        ctx.fillRect(0, horizon, W, Math.max(0, H - horizon));
    }

    renderWalls(player, map) {
        const ctx = this.ctx;
        const W = this.width;
        const H = this.height;
        const assets = window.assetManager;

        const dirX = Math.cos(player.angle);
        const dirY = Math.sin(player.angle);
        const planeX = -Math.sin(player.angle) * this.fovPlaneRatio;
        const planeY = Math.cos(player.angle) * this.fovPlaneRatio;

        const totalPitch = (player.pitch || 0) + (player.recoilPitch || 0);
        const horizon = Math.max(25, Math.min(H - 25, Math.floor(H / 2 + totalPitch)));

        for (let x = 0; x < W; x++) {
            const cameraX = (2 * x) / W - 1;
            const rayDirX = dirX + planeX * cameraX;
            const rayDirY = dirY + planeY * cameraX;

            let mapX = Math.floor(player.x);
            let mapY = Math.floor(player.y);

            const deltaDistX = Math.abs(1 / (rayDirX || 0.00001));
            const deltaDistY = Math.abs(1 / (rayDirY || 0.00001));

            let stepX, stepY;
            let sideDistX, sideDistY;

            if (rayDirX < 0) {
                stepX = -1;
                sideDistX = (player.x - mapX) * deltaDistX;
            } else {
                stepX = 1;
                sideDistX = (mapX + 1.0 - player.x) * deltaDistX;
            }

            if (rayDirY < 0) {
                stepY = -1;
                sideDistY = (player.y - mapY) * deltaDistY;
            } else {
                stepY = 1;
                sideDistY = (mapY + 1.0 - player.y) * deltaDistY;
            }

            // DDA Step
            let hit = false;
            let side = 0;
            let wallType = 1;

            while (!hit) {
                if (sideDistX < sideDistY) {
                    sideDistX += deltaDistX;
                    mapX += stepX;
                    side = 0;
                } else {
                    sideDistY += deltaDistY;
                    mapY += stepY;
                    side = 1;
                }

                wallType = map.getWall(mapX, mapY);
                if (wallType > 0) {
                    hit = true;
                }
            }

            // Perpendicular Wall Distance
            let perpWallDist;
            if (side === 0) {
                perpWallDist = (mapX - player.x + (1 - stepX) / 2) / (rayDirX || 0.00001);
            } else {
                perpWallDist = (mapY - player.y + (1 - stepY) / 2) / (rayDirY || 0.00001);
            }

            perpWallDist = Math.max(0.1, perpWallDist);
            this.zBuffer[x] = perpWallDist;

            // Projected Line Height & Freelook Projection Shear
            const lineHeight = Math.floor(H / perpWallDist);
            const rawDrawStart = Math.floor(-lineHeight / 2 + horizon);
            const rawDrawEnd = Math.floor(lineHeight / 2 + horizon);
            const drawStart = Math.max(0, rawDrawStart);
            const drawEnd = Math.min(H - 1, rawDrawEnd);
            const drawHeight = drawEnd - drawStart + 1;

            if (drawHeight <= 0) continue;

            // Exact Wall Texture X calculation
            let wallHitX;
            if (side === 0) {
                wallHitX = player.y + perpWallDist * rayDirY;
            } else {
                wallHitX = player.x + perpWallDist * rayDirX;
            }
            wallHitX -= Math.floor(wallHitX);

            const texSize = assets.TEX_SIZE;
            let texX = Math.floor(wallHitX * texSize);
            if (side === 0 && rayDirX > 0) texX = texSize - texX - 1;
            if (side === 1 && rayDirY < 0) texX = texSize - texX - 1;

            const texObj = assets.textures[wallType] || assets.textures[1];
            if (texObj && texObj.canvas) {
                // Correct texture Y slice mapping without squashing/stretching
                const texY0 = Math.max(0, (drawStart - rawDrawStart) * (texSize / (lineHeight || 1)));
                const texSliceH = Math.min(texSize - texY0, Math.max(1, drawHeight * (texSize / (lineHeight || 1))));

                ctx.drawImage(
                    texObj.canvas,
                    texX, texY0, 1, texSliceH,
                    x, drawStart, 1, drawHeight
                );
            }

            // Depth Lighting / Distance Fog (Scaled for 96x96 map)
            const fogDist = 68.0;
            const darkness = Math.min(0.92, Math.max(0, perpWallDist / fogDist));
            const sideDarken = (side === 1) ? 0.2 : 0.0;
            const totalDark = Math.min(0.95, darkness + sideDarken);

            if (totalDark > 0.05) {
                ctx.fillStyle = `rgba(10, 5, 8, ${totalDark})`;
                ctx.fillRect(x, drawStart, 1, drawHeight);
            }
        }
    }

    renderSprites(player, map, enemies, projectiles) {
        const ctx = this.ctx;
        const W = this.width;
        const H = this.height;
        const assets = window.assetManager;

        const dirX = Math.cos(player.angle);
        const dirY = Math.sin(player.angle);
        const planeX = -Math.sin(player.angle) * this.fovPlaneRatio;
        const planeY = Math.cos(player.angle) * this.fovPlaneRatio;
        const totalPitch = (player.pitch || 0) + (player.recoilPitch || 0);
        const horizon = Math.floor(H / 2 + totalPitch);

        // Collect all renderable sprite items
        const spriteList = [];

        // 1. Pickups
        for (const p of map.pickups) {
            if (p.collected) continue;
            const dx = p.x - player.x;
            const dy = p.y - player.y;
            spriteList.push({
                x: p.x,
                y: p.y,
                distSq: dx * dx + dy * dy,
                canvas: this.getPickupCanvas(p.type),
                scale: 0.65,
                yOffset: 0.35 // Rest on floor
            });
        }

        // 2. Enemies
        for (const e of enemies) {
            const dx = e.x - player.x;
            const dy = e.y - player.y;
            const canvas = e.getCurrentSprite();
            if (canvas) {
                let eScale = 0.95;
                if (e.type === 'brute') eScale = 1.35;
                else if (e.type === 'imp') eScale = 1.05;

                spriteList.push({
                    x: e.x,
                    y: e.y,
                    distSq: dx * dx + dy * dy,
                    canvas: canvas,
                    scale: eScale,
                    yOffset: e.isDead ? 0.4 : 0.0
                });
            }
        }

        // 3. Projectiles
        for (const proj of projectiles) {
            if (proj.isDead) continue;
            const dx = proj.x - player.x;
            const dy = proj.y - player.y;
            spriteList.push({
                x: proj.x,
                y: proj.y,
                distSq: dx * dx + dy * dy,
                canvas: assets.sprites.proj_fireball,
                scale: 0.5,
                yOffset: 0.0
            });
        }

        // 4. VFX Particles
        for (const part of this.vfx.particles) {
            const dx = part.x - player.x;
            const dy = part.y - player.y;
            spriteList.push({
                x: part.x,
                y: part.y,
                distSq: dx * dx + dy * dy,
                isParticle: true,
                particle: part,
                scale: 0.2,
                yOffset: 0.0
            });
        }

        // Sort sprites by distance (Farthest to Closest)
        spriteList.sort((a, b) => b.distSq - a.distSq);

        // Project and Render Sprites
        const invDet = 1.0 / (planeX * dirY - dirX * planeY);

        for (const sp of spriteList) {
            const spriteX = sp.x - player.x;
            const spriteY = sp.y - player.y;

            const transformX = invDet * (dirY * spriteX - dirX * spriteY);
            const transformY = invDet * (-planeY * spriteX + planeX * spriteY);

            // Only render if in front of player
            if (transformY <= 0.15) continue;

            const spriteScreenX = Math.floor((W / 2) * (1 + transformX / transformY));
            const spriteSize = Math.abs(Math.floor((H / transformY) * sp.scale));

            const vOffset = Math.floor((H / transformY) * (sp.yOffset || 0));
            const drawStartY = Math.max(0, Math.floor(-spriteSize / 2 + horizon + vOffset));
            const drawEndY = Math.min(H - 1, Math.floor(spriteSize / 2 + horizon + vOffset));
            const drawHeight = drawEndY - drawStartY + 1;

            if (drawHeight <= 0) continue;

            const drawStartX = Math.max(0, Math.floor(-spriteSize / 2 + spriteScreenX));
            const drawEndX = Math.min(W - 1, Math.floor(spriteSize / 2 + spriteScreenX));

            // Fog shading for sprite (Extended view distance)
            const fogDist = 68.0;
            const darkness = Math.min(0.9, Math.max(0, transformY / fogDist));

            if (sp.isParticle) {
                // Quick particle rendering
                const p = sp.particle;
                ctx.fillStyle = p.color;
                const pSize = Math.max(1, Math.floor(p.size * (H / transformY) * 0.03));
                if (spriteScreenX >= 0 && spriteScreenX < W && transformY < this.zBuffer[spriteScreenX]) {
                    ctx.fillRect(spriteScreenX - pSize / 2, horizon + vOffset - pSize / 2, pSize, pSize);
                }
                continue;
            }

            if (!sp.canvas) continue;

            const texW = sp.canvas.width;
            const texH = sp.canvas.height;

            // Draw Sprite Stripes with Z-Buffer Clipping
            for (let stripe = drawStartX; stripe <= drawEndX; stripe++) {
                if (stripe >= 0 && stripe < W && transformY < this.zBuffer[stripe]) {
                    const texX = Math.floor(((stripe - (-spriteSize / 2 + spriteScreenX)) * texW) / spriteSize);
                    if (texX >= 0 && texX < texW) {
                        ctx.drawImage(
                            sp.canvas,
                            texX, 0, 1, texH,
                            stripe, drawStartY, 1, drawHeight
                        );

                        // Sprite distance fog overlay
                        if (darkness > 0.05) {
                            ctx.fillStyle = `rgba(10, 5, 8, ${darkness * 0.75})`;
                            ctx.fillRect(stripe, drawStartY, 1, drawHeight);
                        }
                    }
                }
            }
        }
    }

    getPickupCanvas(type) {
        const s = window.assetManager.sprites;
        switch (type) {
            case 'health': return s.pickup_health;
            case 'mega_health': return s.pickup_mega;
            case 'ammo_shells':
            case 'ammo_bullets': return s.pickup_ammo;
            case 'ammo_plasma': return s.pickup_plasma;
            case 'armor': return s.pickup_armor;
            case 'supershotgun': return s.pickup_ssg;
            case 'plasma': return s.pickup_plasma;
            case 'key_blue': return s.pickup_key_blue;
            case 'key_red': return s.pickup_key_red;
            case 'barrel': return s.barrel;
            default: return s.pickup_health;
        }
    }

    renderWeapon(player, weaponManager) {
        const ctx = this.ctx;
        const W = this.width;
        const H = this.height;

        // Dynamic Gunfire Muzzle Illumination
        if (weaponManager.muzzleFlashActive) {
            ctx.fillStyle = (player.currentWeapon === 'plasma') ? 'rgba(0, 220, 255, 0.22)' : 'rgba(255, 180, 0, 0.25)';
            ctx.fillRect(0, 0, W, H);
        }

        const weaponCanvas = weaponManager.getRenderSprite(player);
        if (!weaponCanvas) return;

        const spriteW = weaponCanvas.width;
        const spriteH = weaponCanvas.height;

        // Classic Doom straight-centered viewmodel positioning
        const isKnife = player.currentWeapon === 'knife';
        const isAK47 = player.currentWeapon === 'ak47' || player.currentWeapon === 'shotgun';

        // Apply weapon sway, bobbing, mouse lag, and recoil kickback
        const walkSwayX = Math.sin(player.bobTimer * 0.5) * 2.8;
        const walkSwayY = Math.abs(player.bob) * 0.9;

        if (isKnife) {
            const scale = 0.60;
            const renderW = Math.floor(spriteW * scale);
            const renderH = Math.floor(spriteH * scale);
            const posX = Math.floor((W - renderW) / 2 + 25 + walkSwayX + (player.swayX || 0) + (player.recoilVisualX || 0));
            const posY = Math.floor(H - renderH + 8 + walkSwayY + (player.swayY || 0) + (player.pitch || 0) * 0.12 + (player.recoilVisualY || 0));
            ctx.drawImage(weaponCanvas, posX, posY, renderW, renderH);
        } else if (isAK47) {
            const scale = 0.72;
            const renderW = Math.floor(spriteW * scale);
            const renderH = Math.floor(spriteH * scale);
            // Straight and centered viewmodel aiming directly at the crosshair
            const posX = Math.floor((W - renderW) / 2 + walkSwayX + (player.swayX || 0) + (player.recoilVisualX || 0));
            const posY = Math.floor(H - renderH + 4 + walkSwayY + (player.swayY || 0) + (player.pitch || 0) * 0.12 + (player.recoilVisualY || 0));
            ctx.drawImage(weaponCanvas, posX, posY, renderW, renderH);
        } else {
            const scale = 0.58;
            const renderW = Math.floor(spriteW * scale);
            const renderH = Math.floor(spriteH * scale);
            // Straight and centered viewmodel aiming directly at the crosshair
            const posX = Math.floor((W - renderW) / 2 + walkSwayX + (player.swayX || 0) + (player.recoilVisualX || 0));
            const posY = Math.floor(H - renderH + 6 + walkSwayY + (player.swayY || 0) + (player.pitch || 0) * 0.12 + (player.recoilVisualY || 0));
            ctx.drawImage(weaponCanvas, posX, posY, renderW, renderH);
        }
    }

    renderOverlays(player) {
        const ctx = this.ctx;
        const W = this.width;
        const H = this.height;

        // 1. Damage Flash (Red vignette tint)
        if (player.damageFlash > 0.01) {
            ctx.fillStyle = `rgba(220, 0, 0, ${player.damageFlash * 0.55})`;
            ctx.fillRect(0, 0, W, H);
        }

        // 2. Pickup Flash (Golden / Emerald / Cyan tint)
        if (player.pickupFlash > 0.01) {
            let color = '255, 215, 0';
            if (player.pickupFlashColor === 'green') color = '0, 255, 100';
            if (player.pickupFlashColor === 'blue') color = '0, 150, 255';
            if (player.pickupFlashColor === 'cyan') color = '0, 230, 255';

            ctx.fillStyle = `rgba(${color}, ${player.pickupFlash * 0.3})`;
            ctx.fillRect(0, 0, W, H);
        }
    }
}

window.RaycastRenderer = RaycastRenderer;
