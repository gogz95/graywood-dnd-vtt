<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { Application, Container, Graphics, Text, TextStyle } from 'pixi.js';
  import type { Token, Wall, MovementCollisionResult } from './types';
  import {
    computeTokenVisibility,
    checkMovementCollision,
    filterVisionWalls,
    wallsToSegments,
  } from './vision';
  import { spawnCombatantToken } from '../ipc/tauriBridge';
  import { dispatchSoundEvent } from '../audio/soundboardBridge';

  let {
    tokens = $bindable([] as Token[]),
    walls = $bindable([] as Wall[]),
    mapWidth = 1200,
    mapHeight = 800,
    gridSize = 50,
    onTokenMove,
    onDropMonster,
  }: {
    tokens?: Token[];
    walls?: Wall[];
    mapWidth?: number;
    mapHeight?: number;
    gridSize?: number;
    onTokenMove?: (id: string, x: number, y: number) => void;
    onDropMonster?: (monster: unknown, x: number, y: number) => void;
  } = $props();

  let canvasContainer: HTMLDivElement | null = $state(null);
  let pixiApp: Application | null = null;
  let statusBanner: string | null = $state(null);
  let statusBannerTimer: ReturnType<typeof setTimeout> | null = null;

  // PixiJS layer references
  let stageRoot: Container;
  let layer0Background: Graphics;
  let layer1Tokens: Container;
  let layerWalls: Container;
  let darknessContainer: Container;
  let layer2Darkness: Graphics;
  let layer3FogMask: Graphics;

  // Interaction tracking
  let draggedToken: Token | null = null;
  let dragStartPos = { x: 0, y: 0 };
  let activeTokenGraphics: Map<string, Container> = new Map();

  function showBanner(message: string) {
    statusBanner = message;
    if (statusBannerTimer) clearTimeout(statusBannerTimer);
    statusBannerTimer = setTimeout(() => {
      statusBanner = null;
    }, 3000);
  }

  onMount(async () => {
    if (!canvasContainer) return;

    pixiApp = new Application();
    await pixiApp.init({
      width: mapWidth,
      height: mapHeight,
      backgroundColor: 0x07080d,
      antialias: true,
      resolution: window.devicePixelRatio || 1,
      autoDensity: true,
    });

    canvasContainer.appendChild(pixiApp.canvas);

    setupScene();
    renderAll();
  });

  onDestroy(() => {
    if (statusBannerTimer) clearTimeout(statusBannerTimer);
    if (pixiApp) {
      pixiApp.destroy(true, { children: true, texture: true });
      pixiApp = null;
    }
  });

  function setupScene() {
    if (!pixiApp) return;

    stageRoot = new Container();
    pixiApp.stage.addChild(stageRoot);

    // Layer 0: Battle map background & grid
    layer0Background = new Graphics();
    stageRoot.addChild(layer0Background);
    drawDungeonBackground();

    // Layer 1: Token Layer
    layer1Tokens = new Container();
    stageRoot.addChild(layer1Tokens);

    // Overlay: Wall & Door Rendering
    layerWalls = new Container();
    stageRoot.addChild(layerWalls);

    // Layer 2 & 3: Ambient Darkness & Dynamic Fog Mask Container
    // In PixiJS v8, isRenderGroup isolates erase blend mode to its children
    darknessContainer = new Container({ isRenderGroup: true });
    stageRoot.addChild(darknessContainer);

    // Layer 2: Ambient Darkness (0x030712 at 0.95 opacity)
    layer2Darkness = new Graphics();
    layer2Darkness
      .rect(0, 0, mapWidth, mapHeight)
      .fill({ color: 0x030712, alpha: 0.95 });
    darknessContainer.addChild(layer2Darkness);

    // Layer 3: Dynamic Fog Mask (using ERASE blend mode)
    layer3FogMask = new Graphics();
    layer3FogMask.blendMode = 'erase';
    darknessContainer.addChild(layer3FogMask);

    // Global pointer interaction for drag cancellation
    pixiApp.stage.eventMode = 'static';
    pixiApp.stage.hitArea = pixiApp.screen;
    pixiApp.stage.on('pointermove', onGlobalPointerMove);
    pixiApp.stage.on('pointerup', onGlobalPointerUp);
    pixiApp.stage.on('pointerupoutside', onGlobalPointerUp);
  }

  function drawDungeonBackground() {
    layer0Background.clear();

    // Stone tile ground base
    layer0Background
      .rect(0, 0, mapWidth, mapHeight)
      .fill({ color: 0x171926 });

    // Grid lines (Tactical 50px grid)
    for (let x = 0; x <= mapWidth; x += gridSize) {
      layer0Background
        .moveTo(x, 0)
        .lineTo(x, mapHeight)
        .stroke({ color: 0x2e344e, width: 1, alpha: 0.4 });
    }
    for (let y = 0; y <= mapHeight; y += gridSize) {
      layer0Background
        .moveTo(0, y)
        .lineTo(mapWidth, y)
        .stroke({ color: 0x2e344e, width: 1, alpha: 0.4 });
    }

    // Outer stone perimeter border
    layer0Background
      .rect(0, 0, mapWidth, mapHeight)
      .stroke({ color: 0x475569, width: 4 });
  }

  function renderWalls() {
    layerWalls.removeChildren();

    for (let i = 0; i < walls.length; i++) {
      const wall = walls[i];
      const wallGraphic = new Graphics();

      if (wall.isDoor) {
        // Door representation (Clickable to toggle open/closed)
        const doorColor = wall.isOpen ? 0x10b981 : 0xd97706; // Emerald open, Amber closed
        wallGraphic
          .moveTo(wall.p1[0], wall.p1[1])
          .lineTo(wall.p2[0], wall.p2[1])
          .stroke({ color: doorColor, width: 6, cap: 'round' });

        // Door handle / node indicator
        const midX = (wall.p1[0] + wall.p2[0]) / 2;
        const midY = (wall.p1[1] + wall.p2[1]) / 2;
        wallGraphic
          .circle(midX, midY, 6)
          .fill({ color: doorColor })
          .stroke({ color: 0x000000, width: 1.5 });

        // Interactive Door Click Handler
        wallGraphic.eventMode = 'static';
        wallGraphic.cursor = 'pointer';
        wallGraphic.on('pointerdown', (e) => {
          e.stopPropagation();
          wall.isOpen = !wall.isOpen;
          showBanner(
            wall.isOpen
              ? 'Door Opened: Line of sight & passage restored.'
              : 'Door Closed: Line of sight & passage barred.'
          );
          renderWalls();
          renderVision();
        });
      } else {
        // Solid Wall Representation
        wallGraphic
          .moveTo(wall.p1[0], wall.p1[1])
          .lineTo(wall.p2[0], wall.p2[1])
          .stroke({ color: 0x38bdf8, width: 4, cap: 'round' }); // Neon cyan/slate wall
      }

      layerWalls.addChild(wallGraphic);
    }
  }

  function renderTokens() {
    layer1Tokens.removeChildren();
    activeTokenGraphics.clear();

    for (const token of tokens) {
      const tokenContainer = new Container();
      tokenContainer.position.set(token.x, token.y);
      tokenContainer.eventMode = 'static';
      tokenContainer.cursor = 'grab';

      const circle = new Graphics();
      const fillColor = token.tint ?? 0xf59e0b;

      if (token.isOrbSealed) {
        // Sealed token: Dark purple void style with red warning boundary
        circle
          .circle(0, 0, token.radius)
          .fill({ color: 0x3b0764, alpha: 0.8 })
          .stroke({ color: 0xef4444, width: 3 });
      } else {
        // Normal active token
        circle
          .circle(0, 0, token.radius)
          .fill({ color: fillColor, alpha: 0.9 })
          .stroke({ color: 0xffffff, width: 2.5 });
      }
      tokenContainer.addChild(circle);

      // Label text
      const label = new Text({
        text: token.name ?? token.id,
        style: new TextStyle({
          fontFamily: 'sans-serif',
          fontSize: 11,
          fontWeight: 'bold',
          fill: 0xffffff,
          stroke: { color: 0x000000, width: 3 },
          align: 'center',
        }),
      });
      label.anchor.set(0.5, 0.5);
      tokenContainer.addChild(label);

      // Token Drag Start Handler
      tokenContainer.on('pointerdown', (e) => {
        e.stopPropagation();
        draggedToken = token;
        dragStartPos = { x: token.x, y: token.y };
        tokenContainer.cursor = 'grabbing';
      });

      layer1Tokens.addChild(tokenContainer);
      activeTokenGraphics.set(token.id, tokenContainer);
    }
  }

  function onGlobalPointerMove(e: any) {
    if (!draggedToken || !pixiApp) return;

    const pos = e.getLocalPosition(stageRoot);
    const clampedX = Math.max(draggedToken.radius, Math.min(mapWidth - draggedToken.radius, pos.x));
    const clampedY = Math.max(draggedToken.radius, Math.min(mapHeight - draggedToken.radius, pos.y));

    draggedToken.x = clampedX;
    draggedToken.y = clampedY;

    const g = activeTokenGraphics.get(draggedToken.id);
    if (g) {
      g.position.set(clampedX, clampedY);
    }

    // Real-time dynamic vision update during drag
    renderVision();
  }

  function onGlobalPointerUp() {
    if (!draggedToken) return;

    const token = draggedToken;
    const g = activeTokenGraphics.get(token.id);

    // Movement Collision Check: start to end line intersection against active movement blockers
    const collision = checkMovementCollision(
      [dragStartPos.x, dragStartPos.y],
      [token.x, token.y],
      walls
    );

    if (collision.collides) {
      // Collision detected! Snap token back to starting coordinates
      token.x = dragStartPos.x;
      token.y = dragStartPos.y;
      if (g) {
        g.position.set(dragStartPos.x, dragStartPos.y);
      }
      showBanner(
        collision.hitWall?.isDoor
          ? 'Movement Barred: Closed door obstruction!'
          : 'Movement Barred: Solid wall collision!'
      );
    } else {
      // Movement validated!
      if (onTokenMove && (token.x !== dragStartPos.x || token.y !== dragStartPos.y)) {
        onTokenMove(token.id, token.x, token.y);
      }
    }

    if (g) {
      g.cursor = 'grab';
    }

    draggedToken = null;
    renderVision();
  }

  /**
   * Complete raycast visibility rendering pipeline:
   * 1. Filters active vision walls: excludes open doors.
   * 2. Runs visibility-polygon compute on each unsealed token.
   * 3. Draws polygons into layer3FogMask with ERASE blend mode to clear ambient darkness.
   */
  export function renderVision() {
    if (!layer3FogMask) return;

    layer3FogMask.clear();

    for (const token of tokens) {
      // Tokens sealed in the Black Orb cast zero vision
      if (token.isOrbSealed) {
        continue;
      }

      const polygon = computeTokenVisibility(
        token,
        walls,
        { width: mapWidth, height: mapHeight }
      );

      if (polygon.length >= 3) {
        // Flatten [ [x, y], ... ] into [x0, y0, x1, y1, ...]
        const flatPoints: number[] = [];
        for (const [px, py] of polygon) {
          flatPoints.push(px, py);
        }

        layer3FogMask
          .poly(flatPoints)
          .fill({ color: 0xffffff, alpha: 1.0 });

        // Soft peripheral ambient sight circle around the token
        layer3FogMask
          .circle(token.x, token.y, token.radius * 2.5)
          .fill({ color: 0xffffff, alpha: 1.0 });
      }
    }
  }

  function handleDragOver(e: DragEvent) {
    e.preventDefault();
    if (e.dataTransfer) {
      e.dataTransfer.dropEffect = 'copy';
    }
  }

  async function handleDrop(e: DragEvent) {
    e.preventDefault();
    if (!canvasContainer || !e.dataTransfer) return;

    const rawJson = e.dataTransfer.getData('application/json');
    if (!rawJson) return;

    try {
      const monster = JSON.parse(rawJson);
      const rect = canvasContainer.getBoundingClientRect();
      const dropX = Math.round(e.clientX - rect.left);
      const dropY = Math.round(e.clientY - rect.top);

      // Trigger IPC / REST token spawn call
      const res = await spawnCombatantToken({
        encounter_id: 'encounter-1',
        monster_compendium_id: monster.id,
        custom_name: monster.name,
        canvas_x: dropX,
        canvas_y: dropY,
      });

      // Add to local canvas tokens
      const newToken: Token = {
        id: res.token_id,
        name: monster.name,
        x: dropX,
        y: dropY,
        radius: 22,
        sightRadius: 280,
        darkvisionRadius: 180,
        isOrbSealed: false,
        tint: 0xef4444,
      };

      tokens = [...tokens, newToken];
      renderAll();

      dispatchSoundEvent('fireball');
      showBanner(`Spawned ${monster.name} at (${dropX}, ${dropY}) [AC ${monster.ac} | HP ${monster.hp_max}]`);

      if (onDropMonster) {
        onDropMonster(monster, dropX, dropY);
      }
    } catch (err) {
      console.error('Error dropping monster onto canvas:', err);
    }
  }

  export function renderAll() {
    drawDungeonBackground();
    renderWalls();
    renderTokens();
    renderVision();
  }

  // Reactive updates when tokens or walls props change
  $effect(() => {
    if (pixiApp && stageRoot) {
      renderAll();
    }
  });
