// frontend/src/lib/canvas/controllers/DoorController.ts
// Interactive Door and Portal Controller for PixiJS v8.
// Renders interactive door markers at door segment midpoints and toggles state dynamically.

import { Container, Graphics } from 'pixi.js';
import type { DoorState, WallSegment } from '../math/sanitizeGeometry';
import type { FogController } from './FogController';
import { sendWsEvent } from '../../../stores/websocketStore';

export interface DoorControllerOptions {
  parent: Container;
  fogController?: FogController;
  isDmView?: boolean;
  onDoorStateChanged?: (wallId: string, newState: DoorState) => void;
}

export class DoorController {
  public container: Container;
  private doorGraphicsMap = new Map<string, Graphics>();
  private walls: WallSegment[] = [];
  private fogController?: FogController;
  private isDmView: boolean;
  private onDoorStateChanged?: (wallId: string, newState: DoorState) => void;

  constructor(options: DoorControllerOptions) {
    this.container = new Container();
    this.container.label = 'VTT_DoorLayer';
    this.fogController = options.fogController;
    this.isDmView = options.isDmView ?? false;
    this.onDoorStateChanged = options.onDoorStateChanged;

    const world = options.parent.label === 'VTT_WorldContainer'
      ? options.parent
      : (options.parent.getChildByLabel?.('VTT_WorldContainer') || options.parent);
    world.addChild(this.container);
  }

  public setIsDmView(isDm: boolean): void {
    if (this.isDmView !== isDm) {
      this.isDmView = isDm;
      this.renderDoors();
    }
  }

  public setWalls(walls: WallSegment[]): void {
    this.walls = walls;
    this.renderDoors();
  }

  /**
   * Updates state of a single door wall segment.
   */
  public updateDoorState(wallId: string, state: DoorState): void {
    const wall = this.walls.find((w) => w.id === wallId);
    if (!wall) return;
    wall.doorState = state;
    this.renderDoors();
    if (this.fogController) {
      this.fogController.recomputeVisibility();
    }
  }

  /**
   * Toggles door between open and closed (or secret revealing for DM).
   */
  public toggleDoor(wallId: string): void {
    const wall = this.walls.find((w) => w.id === wallId);
    if (!wall || !wall.isDoor) return;

    let nextState: DoorState;
    if (wall.doorState === 'open') {
      nextState = 'closed';
    } else if (wall.doorState === 'closed') {
      nextState = 'open';
    } else if (wall.doorState === 'secret') {
      nextState = this.isDmView ? 'open' : 'secret';
    } else if (wall.doorState === 'locked') {
      nextState = this.isDmView ? 'open' : 'locked';
    } else {
      nextState = 'open';
    }

    wall.doorState = nextState;
    this.renderDoors();

    // Recompute visibility immediately so open doors cast rays through
    if (this.fogController) {
      this.fogController.recomputeVisibility();
    }

    // Call optional local listener
    if (this.onDoorStateChanged) {
      this.onDoorStateChanged(wall.id, nextState);
    }

    // Broadcast across clients via WebSocket
    try {
      sendWsEvent({
        type: 'DoorStateUpdated',
        payload: {
          wall_id: wall.id,
          state: nextState,
        },
      });
    } catch {
      // WS send error fallback (e.g. offline/testing)
    }
  }

  /**
   * Renders interactive door markers at the midpoint of door wall segments:
   * midX = (p1.x + p2.x) / 2, midY = (p1.y + p2.y) / 2
   */
  public renderDoors(): void {
    // Clear previously rendered graphics
    for (const gfx of this.doorGraphicsMap.values()) {
      this.container.removeChild(gfx);
      gfx.destroy();
    }
    this.doorGraphicsMap.clear();

    const doorSegments = this.walls.filter((w) => w && w.isDoor);

    for (const door of doorSegments) {
      const state = door.doorState || 'closed';

      // Secret doors are invisible to non-DM views (e.g. /projector, player view)
      if (state === 'secret' && !this.isDmView) {
        continue;
      }

      const midX = (door.p1.x + door.p2.x) / 2;
      const midY = (door.p1.y + door.p2.y) / 2;

      const gfx = new Graphics();
      gfx.label = `door_${door.id}`;
      gfx.eventMode = 'static';
      gfx.cursor = 'pointer';

      // Visual rendering based on state
      const radius = 14;

      if (state === 'closed') {
        // Closed: Solid icon / door representation
        gfx.circle(0, 0, radius);
        gfx.fill({ color: 0x8b5a2b, alpha: 0.95 });
        gfx.stroke({ width: 2, color: 0xffffff, alpha: 0.8 });

        // Brass handle / bar
        gfx.rect(-8, -3, 16, 6);
        gfx.fill({ color: 0xd4af37, alpha: 1.0 });
      } else if (state === 'open') {
        // Open: Hollow icon / opened door visual
        gfx.circle(0, 0, radius);
        gfx.fill({ color: 0x10b981, alpha: 0.25 });
        gfx.stroke({ width: 2, color: 0x10b981, alpha: 0.9 });

        // Open swing indicator
        gfx.moveTo(-7, 0);
        gfx.lineTo(7, 0);
        gfx.stroke({ width: 2, color: 0x34d399, alpha: 1.0 });
      } else if (state === 'secret') {
        // Secret (DM view only): dashed purple/amber marker
        gfx.circle(0, 0, radius);
        gfx.fill({ color: 0x7c3aed, alpha: 0.4 });
        gfx.stroke({ width: 2, color: 0xa855f7, alpha: 0.9 });

        gfx.moveTo(-5, -5);
        gfx.lineTo(5, 5);
        gfx.moveTo(5, -5);
        gfx.lineTo(-5, 5);
        gfx.stroke({ width: 2, color: 0xe9d5ff, alpha: 1.0 });
      } else if (state === 'locked') {
        // Locked: Red lock badge
        gfx.circle(0, 0, radius);
        gfx.fill({ color: 0xb91c1c, alpha: 0.85 });
        gfx.stroke({ width: 2, color: 0xfca5a5, alpha: 0.9 });

        gfx.rect(-4, -2, 8, 7);
        gfx.fill({ color: 0xfef08a, alpha: 1.0 });
      }

      gfx.position.set(midX, midY);

      // On pointer tap/click toggle door
      gfx.on('pointertap', (e) => {
        e.stopPropagation();
        this.toggleDoor(door.id);
      });

      this.container.addChild(gfx);
      this.doorGraphicsMap.set(door.id, gfx);
    }
  }

  public destroy(): void {
    for (const gfx of this.doorGraphicsMap.values()) {
      gfx.destroy();
    }
    this.doorGraphicsMap.clear();
    this.container.destroy({ children: true });
  }
}
