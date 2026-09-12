# OFFLINE DOOM // AGENTIC BROWSER OFFLINE FPS

A 100% offline, retro 1990s DOOM-inspired first-person shooter built entirely in vanilla HTML5, CSS3, JavaScript, HTML5 Canvas, and the Web Audio API. 

Designed specifically as an integrated offline/no-internet fallback game for the **Agentic Browser** project.

---

## 🛡️ 100% Offline & Zero Network Guarantee

This game contains **ZERO network dependencies**:
* ❌ No CDN libraries (No jQuery, No Three.js, No React, No external physics engines)
* ❌ No Google Fonts (Uses pure system/pixel monospace font stack)
* ❌ No Remote image assets or sprites (All textures, sprites, animations, and weapon graphics are procedurally generated in-memory via Canvas)
* ❌ No Remote audio files (All sound effects and ambient soundtrack are procedurally synthesized in real-time via the Web Audio API)
* ❌ No Backend servers or API calls
* ❌ No `fetch()`, `XMLHttpRequest`, or `WebSocket` connections during gameplay

The game runs even with Wi-Fi disabled, Ethernet disconnected, DNS offline, or in Airplane mode.

---

## 🎮 Game Controls

| Key / Control | Action |
| :--- | :--- |
| **W, A, S, D** / Arrow Keys | Move & Strafe |
| **Mouse** | Aim / Look (Pointer Lock FPS control) |
| **Left Click** / **Space** | Fire Active Weapon |
| **1 / 2 / Q** | Switch Weapons (Combat Shotgun / Plasma Carbine) |
| **Shift** | Tactical Sprint |
| **Tab** / **M** | Toggle Tactical Radar Minimap |
| **ESC** / **P** | Pause Game / Return to Menu |

---

## 🚀 How to Run Locally

### Option 1: Direct File Launch
Simply double-click `index.html` in your file explorer to open it in Google Chrome, Microsoft Edge, Mozilla Firefox, or Brave.

### Option 2: Local Static Server (Optional)
If desired, you can serve the directory with any local static tool:
```bash
# Using Python
python -m http.server 8000

# Using Node / npx
npx serve .
```
Then navigate to `http://localhost:8000`.

---

## 🤖 Agentic Browser Integration

To launch the game from the Agentic Browser when an offline/connection failure state is detected, invoke the global entry point:

```javascript
// Launch the offline game directly
window.startOfflineGame();
```

### Integration Flow Architecture
```text
Agentic Browser
       │
       ▼ (Network Error / Offline Detected)
Browser Offline Fallback Page
       │
       ▼ (User clicks "PLAY OFFLINE DOOM" or auto-boot)
window.startOfflineGame()
       │
       ▼
OFFLINE DOOM Raycasting Game Loop
```

---

## 🏗️ Engine Architecture & File Structure

```text
doom/
├── index.html          # Viewport, CRT overlay, and retro modal screens
├── style.css           # 90s FPS dark theme, scanlines, animations
├── README.md           # Documentation & integration instructions
│
├── js/
│   ├── main.js         # Entry point, UI controller, `startOfflineGame()` export
│   ├── game.js         # Core game loop (requestAnimationFrame), delta-time, state machine
│   ├── renderer.js     # DDA raycaster, floor/ceiling gradients, Z-buffer, sprite sorting
│   ├── player.js       # Player state, WASD physics, armor mitigation, inventory
│   ├── weapon.js       # Shotgun spread, plasma rifle, recoil, muzzle flash
│   ├── enemy.js        # Enemy entities, hurt frames, fireballs, death animations
│   ├── enemyAI.js      # Line-of-sight raycasting, pathing, melee & ranged attack triggers
│   ├── collision.js    # Circle-to-grid collision detection & smooth wall sliding
│   ├── map.js          # Map manager, pickups collector, objective logic
│   ├── audio.js        # Web Audio API synthesizer for all SFX & ambient soundtrack
│   ├── assets.js       # Procedural pixel-art generator for textures, sprites, weapons
│   ├── hud.js          # Retro status bar, animated avatar face, minimap, notifications
│   ├── input.js        # Pointer Lock mouse look & keyboard state manager
│   └── storage.js      # LocalStorage manager for settings and best records
│
└── maps/
    └── level1.js       # Compound layout: "E1M1: Sub-Level 666"
```

---

## 👾 Enemy Threat Index

1. **Crawler Demon**
   - Fast quadruped demonic imp.
   - Attacks with razor-sharp melee claw swipes.
   - High speed, low health. Best eliminated before closing in.

2. **Cyber-Brute**
   - Towering armored demon with cybernetic arm cannon.
   - Casts high-damage homing/linear fireballs across corridors.
   - Heavy armor. Requires heavy shotgun burst or continuous plasma fire.

---

## 💥 Weapons & Pickups

- **Combat Shotgun**: Heavy double-barrel pump shotgun firing 7 spread pellets with high burst damage.
- **Plasma Carbine**: Rapid-fire energy rifle launching high-energy plasma charges.
- **Medkit**: Restores +25 HP (up to 100).
- **Mega-Health**: Demonic sphere providing +100 HP (up to 200).
- **Combat Armor Vest**: Absorbs 66% of incoming enemy damage.
- **Ammo Shells & Plasma Cells**: Restores ammunition reserves.

---

## ⚙️ Offline Verification Checklist

- [x] Wi-Fi / Ethernet disconnected.
- [x] Zero network requests in browser DevTools Network tab.
- [x] Smooth 60 FPS DDA raycasting rendering.
- [x] Authentic procedural Web Audio API SFX & ambient music.
- [x] Settings (Volume, Sensitivity, CRT) persist in `localStorage`.
