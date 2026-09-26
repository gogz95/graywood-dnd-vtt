// src/lib/stores/drawingStore.svelte.ts
// Central Svelte 5 Reactive Store for Freehand Drawings, Vector Shapes, and Text Annotations

import type { DrawingElement, DrawingTool, DrawingLayerType } from '../types/drawing';
import { sendWsEvent } from '../../stores/websocketStore';

const STORAGE_PREFIX = 'vtt_map_drawings_';

class DrawingStore {
  drawings = $state<DrawingElement[]>([]);
  activeTool = $state<DrawingTool>('none');
  activeLayer = $state<DrawingLayerType>('shared');
  strokeColor = $state<string>('#ef4444');
  fillColor = $state<string>('transparent');
  strokeWidth = $state<number>(4);
  alpha = $state<number>(1.0);
  fontSize = $state<number>(18);
  isToolbarExpanded = $state<boolean>(true);
  currentMapKey = $state<string>('');

  sharedDrawings = $derived(this.drawings.filter((d) => d.layer === 'shared'));
  dmDrawings = $derived(this.drawings.filter((d) => d.layer === 'dm'));

  constructor() {
    if (typeof window !== 'undefined') {
      window.addEventListener('vtt:drawing-update', (e: Event) => {
        const detail = (e as CustomEvent).detail;
        if (detail) {
          this.handleRemoteUpdate(detail);
        }
      });
    }
  }

  setMap(mapKey: string) {
    if (!mapKey) return;
    // Persist previous map drawings
    if (this.currentMapKey) {
      this.persistToLocalStorage(this.currentMapKey);
    }
    this.currentMapKey = mapKey;
    this.loadFromLocalStorage(mapKey);
  }

  addDrawing(drawing: DrawingElement, emitWs = true) {
    this.drawings = [...this.drawings, drawing];
    if (this.currentMapKey) {
      this.persistToLocalStorage(this.currentMapKey);
    }
    if (emitWs) {
      sendWsEvent({
        type: 'DRAWING_UPDATE',
        action: 'upsert',
        drawing,
        layer: drawing.layer,
      });
    }
  }

  updateDrawing(id: string, updates: Partial<DrawingElement>, emitWs = true) {
    let targetDrawing: DrawingElement | null = null;
    this.drawings = this.drawings.map((d) => {
      if (d.id === id) {
        targetDrawing = { ...d, ...updates } as DrawingElement;
        return targetDrawing;
      }
      return d;
    });
    if (this.currentMapKey) {
      this.persistToLocalStorage(this.currentMapKey);
    }
    if (emitWs && targetDrawing) {
      sendWsEvent({
        type: 'DRAWING_UPDATE',
        action: 'upsert',
        drawing: targetDrawing,
      });
    }
  }

  removeDrawing(id: string, emitWs = true) {
    this.drawings = this.drawings.filter((d) => d.id !== id);
    if (this.currentMapKey) {
      this.persistToLocalStorage(this.currentMapKey);
    }
    if (emitWs) {
      sendWsEvent({
        type: 'DRAWING_UPDATE',
        action: 'delete',
        drawing_id: id,
      });
    }
  }

  clearDrawings(layer: DrawingLayerType | 'all' = 'all', emitWs = true) {
    if (layer === 'all') {
      this.drawings = [];
    } else {
      this.drawings = this.drawings.filter((d) => d.layer !== layer);
    }
    if (this.currentMapKey) {
      this.persistToLocalStorage(this.currentMapKey);
    }
    if (emitWs) {
      sendWsEvent({
        type: 'DRAWING_UPDATE',
        action: 'clear',
        layer: layer === 'all' ? undefined : layer,
      });
    }
  }

  setDrawings(drawings: DrawingElement[], emitWs = false) {
    this.drawings = [...drawings];
    if (this.currentMapKey) {
      this.persistToLocalStorage(this.currentMapKey);
    }
    if (emitWs) {
      sendWsEvent({
        type: 'DRAWING_UPDATE',
        action: 'sync',
        drawings: this.drawings,
      });
    }
  }

  exportSidecar(mapKey?: string): DrawingElement[] {
    const key = mapKey || this.currentMapKey;
    if (!key) return [...this.drawings];
    return [...this.drawings];
  }

  importSidecar(mapKey: string, drawings: DrawingElement[]) {
    if (!Array.isArray(drawings)) return;
    this.currentMapKey = mapKey;
    this.drawings = [...drawings];
    this.persistToLocalStorage(mapKey);
  }

  private handleRemoteUpdate(payload: any) {
    if (!payload || !payload.action) return;
    const { action, drawing, drawings, drawing_id, layer } = payload;

    if (action === 'upsert' && drawing) {
      const idx = this.drawings.findIndex((d) => d.id === drawing.id);
      if (idx >= 0) {
        this.drawings[idx] = drawing;
      } else {
        this.drawings = [...this.drawings, drawing];
      }
      if (this.currentMapKey) this.persistToLocalStorage(this.currentMapKey);
    } else if (action === 'delete' && drawing_id) {
      this.drawings = this.drawings.filter((d) => d.id !== drawing_id);
      if (this.currentMapKey) this.persistToLocalStorage(this.currentMapKey);
    } else if (action === 'clear') {
      if (!layer || layer === 'all') {
        this.drawings = [];
      } else {
        this.drawings = this.drawings.filter((d) => d.layer !== layer);
      }
      if (this.currentMapKey) this.persistToLocalStorage(this.currentMapKey);
    } else if (action === 'sync' && Array.isArray(drawings)) {
      this.drawings = drawings;
      if (this.currentMapKey) this.persistToLocalStorage(this.currentMapKey);
    }
  }

  private persistToLocalStorage(mapKey: string) {
    if (typeof localStorage === 'undefined' || !mapKey) return;
    try {
      localStorage.setItem(`${STORAGE_PREFIX}${mapKey}`, JSON.stringify(this.drawings));
    } catch (e) {
      console.warn('[DrawingStore] Failed to save drawings to localStorage:', e);
    }
  }

  private loadFromLocalStorage(mapKey: string) {
    if (typeof localStorage === 'undefined' || !mapKey) return;
    try {
      const raw = localStorage.getItem(`${STORAGE_PREFIX}${mapKey}`);
      if (raw) {
        this.drawings = JSON.parse(raw);
      } else {
        this.drawings = [];
      }
    } catch {
      this.drawings = [];
    }
  }
}

export const drawingStore = new DrawingStore();
