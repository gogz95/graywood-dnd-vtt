// propStore.svelte.ts — Svelte 5 Rune Store for Canvas Props & Tiles
// Persists to maps/<mapId>.props.json via the Axum campaign-dir asset server.

import type { CanvasProp, PropLayer } from '../types/prop';
import { sendWsEvent } from '../../stores/websocketStore';

const DEFAULT_PROP_SIZE = 120; // 2 grid cells @ 60px default

function createPropStore() {
  let props = $state<CanvasProp[]>([]);
  let activeMapId = $state<string | null>(null);
  let selectedPropId = $state<string | null>(null);

  async function loadProps(mapId: string): Promise<void> {
    activeMapId = mapId;
    try {
      const res = await fetch(`/api/maps/${encodeURIComponent(mapId)}/props`);
      if (!res.ok) { props = []; return; }
      const data = await res.json();
      props = Array.isArray(data) ? data : [];
    } catch {
      props = [];
    }
  }

  async function saveProps(): Promise<void> {
    if (!activeMapId) return;
    try {
      await fetch(`/api/maps/${encodeURIComponent(activeMapId)}/props`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(props),
      });
    } catch {
      // Offline / no backend — state lives in memory
    }
  }

  // ── Mutation helpers — all broadcast via WS ────────────────────────────────
  function broadcastProp(action: 'upsert' | 'delete', prop?: CanvasProp, propId?: string) {
    sendWsEvent({ type: 'PROP_UPDATE', action, prop, prop_id: propId });
  }

  function addProp(partial: Partial<CanvasProp> & { imageUrl: string; x: number; y: number }): CanvasProp {
    const id = `prop-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const newProp: CanvasProp = {
      id,
      imageUrl: partial.imageUrl,
      x: partial.x,
      y: partial.y,
      width: partial.width ?? DEFAULT_PROP_SIZE,
      height: partial.height ?? DEFAULT_PROP_SIZE,
      rotation: partial.rotation ?? 0,
      flippedX: partial.flippedX ?? false,
      flippedY: partial.flippedY ?? false,
      zIndex: partial.zIndex ?? props.length,
      isLocked: partial.isLocked ?? false,
      layer: partial.layer ?? 'ground',
    };
    props.push(newProp);
    broadcastProp('upsert', newProp);
    saveProps();
    return newProp;
  }

  function updateProp(id: string, changes: Partial<CanvasProp>) {
    const idx = props.findIndex((p) => p.id === id);
    if (idx === -1) return;
    Object.assign(props[idx], changes);
    broadcastProp('upsert', props[idx]);
    saveProps();
  }

  function removeProp(id: string) {
    const idx = props.findIndex((p) => p.id === id);
    if (idx === -1) return;
    props.splice(idx, 1);
    if (selectedPropId === id) selectedPropId = null;
    broadcastProp('delete', undefined, id);
    saveProps();
  }

  function selectProp(id: string | null) {
    selectedPropId = id;
  }

  /** Apply a PROP_UPDATE event received from WebSocket (projector / remote). */
  function applyWsUpdate(event: { action: string; prop?: CanvasProp; prop_id?: string }) {
    if (event.action === 'upsert' && event.prop) {
      const idx = props.findIndex((p) => p.id === event.prop!.id);
      if (idx === -1) {
        props.push(event.prop);
      } else {
        Object.assign(props[idx], event.prop);
      }
    } else if (event.action === 'delete' && event.prop_id) {
      const idx = props.findIndex((p) => p.id === event.prop_id);
      if (idx !== -1) props.splice(idx, 1);
    }
  }

  /** Rotate selected prop by radians delta. */
  function rotateSelected(deltaRad: number) {
    if (!selectedPropId) return;
    const p = props.find((p) => p.id === selectedPropId);
    if (!p || p.isLocked) return;
    updateProp(selectedPropId, { rotation: p.rotation + deltaRad });
  }

  /** Flip selected prop horizontally or vertically. */
  function flipSelected(axis: 'x' | 'y') {
    if (!selectedPropId) return;
    const p = props.find((p) => p.id === selectedPropId);
    if (!p || p.isLocked) return;
    if (axis === 'x') updateProp(selectedPropId, { flippedX: !p.flippedX });
    else updateProp(selectedPropId, { flippedY: !p.flippedY });
  }

  /** Toggle lock on selected prop. */
  function toggleLockSelected() {
    if (!selectedPropId) return;
    const p = props.find((p) => p.id === selectedPropId);
    if (!p) return;
    updateProp(selectedPropId, { isLocked: !p.isLocked });
  }

  return {
    get props() { return props; },
    get selectedPropId() { return selectedPropId; },
    get selectedProp() { return props.find((p) => p.id === selectedPropId) ?? null; },
    loadProps,
    addProp,
    updateProp,
    removeProp,
    selectProp,
    applyWsUpdate,
    rotateSelected,
    flipSelected,
    toggleLockSelected,
  };
}

export const propStore = createPropStore();
