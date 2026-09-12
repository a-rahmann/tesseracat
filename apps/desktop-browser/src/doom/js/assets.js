/**
 * OFFLINE DOOM - Procedural Retro Asset Generator
 * 100% Offline, Zero external images or spritesheets.
 * Generates all textures, sprites, weapons, pickups, and particle frames in-memory.
 */
class AssetManager {
    constructor() {
        this.textures = {};
        this.sprites = {};
        this.weapons = {};
        this.ui = {};
        this.isLoaded = false;
        this.TEX_SIZE = 64;
    }

    init() {
        if (this.isLoaded) return;
        this.generateTextures();
        this.generateWeapons();
        this.generateEnemies();
        this.generatePickups();
        this.generateProjectilesAndVFX();
        this.generateHUDIcons();
        this.isLoaded = true;
    }

    // Helper: Create offscreen canvas
    createCanvas(width, height) {
        const c = document.createElement('canvas');
        c.width = width;
        c.height = height;
        const ctx = c.getContext('2d');
        ctx.imageSmoothingEnabled = false;
        return { canvas: c, ctx: ctx };
    }

    // Helper: Extract ImageData for high performance raycasting
    getImageData(canvas) {
        return canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height);
    }

    /* -------------------------------------------------------------
       1. WALL & ENVIRONMENT TEXTURES (64x64)
       ------------------------------------------------------------- */
    generateTextures() {
        const S = this.TEX_SIZE;

        // Texture 1: RUSTED_STEEL (Industrial metal plates with rivets)
        {
            const { canvas, ctx } = this.createCanvas(S, S);
            // Steel gradient
            const grad = ctx.createLinearGradient(0, 0, S, S);
            grad.addColorStop(0, '#4a4d52');
            grad.addColorStop(0.5, '#35383d');
            grad.addColorStop(1, '#222428');
            ctx.fillStyle = grad;
            ctx.fillRect(0, 0, S, S);

            // Metal plate borders & bevels
            ctx.fillStyle = '#636870';
            ctx.fillRect(0, 0, S, 2);
            ctx.fillRect(0, 0, 2, S);
            ctx.fillRect(0, 31, S, 2);
            ctx.fillStyle = '#151618';
            ctx.fillRect(0, S - 2, S, 2);
            ctx.fillRect(S - 2, 0, 2, S);
            ctx.fillRect(0, 33, S, 2);

            // Rust patches
            ctx.fillStyle = 'rgba(140, 60, 25, 0.45)';
            ctx.fillRect(4, 8, 18, 12);
            ctx.fillRect(36, 40, 22, 14);
            ctx.fillRect(10, 44, 12, 10);

            // Scratches & noise
            ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
            for (let i = 0; i < 40; i++) {
                const rx = Math.random() * (S - 4) + 2;
                const ry = Math.random() * (S - 4) + 2;
                ctx.fillRect(rx, ry, Math.random() * 6 + 1, 1);
            }

            // Rivets
            ctx.fillStyle = '#9aa0a6';
            const rivets = [[4, 4], [S - 6, 4], [4, 28], [S - 6, 28], [4, 36], [S - 6, 36], [4, S - 6], [S - 6, S - 6], [S / 2, 4], [S / 2, S - 6]];
            rivets.forEach(([rx, ry]) => {
                ctx.fillStyle = '#111';
                ctx.fillRect(rx + 1, ry + 1, 3, 3);
                ctx.fillStyle = '#9aa0a6';
                ctx.fillRect(rx, ry, 3, 3);
                ctx.fillStyle = '#fff';
                ctx.fillRect(rx, ry, 1, 1);
            });

            this.textures[1] = { canvas, data: this.getImageData(canvas) };
        }

        // Texture 2: DEMONIC_RUNE (Obsidian stone with glowing red runes)
        {
            const { canvas, ctx } = this.createCanvas(S, S);
            ctx.fillStyle = '#181215';
            ctx.fillRect(0, 0, S, S);

            // Stone brick pattern
            ctx.strokeStyle = '#0a0508';
            ctx.lineWidth = 2;
            for (let y = 0; y <= S; y += 16) {
                ctx.beginPath();
                ctx.moveTo(0, y);
                ctx.lineTo(S, y);
                ctx.stroke();

                const offset = (y % 32 === 0) ? 0 : 16;
                for (let x = offset; x <= S; x += 32) {
                    ctx.beginPath();
                    ctx.moveTo(x, y);
                    ctx.lineTo(x, y + 16);
                    ctx.stroke();
                }
            }

            // Stone noise
            for (let i = 0; i < 200; i++) {
                ctx.fillStyle = (Math.random() > 0.5) ? '#281d24' : '#140c11';
                ctx.fillRect(Math.random() * S, Math.random() * S, 2, 2);
            }

            // Glowing Demonic Rune in center
            ctx.shadowColor = '#ff1100';
            ctx.shadowBlur = 6;
            ctx.strokeStyle = '#ff3311';
            ctx.lineWidth = 2;

            // Pentagram / Demonic Sigil
            ctx.beginPath();
            ctx.arc(32, 32, 16, 0, Math.PI * 2);
            ctx.stroke();

            ctx.beginPath();
            ctx.moveTo(32, 18);
            ctx.lineTo(44, 42);
            ctx.lineTo(18, 27);
            ctx.lineTo(46, 27);
            ctx.lineTo(20, 42);
            ctx.closePath();
            ctx.stroke();
            ctx.shadowBlur = 0;

            this.textures[2] = { canvas, data: this.getImageData(canvas) };
        }

        // Texture 3: TECH_CONSOLE (Sci-fi computer terminals, displays, wires)
        {
            const { canvas, ctx } = this.createCanvas(S, S);
            ctx.fillStyle = '#1e242b';
            ctx.fillRect(0, 0, S, S);

            // Metal frame
            ctx.fillStyle = '#3a4450';
            ctx.fillRect(2, 2, S - 4, S - 4);
            ctx.fillStyle = '#0f141a';
            ctx.fillRect(6, 6, S - 12, S - 12);

            // Screen 1: Radar / Waveform monitor (Cyan)
            ctx.fillStyle = '#002228';
            ctx.fillRect(10, 10, 44, 20);
            ctx.strokeStyle = '#00ffcc';
            ctx.lineWidth = 1;
            ctx.strokeRect(10, 10, 44, 20);

            // Wave line
            ctx.beginPath();
            ctx.moveTo(12, 20);
            ctx.lineTo(20, 14);
            ctx.lineTo(26, 26);
            ctx.lineTo(34, 16);
            ctx.lineTo(42, 22);
            ctx.lineTo(50, 18);
            ctx.stroke();

            // Screen 2: System Status (Green & Red LEDs)
            ctx.fillStyle = '#0a1a0f';
            ctx.fillRect(10, 34, 44, 18);
            ctx.strokeStyle = '#00dd44';
            ctx.strokeRect(10, 34, 44, 18);

            // Progress / Status bars
            ctx.fillStyle = '#00ff66';
            ctx.fillRect(14, 38, 22, 4);
            ctx.fillStyle = '#ffaa00';
            ctx.fillRect(14, 44, 14, 4);

            // LED blinking lights
            const leds = ['#ff2222', '#22ff22', '#22aaff', '#ffff22'];
            leds.forEach((col, idx) => {
                ctx.fillStyle = col;
                ctx.fillRect(38 + (idx % 2) * 6, 38 + Math.floor(idx / 2) * 6, 4, 4);
            });

            this.textures[3] = { canvas, data: this.getImageData(canvas) };
        }

        // Texture 4: TOXIC_HAZARD (Diagonal hazard stripes & ventilation grill)
        {
            const { canvas, ctx } = this.createCanvas(S, S);
            ctx.fillStyle = '#222';
            ctx.fillRect(0, 0, S, S);

            // Diagonal Hazard Stripes (Yellow / Black) on top & bottom bands
            const drawStripes = (yStart, h) => {
                ctx.save();
                ctx.beginPath();
                ctx.rect(0, yStart, S, h);
                ctx.clip();
                ctx.fillStyle = '#d4aa00';
                ctx.fillRect(0, yStart, S, h);
                ctx.fillStyle = '#111';
                for (let x = -S; x < S * 2; x += 14) {
                    ctx.beginPath();
                    ctx.moveTo(x, yStart);
                    ctx.lineTo(x + 14, yStart + h);
                    ctx.lineTo(x + 7, yStart + h);
                    ctx.lineTo(x - 7, yStart);
                    ctx.fill();
                }
                ctx.restore();
            };

            drawStripes(0, 14);
            drawStripes(S - 14, 14);

            // Center Ventilation Grill with toxic green glow behind
            ctx.fillStyle = '#0b2611';
            ctx.fillRect(4, 16, S - 8, S - 32);

            ctx.fillStyle = '#00e64d';
            ctx.fillRect(8, 20, S - 16, S - 40);

            // Slits
            ctx.fillStyle = '#1a1f1c';
            for (let y = 20; y < S - 20; y += 5) {
                ctx.fillRect(6, y, S - 12, 3);
            }

            this.textures[4] = { canvas, data: this.getImageData(canvas) };
        }

        // Texture 5: INDUSTRIAL_BRICK (Dark reinforced masonry)
        {
            const { canvas, ctx } = this.createCanvas(S, S);
            ctx.fillStyle = '#3a2d2a';
            ctx.fillRect(0, 0, S, S);

            // Mortar lines
            ctx.strokeStyle = '#181210';
            ctx.lineWidth = 2;
            for (let y = 0; y <= S; y += 16) {
                ctx.beginPath();
                ctx.moveTo(0, y);
                ctx.lineTo(S, y);
                ctx.stroke();

                const shift = (y / 16) % 2 === 0 ? 0 : 16;
                for (let x = shift; x <= S; x += 32) {
                    ctx.beginPath();
                    ctx.moveTo(x, y);
                    ctx.lineTo(x, y + 16);
                    ctx.stroke();
                }
            }

            // Brick surface texture
            for (let i = 0; i < 300; i++) {
                const shade = Math.random() > 0.5 ? '#4e3b37' : '#2c2220';
                ctx.fillStyle = shade;
                ctx.fillRect(Math.random() * S, Math.random() * S, 2, 2);
            }

            this.textures[5] = { canvas, data: this.getImageData(canvas) };
        }

        // Texture 6: EXIT_DOOR (High-security airlock with EXIT sign)
        {
            const { canvas, ctx } = this.createCanvas(S, S);
            // Titanium Door
            ctx.fillStyle = '#2d333b';
            ctx.fillRect(0, 0, S, S);

            // Reinforced frame
            ctx.strokeStyle = '#e67300';
            ctx.lineWidth = 3;
            ctx.strokeRect(3, 3, S - 6, S - 6);

            // Exit Sign Box
            ctx.fillStyle = '#b30000';
            ctx.fillRect(10, 8, S - 20, 16);
            ctx.strokeStyle = '#ff3333';
            ctx.lineWidth = 1;
            ctx.strokeRect(10, 8, S - 20, 16);

            ctx.fillStyle = '#ffffff';
            ctx.font = 'bold 9px monospace';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('EXIT', S / 2, 16);

            // Door handle / Keycard scanner
            ctx.fillStyle = '#111';
            ctx.fillRect(S - 16, 28, 10, 18);
            ctx.fillStyle = '#00ff66';
            ctx.fillRect(S - 14, 32, 6, 4);

            // Warning stripes lower half
            for (let x = 8; x < S - 8; x += 10) {
                ctx.fillStyle = '#e6a100';
                ctx.fillRect(x, 48, 5, 10);
                ctx.fillStyle = '#222';
                ctx.fillRect(x + 5, 48, 5, 10);
            }

            this.textures[6] = { canvas, data: this.getImageData(canvas) };
        }

        // Texture 7: DEMON_FLESH_WALL (Organic biomechanical nightmare wall)
        {
            const { canvas, ctx } = this.createCanvas(S, S);
            ctx.fillStyle = '#420d12';
            ctx.fillRect(0, 0, S, S);

            // Veins & muscles
            ctx.strokeStyle = '#851b24';
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.moveTo(0, 10);
            ctx.bezierCurveTo(20, 40, 40, 0, 64, 30);
            ctx.stroke();

            ctx.beginPath();
            ctx.moveTo(10, 64);
            ctx.bezierCurveTo(30, 20, 50, 60, 64, 50);
            ctx.stroke();

            // Eye in center
            ctx.fillStyle = '#000';
            ctx.beginPath();
            ctx.ellipse(32, 32, 12, 8, 0, 0, Math.PI * 2);
            ctx.fill();

            ctx.fillStyle = '#ffaa00';
            ctx.beginPath();
            ctx.ellipse(32, 32, 8, 6, 0, 0, Math.PI * 2);
            ctx.fill();

            ctx.fillStyle = '#ff0000';
            ctx.fillRect(30, 28, 4, 8); // Slit pupil

            this.textures[7] = { canvas, data: this.getImageData(canvas) };
        }

        // Texture 8: BLUE_SECURITY_DOOR (High-tech ultra-visible security blast door)
        {
            const { canvas, ctx } = this.createCanvas(S, S);
            // Deep armored bulkhead
            ctx.fillStyle = '#0b1320';
            ctx.fillRect(0, 0, S, S);

            // Glowing neon electric blue outer frame
            ctx.strokeStyle = '#00aaff';
            ctx.lineWidth = 3;
            ctx.strokeRect(2, 2, S - 4, S - 4);
            ctx.strokeStyle = '#00ffff';
            ctx.lineWidth = 1;
            ctx.strokeRect(4, 4, S - 8, S - 8);

            // Horizontal security interlocking blast seams
            ctx.fillStyle = '#162238';
            ctx.fillRect(6, 6, S - 12, 10);
            ctx.fillRect(6, S - 16, S - 12, 10);

            // Vertical neon light pillars on sides
            ctx.fillStyle = '#00ffff';
            ctx.fillRect(5, 8, 3, S - 16);
            ctx.fillRect(S - 8, 8, 3, S - 16);

            // Central Blue Access Terminal
            ctx.fillStyle = '#02182b';
            ctx.fillRect(10, 18, S - 20, 28);
            ctx.strokeStyle = '#00d0ff';
            ctx.lineWidth = 1.5;
            ctx.strokeRect(10, 18, S - 20, 28);

            // Terminal Screen
            ctx.fillStyle = '#003865';
            ctx.fillRect(13, 21, S - 26, 12);
            ctx.fillStyle = '#00ffff';
            ctx.font = 'bold 7px monospace';
            ctx.textAlign = 'center';
            ctx.fillText('BLUE DOOR', S / 2, 30);

            // Keycard Slot Reader
            ctx.fillStyle = '#00aaff';
            ctx.fillRect(S / 2 - 10, 36, 20, 7);
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(S / 2 - 8, 38, 16, 2); // Yellow/white card insertion slot

            // Pulsing status LED
            ctx.fillStyle = '#00ffcc';
            ctx.beginPath();
            ctx.arc(S / 2, 45, 2.5, 0, Math.PI * 2);
            ctx.fill();

            this.textures[8] = { canvas, data: this.getImageData(canvas) };
        }

        // Texture 9: RED_SKULL_DOOR (Demonic locked gate)
        {
            const { canvas, ctx } = this.createCanvas(S, S);
            ctx.fillStyle = '#1c080b';
            ctx.fillRect(0, 0, S, S);

            // Glowing demonic red frame
            ctx.strokeStyle = '#ff2200';
            ctx.lineWidth = 3;
            ctx.strokeRect(2, 2, S - 4, S - 4);
            ctx.strokeStyle = '#ff6633';
            ctx.lineWidth = 1;
            ctx.strokeRect(4, 4, S - 8, S - 8);

            // Vertical molten red energy bars
            ctx.fillStyle = '#ff3300';
            ctx.fillRect(5, 8, 3, S - 16);
            ctx.fillRect(S - 8, 8, 3, S - 16);

            // Central Red Skull Emblem
            ctx.fillStyle = '#3a0f14';
            ctx.fillRect(10, 16, S - 20, 32);
            ctx.strokeStyle = '#ff3300';
            ctx.lineWidth = 1.5;
            ctx.strokeRect(10, 16, S - 20, 32);

            // White Bone Skull
            ctx.fillStyle = '#ede3d5';
            ctx.beginPath();
            ctx.arc(S / 2, 28, 9, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillRect(S / 2 - 5, 32, 10, 7);

            // Burning red eye sockets
            ctx.fillStyle = '#ff0000';
            ctx.fillRect(S / 2 - 5, 26, 3, 3);
            ctx.fillRect(S / 2 + 2, 26, 3, 3);

            // Teeth lines
            ctx.fillStyle = '#1a0507';
            ctx.fillRect(S / 2 - 3, 35, 1, 4);
            ctx.fillRect(S / 2 - 1, 35, 1, 4);
            ctx.fillRect(S / 2 + 1, 35, 1, 4);
            ctx.fillRect(S / 2 + 3, 35, 1, 4);

            ctx.fillStyle = '#ff5533';
            ctx.font = 'bold 7px monospace';
            ctx.textAlign = 'center';
            ctx.fillText('RED GATE', S / 2, 45);

            this.textures[9] = { canvas, data: this.getImageData(canvas) };
        }

        // Texture 10: DIRECTION_ARROW (Glowing Neon Green Navigational Chevron Arrows >>>)
        {
            const { canvas, ctx } = this.createCanvas(S, S);
            // Dark Carbon Steel Base
            ctx.fillStyle = '#1c2128';
            ctx.fillRect(0, 0, S, S);
            ctx.strokeStyle = '#2d333b';
            ctx.lineWidth = 2;
            ctx.strokeRect(1, 1, S - 2, S - 2);

            // Hazard warning stripes top and bottom
            for (let i = 0; i < S; i += 8) {
                ctx.fillStyle = '#e3b341';
                ctx.fillRect(i, 0, 4, 4);
                ctx.fillRect(i, S - 4, 4, 4);
                ctx.fillStyle = '#1c2128';
                ctx.fillRect(i + 4, 0, 4, 4);
                ctx.fillRect(i + 4, S - 4, 4, 4);
            }

            // Dark inner plate
            ctx.fillStyle = '#0d1117';
            ctx.fillRect(6, 10, S - 12, S - 20);
            ctx.strokeStyle = '#00ff88';
            ctx.lineWidth = 1;
            ctx.strokeRect(6, 10, S - 12, S - 20);

            // 3 Glowing Neon Green Chevrons >>>
            ctx.fillStyle = '#00ff88';
            ctx.shadowColor = '#00ff88';
            ctx.shadowBlur = 8;

            const drawChevron = (cx) => {
                ctx.beginPath();
                ctx.moveTo(cx - 5, 20);
                ctx.lineTo(cx + 2, 32);
                ctx.lineTo(cx - 5, 44);
                ctx.lineTo(cx, 44);
                ctx.lineTo(cx + 7, 32);
                ctx.lineTo(cx, 20);
                ctx.closePath();
                ctx.fill();
            };

            drawChevron(20);
            drawChevron(32);
            drawChevron(44);
            ctx.shadowBlur = 0;

            // Stenciled text
            ctx.fillStyle = '#00ff88';
            ctx.font = 'bold 6px monospace';
            ctx.textAlign = 'center';
            ctx.fillText('WAYPOINT', S / 2, 50);

            this.textures[10] = { canvas, data: this.getImageData(canvas) };
        }

        // Texture 11: EXIT_DESTINATION (Glowing Green Airlock Exit Guide Wall)
        {
            const { canvas, ctx } = this.createCanvas(S, S);
            ctx.fillStyle = '#16231a';
            ctx.fillRect(0, 0, S, S);
            ctx.strokeStyle = '#00ff66';
            ctx.lineWidth = 2;
            ctx.strokeRect(2, 2, S - 4, S - 4);

            // Glowing Exit Sign Box
            ctx.fillStyle = '#003311';
            ctx.fillRect(8, 12, S - 16, 22);
            ctx.strokeStyle = '#00ff66';
            ctx.strokeRect(8, 12, S - 16, 22);

            ctx.fillStyle = '#00ff66';
            ctx.shadowColor = '#00ff66';
            ctx.shadowBlur = 6;
            ctx.font = 'bold 9px monospace';
            ctx.textAlign = 'center';
            ctx.fillText('EXIT ▶▶', S / 2, 27);

            // Large Directional Arrow Below
            ctx.beginPath();
            ctx.moveTo(14, 44);
            ctx.lineTo(36, 44);
            ctx.lineTo(36, 40);
            ctx.lineTo(50, 48);
            ctx.lineTo(36, 56);
            ctx.lineTo(36, 52);
            ctx.lineTo(14, 52);
            ctx.closePath();
            ctx.fill();
            ctx.shadowBlur = 0;

            this.textures[11] = { canvas, data: this.getImageData(canvas) };
        }

        // Texture 12: SECRET_PUSHWALL (Concealed mechanical wall panel with subtle occult scratch)
        {
            const { canvas, ctx } = this.createCanvas(S, S);
            ctx.drawImage(this.textures[1].canvas, 0, 0);

            // Subtle concealed panel seam line
            ctx.strokeStyle = '#181b20';
            ctx.lineWidth = 1;
            ctx.strokeRect(4, 4, S - 8, S - 8);

            // Subtle occult glyph scratch in corner
            ctx.strokeStyle = 'rgba(255, 180, 0, 0.45)';
            ctx.beginPath();
            ctx.moveTo(10, 14); ctx.lineTo(14, 10);
            ctx.moveTo(14, 10); ctx.lineTo(18, 14);
            ctx.stroke();

            this.textures[12] = { canvas, data: this.getImageData(canvas) };
        }
    }

    /* -------------------------------------------------------------
       2. WEAPON SPRITES (Knife, AK-47, Super Shotgun, Plasma)
       ------------------------------------------------------------- */
    generateWeapons() {
        const W = 240;
        const H = 200;

        // 1. COMBAT KNIFE / FIST
        this.weapons.knife = {
            idle: this.createKnifeFrame(W, H, 'idle'),
            slash: this.createKnifeFrame(W, H, 'slash')
        };

        // 2. AK-47 ASSAULT RIFLE (7.62mm Kalashnikov - Straight Centered Viewmodel)
        const akW = 280;
        const akH = 240;
        this.weapons.ak47 = {
            idle: this.createAK47Frame(akW, akH, 'idle'),
            fire: this.createAK47Frame(akW, akH, 'fire'),
            recoil: this.createAK47Frame(akW, akH, 'recoil'),
            reload: this.createAK47Frame(akW, akH, 'reload')
        };
        this.weapons.shotgun = this.weapons.ak47; // Backward compatibility alias

        // 3. SUPER SHOTGUN (Double Barrel SSG)
        this.weapons.supershotgun = {
            idle: this.createSuperShotgunFrame(W, H, 'idle'),
            fire: this.createSuperShotgunFrame(W, H, 'fire'),
            recoil: this.createSuperShotgunFrame(W, H, 'recoil'),
            open: this.createSuperShotgunFrame(W, H, 'open'),
            reload: this.createSuperShotgunFrame(W, H, 'reload')
        };

        // 4. PLASMA CARBINE
        this.weapons.plasma = {
            idle: this.createPlasmaFrame(W, H, 'idle'),
            fire: this.createPlasmaFrame(W, H, 'fire'),
            recoil: this.createPlasmaFrame(W, H, 'recoil')
        };
    }

    createAK47Frame(W, H, state) {
        const { canvas, ctx } = this.createCanvas(W, H);
        const cx = Math.floor(W / 2);

        let yOffset = 0;
        let showFlash = false;
        let showEject = false;

        if (state === 'fire') {
            yOffset = 10;
            showFlash = true;
            showEject = true;
        } else if (state === 'recoil') {
            yOffset = 5;
        } else if (state === 'reload') {
            yOffset = 26;
        }

        const baseY = H - 24 + yOffset;

        // 1. GLOVED COMBAT HANDS (Doom Marine Olive Drab Gloves)
        // Left hand gripping lower wooden handguard from left
        ctx.fillStyle = '#4a5438';
        ctx.strokeStyle = '#23281b';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(cx - 75, H + 10);
        ctx.lineTo(cx - 36, baseY - 35);
        ctx.lineTo(cx - 18, baseY - 30);
        ctx.lineTo(cx - 38, H + 10);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // Left fingers curled around lower handguard
        for (let i = 0; i < 4; i++) {
            const fy = baseY - 50 + i * 8;
            ctx.fillStyle = '#3f472f';
            ctx.beginPath();
            ctx.ellipse(cx - 20, fy, 7, 4.5, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
            // Knuckle plate
            ctx.fillStyle = '#22281a';
            ctx.beginPath();
            ctx.ellipse(cx - 21, fy, 3.5, 2.5, 0, 0, Math.PI * 2);
            ctx.fill();
        }

        // Right hand on pistol grip / trigger from right
        ctx.fillStyle = '#4a5438';
        ctx.beginPath();
        ctx.moveTo(cx + 38, H + 10);
        ctx.lineTo(cx + 18, baseY - 15);
        ctx.lineTo(cx + 36, baseY - 20);
        ctx.lineTo(cx + 75, H + 10);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // Right thumb & knuckles
        ctx.fillStyle = '#3f472f';
        ctx.beginPath();
        ctx.ellipse(cx + 22, baseY - 18, 8, 6, 0.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        // 2. CURVED 30-ROUND BANANA MAGAZINE (Stamped Steel)
        ctx.fillStyle = '#181b20';
        ctx.strokeStyle = '#2f3642';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(cx - 14, baseY - 15);
        ctx.lineTo(cx + 12, baseY - 15);
        ctx.lineTo(cx + 16, baseY + 28);
        ctx.lineTo(cx - 18, baseY + 32);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // Magazine stamped horizontal strengthening ribs
        ctx.strokeStyle = '#3a4352';
        ctx.lineWidth = 1.5;
        for (let my = baseY - 8; my < baseY + 24; my += 7) {
            ctx.beginPath();
            ctx.moveTo(cx - 15, my);
            ctx.lineTo(cx + 13, my - 1);
            ctx.stroke();
        }

        // Magazine floorplate
        ctx.fillStyle = '#101216';
        ctx.fillRect(cx - 19, baseY + 28, 36, 4);

        // 3. RECEIVER (Stamped Steel Body)
        const recGrad = ctx.createLinearGradient(cx - 24, 0, cx + 24, 0);
        recGrad.addColorStop(0, '#1a1d24');
        recGrad.addColorStop(0.3, '#333b47');
        recGrad.addColorStop(0.7, '#333b47');
        recGrad.addColorStop(1, '#1a1d24');
        ctx.fillStyle = recGrad;
        ctx.strokeStyle = '#121418';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.rect(cx - 24, baseY - 58, 48, 46);
        ctx.fill();
        ctx.stroke();

        // Stamped Dust Cover (Curved Top Receiver)
        const dustGrad = ctx.createLinearGradient(cx - 20, 0, cx + 20, 0);
        dustGrad.addColorStop(0, '#242a34');
        dustGrad.addColorStop(0.5, '#4f5b6e');
        dustGrad.addColorStop(1, '#242a34');
        ctx.fillStyle = dustGrad;
        ctx.beginPath();
        ctx.roundRect(cx - 20, baseY - 70, 40, 14, [4, 4, 0, 0]);
        ctx.fill();
        ctx.stroke();

        // Dust cover longitudinal ribs
        ctx.strokeStyle = '#6f7e96';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(cx - 14, baseY - 68);
        ctx.lineTo(cx - 14, baseY - 57);
        ctx.moveTo(cx, baseY - 69);
        ctx.lineTo(cx, baseY - 57);
        ctx.moveTo(cx + 14, baseY - 68);
        ctx.lineTo(cx + 14, baseY - 57);
        ctx.stroke();

        // Receiver axis pins & rivets
        ctx.fillStyle = '#5c6778';
        ctx.beginPath();
        ctx.arc(cx - 16, baseY - 42, 2, 0, Math.PI * 2);
        ctx.arc(cx - 8, baseY - 32, 2, 0, Math.PI * 2);
        ctx.arc(cx + 10, baseY - 38, 2, 0, Math.PI * 2);
        ctx.fill();

        // Fire selector lever on right
        ctx.strokeStyle = '#4b5563';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(cx + 12, baseY - 40);
        ctx.lineTo(cx + 23, baseY - 35);
        ctx.stroke();

        // Charging Handle & Bolt on right
        ctx.fillStyle = (state === 'fire' || state === 'recoil') ? '#8c96a5' : '#c8d3e0';
        ctx.fillRect(cx + 19, baseY - 55, 9, 6);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(cx + 25, baseY - 54, 3, 4);

        // 4. TANGENT REAR SIGHT
        ctx.fillStyle = '#1c2026';
        ctx.strokeStyle = '#0e1014';
        ctx.lineWidth = 1.5;
        ctx.fillRect(cx - 9, baseY - 82, 18, 14);
        ctx.strokeRect(cx - 9, baseY - 82, 18, 14);

        // Sight leaf graduation markings
        ctx.strokeStyle = '#8d9bb0';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(cx - 7, baseY - 78);
        ctx.lineTo(cx - 3, baseY - 78);
        ctx.moveTo(cx + 3, baseY - 78);
        ctx.lineTo(cx + 7, baseY - 78);
        ctx.moveTo(cx - 7, baseY - 73);
        ctx.lineTo(cx - 3, baseY - 73);
        ctx.moveTo(cx + 3, baseY - 73);
        ctx.lineTo(cx + 7, baseY - 73);
        ctx.stroke();

        // Center U-notch in rear sight leaf
        ctx.fillStyle = '#0a0d10';
        ctx.fillRect(cx - 2, baseY - 83, 4, 3);

        // 5. RUSSIAN MAHOGANY LOWER HANDGUARD & UPPER GAS TUBE (Centered Straight)
        const woodGrad = ctx.createLinearGradient(cx - 18, 0, cx + 18, 0);
        woodGrad.addColorStop(0, '#581c06');
        woodGrad.addColorStop(0.3, '#8d2d0c');
        woodGrad.addColorStop(0.5, '#aa3810');
        woodGrad.addColorStop(0.7, '#8d2d0c');
        woodGrad.addColorStop(1, '#581c06');
        ctx.fillStyle = woodGrad;
        ctx.strokeStyle = '#320e03';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.roundRect(cx - 18, baseY - 120, 36, 40, [3, 3, 2, 2]);
        ctx.fill();
        ctx.stroke();

        // Woodgrain streaks
        ctx.strokeStyle = '#b84417';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(cx - 12, baseY - 116);
        ctx.lineTo(cx - 12, baseY - 84);
        ctx.moveTo(cx + 12, baseY - 116);
        ctx.lineTo(cx + 12, baseY - 84);
        ctx.stroke();
        ctx.strokeStyle = '#3d1204';
        ctx.beginPath();
        ctx.moveTo(cx - 5, baseY - 118);
        ctx.lineTo(cx - 5, baseY - 82);
        ctx.moveTo(cx + 5, baseY - 118);
        ctx.lineTo(cx + 5, baseY - 82);
        ctx.stroke();

        // Lower handguard side finger grooves
        ctx.fillStyle = '#441405';
        ctx.fillRect(cx - 16, baseY - 105, 5, 18);
        ctx.fillRect(cx + 11, baseY - 105, 5, 18);

        // Steel Retaining Ring Caps
        ctx.fillStyle = '#222830';
        ctx.strokeStyle = '#101318';
        ctx.lineWidth = 1;
        ctx.fillRect(cx - 19, baseY - 82, 38, 4);
        ctx.strokeRect(cx - 19, baseY - 82, 38, 4);
        ctx.fillRect(cx - 19, baseY - 122, 38, 4);
        ctx.strokeRect(cx - 19, baseY - 122, 38, 4);

        // Upper Handguard / Gas Tube Wood
        const gasTubeGrad = ctx.createLinearGradient(cx - 14, 0, cx + 14, 0);
        gasTubeGrad.addColorStop(0, '#662208');
        gasTubeGrad.addColorStop(0.5, '#9e3510');
        gasTubeGrad.addColorStop(1, '#662208');
        ctx.fillStyle = gasTubeGrad;
        ctx.fillRect(cx - 14, baseY - 120, 28, 36);

        // 6. GAS BLOCK & CYLINDER
        ctx.fillStyle = '#252b34';
        ctx.strokeStyle = '#12151a';
        ctx.lineWidth = 1.5;
        ctx.fillRect(cx - 11, baseY - 138, 22, 16);
        ctx.strokeRect(cx - 11, baseY - 138, 22, 16);

        // Gas relief vent holes
        ctx.fillStyle = '#0c0e12';
        ctx.beginPath();
        ctx.arc(cx - 6, baseY - 130, 1.5, 0, Math.PI * 2);
        ctx.arc(cx + 6, baseY - 130, 1.5, 0, Math.PI * 2);
        ctx.fill();

        // 7. CLEANING ROD (Under Barrel)
        ctx.fillStyle = '#5c6778';
        ctx.fillRect(cx - 1.5, baseY - 170, 3, 50);

        // 8. STEEL BARREL (Straight Up Cylindrical Finish)
        const bGrad = ctx.createLinearGradient(cx - 7, 0, cx + 7, 0);
        bGrad.addColorStop(0, '#191d24');
        bGrad.addColorStop(0.4, '#5f6c80');
        bGrad.addColorStop(0.6, '#8695ad');
        bGrad.addColorStop(1, '#191d24');
        ctx.fillStyle = bGrad;
        ctx.strokeStyle = '#101216';
        ctx.lineWidth = 1.5;
        ctx.fillRect(cx - 7, baseY - 175, 14, 40);
        ctx.strokeRect(cx - 7, baseY - 175, 14, 40);

        // 9. FRONT SIGHT TOWER & HOODED SIGHT POST (Precision Crosshair Iron Sight)
        ctx.fillStyle = '#20252e';
        ctx.fillRect(cx - 10, baseY - 168, 20, 10);

        // Hooded sight protective ears
        ctx.strokeStyle = '#637187';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(cx - 7, baseY - 172, 5, Math.PI * 0.7, Math.PI * 1.5);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(cx + 7, baseY - 172, 5, Math.PI * 1.5, Math.PI * 0.3);
        ctx.stroke();

        // Front Sight Center Post Pin (Aims directly down center crosshair)
        ctx.strokeStyle = '#181b22';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(cx, baseY - 166);
        ctx.lineTo(cx, baseY - 177);
        ctx.stroke();

        // White sight bead at top of post
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(cx, baseY - 177, 1.8, 0, Math.PI * 2);
        ctx.fill();

        // 10. SLANTED AK-47 MUZZLE COMPENSATOR
        ctx.fillStyle = '#1a1d23';
        ctx.strokeStyle = '#0e1014';
        ctx.lineWidth = 1.5;
        ctx.fillRect(cx - 6, baseY - 184, 12, 10);
        ctx.strokeRect(cx - 6, baseY - 184, 12, 10);

        // Dark bore opening at tip
        ctx.fillStyle = '#050608';
        ctx.beginPath();
        ctx.ellipse(cx, baseY - 184, 5, 2.5, 0, 0, Math.PI * 2);
        ctx.fill();

        // 11. EJECTED 7.62mm BRASS CASING (if fire)
        if (showEject) {
            ctx.save();
            ctx.translate(cx + 34, baseY - 65);
            ctx.rotate(0.5);
            ctx.fillStyle = '#ffd700';
            ctx.fillRect(-4, -10, 8, 20);
            ctx.fillStyle = '#b8860b';
            ctx.fillRect(-4, 7, 8, 3);
            ctx.fillStyle = '#fff488';
            ctx.fillRect(-2, -9, 4, 15);
            ctx.restore();
        }

        // 12. CENTERED STRAIGHT MUZZLE FLASH (if fire)
        if (showFlash) {
            ctx.save();
            ctx.translate(cx, baseY - 185);

            // Outer fiery starburst
            ctx.fillStyle = 'rgba(255, 120, 0, 0.95)';
            ctx.beginPath();
            ctx.moveTo(0, -68);
            ctx.lineTo(24, -28);
            ctx.lineTo(55, -2);
            ctx.lineTo(20, 6);
            ctx.lineTo(28, 24);
            ctx.lineTo(0, 4);
            ctx.lineTo(-28, 24);
            ctx.lineTo(-20, 6);
            ctx.lineTo(-55, -2);
            ctx.lineTo(-24, -28);
            ctx.closePath();
            ctx.fill();

            // Inner bright core
            ctx.fillStyle = '#ffee44';
            ctx.beginPath();
            ctx.moveTo(0, -48);
            ctx.lineTo(16, -18);
            ctx.lineTo(36, 0);
            ctx.lineTo(12, 4);
            ctx.lineTo(0, 2);
            ctx.lineTo(-12, 4);
            ctx.lineTo(-36, 0);
            ctx.lineTo(-16, -18);
            ctx.closePath();
            ctx.fill();

            // White-hot core bead
            ctx.fillStyle = '#ffffff';
            ctx.beginPath();
            ctx.ellipse(0, -8, 8, 14, 0, 0, Math.PI * 2);
            ctx.fill();

            ctx.restore();
        }

        return canvas;
    }

    createKnifeFrame(W, H, state) {
        const { canvas, ctx } = this.createCanvas(W, H);
        const cx = W / 2;
        const baseY = H - 20;

        if (state === 'slash') {
            // Slashing swipe
            ctx.save();
            ctx.translate(cx - 20, baseY - 40);
            ctx.rotate(-0.5);
            // Motion streak
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
            ctx.lineWidth = 12;
            ctx.beginPath();
            ctx.arc(0, 0, 90, -0.8, 0.8);
            ctx.stroke();

            // Blade
            ctx.fillStyle = '#ccd4e0';
            ctx.fillRect(10, -70, 16, 80);
            ctx.beginPath();
            ctx.moveTo(10, -70);
            ctx.lineTo(18, -90);
            ctx.lineTo(26, -70);
            ctx.fill();

            // Hand
            ctx.fillStyle = '#4a5438';
            ctx.fillRect(4, 0, 28, 40);
            ctx.restore();
        } else {
            // Idle Knife
            ctx.save();
            ctx.translate(cx + 30, baseY);
            // Steel Blade
            const bGrad = ctx.createLinearGradient(0, 0, 16, 0);
            bGrad.addColorStop(0, '#8590a0');
            bGrad.addColorStop(0.5, '#f0f4fa');
            bGrad.addColorStop(1, '#687280');
            ctx.fillStyle = bGrad;
            ctx.fillRect(-8, -100, 16, 80);

            // Blade Tip
            ctx.beginPath();
            ctx.moveTo(-8, -100);
            ctx.lineTo(0, -120);
            ctx.lineTo(8, -100);
            ctx.fill();

            // Crossguard & Hand
            ctx.fillStyle = '#1c2024';
            ctx.fillRect(-18, -20, 36, 10);
            ctx.fillStyle = '#4a5438';
            ctx.fillRect(-14, -10, 28, 45);
            ctx.restore();
        }
        return canvas;
    }

    createSuperShotgunFrame(W, H, state) {
        const { canvas, ctx } = this.createCanvas(W, H);
        const cx = W / 2;
        let yOffset = (state === 'fire') ? -24 : (state === 'recoil' ? 26 : 0);
        const baseY = H - 25 + yOffset;

        if (state === 'open' || state === 'reload') {
            // Break-Action Open View
            ctx.fillStyle = '#4a5438'; // Left Hand
            ctx.fillRect(cx - 55, baseY - 10, 30, 45);
            ctx.fillStyle = '#4a5438'; // Right Hand
            ctx.fillRect(cx + 25, baseY - 10, 30, 45);

            // Receiver
            ctx.fillStyle = '#1e2229';
            ctx.fillRect(cx - 36, baseY - 15, 72, 45);

            // Broken Open Barrels Angled Down
            ctx.fillStyle = '#111418';
            ctx.fillRect(cx - 30, baseY - 55, 26, 42);
            ctx.fillRect(cx + 4, baseY - 55, 26, 42);

            // Open Chambers with brass rims
            ctx.fillStyle = '#ffd700';
            ctx.beginPath();
            ctx.ellipse(cx - 17, baseY - 55, 11, 7, 0, 0, Math.PI * 2);
            ctx.ellipse(cx + 17, baseY - 55, 11, 7, 0, 0, Math.PI * 2);
            ctx.fill();

            if (state === 'open') {
                // Smoking shell casings ejecting
                ctx.fillStyle = '#ffd700';
                ctx.fillRect(cx - 38, baseY - 85, 12, 24);
                ctx.fillRect(cx + 26, baseY - 85, 12, 24);
            }
            return canvas;
        }

        // Gloved Hands
        ctx.fillStyle = '#4a5438';
        ctx.fillRect(cx - 50, baseY - 20, 28, 45);
        ctx.fillRect(cx + 22, baseY + 5, 34, 45);

        // Heavy Walnut Wooden Stock & Forend
        ctx.fillStyle = '#422416';
        ctx.fillRect(cx - 30, baseY - 35, 60, 45);
        ctx.fillStyle = '#5c331f';
        ctx.fillRect(cx - 26, baseY - 30, 52, 10);

        // Heavy Double-Barrel Blued Steel
        const bGrad1 = ctx.createLinearGradient(cx - 26, 0, cx - 2, 0);
        bGrad1.addColorStop(0, '#1c2026');
        bGrad1.addColorStop(0.4, '#7a8594');
        bGrad1.addColorStop(1, '#1c2026');
        ctx.fillStyle = bGrad1;
        ctx.fillRect(cx - 26, baseY - 105, 24, 80);

        const bGrad2 = ctx.createLinearGradient(cx + 2, 0, cx + 26, 0);
        bGrad2.addColorStop(0, '#1c2026');
        bGrad2.addColorStop(0.4, '#7a8594');
        bGrad2.addColorStop(1, '#1c2026');
        ctx.fillStyle = bGrad2;
        ctx.fillRect(cx + 2, baseY - 105, 24, 80);

        // Massive Twin Muzzle Openings
        ctx.fillStyle = '#06080a';
        ctx.beginPath();
        ctx.ellipse(cx - 14, baseY - 105, 10, 6, 0, 0, Math.PI * 2);
        ctx.ellipse(cx + 14, baseY - 105, 10, 6, 0, 0, Math.PI * 2);
        ctx.fill();

        // Giant Double Muzzle Flare on Fire
        if (state === 'fire') {
            ctx.save();
            ctx.translate(cx, baseY - 110);
            ctx.fillStyle = 'rgba(255, 90, 0, 0.95)';
            ctx.beginPath();
            ctx.arc(-14, -20, 45, 0, Math.PI * 2);
            ctx.arc(14, -20, 45, 0, Math.PI * 2);
            ctx.fill();

            ctx.fillStyle = '#fff4a3';
            ctx.beginPath();
            ctx.arc(-14, -15, 26, 0, Math.PI * 2);
            ctx.arc(14, -15, 26, 0, Math.PI * 2);
            ctx.fill();

            ctx.fillStyle = '#ffffff';
            ctx.beginPath();
            ctx.arc(-14, -10, 14, 0, Math.PI * 2);
            ctx.arc(14, -10, 14, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        }

        return canvas;
    }

    createShotgunFrame(W, H, state) {
        const { canvas, ctx } = this.createCanvas(W, H);
        const cx = W / 2;
        let yOffset = 0;
        let pumpOffset = 0;
        let showFlash = false;
        let showEject = false;

        if (state === 'fire') {
            yOffset = -18;
            showFlash = true;
        } else if (state === 'recoil') {
            yOffset = 22;
        } else if (state === 'pump_back') {
            yOffset = 10;
            pumpOffset = 18;
            showEject = true;
        } else if (state === 'pump_forward') {
            yOffset = 4;
            pumpOffset = 4;
        }

        const baseY = H - 30 + yOffset;

        // Gun Hands (Doom Marine Gloved Hands)
        ctx.fillStyle = '#4a5438'; // Olive combat glove
        // Left hand on pump
        ctx.fillRect(cx - 52, baseY - 35 + pumpOffset, 28, 45);
        ctx.fillStyle = '#2f3623';
        ctx.fillRect(cx - 50, baseY - 30 + pumpOffset, 24, 6);
        ctx.fillRect(cx - 50, baseY - 20 + pumpOffset, 24, 6);

        // Right hand on stock/grip
        ctx.fillStyle = '#4a5438';
        ctx.fillRect(cx + 24, baseY + 10, 36, 50);

        // Shotgun Body / Receiver (Heavy dark blued steel)
        ctx.fillStyle = '#23272d';
        ctx.fillRect(cx - 24, baseY - 30, 48, 70);

        // Double Barrels (Steel cylinders)
        // Barrel Left
        const bGrad1 = ctx.createLinearGradient(cx - 18, 0, cx - 4, 0);
        bGrad1.addColorStop(0, '#1c1f24');
        bGrad1.addColorStop(0.4, '#6b7482');
        bGrad1.addColorStop(1, '#1c1f24');
        ctx.fillStyle = bGrad1;
        ctx.fillRect(cx - 18, baseY - 110, 14, 90);

        // Barrel Right
        const bGrad2 = ctx.createLinearGradient(cx + 4, 0, cx + 18, 0);
        bGrad2.addColorStop(0, '#1c1f24');
        bGrad2.addColorStop(0.4, '#6b7482');
        bGrad2.addColorStop(1, '#1c1f24');
        ctx.fillStyle = bGrad2;
        ctx.fillRect(cx + 4, baseY - 110, 14, 90);

        // Rib rail on top of barrels
        ctx.fillStyle = '#3f454f';
        ctx.fillRect(cx - 3, baseY - 112, 6, 92);

        // Muzzle Openings
        ctx.fillStyle = '#050608';
        ctx.beginPath();
        ctx.ellipse(cx - 11, baseY - 110, 6, 4, 0, 0, Math.PI * 2);
        ctx.ellipse(cx + 11, baseY - 110, 6, 4, 0, 0, Math.PI * 2);
        ctx.fill();

        // Pump Forend (Ribbed grip)
        ctx.fillStyle = '#16181b';
        ctx.fillRect(cx - 26, baseY - 50 + pumpOffset, 52, 38);
        ctx.fillStyle = '#383e47';
        for (let py = baseY - 46 + pumpOffset; py < baseY - 16 + pumpOffset; py += 6) {
            ctx.fillRect(cx - 24, py, 48, 2);
        }

        // Brass Shell Ejection
        if (showEject) {
            ctx.fillStyle = '#ffd700';
            ctx.save();
            ctx.translate(cx + 34, baseY - 20);
            ctx.rotate(0.6);
            ctx.fillRect(-6, -14, 12, 28);
            ctx.fillStyle = '#b8860b';
            ctx.fillRect(-6, 10, 12, 4);
            ctx.restore();
        }

        // Muzzle Flash
        if (showFlash) {
            // Giant retro muzzle flare
            ctx.save();
            ctx.translate(cx, baseY - 116);

            // Outer flame
            ctx.fillStyle = 'rgba(255, 100, 0, 0.9)';
            ctx.beginPath();
            ctx.moveTo(0, -70);
            ctx.lineTo(45, -25);
            ctx.lineTo(80, 5);
            ctx.lineTo(25, -5);
            ctx.lineTo(35, 20);
            ctx.lineTo(0, 0);
            ctx.lineTo(-35, 20);
            ctx.lineTo(-25, -5);
            ctx.lineTo(-80, 5);
            ctx.lineTo(-45, -25);
            ctx.closePath();
            ctx.fill();

            // Inner bright core
            ctx.fillStyle = '#fff5aa';
            ctx.beginPath();
            ctx.moveTo(0, -45);
            ctx.lineTo(25, -15);
            ctx.lineTo(45, 0);
            ctx.lineTo(15, -5);
            ctx.lineTo(0, 0);
            ctx.lineTo(-15, -5);
            ctx.lineTo(-45, 0);
            ctx.lineTo(-25, -15);
            ctx.closePath();
            ctx.fill();

            ctx.fillStyle = '#ffffff';
            ctx.beginPath();
            ctx.arc(0, -10, 14, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        }

        return canvas;
    }

    createPlasmaFrame(W, H, state) {
        const { canvas, ctx } = this.createCanvas(W, H);
        const cx = W / 2;
        let yOffset = (state === 'fire') ? -12 : (state === 'recoil' ? 14 : 0);
        const baseY = H - 20 + yOffset;

        // Plasma Weapon Chassis (Cybernetic Gun)
        ctx.fillStyle = '#1c222b';
        ctx.fillRect(cx - 30, baseY - 40, 60, 65);

        // Gun Front Nozzle
        ctx.fillStyle = '#2c3747';
        ctx.fillRect(cx - 16, baseY - 100, 32, 65);

        // Glowing Blue Coils
        const pulse = state === 'fire' ? '#ffffff' : '#00ffff';
        ctx.fillStyle = pulse;
        ctx.shadowColor = '#00ccff';
        ctx.shadowBlur = 10;
        for (let cy = baseY - 88; cy < baseY - 45; cy += 12) {
            ctx.fillRect(cx - 12, cy, 24, 6);
        }
        ctx.shadowBlur = 0;

        // Gloves
        ctx.fillStyle = '#4a5438';
        ctx.fillRect(cx - 48, baseY - 10, 24, 40);
        ctx.fillRect(cx + 24, baseY - 10, 24, 40);

        // Plasma Muzzle Flash
        if (state === 'fire') {
            ctx.save();
            ctx.translate(cx, baseY - 105);
            ctx.fillStyle = 'rgba(0, 220, 255, 0.85)';
            ctx.beginPath();
            ctx.arc(0, 0, 35, 0, Math.PI * 2);
            ctx.fill();

            ctx.fillStyle = '#ffffff';
            ctx.beginPath();
            ctx.arc(0, 0, 18, 0, Math.PI * 2);
            ctx.fill();

            // Electric sparks
            ctx.strokeStyle = '#00ffff';
            ctx.lineWidth = 2;
            for (let a = 0; a < 6; a++) {
                const ang = Math.random() * Math.PI * 2;
                const len = 30 + Math.random() * 25;
                ctx.beginPath();
                ctx.moveTo(0, 0);
                ctx.lineTo(Math.cos(ang) * len, Math.sin(ang) * len);
                ctx.stroke();
            }
            ctx.restore();
        }

        return canvas;
    }

    /* -------------------------------------------------------------
       3. ENEMY SPRITES (Crawler Demon & Cyber Brute)
       ------------------------------------------------------------- */
    generateEnemies() {
        const S = 128;

        // 1. CRAWLER DEMON (Melee Fiend: Fast, crimson hide, sharp claws, gaping maw)
        this.sprites.crawler = {
            walk: [
                this.createCrawlerFrame(S, 'walk', 0),
                this.createCrawlerFrame(S, 'walk', 1),
                this.createCrawlerFrame(S, 'walk', 2),
                this.createCrawlerFrame(S, 'walk', 3)
            ],
            attack: [
                this.createCrawlerFrame(S, 'attack', 0),
                this.createCrawlerFrame(S, 'attack', 1)
            ],
            hurt: this.createCrawlerFrame(S, 'hurt', 0),
            die: [
                this.createCrawlerFrame(S, 'die', 0),
                this.createCrawlerFrame(S, 'die', 1),
                this.createCrawlerFrame(S, 'die', 2),
                this.createCrawlerFrame(S, 'die', 3)
            ]
        };

        // 2. HELL IMP (Classic Spiked Brown Demon: Fires blazing fireballs & claws)
        this.sprites.imp = {
            walk: [
                this.createImpFrame(S, 'walk', 0),
                this.createImpFrame(S, 'walk', 1),
                this.createImpFrame(S, 'walk', 2),
                this.createImpFrame(S, 'walk', 3)
            ],
            attack: [
                this.createImpFrame(S, 'attack', 0),
                this.createImpFrame(S, 'attack', 1)
            ],
            hurt: this.createImpFrame(S, 'hurt', 0),
            die: [
                this.createImpFrame(S, 'die', 0),
                this.createImpFrame(S, 'die', 1),
                this.createImpFrame(S, 'die', 2),
                this.createImpFrame(S, 'die', 3)
            ]
        };

        // 3. BRUTE CYBER-DEMON (Ranged Armored Behemoth: Massive horns, arm cannon)
        this.sprites.brute = {
            walk: [
                this.createBruteFrame(S, 'walk', 0),
                this.createBruteFrame(S, 'walk', 1),
                this.createBruteFrame(S, 'walk', 2),
                this.createBruteFrame(S, 'walk', 3)
            ],
            attack: [
                this.createBruteFrame(S, 'attack', 0),
                this.createBruteFrame(S, 'attack', 1),
                this.createBruteFrame(S, 'attack', 2)
            ],
            hurt: this.createBruteFrame(S, 'hurt', 0),
            die: [
                this.createBruteFrame(S, 'die', 0),
                this.createBruteFrame(S, 'die', 1),
                this.createBruteFrame(S, 'die', 2),
                this.createBruteFrame(S, 'die', 3),
                this.createBruteFrame(S, 'die', 4)
            ]
        };
    }

    createImpFrame(S, state, frameIdx) {
        const { canvas, ctx } = this.createCanvas(S, S);
        const cx = S / 2;
        const cy = S / 2 + 5;

        if (state === 'die') {
            const dY = cy + frameIdx * 7;
            ctx.fillStyle = '#4a2511';
            ctx.beginPath();
            ctx.ellipse(cx, dY, 22 + frameIdx * 5, 14 - frameIdx * 2, 0, 0, Math.PI * 2);
            ctx.fill();

            // Blood pool
            ctx.fillStyle = '#6b0000';
            ctx.beginPath();
            ctx.ellipse(cx, cy + 28, 26 + frameIdx * 6, 8, 0, 0, Math.PI * 2);
            ctx.fill();
            return canvas;
        }

        const legShift = (state === 'walk') ? Math.sin(frameIdx * Math.PI / 2) * 10 : 0;
        const isHurt = state === 'hurt';
        const isAttack = state === 'attack';

        const skin = isHurt ? '#8c4820' : '#5c3318';
        const skinShadow = isHurt ? '#613114' : '#3d200e';

        // Shadow
        ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
        ctx.beginPath();
        ctx.ellipse(cx, cy + 34, 24, 7, 0, 0, Math.PI * 2);
        ctx.fill();

        // Legs
        ctx.fillStyle = skinShadow;
        ctx.fillRect(cx - 18 + legShift, cy + 12, 10, 22);
        ctx.fillRect(cx + 8 - legShift, cy + 12, 10, 22);

        // Claws
        ctx.fillStyle = '#111';
        ctx.fillRect(cx - 20 + legShift, cy + 30, 12, 5);
        ctx.fillRect(cx + 8 - legShift, cy + 30, 12, 5);

        // Torso
        ctx.fillStyle = skin;
        ctx.beginPath();
        ctx.ellipse(cx, cy - 2, 16, 20, 0, 0, Math.PI * 2);
        ctx.fill();

        // White/Grey Spikes on shoulders & chest
        ctx.fillStyle = '#d1c7b8';
        ctx.beginPath();
        ctx.moveTo(cx - 16, cy - 14);
        ctx.lineTo(cx - 28, cy - 22);
        ctx.lineTo(cx - 12, cy - 8);
        ctx.fill();

        ctx.beginPath();
        ctx.moveTo(cx + 16, cy - 14);
        ctx.lineTo(cx + 28, cy - 22);
        ctx.lineTo(cx + 12, cy - 8);
        ctx.fill();

        // Imp Arms
        if (isAttack) {
            // Charging Fireball in Raised Hand
            ctx.fillStyle = skin;
            ctx.fillRect(cx - 24, cy - 22, 10, 24);
            ctx.fillRect(cx + 14, cy - 26, 10, 24);

            // Glowing Fireball in hand
            ctx.fillStyle = '#ffaa00';
            ctx.shadowColor = '#ff4400';
            ctx.shadowBlur = 10;
            ctx.beginPath();
            ctx.arc(cx + 20, cy - 30, 10, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#fff';
            ctx.beginPath();
            ctx.arc(cx + 20, cy - 30, 5, 0, Math.PI * 2);
            ctx.fill();
            ctx.shadowBlur = 0;
        } else {
            ctx.fillStyle = skin;
            ctx.fillRect(cx - 22, cy - 6, 8, 24);
            ctx.fillRect(cx + 14, cy - 6, 8, 24);
        }

        // Imp Head
        const headY = cy - 24;
        ctx.fillStyle = skin;
        ctx.beginPath();
        ctx.ellipse(cx, headY, 14, 12, 0, 0, Math.PI * 2);
        ctx.fill();

        // Head Spikes / Horns
        ctx.fillStyle = '#d1c7b8';
        ctx.beginPath();
        ctx.moveTo(cx - 8, headY - 8);
        ctx.lineTo(cx - 14, headY - 18);
        ctx.lineTo(cx - 4, headY - 10);
        ctx.fill();

        ctx.beginPath();
        ctx.moveTo(cx + 8, headY - 8);
        ctx.lineTo(cx + 14, headY - 18);
        ctx.lineTo(cx + 4, headY - 10);
        ctx.fill();

        // Glowing Red Imp Eyes
        ctx.fillStyle = '#ff0000';
        ctx.shadowColor = '#ff0000';
        ctx.shadowBlur = 6;
        ctx.fillRect(cx - 7, headY - 3, 4, 3);
        ctx.fillRect(cx + 3, headY - 3, 4, 3);
        ctx.shadowBlur = 0;

        // Snarl Mouth
        ctx.fillStyle = '#111';
        ctx.fillRect(cx - 5, headY + 5, 10, 3);
        ctx.fillStyle = '#fff';
        ctx.fillRect(cx - 4, headY + 4, 2, 2);
        ctx.fillRect(cx + 2, headY + 4, 2, 2);

        return canvas;
    }

    createCrawlerFrame(S, state, frameIdx) {
        const { canvas, ctx } = this.createCanvas(S, S);
        const cx = S / 2;
        const cy = S / 2 + 10;

        if (state === 'die') {
            // Death collapse into demonic gore
            const dY = cy + frameIdx * 8;
            const w = 40 + frameIdx * 14;
            const h = 40 - frameIdx * 6;

            ctx.fillStyle = '#5c0c14';
            ctx.beginPath();
            ctx.ellipse(cx, dY, w / 2, h / 2, 0, 0, Math.PI * 2);
            ctx.fill();

            // Ribs / Bone chunks
            ctx.fillStyle = '#d9d0c1';
            ctx.fillRect(cx - 10, dY - 4, 6, 8);
            ctx.fillRect(cx + 4, dY - 6, 8, 5);

            // Blood pool
            ctx.fillStyle = '#8a0a14';
            ctx.beginPath();
            ctx.ellipse(cx, cy + 30, w * 0.7, 8 + frameIdx * 2, 0, 0, Math.PI * 2);
            ctx.fill();

            return canvas;
        }

        const legShift = (state === 'walk') ? Math.sin(frameIdx * Math.PI / 2) * 12 : 0;
        const isHurt = state === 'hurt';
        const isAttack = state === 'attack';

        // Demon Skin Colors
        const skinMain = isHurt ? '#ff4d4d' : '#8c1622';
        const skinShadow = isHurt ? '#b31e1e' : '#4d0810';

        // Shadow under demon
        ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
        ctx.beginPath();
        ctx.ellipse(cx, cy + 35, 30, 8, 0, 0, Math.PI * 2);
        ctx.fill();

        // Hind Legs
        ctx.fillStyle = skinShadow;
        ctx.fillRect(cx - 28 + legShift, cy + 10, 10, 24);
        ctx.fillRect(cx + 18 - legShift, cy + 10, 10, 24);

        // Claws on feet
        ctx.fillStyle = '#111';
        ctx.fillRect(cx - 30 + legShift, cy + 30, 14, 6);
        ctx.fillRect(cx + 16 - legShift, cy + 30, 14, 6);

        // Muscular Demon Torso
        ctx.fillStyle = skinMain;
        ctx.beginPath();
        ctx.ellipse(cx, cy, 22, 26, 0, 0, Math.PI * 2);
        ctx.fill();

        // Spine Ridges / Back Spikes
        ctx.fillStyle = '#220306';
        for (let sy = cy - 20; sy < cy + 15; sy += 8) {
            ctx.beginPath();
            ctx.moveTo(cx - 4, sy);
            ctx.lineTo(cx, sy - 6);
            ctx.lineTo(cx + 4, sy);
            ctx.fill();
        }

        // Front Arms / Claws
        if (isAttack) {
            // Raised slashing claws
            const swing = frameIdx === 1 ? 16 : -8;
            ctx.fillStyle = skinMain;
            ctx.fillRect(cx - 36, cy - 20 + swing, 12, 28);
            ctx.fillRect(cx + 24, cy - 28 - swing, 12, 28);

            // Razor Talon Tips
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(cx - 38, cy - 24 + swing, 16, 6);
            ctx.fillRect(cx + 22, cy - 32 - swing, 16, 6);
        } else {
            // Resting forward claws
            ctx.fillStyle = skinMain;
            ctx.fillRect(cx - 26, cy - 5, 10, 28);
            ctx.fillRect(cx + 16, cy - 5, 10, 28);
            ctx.fillStyle = '#111';
            ctx.fillRect(cx - 28, cy + 20, 14, 5);
            ctx.fillRect(cx + 14, cy + 20, 14, 5);
        }

        // Demonic Head
        const headY = cy - 26 + (isAttack ? 6 : 0);
        ctx.fillStyle = skinMain;
        ctx.beginPath();
        ctx.ellipse(cx, headY, 18, 14, 0, 0, Math.PI * 2);
        ctx.fill();

        // Horns
        ctx.fillStyle = '#111';
        ctx.beginPath();
        ctx.moveTo(cx - 14, headY);
        ctx.lineTo(cx - 26, headY - 16);
        ctx.lineTo(cx - 8, headY - 8);
        ctx.fill();

        ctx.beginPath();
        ctx.moveTo(cx + 14, headY);
        ctx.lineTo(cx + 26, headY - 16);
        ctx.lineTo(cx + 8, headY - 8);
        ctx.fill();

        // Glowing Yellow Demon Eyes
        ctx.fillStyle = '#ffff00';
        ctx.shadowColor = '#ffff00';
        ctx.shadowBlur = 4;
        ctx.fillRect(cx - 10, headY - 4, 6, 4);
        ctx.fillRect(cx + 4, headY - 4, 6, 4);
        ctx.fillStyle = '#ff0000';
        ctx.fillRect(cx - 8, headY - 3, 2, 2);
        ctx.fillRect(cx + 6, headY - 3, 2, 2);
        ctx.shadowBlur = 0;

        // Gaping Maw with Sharp Fangs
        ctx.fillStyle = '#1a0003';
        ctx.beginPath();
        ctx.ellipse(cx, headY + 6, 10, 6, 0, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#fff';
        // Top teeth
        ctx.fillRect(cx - 8, headY + 3, 3, 3);
        ctx.fillRect(cx - 2, headY + 3, 4, 4);
        ctx.fillRect(cx + 5, headY + 3, 3, 3);
        // Bottom teeth
        ctx.fillRect(cx - 5, headY + 7, 3, 3);
        ctx.fillRect(cx + 2, headY + 7, 3, 3);

        return canvas;
    }

    createBruteFrame(S, state, frameIdx) {
        const { canvas, ctx } = this.createCanvas(S, S);
        const cx = S / 2;
        const cy = S / 2;

        if (state === 'die') {
            // Massive death explosion & cybernetic debris
            const dY = cy + frameIdx * 6;
            ctx.fillStyle = 'rgba(255, 60, 0, 0.8)';
            ctx.beginPath();
            ctx.arc(cx, dY, 20 + frameIdx * 8, 0, Math.PI * 2);
            ctx.fill();

            // Smoke & Metal Scraps
            ctx.fillStyle = '#222';
            ctx.fillRect(cx - 20 - frameIdx * 5, dY - 10, 16, 16);
            ctx.fillRect(cx + 10 + frameIdx * 6, dY - 15, 14, 18);
            ctx.fillStyle = '#ffaa00';
            ctx.fillRect(cx - 6, dY - 6, 12, 12);

            return canvas;
        }

        const stomp = (state === 'walk') ? Math.sin(frameIdx * Math.PI / 2) * 8 : 0;
        const isHurt = state === 'hurt';
        const isAttack = state === 'attack';

        // Cybernetic Chassis colors
        const armorBase = isHurt ? '#993333' : '#3d444d';
        const armorPlate = isHurt ? '#cc4444' : '#596370';

        // Shadow
        ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
        ctx.beginPath();
        ctx.ellipse(cx, cy + 45, 42, 12, 0, 0, Math.PI * 2);
        ctx.fill();

        // Massive Armored Legs
        ctx.fillStyle = armorBase;
        ctx.fillRect(cx - 36, cy + 14 + stomp, 24, 32);
        ctx.fillRect(cx + 12, cy + 14 - stomp, 24, 32);

        // Steel Boots
        ctx.fillStyle = '#1c2024';
        ctx.fillRect(cx - 40, cy + 40 + stomp, 30, 12);
        ctx.fillRect(cx + 10, cy + 40 - stomp, 30, 12);

        // Heavy Torso
        ctx.fillStyle = armorBase;
        ctx.fillRect(cx - 32, cy - 24, 64, 46);
        ctx.fillStyle = armorPlate;
        ctx.fillRect(cx - 26, cy - 20, 52, 38);

        // Glowing Demon Core / Cyber Reactor
        ctx.fillStyle = '#ff2200';
        ctx.shadowColor = '#ff3300';
        ctx.shadowBlur = 8;
        ctx.beginPath();
        ctx.arc(cx, cy - 4, 10, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#ffff66';
        ctx.fillRect(cx - 4, cy - 8, 8, 8);
        ctx.shadowBlur = 0;

        // Massive Cybernetic Arm Cannon (Right side)
        ctx.fillStyle = '#1c2024';
        ctx.fillRect(cx + 28, cy - 22, 22, 44);
        ctx.fillStyle = '#444d57';
        ctx.fillRect(cx + 30, cy - 35, 18, 20);

        // Cannon Muzzle
        ctx.fillStyle = '#0a0d10';
        ctx.fillRect(cx + 32, cy - 45, 14, 12);

        // Charging / Firing Fireball in Attack Mode
        if (isAttack) {
            const chargeRadius = 6 + frameIdx * 6;
            ctx.fillStyle = '#ff6600';
            ctx.shadowColor = '#ff9900';
            ctx.shadowBlur = 12;
            ctx.beginPath();
            ctx.arc(cx + 39, cy - 46, chargeRadius, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#ffffff';
            ctx.beginPath();
            ctx.arc(cx + 39, cy - 46, chargeRadius * 0.5, 0, Math.PI * 2);
            ctx.fill();
            ctx.shadowBlur = 0;
        }

        // Demonic Arm with Claws (Left side)
        ctx.fillStyle = '#801824';
        ctx.fillRect(cx - 44, cy - 18, 16, 38);
        ctx.fillStyle = '#111';
        ctx.fillRect(cx - 46, cy + 18, 20, 8);

        // Cyber Demon Head & Skull
        ctx.fillStyle = '#262c33';
        ctx.beginPath();
        ctx.ellipse(cx, cy - 34, 18, 16, 0, 0, Math.PI * 2);
        ctx.fill();

        // Giant Curved Cybernetic Horns
        ctx.fillStyle = '#8a939e';
        ctx.beginPath();
        ctx.moveTo(cx - 14, cy - 38);
        ctx.lineTo(cx - 34, cy - 54);
        ctx.lineTo(cx - 26, cy - 34);
        ctx.fill();

        ctx.beginPath();
        ctx.moveTo(cx + 14, cy - 38);
        ctx.lineTo(cx + 34, cy - 54);
        ctx.lineTo(cx + 26, cy - 34);
        ctx.fill();

        // Visor / Red Optical Sensors
        ctx.fillStyle = '#ff0000';
        ctx.shadowColor = '#ff0000';
        ctx.shadowBlur = 6;
        ctx.fillRect(cx - 10, cy - 38, 20, 6);
        ctx.shadowBlur = 0;

        return canvas;
    }

    /* -------------------------------------------------------------
       4. PICKUP SPRITES (Medkit, Armor, Ammo, Key)
       ------------------------------------------------------------- */
    generatePickups() {
        const S = 64;

        // 1. HEALTH PACK (+25 HP)
        {
            const { canvas, ctx } = this.createCanvas(S, S);
            ctx.fillStyle = 'rgba(0,0,0,0.3)';
            ctx.beginPath();
            ctx.ellipse(32, 54, 20, 6, 0, 0, Math.PI * 2);
            ctx.fill();

            // White Med Box
            ctx.fillStyle = '#e6e6e6';
            ctx.fillRect(14, 22, 36, 26);
            ctx.fillStyle = '#a6a6a6';
            ctx.fillRect(14, 44, 36, 4);

            // Red Cross
            ctx.fillStyle = '#dd1111';
            ctx.fillRect(28, 26, 8, 18);
            ctx.fillRect(23, 31, 18, 8);

            this.sprites.pickup_health = canvas;
        }

        // 2. MEGA HEALTH SPHERE (+100 HP)
        {
            const { canvas, ctx } = this.createCanvas(S, S);
            ctx.fillStyle = 'rgba(0,0,0,0.3)';
            ctx.beginPath();
            ctx.ellipse(32, 54, 22, 6, 0, 0, Math.PI * 2);
            ctx.fill();

            // Glowing Golden Pedestal
            ctx.fillStyle = '#b38600';
            ctx.fillRect(22, 44, 20, 8);

            // Glowing Demonic Red Sphere
            const rad = ctx.createRadialGradient(30, 24, 2, 32, 28, 18);
            rad.addColorStop(0, '#ffffff');
            rad.addColorStop(0.3, '#ff4422');
            rad.addColorStop(0.8, '#990000');
            rad.addColorStop(1, '#330000');

            ctx.fillStyle = rad;
            ctx.shadowColor = '#ff2200';
            ctx.shadowBlur = 10;
            ctx.beginPath();
            ctx.arc(32, 28, 18, 0, Math.PI * 2);
            ctx.fill();
            ctx.shadowBlur = 0;

            this.sprites.pickup_mega = canvas;
        }

        // 3. AMMO BOX (Shotgun Shells +12)
        {
            const { canvas, ctx } = this.createCanvas(S, S);
            ctx.fillStyle = 'rgba(0,0,0,0.3)';
            ctx.beginPath();
            ctx.ellipse(32, 52, 20, 6, 0, 0, Math.PI * 2);
            ctx.fill();

            // Military Green AK-47 7.62mm Ammo Crate
            ctx.fillStyle = '#3a4a35';
            ctx.fillRect(12, 22, 40, 26);
            ctx.fillStyle = '#263321';
            ctx.fillRect(12, 44, 40, 4);

            // Brass Latches
            ctx.fillStyle = '#d4af37';
            ctx.fillRect(16, 28, 4, 10);
            ctx.fillRect(44, 28, 4, 10);

            // Gold 7.62 Rifle Cartridges on box
            ctx.fillStyle = '#ffd700';
            ctx.fillRect(24, 26, 4, 14);
            ctx.fillRect(30, 26, 4, 14);
            ctx.fillRect(36, 26, 4, 14);
            // Copper tips
            ctx.fillStyle = '#cc6633';
            ctx.fillRect(24, 24, 4, 3);
            ctx.fillRect(30, 24, 4, 3);
            ctx.fillRect(36, 24, 4, 3);

            this.sprites.pickup_ammo = canvas;
        }

        // 4. PLASMA BATTERY (+30 Cells)
        {
            const { canvas, ctx } = this.createCanvas(S, S);
            ctx.fillStyle = 'rgba(0,0,0,0.3)';
            ctx.beginPath();
            ctx.ellipse(32, 52, 18, 6, 0, 0, Math.PI * 2);
            ctx.fill();

            // Cyan Energy Cell
            ctx.fillStyle = '#1c2e3d';
            ctx.fillRect(18, 18, 28, 32);

            // Glowing Core
            ctx.fillStyle = '#00ffff';
            ctx.shadowColor = '#00ffff';
            ctx.shadowBlur = 8;
            ctx.fillRect(22, 22, 20, 24);
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(26, 24, 12, 20);
            ctx.shadowBlur = 0;

            this.sprites.pickup_plasma = canvas;
        }

        // 5. COMBAT ARMOR VEST (+50 Armor)
        {
            const { canvas, ctx } = this.createCanvas(S, S);
            ctx.fillStyle = 'rgba(0,0,0,0.3)';
            ctx.beginPath();
            ctx.ellipse(32, 54, 22, 6, 0, 0, Math.PI * 2);
            ctx.fill();

            // Blue Kevlar Body Armor
            ctx.fillStyle = '#1b3b6f';
            ctx.beginPath();
            ctx.moveTo(20, 18);
            ctx.lineTo(44, 18);
            ctx.lineTo(50, 46);
            ctx.lineTo(14, 46);
            ctx.closePath();
            ctx.fill();

            // Armor plates
            ctx.fillStyle = '#2d5ba3';
            ctx.fillRect(22, 24, 20, 18);

            // Shoulder Straps
            ctx.fillStyle = '#112240';
            ctx.fillRect(18, 16, 6, 12);
            ctx.fillRect(40, 16, 6, 12);

            this.sprites.pickup_armor = canvas;
        }

        // 6. SUPER SHOTGUN PICKUP (Double Barrel SSG)
        {
            const { canvas, ctx } = this.createCanvas(S, S);
            ctx.fillStyle = 'rgba(0,0,0,0.3)';
            ctx.beginPath();
            ctx.ellipse(32, 54, 24, 6, 0, 0, Math.PI * 2);
            ctx.fill();

            // Double Barrel Shotgun laying flat
            ctx.fillStyle = '#422416';
            ctx.fillRect(10, 26, 16, 12);
            ctx.fillStyle = '#6b7482';
            ctx.fillRect(26, 28, 30, 8);
            ctx.fillStyle = '#1c2026';
            ctx.fillRect(26, 31, 30, 2);
            this.sprites.pickup_ssg = canvas;
        }

        // 7. BLUE SECURITY KEYCARD
        {
            const { canvas, ctx } = this.createCanvas(S, S);
            ctx.fillStyle = 'rgba(0,0,0,0.3)';
            ctx.beginPath();
            ctx.ellipse(32, 52, 14, 5, 0, 0, Math.PI * 2);
            ctx.fill();

            // Glowing Blue Keycard
            ctx.fillStyle = '#0055ff';
            ctx.shadowColor = '#00ffff';
            ctx.shadowBlur = 8;
            ctx.fillRect(20, 22, 24, 18);
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(24, 25, 6, 12);
            ctx.fillStyle = '#ffd700';
            ctx.fillRect(32, 26, 8, 4);
            ctx.shadowBlur = 0;
            this.sprites.pickup_key_blue = canvas;
        }

        // 8. RED SKULL KEY
        {
            const { canvas, ctx } = this.createCanvas(S, S);
            ctx.fillStyle = 'rgba(0,0,0,0.3)';
            ctx.beginPath();
            ctx.ellipse(32, 52, 14, 5, 0, 0, Math.PI * 2);
            ctx.fill();

            // Demonic Skull Key
            ctx.fillStyle = '#d4c5b8';
            ctx.beginPath();
            ctx.arc(32, 26, 9, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillRect(28, 32, 8, 12);
            ctx.fillStyle = '#ff0000';
            ctx.shadowColor = '#ff0000';
            ctx.shadowBlur = 8;
            ctx.fillRect(28, 24, 3, 3);
            ctx.fillRect(33, 24, 3, 3);
            ctx.shadowBlur = 0;
            this.sprites.pickup_key_red = canvas;
        }

        // 9. EXPLOSIVE HAZARD BARREL
        {
            const { canvas, ctx } = this.createCanvas(S, S);
            ctx.fillStyle = 'rgba(0,0,0,0.4)';
            ctx.beginPath();
            ctx.ellipse(32, 58, 20, 6, 0, 0, Math.PI * 2);
            ctx.fill();

            // Steel Nuclear Drum (Industrial green/grey)
            ctx.fillStyle = '#3a4a35';
            ctx.fillRect(16, 16, 32, 42);
            ctx.fillStyle = '#263323';
            ctx.fillRect(16, 16, 32, 6);
            ctx.fillRect(16, 32, 32, 4);
            ctx.fillRect(16, 52, 32, 6);

            // Radioactive Yellow/Black Triangles
            ctx.fillStyle = '#ffcc00';
            ctx.beginPath();
            ctx.arc(32, 26, 7, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#111';
            ctx.beginPath();
            ctx.arc(32, 26, 3, 0, Math.PI * 2);
            ctx.fill();

            // Dripping Neon Slime
            ctx.fillStyle = '#00ff33';
            ctx.shadowColor = '#00ff33';
            ctx.shadowBlur = 6;
            ctx.fillRect(20, 14, 24, 4);
            ctx.fillRect(24, 18, 4, 12);
            ctx.fillRect(36, 18, 5, 8);
            ctx.shadowBlur = 0;
            this.sprites.barrel = canvas;
        }
    }

    /* -------------------------------------------------------------
       5. PROJECTILES & PARTICLES
       ------------------------------------------------------------- */
    generateProjectilesAndVFX() {
        const S = 32;

        // 1. DEMON FIREBALL PROJECTILE
        {
            const { canvas, ctx } = this.createCanvas(S, S);
            const rad = ctx.createRadialGradient(16, 16, 2, 16, 16, 14);
            rad.addColorStop(0, '#ffffff');
            rad.addColorStop(0.3, '#ffcc00');
            rad.addColorStop(0.7, '#ff3300');
            rad.addColorStop(1, 'rgba(180, 0, 0, 0)');

            ctx.fillStyle = rad;
            ctx.beginPath();
            ctx.arc(16, 16, 14, 0, Math.PI * 2);
            ctx.fill();

            this.sprites.proj_fireball = canvas;
        }

        // 2. PLASMA BOLT PROJECTILE
        {
            const { canvas, ctx } = this.createCanvas(S, S);
            const rad = ctx.createRadialGradient(16, 16, 2, 16, 16, 14);
            rad.addColorStop(0, '#ffffff');
            rad.addColorStop(0.4, '#00ffff');
            rad.addColorStop(0.8, '#0066ff');
            rad.addColorStop(1, 'rgba(0, 50, 200, 0)');

            ctx.fillStyle = rad;
            ctx.beginPath();
            ctx.arc(16, 16, 14, 0, Math.PI * 2);
            ctx.fill();

            this.sprites.proj_plasma = canvas;
        }
    }

    /* -------------------------------------------------------------
       6. HUD ICONS & STATUS FACES
       ------------------------------------------------------------- */
    generateHUDIcons() {
        const S = 48;

        // DOOM MARINE STATUS AVATAR (Healthy, Hurt, Critical, God Mode/Grin)
        this.ui.faces = {
            healthy: this.createMarineFace(S, 'healthy'),
            hurt: this.createMarineFace(S, 'hurt'),
            critical: this.createMarineFace(S, 'critical'),
            grin: this.createMarineFace(S, 'grin'),
            dead: this.createMarineFace(S, 'dead')
        };
    }

    createMarineFace(S, mood) {
        const { canvas, ctx } = this.createCanvas(S, S);
        const cx = S / 2;
        const cy = S / 2;

        // Background box
        ctx.fillStyle = '#1c2024';
        ctx.fillRect(2, 2, S - 4, S - 4);
        ctx.strokeStyle = '#4a5361';
        ctx.strokeRect(2, 2, S - 4, S - 4);

        if (mood === 'dead') {
            // Dead / Skull face
            ctx.fillStyle = '#8a0a14';
            ctx.fillRect(8, 8, S - 16, S - 16);
            ctx.fillStyle = '#fff';
            ctx.font = 'bold 16px monospace';
            ctx.textAlign = 'center';
            ctx.fillText('X_X', cx, cy + 6);
            return canvas;
        }

        // Marine Face (Square jaw, brown crew cut)
        // Hair
        ctx.fillStyle = '#4a3319';
        ctx.fillRect(10, 6, 28, 10);

        // Skin Tone
        const skin = (mood === 'critical') ? '#d9988b' : '#e0a98b';
        ctx.fillStyle = skin;
        ctx.fillRect(12, 12, 24, 26);

        // Eyes (Pupils look around)
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(16, 18, 6, 4);
        ctx.fillRect(26, 18, 6, 4);

        ctx.fillStyle = '#1c3d5a'; // Blue eyes
        const eyeOffset = mood === 'grin' ? 2 : (mood === 'critical' ? 0 : 1);
        ctx.fillRect(17 + eyeOffset, 19, 3, 3);
        ctx.fillRect(27 + eyeOffset, 19, 3, 3);

        // Nose
        ctx.fillStyle = '#b8775e';
        ctx.fillRect(23, 24, 3, 6);

        // Mouth
        if (mood === 'grin') {
            ctx.fillStyle = '#fff';
            ctx.fillRect(18, 32, 12, 4); // Grin teeth
            ctx.strokeStyle = '#5a1919';
            ctx.strokeRect(18, 32, 12, 4);
        } else if (mood === 'critical') {
            ctx.fillStyle = '#5a1919';
            ctx.fillRect(18, 32, 12, 5); // Grimace
            // Blood dripping on face
            ctx.fillStyle = '#b30000';
            ctx.fillRect(14, 14, 3, 12);
            ctx.fillRect(28, 22, 4, 14);
        } else if (mood === 'hurt') {
            ctx.fillStyle = '#5a1919';
            ctx.fillRect(18, 33, 12, 3);
            ctx.fillStyle = '#b30000';
            ctx.fillRect(14, 18, 3, 8);
        } else {
            ctx.fillStyle = '#331111';
            ctx.fillRect(19, 33, 10, 2); // Stern line
        }

        return canvas;
    }
}

window.assetManager = new AssetManager();
