<!-- src/lib/components/canvas/PingLayer.svelte -->
<!-- Synchronized Map Ping and Attention Radar Animation Layer (PixiJS v8 & Svelte 5 Runes) -->
<script lang="ts" module>
  import { sendWsEvent } from '../../../stores/websocketStore';
  import { broadcastBattlematUpdate } from '../../services/battlematSyncBridge';

  export interface PingPayload {
    x: number;
    y: number;
    color?: string;
    sender_name?: string;
  }

  export function broadcastPingPoint(payload: PingPayload) {
    const color = payload.color || '#38bdf8';
    const sender_name = payload.sender_name || 'Player';

    // 1. Cross-window BroadcastChannel
    try {
      broadcastBattlematUpdate({
        type: 'PING_POINT',
        x: payload.x,
        y: payload.y,
        color,
        sender_name,
      });
    } catch {}

    // 2. Axum WebSocket Relay
    try {
      sendWsEvent({
        type: 'PING_POINT',
        x: payload.x,
        y: payload.y,
        color,
        sender_name,
      });
    } catch {}

    // 3. Local window custom event for immediate responsive feedback
    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('vtt:ping-point', {
          detail: {
            x: payload.x,
            y: payload.y,
            color,
            sender_name,
          },
        })
      );
    }
  }
</script>

<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { Application, Container, Graphics, Text } from 'pixi.js';

  interface Props {
    pixiApp?: Application | null;
    worldContainer?: Container | null;
  }

  let { pixiApp = null, worldContainer = null }: Props = $props();

  let pingContainer: Container | null = null;
  let activeAnimations = new Set<() => void>();

  $effect(() => {
    if (worldContainer && !pingContainer) {
      pingContainer = new Container();
      pingContainer.zIndex = 9999; // Above tokens and fog
      worldContainer.addChild(pingContainer);
    }
  });

  function parseHex(hexStr: string): number {
    const clean = hexStr.replace('#', '');
    const num = parseInt(clean, 16);
    return isNaN(num) ? 0x38bdf8 : num;
  }

  export function spawnPing(x: number, y: number, color = '#38bdf8', senderName = 'Player') {
    if (!pingContainer || !pixiApp) return;

    const numColor = parseHex(color);
    const node = new Container();
    node.position.set(x, y);

    // 1. Radar expanding ring graphics
    const ringGraphics = new Graphics();
    node.addChild(ringGraphics);

    // 2. Central pulse dot
    const centerDot = new Graphics();
    centerDot.circle(0, 0, 5).fill({ color: numColor, alpha: 0.95 });
    centerDot.circle(0, 0, 5).stroke({ color: 0xffffff, width: 1.5 });
    node.addChild(centerDot);

    // 3. Floating sender tag
    const tagContainer = new Container();
    tagContainer.position.set(0, -22);

    const labelText = new Text({
      text: senderName,
      style: {
        fontSize: 10,
        fontWeight: 'bold',
        fill: 0xffffff,
        align: 'center',
      },
    });
    labelText.anchor.set(0.5);

    const tagBg = new Graphics();
    const tagW = Math.max(labelText.width + 12, 34);
    const tagH = 16;
    tagBg.roundRect(-tagW / 2, -tagH / 2, tagW, tagH, 5)
      .fill({ color: 0x090b10, alpha: 0.85 })
      .stroke({ color: numColor, width: 1.5 });

    tagContainer.addChild(tagBg);
    tagContainer.addChild(labelText);
    node.addChild(tagContainer);

    pingContainer.addChild(node);

    // 4. Radar Animation loop (0 to 50px over 1.2s)
    const startTime = performance.now();
    const duration = 1200; // 1.2 seconds

    const tickerCallback = () => {
      const elapsed = performance.now() - startTime;
      const progress = Math.min(1.0, elapsed / duration);

      // Radius expands from 0 to 50px
      const radius = progress * 50;
      // Fading alpha
      const alpha = Math.max(0, 1.0 - progress);

      ringGraphics.clear();

      // Outer fading ring
      ringGraphics.circle(0, 0, radius).stroke({
        color: numColor,
        alpha,
        width: Math.max(1, 3 * (1 - progress)),
      });

      // Secondary echo wave (staggered at 40% progress)
      if (progress > 0.3) {
        const p2 = (progress - 0.3) / 0.7;
        ringGraphics.circle(0, 0, p2 * 50).stroke({
          color: 0xffffff,
          alpha: (1.0 - p2) * 0.6,
          width: 1.5,
        });
      }

      tagContainer.alpha = alpha;
      centerDot.alpha = alpha;

      if (progress >= 1.0) {
        // Animation finished: cleanly remove container and ticker hook
        cleanup();
      }
    };

    const cleanup = () => {
      if (pixiApp?.ticker) {
        pixiApp.ticker.remove(tickerCallback);
      }
      activeAnimations.delete(cleanup);
      if (node.parent) {
        node.parent.removeChild(node);
      }
      try {
        node.destroy({ children: true });
      } catch {}
    };

    activeAnimations.add(cleanup);
    pixiApp.ticker.add(tickerCallback);
  }

  function handlePingEvent(e: Event) {
    const custom = e as CustomEvent<PingPayload>;
    if (custom.detail) {
      spawnPing(
        custom.detail.x,
        custom.detail.y,
        custom.detail.color || '#38bdf8',
        custom.detail.sender_name || 'Player'
      );
    }
  }

  onMount(() => {
    if (typeof window !== 'undefined') {
      window.addEventListener('vtt:ping-point', handlePingEvent);
    }
  });

  onDestroy(() => {
    if (typeof window !== 'undefined') {
      window.removeEventListener('vtt:ping-point', handlePingEvent);
    }
    // Cleanly cancel all active animation hooks
    for (const cancel of activeAnimations) {
      cancel();
    }
    activeAnimations.clear();

    if (pingContainer) {
      if (pingContainer.parent) {
        pingContainer.parent.removeChild(pingContainer);
      }
      try {
        pingContainer.destroy({ children: true });
      } catch {}
      pingContainer = null;
    }
  });
</script>
