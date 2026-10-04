// frontend/src/lib/stores/canvasToolStore.ts
// Central reactive store managing tactical battlemat active tools and drawing parameters.

import { writable, get } from 'svelte/store';

export type CanvasTool = 'select' | 'wall' | 'polygon' | 'brush' | 'fog_reveal' | 'fog_shroud';

export interface CanvasToolSettings {
  brushColor: string;
  brushAlpha: number;
  brushWidth: number;
  snapToGrid: boolean;
  wallsVisible: boolean;
}

const defaultSettings: CanvasToolSettings = {
  brushColor: '#ffffff',
  brushAlpha: 0.85,
  brushWidth: 4,
  snapToGrid: true,
  wallsVisible: true,
};

export const activeCanvasTool = writable<CanvasTool>('select');
export const canvasToolSettings = writable<CanvasToolSettings>(defaultSettings);

export const canvasToolStore = {
  subscribe: activeCanvasTool.subscribe,
  set: (tool: CanvasTool) => activeCanvasTool.set(tool),
  get: (): CanvasTool => get(activeCanvasTool),
  setTool: (tool: CanvasTool) => activeCanvasTool.set(tool),
  updateSettings: (patch: Partial<CanvasToolSettings>) => {
    canvasToolSettings.update((s) => ({ ...s, ...patch }));
  },
  getSettings: (): CanvasToolSettings => get(canvasToolSettings),
};
