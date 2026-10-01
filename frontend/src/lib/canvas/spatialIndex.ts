// frontend/src/lib/canvas/spatialIndex.ts
// Dynamic R-Tree Spatial Index for Real-Time Canvas Culling & Token/Obstacle Mutation
// Maintains 2D bounding boxes for tokens, walls, doors, and overhead tiles with RBush.

import RBush from 'rbush';

export interface SpatialBBox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export interface SpatialItem extends SpatialBBox {
  id: string;
  type: 'token' | 'wall' | 'door' | 'overhead_tile';
  data?: any;
}

export class SpatialIndexManager {
  private tree: RBush<SpatialItem>;
  private itemMap: Map<string, SpatialItem>;

  constructor() {
    this.tree = new RBush<SpatialItem>();
    this.itemMap = new Map();
  }

  /**
   * Updates or inserts a token bounding box into the spatial index.
   */
  public updateToken(id: string, bbox: SpatialBBox, data?: any): void {
    this.remove(id);
    const item: SpatialItem = {
      id,
      type: 'token',
      ...bbox,
      data,
    };
    this.itemMap.set(id, item);
    this.tree.insert(item);
  }

  /**
   * Updates or inserts a wall/door segment into the spatial index.
   */
  public updateCollider(id: string, bbox: SpatialBBox, type: 'wall' | 'door', active: boolean = true, data?: any): void {
    this.remove(id);
    if (!active) return; // Inactive colliders (e.g., opened doors) are removed from blocking index
    const item: SpatialItem = {
      id,
      type,
      ...bbox,
      data,
    };
    this.itemMap.set(id, item);
    this.tree.insert(item);
  }

  /**
   * Removes an entity from the spatial index.
   */
  public remove(id: string): void {
    const existing = this.itemMap.get(id);
    if (existing) {
      this.tree.remove(existing);
      this.itemMap.delete(id);
    }
  }

  /**
   * Queries entities that intersect the given viewport or region bounds.
   */
  public search(bounds: SpatialBBox): SpatialItem[] {
    return this.tree.search(bounds);
  }

  /**
   * Clears the entire spatial index.
   */
  public clear(): void {
    this.tree.clear();
    this.itemMap.clear();
  }

  /**
   * Returns current count of indexed entities.
   */
  public get size(): number {
    return this.itemMap.size;
  }
}

export const globalSpatialIndex = new SpatialIndexManager();
