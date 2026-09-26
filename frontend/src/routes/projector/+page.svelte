<script lang="ts">
  // projector/+page.svelte — Decoupled Player-Facing Battle Mat View
  // Strips all DM controls/secrets, computes player Dynamic Fog of War,
  // renders public spell AOE templates, condition rings, turn reticle, and floating HUD.

  import { onMount, onDestroy } from 'svelte';
  import { canvasStore, type CanvasToken } from '../../stores/canvasStore.svelte';
  import { combatTurnStore } from '../../stores/websocketStore';
  import type { OverheadTile } from '../../lib/types/map';
  import {
    renderDynamicLighting,
    renderExploredFogOfWar,
    isPointInPolygon,
    renderWallSegments,
    renderDoors,
    renderWatabouDistricts,
    type VisionSource,
    type VisionPolygonResult,
  } from '../../lib/canvas/LightShadowRenderer';
  import {
    renderAoeTemplateOnCanvas,
    renderRulerOnCanvas,
  } from '../../lib/components/map/MeasurementTool';
  import {
    renderConditionRingsOnCanvas,
    renderTurnReticleOnCanvas,
    getVitalityState,
  } from '../../lib/components/map/TokenOverlay';
  import { initProjectorSyncListener, type SyncMessage } from '../../lib/services/battlematSyncBridge';
  import { fogOfWarLayer } from '../../lib/canvas/fogOfWarLayer';
  import InitiativeRibbon from '../../lib/components/combat/InitiativeRibbon.svelte';
  import { projectorStore } from '../../lib/stores/projectorStore.svelte';
  import { curtainStore } from '../../lib/stores/curtainStore.svelte';
  import AtlasMapView from '../../lib/components/map/AtlasMapView.svelte';
  import { broadcaster, type HandoutPayload } from '../../lib/services/broadcaster';

  import TabletopCalibrationOverlay, { type ScreenRotation } from '../../lib/components/projector/TabletopCalibrationOverlay.svelte';
  import { broadcastPingPoint, type PingPayload } from '../../lib/components/canvas/PingLayer.svelte';
  import Dice3DOverlay from '../../lib/components/dice/Dice3DOverlay.svelte';
  import { drawingStore } from '../../lib/stores/drawingStore.svelte';
  import { renderSharedDrawingsOnCanvas2D } from '../../lib/components/canvas/drawingRenderHelper';
  import { spatialAudioEngine } from '../../lib/services/spatialAudioEngine';

  $effect(() => {
    // Projector tracks the active player token position for positional audio
    const players = canvasStore.tokens.filter((t) => t.isPlayer);
    if (players.length > 0) {
      const active = players.find((t) => t.id === canvasStore.activeTokenId) || players[0];
      spatialAudioEngine.setListener(
        (active.x + 0.5) * gridSize,
        (active.y + 0.5) * gridSize,
        gridSize
      );
    }
  });


  interface ProjectorPing {
    x: number;
    y: number;
    color: string;
    sender_name: string;
    startTime: number;
  }
  let activePings = $state<ProjectorPing[]>([]);

  function triggerLocalPing(p: { x: number; y: number; color?: string; sender_name?: string }) {
    activePings = [
      ...activePings,
      {
        x: p.x,
        y: p.y,
        color: p.color || '#38bdf8',
        sender_name: p.sender_name || 'Player',
        startTime: performance.now(),
      },
    ];
  }

  function handleProjectorPointerDown(e: PointerEvent) {
    if ((e.altKey && e.button === 0) || e.button === 1) {
      e.preventDefault();
      const rect = canvasEl?.getBoundingClientRect();
      if (!rect) return;
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;
      const vp = canvasStore.projectorViewport;
      const worldX = (sx - vp.x) / vp.zoom;
      const worldY = (sy - vp.y) / vp.zoom;

      broadcastPingPoint({
        x: worldX,
        y: worldY,
        color: '#38bdf8',
        sender_name: 'Tabletop',
      });
    }
  }

  let canvasEl = $state<HTMLCanvasElement | null>(null);
  let ctx: CanvasRenderingContext2D | null = null;
  let rafId = 0;
  let animTime = $state(0);
  let activeVisionPolygons = $state<VisionPolygonResult[]>([]);
  let cleanupSync: (() => void) | null = null;
  let activeHandout = $state<HandoutPayload | null>(null);

  // Tabletop 1-inch physical calibration & TV orientation
  let showPhysicalCalibration = $state(false);
  let projectorRotation = $state<ScreenRotation>(
    typeof localStorage !== 'undefined'
      ? (Number(localStorage.getItem('vtt_projector_rotation')) as ScreenRotation) || 0
      : 0
  );
  let physicalPpi = $state(
    typeof localStorage !== 'undefined'
      ? Number(localStorage.getItem('vtt_projector_physical_ppi')) || 96
      : 96
  );

  function applyPhysicalScale(ppi: number) {
    physicalPpi = ppi;
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('vtt_projector_physical_ppi', String(ppi));
    }
    const targetZoom = ppi / (canvasStore.gridSize || 60);
    canvasStore.setProjectorViewport({
      ...canvasStore.projectorViewport,
      zoom: Math.max(0.1, Math.min(4.0, targetZoom)),
    });
  }

  // Filtered tokens: strictly hide DM-invisible creatures
  let visibleTokens = $derived(
    canvasStore.tokens.filter(t => t.isVisible !== false && !t.name.toLowerCase().includes('(hidden)'))
  );

  // Active combat state from WebSocket or session
  let liveCombat = $derived($combatTurnStore);

  // Public spell templates
  let publicAoeTemplates = $derived(
    canvasStore.aoeTemplates.filter(t => t.isPublic)
  );

  // Public ruler measurement
  let publicRuler = $derived(
    canvasStore.ruler?.isPublic ? canvasStore.ruler : null
  );

  // Map image loader & Preload Buffer for Tabletop Projector
  let mapImg = $state<HTMLImageElement | null>(null);
  let isPreloadingMap = $state(false);

  async function preloadAndTransitionMap(url: string, width?: number, height?: number) {
    if (!url) {
      mapImg = null;
      return;
    }
    if (mapImg && mapImg.src === url && canvasStore.mapImageUrl === url) {
      return;
    }

    // 1. Keep blackout curtain engaged to prevent asset popping or frame drops
    isPreloadingMap = true;

    try {
      // 2. Preload incoming texture in the background
      const img = new Image();
      img.crossOrigin = 'anonymous';

      await new Promise<void>((resolve, reject) => {
        img.onload = async () => {
          if ('decode' in img) {
            try {
              await img.decode();
            } catch {
              // fallback if decode() rejects
            }
          }
          resolve();
        };
        img.onerror = reject;
        img.src = url;
      });

      // 3. Force GPU texture upload via offscreen canvas render
      const offscreen = document.createElement('canvas');
      offscreen.width = Math.min(img.naturalWidth || width || 1920, 4096);
      offscreen.height = Math.min(img.naturalHeight || height || 1080, 4096);
      const octx = offscreen.getContext('2d');
      if (octx) {
        octx.drawImage(img, 0, 0, offscreen.width, offscreen.height);
      }

      // 4. Assign new texture to active rendering
      mapImg = img;
      canvasStore.setBackgroundTexture({
        url,
        width: width || img.naturalWidth || 1920,
        height: height || img.naturalHeight || 1080,
      });

      // 5. Allow 1 frame buffer to ensure GPU upload commit
      await new Promise((r) => requestAnimationFrame(r));
    } catch (err) {
      console.warn('Projector: Failed to preload map texture:', err);
      canvasStore.setBackgroundTexture({
        url,
        width: width || 1920,
        height: height || 1080,
      });
    } finally {
      // 6. Disengage blackout curtain
      isPreloadingMap = false;
    }
  }

  $effect(() => {
    const targetUrl = canvasStore.mapImageUrl;
    if (targetUrl && (!mapImg || mapImg.src !== targetUrl) && !isPreloadingMap) {
      preloadAndTransitionMap(targetUrl, canvasStore.mapWidth, canvasStore.mapHeight);
    } else if (!targetUrl) {
      mapImg = null;
    }
  });

  function syncCanvasDimensions() {
    if (!canvasEl) return;
    const w = window.innerWidth;
    const h = window.innerHeight;
    if (canvasEl.width !== w || canvasEl.height !== h) {
      canvasEl.width = w;
      canvasEl.height = h;
    }
  }

  onMount(() => {
    if (!canvasEl) return;
    ctx = canvasEl.getContext('2d');
    syncCanvasDimensions();

    if (typeof localStorage !== 'undefined') {
      const savedPpi = localStorage.getItem('vtt_projector_physical_ppi');
      if (savedPpi) {
        physicalPpi = Number(savedPpi) || 96;
      }
    }

    cleanupSync = initProjectorSyncListener((msg: SyncMessage) => {
      switch (msg.type) {
        case 'SYNC_FULL_STATE': {
          const snapshot = msg.payload;
          if (snapshot.mapImageUrl) {
            preloadAndTransitionMap(
              snapshot.mapImageUrl,
              snapshot.mapWidth || 1920,
              snapshot.mapHeight || 1080
            );
          }
          if (snapshot.gridSize) {
            canvasStore.setGridSize(snapshot.gridSize);
          }
          if (snapshot.gridColor) {
            canvasStore.setGridColor(snapshot.gridColor);
          }
          if (snapshot.walls && snapshot.doors) {
            canvasStore.setWallsAndDoors(snapshot.walls, snapshot.doors);
          }
          if (snapshot.fogExplored) {
            canvasStore.carveFog(snapshot.fogExplored);
          }
          // Overwrite projector canvas layers while automatically stripping DM-only markers
          if (snapshot.tokens) {
            const publicTokens = snapshot.tokens.filter(
              t => t.isVisible !== false && !t.name.toLowerCase().includes('(hidden)')
            );
            canvasStore.setTokens(publicTokens);
          }
          if (snapshot.aoeTemplates) {
            canvasStore.clearAoeTemplates();
            for (const aoe of snapshot.aoeTemplates) {
              if (aoe.isPublic) canvasStore.addAoeTemplate(aoe);
            }
          }
          if (snapshot.ruler) {
            canvasStore.setRuler(snapshot.ruler.isPublic ? snapshot.ruler : null);
          }
          if (snapshot.overheadTiles) {
            canvasStore.setOverheadTiles(snapshot.overheadTiles);
          }
          // Ensure the projector viewport operates independently of DM panning if locked/decoupled
          if (!canvasStore.lockProjectorPan && snapshot.projectorViewport) {
            canvasStore.setProjectorViewport(snapshot.projectorViewport);
          }
          break;
        }
        case 'OVERHEAD_TILES_SYNC': {
          canvasStore.setOverheadTiles(msg.payload || []);
          break;
        }
        case 'TOKEN_MOVE': {
          const tok = canvasStore.tokens.find(t => t.id === msg.tokenId);
          if (tok && tok.isVisible !== false) {
            canvasStore.moveToken(msg.tokenId, msg.x, msg.y);
          }
          break;
        }
        case 'GRID_UPDATE': {
          canvasStore.setGridSize(msg.gridSize);
          canvasStore.setGridColor(msg.gridColor);
          break;
        }
        case 'MAP_TEXTURE_UPDATE': {
          preloadAndTransitionMap(msg.url, msg.width, msg.height);
          drawingStore.setMap(msg.url);
          break;
        }
        case 'PING_POINT': {
          triggerLocalPing(msg);
          break;
        }
      }
    });

    const onPingEvent = (e: Event) => {
      const custom = e as CustomEvent<PingPayload>;
      if (custom.detail) {
        triggerLocalPing(custom.detail);
      }
    };
    window.addEventListener('vtt:ping-point', onPingEvent);

    window.addEventListener('resize', syncCanvasDimensions);

    const startTime = performance.now();
    function loop(now: number) {
      animTime = (now - startTime) / 1000;
      renderProjectorMat();
      rafId = requestAnimationFrame(loop);
    }
    rafId = requestAnimationFrame(loop);

    const channel = typeof window !== 'undefined' && 'BroadcastChannel' in window
      ? new BroadcastChannel('graywood_vtt_channel')
      : null;

    if (channel) {
      channel.onmessage = (e: MessageEvent) => {
        if (e.data?.type === 'SHOW_HANDOUT') {
          activeHandout = e.data.payload;
        } else if (e.data?.type === 'HIDE_HANDOUT') {
          activeHandout = null;
        }
      };
    }

    const unsubBroadcaster = broadcaster.subscribe((event) => {
      if (event.type === 'SHOW_HANDOUT') {
        activeHandout = event.payload;
      } else if (event.type === 'HIDE_HANDOUT') {
        activeHandout = null;
      }
    });

    return () => {
      window.removeEventListener('resize', syncCanvasDimensions);
      window.removeEventListener('vtt:ping-point', onPingEvent);
      cleanupSync?.();
      channel?.close();
      unsubBroadcaster();
      if (rafId) cancelAnimationFrame(rafId);
    };
  });

  onDestroy(() => {
    cleanupSync?.();
    if (rafId) cancelAnimationFrame(rafId);
  });

  const overheadImageCache = new Map<string, HTMLImageElement>();
  const projectorTileAlphas = new Map<string, number>();

  function getOverheadTileImage(url: string): HTMLImageElement | null {
    if (!url) return null;
    let img = overheadImageCache.get(url);
    if (!img) {
      img = new Image();
      img.crossOrigin = 'anonymous';
      img.src = url;
      overheadImageCache.set(url, img);
    }
    return img.complete && img.naturalWidth > 0 ? img : null;
  }

  function renderProjectorOverheadTiles(
    ctx: CanvasRenderingContext2D,
    tiles: OverheadTile[],
    gridSize: number
  ) {
    // 3. Perspective Decoupling: Evaluate roof occlusion strictly against the party's controlled player tokens!
    const partyTokens = canvasStore.tokens.filter(
      (t) => t.isPlayer && !t.isOrbSealed && t.isVisible !== false
    );

    for (const tile of tiles) {
      const tileImg = getOverheadTileImage(tile.imageUrl);
      if (!tileImg) continue;

      // Find party player tokens inside roof bounds with elevation lower than the threshold
      const partyUnderRoof = partyTokens.filter((tok) => {
        const tx = (tok.x + 0.5) * gridSize;
        const ty = (tok.y + 0.5) * gridSize;
        const elev = (tok as any).elevation ?? 0;
        return (
          tx >= tile.bounds.x &&
          tx <= tile.bounds.x + tile.bounds.width &&
          ty >= tile.bounds.y &&
          ty <= tile.bounds.y + tile.bounds.height &&
          elev < (tile.elevationThreshold ?? 10)
        );
      });

      const isOccluded = partyUnderRoof.length > 0;
      const targetAlpha = isOccluded
        ? (tile.occlusionMode === 'fade' ? (tile.occlusionAlpha ?? 0.2) : 1.0)
        : 1.0;

      // Lerp alpha for smooth transition on projector
      const prevAlpha = projectorTileAlphas.get(tile.id) ?? 1.0;
      const nextAlpha = prevAlpha + (targetAlpha - prevAlpha) * 0.14;
      projectorTileAlphas.set(tile.id, nextAlpha);

      ctx.save();
      if (isOccluded && tile.occlusionMode === 'radial') {
        // Radial cutout: clip out a circle around each party member under roof
        ctx.beginPath();
        ctx.rect(tile.bounds.x - 2, tile.bounds.y - 2, tile.bounds.width + 4, tile.bounds.height + 4);
        const cutoutRadius = Math.max(gridSize * 1.4, 75);
        for (const tok of partyUnderRoof) {
          const cx = (tok.x + 0.5) * gridSize;
          const cy = (tok.y + 0.5) * gridSize;
          ctx.arc(cx, cy, cutoutRadius, 0, Math.PI * 2, true);
        }
        ctx.clip('evenodd');
        ctx.globalAlpha = 1.0;
        ctx.drawImage(tileImg, tile.bounds.x, tile.bounds.y, tile.bounds.width, tile.bounds.height);
      } else {
        ctx.globalAlpha = Math.max(0, Math.min(1, nextAlpha));
        ctx.drawImage(tileImg, tile.bounds.x, tile.bounds.y, tile.bounds.width, tile.bounds.height);
      }
      ctx.restore();
    }
  }

  function renderProjectorMat() {
    if (!ctx || !canvasEl) return;
    const w = canvasEl.width;
    const h = canvasEl.height;
    const vp = canvasStore.projectorViewport;
    const gridSize = canvasStore.gridSize;

    ctx.clearRect(0, 0, w, h);
    ctx.save();
    ctx.translate(vp.x, vp.y);
    ctx.scale(vp.zoom, vp.zoom);

    // 1. Dark Void Base Background
    ctx.fillStyle = '#060810';
    ctx.fillRect(-vp.x / vp.zoom, -vp.y / vp.zoom, w / vp.zoom, h / vp.zoom);

    // 2. Battle Mat Background Image
    if (mapImg?.complete && mapImg.naturalWidth > 0) {
      ctx.drawImage(mapImg, 0, 0);
    }

    // 3. Watabou City Map
    if (canvasStore.cityMap) {
      renderWatabouDistricts(ctx, canvasStore.cityMap, undefined, vp.zoom);
    }

    // 4. Walls (Visible only)
    if (canvasStore.wallVisibilityEnabled && canvasStore.walls.length > 0) {
      renderWallSegments(ctx, canvasStore.walls, vp.zoom);
    }

    // 5. Doors (Secret doors are stripped unless explicitly opened)
    const publicDoors = canvasStore.doors.filter(d => {
      const typeStr = (d.portalType || d.doorType || d.type || '').toLowerCase();
      const stateStr = (d.portalState || d.state || 'closed').toLowerCase();
      const isSecret = typeStr.includes('secret');
      if (isSecret) {
        return stateStr === 'open';
      }
      return true;
    });
    if (publicDoors.length > 0) {
      renderDoors(ctx, publicDoors, vp.zoom);
    }

    // 6. Tactical Grid
    if (projectorStore.playerSettings.showGrid) {
      const startCol = Math.floor(-vp.x / vp.zoom / gridSize) - 1;
      const startRow = Math.floor(-vp.y / vp.zoom / gridSize) - 1;
      const cols = Math.ceil(w / vp.zoom / gridSize) + 2;
      const rows = Math.ceil(h / vp.zoom / gridSize) + 2;

      ctx.strokeStyle = `rgba(99, 102, 241, ${canvasStore.gridOpacity * 0.75})`;
      ctx.lineWidth = 0.6 / vp.zoom;
      for (let c = startCol; c <= startCol + cols; c++) {
        ctx.beginPath();
        ctx.moveTo(c * gridSize, startRow * gridSize);
        ctx.lineTo(c * gridSize, (startRow + rows) * gridSize);
        ctx.stroke();
      }
      for (let r = startRow; r <= startRow + rows; r++) {
        ctx.beginPath();
        ctx.moveTo(startCol * gridSize, r * gridSize);
        ctx.lineTo((startCol + cols) * gridSize, r * gridSize);
        ctx.stroke();
      }
    }

    // 7. Dynamic Fog of War & Player Line-of-Sight Masking
    if (canvasStore.dynamicLightingEnabled) {
      const viewBounds = {
        x: -vp.x / vp.zoom,
        y: -vp.y / vp.zoom,
        width: w / vp.zoom,
        height: h / vp.zoom,
      };

      // Vision sources generated strictly from active player tokens (not DM monsters!)
      const playerTokens = visibleTokens.filter(t => t.isPlayer && !t.isOrbSealed);
      
      // Auto-update explored cells memory from active player tokens
      for (const pt of playerTokens) {
        canvasStore.exploreAround(pt.x, pt.y, Math.ceil(pt.sightRadiusFeet / 5));
      }

      const visionSources: VisionSource[] = playerTokens.map(t => ({
        id: t.id,
        x: (t.x + 0.5) * gridSize,
        y: (t.y + 0.5) * gridSize,
        radius: (t.sightRadiusFeet / 5) * gridSize,
        color: 'rgba(251, 191, 36, 0.25)',
      }));

      // Render Dynamic Lighting & Shadows with Explored Memory
      activeVisionPolygons = renderExploredFogOfWar(
        ctx,
        viewBounds,
        visionSources,
        canvasStore.walls,
        publicDoors,
        canvasStore.fogExplored,
        gridSize,
        0.98,
        0.72
      );
    } else {
      activeVisionPolygons = [];
    }

    // 7b. Dual-Layer Mask Painter Fog of War
    fogOfWarLayer.render(ctx, 0.98);

    // 8. Public Spell AOE Templates
    for (const aoe of publicAoeTemplates) {
      renderAoeTemplateOnCanvas(ctx, aoe, gridSize);
    }

    // 9. Public Vector Ruler
    if (publicRuler) {
      renderRulerOnCanvas(ctx, publicRuler, gridSize);
    }

    // 10. Active Turn Reticle (Rendered beneath active token)
    if (canvasStore.activeTokenId) {
      const activeTok = visibleTokens.find(t => t.id === canvasStore.activeTokenId);
      if (activeTok) {
        const cx = (activeTok.x + 0.5) * gridSize;
        const cy = (activeTok.y + 0.5) * gridSize;
        const radius = (gridSize * 0.45);
        renderTurnReticleOnCanvas(ctx, cx, cy, radius, animTime);
      }
    }

    // 11. Tokens (Players always rendered; monsters rendered ONLY if in player active LOS)
    for (const tok of visibleTokens) {
      if (!tok.isPlayer) {
        if (canvasStore.dynamicLightingEnabled && activeVisionPolygons.length > 0) {
          const centerPx = {
            x: (tok.x + 0.5) * gridSize,
            y: (tok.y + 0.5) * gridSize,
          };
          const isVisibleToPlayer = activeVisionPolygons.some(({ polygon }) =>
            isPointInPolygon(centerPx, polygon)
          );
          if (!isVisibleToPlayer) {
            // Masked in fog of war! Omit from projector screen
            continue;
          }
        }
      }
      drawProjectorToken(ctx, tok, gridSize, vp.zoom);
    }

    // 11b. Overhead Tile Roofs (Evaluated strictly against party player tokens)
    if (canvasStore.overheadTiles && canvasStore.overheadTiles.length > 0) {
      renderProjectorOverheadTiles(ctx, canvasStore.overheadTiles, gridSize);
    }

    // 11c. Shared Map Drawings (Freehand sketches, arrows, shapes, notes - strictly filtered to shared layer)
    if (drawingStore.sharedDrawings.length > 0) {
      renderSharedDrawingsOnCanvas2D(ctx, drawingStore.sharedDrawings, vp.zoom);
    }

    // 11d. Revealed Traps (Only traps that have been triggered and revealed - never un-triggered zones)
    if (canvasStore.triggerZones && canvasStore.triggerZones.length > 0) {
      for (const zone of canvasStore.triggerZones) {
        if (zone.triggerType === 'trap' && zone.isTriggered) {
          const poly = zone.shape === 'rectangle' && zone.coordinates.length >= 2
            ? [
                { x: Math.min(zone.coordinates[0].x, zone.coordinates[1].x), y: Math.min(zone.coordinates[0].y, zone.coordinates[1].y) },
                { x: Math.max(zone.coordinates[0].x, zone.coordinates[1].x), y: Math.min(zone.coordinates[0].y, zone.coordinates[1].y) },
                { x: Math.max(zone.coordinates[0].x, zone.coordinates[1].x), y: Math.max(zone.coordinates[0].y, zone.coordinates[1].y) },
                { x: Math.min(zone.coordinates[0].x, zone.coordinates[1].x), y: Math.max(zone.coordinates[0].y, zone.coordinates[1].y) },
              ]
            : zone.coordinates;
          if (poly.length >= 3) {
            let cx = 0, cy = 0;
            for (const p of poly) { cx += p.x; cy += p.y; }
            cx /= poly.length;
            cy /= poly.length;

            ctx.save();
            ctx.beginPath();
            ctx.arc(cx, cy, 22, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(127, 29, 29, 0.85)';
            ctx.fill();
            ctx.strokeStyle = '#ef4444';
            ctx.lineWidth = 2.5 / vp.zoom;
            ctx.stroke();

            ctx.font = '16px sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('⚠️', cx, cy);
            ctx.restore();
          }
        }
      }
    }


    // 12. Synchronized Map Pings & Attention Radar Rings
    const now = performance.now();
    const livePings: ProjectorPing[] = [];
    for (const ping of activePings) {
      const elapsed = now - ping.startTime;
      if (elapsed < 1200) {
        livePings.push(ping);
        const progress = elapsed / 1200;
        const radius = progress * 50;
        const alpha = Math.max(0, 1.0 - progress);

        ctx.save();
        // Expanding ring
        ctx.beginPath();
        ctx.arc(ping.x, ping.y, radius, 0, Math.PI * 2);
        ctx.strokeStyle = ping.color;
        ctx.lineWidth = Math.max(1, 3 * (1 - progress));
        ctx.globalAlpha = alpha;
        ctx.stroke();

        // Secondary ring
        if (progress > 0.3) {
          const p2 = (progress - 0.3) / 0.7;
          ctx.beginPath();
          ctx.arc(ping.x, ping.y, p2 * 50, 0, Math.PI * 2);
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 1.5;
          ctx.globalAlpha = (1.0 - p2) * 0.6;
          ctx.stroke();
        }

        // Center dot
        ctx.beginPath();
        ctx.arc(ping.x, ping.y, 5, 0, Math.PI * 2);
        ctx.fillStyle = ping.color;
        ctx.globalAlpha = alpha;
        ctx.fill();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.5;
        ctx.stroke();

        // Floating Tag
        ctx.font = 'bold 10px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const tagText = ping.sender_name;
        const tagW = ctx.measureText(tagText).width + 12;
        const tagH = 16;
        const tagX = ping.x - tagW / 2;
        const tagY = ping.y - 22;

        ctx.fillStyle = 'rgba(9, 11, 16, 0.85)';
        ctx.fillRect(tagX, tagY, tagW, tagH);
        ctx.strokeStyle = ping.color;
        ctx.lineWidth = 1.5;
        ctx.strokeRect(tagX, tagY, tagW, tagH);

        ctx.fillStyle = '#ffffff';
        ctx.fillText(tagText, ping.x, tagY + tagH / 2);

        ctx.restore();
      }
    }
    activePings = livePings;

    ctx.restore();
  }

  function drawProjectorToken(c: CanvasRenderingContext2D, tok: CanvasToken, gridSize: number, zoom: number) {
    const pad = gridSize * 0.1;
    const x = tok.x * gridSize + pad;
    const y = tok.y * gridSize + pad;
    const size = gridSize - pad * 2;
    const cx = x + size / 2;
    const cy = y + size / 2;
    const radius = size / 2;

    // Condition Rings (Blinded, Charmed, Concentrating, Poisoned, etc.)
    renderConditionRingsOnCanvas(c, cx, cy, radius, tok.conditions, animTime);

    // Black Orb Sealed State
    if (tok.isOrbSealed) {
      c.save();
      c.beginPath();
      c.arc(cx, cy, radius, 0, Math.PI * 2);
      c.fillStyle = '#1e1b4b';
      c.fill();
      c.strokeStyle = '#a855f7';
      c.lineWidth = 2.5 / zoom;
      c.stroke();

      // Pulsing void aura
      c.beginPath();
      c.arc(cx, cy, radius + Math.sin(animTime * 3) * 3, 0, Math.PI * 2);
      c.strokeStyle = 'rgba(168, 85, 247, 0.4)';
      c.lineWidth = 1.5 / zoom;
      c.stroke();

      c.font = `bold ${Math.max(12, gridSize * 0.28)}px sans-serif`;
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillText('🔮', cx, cy);
      c.restore();
      return;
    }

    // Normal Token Body
    c.save();
    c.beginPath();
    c.roundRect(x, y, size, size, 8);
    c.fillStyle = tok.color || (tok.isPlayer ? '#4f46e5' : '#991b1b');
    c.fill();

    // Border: Amber for player, Crimson for monster
    c.strokeStyle = tok.isPlayer ? '#fbbf24' : '#ef4444';
    c.lineWidth = 2.0 / zoom;
    c.stroke();

    // Token Initials Label
    c.fillStyle = '#ffffff';
    c.font = `bold ${Math.max(10, gridSize * 0.22)}px sans-serif`;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    const initials = tok.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
    c.fillText(initials, cx, cy - 2);

    // Player Vitality Bar vs. Monster Vitality Pip
    if (tok.isPlayer) {
      if (projectorStore.playerSettings.showHealthBars) {
        // Players see their own HP bar
        const barH = Math.max(3, gridSize * 0.08);
        const barY = y + size - barH - 2;
        c.fillStyle = 'rgba(0,0,0,0.6)';
        c.fillRect(x + 2, barY, size - 4, barH);
        const pct = Math.max(0, Math.min(1, tok.hp / tok.maxHp));
        c.fillStyle = pct <= 0.25 ? '#ef4444' : pct <= 0.5 ? '#f59e0b' : '#22c55e';
        c.fillRect(x + 2, barY, (size - 4) * pct, barH);
      }
    } else {
      // Monsters NEVER show exact HP numbers to players — show Vitality state pip
      const vit = getVitalityState(tok.hp, tok.maxHp);
      const pipColor = vit.state === 'Healthy' ? '#22c55e' : vit.state === 'Bloodied' ? '#f59e0b' : '#ef4444';
      c.beginPath();
      c.arc(cx, y + size - 6, 3, 0, Math.PI * 2);
      c.fillStyle = pipColor;
      c.fill();
      c.strokeStyle = '#000000';
      c.lineWidth = 1;
      c.stroke();
    }

    c.restore();
  }
</script>

<svelte:head>
  <title>Projector Battle Mat — Graywood 5e VTT</title>
</svelte:head>

{#if projectorStore.castSource === 'blackout' || isPreloadingMap}
  <!-- Blackout Mode / Preload Buffer Shroud -->
  <div class="fixed inset-0 bg-black z-50 flex flex-col items-center justify-center select-none cursor-none p-8" aria-label="Projector Blackout">
    <div class="text-center opacity-30 animate-pulse flex flex-col items-center gap-3">
      <svg class="w-12 h-12 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l18 18" />
      </svg>
      <span class="text-sm font-serif tracking-widest text-slate-400 uppercase">
        {isPreloadingMap ? 'Buffering Next Encounter...' : 'The Scene Fades to Darkness'}
      </span>
      <span class="text-[11px] font-mono text-slate-600">
        {isPreloadingMap ? 'Uploading Texture to GPU VRAM' : 'Awaiting the Dungeon Master'}
      </span>
    </div>
  </div>
{:else if projectorStore.castSource === 'atlas'}
  <!-- World Atlas Mode: Overland vector map with POI pins -->
  <div class="fixed inset-0 bg-slate-950 text-slate-100 font-sans select-none overflow-hidden flex flex-col">
    <InitiativeRibbon isDm={false} />
    <div class="relative flex-1 w-full h-full">
      <AtlasMapView isDm={false} activeMapId={projectorStore.activeMapId} />
    </div>
    <!-- Bottom-Left Status Watermark -->
    <div class="absolute bottom-3 left-4 z-10 pointer-events-none text-[10px] font-mono font-bold text-slate-600/70 uppercase tracking-wider flex items-center gap-2">
      <span>PROJECTOR ATLAS DISPLAY</span>
      <span class="text-emerald-500/80">🗺️ OVERLAND VIEW</span>
    </div>
  </div>
{:else if projectorStore.castSource === 'handout'}
  <!-- Handout Mode: Full-screen framed visual with parchment backing & vignette -->
  <div class="fixed inset-0 bg-stone-950 text-stone-900 font-serif select-none overflow-hidden flex flex-col items-center justify-center p-6 md:p-12">
    <!-- Ambient dark vignette background -->
    <div class="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_transparent_40%,_rgba(0,0,0,0.85)_100%)] pointer-events-none z-10"></div>

    <div class="relative z-20 max-w-4xl w-full max-h-[90vh] flex flex-col bg-[#f4ebd0] border-4 border-[#8c6d46] rounded-lg shadow-2xl overflow-hidden p-6 md:p-8 text-stone-900">
      {#if projectorStore.activeHandout}
        <h1 class="text-2xl md:text-4xl font-bold font-serif tracking-wider text-center text-[#3b2a1a] border-b-2 border-[#8c6d46]/40 pb-3 mb-6">
          {projectorStore.activeHandout.title}
        </h1>

        <div class="flex-1 overflow-y-auto flex flex-col items-center gap-6 pr-2">
          {#if projectorStore.activeHandout.imageUrl}
            <div class="max-h-[55vh] flex items-center justify-center border-2 border-[#8c6d46]/50 rounded p-2 bg-[#ebdcb9]/40 shadow-inner">
              <img
                src={projectorStore.activeHandout.imageUrl}
                alt={projectorStore.activeHandout.title}
                class="max-h-[50vh] max-w-full object-contain rounded drop-shadow-md"
              />
            </div>
          {/if}

          {#if projectorStore.activeHandout.playerContent}
            <div class="w-full prose prose-stone max-w-none text-base md:text-lg leading-relaxed text-[#2c1d11] whitespace-pre-line text-center md:text-left font-serif">
              {projectorStore.activeHandout.playerContent}
            </div>
          {/if}
        </div>
      {:else}
        <div class="flex flex-col items-center justify-center py-20 text-stone-500 font-sans">
          <span class="text-4xl mb-3">📜</span>
          <p class="text-lg">No handout currently selected for display.</p>
        </div>
      {/if}
    </div>

    <!-- Bottom Status Watermark -->
    <div class="absolute bottom-3 left-4 z-20 pointer-events-none text-[10px] font-mono font-bold text-stone-500/80 uppercase tracking-wider flex items-center gap-2">
      <span>PROJECTOR HANDOUT DISPLAY</span>
      <span class="text-amber-500/90">📜 PLAYER LORE</span>
    </div>
  </div>
{:else}
  <!-- Battlemap Mode: Full Tactical Canvas -->
  <div class="fixed inset-0 bg-slate-950 text-slate-100 font-sans select-none overflow-hidden flex flex-col">

    <!-- ═════════════════════════════════════════════════════════════════════════
         SHARED INITIATIVE RIBBON (PLAYER-FACING, READ-ONLY)
    ══════════════════════════════════════════════════════════════════════════ -->
    <InitiativeRibbon isDm={false} />

    {#if liveCombat && liveCombat.combatants && liveCombat.combatants.length > 0}
      {@const activeCombatant = liveCombat.combatants.find(c => c.is_active)}
      {@const onDeckCombatant = liveCombat.combatants.find(c => c.is_on_deck)}
      <div class="absolute top-14 left-1/2 -translate-x-1/2 z-20 pointer-events-none">
        <div class="flex items-center gap-3 px-5 py-2.5 rounded-2xl bg-slate-950/80 backdrop-blur-md border border-slate-800/80 shadow-2xl shadow-indigo-950/50">
          
          <!-- Round Badge -->
          <div class="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-indigo-950/80 border border-indigo-500/40 text-indigo-200 text-xs font-mono font-black">
            <span>⚔️</span>
            <span>RND {liveCombat.round}</span>
          </div>

          <!-- Active Combatant -->
          <div class="flex items-center gap-2">
            <span class="text-[11px] font-bold uppercase tracking-wider text-slate-400">Turn:</span>
            {#if activeCombatant}
              {@const tok = canvasStore.tokens.find(t => t.id === activeCombatant.id || t.name.toLowerCase() === activeCombatant.name.toLowerCase())}
              {@const isMonsterHiddenByFog = !activeCombatant.is_player && canvasStore.dynamicLightingEnabled && activeVisionPolygons.length > 0 && tok
                ? !activeVisionPolygons.some(({ polygon }) => isPointInPolygon({ x: (tok.x + 0.5) * canvasStore.gridSize, y: (tok.y + 0.5) * canvasStore.gridSize }, polygon))
                : false}
              {@const isRedacted = Boolean(activeCombatant.is_hidden || isMonsterHiddenByFog)}
              {@const vit = tok ? getVitalityState(tok.hp, tok.maxHp) : null}
              <div class="flex items-center gap-2">
                <span class="text-sm font-black text-amber-300 animate-pulse">
                  {isRedacted ? 'Unknown Creature' : activeCombatant.name}
                </span>
                {#if vit && !activeCombatant.is_player && !isRedacted}
                  <span class="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase border {vit.badgeBg} {vit.textColor} {vit.borderColor}">
                    {vit.label}
                  </span>
                {/if}
              </div>
            {:else}
              <span class="text-sm font-bold text-slate-400">None</span>
            {/if}
          </div>

          <!-- Divider -->
          <div class="w-px h-5 bg-slate-800"></div>

          <!-- On Deck Combatant -->
          {#if onDeckCombatant}
            {@const onDeckTok = canvasStore.tokens.find(t => t.id === onDeckCombatant.id || t.name.toLowerCase() === onDeckCombatant.name.toLowerCase())}
            {@const isOnDeckHiddenByFog = !onDeckCombatant.is_player && canvasStore.dynamicLightingEnabled && activeVisionPolygons.length > 0 && onDeckTok
              ? !activeVisionPolygons.some(({ polygon }) => isPointInPolygon({ x: (onDeckTok.x + 0.5) * canvasStore.gridSize, y: (onDeckTok.y + 0.5) * canvasStore.gridSize }, polygon))
              : false}
            <div class="flex items-center gap-1.5 text-xs text-slate-400">
              <span class="text-[10px] uppercase font-semibold">On Deck:</span>
              <span class="font-bold text-slate-200">
                {onDeckCombatant.is_hidden || isOnDeckHiddenByFog ? 'Unknown' : onDeckCombatant.name}
              </span>
            </div>
          {/if}

        </div>
      </div>
    {/if}

    <!-- ═════════════════════════════════════════════════════════════════════════
         FULLSCREEN BATTLE MAT CANVAS (TOUCH/GESTURE GUARDED & TV ROTATED)
    ══════════════════════════════════════════════════════════════════════════ -->
    <div
      class="relative flex-1 w-full h-full overflow-hidden select-none"
      style="touch-action: none; -webkit-touch-callout: none;"
      oncontextmenu={(e) => e.preventDefault()}
      role="region"
      aria-label="Battle Mat Canvas Viewport"
    >
      <canvas
        bind:this={canvasEl}
        class="block w-full h-full cursor-default transition-transform duration-200"
        style="touch-action: none; transform: rotate({projectorRotation}deg); transform-origin: center center;"
        onpointerdown={handleProjectorPointerDown}
        oncontextmenu={(e) => e.preventDefault()}
      ></canvas>
    </div>

    <!-- Bottom Status Watermarks & Tabletop Tools -->
    <div class="absolute bottom-3 left-4 z-10 pointer-events-none text-[10px] font-mono font-bold text-slate-600/70 uppercase tracking-wider flex items-center gap-2">
      <span>PROJECTOR DISPLAY</span>
      {#if canvasStore.lockProjectorPan}
        <span class="text-amber-500/80">🔒 CAMERA LOCKED</span>
      {:else}
        <span class="text-emerald-500/80">🎥 SYNCED TO DM</span>
      {/if}
      {#if projectorRotation > 0}
        <span class="text-indigo-400/80">🔄 {projectorRotation}°</span>
      {/if}
    </div>

    <!-- Bottom-Right Tabletop TV Calibration Button -->
    <div class="absolute bottom-3 right-4 z-30 pointer-events-auto">
      <button
        type="button"
        class="px-2.5 py-1 bg-slate-900/80 hover:bg-slate-800 border border-slate-700/80 text-slate-300 hover:text-white rounded-lg text-xs font-mono font-medium backdrop-blur-md transition-all shadow-xl flex items-center gap-1.5"
        onclick={() => showPhysicalCalibration = !showPhysicalCalibration}
        title="Physical 1-Inch Scale Calibration for Tabletop Displays"
      >
        <span>📏 1-Inch Scale</span>
      </button>
    </div>

    <!-- ── Tabletop Hardware Calibration & TV Orientation Wizard ────────── -->
    <TabletopCalibrationOverlay
      bind:isOpen={showPhysicalCalibration}
      bind:rotation={projectorRotation}
      onClose={() => showPhysicalCalibration = false}
    />

  </div>
{/if}

{#if activeHandout}
  <!-- Animated High-Resolution Player Handout Modal Overlay -->
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <div
    class="fixed inset-0 z-50 bg-black/90 backdrop-blur-md flex items-center justify-center p-6 animate-in fade-in select-none cursor-pointer"
    role="dialog"
    tabindex="-1"
    aria-modal="true"
    aria-label="Broadcast Handout"
    onclick={() => activeHandout = null}
  >
    <!-- Inner dialog stopping backdrop propagation -->
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
    <div
      class="relative max-w-4xl max-h-[90vh] bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl overflow-hidden flex flex-col items-center p-4 cursor-default"
      onclick={(e) => e.stopPropagation()}
      role="document"
    >
      <div class="w-full flex justify-between items-center pb-3 border-b border-slate-800">
        <div>
          <h2 class="text-base font-black text-amber-300 uppercase tracking-widest">{activeHandout.title}</h2>
          {#if activeHandout.caption}
            <p class="text-xs text-slate-400 mt-0.5">{activeHandout.caption}</p>
          {/if}
        </div>
        <button
          type="button"
          onclick={() => activeHandout = null}
          class="px-3 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-bold transition-colors"
        >
          ✕
        </button>
      </div>
      <div class="mt-4 flex-1 overflow-y-auto w-full flex flex-col items-center justify-center space-y-3">
        {#if activeHandout.image_url || activeHandout.url}
          <img
            src={activeHandout.image_url || activeHandout.url}
            alt={activeHandout.title}
            class="max-w-full max-h-[60vh] object-contain rounded-xl shadow-2xl border border-slate-800"
          />
        {/if}
        {#if activeHandout.content}
          <div class="w-full max-w-2xl bg-slate-950/70 p-4 rounded-xl border border-slate-800/80 text-sm text-slate-200 whitespace-pre-wrap font-sans leading-relaxed">
            {activeHandout.content}
          </div>
        {/if}
      </div>
    </div>
  </div>
{/if}

<!-- ── 3D Synchronized Tabletop Projector Dice Overlay ────────────────────── -->
<Dice3DOverlay theme="gold" />

<!-- ── DM Staging Curtain ("Blackout Veil") Overlay ────────────────────── -->
{#if curtainStore.active}
  <div class="fixed inset-0 z-50 flex items-center justify-center bg-black transition-opacity duration-300">
    <span class="text-zinc-600 font-mono tracking-widest uppercase text-sm">Scene Staging in Progress</span>
  </div>
{/if}

