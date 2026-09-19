<script lang="ts">
  import { onMount } from 'svelte';
  import RootWorkspace from './routes/+page.svelte';
  import PlayerCompanionPortal from './routes/play/+page.svelte';
  import ProjectorBattleMatView from './routes/projector/+page.svelte';

  type Route = 'workspace' | 'play' | 'projector';

  let currentRoute = $state<Route>('workspace');

  function updateRoute() {
    if (typeof window === 'undefined') return;
    const path = window.location.pathname.toLowerCase();
    const hash = window.location.hash.toLowerCase();
    const search = window.location.search.toLowerCase();

    if (path.startsWith('/projector') || hash.startsWith('#/projector')) {
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

{#if currentRoute === 'projector'}
  <ProjectorBattleMatView />
{:else if currentRoute === 'play'}
  <PlayerCompanionPortal />
{:else}
  <RootWorkspace />
{/if}
