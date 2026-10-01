<script lang="ts">
  // TacticalCanvasContainer.svelte — Pan/zoom HTML5 2D canvas battle mat
  // No external renderer dependency. Works entirely with the Canvas 2D API.

  import { onMount, onDestroy } from 'svelte';
  import { parseDungeonScrawl, toggleDoorState, hitTestDoor, type WallSegment, type DoorPrimitive, type DungeonScrawlParsedMap } from '../../canvas/parsers/dungeonScrawlParser';
  import { parseWatabouGeoJson, hitTestBuildingParcel, assignParcelEntity, type WatabouCityMap, type BuildingParcel, type SettlementEntityType } from '../../canvas/parsers/watabouParser';
  import {
    renderDynamicLighting,
    renderExploredFogOfWar,
    renderWallSegments,
    renderDoors,
    renderWatabouDistricts,
    PointLight,
    type VisionSource,
  } from '../../canvas/LightShadowRenderer';
  import MapImportModal from './MapImportModal.svelte';
  import {
    executeLayerStackRender,
    type LayerStackRenderContext,
    type OverheadTile,
    type DmSecretItem,
    type DrawingShape
  } from '../../canvas/layerStack';
  import { canvasStore, type CanvasToken, type SpellAoeTemplate, type SpellAoeType } from '../../../stores/canvasStore.svelte';
  import {
    renderAoeTemplateOnCanvas,
    renderRulerOnCanvas,
    calculateGridDistanceFeet,
  } from '../map/MeasurementTool';
  import { snapToHex, hexAxialToPixel, snapByGridType } from '../../canvas/gridCalculations';
  import { findPath, type PathWaypoint } from '../../canvas/pathfindingEngine';
  import { wallsToLineSegments } from '../../canvas/raycastVisionEngine';
  import { globalSpatialIndex } from '../../canvas/spatialIndex';
  import {
    renderConditionRingsOnCanvas,
    renderTurnReticleOnCanvas,
    renderTargetingReticleOnCanvas,
  } from '../map/TokenOverlay';
  import { targetingStore } from '../../stores/targetingStore.svelte';
  import GeneratorDrawer from '../map/GeneratorDrawer.svelte';
  import GridCalibrationModal from '../map/GridCalibrationModal.svelte';
  import { mapLayers } from '../../stores/mapLayerStore.svelte';
  import CanvasDrawingToolbar, { type DrawTool } from '../map/CanvasDrawingToolbar.svelte';
  import { chatStore } from '../../stores/chatStore.svelte';
  import { importDungeonScrawlFile } from '../../importers/dungeonScrawlImporter';
  import { initDmSyncListener, cleanupDmSyncListener, broadcastBattlematUpdate } from '../../services/battlematSyncBridge';
  import { pushMapToBattlemat } from '../../services/mapDispatchService';
  import { mapsDb } from '../../db/mapsDb';
  import { WeatherCanvasRenderer } from '../../canvas/weatherCanvasRenderer';
  import SceneEnvironmentWidget from '../dm/SceneEnvironmentWidget.svelte';
  import type { WeatherType } from '../../types/maps';
  import { isTypingInInput } from '../../services/keyboardShortcuts';
  import { broadcastPingPoint } from './PingLayer.svelte';
  import { VideoBackgroundRenderer } from '../../canvas/VideoBackgroundRenderer';

  export interface MapToken {
    id: string;
    name: string;
    x: number;        // grid column (0-indexed)
    y: number;        // grid row (0-indexed)
    color: string;
    isPlayer: boolean;
    hp: number;
    maxHp: number;
    size?: number;    // 1=Medium/Small, 2=Large, 3=Huge, 4=Gargantuan
    ac?: number;
  }

  // ── Props ──────────────────────────────────────────────────────────────────
  let {
    tokens = $bindable<MapToken[]>([]),
    onTokenMove,
  }: {
    tokens?: MapToken[];
    onTokenMove?: (id: string, gx: number, gy: number) => void;
  } = $props();

  // ── Canvas refs & context ──────────────────────────────────────────────────
  let canvasEl = $state<HTMLCanvasElement | null>(null);
  let ctx: CanvasRenderingContext2D | null = null;
  let weatherCanvasEl = $state<HTMLCanvasElement | null>(null);
  let weatherRenderer: WeatherCanvasRenderer | null = null;
  let ingestionWorker: Worker | null = null;
  let heightmapWorker: Worker | null = null;

  // ── Map settings ───────────────────────────────────────────────────────────
  let gridSize     = $state(60);     // px per cell
  let gridOpacity  = $state(0.35);
  let gridSnap     = $state(true);
  let gridType     = $state<'square' | 'hex_pointy' | 'hex_flat'>('square');
  let mapImageUrl  = $state('');
  let mapImageInput = $state('');
  let mapImg: HTMLImageElement | null = null;
  // Animated video battlemap renderer (Phase 9/14)
  let videoRenderer: VideoBackgroundRenderer | null = null;
  let videoFrameCanvas: HTMLCanvasElement | null = null;
  let videoFrameCtx: CanvasRenderingContext2D | null = null;
  let showSettings = $state(false);

  // ── Vector Map & Lighting State ───────────────────────────────────────────
  let walls = $state<WallSegment[]>([]);
  let doors = $state<DoorPrimitive[]>([]);
  let cityMap = $state<WatabouCityMap | null>(null);
  let selectedParcel = $state<BuildingParcel | null>(null);
  let showImportModal = $state(false);
  let dynamicLightingEnabled = $state(true);
  let wallVisibilityEnabled = $state(true);

  // ── Tactical Battlemap Store Linkage ───────────────────────────────────────
  let availableTacticalMaps = $state<{ id: string; name: string }[]>([]);
  let activeBattlemapId = $state<string>('');

  async function reloadTacticalMapsList() {
    try {
      const list = await mapsDb.tacticalMaps.toArray();
      availableTacticalMaps = list.map((m) => ({ id: m.id, name: m.name }));
      const storedId = typeof localStorage !== 'undefined' ? localStorage.getItem('vtt_active_battlemap_id') : null;
      if (storedId && list.some((m) => m.id === storedId)) {
        activeBattlemapId = storedId;
      } else if (list.length > 0 && !activeBattlemapId) {
        activeBattlemapId = list[0].id;
      }
    } catch {
      availableTacticalMaps = [];
    }
  }

  async function handleSelectMap(e: Event) {
    const targetId = (e.target as HTMLSelectElement).value;
    if (!targetId) return;
    activeBattlemapId = targetId;
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('vtt_active_battlemap_id', targetId);
    }
    const selected = await mapsDb.tacticalMaps.get(targetId);
    if (selected) {
      if (selected.textureBlob) {
        const url = URL.createObjectURL(selected.textureBlob);
        loadMapFromUrl(url);
      }
      gridSize = selected.grid?.sizePx || 60;
      gridOpacity = selected.grid?.opacity ?? 0.35;
      walls = selected.walls.map((w) => ({
        id: w.id,
        x1: w.p1.x,
        y1: w.p1.y,
        x2: w.p2.x,
        y2: w.p2.y,
      }));
      canvasStore.setWallsAndDoors(walls, []);
    }
  }

  // ── Tactical Operational Tools ─────────────────────────────────────────────
  let activeTool = $state<'select' | 'ruler' | 'circle' | 'cone' | 'cube' | 'line'>('select');
  let activeDrawingTool = $state<DrawTool>('select');
  let showGridCalibration = $state(false);
  let showFloorLayersDrawer = $state(false);
  let showFogVisionPanel = $state(false);

  function toggleVisionFogMode() {
    showFogVisionPanel = !showFogVisionPanel;
    if (showFogVisionPanel) {
      activeDrawingTool = 'fog_carve';
      activeTool = 'select';
    } else {
      activeDrawingTool = 'select';
    }
  }

  function handleContextTool(e: Event) {
    const detail = (e as CustomEvent<{ tool: string; active?: boolean }>).detail;
    if (!detail) return;
    if (detail.tool === 'ruler') {
      activeTool = 'ruler';
    } else if (detail.tool === 'grid') {
      showGridCalibration = true;
    } else if (detail.tool === 'fog') {
      toggleVisionFogMode();
    } else if (detail.tool === 'layers') {
      showFloorLayersDrawer = !showFloorLayersDrawer;
    }
  }

  function handleOpenGridCalibration() {
    showGridCalibration = true;
  }
  let aoePublic = $state(true);
  let rulerStart = $state<{ gx: number; gy: number } | null>(null);
  let animTime = $state(0);

  // ── Viewport transform ─────────────────────────────────────────────────────
  let vpX    = $state(0);   // pan offset px
  let vpY    = $state(0);
  let vpZoom = $state(1.0); // 0.25 – 4.0

  // ── Interaction state ──────────────────────────────────────────────────────
  let isPanning     = $state(false);
  let panStart      = { x: 0, y: 0, ox: 0, oy: 0 };
  let draggingToken = $state<MapToken | null>(null);
  let dragOffsetGrid = { dx: 0, dy: 0 };
  let dragCurrentGrid = $state<{ gx: number; gy: number } | null>(null);
  let activeDragPath = $state<PathWaypoint[]>([]);
  let isPathModifierActive = $state(false);
  let hoveredCell   = $state<{ gx: number; gy: number } | null>(null);

  // ── Spawn panel ────────────────────────────────────────────────────────────
  let showSpawnPanel = $state(false);
  let spawnName      = $state('');
  let spawnColor     = $state('#6366f1');
  let spawnIsPlayer  = $state(false);
  let spawnHp        = $state(20);
  let spawnGx        = $state(0);
  let spawnGy        = $state(0);

  // ── Generator Drawer ───────────────────────────────────────────────────────
  let showGeneratorDrawer = $state(false);
  let dsImportFeedback = $state<string | null>(null);

  // ── Render loop ────────────────────────────────────────────────────────────
  let rafId = 0;

  function render() {
    if (!ctx || !canvasEl) return;
    const renderCtx = ctx;
    const w = canvasEl.width;
    const h = canvasEl.height;

    renderCtx.clearRect(0, 0, w, h);
    renderCtx.save();
    renderCtx.translate(vpX, vpY);
    renderCtx.scale(vpZoom, vpZoom);

    // Background
    renderCtx.fillStyle = '#0d0f1a';
    renderCtx.fillRect(-vpX / vpZoom, -vpY / vpZoom, w / vpZoom, h / vpZoom);

    // AABB Viewport Frustum Bounds in world space (with 2-cell buffer padding)
    const frustumPadding = gridSize * 2;
    const frustumMinX = -vpX / vpZoom - frustumPadding;
    const frustumMinY = -vpY / vpZoom - frustumPadding;
    const frustumMaxX = (-vpX + w) / vpZoom + frustumPadding;
    const frustumMaxY = (-vpY + h) / vpZoom + frustumPadding;

    const layerRenderContext: LayerStackRenderContext = {
      ctx: renderCtx,
      viewport: { x: vpX, y: vpY, zoom: vpZoom },
      canvasWidth: w,
      canvasHeight: h,
      isDm: true,
      gridSize,
      gridOpacity,
      gridColor: `rgba(99, 102, 241, ${gridOpacity})`,
      gridType: gridType === 'hex_pointy' ? 'hex-v' : gridType === 'hex_flat' ? 'hex-h' : 'square',
      mapImage: (() => {
        // Prefer live video frame over static image
        if (videoRenderer?.isPlaying() && videoFrameCanvas && videoFrameCtx) {
          videoRenderer.renderToCanvas2D(videoFrameCtx, 0, 0, videoFrameCanvas.width, videoFrameCanvas.height);
          return videoFrameCanvas as unknown as HTMLImageElement;
        }
        return mapImg?.complete && mapImg.naturalWidth > 0 ? mapImg : null;
      })(),
      tokens: canvasStore.tokens.length > 0 ? canvasStore.tokens : tokens.map(t => ({
        id: t.id,
        name: t.name,
        x: t.x,
        y: t.y,
        color: t.color,
        isPlayer: t.isPlayer,
        hp: t.hp,
        maxHp: t.maxHp,
        isVisible: true,
        conditions: [],
        isOrbSealed: false,
        sizeInCells: t.size || 1,
        sightRadiusFeet: 30,
      })),
      overheadTiles: [],
      dmSecrets: [],
      drawings: [],
      weather: {
        type: 'none',
        intensity: 0,
        speed: 1,
      },
      timeMs: performance.now(),
    };

    executeLayerStackRender(layerRenderContext, () => {
      // Watabou City Districts, Walls & Parcels
      if (cityMap) {
        renderWatabouDistricts(renderCtx, cityMap, selectedParcel?.id, vpZoom);
      }

      // Dungeon Scrawl Walls
      if (wallVisibilityEnabled && walls.length > 0) {
        renderWallSegments(renderCtx, walls, vpZoom);
      }

      // Dungeon Scrawl Doors
      if (doors.length > 0) {
        renderDoors(renderCtx, doors, vpZoom);
      }

      // 2D Raycast Dynamic Lighting & Shadows
      if (dynamicLightingEnabled && (walls.length > 0 || doors.length > 0 || tokens.length > 0)) {
        const viewBounds = {
          x: -vpX / vpZoom,
          y: -vpY / vpZoom,
          width: w / vpZoom,
          height: h / vpZoom,
        };

        // Connect token movement coordinates directly to point light vision sources
        const activeMovingTok = draggingToken && dragCurrentGrid ? {
          id: draggingToken.id,
          x: (dragCurrentGrid.gx + 0.5) * gridSize,
          y: (dragCurrentGrid.gy + 0.5) * gridSize,
          radius: gridSize * 5,
          color: draggingToken.isPlayer ? 'rgba(251, 191, 36, 0.25)' : 'rgba(239, 68, 68, 0.2)',
        } : null;

        const visionSources: VisionSource[] = tokens.map(t => {
          if (activeMovingTok && t.id === activeMovingTok.id) {
            return activeMovingTok;
          }
          const ptLight = new PointLight({
            id: t.id,
            x: t.x * gridSize + gridSize / 2,
            y: t.y * gridSize + gridSize / 2,
            radius: gridSize * 5,
            color: t.isPlayer ? 'rgba(251, 191, 36, 0.2)' : 'rgba(239, 68, 68, 0.15)',
            attenuation: 1.5,
          });
          return ptLight.toVisionSource();
        });

        // Merge imported UVTT/map point-light emitters into the vision pass
        for (const sceneLight of canvasStore.sceneLights) {
          const ptLight = new PointLight({
            id: sceneLight.id,
            x: sceneLight.x,
            y: sceneLight.y,
            radius: sceneLight.radius,
            color: sceneLight.color,
            intensity: sceneLight.intensity,
            attenuation: 1.8,
          });
          visionSources.push(ptLight.toVisionSource());
        }

        if (visionSources.length === 0 && walls.length > 0) {
          const ambientLight = new PointLight({
            id: 'ambient-explorer-light',
            x: gridSize * 3,
            y: gridSize * 3,
            radius: gridSize * 6,
            color: 'rgba(251, 191, 36, 0.25)',
            attenuation: 1.2,
          });
          visionSources.push(ambientLight.toVisionSource());
        }

        if (canvasStore.fogExplored.length > 0) {
          renderExploredFogOfWar(
            renderCtx,
            viewBounds,
            visionSources,
            walls,
            doors,
            canvasStore.fogExplored,
            gridSize,
            0.98,
            0.72
          );
        } else {
          renderDynamicLighting(renderCtx, viewBounds, visionSources, walls, doors, 0.65);
        }
      }

      // Hovered cell highlight
      if (hoveredCell && !isPanning) {
        renderCtx.fillStyle = 'rgba(99,102,241,0.08)';
        renderCtx.fillRect(hoveredCell.gx * gridSize, hoveredCell.gy * gridSize, gridSize, gridSize);
      }

      // Public & Private Spell AOE Overlays
      for (const aoe of canvasStore.aoeTemplates) {
        renderAoeTemplateOnCanvas(renderCtx, aoe, gridSize, gridType);
      }

      // Active Vector Ruler Measurement
      if (canvasStore.ruler) {
        renderRulerOnCanvas(renderCtx, canvasStore.ruler, gridSize);
      }

      // Drag ghost & A* Path Ribbon
      if (draggingToken && dragCurrentGrid) {
        // Draw A* Path Ribbon when Shift modifier is active or path exists
        if (activeDragPath.length > 1) {
          renderCtx.save();
          renderCtx.beginPath();
          renderCtx.strokeStyle = '#38bdf8';
          renderCtx.lineWidth = 3 / vpZoom;
          renderCtx.setLineDash([8 / vpZoom, 4 / vpZoom]);

          for (let i = 0; i < activeDragPath.length; i++) {
            const wp = activeDragPath[i];
            const px = (wp.gx + 0.5) * gridSize;
            const py = (wp.gy + 0.5) * gridSize;
            if (i === 0) renderCtx.moveTo(px, py);
            else renderCtx.lineTo(px, py);
          }
          renderCtx.stroke();
          renderCtx.setLineDash([]);

          // Draw Waypoint nodes and cumulative distance badges
          for (let i = 0; i < activeDragPath.length; i++) {
            const wp = activeDragPath[i];
            const px = (wp.gx + 0.5) * gridSize;
            const py = (wp.gy + 0.5) * gridSize;

            renderCtx.beginPath();
            renderCtx.arc(px, py, 4 / vpZoom, 0, Math.PI * 2);
            renderCtx.fillStyle = i === activeDragPath.length - 1 ? '#22c55e' : '#38bdf8';
            renderCtx.fill();

            // Total distance badge at final waypoint
            if (i === activeDragPath.length - 1 && wp.costFeet > 0) {
              renderCtx.font = `bold ${Math.max(10, gridSize * 0.22)}px sans-serif`;
              renderCtx.fillStyle = '#0f172a';
              const text = `${wp.costFeet} ft`;
              const textWidth = renderCtx.measureText(text).width;
              renderCtx.fillRect(px - textWidth / 2 - 4, py - 20, textWidth + 8, 16);
              renderCtx.fillStyle = '#38bdf8';
              renderCtx.textAlign = 'center';
              renderCtx.textBaseline = 'middle';
              renderCtx.fillText(text, px, py - 12);
            }
          }
          renderCtx.restore();
        }

        renderCtx.globalAlpha = 0.4;
        renderCtx.fillStyle = draggingToken.color;
        const pad = gridSize * 0.1;
        renderCtx.beginPath();
        renderCtx.roundRect(dragCurrentGrid.gx * gridSize + pad, dragCurrentGrid.gy * gridSize + pad, gridSize - pad * 2, gridSize - pad * 2, 6);
        renderCtx.fill();
        renderCtx.globalAlpha = 1;
      }

      // Active Turn Reticle (Rendered beneath active token)
      if (canvasStore.activeTokenId) {
        const activeTok = tokens.find(t => t.id === canvasStore.activeTokenId);
        if (activeTok) {
          const cx = (activeTok.x + 0.5) * gridSize;
          const cy = (activeTok.y + 0.5) * gridSize;
          const radius = (gridSize * 0.45);
          renderTurnReticleOnCanvas(renderCtx, cx, cy, radius, animTime);
        }
      }

      // Active Combat Target Reticle (Rendered around currently targeted token)
      if (targetingStore.activeTargetTokenId) {
        const targetTok = tokens.find(t => t.id === targetingStore.activeTargetTokenId);
        if (targetTok) {
          const cx = (targetTok.x + 0.5) * gridSize;
          const cy = (targetTok.y + 0.5) * gridSize;
          const radius = (gridSize * 0.45);
          renderTargetingReticleOnCanvas(renderCtx, cx, cy, radius, animTime);
        }
      }

      // Tokens with AABB Viewport Frustum Culling
      for (const tok of tokens) {
        if (draggingToken?.id === tok.id) continue; // skip — drawn as ghost
        const tokSize = (tok.size || 1) * gridSize;
        const tokMinX = tok.x * gridSize;
        const tokMinY = tok.y * gridSize;
        const tokMaxX = tokMinX + tokSize;
        const tokMaxY = tokMinY + tokSize;

        // Skip tokens whose AABB falls completely outside the padded viewport frustum
        if (
          tokMaxX < frustumMinX ||
          tokMinX > frustumMaxX ||
          tokMaxY < frustumMinY ||
          tokMinY > frustumMaxY
        ) {
          continue;
        }

        drawToken(renderCtx, tok);
      }
    });

    renderCtx.restore();
    animTime = performance.now() / 1000;
    rafId = requestAnimationFrame(render);
  }

  function drawToken(c: CanvasRenderingContext2D, tok: MapToken) {
    const pad = gridSize * 0.1;
    const tokScale = tok.size || 1;
    let cx: number;
    let cy: number;
    let size: number;
    let radius: number;
    let x: number;
    let y: number;

    if (gridType === 'hex_pointy') {
      const hexRadius = gridSize / Math.sqrt(3);
      const center = hexAxialToPixel(tok.x, tok.y, hexRadius, 'pointy');
      cx = center.x;
      cy = center.y;
      size = gridSize * tokScale - pad * 2;
      radius = size / 2;
      x = cx - size / 2;
      y = cy - size / 2;
    } else if (gridType === 'hex_flat') {
      const hexRadius = gridSize / Math.sqrt(3);
      const center = hexAxialToPixel(tok.x, tok.y, hexRadius, 'flat');
      cx = center.x;
      cy = center.y;
      size = gridSize * tokScale - pad * 2;
      radius = size / 2;
      x = cx - size / 2;
      y = cy - size / 2;
    } else {
      x = tok.x * gridSize + pad;
      y = tok.y * gridSize + pad;
      size = gridSize * tokScale - pad * 2;
      cx = x + size / 2;
      cy = y + size / 2;
      radius = size / 2;
    }

    const storeTok = canvasStore.tokens.find(t => t.id === tok.id);

    // Condition Rings
    if (storeTok && storeTok.conditions && storeTok.conditions.length > 0) {
      renderConditionRingsOnCanvas(c, cx, cy, radius, storeTok.conditions, animTime);
    }

    // Black Orb Sealed State
    if (storeTok?.isOrbSealed) {
      c.save();
      c.beginPath();
      c.arc(cx, cy, radius, 0, Math.PI * 2);
      c.fillStyle = '#1e1b4b';
      c.fill();
      c.strokeStyle = '#a855f7';
      c.lineWidth = 2.5 / vpZoom;
      c.stroke();
      c.font = `bold ${Math.max(12, gridSize * 0.28)}px sans-serif`;
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillText('🔮', cx, cy);
      c.restore();
      return;
    }

    // Token body
    c.fillStyle = tok.color;
    c.beginPath();
    c.roundRect(x, y, size, size, 6);
    c.fill();

    // Border
    c.strokeStyle = tok.isPlayer ? '#fbbf24' : '#ef4444';
    c.lineWidth = 1.5 / vpZoom;
    c.stroke();

    // HP bar
    const barH = Math.max(3, gridSize * 0.07);
    const barY = y + size - barH;
    c.fillStyle = 'rgba(0,0,0,0.5)';
    c.fillRect(x, barY, size, barH);
    const pct = Math.max(0, Math.min(1, tok.hp / tok.maxHp));
    c.fillStyle = pct < 0.25 ? '#ef4444' : pct < 0.5 ? '#f59e0b' : '#22c55e';
    c.fillRect(x, barY, size * pct, barH);

    // Name label
    c.fillStyle = '#fff';
    c.font = `bold ${Math.max(8, gridSize * 0.18)}px sans-serif`;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText(tok.name.slice(0, 2).toUpperCase(), cx, y + size * 0.44, size - 4);
  }

  // ── Coordinate helpers ─────────────────────────────────────────────────────
  function screenToWorld(sx: number, sy: number): { wx: number; wy: number } {
    if (!canvasEl) return { wx: 0, wy: 0 };
    const rect = canvasEl.getBoundingClientRect();
    return {
      wx: (sx - rect.left - vpX) / vpZoom,
      wy: (sy - rect.top  - vpY) / vpZoom,
    };
  }

  function worldToGrid(wx: number, wy: number) {
    const snap = snapByGridType(wx, wy, gridSize, gridType, false);
    return { gx: snap.gx, gy: snap.gy };
  }

  function tokenAt(gx: number, gy: number): MapToken | undefined {
    return tokens.find(t => {
      const s = t.size || 1;
      return gx >= t.x && gx < t.x + s && gy >= t.y && gy < t.y + s;
    });
  }

  // ── Resize observer ────────────────────────────────────────────────────────
  let resizeObserver: ResizeObserver | null = null;

  function syncCanvasSize() {
    if (!canvasEl) return;
    const { clientWidth: w, clientHeight: h } = canvasEl.parentElement!;
    if (canvasEl.width !== w || canvasEl.height !== h) {
      canvasEl.width  = w;
      canvasEl.height = h;
    }
    if (weatherCanvasEl && (weatherCanvasEl.width !== w || weatherCanvasEl.height !== h)) {
      weatherCanvasEl.width = w;
      weatherCanvasEl.height = h;
    }
  }

  function handleWeatherChangedEvent(e: Event) {
    const detail = (e as CustomEvent<{ type: WeatherType; intensity: number }>).detail;
    if (detail && weatherRenderer) {
      weatherRenderer.setWeatherPreset(detail.type, detail.intensity);
    }
  }

  // ── Event handlers ─────────────────────────────────────────────────────────
  function handleWheel(e: WheelEvent) {
    e.preventDefault();
    const { wx, wy } = screenToWorld(e.clientX, e.clientY);
    const factor = e.deltaY < 0 ? 1.1 : 0.9;
    vpZoom = Math.max(0.25, Math.min(4, vpZoom * factor));
    // Zoom toward cursor
    vpX = e.clientX - canvasEl!.getBoundingClientRect().left - wx * vpZoom;
    vpY = e.clientY - canvasEl!.getBoundingClientRect().top  - wy * vpZoom;
    canvasStore.setDmViewport({ x: vpX, y: vpY, zoom: vpZoom });
    broadcastBattlematUpdate({
      type: 'VIEWPORT_UPDATE',
      x: vpX,
      y: vpY,
      zoom: vpZoom,
    });
  }

  function handleMouseDown(e: MouseEvent) {
    // 0. Alt + Left Click = Pointer Ping Broadcast
    if (e.altKey && e.button === 0) {
      e.preventDefault();
      const { wx, wy } = screenToWorld(e.clientX, e.clientY);
      broadcastPingPoint({
        x: wx,
        y: wy,
        color: '#f59e0b',
        sender_name: 'DM',
      });
      return;
    }

    // Middle mouse or Space+Left = pan
    if (e.button === 1 || (e.button === 0 && spaceDown)) {
      isPanning = true;
      panStart = { x: e.clientX, y: e.clientY, ox: vpX, oy: vpY };
      window.addEventListener('mousemove', handleWindowMouseMove);
      window.addEventListener('mouseup', handleWindowMouseUp);
      return;
    }

    // Left click = tool action, drag token, toggle door, or inspect building parcel
    if (e.button === 0) {
      const { wx, wy } = screenToWorld(e.clientX, e.clientY);
      const { gx, gy } = worldToGrid(wx, wy);

      // 1. Vector Ruler Measurement
      if (activeTool === 'ruler') {
        rulerStart = { gx, gy };
        canvasStore.setRuler({
          id: `ruler-${Date.now()}`,
          startX: gx,
          startY: gy,
          endX: gx,
          endY: gy,
          distanceFeet: 0,
          isPublic: aoePublic,
          color: '#38bdf8',
        });
        return;
      }

      // 2. Spell AOE Template Placement
      if (['circle', 'cone', 'cube', 'line'].includes(activeTool)) {
        const sizeMap: Record<string, number> = { circle: 20, cone: 15, cube: 20, line: 30 };
        const labelMap: Record<string, string> = {
          circle: 'Sphere (20 ft)',
          cone: 'Cone (15 ft)',
          cube: 'Cube (20 ft)',
          line: 'Line (30 ft)',
        };
        const colorMap: Record<string, string> = {
          circle: 'rgba(239, 68, 68, 0.35)',
          cone: 'rgba(245, 158, 11, 0.35)',
          cube: 'rgba(168, 85, 247, 0.35)',
          line: 'rgba(56, 189, 248, 0.35)',
        };
        const template: SpellAoeTemplate = {
          id: `aoe-${Date.now()}`,
          type: activeTool as SpellAoeType,
          originX: gx,
          originY: gy,
          targetX: gx + (activeTool === 'cone' || activeTool === 'line' ? 3 : 0),
          targetY: gy,
          sizeFeet: sizeMap[activeTool] || 20,
          color: colorMap[activeTool] || 'rgba(239, 68, 68, 0.35)',
          label: labelMap[activeTool] || 'Spell AOE',
          isPublic: aoePublic,
        };
        canvasStore.addAoeTemplate(template);
        activeTool = 'select'; // Revert to select after placement
        return;
      }

      // 3. Door click hit-test
      const clickedDoor = hitTestDoor(doors, wx, wy, 18 / vpZoom);
      if (clickedDoor) {
        doors = toggleDoorState(doors, clickedDoor.id);
        canvasStore.toggleDoor(clickedDoor.id);
        const updated = doors.find(d => d.id === clickedDoor.id);
        const isClosed = updated ? updated.state === 'CLOSED' : false;
        globalSpatialIndex.updateCollider(clickedDoor.id, {
          minX: Math.min(clickedDoor.x1, clickedDoor.x2),
          minY: Math.min(clickedDoor.y1, clickedDoor.y2),
          maxX: Math.max(clickedDoor.x1, clickedDoor.x2),
          maxY: Math.max(clickedDoor.y1, clickedDoor.y2),
        }, 'door', isClosed, updated);
        return;
      }

      // 4. Watabou building parcel hit-test
      if (cityMap) {
        const clickedParcel = hitTestBuildingParcel(cityMap.buildings, wx, wy);
        if (clickedParcel) {
          selectedParcel = clickedParcel;
          showImportModal = true;
          return;
        }
      }

      // Strict Interaction Layer Masking (Roll20 / Foundry pattern):
      // When active tool is wall, ruler, fog, or template: disable token click/drag listeners
      // so clicks and drags never accidentally select or move tokens while drawing or measuring.
      const isDrawingOrMeasuring =
        ['circle', 'cone', 'cube', 'line'].includes(activeTool) ||
        ['wall_line', 'wall_polygon', 'fog_carve', 'fog_conceal', 'brush', 'ruler'].includes(activeDrawingTool);

      if (isDrawingOrMeasuring) {
        return;
      }

      // 5. Token drag and active turn reticle selection (only when select/pan is active)
      const tok = tokenAt(gx, gy);
      if (tok) {
        draggingToken = tok;
        dragOffsetGrid = { dx: gx - tok.x, dy: gy - tok.y };
        dragCurrentGrid = { gx: tok.x, gy: tok.y };
        canvasStore.setActiveToken(tok.id);
      } else {
        canvasStore.setActiveToken(null);
      }
    }
  }

  function handleMouseMove(e: MouseEvent) {
    if (!canvasEl) return;
    const { wx, wy } = screenToWorld(e.clientX, e.clientY);
    const { gx, gy } = worldToGrid(wx, wy);
    hoveredCell = { gx, gy };

    if (isPanning) {
      vpX = panStart.ox + (e.clientX - panStart.x);
      vpY = panStart.oy + (e.clientY - panStart.y);
      canvasStore.setDmViewport({ x: vpX, y: vpY, zoom: vpZoom });
      return;
    }

    if (activeTool === 'ruler' && rulerStart) {
      const { distanceFeet } = calculateGridDistanceFeet(rulerStart, { gx, gy });
      canvasStore.setRuler({
        id: 'active-ruler',
        startX: rulerStart.gx,
        startY: rulerStart.gy,
        endX: gx,
        endY: gy,
        distanceFeet,
        isPublic: aoePublic,
        color: '#38bdf8',
      });
      return;
    }

    if (draggingToken) {
      dragCurrentGrid = { gx, gy };
      isPathModifierActive = true;

      // Update token position in spatial index during drag
      const tokSize = (draggingToken.size || 1) * gridSize;
      globalSpatialIndex.updateToken(draggingToken.id, {
        minX: gx * gridSize,
        minY: gy * gridSize,
        maxX: gx * gridSize + tokSize,
        maxY: gy * gridSize + tokSize,
      }, draggingToken);

      // Live A* path calculation avoiding wall and closed door colliders
      const segs = wallsToLineSegments(walls);
      const mapW = canvasEl.width || 1920;
      const mapH = canvasEl.height || 1080;
      const cols = Math.max(50, Math.ceil(mapW / gridSize) + 10);
      const rows = Math.max(50, Math.ceil(mapH / gridSize) + 10);

      activeDragPath = findPath(
        { gx: draggingToken.x, gy: draggingToken.y },
        { gx, gy },
        {
          cols,
          rows,
          gridSize,
          allowDiagonal: true,
          diagonal5105: true,
          walls: segs,
          tokenSizeCells: draggingToken.size || 1,
        }
      );
    }
  }

  function handleWindowMouseMove(e: MouseEvent) {
    if (!isPanning) return;
    vpX = panStart.ox + (e.clientX - panStart.x);
    vpY = panStart.oy + (e.clientY - panStart.y);
    canvasStore.setDmViewport({ x: vpX, y: vpY, zoom: vpZoom });
    broadcastBattlematUpdate({
      type: 'VIEWPORT_UPDATE',
      x: vpX,
      y: vpY,
      zoom: vpZoom,
    });
  }

  function handleWindowMouseUp(e: MouseEvent) {
    if (isPanning) {
      isPanning = false;
      window.removeEventListener('mousemove', handleWindowMouseMove);
      window.removeEventListener('mouseup', handleWindowMouseUp);
    }
  }

  function handleToggleFogTool() {
    toggleVisionFogMode();
  }

  function handleTriggerPing() {
    if (!canvasEl) return;
    const rect = canvasEl.getBoundingClientRect();
    const { wx, wy } = screenToWorld(rect.left + rect.width / 2, rect.top + rect.height / 2);
    const { gx, gy } = worldToGrid(wx, wy);
    broadcastPingPoint({ x: gx, y: gy });
  }

  function handleMouseUp(e: MouseEvent) {
    if (isPanning) {
      isPanning = false;
      window.removeEventListener('mousemove', handleWindowMouseMove);
      window.removeEventListener('mouseup', handleWindowMouseUp);
      return;
    }

    if (activeTool === 'ruler') {
      rulerStart = null;
    }

    if (draggingToken && dragCurrentGrid) {
      const movedTokId = draggingToken.id;
      const targetGx = dragCurrentGrid.gx;
      const targetGy = dragCurrentGrid.gy;

      if (activeDragPath.length > 1) {
        // Sequential Waypoint Traversal: animate through waypoints and update fog iteratively
        const waypointsCopy = [...activeDragPath];
        let stepIdx = 0;

        const stepTraversal = () => {
          if (stepIdx >= waypointsCopy.length) {
            tokens = tokens.map(t =>
              t.id === movedTokId ? { ...t, x: targetGx, y: targetGy } : t
            );
            canvasStore.moveToken(movedTokId, targetGx, targetGy);
            broadcastBattlematUpdate({
              type: 'TOKEN_MOVE',
              tokenId: movedTokId,
              x: targetGx,
              y: targetGy,
            });
            onTokenMove?.(movedTokId, targetGx, targetGy);
            return;
          }

          const wp = waypointsCopy[stepIdx];
          tokens = tokens.map(t =>
            t.id === movedTokId ? { ...t, x: wp.gx, y: wp.gy } : t
          );
          canvasStore.moveToken(movedTokId, wp.gx, wp.gy);
          canvasStore.revealFogAt(wp.gx, wp.gy);

          stepIdx++;
          if (stepIdx < waypointsCopy.length) {
            setTimeout(stepTraversal, 50);
          } else {
            onTokenMove?.(movedTokId, targetGx, targetGy);
          }
        };

        stepTraversal();
      } else {
        tokens = tokens.map(t =>
          t.id === movedTokId ? { ...t, x: targetGx, y: targetGy } : t
        );
        canvasStore.moveToken(movedTokId, targetGx, targetGy);
        broadcastBattlematUpdate({
          type: 'TOKEN_MOVE',
          tokenId: movedTokId,
          x: targetGx,
          y: targetGy,
        });
        onTokenMove?.(movedTokId, targetGx, targetGy);
      }
    }
    draggingToken = null;
    dragCurrentGrid = null;
    activeDragPath = [];
    isPathModifierActive = false;
  }

  let spaceDown = $state(false);
  function handleKeyDown(e: KeyboardEvent) {
    // If active in an input/textarea/contenteditable, ignore hotkeys
    if (isTypingInInput(e.target)) {
      return;
    }

    if (e.code === 'Space' && e.target === document.body) {
      e.preventDefault();
      spaceDown = true;
    }

    // Hotkey 'T': Toggle targeting on hovered token or active token
    if (e.key === 't' || e.key === 'T') {
      let targetTok: MapToken | undefined;
      if (hoveredCell) {
        targetTok = tokenAt(hoveredCell.gx, hoveredCell.gy);
      }
      if (targetTok) {
        targetingStore.toggleTarget(targetTok.id);
      }
    }

    // Delete / Backspace: Remove selected or hovered token
    if (e.key === 'Delete' || e.key === 'Backspace') {
      const tokIdToDelete = canvasStore.activeTokenId || (hoveredCell ? tokenAt(hoveredCell.gx, hoveredCell.gy)?.id : null);
      if (tokIdToDelete) {
        e.preventDefault();
        tokens = tokens.filter(t => t.id !== tokIdToDelete);
        canvasStore.tokens = canvasStore.tokens.filter(t => t.id !== tokIdToDelete);
        globalSpatialIndex.remove(tokIdToDelete);
        if (canvasStore.activeTokenId === tokIdToDelete) {
          canvasStore.setActiveToken(null);
        }
        broadcastBattlematUpdate({
          type: 'SYNC_FULL_STATE',
          payload: canvasStore.getSnapshot(),
        });
      }
    }
  }

  function handleContextMenu(e: MouseEvent) {
    const { wx, wy } = screenToWorld(e.clientX, e.clientY);
    const { gx, gy } = worldToGrid(wx, wy);
    const tok = tokenAt(gx, gy);
    if (tok) {
      e.preventDefault();
      targetingStore.toggleTarget(tok.id);
    }
  }

  function handleKeyUp(e: KeyboardEvent) {
    if (e.code === 'Space') spaceDown = false;
  }

  // ── Map image loading ──────────────────────────────────────────────────────
  function loadMapFromUrl(url: string) {
    // Route animated video battlemaps through VideoBackgroundRenderer
    if (/\.(mp4|webm|ogg)([?#]|$)/i.test(url)) {
      if (!videoRenderer) videoRenderer = new VideoBackgroundRenderer();
      videoRenderer.loadVideo(url, { loop: true, muted: true }).then((el) => {
        // Ensure an off-screen canvas exists to blit video frames into mapImage
        if (!videoFrameCanvas) {
          videoFrameCanvas = document.createElement('canvas');
          videoFrameCtx = videoFrameCanvas.getContext('2d');
        }
        videoFrameCanvas.width = el.videoWidth || 1920;
        videoFrameCanvas.height = el.videoHeight || 1080;
        mapImg = null; // clear static image
        mapImageUrl = url;
      }).catch(() => {});
      return;
    }
    // Static image path
    if (videoRenderer) { videoRenderer.destroy(); videoRenderer = null; }
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      mapImg = img;
      mapImageUrl = url;
      broadcastBattlematUpdate({
        type: 'MAP_TEXTURE_UPDATE',
        url,
        width: img.naturalWidth,
        height: img.naturalHeight
      });
    };
    img.onerror = () => {};
    img.src = url;
  }

  function handleMapFileInput(e: Event) {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    loadMapFromUrl(url);
    mapImageUrl = file.name;
  }

  // ── Spawn token ────────────────────────────────────────────────────────────
  function spawnToken() {
    if (!spawnName.trim()) return;
    const id = `tok-${Date.now()}`;
    tokens = [...tokens, {
      id, name: spawnName.trim(), x: spawnGx, y: spawnGy,
      color: spawnColor, isPlayer: spawnIsPlayer, hp: spawnHp, maxHp: spawnHp,
    }];
    showSpawnPanel = false;
    spawnName = '';
  }

  function removeToken(id: string) {
    tokens = tokens.filter(t => t.id !== id);
    globalSpatialIndex.remove(id);
  }

  async function handleCastBattlemat() {
    try {
      if ('PresentationRequest' in window) {
        const presentationRequest = new (window as any).PresentationRequest(['/projector']);
        const connection = await presentationRequest.start();
        connection.addEventListener('connect', () => {
          dsImportFeedback = '✓ Battlemat connected to external display!';
          setTimeout(() => { dsImportFeedback = null; }, 3000);
        });
      } else {
        window.open('/projector', 'BattleMatProjector', 'width=1920,height=1080');
      }
    } catch (e) {
      // Fallback: Launch secondary window for projector
      window.open('/projector', 'BattleMatProjector', 'width=1920,height=1080');
    }
  }

  // ── Map Ingestion Bridge (from Atlas Hub or direct drop) ─────────────────
  let isDroppingMap = $state(false);

  function handleBattleMapEvent(e: Event) {
    const detail = (e as CustomEvent<{
      url?: string;
      dataUrl?: string;
      videoUrl?: string;
      fileName?: string;
      mapId?: string;
      gridSize?: number;
      walls?: any[];
      width?: number;
      height?: number;
    }>).detail;
    if (!detail) return;
    const targetUrl = detail.videoUrl || detail.dataUrl || detail.url;
    if (targetUrl) {
      loadMapFromUrl(targetUrl);
      if (detail.fileName) {
        mapImageUrl = detail.fileName;
        mapImageInput = detail.fileName;
      }
      if (detail.mapId) {
        activeBattlemapId = detail.mapId;
      }
      if (detail.gridSize) {
        gridSize = detail.gridSize;
      }
      if (detail.walls && detail.walls.length > 0) {
        walls = detail.walls.map((w, idx) => ({
          id: w.id || `w-${idx}`,
          x1: w.x1,
          y1: w.y1,
          x2: w.x2,
          y2: w.y2,
          blocksVision: w.blocksVision ?? w.blocksLight ?? true,
          blocksMovement: w.blocksMovement ?? true,
          isDoor: w.door || w.isDoor,
          isOpen: w.isOpen || false
        }));
      }
      vpX = 0;
      vpY = 0;
      vpZoom = 1.0;
    }
  }

  async function handleCanvasDrop(e: DragEvent) {
    e.preventDefault();
    isDroppingMap = false;

    // 0. Intercept MONSTER_TOKEN and IMAGE_ASSET drop events
    const rawData = e.dataTransfer?.getData('application/json') || e.dataTransfer?.getData('text/plain');
    if (rawData) {
      try {
        const payload = JSON.parse(rawData);

        if (payload && payload.type === 'IMAGE_ASSET') {
          if (payload.assetType === 'map') {
            loadMapFromUrl(payload.url);
            if (payload.name) {
              mapImageUrl = payload.name;
              mapImageInput = payload.name;
            }
            return;
          }

          const { wx, wy } = screenToWorld(e.clientX, e.clientY);
          const { gx, gy } = worldToGrid(wx, wy);
          const newTok: MapToken = {
            id: `tok-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
            name: payload.name || 'Token',
            x: gx,
            y: gy,
            color: '#38bdf8',
            isPlayer: false,
            hp: 15,
            maxHp: 15,
            size: 1,
            ac: 10,
          };
          tokens = [...tokens, newTok];
          return;
        }

        if (payload && (payload.type === 'MONSTER_TOKEN' || payload.monsterId)) {
          const { wx, wy } = screenToWorld(e.clientX, e.clientY);
          const { gx, gy } = worldToGrid(wx, wy);

          let tokenSize = 1;
          const s = (payload.size || '').toLowerCase();
          if (s.includes('large')) tokenSize = 2;
          else if (s.includes('huge')) tokenSize = 3;
          else if (s.includes('gargantuan')) tokenSize = 4;

          const newTok: MapToken = {
            id: `tok-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
            name: payload.name || 'Monster',
            x: gx,
            y: gy,
            color: payload.color || '#ef4444',
            isPlayer: false,
            hp: payload.hp || 20,
            maxHp: payload.hp || 20,
            size: tokenSize,
            ac: payload.ac || 10
          };
          tokens = [...tokens, newTok];

          // Persist token if active battlemap in mapsDb
          try {
            const activeId = localStorage.getItem('vtt_active_battlemap_id');
            if (activeId) {
              mapsDb.tacticalMaps.get(activeId).then((map) => {
                if (map) {
                  const updatedTokens = [...(map.tokens || []), {
                    tokenId: newTok.id,
                    x: newTok.x,
                    y: newTok.y,
                    elevationFt: 0,
                    isVisibleToPlayers: true
                  }];
                  mapsDb.tacticalMaps.update(activeId, { tokens: updatedTokens });
                }
              });
            }
          } catch (_) {}

          return;
        }
      } catch (_) {}
    }

    const files = e.dataTransfer?.files;
    if (!files || files.length === 0) return;
    const file = files[0];
    const name = file.name.toLowerCase();

    // 1. Dungeon Scrawl & Universal VTT vector map (.ds, .uvtt, .dd2vtt)
    if (name.endsWith('.ds') || name.endsWith('.uvtt') || name.endsWith('.dd2vtt')) {
      const result = await importDungeonScrawlFile(file, gridSize);
      if (result.success) {
        const text = await file.text();
        const parsed = parseDungeonScrawl(text, gridSize);
        handleLoadDungeonMap(parsed);
        canvasStore.setWallsAndDoors(parsed.walls, parsed.doors);
        dsImportFeedback = `✓ Loaded "${result.name}" — ${result.wallsCount} walls, ${result.doorsCount} doors`;
        setTimeout(() => { dsImportFeedback = null; }, 3500);
      } else {
        dsImportFeedback = `⚠ Failed: ${result.error}`;
        setTimeout(() => { dsImportFeedback = null; }, 3500);
      }
      return;
    }

    // 2. Watabou GeoJSON city map (.geojson, .json)
    if (name.endsWith('.geojson') || (name.endsWith('.json') && !name.includes('campaign'))) {
      const text = await file.text();
      const parsed = parseWatabouGeoJson(text);
      handleLoadWatabouCity(parsed);
      return;
    }

    // 3. Raster map image (PNG, SVG, JPG, WEBP) -> Automatic direct push to battlemat
    if (/\.(png|svg|jpg|jpeg|webp)$/i.test(name)) {
      await pushMapToBattlemat(file, { name: file.name, gridSize });
      const url = URL.createObjectURL(file);
      loadMapFromUrl(url);
      mapImageUrl = file.name;
      mapImageInput = file.name;
      vpX = 0;
      vpY = 0;
      vpZoom = 1.0;
    }
  }

  function handleLoadDungeonMap(map: DungeonScrawlParsedMap) {
    walls = map.walls;
    doors = map.doors;
    gridSize = map.gridSize;
    mapImageUrl = map.name;
    mapImageInput = map.name;
    vpX = 0;
    vpY = 0;
    vpZoom = 1.0;

    // Populate spatial index with loaded walls and closed doors
    for (const w of map.walls) {
      globalSpatialIndex.updateCollider(w.id, {
        minX: Math.min(w.x1, w.x2),
        minY: Math.min(w.y1, w.y2),
        maxX: Math.max(w.x1, w.x2),
        maxY: Math.max(w.y1, w.y2),
      }, 'wall', true, w);
    }
    for (const d of map.doors) {
      const isClosed = d.state === 'CLOSED';
      globalSpatialIndex.updateCollider(d.id, {
        minX: Math.min(d.x1, d.x2),
        minY: Math.min(d.y1, d.y2),
        maxX: Math.max(d.x1, d.x2),
        maxY: Math.max(d.y1, d.y2),
      }, 'door', isClosed, d);
    }
  }

  function handleLoadWatabouCity(city: WatabouCityMap) {
    cityMap = city;
    mapImageUrl = city.name;
    mapImageInput = city.name;
    vpX = 0;
    vpY = 0;
    vpZoom = 1.0;
  }

  function handleSaveParcelEntity(parcelId: string, data: { entityType: SettlementEntityType; customName: string; notes: string; npcContact: string }) {
    if (!cityMap) return;
    cityMap = {
      ...cityMap,
      buildings: assignParcelEntity(cityMap.buildings, parcelId, data),
    };
    selectedParcel = null;
  }

  function handleSpawnTokenEvent(e: Event) {
    const detail = (e as CustomEvent<{ name: string; hp?: number; maxHp?: number; isPlayer?: boolean; color?: string; gx?: number; gy?: number }>).detail;
    if (!detail || !detail.name) return;
    const id = `tok-${Date.now()}`;
    tokens = [...tokens, {
      id,
      name: detail.name,
      x: detail.gx ?? Math.floor(Math.random() * 6) + 1,
      y: detail.gy ?? Math.floor(Math.random() * 6) + 1,
      color: detail.color || (detail.isPlayer ? '#22c55e' : '#ef4444'),
      isPlayer: detail.isPlayer ?? false,
      hp: detail.hp || 20,
      maxHp: detail.maxHp || detail.hp || 20,
    }];
  }

  // ── Lifecycle ──────────────────────────────────────────────────────────────
  onMount(() => {
    initDmSyncListener();
    if (!canvasEl) return;
    ctx = canvasEl.getContext('2d');
    syncCanvasSize();
    resizeObserver = new ResizeObserver(() => { syncCanvasSize(); });
    resizeObserver.observe(canvasEl.parentElement!);
    if (weatherCanvasEl) {
      weatherRenderer = new WeatherCanvasRenderer(weatherCanvasEl);
    }
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    reloadTacticalMapsList();
    window.addEventListener('vtt:maps-updated', reloadTacticalMapsList);
    window.addEventListener('vtt:campaign-assets-refreshed', reloadTacticalMapsList);
    window.addEventListener('vtt:load-battle-map', handleBattleMapEvent);
    window.addEventListener('vtt:spawn-token', handleSpawnTokenEvent);
    window.addEventListener('vtt:toggle-fog-tool', handleToggleFogTool);
    window.addEventListener('vtt:context-tool', handleContextTool);
    window.addEventListener('vtt:open-grid-calibration', handleOpenGridCalibration);
    window.addEventListener('vtt:trigger-ping', handleTriggerPing);
    rafId = requestAnimationFrame(render);
  });

  onDestroy(() => {
    cancelAnimationFrame(rafId);
    resizeObserver?.disconnect();
    weatherRenderer?.destroy();
    window.removeEventListener('keydown', handleKeyDown);
    window.removeEventListener('keyup', handleKeyUp);
    window.removeEventListener('mousemove', handleWindowMouseMove);
    window.removeEventListener('mouseup', handleWindowMouseUp);
    window.removeEventListener('vtt:maps-updated', reloadTacticalMapsList);
    window.removeEventListener('vtt:campaign-assets-refreshed', reloadTacticalMapsList);
    window.removeEventListener('vtt:load-battle-map', handleBattleMapEvent);
    window.removeEventListener('vtt:spawn-token', handleSpawnTokenEvent);
    window.removeEventListener('vtt:weather-changed', handleWeatherChangedEvent);
    window.removeEventListener('vtt:toggle-fog-tool', handleToggleFogTool);
    window.removeEventListener('vtt:context-tool', handleContextTool);
    window.removeEventListener('vtt:open-grid-calibration', handleOpenGridCalibration);
    window.removeEventListener('vtt:trigger-ping', handleTriggerPing);
    cleanupDmSyncListener();
    if (mapImageUrl && mapImageUrl.startsWith('blob:')) {
      try {
        URL.revokeObjectURL(mapImageUrl);
      } catch (_) {}
    }
    if (ingestionWorker) {
      ingestionWorker.terminate();
      ingestionWorker = null;
    }
    if (heightmapWorker) {
      heightmapWorker.terminate();
      heightmapWorker = null;
    }
    if (canvasEl) {
      canvasEl.width = 0;
      canvasEl.height = 0;
    }
    ctx = null;
    mapImg = null;
    videoRenderer?.destroy();
    videoRenderer = null;
    videoFrameCanvas = null;
    videoFrameCtx = null;
  });
</script>

<div class="h-full flex flex-col overflow-hidden bg-slate-950">

  <!-- ── Toolbar ──────────────────────────────────────────────────────────── -->
  <div class="flex items-center gap-2 px-3 py-2 border-b border-slate-800 bg-slate-900 shrink-0 flex-wrap">
    <span class="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Battle Mat</span>

    <!-- Active Tactical Map Selector Dropdown -->
    <div class="flex items-center gap-1.5 bg-slate-950 border border-slate-800 rounded-lg px-2 py-1">
      <span class="text-[10px] font-bold text-amber-400 uppercase tracking-wider">Map:</span>
      <select
        id="workstation-active-map-select"
        value={activeBattlemapId}
        onchange={handleSelectMap}
        class="bg-slate-900 border border-slate-800 rounded px-2 py-0.5 text-xs text-slate-200 focus:outline-none focus:border-amber-500 max-w-[170px] truncate font-semibold cursor-pointer"
      >
        <option value="">-- Select Active Map --</option>
        {#each availableTacticalMaps as tMap}
          <option value={tMap.id}>{tMap.name}</option>
        {/each}
      </select>
    </div>

    <div class="flex items-center gap-1 bg-slate-950 border border-slate-800 rounded-lg px-2 py-1">
      <span class="text-[10px] text-slate-600">Zoom</span>
      <span class="text-[11px] font-mono font-bold text-slate-300">{Math.round(vpZoom*100)}%</span>
    </div>
    <button onclick={() => { vpX = 0; vpY = 0; vpZoom = 1; }} class="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-400 text-xs rounded transition-colors">Reset View</button>
    <button onclick={() => showSpawnPanel = !showSpawnPanel} class="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded transition-colors">+ Token</button>
    <button onclick={() => showSettings = !showSettings} class="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded transition-colors">⚙ Map Settings</button>

    <!-- Vector Map Import & Toggles -->
    <button
      onclick={() => { showImportModal = true; }}
      class="px-2.5 py-1 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded transition-colors flex items-center gap-1 shadow-sm"
      title="Ingest Dungeon Scrawl (.ds) or Watabou (.geojson) files"
    >
      <span>📐</span>
      <span>Vector Map</span>
    </button>

    <button
      onclick={() => { showGeneratorDrawer = true; }}
      class="px-2.5 py-1 bg-emerald-700 hover:bg-emerald-600 text-white text-xs font-semibold rounded transition-colors flex items-center gap-1 shadow-sm"
      title="Open Cartography Workbench (Watabou, Azgaar, One Page Dungeon)"
    >
      <span>🗺️</span>
      <span>Generators</span>
    </button>

    <!-- Grid Calibration Tool -->
    <button
      onclick={() => { showGridCalibration = true; }}
      class="px-2.5 py-1 text-xs font-semibold rounded transition-colors flex items-center gap-1 border border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-300"
      title="Open 3-Point Grid Alignment & Calibration Tool"
    >
      <span>📐</span>
      <span>Grid Calib</span>
    </button>

    <!-- Vision & Fog of War Tool -->
    <button
      onclick={toggleVisionFogMode}
      class="px-2.5 py-1 text-xs font-semibold rounded transition-colors flex items-center gap-1 border {showFogVisionPanel ? 'bg-emerald-950/70 border-emerald-500/60 text-emerald-300 shadow' : 'bg-slate-800 border-slate-700 text-slate-300 hover:text-white'}"
      title="Toggle Fog of War and Vision Controls"
    >
      <span>👁️</span>
      <span>Vision/Fog</span>
    </button>

    <!-- Floor Layers Drawer -->
    <button
      onclick={() => { showFloorLayersDrawer = !showFloorLayersDrawer; }}
      class="px-2.5 py-1 text-xs font-semibold rounded transition-colors flex items-center gap-1 border {showFloorLayersDrawer ? 'bg-sky-950/70 border-sky-500/60 text-sky-300 shadow' : 'bg-slate-800 border-slate-700 text-slate-300 hover:text-white'}"
      title="Open Multi-Floor Layer Management Drawer"
    >
      <span>🥞</span>
      <span>Floors ({mapLayers.floors.length || 1})</span>
    </button>

    <button
      onclick={() => { dynamicLightingEnabled = !dynamicLightingEnabled; }}
      class="px-2.5 py-1 text-xs font-semibold rounded transition-colors flex items-center gap-1 border {dynamicLightingEnabled ? 'bg-amber-950/60 border-amber-500/50 text-amber-300' : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-slate-200'}"
      title="Toggle 2D raycasting dynamic light & shadow projection"
    >
      <span>💡</span>
      <span>Light {dynamicLightingEnabled ? 'ON' : 'OFF'}</span>
    </button>

    <button
      onclick={() => { wallVisibilityEnabled = !wallVisibilityEnabled; }}
      class="px-2.5 py-1 text-xs font-semibold rounded transition-colors flex items-center gap-1 border {wallVisibilityEnabled ? 'bg-indigo-950/60 border-indigo-500/50 text-indigo-300' : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-slate-200'}"
      title="Toggle wall collider visibility"
    >
      <span>🧱</span>
      <span>Walls {wallVisibilityEnabled ? 'ON' : 'OFF'}</span>
    </button>

    <!-- Viewport Decoupling & Projector Controls -->
    <div class="flex items-center gap-1 bg-slate-950 border border-slate-800 rounded-lg p-0.5">
      <button
        onclick={() => canvasStore.toggleLockProjectorPan()}
        class="px-2 py-1 text-xs font-semibold rounded transition-colors flex items-center gap-1 {canvasStore.lockProjectorPan
          ? 'bg-amber-950/70 border border-amber-500/60 text-amber-300 shadow'
          : 'text-slate-400 hover:text-slate-200'}"
        title="When locked, panning the DM battle mat does NOT alter the public TV camera"
      >
        <span>{canvasStore.lockProjectorPan ? '🔒 TV Decoupled' : '🎥 TV Mirrored'}</span>
      </button>

      <button
        onclick={handleCastBattlemat}
        class="px-2.5 py-1 text-xs font-bold text-amber-300 hover:text-amber-200 hover:bg-amber-950/60 rounded transition-colors flex items-center gap-1 border border-amber-800/40"
        title="Prompt Presentation API / Native Screen Casting to Projector Route"
      >
        <span>📡</span>
        <span>Cast Battlemat</span>
      </button>

      <a
        href="/projector"
        target="_blank"
        rel="noopener noreferrer"
        class="px-2 py-1 text-xs font-semibold text-indigo-300 hover:text-indigo-200 hover:bg-slate-800/80 rounded transition-colors flex items-center gap-1"
        title="Launch Decoupled Player Projector Window (HDMI / Second Display)"
      >
        <span>📺</span>
        <span>Open Projector</span>
      </a>
    </div>

    <!-- Measurement & Spell AOE Tools -->
    <div class="flex items-center gap-1 bg-slate-950 border border-slate-800 rounded-lg p-0.5">
      <button
        onclick={() => activeTool = 'select'}
        class="px-2 py-1 rounded text-xs transition-colors {activeTool === 'select' ? 'bg-indigo-600 text-white font-bold' : 'text-slate-400 hover:text-slate-200'}"
        title="Select / Move Token"
      >
        🖱️
      </button>
      <button
        onclick={() => activeTool = 'ruler'}
        class="px-2 py-1 rounded text-xs transition-colors flex items-center gap-1 {activeTool === 'ruler' ? 'bg-sky-600 text-white font-bold' : 'text-slate-400 hover:text-slate-200'}"
        title="Vector Distance Ruler (5ft Snapping)"
      >
        <span>📏</span>
        <span>Ruler</span>
      </button>
      <button
        onclick={() => activeTool = 'circle'}
        class="px-2 py-1 rounded text-xs transition-colors {activeTool === 'circle' ? 'bg-rose-600 text-white font-bold' : 'text-slate-400 hover:text-slate-200'}"
        title="Sphere / Circle Template (20ft Radius)"
      >
        ⭕ 20ft
      </button>
      <button
        onclick={() => activeTool = 'cone'}
        class="px-2 py-1 rounded text-xs transition-colors {activeTool === 'cone' ? 'bg-amber-600 text-white font-bold' : 'text-slate-400 hover:text-slate-200'}"
        title="Cone Template (15ft Spread)"
      >
        🔺 15ft
      </button>
      <button
        onclick={() => activeTool = 'cube'}
        class="px-2 py-1 rounded text-xs transition-colors {activeTool === 'cube' ? 'bg-purple-600 text-white font-bold' : 'text-slate-400 hover:text-slate-200'}"
        title="Cube Template (20ft Side)"
      >
        ⬛ 20ft
      </button>
      <button
        onclick={() => activeTool = 'line'}
        class="px-2 py-1 rounded text-xs transition-colors {activeTool === 'line' ? 'bg-blue-600 text-white font-bold' : 'text-slate-400 hover:text-slate-200'}"
        title="Line Template (30ft Length, 5ft Width)"
      >
        ⚡ 30ft
      </button>

      {#if canvasStore.aoeTemplates.length > 0 || canvasStore.ruler}
        <button
          onclick={() => { canvasStore.clearAoeTemplates(); canvasStore.setRuler(null); }}
          class="px-2 py-1 text-slate-500 hover:text-rose-400 text-xs transition-colors"
          title="Clear all active AOE and measurement overlays"
        >
          ✕ Clear
        </button>
      {/if}

      <label class="flex items-center gap-1 pl-1 pr-2 text-[10px] text-slate-400 cursor-pointer" title="Make placed templates visible on public projector">
        <input type="checkbox" bind:checked={aoePublic} class="rounded accent-indigo-500 text-xs" />
        <span>Public TV</span>
      </label>
    </div>

    {#if walls.length > 0 || doors.length > 0}
      <div class="flex items-center gap-1.5 px-2 py-0.5 bg-indigo-950/50 border border-indigo-700/40 rounded text-[11px] text-indigo-300">
        <span>🏰 {walls.length} walls · {doors.length} doors</span>
        <button
          onclick={() => { walls = []; doors = []; }}
          class="text-indigo-400 hover:text-rose-400 ml-1 font-bold"
          title="Clear Dungeon Scrawl walls"
        >✕</button>
      </div>
    {/if}

    {#if cityMap}
      <div class="flex items-center gap-1.5 px-2 py-0.5 bg-emerald-950/50 border border-emerald-700/40 rounded text-[11px] text-emerald-300">
        <span>🏘️ {cityMap.buildings.length} lots · {cityMap.districts.length} districts</span>
        <button
          onclick={() => { cityMap = null; selectedParcel = null; }}
          class="text-emerald-400 hover:text-rose-400 ml-1 font-bold"
          title="Clear Watabou city map"
        >✕</button>
      </div>
    {/if}

    <div class="flex-1"></div>
    <span class="text-[10px] text-slate-600">Space+drag or middle-click to pan · Scroll to zoom</span>
  </div>

  <!-- ── Settings Bar ─────────────────────────────────────────────────────── -->
  {#if showSettings}
    <div class="flex items-center gap-4 px-4 py-2.5 border-b border-slate-800 bg-slate-900/60 shrink-0 flex-wrap text-xs">
      <div class="flex items-center gap-2">
          <span class="text-[9px] text-slate-600 uppercase">Grid Size</span>
        <input type="range" min="30" max="120" step="10" bind:value={gridSize} class="w-24 accent-indigo-500 cursor-pointer" />
        <span class="font-mono text-slate-300 w-8">{gridSize}px</span>
      </div>
      <div class="flex items-center gap-2">
          <span class="text-slate-500 uppercase tracking-wider text-[10px] font-semibold whitespace-nowrap">Grid Opacity</span>
        <input type="range" min="0" max="1" step="0.05" bind:value={gridOpacity} class="w-24 accent-indigo-500 cursor-pointer" />
        <span class="font-mono text-slate-300 w-8">{Math.round(gridOpacity*100)}%</span>
      </div>
      <label class="flex items-center gap-1.5 text-slate-400 cursor-pointer">
        <input type="checkbox" bind:checked={gridSnap} class="rounded" /> Grid Snap
      </label>
      <div class="flex items-center gap-2 flex-1 min-w-0">
        <span class="text-slate-500 uppercase tracking-wider text-[10px] font-semibold whitespace-nowrap">Map URL</span>
        <input type="text" bind:value={mapImageInput} placeholder="https://… or drag image onto canvas"
          class="flex-1 min-w-0 bg-slate-950 border border-slate-800 rounded px-2 py-1 text-slate-200 focus:outline-none focus:border-indigo-500 font-mono text-[11px]" />
        <button onclick={() => loadMapFromUrl(mapImageInput)} class="px-2.5 py-1 bg-indigo-700 hover:bg-indigo-600 text-white text-xs font-bold rounded transition-colors whitespace-nowrap">Load</button>
      </div>
      <label class="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded cursor-pointer transition-colors whitespace-nowrap">
        📁 File…
        <input type="file" accept="image/*" class="hidden" onchange={handleMapFileInput} />
      </label>
      {#if mapImageUrl}
        <button onclick={() => { mapImg = null; mapImageUrl = ''; }} class="text-rose-500 hover:text-rose-300 text-xs transition-colors">✕ Clear Map</button>
      {/if}
    </div>
  {/if}

  <!-- ── Spawn Panel ───────────────────────────────────────────────────────── -->
  {#if showSpawnPanel}
    <div class="flex items-center gap-3 px-4 py-2.5 border-b border-slate-800 bg-slate-900/60 shrink-0 flex-wrap text-xs">
      <span class="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Spawn Token</span>
      <input type="text" bind:value={spawnName} placeholder="Token name…" class="w-36 bg-slate-950 border border-slate-800 rounded px-2 py-1.5 text-slate-200 focus:outline-none focus:border-indigo-500" />
      <input type="color" bind:value={spawnColor} class="w-8 h-7 rounded cursor-pointer border border-slate-700 bg-slate-900 p-0.5" title="Token color" />
      <input type="number" bind:value={spawnHp} min="1" placeholder="HP" class="w-16 bg-slate-950 border border-slate-800 rounded px-2 py-1.5 text-slate-200 focus:outline-none focus:border-indigo-500 font-mono" />
      <div class="flex items-center gap-1">
        <span class="text-[10px] text-slate-500 uppercase">Col</span>
        <input type="number" bind:value={spawnGx} min="0" class="w-14 bg-slate-950 border border-slate-800 rounded px-2 py-1 text-slate-200 focus:outline-none font-mono" />
      </div>
      <div class="flex items-center gap-1">
        <span class="text-[10px] text-slate-500 uppercase">Row</span>
        <input type="number" bind:value={spawnGy} min="0" class="w-14 bg-slate-950 border border-slate-800 rounded px-2 py-1 text-slate-200 focus:outline-none font-mono" />
      </div>
      <label class="flex items-center gap-1.5 text-slate-400 cursor-pointer">
        <input type="checkbox" bind:checked={spawnIsPlayer} class="rounded" /> Player
      </label>
      <button onclick={spawnToken} disabled={!spawnName.trim()} class="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white font-bold rounded transition-colors">Place</button>
      <button onclick={() => showSpawnPanel = false} class="px-2 py-1.5 bg-slate-800 text-slate-400 rounded hover:bg-slate-700 transition-colors">✕</button>
    </div>
  {/if}

  <!-- ── Canvas + Token List ───────────────────────────────────────────────── -->
  <div class="flex flex-1 overflow-hidden min-h-0">
    <!-- Canvas -->
    <div class="flex-1 relative overflow-hidden min-w-0 min-h-0 cursor-crosshair"
      class:cursor-grab={spaceDown}
      class:cursor-grabbing={isPanning}
      class:ring-2={isDroppingMap}
      class:ring-indigo-500={isDroppingMap}
      ondragover={(e) => { e.preventDefault(); isDroppingMap = true; }}
      ondragleave={() => { isDroppingMap = false; }}
      ondrop={handleCanvasDrop}
      role="region"
      aria-label="Tactical Battle Mat viewport"
    >
      <canvas
        bind:this={canvasEl}
        class="absolute inset-0 touch-none select-none"
        onwheel={handleWheel}
        onmousedown={handleMouseDown}
        onmousemove={handleMouseMove}
        onmouseup={handleMouseUp}
        oncontextmenu={handleContextMenu}
        onmouseleave={() => { hoveredCell = null; if (!isPanning) handleMouseUp(new MouseEvent('mouseup')); }}
      ></canvas>

      <!-- Weather Particle FX Canvas Layer -->
      <canvas
        bind:this={weatherCanvasEl}
        class="absolute inset-0 pointer-events-none touch-none select-none z-10"
      ></canvas>

      <!-- Full-Screen Floating HUD Layer Wrapper (strictly pointer-events: none) -->
      <div class="hud-overlay-wrapper absolute inset-0 pointer-events-none overflow-hidden z-20" aria-label="Tactical HUD Layer">
        <!-- Top-Right Floating Scene Weather & Environment Widget -->
        <div class="absolute top-3 right-4 z-20 pointer-events-auto">
          <SceneEnvironmentWidget />
        </div>

        <!-- Floating Vector Drawing Toolbar (pointer-events: auto) -->
        <div
          class="absolute bottom-3 z-20 pointer-events-auto flex flex-col items-center gap-2 transition-all duration-300 max-w-[calc(100%-6rem)]"
          style={chatStore.isOpen ? 'left: calc(50% - 12rem); transform: translateX(-50%);' : 'left: 50%; transform: translateX(-50%);'}
        >
          <CanvasDrawingToolbar
            bind:activeTool={activeDrawingTool}
            onToolChange={(tool) => {
              activeDrawingTool = tool;
              if (tool === 'select') activeTool = 'select';
              if (tool === 'ruler') activeTool = 'ruler';
            }}
          />
        </div>

        {#if !mapImageUrl && tokens.length === 0}
          <div class="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div class="text-center space-y-2">
              <p class="text-4xl opacity-20">🗺️</p>
              <p class="text-xs text-slate-600">Load a map image via the toolbar, or spawn tokens to begin.</p>
            </div>
          </div>
        {/if}
      </div>
    </div>

    <!-- Token sidebar -->
    {#if tokens.length > 0}
      <div class="w-44 border-l border-slate-800 bg-slate-900 flex flex-col overflow-hidden shrink-0">
        <div class="px-3 py-2 border-b border-slate-800 shrink-0">
          <p class="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Tokens ({tokens.length})</p>
        </div>
        <div class="flex-1 overflow-y-auto p-2 space-y-1.5">
          {#each tokens as tok (tok.id)}
            <div class="flex items-center gap-2 px-2 py-1.5 bg-slate-800/60 rounded-lg">
              <div class="w-4 h-4 rounded shrink-0" style="background:{tok.color}"></div>
              <div class="flex-1 min-w-0">
                <p class="text-[11px] font-semibold text-slate-300 truncate">{tok.name}</p>
                <p class="text-[9px] font-mono text-slate-600">[{tok.x},{tok.y}]</p>
              </div>
              <button onclick={() => removeToken(tok.id)} class="text-slate-600 hover:text-rose-400 text-[10px] transition-colors">✕</button>
            </div>
          {/each}
        </div>
      </div>
    {/if}
  </div>

  <!-- ── Map Import & Parcel Inspector Modal ─────────────────────────────────── -->
  <MapImportModal
    bind:isOpen={showImportModal}
    onLoadDungeonMap={handleLoadDungeonMap}
    onLoadWatabouCity={handleLoadWatabouCity}
    selectedParcel={selectedParcel}
    onSaveParcelEntity={handleSaveParcelEntity}
    onCloseParcelInspector={() => { selectedParcel = null; }}
  />

  <!-- ── Cartography Generator Drawer ──────────────────────────────────────── -->
  <GeneratorDrawer
    bind:isOpen={showGeneratorDrawer}
    onOpenCalibration={() => {
      // Dispatch grid calibration overlay event so TacticalCanvasContainer can respond
      window.dispatchEvent(new CustomEvent('vtt:open-grid-calibration'));
    }}
  />

  <!-- ── 3-Point Grid Alignment & Calibration Modal ──────────────────────────── -->
  <GridCalibrationModal
    bind:isOpen={showGridCalibration}
    onApply={(config) => {
      gridSize = config.pixelsPerSquare;
      canvasStore.setGridSize(config.pixelsPerSquare);
      if (activeBattlemapId) {
        mapsDb.tacticalMaps.update(activeBattlemapId, {
          'grid.sizePx': config.pixelsPerSquare,
          'grid.offsetX': config.offsetX,
          'grid.offsetY': config.offsetY,
        }).catch(() => {});
      }
    }}
  />

  <!-- ── Multi-Floor Layer Management Flyout ─────────────────────────────────── -->
  {#if showFloorLayersDrawer}
    <div class="fixed top-14 right-4 z-40 w-72 bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl p-4 text-xs space-y-3 animate-in fade-in select-none">
      <div class="flex items-center justify-between border-b border-slate-800 pb-2">
        <div class="flex items-center gap-1.5 font-bold text-slate-200">
          <span>🥞</span>
          <span class="uppercase tracking-wider">Floor &amp; Elevation Layers</span>
        </div>
        <button onclick={() => showFloorLayersDrawer = false} class="text-slate-400 hover:text-white">✕</button>
      </div>

      <div class="space-y-1.5 max-h-52 overflow-y-auto">
        {#if mapLayers.floors.length === 0}
          <div class="p-2.5 rounded-lg bg-slate-950 border border-slate-800 text-[11px] text-slate-400 flex items-center justify-between">
            <div>
              <span class="font-bold text-slate-200 block">Ground Level (Base)</span>
              <span class="text-[10px] text-slate-500 font-mono">Elevation: 0 ft</span>
            </div>
            <span class="px-2 py-0.5 rounded text-[9px] font-bold bg-emerald-950 text-emerald-300 border border-emerald-800">Active</span>
          </div>
        {:else}
          {#each mapLayers.floors as floor, i}
            <div
              class="p-2 rounded-lg border transition-all flex items-center justify-between {mapLayers.activeFloorIndex === i ? 'bg-indigo-950/60 border-indigo-500 text-indigo-200' : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'}"
            >
              <button
                type="button"
                onclick={() => mapLayers.setFloor(i)}
                class="flex-1 text-left"
              >
                <span class="font-bold block text-slate-200">{floor.name}</span>
                <span class="text-[10px] text-slate-500 font-mono">{floor.elevationFt} ft elevation</span>
              </button>
              <div class="flex items-center gap-1">
                {#if mapLayers.activeFloorIndex === i}
                  <span class="px-1.5 py-0.5 rounded text-[9px] font-bold bg-emerald-950 text-emerald-300 border border-emerald-800">Active</span>
                {/if}
                <button
                  type="button"
                  onclick={() => mapLayers.removeFloor(i)}
                  class="text-slate-600 hover:text-rose-400 text-xs px-1"
                  title="Remove Floor"
                >✕</button>
              </div>
            </div>
          {/each}
        {/if}
      </div>

      <div class="pt-2 border-t border-slate-800 flex items-center justify-between gap-2">
        <button
          type="button"
          onclick={() => {
            const elev = mapLayers.floors.length * 10;
            mapLayers.addFloor({
              id: `floor-${Date.now()}`,
              name: `Floor ${mapLayers.floors.length + 1}`,
              elevationFt: elev,
              assetUrl: mapImageUrl || '',
              gridConfig: { pixelsPerSquare: gridSize, offsetX: 0, offsetY: 0 },
              wallPolygons: [],
            });
          }}
          class="flex-1 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-lg text-center transition-colors shadow"
        >
          + Add Floor Layer
        </button>
      </div>
    </div>
  {/if}

  <!-- ── Vision & Fog Quick Config Panel ───────────────────────────────────── -->
  {#if showFogVisionPanel}
    <div class="fixed top-14 left-72 z-40 w-64 bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl p-3 text-xs space-y-2.5 animate-in fade-in select-none">
      <div class="flex items-center justify-between border-b border-slate-800 pb-1.5">
        <div class="flex items-center gap-1.5 font-bold text-slate-200">
          <span>👁️</span>
          <span class="uppercase tracking-wider">Vision &amp; Fog of War</span>
        </div>
        <button onclick={() => showFogVisionPanel = false} class="text-slate-400 hover:text-white">✕</button>
      </div>
      <div class="space-y-1.5">
        <label class="flex items-center justify-between p-2 rounded-lg bg-slate-950 border border-slate-800 cursor-pointer">
          <span class="text-slate-300">Dynamic Raycast Lighting</span>
          <input type="checkbox" bind:checked={dynamicLightingEnabled} class="accent-indigo-500 rounded" />
        </label>
        <label class="flex items-center justify-between p-2 rounded-lg bg-slate-950 border border-slate-800 cursor-pointer">
          <span class="text-slate-300">Wall Occlusion Lines</span>
          <input type="checkbox" bind:checked={wallVisibilityEnabled} class="accent-indigo-500 rounded" />
        </label>
      </div>
      <div class="grid grid-cols-2 gap-1.5 pt-1">
        <button
          onclick={() => { activeDrawingTool = 'fog_carve'; activeTool = 'select'; }}
          class="py-1 px-2 rounded-lg font-bold text-[11px] border transition-colors {activeDrawingTool === 'fog_carve' ? 'bg-emerald-600 text-white border-emerald-500' : 'bg-slate-800 text-slate-300 border-slate-700'}"
        >
          Carve Fog
        </button>
        <button
          onclick={() => { activeDrawingTool = 'fog_conceal'; activeTool = 'select'; }}
          class="py-1 px-2 rounded-lg font-bold text-[11px] border transition-colors {activeDrawingTool === 'fog_conceal' ? 'bg-rose-700 text-white border-rose-600' : 'bg-slate-800 text-slate-300 border-slate-700'}"
        >
          Conceal Fog
        </button>
      </div>
      <div class="flex items-center gap-1.5 pt-1 border-t border-slate-800">
        <button
          onclick={() => canvasStore.revealAllFog()}
          class="flex-1 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold rounded text-[10px]"
        >
          Reveal All
        </button>
        <button
          onclick={() => canvasStore.clearFog()}
          class="flex-1 py-1 bg-slate-800 hover:bg-rose-950 text-slate-300 hover:text-rose-300 font-bold rounded text-[10px]"
        >
          Reset Fog
        </button>
      </div>
    </div>
  {/if}

  <!-- DS Import Feedback Toast -->
  {#if dsImportFeedback}
    <div class="fixed bottom-20 left-1/2 -translate-x-1/2 z-50 px-4 py-2 bg-slate-900 border border-emerald-700/60 text-emerald-300 text-xs font-mono font-bold rounded-xl shadow-xl pointer-events-none animate-pulse">
      {dsImportFeedback}
    </div>
  {/if}
</div>
