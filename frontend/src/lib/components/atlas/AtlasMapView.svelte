<!-- src/lib/components/atlas/AtlasMapView.svelte -->
<!-- Re-export bridge ensuring imports from /components/atlas or /components/map resolve identically -->
<script lang="ts">
  import AtlasMapView from '../map/AtlasMapView.svelte';

  let props = $props();
</script>

<AtlasMapView {...props} />
