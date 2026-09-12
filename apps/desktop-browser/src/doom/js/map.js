/**
 * OFFLINE DOOM - Map Manager
 * Manages grid layout, collision checks, entity spawns, and level objective triggers.
 */
class MapManager {
    constructor() {
        this.currentLevel = null;
        this.grid = [];
        this.width = 0;
        this.height = 0;
        this.pickups = [];
        this.exitPos = { x: 0, y: 0 };
        this.requiredKills = 0;
        this.exitUnlocked = false;
    }

    loadLevel(levelData) {
        this.currentLevel = levelData;
        this.width = levelData.width;
        this.height = levelData.height;
        // Deep copy the grid
        this.grid = levelData.grid.map(row => [...row]);

        // Deep copy pickups
        this.pickups = levelData.pickups.map((p, idx) => ({
            id: idx,
            type: p.type,
            x: p.x,
            y: p.y,
            collected: false
        }));

        this.exitPos = { ...levelData.exitLocation };
        this.blueKeyLocation = levelData.blueKeyLocation ? { ...levelData.blueKeyLocation } : { x: 59.5, y: 4.5 };
        this.blueDoorLocation = levelData.blueDoorLocation ? { ...levelData.blueDoorLocation } : { x: 16, y: 19 };
        this.redKeyLocation = levelData.redKeyLocation ? { ...levelData.redKeyLocation } : { x: 59.5, y: 37.5 };
        this.redDoorLocation = levelData.redDoorLocation ? { ...levelData.redDoorLocation } : { x: 16, y: 41 };

        // Objective: Defeat 15 demons to unlock exit
        this.requiredKills = levelData.requiredKills || 15;
        this.exitUnlocked = false;
    }

    isWall(x, y) {
        const gx = Math.floor(x);
        const gy = Math.floor(y);
        if (gx < 0 || gx >= this.width || gy < 0 || gy >= this.height) {
            return true; // Boundaries are solid
        }
        return this.grid[gy][gx] > 0;
    }

    getWall(gx, gy) {
        if (gx < 0 || gx >= this.width || gy < 0 || gy >= this.height) {
            return 1;
        }
        return this.grid[gy][gx];
    }

    checkPickups(playerX, playerY, pickupRadius = 0.6) {
        const collectedItems = [];
        for (const p of this.pickups) {
            if (p.collected) continue;
            const dx = playerX - p.x;
            const dy = playerY - p.y;
            if (dx * dx + dy * dy < pickupRadius * pickupRadius) {
                p.collected = true;
                collectedItems.push(p);
            }
        }
        return collectedItems;
    }

    isExit(x, y, radius = 1.6) {
        const dx = x - this.exitPos.x;
        const dy = y - this.exitPos.y;
        return (dx * dx + dy * dy < radius * radius);
    }
}

window.mapManager = new MapManager();
