<!-- frontend/src/lib/components/projector/TurnBannerOverlay.svelte -->
<!-- Cinematic Lower-Third Turn Advance Banner for /projector with 2.5s Hold & Cubic-Bezier Exit -->

<script lang="ts">
  import { combatStore } from '$lib/stores/combatStore.svelte';
  import { combatTrackerStore } from '$lib/stores/combatTrackerStore';
  import { combatTurnStore } from '../../../stores/websocketStore';
  import { canvasStore } from '../../../stores/canvasStore.svelte';
  import { CONDITION_REGISTRY } from '$lib/components/map/TokenOverlay';

  let currentActorName = $state<string | null>(null);
  let onDeckName = $state<string | null>(null);
  let actorConditions = $state<string[]>([]);
  let tokenImageUrl = $state<string | null>(null);
  let isPlayer = $state(true);

  let isVisible = $state(false);
  let hideTimer: ReturnType<typeof setTimeout> | null = null;
  let lastAnnouncedKey = '';

  let currentRound = $state(1);

  // Track active combatant changes across both local combatStore and remote WebSocket combatTurnStore
  $effect(() => {
    // 1. Check local combatStore / combatTrackerStore
    let activeName: string | null = null;
    let nextName: string | null = null;
    let tokenId: string | null = null;
    let conditions: string[] = [];
    let roundNum = 1;
    let turnIdx = 0;
    let combatActive = false;

    if (combatStore.isActive && combatStore.activeCombatant) {
      combatActive = true;
      const active = combatStore.activeCombatant;
      const onDeck = combatStore.onDeckCombatant;
      activeName = active.name;
      nextName = onDeck ? onDeck.name : null;
      tokenId = active.tokenId;
      conditions = active.conditions || [];
      roundNum = combatStore.round;
      turnIdx = combatStore.turnIndex;
    } else if ($combatTurnStore && $combatTurnStore.combatants?.length > 0) {
      const turnData = $combatTurnStore;
      combatActive = true;
      roundNum = turnData.round;
      turnIdx = turnData.current_turn_index;
      const activeEntry = turnData.combatants.find((c) => c.is_active) ?? turnData.combatants[turnIdx] ?? turnData.combatants[0];
      const onDeckEntry = turnData.combatants.find((c) => c.is_on_deck) ?? turnData.combatants[(turnIdx + 1) % turnData.combatants.length];
      if (activeEntry) {
        activeName = activeEntry.name;
        tokenId = activeEntry.id;
      }
      if (onDeckEntry && onDeckEntry !== activeEntry) {
        nextName = onDeckEntry.name;
      }
    }

    currentRound = roundNum;

    if (!combatActive || !activeName) {
      isVisible = false;
      if (hideTimer) {
        clearTimeout(hideTimer);
        hideTimer = null;
      }
      return;
    }

    const key = `${roundNum}-${turnIdx}-${activeName}-${tokenId || ''}`;
    if (key !== lastAnnouncedKey) {
      lastAnnouncedKey = key;
      currentActorName = activeName;
      onDeckName = nextName;
      actorConditions = conditions;

      // Look up token portrait or appearance from canvasStore
      const matchedToken = tokenId ? canvasStore.tokens.find((t) => t.id === tokenId) : null;
      tokenImageUrl = (matchedToken as any)?.textureUrl || (matchedToken as any)?.imageUrl || null;
      isPlayer = matchedToken?.isPlayer ?? true;

      // Show banner
      isVisible = true;

      if (hideTimer) {
        clearTimeout(hideTimer);
      }

      // Hold banner for exactly 2.5s before exit fade
      hideTimer = setTimeout(() => {
        isVisible = false;
        hideTimer = null;
      }, 2500);
    }
  });
</script>

<aside
  aria-label="Combat Turn Advance Banner"
  class="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 pointer-events-none transition-all duration-500 select-none {isVisible ? 'opacity-100 translate-y-0 scale-100' : 'opacity-0 translate-y-8 scale-95'}"
  style="transition-timing-function: cubic-bezier(0.16, 1, 0.3, 1);"
>
  <div class="relative flex items-center gap-4 px-6 py-3.5 bg-slate-950/90 backdrop-blur-xl border border-amber-500/40 rounded-2xl shadow-2xl shadow-black/80 overflow-hidden min-w-[340px] max-w-lg">
    <!-- Amber Energy Accent Bar -->
    <div class="absolute left-0 top-0 bottom-0 w-1.5 bg-gradient-to-b from-amber-400 via-amber-500 to-amber-600 shadow-sm shadow-amber-400"></div>

    <!-- Token Portrait / Initials Avatar -->
    <div class="relative flex-shrink-0 w-12 h-12 rounded-xl overflow-hidden border-2 {isPlayer ? 'border-amber-400 bg-amber-950/40' : 'border-rose-500 bg-rose-950/40'} flex items-center justify-center shadow-md">
      {#if tokenImageUrl}
        <img src={tokenImageUrl} alt={currentActorName || 'Combatant'} class="w-full h-full object-cover" />
      {:else}
        <span class="font-serif font-black text-lg text-white">
          {(currentActorName || '?').slice(0, 2).toUpperCase()}
        </span>
      {/if}
    </div>

    <!-- Turn Content -->
    <div class="flex-1 flex flex-col justify-center min-w-0 pr-2">
      <div class="flex items-center gap-2">
        <h3 class="text-base font-black font-serif tracking-wide text-white truncate drop-shadow-sm">
          {currentActorName}'s Turn
        </h3>
        <span class="px-1.5 py-0.5 rounded text-[9px] font-mono font-bold uppercase {isPlayer ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30' : 'bg-rose-500/20 text-rose-300 border border-rose-500/30'}">
          {isPlayer ? 'Hero' : 'Foe'}
        </span>
      </div>

      {#if onDeckName}
        <p class="text-xs font-mono text-slate-400 flex items-center gap-1.5 mt-0.5">
          <span class="text-amber-400/90 font-bold uppercase text-[10px]">On Deck:</span>
          <span class="text-slate-300 font-semibold truncate">{onDeckName}</span>
        </p>
      {/if}

      <!-- Perimeter Condition Badges -->
      {#if actorConditions.length > 0}
        <div class="flex items-center gap-1 mt-1.5 flex-wrap">
          {#each actorConditions.slice(0, 4) as cond}
            {@const style = CONDITION_REGISTRY[cond.split(' ')[0]]}
            <span
              class="px-1.5 py-0.5 rounded-full text-[9px] font-medium border flex items-center gap-1 bg-slate-900/80"
              style="border-color: {style?.borderColor || '#ef4444'}; color: #f1f5f9;"
            >
              <span>{style?.icon || '⚠️'}</span>
              <span>{cond}</span>
            </span>
          {/each}
        </div>
      {/if}
    </div>

    <!-- Round Counter Ribbon Badge -->
    <div class="flex-shrink-0 flex flex-col items-center justify-center pl-3 border-l border-slate-800">
      <span class="text-[9px] font-mono uppercase text-slate-500 font-bold">Round</span>
      <span class="text-lg font-mono font-black text-amber-400 leading-tight">
        {currentRound}
      </span>
    </div>
  </div>
</aside>
