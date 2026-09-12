/**
 * OFFLINE DOOM - Collision Detection & Raycast Line of Sight
 * Provides circle-to-grid wall collision, smooth wall sliding, and fast ray intersection.
 */
class CollisionSystem {
    constructor() {}

    /**
     * Check if a circle at (x, y) with radius r intersects any solid wall tile
     */
    isSolid(x, y, radius, map) {
        const minX = Math.floor(x - radius);
        const maxX = Math.floor(x + radius);
        const minY = Math.floor(y - radius);
        const maxY = Math.floor(y + radius);

        for (let gx = minX; gx <= maxX; gx++) {
            for (let gy = minY; gy <= maxY; gy++) {
                if (map.isWall(gx, gy)) {
                    // Check closest point on tile AABB to circle center
                    const closestX = Math.max(gx, Math.min(x, gx + 1));
                    const closestY = Math.max(gy, Math.min(y, gy + 1));
                    const distX = x - closestX;
                    const distY = y - closestY;
                    if ((distX * distX + distY * distY) < (radius * radius)) {
                        return true;
                    }
                }
            }
        }
        return false;
    }

    /**
     * Move entity with smooth wall sliding
     * @returns {{x: number, y: number, collided: boolean}}
     */
    moveWithSlide(x, y, dx, dy, radius, map) {
        let newX = x;
        let newY = y;
        let collided = false;

        // Try moving along X axis
        if (dx !== 0) {
            if (!this.isSolid(x + dx, y, radius, map)) {
                newX = x + dx;
            } else {
                collided = true;
            }
        }

        // Try moving along Y axis
        if (dy !== 0) {
            if (!this.isSolid(newX, y + dy, radius, map)) {
                newY = y + dy;
            } else {
                collided = true;
            }
        }

        return { x: newX, y: newY, collided };
    }

    /**
     * Fast Bresenham/DDA line-of-sight check between two points
     * @returns {boolean} true if no wall intersects the line segment
     */
    hasLineOfSight(x0, y0, x1, y1, map) {
        const dx = Math.abs(x1 - x0);
        const dy = Math.abs(y1 - y0);
        let x = Math.floor(x0);
        let y = Math.floor(y0);
        const n = 1 + Math.floor(dx) + Math.floor(dy);
        const x_inc = (x1 > x0) ? 1 : -1;
        const y_inc = (y1 > y0) ? 1 : -1;
        let error = dx - dy;
        const dx2 = dx * 2;
        const dy2 = dy * 2;

        for (let i = 0; i < n; i++) {
            if (map.isWall(x, y)) {
                return false;
            }
            if (x === Math.floor(x1) && y === Math.floor(y1)) {
                return true;
            }

            if (error > 0) {
                x += x_inc;
                error -= dy2;
            } else {
                y += y_inc;
                error += dx2;
            }
        }
        return true;
    }
}

window.collisionSystem = new CollisionSystem();
