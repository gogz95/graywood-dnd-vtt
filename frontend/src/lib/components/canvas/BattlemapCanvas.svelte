<!-- BattlemapCanvas.svelte — PixiJS v8 Battlemap Viewport Controller, Grid Engine & Token Management Layer -->
<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { Application, Container, Graphics, Sprite, Assets, Text } from 'pixi.js';
  import { canvasStore, type SpellAoeTemplate } from '../../../stores/canvasStore.svelte';
  import { tokenStore, type VttToken, parseSizeToCells } from '../../stores/tokenStore.svelte';
  import { pixiLifecycle } from '../../services/pixiLifecycle';
  import TokenLayer from './TokenLayer.svelte';
  import VisionFogLayer from './VisionFogLayer.svelte';
  import RulerLayer from './RulerLayer.svelte';
  import {
    calculate5eDistanceFeet,
    calculateConeVertices,
    calculateLineVertices,
  } from '../map/MeasurementTool';
  import { projectorStore } from '../../stores/projectorStore.svelte';
  import { combatTurnStore } from '../../../stores/websocketStore';
  import PingLayer, { broadcastPingPoint } from './PingLayer.svelte';

  // ── Types ──────────────────────────────────────────────────────────────────
  export type GridMode = 'square' | 'hexagonal' | 'off';

  interface Props {
    mapImageUrl?: string;
    mapWidth?: number;
    mapHeight?: number;
    initialGridSize?: number;
    initialGridColor?: string;
    initialGridOpacity?: number;
    initialGridMode?: GridMode;
    onCalibrated?: (newGridSize: number) => void;
  }

  let {
    mapImageUrl = $bindable(''),
    mapWidth = $bindable(2400),
    mapHeight = $bindable(1800),
    initialGridSize = 60,
    initialGridColor = '#6366f1',
    initialGridOpacity = 0.35,
    initialGridMode = 'square',
    onCalibrated,
  }: Props = $props();

  // ── Reactive State (Svelte 5 Runes) ────────────────────────────────────────
  let containerEl = $state<HTMLDivElement | null>(null);

  // Viewport camera state
  let panX = $state<number>(0);
  let panY = $state<number>(0);
  let zoom = $state<number>(1.0);
  const minZoom = 0.1;
  const maxZoom = 4.0;

  // Grid configuration state
  let gridMode = $state<GridMode>(initialGridMode);
  let gridSize = $state<number>(initialGridSize);
  let gridColor = $state<string>(initialGridColor);
  let gridOpacity = $state<number>(initialGridOpacity);

  $effect(() => {
    gridMode = initialGridMode;
  });
  $effect(() => {
    gridSize = initialGridSize;
  });
  $effect(() => {
    gridColor = initialGridColor;
  });
  $effect(() => {
    gridOpacity = initialGridOpacity;
  });

  // Calibration state
  let isCalibrating = $state<boolean>(false);
  let isDraggingCalibration = $state<boolean>(false);
  let calibStartWorld = $state<{ x: number; y: number } | null>(null);
  let calibCurrentWorld = $state<{ x: number; y: number } | null>(null);
  let calibLiveBadge = $state<{
    screenX: number;
    screenY: number;
    boxW: number;
    boxH: number;
    cellW: number;
    cellH: number;
    avgCell: number;
  } | null>(null);

  // Token interaction state
  let isDraggingToken = $state<boolean>(false);
  let draggingTokenId = $state<string | null>(null);
  let tokenDragOffset = { x: 0, y: 0 };
  let snapGhostPos = $state<{ x: number; y: number } | null>(null);

  let isRotatingToken = $state<boolean>(false);
  let rotatingTokenId = $state<string | null>(null);

  // Multi-Token Stack Disambiguation Popover state
  let tokenStackPopover = $state<{
    screenX: number;
    screenY: number;
    tokens: VttToken[];
  } | null>(null);

  // Fog of war state
  let enableFog = $state<boolean>(true);
  let isGmFogView = $state<boolean>(false);

  // Map scale adjustment
  let mapScale = $state<number>(1.0);
  let mapOffset = $state<{ x: number; y: number }>({ x: 0, y: 0 });

  // ── Ruler & Measurement Engine State ─────────────────────────────────────────
  let isRulerToolActive = $state(false);
  let measurementRule = $state<'5e-alt' | 'euclidean'>('5e-alt');
  let isMeasuring = $state(false);
  let rulerStart = $state<{ x: number; y: number } | null>(null);
  let rulerCurrent = $state<{ x: number; y: number } | null>(null);
  let rulerWaypoints = $state<Array<{ x: number; y: number }>>([]);
  let isCtrlPressed = $state(false);

  // ── AoE Template State & Pixi Layers ────────────────────────────────────────
  let aoeContainer: Container | null = null;
  let rulerGraphics: Graphics | null = null;
  let rulerBadgeContainer: Container | null = null;
  let isDraggingAoe = $state(false);
  let draggingAoeId = $state<string | null>(null);
  let aoeDragOffset = { x: 0, y: 0 };

  $effect(() => {
    if (aoeContainer) {
      const _ = canvasStore.aoeTemplates;
      const __ = gridSize;
      renderAoeTemplates();
    }
  });

  $effect(() => {
    if (doorContainer) {
      const _ = canvasStore.doors;
      renderDoors();
    }
  });

  // UI status & toasts
  let toastMessage = $state<string | null>(null);
  let toastTimer: ReturnType<typeof setTimeout> | null = null;

  // ── PixiJS Engine References ───────────────────────────────────────────────
  let pixiApp = $state<Application | null>(null);
  let worldContainer = $state<Container | null>(null);
  let bgGraphics: Graphics | null = null;
  let mapContainer: Container | null = null;
  let mapSprite: Sprite | null = null;
  let gridGraphics: Graphics | null = null;
  let doorContainer: Container | null = null;
  let tokenContainer: Container | null = null;
  let selectionGraphics: Graphics | null = null;
  let calibrationGraphics: Graphics | null = null;

  // Pan interaction tracking
  let isPanning = $state(false);
  let panStartScreen = { x: 0, y: 0 };
  let initialPan = { x: 0, y: 0 };
  let isSpacePressed = false;
  let resizeObserver: ResizeObserver | null = null;

  function showToast(msg: string, duration = 3500) {
    toastMessage = msg;
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toastMessage = null;
    }, duration);
  }

  function parseHexColor(hexStr: string): number {
    if (!hexStr) return 0x6366f1;
    const clean = hexStr.replace('#', '');
    const num = parseInt(clean, 16);
    return isNaN(num) ? 0x6366f1 : num;
  }

  // ── Coordinate Conversions ─────────────────────────────────────────────────
  function screenToWorld(clientX: number, clientY: number): { x: number; y: number } {
    if (!containerEl) return { x: 0, y: 0 };
    const rect = containerEl.getBoundingClientRect();
    const sx = clientX - rect.left;
    const sy = clientY - rect.top;
    return {
      x: (sx - panX) / zoom,
      y: (sy - panY) / zoom,
    };
  }

  function worldToScreen(worldX: number, worldY: number): { x: number; y: number } {
    return {
      x: worldX * zoom + panX,
      y: worldY * zoom + panY,
    };
  }

  // ── Zoom with Wheel Damping ────────────────────────────────────────────────
  function zoomAt(factor: number, clientX: number, clientY: number) {
    if (!containerEl || !worldContainer) return;

    const oldZoom = zoom;
    const newZoom = Math.min(maxZoom, Math.max(minZoom, oldZoom * factor));
    if (Math.abs(newZoom - oldZoom) < 0.0001) return;

    const rect = containerEl.getBoundingClientRect();
    const cursorScreenX = clientX - rect.left;
    const cursorScreenY = clientY - rect.top;

    const worldAnchorX = (cursorScreenX - panX) / oldZoom;
    const worldAnchorY = (cursorScreenY - panY) / oldZoom;

    panX = cursorScreenX - worldAnchorX * newZoom;
    panY = cursorScreenY - worldAnchorY * newZoom;
    zoom = newZoom;

    worldContainer.scale.set(zoom);
    worldContainer.position.set(panX, panY);

    canvasStore.setDmViewport({ x: panX, y: panY, zoom });
  }

  function handleWheel(e: WheelEvent) {
    e.preventDefault();
    const dampingFactor = Math.exp(-e.deltaY * 0.0015);
    zoomAt(dampingFactor, e.clientX, e.clientY);
  }

  // ── Camera Centering / Fit To View ─────────────────────────────────────────
  export function fitToView() {
    if (!containerEl || !worldContainer) return;
    const cw = containerEl.clientWidth || 1200;
    const ch = containerEl.clientHeight || 800;

    const targetW = mapWidth * mapScale || 2000;
    const targetH = mapHeight * mapScale || 1500;

    const scaleX = (cw * 0.9) / targetW;
    const scaleY = (ch * 0.9) / targetH;
    const fitZoom = Math.min(Math.max(minZoom, Math.min(scaleX, scaleY)), 2.0);

    zoom = fitZoom;
    panX = (cw - targetW * zoom) / 2;
    panY = (ch - targetH * zoom) / 2;

    worldContainer.scale.set(zoom);
    worldContainer.position.set(panX, panY);

    canvasStore.setDmViewport({ x: panX, y: panY, zoom });
  }

  export function resetCamera() {
    zoom = 1.0;
    panX = 0;
    panY = 0;
    if (worldContainer) {
      worldContainer.scale.set(zoom);
      worldContainer.position.set(panX, panY);
    }
    canvasStore.setDmViewport({ x: panX, y: panY, zoom });
  }

  // ── Grid Rendering Engine ──────────────────────────────────────────────────
  function renderGrid() {
    if (!gridGraphics) return;
    gridGraphics.clear();

    if (gridMode === 'off' || gridOpacity <= 0 || gridSize <= 0) return;

    const hexColor = parseHexColor(gridColor);
    const alpha = Math.max(0, Math.min(1, gridOpacity));
    const effectiveW = Math.max(mapWidth * mapScale, 3000);
    const effectiveH = Math.max(mapHeight * mapScale, 2400);

    if (gridMode === 'square') {
      for (let x = 0; x <= effectiveW + gridSize; x += gridSize) {
        gridGraphics.moveTo(x, 0).lineTo(x, effectiveH);
      }
      for (let y = 0; y <= effectiveH + gridSize; y += gridSize) {
        gridGraphics.moveTo(0, y).lineTo(effectiveW, y);
      }
      gridGraphics.stroke({ color: hexColor, alpha, width: 1 });
    } else if (gridMode === 'hexagonal') {
      const R = gridSize / Math.sqrt(3);
      const colDist = gridSize;
      const rowDist = 1.5 * R;
      const cols = Math.ceil(effectiveW / colDist) + 2;
      const rows = Math.ceil(effectiveH / rowDist) + 2;

      for (let r = 0; r < rows; r++) {
        const cy = r * rowDist + R;
        const xOffset = r % 2 === 1 ? colDist / 2 : 0;
        for (let c = 0; c < cols; c++) {
          const cx = c * colDist + xOffset + colDist / 2;
          for (let i = 0; i < 6; i++) {
            const angle = (Math.PI / 180) * (60 * i - 30);
            const vx = cx + R * Math.cos(angle);
            const vy = cy + R * Math.sin(angle);
            if (i === 0) {
              gridGraphics.moveTo(vx, vy);
            } else {
              gridGraphics.lineTo(vx, vy);
            }
          }
          gridGraphics.closePath();
        }
      }
      gridGraphics.stroke({ color: hexColor, alpha, width: 1 });
    }
  }

  // ── Background Mat Layer ───────────────────────────────────────────────────
  function renderBackgroundMat() {
    if (!bgGraphics) return;
    bgGraphics.clear();

    const w = Math.max(mapWidth * mapScale, 3000);
    const h = Math.max(mapHeight * mapScale, 2400);

    bgGraphics.rect(0, 0, w, h).fill({ color: 0x090b10, alpha: 1.0 });

    const tileSize = 120;
    for (let x = 0; x < w; x += tileSize) {
      for (let y = 0; y < h; y += tileSize) {
        if ((Math.floor(x / tileSize) + Math.floor(y / tileSize)) % 2 === 0) {
          bgGraphics.rect(x, y, tileSize, tileSize).fill({ color: 0x0e111a, alpha: 0.6 });
        }
      }
    }

    bgGraphics.rect(0, 0, w, h).stroke({ color: 0x334155, width: 3 });
  }

  // ── Scene & Texture Disposal Engine ─────────────────────────────────────────
  let activeMapUrl: string | null = null;

  export function disposeActiveMap() {
    // 1. Destroy active map sprites with explicit GPU VRAM release
    if (mapSprite) {
      if (mapContainer && mapSprite.parent === mapContainer) {
        mapContainer.removeChild(mapSprite);
      }
      try {
        mapSprite.destroy({ children: true, texture: true, textureSource: true });
      } catch (err) {
        console.warn('BattlemapCanvas: Error destroying mapSprite:', err);
      }
      mapSprite = null;
    }

    if (mapContainer) {
      mapContainer.removeChildren().forEach((child) => {
        try {
          child.destroy({ children: true, texture: true, textureSource: true });
        } catch {}
      });
    }

    // 2. Clear all PixiJS Graphics objects representing grids, fog polygons, and token HUD layers
    if (gridGraphics) gridGraphics.clear();
    if (bgGraphics) bgGraphics.clear();
    if (selectionGraphics) selectionGraphics.clear();
    if (calibrationGraphics) calibrationGraphics.clear();
    if (rulerGraphics) rulerGraphics.clear();

    if (aoeContainer) {
      aoeContainer.removeChildren().forEach((c) => {
        try {
          c.destroy({ children: true });
        } catch {}
      });
    }

    if (doorContainer) {
      doorContainer.removeChildren().forEach((c) => {
        try {
          c.destroy({ children: true });
        } catch {}
      });
    }

    if (tokenContainer) {
      tokenContainer.removeChildren().forEach((c) => {
        try {
          c.destroy({ children: true });
        } catch {}
      });
    }

    if (rulerBadgeContainer) {
      rulerBadgeContainer.removeChildren().forEach((c) => {
        try {
          c.destroy({ children: true });
        } catch {}
      });
    }

    // 3. Call Assets.unload(activeMapUrl) to purge decoded textures from the internal PixiJS asset cache
    if (activeMapUrl) {
      try {
        Assets.unload(activeMapUrl);
      } catch (err) {
        console.warn('BattlemapCanvas: Assets.unload failed for', activeMapUrl, err);
      }
      activeMapUrl = null;
    }
  }

  // ── Map Texture Loading ────────────────────────────────────────────────────
  async function loadMapImage(url: string) {
    if (!url || !mapContainer) return;
    if (activeMapUrl && activeMapUrl !== url) {
      disposeActiveMap();
    }
    activeMapUrl = url;
    try {
      const texture = await Assets.load(url);
      if (!texture) return;

      if (!mapSprite) {
        mapSprite = new Sprite(texture);
        mapContainer.addChild(mapSprite);
      } else {
        mapSprite.texture = texture;
      }

      if (!mapWidth || mapWidth === 2400) {
        mapWidth = texture.width;
      }
      if (!mapHeight || mapHeight === 1800) {
        mapHeight = texture.height;
      }

      mapSprite.scale.set(mapScale);
      mapSprite.position.set(mapOffset.x, mapOffset.y);

      renderBackgroundMat();
      renderGrid();
      renderTokens();
      fitToView();
    } catch (err) {
      console.warn('BattlemapCanvas: Failed to load map image texture:', err);
    }
  }

  // ── Token Layer Rendering ──────────────────────────────────────────────────
  function renderTokens() {
    if (!tokenContainer) return;

    // Purge children safely
    tokenContainer.removeChildren().forEach((child) => child.destroy({ children: true }));

    // Sort tokens by elevation for proper visual stacking
    const sortedTokens = [...tokenStore.tokens].sort((a, b) => (a.elevation || 0) - (b.elevation || 0));

    for (const tok of sortedTokens) {
      const tokNode = new Container();
      tokNode.position.set(tok.x, tok.y);
      tokNode.rotation = ((tok.rotation || 0) * Math.PI) / 180;
      tokNode.zIndex = 1000 + (tok.elevation || 0);

      const footprintPx = tok.size * gridSize;
      const radius = (footprintPx * 0.88) / 2;

      const g = new Graphics();
      tokNode.addChild(g);

      // 1. Token Circular Body
      const bodyColor = parseHexColor(tok.color || (tok.isPlayer ? '#3b82f6' : '#ef4444'));
      g.circle(0, 0, radius).fill({ color: bodyColor, alpha: 0.95 });

      // Outer Token Rim (Gold for Players, Crimson for Monsters)
      const rimColor = tok.isPlayer ? 0xfbbf24 : 0xef4444;
      g.circle(0, 0, radius).stroke({ color: rimColor, width: 2.5 });

      // 2. Initials Label
      const initials = (tok.name || 'T')
        .split(' ')
        .map((w) => w[0])
        .join('')
        .slice(0, 2)
        .toUpperCase();

      const initialText = new Text({
        text: initials,
        style: {
          fontSize: Math.max(12, Math.round(radius * 0.55)),
          fontWeight: 'bold',
          fill: 0xffffff,
          align: 'center',
        },
      });
      initialText.anchor.set(0.5);
      tokNode.addChild(initialText);

      // 3. Health Bar Overlays (Circular Arc & Linear Overhead Bar)
      const hpRatio = Math.max(0, Math.min(1, tok.hp / (tok.maxHp || 1)));
      const hpColor = hpRatio > 0.5 ? 0x22c55e : hpRatio > 0.2 ? 0xf59e0b : 0xef4444;

      // Circular Health Arc around rim
      if (hpRatio > 0) {
        g.arc(0, 0, radius + 3, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * hpRatio).stroke({
          color: hpColor,
          width: 3,
        });
      }

      // Linear Health Bar (fixed orientation: child of separate counter-rotated container)
      const overheadNode = new Container();
      overheadNode.position.set(tok.x, tok.y);
      overheadNode.rotation = 0;
      overheadNode.zIndex = 1000 + (tok.elevation || 0);

      const hudG = new Graphics();
      overheadNode.addChild(hudG);

      const barW = Math.max(32, radius * 1.5);
      const barH = 5;
      const barY = -radius - 14;

      // HP Bar background
      hudG.rect(-barW / 2, barY, barW, barH).fill({ color: 0x0f172a, alpha: 0.85 }).stroke({ color: 0x334155, width: 1 });

      // HP Bar foreground
      if (hpRatio > 0) {
        hudG.rect(-barW / 2, barY, barW * hpRatio, barH).fill({ color: hpColor, alpha: 0.95 });
      }

      // 4. Condition Status Badges (Orbiting bottom perimeter)
      if (tok.conditions && tok.conditions.length > 0) {
        const badgeRadius = 7;
        const total = tok.conditions.length;
        const startAngle = Math.PI / 4;
        const span = Math.PI / 2;

        tok.conditions.slice(0, 4).forEach((cond, idx) => {
          const angle = total === 1 ? Math.PI / 2 : startAngle + (span / (total - 1)) * idx;
          const bx = Math.cos(angle) * (radius + 2);
          const by = Math.sin(angle) * (radius + 2);

          hudG.circle(bx, by, badgeRadius).fill({ color: 0x090d16 }).stroke({ color: 0x38bdf8, width: 1.5 });

          const condText = new Text({
            text: cond.slice(0, 1).toUpperCase(),
            style: {
              fontSize: 9,
              fontWeight: 'bold',
              fill: 0x38bdf8,
            },
          });
          condText.anchor.set(0.5);
          condText.position.set(bx, by);
          overheadNode.addChild(condText);
        });
      }

      // 5. Elevation Badge: Flying (>0) Dark Blue (+{elevation}ft), Burrowed (<0) Dark Red ({elevation}ft)
      if (tok.elevation !== undefined && tok.elevation !== 0) {
        const isFlying = tok.elevation > 0;
        const elevX = radius * 0.65;
        const elevY = -radius - 10;
        const elevW = 44;
        const elevH = 15;
        const bgColor = isFlying ? 0x082f49 : 0x450a0a; // Dark blue vs Dark red
        const borderColor = isFlying ? 0x0284c7 : 0xdc2626;
        const textColor = isFlying ? 0x38bdf8 : 0xf87171;
        const sign = isFlying ? '+' : '';

        hudG
          .roundRect(elevX, elevY, elevW, elevH, 4)
          .fill({ color: bgColor, alpha: 0.95 })
          .stroke({ color: borderColor, width: 1.5 });

        const elevText = new Text({
          text: `${sign}${tok.elevation}ft`,
          style: {
            fontSize: 9,
            fontWeight: 'bold',
            fill: textColor,
          },
        });
        elevText.anchor.set(0.5);
        elevText.position.set(elevX + elevW / 2, elevY + elevH / 2);
        overheadNode.addChild(elevText);
      }

      tokenContainer.addChild(tokNode);
      tokenContainer.addChild(overheadNode);
    }

    renderSelectionAndSnap();
  }

  // ── Selection Ring, Rotation Handle & Snap Ghost ───────────────────────────
  function renderSelectionAndSnap() {
    if (!selectionGraphics) return;
    selectionGraphics.clear();

    const selectedId = tokenStore.selectedTokenId;
    if (!selectedId) return;

    const tok = tokenStore.tokens.find((t) => t.id === selectedId);
    if (!tok) return;

    const footprintPx = tok.size * gridSize;
    const radius = (footprintPx * 0.88) / 2;

    // 1. Selection Highlight Ring
    selectionGraphics
      .circle(tok.x, tok.y, radius + 7)
      .stroke({ color: 0x38bdf8, width: 2.5, alpha: 0.95 });

    // Outer subtle dashed pulse ring
    selectionGraphics
      .circle(tok.x, tok.y, radius + 11)
      .stroke({ color: 0x0284c7, width: 1.5, alpha: 0.6 });

    // 2. Rotation Stalk & Handle
    const rotRad = ((tok.rotation || 0) - 90) * (Math.PI / 180);
    const stalkDist = radius + 22;
    const handleX = tok.x + Math.cos(rotRad) * stalkDist;
    const handleY = tok.y + Math.sin(rotRad) * stalkDist;

    selectionGraphics
      .moveTo(tok.x, tok.y)
      .lineTo(handleX, handleY)
      .stroke({ color: 0x38bdf8, width: 1.5, alpha: 0.75 });

    selectionGraphics
      .circle(handleX, handleY, 6)
      .fill({ color: 0x38bdf8 })
      .stroke({ color: 0xffffff, width: 1.5 });

    // 3. Drag Snap Ghost Footprint Preview
    if (isDraggingToken && snapGhostPos) {
      const snapLeft = snapGhostPos.x - footprintPx / 2;
      const snapTop = snapGhostPos.y - footprintPx / 2;

      selectionGraphics
        .rect(snapLeft, snapTop, footprintPx, footprintPx)
        .fill({ color: 0x38bdf8, alpha: 0.15 })
        .stroke({ color: 0x38bdf8, width: 2, alpha: 0.85 });

      // Ghost token circle preview
      selectionGraphics
        .circle(snapGhostPos.x, snapGhostPos.y, radius)
        .stroke({ color: 0xffffff, width: 1.5, alpha: 0.5 });
    }
  }

  // ── Hit Testing Helpers ────────────────────────────────────────────────────
  function findTokenAtWorldPos(wx: number, wy: number): VttToken | null {
    for (let i = tokenStore.tokens.length - 1; i >= 0; i--) {
      const tok = tokenStore.tokens[i];
      const footprintPx = tok.size * gridSize;
      const radius = (footprintPx * 0.88) / 2;
      const dx = wx - tok.x;
      const dy = wy - tok.y;
      if (dx * dx + dy * dy <= radius * radius) {
        return tok;
      }
    }
    return null;
  }

  function isOverRotationHandle(tok: VttToken, wx: number, wy: number): boolean {
    const footprintPx = tok.size * gridSize;
    const radius = (footprintPx * 0.88) / 2;
    const rotRad = ((tok.rotation || 0) - 90) * (Math.PI / 180);
    const stalkDist = radius + 22;
    const handleX = tok.x + Math.cos(rotRad) * stalkDist;
    const handleY = tok.y + Math.sin(rotRad) * stalkDist;

    const dx = wx - handleX;
    const dy = wy - handleY;
    return dx * dx + dy * dy <= 10 * 10;
  }

  function findAllTokensAtWorldPos(wx: number, wy: number): VttToken[] {
    const matched: VttToken[] = [];
    for (let i = tokenStore.tokens.length - 1; i >= 0; i--) {
      const tok = tokenStore.tokens[i];
      const footprintPx = tok.size * gridSize;
      const radius = (footprintPx * 0.88) / 2;
      const dx = wx - tok.x;
      const dy = wy - tok.y;
      if (dx * dx + dy * dy <= radius * radius) {
        matched.push(tok);
      }
    }
    // Sort descending by elevation so highest elevation is first in popover
    return matched.sort((a, b) => (b.elevation || 0) - (a.elevation || 0));
  }

  // ── Multi-State Portal (Door/Window/Secret Door) Rendering & Hit Testing ──
  function getPortalGlyphConfig(door: any): { color: number; label: string; textFill: number; isSecret: boolean } {
    const typeStr = (door.portalType || door.doorType || '').toLowerCase();
    const stateStr = (door.portalState || door.state || 'closed').toLowerCase();
    const isSecret = typeStr.includes('secret');

    if (isSecret && stateStr !== 'open') {
      // Secret door: Purple glyph on DM workstation
      return { color: 0xa855f7, label: 'S', textFill: 0xffffff, isSecret: true };
    }

    if (stateStr === 'open') {
      // Open: Green / Emerald
      return { color: 0x10b981, label: 'O', textFill: 0xffffff, isSecret };
    }

    if (stateStr === 'locked') {
      // Locked: Red
      return { color: 0xef4444, label: 'L', textFill: 0xffffff, isSecret };
    }

    // Closed: Yellow / Amber
    return { color: 0xf59e0b, label: 'C', textFill: 0x0f172a, isSecret };
  }

  function renderDoors() {
    if (!doorContainer) return;
    doorContainer.removeChildren().forEach(c => c.destroy({ children: true }));

    const doors = canvasStore.doors;
    if (!doors || doors.length === 0) return;

    for (const d of doors) {
      const node = new Container();
      const g = new Graphics();
      node.addChild(g);

      const x1 = Number(d.x1 || 0);
      const y1 = Number(d.y1 || 0);
      const x2 = Number(d.x2 || 0);
      const y2 = Number(d.y2 || 0);
      const midX = (x1 + x2) / 2;
      const midY = (y1 + y2) / 2;

      const conf = getPortalGlyphConfig(d);
      const stateStr = (d.portalState || d.state || 'closed').toLowerCase();
      const isOpen = stateStr === 'open';

      // 1. Render Portal Line
      if (isOpen) {
        // Render perpendicular swing tick
        const angle = Math.atan2(y2 - y1, x2 - x1) + Math.PI / 2;
        const len = Math.hypot(x2 - x1, y2 - y1) / 2;
        g.moveTo(x1, y1)
          .lineTo(x1 + Math.cos(angle) * len, y1 + Math.sin(angle) * len)
          .stroke({ color: conf.color, width: 3.5, alpha: 0.9 });
      } else {
        g.moveTo(x1, y1)
          .lineTo(x2, y2)
          .stroke({ color: conf.color, width: 3.5, alpha: 0.9 });
      }

      // 2. Interactive Portal Glyph Button at Midpoint
      const glyphRadius = 10;
      g.circle(midX, midY, glyphRadius + 2)
        .fill({ color: 0x090b10, alpha: 0.85 })
        .stroke({ color: conf.color, width: 2 });

      g.circle(midX, midY, glyphRadius - 1)
        .fill({ color: conf.color, alpha: 0.95 });

      const glyphText = new Text({
        text: conf.label,
        style: {
          fontSize: 10,
          fontWeight: '900',
          fill: conf.textFill,
          align: 'center',
        },
      });
      glyphText.anchor.set(0.5);
      glyphText.position.set(midX, midY);
      node.addChild(glyphText);

      doorContainer.addChild(node);
    }
  }

  function findDoorAtWorldPos(wx: number, wy: number): any | null {
    const doors = canvasStore.doors;
    if (!doors) return null;
    const hitRadiusSq = 16 * 16;
    for (const d of doors) {
      const midX = (Number(d.x1 || 0) + Number(d.x2 || 0)) / 2;
      const midY = (Number(d.y1 || 0) + Number(d.y2 || 0)) / 2;
      const dx = wx - midX;
      const dy = wy - midY;
      if (dx * dx + dy * dy <= hitRadiusSq) {
        return d;
      }
    }
    return null;
  }
  // ── Distance & Movement Ruler Calculation & Rendering ─────────────────────
  function calculateTotalRulerDistance(
    start: { x: number; y: number },
    waypoints: Array<{ x: number; y: number }>,
    end: { x: number; y: number },
    rule: '5e-alt' | 'euclidean' = '5e-alt'
  ): { totalFeet: number; segmentDistances: number[] } {
    const points = [start, ...waypoints, end];
    let totalFeet = 0;
    const segmentDistances: number[] = [];

    for (let i = 0; i < points.length - 1; i++) {
      const p1 = points[i];
      const p2 = points[i + 1];
      const g1 = { gx: p1.x / gridSize, gy: p1.y / gridSize };
      const g2 = { gx: p2.x / gridSize, gy: p2.y / gridSize };
      const seg = calculate5eDistanceFeet(g1, g2, rule, 5);
      segmentDistances.push(seg.distanceFeet);
      totalFeet += seg.distanceFeet;
    }

    return { totalFeet: Math.round(totalFeet * 10) / 10, segmentDistances };
  }

  function renderRuler() {
    if (!rulerGraphics || !rulerBadgeContainer) return;
    rulerGraphics.clear();
    rulerBadgeContainer.removeChildren().forEach(c => c.destroy({ children: true }));

    const rulerData = isMeasuring && rulerStart && rulerCurrent
      ? {
          start: rulerStart,
          waypoints: rulerWaypoints,
          end: rulerCurrent,
          rule: measurementRule,
          color: 0x38bdf8
        }
      : canvasStore.ruler
        ? {
            start: { x: (canvasStore.ruler.startX + 0.5) * gridSize, y: (canvasStore.ruler.startY + 0.5) * gridSize },
            waypoints: (canvasStore.ruler.waypoints || []).map(w => ({ x: (w.x + 0.5) * gridSize, y: (w.y + 0.5) * gridSize })),
            end: { x: (canvasStore.ruler.endX + 0.5) * gridSize, y: (canvasStore.ruler.endY + 0.5) * gridSize },
            rule: canvasStore.ruler.rule || measurementRule,
            color: parseHexColor(canvasStore.ruler.color || '#38bdf8')
          }
        : null;

    if (!rulerData) return;

    const points = [rulerData.start, ...rulerData.waypoints, rulerData.end];
    if (points.length < 2) return;

    const { totalFeet, segmentDistances } = calculateTotalRulerDistance(
      rulerData.start,
      rulerData.waypoints,
      rulerData.end,
      rulerData.rule
    );

    // 1. Outer halo glow line
    rulerGraphics.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) {
      rulerGraphics.lineTo(points[i].x, points[i].y);
    }
    rulerGraphics.stroke({ color: rulerData.color, width: 8, alpha: 0.25 });

    // 2. Core high-contrast line
    rulerGraphics.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) {
      rulerGraphics.lineTo(points[i].x, points[i].y);
    }
    rulerGraphics.stroke({ color: 0xffffff, width: 2.5, alpha: 0.95 });

    // 3. Waypoint & terminal nodes
    for (let i = 0; i < points.length; i++) {
      const pt = points[i];
      const isEndpoint = i === 0 || i === points.length - 1;
      const radius = isEndpoint ? 6 : 4.5;
      rulerGraphics
        .circle(pt.x, pt.y, radius + 2)
        .fill({ color: rulerData.color, alpha: 0.9 })
        .stroke({ color: 0xffffff, width: 1.5 });
    }

    // 4. Segment midpoint badges if multiple waypoints
    if (points.length > 2) {
      for (let i = 0; i < points.length - 1; i++) {
        const p1 = points[i];
        const p2 = points[i + 1];
        const midX = (p1.x + p2.x) / 2;
        const midY = (p1.y + p2.y) / 2;
        const segDist = segmentDistances[i] ?? 0;

        const segText = new Text({
          text: `${segDist} ft`,
          style: {
            fontFamily: 'monospace',
            fontSize: 10,
            fontWeight: 'bold',
            fill: 0xe2e8f0,
            align: 'center'
          }
        });
        segText.anchor.set(0.5);
        segText.position.set(midX, midY);

        const padX = 12;
        const padY = 6;
        const segBadge = new Graphics();
        segBadge
          .roundRect(midX - (segText.width + padX) / 2, midY - (segText.height + padY) / 2, segText.width + padX, segText.height + padY, 5)
          .fill({ color: 0x090b10, alpha: 0.85 })
          .stroke({ color: rulerData.color, width: 1, alpha: 0.7 });

        rulerBadgeContainer.addChild(segBadge);
        rulerBadgeContainer.addChild(segText);
      }
    }

    // 5. Total Distance Badge at current cursor / endpoint
    const lastPt = points[points.length - 1];
    const totalLabel = points.length > 2
      ? `${totalFeet} ft total`
      : `${totalFeet} ft`;

    const badgeText = new Text({
      text: totalLabel,
      style: {
        fontFamily: 'monospace',
        fontSize: 12,
        fontWeight: 'bold',
        fill: 0xffffff,
        align: 'center'
      }
    });
    badgeText.anchor.set(0.5);
    const badgeY = lastPt.y - 22;
    badgeText.position.set(lastPt.x, badgeY);

    const badgeW = badgeText.width + 16;
    const badgeH = badgeText.height + 8;
    const mainBadgeBg = new Graphics();
    mainBadgeBg
      .roundRect(lastPt.x - badgeW / 2, badgeY - badgeH / 2, badgeW, badgeH, 6)
      .fill({ color: 0x0f172a, alpha: 0.95 })
      .stroke({ color: rulerData.color, width: 2, alpha: 0.95 });

    rulerBadgeContainer.addChild(mainBadgeBg);
    rulerBadgeContainer.addChild(badgeText);
  }

  // ── 5e Spell Area of Effect (AoE) Template Rendering ───────────────────────
  function renderAoeTemplates() {
    if (!aoeContainer) return;
    aoeContainer.removeChildren().forEach(c => c.destroy({ children: true }));

    const templates = canvasStore.aoeTemplates;
    const pixelsPerFoot = gridSize / 5;

    for (const t of templates) {
      const templateNode = new Container();
      const g = new Graphics();
      templateNode.addChild(g);

      const originPx = {
        x: (t.originX + 0.5) * gridSize,
        y: (t.originY + 0.5) * gridSize
      };

      const targetPx = {
        x: ((t.targetX ?? t.originX + 1) + 0.5) * gridSize,
        y: ((t.targetY ?? t.originY) + 0.5) * gridSize
      };

      const colorHex = parseHexColor(t.color || '#ef4444');
      const radiusPx = t.sizeFeet * pixelsPerFoot;

      switch (t.type) {
        case 'circle': {
          g.circle(originPx.x, originPx.y, radiusPx)
            .fill({ color: colorHex, alpha: 0.35 })
            .stroke({ color: colorHex, width: 2.5, alpha: 0.95 });

          // Center crosshair
          g.circle(originPx.x, originPx.y, 4).fill({ color: 0xffffff });
          g.circle(originPx.x, originPx.y, 8).stroke({ color: colorHex, width: 1.5 });
          break;
        }

        case 'cone': {
          const cone = calculateConeVertices(originPx, targetPx, radiusPx);
          const startAngle = Math.atan2(cone.p2.y - originPx.y, cone.p2.x - originPx.x);
          const endAngle = Math.atan2(cone.p3.y - originPx.y, cone.p3.x - originPx.x);

          g.moveTo(originPx.x, originPx.y)
            .lineTo(cone.p2.x, cone.p2.y)
            .arc(originPx.x, originPx.y, radiusPx, startAngle, endAngle)
            .closePath()
            .fill({ color: colorHex, alpha: 0.35 })
            .stroke({ color: colorHex, width: 2.5, alpha: 0.95 });

          g.circle(originPx.x, originPx.y, 4).fill({ color: 0xffffff });
          break;
        }

        case 'cube': {
          const sidePx = t.sizeFeet * pixelsPerFoot;
          const x = originPx.x - sidePx / 2;
          const y = originPx.y - sidePx / 2;
          g.rect(x, y, sidePx, sidePx)
            .fill({ color: colorHex, alpha: 0.35 })
            .stroke({ color: colorHex, width: 2.5, alpha: 0.95 });

          g.circle(originPx.x, originPx.y, 4).fill({ color: 0xffffff });
          break;
        }

        case 'line': {
          const widthPx = (t.widthFeet || 5) * pixelsPerFoot;
          const poly = calculateLineVertices(originPx, targetPx, radiusPx, widthPx);
          g.moveTo(poly[0].x, poly[0].y)
            .lineTo(poly[1].x, poly[1].y)
            .lineTo(poly[2].x, poly[2].y)
            .lineTo(poly[3].x, poly[3].y)
            .closePath()
            .fill({ color: colorHex, alpha: 0.35 })
            .stroke({ color: colorHex, width: 2.5, alpha: 0.95 });

          g.circle(originPx.x, originPx.y, 4).fill({ color: 0xffffff });
          break;
        }
      }

      // Template Label Pill Badge
      if (t.label) {
        const labelText = new Text({
          text: `${t.label} (${t.sizeFeet} ft)`,
          style: {
            fontFamily: 'sans-serif',
            fontSize: 11,
            fontWeight: 'bold',
            fill: 0xffffff,
            align: 'center'
          }
        });
        labelText.anchor.set(0.5);
        labelText.position.set(originPx.x, originPx.y - 14);

        const labelBg = new Graphics();
        const bgW = labelText.width + 12;
        const bgH = labelText.height + 6;
        labelBg
          .roundRect(originPx.x - bgW / 2, originPx.y - 14 - bgH / 2, bgW, bgH, 5)
          .fill({ color: 0x090b10, alpha: 0.85 })
          .stroke({ color: colorHex, width: 1 });

        templateNode.addChild(labelBg);
        templateNode.addChild(labelText);
      }

      aoeContainer.addChild(templateNode);
    }
  }

  function findAoeTemplateAt(wx: number, wy: number): SpellAoeTemplate | null {
    const pixelsPerFoot = gridSize / 5;
    for (let i = canvasStore.aoeTemplates.length - 1; i >= 0; i--) {
      const t = canvasStore.aoeTemplates[i];
      const originPx = {
        x: (t.originX + 0.5) * gridSize,
        y: (t.originY + 0.5) * gridSize
      };
      const radiusPx = t.sizeFeet * pixelsPerFoot;
      const dx = wx - originPx.x;
      const dy = wy - originPx.y;
      if (dx * dx + dy * dy <= radiusPx * radiusPx) {
        return t;
      }
    }
    return null;
  }

  // ── 3x3 Calibration Ruler Tool ─────────────────────────────────────────────
  function toggleCalibration() {
    isCalibrating = !isCalibrating;
    if (isCalibrating) {
      tokenStore.selectToken(null);
      showToast('📐 3x3 Calibration Active: Drag across a 3x3 square grid area on your map.', 4500);
    } else {
      cancelCalibration();
    }
  }

  function cancelCalibration() {
    isCalibrating = false;
    isDraggingCalibration = false;
    calibStartWorld = null;
    calibCurrentWorld = null;
    calibLiveBadge = null;
    if (calibrationGraphics) calibrationGraphics.clear();
  }

  function updateCalibrationOverlay() {
    if (!calibrationGraphics || !calibStartWorld || !calibCurrentWorld) return;
    calibrationGraphics.clear();

    const minX = Math.min(calibStartWorld.x, calibCurrentWorld.x);
    const minY = Math.min(calibStartWorld.y, calibCurrentWorld.y);
    const boxW = Math.abs(calibCurrentWorld.x - calibStartWorld.x);
    const boxH = Math.abs(calibCurrentWorld.y - calibStartWorld.y);

    if (boxW < 2 || boxH < 2) return;

    calibrationGraphics
      .rect(minX, minY, boxW, boxH)
      .fill({ color: 0x06b6d4, alpha: 0.18 })
      .stroke({ color: 0x38bdf8, width: 2 / zoom });

    const thirdW = boxW / 3;
    const thirdH = boxH / 3;

    calibrationGraphics
      .moveTo(minX + thirdW, minY)
      .lineTo(minX + thirdW, minY + boxH)
      .moveTo(minX + thirdW * 2, minY)
      .lineTo(minX + thirdW * 2, minY + boxH);

    calibrationGraphics
      .moveTo(minX, minY + thirdH)
      .lineTo(minX + boxW, minY + thirdH)
      .moveTo(minX, minY + thirdH * 2)
      .lineTo(minX + boxW, minY + thirdH * 2);

    calibrationGraphics.stroke({ color: 0x38bdf8, width: 1.5 / zoom, alpha: 0.85 });
  }

  function finishCalibration() {
    if (!calibStartWorld || !calibCurrentWorld) {
      cancelCalibration();
      return;
    }

    const boxW = Math.abs(calibCurrentWorld.x - calibStartWorld.x);
    const boxH = Math.abs(calibCurrentWorld.y - calibStartWorld.y);

    if (boxW >= 15 && boxH >= 15) {
      const cellW = boxW / 3;
      const cellH = boxH / 3;
      const measuredGridSize = Math.max(10, Math.min(300, Math.round((cellW + cellH) / 2)));

      gridSize = measuredGridSize;
      canvasStore.setGridSize(measuredGridSize);

      showToast(
        `✓ Grid Calibrated: ${measuredGridSize}px per 5ft cell (measured ${Math.round(boxW)}×${Math.round(boxH)}px across 3×3 squares)`,
        5000
      );

      if (onCalibrated) {
        onCalibrated(measuredGridSize);
      }

      renderGrid();
      renderTokens();
    } else {
      showToast('⚠️ Calibration box too small. Drag across at least 3 grid squares.', 3000);
    }

    cancelCalibration();
  }

  // ── Drag & Drop Token Placement onto Grid ──────────────────────────────────
  function handleDragOver(e: DragEvent) {
    e.preventDefault();
    if (e.dataTransfer) {
      e.dataTransfer.dropEffect = 'copy';
    }
  }

  function handleDrop(e: DragEvent) {
    e.preventDefault();
    const rawData = e.dataTransfer?.getData('application/json') || e.dataTransfer?.getData('text/plain');
    if (!rawData) return;

    try {
      const payload = JSON.parse(rawData);
      const worldPos = screenToWorld(e.clientX, e.clientY);
      const sizeCells = parseSizeToCells(payload.size || payload.sizeCategory || 1);

      // Snap token center to nearest grid intersection or cell center
      const cellCol = Math.round((worldPos.x - (sizeCells * gridSize) / 2) / gridSize);
      const cellRow = Math.round((worldPos.y - (sizeCells * gridSize) / 2) / gridSize);
      const snappedCenterX = Math.round((cellCol + sizeCells / 2) * gridSize);
      const snappedCenterY = Math.round((cellRow + sizeCells / 2) * gridSize);

      const isPc = Boolean(payload.isPlayer || payload.type === 'PLAYER_TOKEN');
      const newToken: VttToken = {
        id: `tok-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        name: payload.name || (isPc ? 'Hero' : 'Monster'),
        x: snappedCenterX,
        y: snappedCenterY,
        size: sizeCells,
        hp: payload.hp || (isPc ? 25 : 18),
        maxHp: payload.maxHp || payload.hp || (isPc ? 25 : 18),
        ac: payload.ac || 12,
        conditions: payload.conditions || [],
        isRevealed: true,
        isGmOnly: Boolean(payload.isGmOnly),
        imageUrl: payload.imageUrl || payload.url || payload.portraitUrl,
        color: payload.color || (isPc ? '#3b82f6' : '#ef4444'),
        elevation: payload.elevation || 0,
        rotation: payload.rotation || 0,
        isPlayer: isPc,
      };

      tokenStore.addToken(newToken);
      tokenStore.selectToken(newToken.id);
      showToast(`Placed ${newToken.name} (${sizeCells}×${sizeCells}) snapped to grid`);
    } catch (err) {
      console.warn('Failed to parse dropped token payload:', err);
    }
  }

  // ── Quick Token Spawner ────────────────────────────────────────────────────
  function spawnQuickToken(isPlayer = false, size = 1) {
    if (!containerEl) return;
    const centerWorld = screenToWorld(containerEl.clientWidth / 2, containerEl.clientHeight / 2);
    const cellCol = Math.round((centerWorld.x - (size * gridSize) / 2) / gridSize);
    const cellRow = Math.round((centerWorld.y - (size * gridSize) / 2) / gridSize);
    const snappedX = Math.round((cellCol + size / 2) * gridSize);
    const snappedY = Math.round((cellRow + size / 2) * gridSize);

    const newToken: VttToken = {
      id: `tok-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name: isPlayer ? 'Adventurer' : size === 2 ? 'Ogre' : size === 3 ? 'Dragon' : 'Goblin',
      x: snappedX,
      y: snappedY,
      size,
      hp: isPlayer ? 30 : size === 2 ? 59 : size === 3 ? 178 : 7,
      maxHp: isPlayer ? 30 : size === 2 ? 59 : size === 3 ? 178 : 7,
      ac: isPlayer ? 14 : size === 2 ? 11 : size === 3 ? 18 : 15,
      conditions: [],
      isRevealed: true,
      isGmOnly: false,
      color: isPlayer ? '#3b82f6' : '#ef4444',
      elevation: 0,
      rotation: 0,
      isPlayer,
    };

    tokenStore.addToken(newToken);
    tokenStore.selectToken(newToken.id);
    showToast(`Spawned ${newToken.name} (${size}×${size}) at grid center`);
  }

  // ── Projector Window Launcher ──────────────────────────────────────────────
  async function launchProjectorWindow() {
    try {
      const win = window as any;
      const invokeFn = win.__TAURI__?.core?.invoke || win.__TAURI_INTERNALS__?.invoke;
      if (typeof invokeFn === 'function') {
        await invokeFn('open_projector_window');
        showToast('Launched secondary projector window');
        return;
      }
    } catch (err) {
      console.warn('Tauri open_projector_window invoke failed, falling back:', err);
    }
    window.open('/projector', '_blank', 'width=1920,height=1080');
    showToast('Opened projector view in new window');
  }

  // ── Pointer Event Handlers ─────────────────────────────────────────────────
  function handlePointerDown(e: PointerEvent) {
    // 0. Synchronized Map Ping (Alt + Left Click or Middle Click)
    if ((e.altKey && e.button === 0) || e.button === 1) {
      e.preventDefault();
      const worldPos = screenToWorld(e.clientX, e.clientY);
      broadcastPingPoint({
        x: worldPos.x,
        y: worldPos.y,
        color: '#f59e0b',
        sender_name: 'Dungeon Master',
      });
      return;
    }

    // 1. Pan with Right Click (2) or Space + Left Click (0)
    if (e.button === 2 || (isSpacePressed && e.button === 0)) {
      e.preventDefault();
      isPanning = true;
      panStartScreen = { x: e.clientX, y: e.clientY };
      initialPan = { x: panX, y: panY };
      if (containerEl) containerEl.setPointerCapture(e.pointerId);
      return;
    }

    const worldPos = screenToWorld(e.clientX, e.clientY);

    // 2. Measurement Ruler Trigger (Ctrl + Left Click or Ruler Tool Active)
    if ((e.ctrlKey || isCtrlPressed || isRulerToolActive) && e.button === 0) {
      e.preventDefault();
      isMeasuring = true;
      rulerStart = worldPos;
      rulerCurrent = worldPos;
      rulerWaypoints = [];
      renderRuler();
      if (containerEl) containerEl.setPointerCapture(e.pointerId);
      return;
    }

    // 3. 3x3 Calibration Drag with Left Click (0)
    if (isCalibrating && e.button === 0) {
      e.preventDefault();
      calibStartWorld = worldPos;
      calibCurrentWorld = worldPos;
      isDraggingCalibration = true;
      if (containerEl) containerEl.setPointerCapture(e.pointerId);
      return;
    }

    // 4. Rotation Handle Drag
    if (tokenStore.selectedToken && isOverRotationHandle(tokenStore.selectedToken, worldPos.x, worldPos.y)) {
      e.preventDefault();
      isRotatingToken = true;
      rotatingTokenId = tokenStore.selectedToken.id;
      if (containerEl) containerEl.setPointerCapture(e.pointerId);
      return;
    }

    // 5. Token Selection & Multi-Token Stack Disambiguation
    const allTokensAtPoint = findAllTokensAtWorldPos(worldPos.x, worldPos.y);

    if (allTokensAtPoint.length > 1 && e.button === 0) {
      e.preventDefault();
      // Calculate screen position for disambiguation popover
      const rect = containerEl?.getBoundingClientRect();
      const popX = e.clientX - (rect?.left || 0);
      const popY = e.clientY - (rect?.top || 0);
      tokenStackPopover = {
        screenX: Math.min(window.innerWidth - 220, Math.max(10, popX)),
        screenY: Math.min(window.innerHeight - 200, Math.max(10, popY)),
        tokens: allTokensAtPoint,
      };
      return;
    }

    // Dismiss stack popover if clicking elsewhere
    tokenStackPopover = null;

    if (allTokensAtPoint.length === 1 && e.button === 0) {
      const clickedToken = allTokensAtPoint[0];
      e.preventDefault();
      tokenStore.selectToken(clickedToken.id);
      isDraggingToken = true;
      draggingTokenId = clickedToken.id;
      tokenDragOffset = { x: clickedToken.x - worldPos.x, y: clickedToken.y - worldPos.y };
      snapGhostPos = { x: clickedToken.x, y: clickedToken.y };
      renderSelectionAndSnap();
      if (containerEl) containerEl.setPointerCapture(e.pointerId);
      return;
    }

    // 6. AoE Template Dragging
    const clickedAoe = findAoeTemplateAt(worldPos.x, worldPos.y);
    if (clickedAoe && e.button === 0) {
      e.preventDefault();
      isDraggingAoe = true;
      draggingAoeId = clickedAoe.id;
      const originPx = {
        x: (clickedAoe.originX + 0.5) * gridSize,
        y: (clickedAoe.originY + 0.5) * gridSize
      };
      aoeDragOffset = { x: originPx.x - worldPos.x, y: originPx.y - worldPos.y };
      if (containerEl) containerEl.setPointerCapture(e.pointerId);
      return;
    }

    // 7. Multi-State Portal (Door / Window / Secret Door) Click Toggle
    const clickedDoor = findDoorAtWorldPos(worldPos.x, worldPos.y);
    if (clickedDoor && e.button === 0) {
      e.preventDefault();
      canvasStore.toggleDoor(clickedDoor.id);
      const conf = getPortalGlyphConfig(clickedDoor);
      const nextDesc = clickedDoor.state === 'OPEN' ? 'CLOSED' : 'OPEN';
      showToast(`Portal "${clickedDoor.name || 'Door'}" toggled: ${nextDesc}`, 2500);
      renderDoors();
      return;
    }

    // 7. Click on Empty Canvas: Deselect Token
    if (e.button === 0 && !isCalibrating) {
      tokenStore.selectToken(null);
      renderSelectionAndSnap();
    }
  }

  function handlePointerMove(e: PointerEvent) {
    // Handle camera panning
    if (isPanning) {
      const deltaX = e.clientX - panStartScreen.x;
      const deltaY = e.clientY - panStartScreen.y;
      panX = initialPan.x + deltaX;
      panY = initialPan.y + deltaY;

      if (worldContainer) {
        worldContainer.position.set(panX, panY);
      }
      canvasStore.setDmViewport({ x: panX, y: panY, zoom });
      return;
    }

    const worldPos = screenToWorld(e.clientX, e.clientY);

    // Handle active ruler measurement drag
    if (isMeasuring && rulerStart) {
      rulerCurrent = worldPos;
      renderRuler();
      return;
    }

    // Handle AoE template dragging
    if (isDraggingAoe && draggingAoeId) {
      const aoe = canvasStore.aoeTemplates.find(t => t.id === draggingAoeId);
      if (aoe) {
        const newOriginPxX = worldPos.x + aoeDragOffset.x;
        const newOriginPxY = worldPos.y + aoeDragOffset.y;
        const newCol = Math.round((newOriginPxX / gridSize) - 0.5);
        const newRow = Math.round((newOriginPxY / gridSize) - 0.5);

        if (aoe.originX !== newCol || aoe.originY !== newRow) {
          const deltaCol = newCol - aoe.originX;
          const deltaRow = newRow - aoe.originY;
          aoe.originX = newCol;
          aoe.originY = newRow;
          if (aoe.targetX !== undefined) aoe.targetX += deltaCol;
          if (aoe.targetY !== undefined) aoe.targetY += deltaRow;
          renderAoeTemplates();
        }
      }
      return;
    }

    // Handle token rotation
    if (isRotatingToken && rotatingTokenId) {
      const tok = tokenStore.tokens.find((t) => t.id === rotatingTokenId);
      if (tok) {
        const angleRad = Math.atan2(worldPos.y - tok.y, worldPos.x - tok.x);
        const angleDeg = ((angleRad * 180) / Math.PI + 90 + 360) % 360;
        tokenStore.setRotation(rotatingTokenId, Math.round(angleDeg));
      }
      return;
    }

    // Handle token dragging with real-time grid snap ghost
    if (isDraggingToken && draggingTokenId) {
      const tok = tokenStore.tokens.find((t) => t.id === draggingTokenId);
      if (tok) {
        const targetX = worldPos.x + tokenDragOffset.x;
        const targetY = worldPos.y + tokenDragOffset.y;

        const cellCol = Math.round((targetX - (tok.size * gridSize) / 2) / gridSize);
        const cellRow = Math.round((targetY - (tok.size * gridSize) / 2) / gridSize);
        snapGhostPos = {
          x: Math.round((cellCol + tok.size / 2) * gridSize),
          y: Math.round((cellRow + tok.size / 2) * gridSize),
        };
        renderSelectionAndSnap();
      }
      return;
    }

    // Handle 3x3 calibration ruler drag
    if (isDraggingCalibration && calibStartWorld) {
      calibCurrentWorld = worldPos;

      const boxW = Math.abs(calibCurrentWorld.x - calibStartWorld.x);
      const boxH = Math.abs(calibCurrentWorld.y - calibStartWorld.y);
      const cellW = boxW / 3;
      const cellH = boxH / 3;
      const avgCell = Math.round((cellW + cellH) / 2);

      const rect = containerEl?.getBoundingClientRect();
      const screenX = e.clientX - (rect?.left || 0);
      const screenY = e.clientY - (rect?.top || 0);

      calibLiveBadge = {
        screenX,
        screenY,
        boxW: Math.round(boxW),
        boxH: Math.round(boxH),
        cellW: Math.round(cellW),
        cellH: Math.round(cellH),
        avgCell,
      };

      updateCalibrationOverlay();
    }
  }

  function handlePointerUp(e: PointerEvent) {
    if (isMeasuring && rulerStart && rulerCurrent) {
      const { totalFeet, segmentDistances } = calculateTotalRulerDistance(
        rulerStart,
        rulerWaypoints,
        rulerCurrent,
        measurementRule
      );

      const startCell = { x: Math.round(rulerStart.x / gridSize - 0.5), y: Math.round(rulerStart.y / gridSize - 0.5) };
      const endCell = { x: Math.round(rulerCurrent.x / gridSize - 0.5), y: Math.round(rulerCurrent.y / gridSize - 0.5) };
      const waypointsCells = rulerWaypoints.map(w => ({
        x: Math.round(w.x / gridSize - 0.5),
        y: Math.round(w.y / gridSize - 0.5)
      }));

      canvasStore.setRuler({
        id: `ruler-${Date.now()}`,
        startX: startCell.x,
        startY: startCell.y,
        endX: endCell.x,
        endY: endCell.y,
        distanceFeet: totalFeet,
        waypoints: waypointsCells,
        segmentDistances,
        isPublic: true,
        color: '#38bdf8',
        rule: measurementRule,
      });

      isMeasuring = false;
      renderRuler();
      try {
        if (containerEl?.hasPointerCapture(e.pointerId)) {
          containerEl.releasePointerCapture(e.pointerId);
        }
      } catch {}
      return;
    }

    if (isDraggingAoe) {
      isDraggingAoe = false;
      draggingAoeId = null;
      renderAoeTemplates();
      try {
        if (containerEl?.hasPointerCapture(e.pointerId)) {
          containerEl.releasePointerCapture(e.pointerId);
        }
      } catch {}
      return;
    }

    if (isPanning) {
      isPanning = false;
      try {
        if (containerEl?.hasPointerCapture(e.pointerId)) {
          containerEl.releasePointerCapture(e.pointerId);
        }
      } catch {}
    }

    if (isRotatingToken) {
      isRotatingToken = false;
      rotatingTokenId = null;
      try {
        if (containerEl?.hasPointerCapture(e.pointerId)) {
          containerEl.releasePointerCapture(e.pointerId);
        }
      } catch {}
    }

    if (isDraggingToken && draggingTokenId) {
      if (snapGhostPos) {
        tokenStore.moveToken(draggingTokenId, snapGhostPos.x, snapGhostPos.y);
      }
      isDraggingToken = false;
      draggingTokenId = null;
      snapGhostPos = null;
      renderSelectionAndSnap();
      try {
        if (containerEl?.hasPointerCapture(e.pointerId)) {
          containerEl.releasePointerCapture(e.pointerId);
        }
      } catch {}
    }

    if (isDraggingCalibration) {
      try {
        if (containerEl?.hasPointerCapture(e.pointerId)) {
          containerEl.releasePointerCapture(e.pointerId);
        }
      } catch {}
      finishCalibration();
    }
  }

  // ── Keyboard Shortcuts (Delete token, Escape, Space for Pan) ───────────────
  function handleKeyDown(e: KeyboardEvent) {
    const isEditingText =
      document.activeElement?.tagName === 'INPUT' ||
      document.activeElement?.tagName === 'TEXTAREA' ||
      document.activeElement?.tagName === 'SELECT';

    // Blackout Curtain Hotkey: Ctrl+Shift+B
    if (e.ctrlKey && e.shiftKey && (e.code === 'KeyB' || e.key.toLowerCase() === 'b')) {
      e.preventDefault();
      projectorStore.toggleBlackout();
      showToast(projectorStore.castSource === 'blackout' ? 'Blackout Curtain: SHROUDED (Ctrl+Shift+B)' : 'Blackout Curtain: CLEARED');
      return;
    }

    if (e.code === 'Space' && !e.repeat && !isEditingText) {
      isSpacePressed = true;
    }

    if ((e.key === 'Delete' || e.key === 'Backspace') && !isEditingText) {
      if (tokenStore.selectedTokenId) {
        tokenStore.deleteToken(tokenStore.selectedTokenId);
        showToast('Token removed from battlemat');
      }
    }

    if (e.key === 'Control') {
      isCtrlPressed = true;
    }

    // Space or Shift while measuring drops a waypoint
    if ((e.code === 'Space' || e.shiftKey) && isMeasuring && rulerCurrent) {
      e.preventDefault();
      rulerWaypoints = [...rulerWaypoints, { x: rulerCurrent.x, y: rulerCurrent.y }];
      renderRuler();
      return;
    }

    if (e.key === 'Escape') {
      if (isMeasuring) {
        isMeasuring = false;
        rulerStart = null;
        rulerCurrent = null;
        rulerWaypoints = [];
        renderRuler();
      } else if (canvasStore.ruler) {
        canvasStore.setRuler(null);
        renderRuler();
      } else if (isCalibrating) {
        cancelCalibration();
      } else if (tokenStore.selectedTokenId) {
        tokenStore.selectToken(null);
        renderSelectionAndSnap();
      }
    }
  }

  function handleKeyUp(e: KeyboardEvent) {
    if (e.key === 'Control') {
      isCtrlPressed = false;
    }
    if (e.code === 'Space') {
      isSpacePressed = false;
    }
  }

  // ── Calibration Event Bus Listener ─────────────────────────────────────────
  function handleExternalCalibrationTrigger() {
    isCalibrating = true;
    showToast('📐 3x3 Calibration Triggered: Drag a 3×3 square box over your map.', 4000);
  }

  // ── Lifecycle Hooks ────────────────────────────────────────────────────────
  onMount(async () => {
    if (!containerEl) return;

    // 1. Initialize PixiJS v8 Application
    pixiApp = new Application();
    await pixiApp.init({
      width: containerEl.clientWidth || 1200,
      height: containerEl.clientHeight || 800,
      backgroundColor: 0x090b10,
      antialias: true,
      resolution: window.devicePixelRatio || 1,
      autoDensity: true,
    });

    containerEl.appendChild(pixiApp.canvas);

    // 2. Setup Layer Hierarchy
    worldContainer = new Container();
    pixiApp.stage.addChild(worldContainer);

    bgGraphics = new Graphics();
    worldContainer.addChild(bgGraphics);

    mapContainer = new Container();
    worldContainer.addChild(mapContainer);

    gridGraphics = new Graphics();
    worldContainer.addChild(gridGraphics);

    aoeContainer = new Container();
    worldContainer.addChild(aoeContainer);

    doorContainer = new Container();
    worldContainer.addChild(doorContainer);

    tokenContainer = new Container();
    worldContainer.addChild(tokenContainer);

    selectionGraphics = new Graphics();
    worldContainer.addChild(selectionGraphics);

    calibrationGraphics = new Graphics();
    worldContainer.addChild(calibrationGraphics);

    rulerGraphics = new Graphics();
    worldContainer.addChild(rulerGraphics);

    rulerBadgeContainer = new Container();
    worldContainer.addChild(rulerBadgeContainer);

    // Initial renders
    renderBackgroundMat();
    renderGrid();
    renderDoors();
    renderAoeTemplates();
    renderTokens();
    renderRuler();

    // 3. Load Map Image if provided
    const targetUrl = mapImageUrl || canvasStore.mapImageUrl;
    if (targetUrl) {
      loadMapImage(targetUrl);
    } else {
      fitToView();
    }

    // 4. Responsive Resize Observer
    resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        if (width > 0 && height > 0 && pixiApp?.renderer) {
          pixiApp.renderer.resize(width, height);
        }
      }
    });
    resizeObserver.observe(containerEl);

    // 5. Global Listeners
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('vtt:open-grid-calibration', handleExternalCalibrationTrigger);
  });

  onDestroy(() => {
    disposeActiveMap();
    if (toastTimer) clearTimeout(toastTimer);
    if (resizeObserver) {
      resizeObserver.disconnect();
      resizeObserver = null;
    }

    if (typeof window !== 'undefined') {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('vtt:open-grid-calibration', handleExternalCalibrationTrigger);
    }

    if (worldContainer) {
      pixiLifecycle.purgeFloorContainer(worldContainer, true);
    }

    if (pixiApp) {
      try {
        pixiApp.destroy(true, { children: true, texture: true });
      } catch (e) {
        console.warn('Error during PixiApp destruction:', e);
      }
      pixiApp = null;
    }
  });

  // ── Reactive Watchers ──────────────────────────────────────────────────────
  $effect(() => {
    // Re-render grid when properties change
    const _mode = gridMode;
    const _size = gridSize;
    const _color = gridColor;
    const _opacity = gridOpacity;
    renderGrid();
    renderTokens();
  });

  $effect(() => {
    // Re-render tokens when tokenStore changes
    const _tokens = tokenStore.tokens.map((t) => ({
      x: t.x,
      y: t.y,
      hp: t.hp,
      maxHp: t.maxHp,
      size: t.size,
      rotation: t.rotation,
      elevation: t.elevation,
      conds: t.conditions.join(','),
      color: t.color,
    }));
    const _selected = tokenStore.selectedTokenId;
    renderTokens();
  });

  $effect(() => {
    const currentTarget = mapImageUrl || canvasStore.mapImageUrl;
    if (currentTarget && currentTarget !== activeMapUrl) {
      disposeActiveMap();
      loadMapImage(currentTarget);
    } else if (!currentTarget && activeMapUrl) {
      disposeActiveMap();
    }
  });

  // ── Auto-Camera Tracking on Combat Turn or Token Focus ─────────────────────
  $effect(() => {
    const turn = $combatTurnStore;
    if (!turn || canvasStore.lockProjectorPan || !containerEl) return;

    const activeCombatant = turn.combatants?.find((c) => c.is_active);
    if (!activeCombatant) return;

    const tok = tokenStore.tokens.find(
      (t) => t.id === activeCombatant.id || t.name.toLowerCase() === activeCombatant.name.toLowerCase()
    );

    if (tok) {
      const cw = containerEl.clientWidth || 1200;
      const ch = containerEl.clientHeight || 800;
      const targetPanX = Math.round(cw / 2 - tok.x * zoom);
      const targetPanY = Math.round(ch / 2 - tok.y * zoom);

      panX = targetPanX;
      panY = targetPanY;
      if (worldContainer) {
        worldContainer.position.set(panX, panY);
      }
      canvasStore.setDmViewport({ x: panX, y: panY, zoom });
    }
  });
