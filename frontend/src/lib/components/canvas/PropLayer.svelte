<!-- PropLayer.svelte — PixiJS v8 Canvas Prop & Tile Interactive Layer -->
<!-- Renders ground/overhead static props with drag, scale, rotate, flip, lock handles. -->

<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { Container, Sprite, Graphics, Assets, Text } from 'pixi.js';
  import type { Application, Texture } from 'pixi.js';
  import { propStore } from '../../stores/propStore.svelte';
  import type { CanvasProp } from '../../types/prop';

  interface Props {
    pixiApp: Application | null;
    groundContainer: Container | null;   // below tokens
    overheadContainer: Container | null; // above tokens
    gridSize?: number;
    zoom?: number;
    panX?: number;
    panY?: number;
    screenToWorld: (sx: number, sy: number) => { x: number; y: number };
    worldToScreen: (wx: number, wy: number) => { x: number; y: number };
    isDmView?: boolean;
  }

  let {
    pixiApp,
    groundContainer,
    overheadContainer,
    gridSize = 60,
    zoom = 1,
    panX = 0,
    panY = 0,
    screenToWorld,
    worldToScreen,
    isDmView = true,
  }: Props = $props();

  // ── Internal PixiJS containers ─────────────────────────────────────────────
  let groundLayer: Container | null = null;
  let overheadLayer: Container | null = null;
  let handleLayer: Container | null = null; // transform handles (DM only, screen-space)

  // ── Sprite cache ───────────────────────────────────────────────────────────
  const spriteMap = new Map<string, { sprite: Sprite; texture: Texture }>();

  // ── Drag state ─────────────────────────────────────────────────────────────
  let isDragging = false;
  let draggingPropId: string | null = null;
  let dragOffset = { x: 0, y: 0 };

  // ── Scale handle state ─────────────────────────────────────────────────────
  let isScaling = false;
  let scaleCorner = 0; // 0-3 corners
  let scaleStartWorld = { x: 0, y: 0 };
  let scaleStartW = 0;
  let scaleStartH = 0;

  // ── Rotation handle state ──────────────────────────────────────────────────
  let isRotating = false;
  let rotatePivot = { x: 0, y: 0 };

  // ── Keyboard handler ───────────────────────────────────────────────────────
  function handleKeyDown(e: KeyboardEvent) {
    if (!isDmView) return;
    // Ignore when typing in an input/textarea
    if ((e.target as HTMLElement)?.tagName === 'INPUT' || (e.target as HTMLElement)?.tagName === 'TEXTAREA') return;
    if (!propStore.selectedPropId) return;
    switch (e.key.toUpperCase()) {
      case 'R':
        e.preventDefault();
        propStore.rotateSelected(Math.PI / 4); // +45°
        break;
      case 'H':
        e.preventDefault();
        propStore.flipSelected('x');
        break;
      case 'V':
        e.preventDefault();
        propStore.flipSelected('y');
        break;
      case 'L':
        e.preventDefault();
        propStore.toggleLockSelected();
        break;
      case 'DELETE':
      case 'BACKSPACE':
        if (!propStore.selectedProp?.isLocked) {
          propStore.removeProp(propStore.selectedPropId!);
        }
        break;
    }
  }

  // ── Sync sprites from store state ──────────────────────────────────────────
  async function syncSprites() {
    if (!groundLayer || !overheadLayer) return;

    const currentIds = new Set(propStore.props.map((p) => p.id));

    // Remove stale sprites
    for (const [id, { sprite }] of spriteMap.entries()) {
      if (!currentIds.has(id)) {
        try { sprite.parent?.removeChild(sprite); sprite.destroy({ children: true }); } catch {}
        spriteMap.delete(id);
      }
    }

    // Add / update sprites
    for (const prop of propStore.props) {
      let entry = spriteMap.get(prop.id);

      if (!entry) {
        // Load texture
        let texture: Texture;
        try {
          texture = await Assets.load(prop.imageUrl);
        } catch {
          continue;
        }

        const sprite = new Sprite(texture);
        sprite.anchor.set(0.5);
        sprite.eventMode = isDmView ? 'static' : 'none';
        sprite.cursor = 'move';

        if (isDmView) {
          sprite.on('pointerdown', (ev) => onSpritePointerDown(ev.nativeEvent as PointerEvent, prop.id));
        }

        const layer = prop.layer === 'overhead' ? overheadLayer! : groundLayer!;
        layer.addChild(sprite);
        entry = { sprite, texture };
        spriteMap.set(prop.id, entry);
      }

      applyPropToSprite(prop, entry.sprite);
    }

    // Re-sort z-order within each layer
    [...spriteMap.entries()].forEach(([id, { sprite }]) => {
      const prop = propStore.props.find((p) => p.id === id);
      if (prop) sprite.zIndex = prop.zIndex;
    });

    renderHandles();
  }

  function applyPropToSprite(prop: CanvasProp, sprite: Sprite) {
    sprite.position.set(prop.x, prop.y);
    sprite.rotation = prop.rotation;
    sprite.scale.set(
      (prop.width / (sprite.texture.width || 1)) * (prop.flippedX ? -1 : 1),
      (prop.height / (sprite.texture.height || 1)) * (prop.flippedY ? -1 : 1)
    );
    sprite.alpha = 1;
    sprite.cursor = prop.isLocked ? 'default' : 'move';
    sprite.eventMode = isDmView ? 'static' : 'none';
  }

  // ── Transform Handle Rendering ─────────────────────────────────────────────
  function renderHandles() {
    if (!handleLayer || !isDmView) return;
    handleLayer.removeChildren().forEach((c) => { try { c.destroy({ children: true }); } catch {} });

    const prop = propStore.selectedProp;
    if (!prop) return;

    const sp = worldToScreen(prop.x, prop.y);
    const hw = (prop.width * zoom) / 2;
    const hh = (prop.height * zoom) / 2;

    const cos = Math.cos(prop.rotation);
    const sin = Math.sin(prop.rotation);

    // Helper: rotate a point around prop screen center
    function rotPt(dx: number, dy: number) {
      return {
        x: sp.x + cos * dx - sin * dy,
        y: sp.y + sin * dx + cos * dy,
      };
    }

    const corners = [
      rotPt(-hw, -hh), // TL
      rotPt(+hw, -hh), // TR
      rotPt(+hw, +hh), // BR
      rotPt(-hw, +hh), // BL
    ];

    // Outline rect
    const outline = new Graphics();
    outline.moveTo(corners[0].x, corners[0].y);
    corners.forEach((c) => outline.lineTo(c.x, c.y));
    outline.lineTo(corners[0].x, corners[0].y);
    outline.stroke({
      color: prop.isLocked ? 0xf59e0b : 0x6366f1,
      width: 1.5 / zoom,
      alpha: 0.9,
    });
    handleLayer.addChild(outline);

    if (!prop.isLocked) {
      // Corner scale handles
      corners.forEach((c, i) => {
        const handle = new Graphics();
        handle.rect(-5, -5, 10, 10).fill({ color: 0xffffff }).stroke({ color: 0x6366f1, width: 1.5 });
        handle.position.set(c.x, c.y);
        handle.eventMode = 'static';
        handle.cursor = 'nwse-resize';
        handle.on('pointerdown', (ev) => {
          ev.stopPropagation();
          startScale(ev.nativeEvent as PointerEvent, prop.id, i);
        });
        handleLayer!.addChild(handle);
      });

      // Rotation handle (top-center, offset by 20px)
      const topCenter = {
        x: (corners[0].x + corners[1].x) / 2 + (-sin * -20),
        y: (corners[0].y + corners[1].y) / 2 + (cos * -20),
      };
      const rotHandle = new Graphics();
      rotHandle.circle(0, 0, 7).fill({ color: 0xf59e0b }).stroke({ color: 0xffffff, width: 1.5 });
      rotHandle.position.set(topCenter.x, topCenter.y);
      rotHandle.eventMode = 'static';
      rotHandle.cursor = 'crosshair';
      rotHandle.on('pointerdown', (ev) => {
        ev.stopPropagation();
        startRotate(ev.nativeEvent as PointerEvent, prop.id);
      });
      handleLayer!.addChild(rotHandle);

      // Delete handle (top-right corner, small red ×)
      const tr = corners[1];
      const delHandle = new Graphics();
      delHandle.circle(0, 0, 8).fill({ color: 0xef4444 }).stroke({ color: 0xffffff, width: 1 });
      const delText = new Text({ text: '×', style: { fontSize: 11, fill: 0xffffff, fontWeight: 'bold' } });
      delText.anchor.set(0.5);
      delHandle.addChild(delText);
      delHandle.position.set(tr.x + cos * 12 - sin * (-12), tr.y + sin * 12 + cos * (-12));
      delHandle.eventMode = 'static';
      delHandle.cursor = 'pointer';
      delHandle.on('pointerdown', (ev) => {
        ev.stopPropagation();
        propStore.removeProp(prop.id);
      });
      handleLayer!.addChild(delHandle);

      // Lock-toggle handle (top-left, small amber 🔒)
      const tl = corners[0];
      const lockHandle = new Graphics();
      lockHandle.circle(0, 0, 8).fill({ color: 0x374151 }).stroke({ color: 0xf59e0b, width: 1 });
      const lockText = new Text({ text: '🔒', style: { fontSize: 9 } });
      lockText.anchor.set(0.5);
      lockHandle.addChild(lockText);
      lockHandle.position.set(tl.x + cos * (-12) - sin * (-12), tl.y + sin * (-12) + cos * (-12));
      lockHandle.eventMode = 'static';
      lockHandle.cursor = 'pointer';
      lockHandle.on('pointerdown', (ev) => {
        ev.stopPropagation();
        propStore.toggleLockSelected();
      });
      handleLayer!.addChild(lockHandle);
    }
  }

  // ── Drag ───────────────────────────────────────────────────────────────────
  function onSpritePointerDown(e: PointerEvent, propId: string) {
    const prop = propStore.props.find((p) => p.id === propId);
    if (!prop || prop.isLocked) return;
    e.stopPropagation();

    propStore.selectProp(propId);
    isDragging = true;
    draggingPropId = propId;
    const world = screenToWorld(e.clientX, e.clientY);
    dragOffset = { x: world.x - prop.x, y: world.y - prop.y };

    window.addEventListener('pointermove', onWindowPointerMove);
    window.addEventListener('pointerup', onWindowPointerUp);
  }

  function onWindowPointerMove(e: PointerEvent) {
    if (isDragging && draggingPropId) {
      const world = screenToWorld(e.clientX, e.clientY);
      propStore.updateProp(draggingPropId, {
        x: world.x - dragOffset.x,
        y: world.y - dragOffset.y,
      });
      renderHandles();
    } else if (isScaling && draggingPropId) {
      onScaleMove(e);
    } else if (isRotating && draggingPropId) {
      onRotateMove(e);
    }
  }

  function onWindowPointerUp(_e: PointerEvent) {
    isDragging = false;
    isScaling = false;
    isRotating = false;
    draggingPropId = null;
    window.removeEventListener('pointermove', onWindowPointerMove);
    window.removeEventListener('pointerup', onWindowPointerUp);
  }

  // ── Scale ──────────────────────────────────────────────────────────────────
  function startScale(e: PointerEvent, propId: string, corner: number) {
    const prop = propStore.props.find((p) => p.id === propId);
    if (!prop) return;
    isScaling = true;
    draggingPropId = propId;
    scaleCorner = corner;
    const world = screenToWorld(e.clientX, e.clientY);
    scaleStartWorld = world;
    scaleStartW = prop.width;
    scaleStartH = prop.height;
    window.addEventListener('pointermove', onWindowPointerMove);
    window.addEventListener('pointerup', onWindowPointerUp);
  }

  function onScaleMove(e: PointerEvent) {
    if (!draggingPropId) return;
    const world = screenToWorld(e.clientX, e.clientY);
    const dx = (world.x - scaleStartWorld.x) * 2;
    const dy = (world.y - scaleStartWorld.y) * 2;
    // Mirror delta based on which corner
    const signX = scaleCorner === 0 || scaleCorner === 3 ? -1 : 1;
    const signY = scaleCorner === 0 || scaleCorner === 1 ? -1 : 1;
    propStore.updateProp(draggingPropId, {
      width: Math.max(20, scaleStartW + dx * signX),
      height: Math.max(20, scaleStartH + dy * signY),
    });
    renderHandles();
  }

  // ── Rotation ───────────────────────────────────────────────────────────────
  function startRotate(e: PointerEvent, propId: string) {
    const prop = propStore.props.find((p) => p.id === propId);
    if (!prop) return;
    isRotating = true;
    draggingPropId = propId;
    rotatePivot = { x: prop.x, y: prop.y };
    window.addEventListener('pointermove', onWindowPointerMove);
    window.addEventListener('pointerup', onWindowPointerUp);
  }

  function onRotateMove(e: PointerEvent) {
    if (!draggingPropId) return;
    const world = screenToWorld(e.clientX, e.clientY);
    const angle = Math.atan2(world.y - rotatePivot.y, world.x - rotatePivot.x) + Math.PI / 2;
    propStore.updateProp(draggingPropId, { rotation: angle });
    renderHandles();
  }

  // ── Lifecycle ──────────────────────────────────────────────────────────────
  onMount(() => {
    if (!groundContainer || !overheadContainer) return;

    groundLayer = new Container();
    groundContainer.addChild(groundLayer);

    overheadLayer = new Container();
    overheadContainer.addChild(overheadLayer);

    if (isDmView && pixiApp) {
      // Handle layer is screen-space (on the Pixi stage, not worldContainer)
      handleLayer = new Container();
      handleLayer.zIndex = 9500;
      pixiApp.stage.addChild(handleLayer);
    }

    syncSprites();
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('vtt:prop-update', handleWsEvent as EventListener);
  });

  onDestroy(() => {
    window.removeEventListener('keydown', handleKeyDown);
    window.removeEventListener('pointermove', onWindowPointerMove);
    window.removeEventListener('pointerup', onWindowPointerUp);
    window.removeEventListener('vtt:prop-update', handleWsEvent as EventListener);

    for (const { sprite } of spriteMap.values()) {
      try { sprite.destroy({ children: true, texture: false }); } catch {}
    }
    spriteMap.clear();

    if (handleLayer) {
      handleLayer.removeChildren().forEach((c) => { try { c.destroy({ children: true }); } catch {} });
      try { handleLayer.destroy({ children: true }); } catch {}
      handleLayer = null;
    }
  });

  function handleWsEvent(e: CustomEvent) {
    propStore.applyWsUpdate(e.detail);
  }

  // ── Reactively sync on store change ───────────────────────────────────────
  $effect(() => {
    const _props = propStore.props.map((p) => ({ ...p }));
    const _sel = propStore.selectedPropId;
    if (groundLayer || overheadLayer) {
      syncSprites();
    }
  });

  // Handles re-render when selection changes or zoom/pan changes
  $effect(() => {
    const _sel = propStore.selectedPropId;
    const _z = zoom;
    const _px = panX;
    const _py = panY;
    renderHandles();
  });

  // ── Public drop handler: called from BattlemapCanvas handleDrop ────────────
  export function dropPropAtScreen(imageUrl: string, screenX: number, screenY: number, isPng: boolean) {
    const world = screenToWorld(screenX, screenY);
    // Load to get natural dimensions, then create prop
    Assets.load(imageUrl).then((tex) => {
      const aspectRatio = (tex.height || 1) / (tex.width || 1);
      const w = gridSize * 2;
      const h = Math.round(w * aspectRatio);
      propStore.addProp({ imageUrl, x: world.x, y: world.y, width: w, height: h });
    }).catch(() => {
      propStore.addProp({ imageUrl, x: world.x, y: world.y });
    });
  }
</script>
<!-- PropLayer renders purely to PixiJS — no DOM markup needed -->