</script>

<div class="relative w-full overflow-hidden bg-dark-950 rounded-2xl border border-dark-700/80 shadow-2xl flex flex-col items-center">
  <!-- Interactive Tactical Mat Controls / Status Header -->
  <div class="w-full bg-dark-900 px-4 py-2.5 border-b border-dark-800 flex items-center justify-between text-xs text-slate-300">
    <div class="flex items-center gap-2 font-bold uppercase tracking-wider">
      <span class="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
      <span>Tactical Battle Mat (PixiJS v8 Engine)</span>
    </div>
    <div class="flex items-center gap-3 text-slate-400 font-mono text-[11px]">
      <span>Walls: {walls.length}</span>
      <span>&bull;</span>
      <span>Tokens: {tokens.length}</span>
      <span>&bull;</span>
      <span>Grid: {gridSize}px</span>
    </div>
  </div>

  <!-- Real-Time Movement / Door Status Banner -->
  {#if statusBanner}
    <div class="absolute top-12 z-20 px-4 py-1.5 rounded-full bg-red-950/90 border border-red-500/70 text-red-200 text-xs font-bold shadow-lg animate-pulse">
      {statusBanner}
    </div>
  {/if}

  <!-- Canvas Mount Target with Drag-and-Drop Monster Spawning -->
  <div
    bind:this={canvasContainer}
    ondragover={handleDragOver}
    ondrop={handleDrop}
    class="overflow-auto max-w-full touch-none select-none cursor-crosshair relative"
    style="width: {mapWidth}px; height: {mapHeight}px;"
    role="region"
    aria-label="Tactical battle mat canvas"
  ></div>

  <!-- Instruction Footer -->
  <div class="w-full bg-dark-900/90 px-4 py-2 border-t border-dark-800 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-400">
    <div>
      <span class="font-bold text-slate-300">Token Drag &amp; Drop:</span> Drag tokens to reposition with dynamic raycasting. Drag compendium monsters directly onto the grid to spawn.
    </div>
    <div>
      <span class="font-bold text-amber-400">Doors:</span> Click any door node to toggle between Open (passage permitted) and Closed (vision &amp; movement barred).
    </div>
  </div>
</div>
