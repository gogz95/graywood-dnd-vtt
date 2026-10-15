<!-- frontend/src/lib/components/canvas/MapViewportHost.svelte -->
<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import type { Action } from 'svelte/action';
  import type {
    MapInteractionCallbacks,
    MapSceneData,
    ViewportProvider,
    ViewportTransform
  } from '../../types/viewport';
  import { tokenStore } from '../../stores/tokenStore.svelte';
  import { sendWsEvent } from '../../../stores/websocketStore';
  import { pluginHost } from '$lib/services/pluginHost.svelte';
  import MapToolOverlay from './MapToolOverlay.svelte';

  let {
    scene,
    isDmView = true,
    activeTool = 'select'
  }: {
    scene: MapSceneData;
    isDmView?: boolean;
    activeTool?: string;
  } = $props();

  let overlayRef = $state<MapToolOverlay | null>(null);
  let transform = $state<ViewportTransform>({ x: 0, y: 0, zoom: 1 });

  // Default fallback ViewportProvider
  const defaultProvider: ViewportProvider = {
    id: 'default_tactical_2d',
    name: 'Default Tactical 2D Viewport',
    supportedSceneTypes: ['tactical_2d', 'overland_atlas', 'zone_mind'],
    mount(container, props) {
      const wrapper = document.createElement('div');
      wrapper.className = 'w-full h-full flex flex-col items-center justify-center text-slate-400 select-none';
      wrapper.innerHTML = `
        <div class="p-6 bg-slate-900/80 border border-slate-800 rounded-2xl text-center max-w-sm">
          <div class="text-3xl mb-2">🗺️</div>
          <h3 class="text-sm font-bold text-slate-200">${props.scene.name || 'Tactical Canvas'}</h3>
          <p class="text-xs text-slate-400 mt-1">Type: ${props.scene.type} | Grid: ${props.scene.grid.type} (${props.scene.grid.size}px)</p>
          <p class="text-[11px] text-slate-500 mt-2">${props.tokens.length} active tokens</p>
        </div>
      `;
      container.appendChild(wrapper);

      return {
        destroy() {
          wrapper.remove();
        },
        update(newProps) {
          if (newProps?.scene) {
            const heading = wrapper.querySelector('h3');
            if (heading) heading.textContent = newProps.scene.name || 'Tactical Canvas';
          }
        }
      };
    }
  };

  const providers: ViewportProvider[] = [defaultProvider];

  function resolveProvider(sceneType: string): ViewportProvider {
    return (
      pluginHost.getViewportForScene(sceneType) ??
      providers.find((p) => p.supportedSceneTypes.includes(sceneType)) ??
      providers.find((p) => p.supportedSceneTypes.includes('tactical_2d')) ??
      defaultProvider
    );
  }

  let activeProvider = $derived(resolveProvider(scene.type));

  const callbacks: MapInteractionCallbacks = {
    onTokenMoved(tokenId, position) {
      tokenStore.handleTokenMoved(tokenId, position.x, position.y, position.elevation ?? 0);
      sendWsEvent({
        type: 'TOKEN_MOVED',
        instance_id: tokenId,
        x: position.x,
        y: position.y,
        elevation: position.elevation ?? 0
      });
    },
    onTokenSelected(tokenId) {
      tokenStore.selectToken(tokenId);
    },
    onViewportChanged(newTransform: ViewportTransform) {
      transform = newTransform;
      sendWsEvent('VIEWPORT_CHANGED', newTransform, true);
    },
    onPingPoint(coords) {
      const cellSize = scene.grid?.size || 50;
      const gridX = Number((coords.x / cellSize).toFixed(3));
      const gridY = Number((coords.y / cellSize).toFixed(3));

      sendWsEvent('PING_POINT', {
        x: coords.x,
        y: coords.y,
        gridX,
        gridY
      }, true);
    }
  };

  const mountViewport: Action<HTMLElement> = (container) => {
    let instance: { destroy?: () => void; update?: (newProps: unknown) => void } | void;

    $effect(() => {
      const provider = activeProvider;
      container.innerHTML = '';
      instance = provider.mount(container, {
        scene,
        tokens: tokenStore.tokens,
        isDmView,
        callbacks,
        activeTool
      });

      return () => {
        if (instance && typeof instance.destroy === 'function') {
          instance.destroy();
        }
        container.innerHTML = '';
      };
    });
  };

  onMount(() => {
    const handleRemotePing = (ev: Event) => {
      const detail = (ev as CustomEvent).detail;
      if (detail) {
        const cellSize = scene.grid?.size || 50;
        const gx = detail.gridX ?? (detail.x !== undefined ? detail.x / cellSize : 0);
        const gy = detail.gridY ?? (detail.y !== undefined ? detail.y / cellSize : 0);
        overlayRef?.addPing(gx, gy, detail.color || '#38bdf8');
      }
    };

    const handleRemoteRuler = (ev: Event) => {
      const detail = (ev as CustomEvent).detail;
      overlayRef?.setRemoteRuler(detail || null);
    };

    window.addEventListener('vtt:ping', handleRemotePing);
    window.addEventListener('vtt:ruler', handleRemoteRuler);

    return () => {
      window.removeEventListener('vtt:ping', handleRemotePing);
      window.removeEventListener('vtt:ruler', handleRemoteRuler);
    };
  });
</script>

<div class="relative w-full h-full overflow-hidden bg-slate-950">
  <svelte:boundary>
    <div class="w-full h-full" use:mountViewport></div>
    {#snippet failed(error, reset)}
      <div class="flex flex-col items-center justify-center h-full text-rose-400 gap-2">
        <p class="text-sm font-semibold">Map Viewport render error</p>
        <button
          class="px-3 py-1 bg-slate-800 text-xs rounded hover:bg-slate-700 text-slate-200"
          onclick={reset}
        >
          Reload Viewport
        </button>
      </div>
    {/snippet}
  </svelte:boundary>

  <!-- Engine-Agnostic SVG/HTML Overlay (Rulers, AoE templates, Pings) -->
  <MapToolOverlay
    bind:this={overlayRef}
    {transform}
    gridSize={scene.grid?.size || 50}
    scaleFeet={scene.grid?.scaleFeet || 5}
    {activeTool}
    onPing={(gridCoords) => {
      const cellSize = scene.grid?.size || 50;
      callbacks.onPingPoint?.({
        x: gridCoords.gridX * cellSize,
        y: gridCoords.gridY * cellSize
      });
    }}
    onRulerChange={(ruler) => {
      sendWsEvent('LIVE_RULER', ruler ? { ...ruler, tool: activeTool } : null, true);
    }}
  />
</div>