</script>

<!-- ── Canvas Viewport Container ───────────────────────────────────────────── -->
<div
  bind:this={containerEl}
  class="relative w-full h-full overflow-hidden select-none bg-slate-950 font-sans {isCalibrating ? 'cursor-crosshair' : isPanning ? 'cursor-grabbing' : isDraggingToken ? 'cursor-move' : isRotatingToken ? 'cursor-crosshair' : 'cursor-grab'}"
  onpointerdown={handlePointerDown}
  onpointermove={handlePointerMove}
  onpointerup={handlePointerUp}
  onwheel={handleWheel}
  ondragover={handleDragOver}
  ondrop={handleDrop}
  oncontextmenu={(e) => e.preventDefault()}
  role="region"
  aria-label="Interactive Battlemap Canvas"
>
  <!-- Synchronized Map Ping Animation Layer -->
  <PingLayer {pixiApp} {worldContainer} />
  <!-- ── Top Floating Glassmorphic DM Toolbar ──────────────────────────────── -->
  <div class="absolute top-4 left-4 z-30 flex items-center gap-2 pointer-events-auto">
    <!-- Grid Settings Toggle / Collapsible Tray -->
    <div class="flex items-center gap-1.5 p-1.5 bg-slate-900/90 backdrop-blur-md border border-slate-700/80 rounded-xl shadow-2xl text-xs">
      <!-- Grid Mode Switcher -->
      <div class="flex items-center bg-slate-950/80 rounded-lg p-0.5 border border-slate-800">
        <button
          type="button"
          class="px-2.5 py-1 rounded-md font-semibold text-xs transition-colors {gridMode === 'square' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'}"
          onclick={() => { gridMode = 'square'; }}
          title="Square 5ft Grid"
        >
          Square
        </button>
        <button
          type="button"
          class="px-2.5 py-1 rounded-md font-semibold text-xs transition-colors {gridMode === 'hexagonal' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'}"
          onclick={() => { gridMode = 'hexagonal'; }}
          title="Hexagonal Pointy-Topped Grid"
        >
          Hex
        </button>
        <button
          type="button"
          class="px-2.5 py-1 rounded-md font-semibold text-xs transition-colors {gridMode === 'off' ? 'bg-slate-700 text-slate-200 shadow-sm' : 'text-slate-400 hover:text-slate-200'}"
          onclick={() => { gridMode = 'off'; }}
          title="Gridless Mode"
        >
          Off
        </button>
      </div>

      {#if gridMode !== 'off'}
        <!-- Cell Size Input & Increments -->
        <div class="flex items-center gap-1 px-2 border-l border-slate-800">
          <span class="text-[10px] uppercase font-bold text-slate-400">Size</span>
          <button
            type="button"
            class="w-5 h-5 flex items-center justify-center bg-slate-800 hover:bg-slate-700 rounded text-slate-300 font-bold"
            onclick={() => { gridSize = Math.max(15, gridSize - 5); canvasStore.setGridSize(gridSize); }}
            title="Decrease Cell Size (-5px)"
          >
            -
          </button>
          <input
            type="number"
            min="10"
            max="300"
            step="1"
            bind:value={gridSize}
            onchange={() => { gridSize = Math.max(10, Math.min(300, Number(gridSize))); canvasStore.setGridSize(gridSize); }}
            class="w-12 text-center bg-slate-950 border border-slate-700 rounded px-1 py-0.5 text-xs font-mono text-indigo-300 focus:outline-none focus:border-indigo-500"
          />
          <span class="text-[10px] text-slate-500">px</span>
          <button
            type="button"
            class="w-5 h-5 flex items-center justify-center bg-slate-800 hover:bg-slate-700 rounded text-slate-300 font-bold"
            onclick={() => { gridSize = Math.min(300, gridSize + 5); canvasStore.setGridSize(gridSize); }}
            title="Increase Cell Size (+5px)"
          >
            +
          </button>
        </div>

        <!-- Color Picker -->
        <div class="flex items-center gap-1.5 px-2 border-l border-slate-800">
          <span class="text-[10px] uppercase font-bold text-slate-400">Color</span>
          <label class="relative cursor-pointer flex items-center">
            <input
              type="color"
              bind:value={gridColor}
              onchange={() => canvasStore.setGridColor(gridColor)}
              class="w-5 h-5 rounded cursor-pointer border-0 bg-transparent p-0 overflow-hidden"
            />
          </label>
        </div>

        <!-- Opacity Slider -->
        <div class="flex items-center gap-1.5 px-2 border-l border-slate-800">
          <span class="text-[10px] uppercase font-bold text-slate-400">Alpha</span>
          <input
            type="range"
            min="0.05"
            max="1.0"
            step="0.05"
            bind:value={gridOpacity}
            oninput={() => canvasStore.setGridOpacity(gridOpacity)}
            class="w-16 h-1 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-indigo-500"
          />
          <span class="text-[10px] font-mono text-slate-400 w-7">{Math.round(gridOpacity * 100)}%</span>
        </div>
      {/if}

      <!-- 3x3 Calibration Ruler Button -->
      <div class="px-2 border-l border-slate-800">
        <button
          type="button"
          class="flex items-center gap-1.5 px-2.5 py-1 rounded-lg font-semibold text-xs transition-all {isCalibrating ? 'bg-cyan-500 text-slate-950 font-bold shadow-lg shadow-cyan-500/30 animate-pulse' : 'bg-slate-800 hover:bg-slate-700 text-cyan-300 border border-cyan-800/40'}"
          onclick={toggleCalibration}
          title="Calibrate grid by dragging across a 3x3 square grid on map"
        >
          <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M3 21h18M3 7l6-4 6 4 6-4v14l-6 4-6-4-6 4V7z" />
          </svg>
          {isCalibrating ? 'Cancel 3x3 Ruler' : '3×3 Calibration'}
        </button>
      </div>

      <!-- Quick Token Spawner Buttons -->
      <div class="flex items-center gap-1 px-2 border-l border-slate-800">
        <button
          type="button"
          class="px-2 py-1 bg-blue-950/80 hover:bg-blue-900 border border-blue-700/60 rounded text-blue-300 font-semibold text-xs transition-colors flex items-center gap-1"
          onclick={() => spawnQuickToken(true, 1)}
          title="Spawn Player Character Token (1x1 Medium)"
        >
          <span>+ PC</span>
        </button>
        <button
          type="button"
          class="px-2 py-1 bg-rose-950/80 hover:bg-rose-900 border border-rose-700/60 rounded text-rose-300 font-semibold text-xs transition-colors flex items-center gap-1"
          onclick={() => spawnQuickToken(false, 1)}
          title="Spawn Monster Token (1x1 Medium)"
        >
          <span>+ NPC</span>
        </button>
        <button
          type="button"
          class="px-2 py-1 bg-amber-950/80 hover:bg-amber-900 border border-amber-700/60 rounded text-amber-300 font-semibold text-xs transition-colors"
          onclick={() => spawnQuickToken(false, 2)}
          title="Spawn Large Creature Token (2x2)"
        >
          + Large
        </button>
      </div>

      <!-- Fog of War Toggle -->
      <div class="px-2 border-l border-slate-800">
        <button
          type="button"
          class="px-2.5 py-1 rounded-lg font-semibold text-xs transition-all {enableFog ? 'bg-indigo-600 text-white shadow-sm' : 'bg-slate-800 text-slate-400 hover:text-slate-200'}"
          onclick={() => { enableFog = !enableFog; }}
          title="Toggle Dynamic Lighting and Fog of War Mask"
        >
          Fog: {enableFog ? 'ON' : 'OFF'}
        </button>
      </div>

      <!-- Blackout Curtain Toggle -->
      <div class="px-2 border-l border-slate-800">
        <button
          type="button"
          class="px-2.5 py-1 rounded-lg font-semibold text-xs transition-all {projectorStore.castSource === 'blackout' ? 'bg-rose-700 text-white shadow-lg animate-pulse' : 'bg-slate-800 text-slate-300 hover:text-white'}"
          onclick={() => {
            projectorStore.toggleBlackout();
            showToast(projectorStore.castSource === 'blackout' ? 'Projector Blackout Shroud Active' : 'Projector Battlemat Restored');
          }}
          title="Blackout Curtain: Shroud secondary projector screen in black (Ctrl+Shift+B)"
        >
          {projectorStore.castSource === 'blackout' ? '⬛ Blackout ON' : 'Curtain'}
        </button>
      </div>

      <!-- Sync Projector Viewport Toggle -->
      <div class="px-2 border-l border-slate-800">
        <button
          type="button"
          class="px-2.5 py-1 rounded-lg font-semibold text-xs transition-all flex items-center gap-1.5 {!canvasStore.lockProjectorPan ? 'bg-emerald-700 text-white shadow-md' : 'bg-slate-800 text-slate-400 hover:text-slate-200'}"
          onclick={() => {
            canvasStore.toggleLockProjectorPan();
            if (!canvasStore.lockProjectorPan) {
              canvasStore.setProjectorViewport({ x: panX, y: panY, zoom });
            }
            showToast(!canvasStore.lockProjectorPan ? 'Sync Projector Viewport: ACTIVE' : 'Sync Projector Viewport: UNCOUPLED (Locked)');
          }}
          title="Toggle camera follow: synchronize projector screen with DM viewport and active turn"
        >
          <span>{!canvasStore.lockProjectorPan ? '🎥 Sync Projector' : '🔒 Projector Locked'}</span>
        </button>
      </div>

      <!-- Projector Window Launch Button -->
      <div class="px-2 border-l border-slate-800">
        <button
          type="button"
          class="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-lg font-semibold text-xs transition-colors flex items-center gap-1"
          onclick={launchProjectorWindow}
          title="Open Secondary Projector Window for Tabletop TV"
        >
          <span>🖥️ Projector</span>
        </button>
      </div>
    </div>
  </div>

  <!-- ── Top Right Viewport Controls & Zoom HUD ──────────────────────────────── -->
  <div class="absolute top-4 right-4 z-30 flex items-center gap-2 pointer-events-auto">
    <div class="flex items-center gap-1 p-1 bg-slate-900/90 backdrop-blur-md border border-slate-700/80 rounded-xl shadow-2xl text-xs">
      <button
        type="button"
        class="w-7 h-7 flex items-center justify-center bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg font-bold"
        onclick={() => zoomAt(1.2, containerEl ? containerEl.clientWidth / 2 : 600, containerEl ? containerEl.clientHeight / 2 : 400)}
        title="Zoom In"
      >
        +
      </button>
      <span class="px-2 font-mono text-xs text-indigo-300 font-bold">{Math.round(zoom * 100)}%</span>
      <button
        type="button"
        class="w-7 h-7 flex items-center justify-center bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg font-bold"
        onclick={() => zoomAt(0.833, containerEl ? containerEl.clientWidth / 2 : 600, containerEl ? containerEl.clientHeight / 2 : 400)}
        title="Zoom Out"
      >
        -
      </button>
      <button
        type="button"
        class="px-2.5 py-1 ml-1 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-lg font-medium text-xs transition-colors"
        onclick={fitToView}
        title="Fit Map to Viewport"
      >
        Fit View
      </button>
      <button
        type="button"
        class="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white rounded-lg text-xs"
        onclick={resetCamera}
        title="Reset 100% Zoom and Pan"
      >
        100%
      </button>
    </div>
  </div>

  <!-- ── 3x3 Calibration Active Banner ─────────────────────────────────────── -->
  {#if isCalibrating}
    <div class="absolute top-20 left-1/2 -translate-x-1/2 z-40 px-4 py-2 bg-cyan-950/90 border border-cyan-500/70 text-cyan-200 rounded-xl shadow-2xl backdrop-blur-md flex items-center gap-3 text-xs animate-bounce pointer-events-none">
      <span class="w-2.5 h-2.5 rounded-full bg-cyan-400 animate-ping"></span>
      <span class="font-medium">Drag a 3×3 rectangle across your map's printed grid squares to auto-align.</span>
      <span class="text-cyan-400 font-mono text-[11px]">(Press Esc to cancel)</span>
    </div>
  {/if}

  <!-- ── Calibration Live Tooltip Drag Badge ─────────────────────────────────── -->
  {#if isDraggingCalibration && calibLiveBadge}
    <div
      class="absolute z-40 pointer-events-none px-3 py-1.5 bg-slate-950/95 border border-cyan-400/80 rounded-lg shadow-2xl text-[11px] font-mono text-cyan-200 backdrop-blur-md transform translate-x-4 translate-y-4"
      style="left: {calibLiveBadge.screenX}px; top: {calibLiveBadge.screenY}px;"
    >
      <div class="font-bold text-white mb-0.5">3×3 Grid Measurement</div>
      <div>Box: {calibLiveBadge.boxW} × {calibLiveBadge.boxH} px</div>
      <div class="text-cyan-400 font-bold">Cell: ~{calibLiveBadge.avgCell} px / square</div>
    </div>
  {/if}

  <!-- ── Dynamic Lighting & Fog of War Layer ───────────────────────────────── -->
  {#if enableFog}
    <VisionFogLayer
      mapWidth={mapWidth * mapScale || 2400}
      mapHeight={mapHeight * mapScale || 1800}
      gridSize={gridSize}
      zoom={zoom}
      panX={panX}
      panY={panY}
      bind:isGmView={isGmFogView}
    />
  {/if}

  <!-- ── Tabletop Measurement & 5e AoE Template HUD Layer ───────────────── -->
  <RulerLayer
    bind:isRulerToolActive={isRulerToolActive}
    bind:measurementRule={measurementRule}
    onSpawnTemplate={() => renderAoeTemplates()}
    onClearAllTemplates={() => renderAoeTemplates()}
  />

  <!-- ── Selected Token Inspector HUD Component ────────────────────────────── -->
  <TokenLayer gridSize={gridSize} />

  <!-- ── Multi-Token Stack Disambiguation Popover ─────────────────────────── -->
  {#if tokenStackPopover}
    <div
      class="absolute z-50 bg-slate-900/95 border border-indigo-500/80 rounded-2xl shadow-2xl p-2.5 flex flex-col gap-1 min-w-[210px] backdrop-blur-md animate-in fade-in zoom-in-95 duration-150"
      style="left: {tokenStackPopover.screenX}px; top: {tokenStackPopover.screenY}px;"
    >
      <div class="flex items-center justify-between px-1.5 pb-1 border-b border-slate-800 text-[10px] uppercase font-bold text-indigo-400 tracking-wider">
        <span>Stacked Tokens ({tokenStackPopover.tokens.length})</span>
        <button
          type="button"
          class="text-slate-400 hover:text-white p-0.5 rounded"
          onclick={() => tokenStackPopover = null}
          aria-label="Close Stack Menu"
        >
          ✕
        </button>
      </div>

      <div class="flex flex-col gap-1 max-h-56 overflow-y-auto pt-1">
        {#each tokenStackPopover.tokens as tok}
          {@const isSelected = tokenStore.selectedTokenId === tok.id}
          {@const isFlying = (tok.elevation || 0) > 0}
          {@const isBurrowed = (tok.elevation || 0) < 0}
          <button
            type="button"
            class="flex items-center justify-between gap-2.5 px-2.5 py-1.5 rounded-xl text-left transition-all {isSelected ? 'bg-indigo-600/90 text-white font-bold shadow-md' : 'bg-slate-950/70 hover:bg-slate-800 text-slate-200'}"
            onclick={() => {
              tokenStore.selectToken(tok.id);
              renderSelectionAndSnap();
              tokenStackPopover = null;
            }}
          >
            <div class="flex items-center gap-2 min-w-0">
              <!-- Token Initial / Color Pip -->
              <div
                class="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white shrink-0 border"
                style="background-color: {tok.color || (tok.isPlayer ? '#3b82f6' : '#ef4444')}; border-color: {tok.isPlayer ? '#fbbf24' : '#ef4444'};"
              >
                {(tok.name || 'T').slice(0, 1).toUpperCase()}
              </div>
              <span class="text-xs truncate">{tok.name}</span>
            </div>

            <!-- Elevation Badge -->
            {#if tok.elevation !== undefined && tok.elevation !== 0}
              <span class="px-1.5 py-0.5 rounded text-[9px] font-mono font-bold shrink-0 {isFlying ? 'bg-sky-950 text-sky-300 border border-sky-600/60' : 'bg-rose-950 text-rose-300 border border-rose-600/60'}">
                {isFlying ? '+' : ''}{tok.elevation}ft
              </span>
            {:else}
              <span class="text-[9px] font-mono text-slate-500 shrink-0">0ft</span>
            {/if}
          </button>
        {/each}
      </div>
    </div>
  {/if}

  <!-- ── Feedback Toast Notification ────────────────────────────────────────── -->
  {#if toastMessage}
    <div class="absolute bottom-6 left-1/2 -translate-x-1/2 z-50 px-5 py-2.5 bg-slate-900/95 border border-indigo-500/60 text-indigo-200 text-xs font-medium rounded-2xl shadow-2xl backdrop-blur-md pointer-events-none animate-fade-in flex items-center gap-2">
      <span>{toastMessage}</span>
    </div>
  {/if}
</div>

<style>
  @keyframes fadeIn {
    from { opacity: 0; transform: translate(-50%, 10px); }
    to { opacity: 1; transform: translate(-50%, 0); }
  }
  .animate-fade-in {
    animation: fadeIn 0.25s ease-out forwards;
  }
</style>
