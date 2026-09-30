<script lang="ts">
  // frontend/src/lib/components/canvas/GridLayer.svelte
  // Reactive PixiJS v8 / Canvas Grid Layer supporting square, hex_pointy, and hex_flat geometries.

  import { onMount, onDestroy } from 'svelte';
  import { Container, Graphics } from 'pixi.js';
  import { snapToHex, getHexVertices, type HexOrientation } from '../../canvas/gridCalculations';

  let {
    gridType = 'square',
    cellSize = 60,
    gridOpacity = 0.35,
    gridColor = '#6366f1',
    width = 1920,
    height = 1080,
    parentContainer = null,
  }: {
    gridType?: 'square' | 'hex_pointy' | 'hex_flat' | 'hex-h' | 'hex-v' | 'gridless' | 'none';
    cellSize?: number;
    gridOpacity?: number;
    gridColor?: string;
    width?: number;
    height?: number;
    parentContainer?: Container | null;
  } = $props();

  let container = new Container();
  container.label = 'VTT_GridLayer';
  let graphics = new Graphics();
  container.addChild(graphics);

  export function getContainer(): Container {
    return container;
  }

  export function snapCoordinates(x: number, y: number): { x: number; y: number } {
    if (gridType === 'hex_pointy' || gridType === 'hex-v') {
      const radius = cellSize / Math.sqrt(3);
      const res = snapToHex(x, y, radius, 'pointy');
      return { x: res.x, y: res.y };
    }
    if (gridType === 'hex_flat' || gridType === 'hex-h') {
      const radius = cellSize / Math.sqrt(3);
      const res = snapToHex(x, y, radius, 'flat');
      return { x: res.x, y: res.y };
    }
    // Default square grid snap to cell center
    return {
      x: Math.floor(x / cellSize) * cellSize + cellSize / 2,
      y: Math.floor(y / cellSize) * cellSize + cellSize / 2,
    };
  }

  function parseHexColor(colorStr: string): number {
    if (colorStr.startsWith('#')) {
      return parseInt(colorStr.slice(1), 16);
    }
    return 0x6366f1;
  }

  export function renderGrid(): void {
    graphics.clear();
    if (gridType === 'gridless' || gridType === 'none' || gridOpacity <= 0 || cellSize <= 0) {
      return;
    }

    const strokeColor = parseHexColor(gridColor);

    if (gridType === 'square') {
      const cols = Math.ceil(width / cellSize);
      const rows = Math.ceil(height / cellSize);

      for (let c = 0; c <= cols; c++) {
        graphics.moveTo(c * cellSize, 0);
        graphics.lineTo(c * cellSize, rows * cellSize);
      }
      for (let r = 0; r <= rows; r++) {
        graphics.moveTo(0, r * cellSize);
        graphics.lineTo(cols * cellSize, r * cellSize);
      }
    } else if (gridType === 'hex_pointy' || gridType === 'hex-v') {
      const radius = cellSize / Math.sqrt(3);
      const deltaX = cellSize;
      const deltaY = 1.5 * radius;

      const cols = Math.ceil(width / deltaX) + 1;
      const rows = Math.ceil(height / deltaY) + 1;

      for (let c = 0; c <= cols; c++) {
        const cx = c * deltaX;
        const yOffset = (Math.abs(c) % 2 === 1) ? deltaY / 2 : 0;
        for (let r = 0; r <= rows; r++) {
          const cy = r * deltaY + yOffset;
          const verts = getHexVertices(cx, cy, radius, 'pointy');
          graphics.moveTo(verts[0].x, verts[0].y);
          for (let i = 1; i < verts.length; i++) {
            graphics.lineTo(verts[i].x, verts[i].y);
          }
          graphics.lineTo(verts[0].x, verts[0].y);
        }
      }
    } else if (gridType === 'hex_flat' || gridType === 'hex-h') {
      const radius = cellSize / Math.sqrt(3);
      const deltaX = 1.5 * radius;
      const deltaY = cellSize;

      const cols = Math.ceil(width / deltaX) + 1;
      const rows = Math.ceil(height / deltaY) + 1;

      for (let r = 0; r <= rows; r++) {
        const cy = r * deltaY;
        const xOffset = (Math.abs(r) % 2 === 1) ? deltaX / 2 : 0;
        for (let c = 0; c <= cols; c++) {
          const cx = c * deltaX + xOffset;
          const verts = getHexVertices(cx, cy, radius, 'flat');
          graphics.moveTo(verts[0].x, verts[0].y);
          for (let i = 1; i < verts.length; i++) {
            graphics.lineTo(verts[i].x, verts[i].y);
          }
          graphics.lineTo(verts[0].x, verts[0].y);
        }
      }
    }

    graphics.stroke({
      color: strokeColor,
      width: 1,
      alpha: gridOpacity,
    });
  }

  $effect(() => {
    // Re-render when reactive properties change
    renderGrid();
  });

  onMount(() => {
    if (parentContainer) {
      parentContainer.addChild(container);
    }
    renderGrid();
  });

  onDestroy(() => {
    graphics.clear();
    container.destroy({ children: true });
  });
</script>
