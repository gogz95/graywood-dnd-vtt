<script lang="ts">
  import { onMount } from 'svelte';
  import RootWorkspace from './routes/+page.svelte';
  import PlayerCompanionPortal from './routes/play/+page.svelte';
  import ProjectorBattleMatView from './routes/projector/+page.svelte';
  import MobileCompanionView from './routes/mobile/+page.svelte';
  import PlayerPortalReceiver from './routes/portal/+page.svelte';
  import ErrorBoundary from './lib/components/system/ErrorBoundary.svelte';
  import MapViewportHost from './lib/components/canvas/MapViewportHost.svelte';
  import { pluginHost } from './lib/services/pluginHost.svelte';
  import { tactical2dProvider } from './plugins/viewports/tactical-2d';
  import { tactical3dProvider } from './plugins/viewports/tactical-3d';
  import type { MapSceneData } from './lib/types/viewport';

  // Wire standard viewport providers
  pluginHost.registerViewport(tactical2dProvider);
  pluginHost.registerViewport(tactical3dProvider);

  type Route = 'workspace' | 'play' | 'projector' | 'mobile' | 'portal' | 'display';

  let currentRoute = $state<Route>('workspace');
  let activeTool = $state('select');

  let activeScene = $state<MapSceneData>({
    id: 'active-battlemat',
    name: 'Tactical Battlemat',
    type: 'tactical_2d',
    grid: {
      type: 'square',
      size: 50,
      scaleFeet: 5
    }
  });

  let isDisplayMode = $derived(
    currentRoute === 'display' ||
    (typeof window !== 'undefined' &&
      (window.location.pathname.startsWith('/display') ||
        window.location.search.includes('mode=display') ||
        window.location.hash.startsWith('#/display')))
  );

  function updateRoute() {
    if (typeof window === 'undefined') return;
    const path = window.location.pathname.toLowerCase();
    const hash = window.location.hash.toLowerCase();
    const search = window.location.search.toLowerCase();

    if (path.startsWith('/display') || hash.startsWith('#/display') || search.includes('mode=display')) {
      currentRoute = 'display';
    } else if (path.startsWith('/mobile') || hash.startsWith('#/mobile')) {
      currentRoute = 'mobile';
    } else if (path.startsWith('/portal') || hash.startsWith('#/portal')) {
      currentRoute = 'portal';
    } else if (path.startsWith('/projector') || hash.startsWith('#/projector')) {
      currentRoute = 'projector';
    } else if (path.startsWith('/play') || hash.startsWith('#/play') || search.includes('pin=')) {
      currentRoute = 'play';
    } else {
      currentRoute = 'workspace';
    }
  }

  onMount(() => {
    updateRoute();
    window.addEventListener('popstate', updateRoute);
    window.addEventListener('hashchange', updateRoute);

    return () => {
      window.removeEventListener('popstate', updateRoute);
      window.removeEventListener('hashchange', updateRoute);
    };
  });
</script>

<ErrorBoundary>
  {#if isDisplayMode}
    <!-- TV Spectator Display: Hides SidebarNav, HeaderBar, and DM drawers, rendering MapViewportHost fullscreen -->
    <main class="fixed inset-0 w-screen h-screen bg-black overflow-hidden z-50">
      <MapViewportHost scene={activeScene} isDmView={false} {activeTool} />
    </main>
  {:else if currentRoute === 'mobile'}
    <MobileCompanionView />
  {:else if currentRoute === 'portal'}
    <PlayerPortalReceiver />
  {:else if currentRoute === 'projector'}
    <ProjectorBattleMatView />
  {:else if currentRoute === 'play'}
    <PlayerCompanionPortal />
  {:else}
    <RootWorkspace />
  {/if}
</ErrorBoundary>
