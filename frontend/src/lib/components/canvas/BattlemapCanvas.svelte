<!-- BattlemapCanvas.svelte — PixiJS v8 Battlemap Viewport Controller, Grid Engine & Token Management Layer -->
<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { Application, Container, Graphics, Sprite, Assets, Text } from 'pixi.js';
  import { canvasStore } from '../../../stores/canvasStore.svelte';
  import { tokenStore, type VttToken, parseSizeToCells } from '../../stores/tokenStore.svelte';
  import { pixiLifecycle } from '../../services/pixiLifecycle';
  import TokenLayer from './TokenLayer.svelte';
  import VisionFogLayer from './VisionFogLayer.svelte';

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

  // Fog of war state
  let enableFog = $state<boolean>(true);
  let isGmFogView = $state<boolean>(false);

  // Map scale adjustment
  let mapScale = $state<number>(1.0);
  let mapOffset = $state<{ x: number; y: number }>({ x: 0, y: 0 });

  // UI status & toasts
  let toastMessage = $state<string | null>(null);
  let toastTimer: ReturnType<typeof setTimeout> | null = null;

  // ── PixiJS Engine References ───────────────────────────────────────────────
  let pixiApp: Application | null = null;
  let worldContainer: Container | null = null;
  let bgGraphics: Graphics | null = null;
  let mapContainer: Container | null = null;
  let mapSprite: Sprite | null = null;
  let gridGraphics: Graphics | null = null;
  let tokenContainer: Container | null = null;
  let selectionGraphics: Graphics | null = null;
  let calibrationGraphics: Graphics | null = null;

  // Pan interaction tracking
  let isPanning = false;
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

  // ── Map Texture Loading ────────────────────────────────────────────────────
  async function loadMapImage(url: string) {
    if (!url || !mapContainer) return;
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

    const tokens = tokenStore.tokens;
    for (const tok of tokens) {
      const tokNode = new Container();
      tokNode.position.set(tok.x, tok.y);
      tokNode.rotation = ((tok.rotation || 0) * Math.PI) / 180;

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
      // Counter-rotate overhead HUD so it remains upright regardless of token rotation
      overheadNode.rotation = 0;

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

      // 5. Elevation / Flight Marker Tag
      if (tok.elevation && tok.elevation > 0) {
        const elevX = radius * 0.7;
        const elevY = -radius - 8;
        const elevW = 38;
        const elevH = 14;

        hudG
          .rect(elevX, elevY, elevW, elevH)
          .fill({ color: 0x082f49, alpha: 0.9 })
          .stroke({ color: 0x0284c7, width: 1.5 });

        const elevText = new Text({
          text: `▲${tok.elevation}ft`,
          style: {
            fontSize: 9,
            fontWeight: 'bold',
            fill: 0x38bdf8,
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

  // ── Pointer Event Handlers ─────────────────────────────────────────────────
  function handlePointerDown(e: PointerEvent) {
    // 1. Pan with Middle Mouse (1), Right Click (2), or Space + Left Click (0)
    if (e.button === 1 || e.button === 2 || (isSpacePressed && e.button === 0)) {
      e.preventDefault();
      isPanning = true;
      panStartScreen = { x: e.clientX, y: e.clientY };
      initialPan = { x: panX, y: panY };
      if (containerEl) containerEl.setPointerCapture(e.pointerId);
      return;
    }

    const worldPos = screenToWorld(e.clientX, e.clientY);

    // 2. 3x3 Calibration Drag with Left Click (0)
    if (isCalibrating && e.button === 0) {
      e.preventDefault();
      calibStartWorld = worldPos;
      calibCurrentWorld = worldPos;
      isDraggingCalibration = true;
      if (containerEl) containerEl.setPointerCapture(e.pointerId);
      return;
    }

    // 3. Rotation Handle Drag
    if (tokenStore.selectedToken && isOverRotationHandle(tokenStore.selectedToken, worldPos.x, worldPos.y)) {
      e.preventDefault();
      isRotatingToken = true;
      rotatingTokenId = tokenStore.selectedToken.id;
      if (containerEl) containerEl.setPointerCapture(e.pointerId);
      return;
    }

    // 4. Token Selection & Dragging
    const clickedToken = findTokenAtWorldPos(worldPos.x, worldPos.y);
    if (clickedToken && e.button === 0) {
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

    // 5. Click on Empty Canvas: Deselect Token
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

    if (e.code === 'Space' && !e.repeat && !isEditingText) {
      isSpacePressed = true;
    }

    if ((e.key === 'Delete' || e.key === 'Backspace') && !isEditingText) {
      if (tokenStore.selectedTokenId) {
        tokenStore.deleteToken(tokenStore.selectedTokenId);
        showToast('Token removed from battlemat');
      }
    }

    if (e.key === 'Escape') {
      if (isCalibrating) {
        cancelCalibration();
      } else if (tokenStore.selectedTokenId) {
        tokenStore.selectToken(null);
        renderSelectionAndSnap();
      }
    }
  }

  function handleKeyUp(e: KeyboardEvent) {
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

    tokenContainer = new Container();
    worldContainer.addChild(tokenContainer);

    selectionGraphics = new Graphics();
    worldContainer.addChild(selectionGraphics);

    calibrationGraphics = new Graphics();
    worldContainer.addChild(calibrationGraphics);

    // Initial renders
    renderBackgroundMat();
    renderGrid();
    renderTokens();

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
    if (mapImageUrl && mapImageUrl !== '') {
      loadMapImage(mapImageUrl);
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

  <!-- ── Selected Token Inspector HUD Component ────────────────────────────── -->
  <TokenLayer gridSize={gridSize} />

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
