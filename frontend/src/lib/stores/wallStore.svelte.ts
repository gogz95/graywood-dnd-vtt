// src/lib/stores/wallStore.svelte.ts
// Central Wall Collider & Line-of-Sight Segment Store for 2D Raycast Occlusion

export interface WallSegment {
  id: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  blocksVision: boolean;
  blocksMovement: boolean;
  isDoor?: boolean;
  isOpen?: boolean;
}

class WallStore {
  walls = $state<WallSegment[]>([]);

  setWalls(newWalls: WallSegment[]) {
    this.walls = newWalls;
  }

  addWall(wall: WallSegment) {
    this.walls.push(wall);
  }

  addWalls(walls: WallSegment[]) {
    this.walls.push(...walls);
  }

  removeWall(id: string) {
    this.walls = this.walls.filter((w) => w.id !== id);
  }

  clear() {
    this.walls = [];
  }
}

export const wallStore = new WallStore();
