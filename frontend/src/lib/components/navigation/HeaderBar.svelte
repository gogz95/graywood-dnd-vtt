<!-- frontend/src/lib/components/navigation/HeaderBar.svelte -->
<!-- Canonical-path shim: the header implementation (curtain toggle, Mirror TV
     Camera lock, Open Projector launcher) lives in `./Header.svelte`.
     This wrapper forwards all props so both `HeaderBar` and `Header` resolve
     to the same component without duplicating logic. -->
<script lang="ts">
  import Header from './Header.svelte';

  // Forward every prop (campaignName, callbacks, drawer flags, ...) through.
  const rest = $props();
</script>

<Header {...rest} />
