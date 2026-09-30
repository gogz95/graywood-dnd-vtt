<!-- frontend/src/lib/components/panels/SoundboardDrawer.svelte -->
<!-- Re-exporting SoundboardDrawer for panel modularity -->

<script lang="ts">
  import SoundboardDrawer from '../audio/SoundboardDrawer.svelte';

  let {
    isOpen = $bindable(false),
    isMinimized = $bindable(false),
  }: {
    isOpen?: boolean;
    isMinimized?: boolean;
  } = $props();
</script>

<SoundboardDrawer bind:isOpen bind:isMinimized />
