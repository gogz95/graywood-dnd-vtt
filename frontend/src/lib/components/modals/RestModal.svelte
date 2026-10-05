<!-- frontend/src/lib/components/modals/RestModal.svelte -->
<!-- 5e SRD Party Short Rest Automation — Hit Dice expenditure across the party -->

<script lang="ts">
  import {
    executeLongRest,
    executeShortRest,
    loadPartyRestActors,
    abilityModifier,
    type RestActor,
  } from '../../services/restEngine';

  let {
    isOpen = false,
    onClose,
  }: {
    isOpen: boolean;
    onClose: () => void;
  } = $props();

  let actors = $state<RestActor[]>([]);
  let spend = $state<Record<string, number>>({});
  let previews = $state<Record<string, number[]>>({});
  let summaries = $state<Record<string, string>>({});
  let isLoading = $state(false);
  let isExecuting = $state(false);

  async function reload() {
    isLoading = true;
    try {
      const loaded = await loadPartyRestActors();
      actors = loaded;
      spend = Object.fromEntries(loaded.map((a) => [a.id, a.hitDice.current > 0 ? 1 : 0]));
      previews = {};
      summaries = {};
    } finally {
      isLoading = false;
    }
  }

  $effect(() => {
    if (isOpen) {
      void reload();
    }
  });

  function conMod(actor: RestActor): number {
    return abilityModifier(actor.con);
  }

  function setSpend(actor: RestActor, value: number) {
    const clamped = Math.max(0, Math.min(value, actor.hitDice.current));
    spend = { ...spend, [actor.id]: clamped };
    previews = { ...previews, [actor.id]: [] };
  }

  function rollPreview(actor: RestActor) {
    const count = Math.min(spend[actor.id] ?? 0, actor.hitDice.current);
    if (count <= 0) {
      previews = { ...previews, [actor.id]: [] };
      return;
    }
    const dieSize = actor.hitDice.dieSize || 8;
    const rolls = Array.from({ length: count }, () => Math.floor(Math.random() * dieSize) + 1);
    previews = { ...previews, [actor.id]: rolls };
  }

  function projectedHeal(actor: RestActor): number {
    const rolls = previews[actor.id];
    if (!rolls || rolls.length === 0) return 0;
    const raw = rolls.reduce((sum, v) => sum + v, 0) + conMod(actor) * rolls.length;
    return Math.max(0, Math.min(actor.hp.max - actor.hp.current, raw));
  }

  function plainSummary(actorId: string): string {
    return (summaries[actorId] ?? '').replace(/\*\*/g, '');
  }

  async function takeShortRest(actor: RestActor) {
    if (isExecuting) return;
    const count = spend[actor.id] ?? 0;
    if (count <= 0) return;
    isExecuting = true;
    try {
      const result = await executeShortRest(actor, count, previews[actor.id]);
      actors = actors.map((a) => (a.id === actor.id ? result.actor : a));
      summaries = { ...summaries, [actor.id]: result.summary };
      spend = { ...spend, [actor.id]: result.actor.hitDice.current > 0 ? 1 : 0 };
      previews = { ...previews, [actor.id]: [] };
    } finally {
      isExecuting = false;
    }
  }

  async function takeLongRest() {
    if (isExecuting) return;
    isExecuting = true;
    try {
      const result = await executeLongRest(actors);
      actors = result.updatedActors;
      previews = {};
      spend = Object.fromEntries(actors.map((a) => [a.id, a.hitDice.current > 0 ? 1 : 0]));
    } finally {
      isExecuting = false;
    }
  }

  function handleKeyDown(e: KeyboardEvent) {
    if (e.key === 'Escape') onClose();
  }
</script>

{#if isOpen}
  <div
    role="presentation"
    class="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 select-none"
  >
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Party Short Rest"
      class="w-full max-w-2xl bg-gradient-to-b from-slate-900 to-slate-950 border border-slate-700/80 rounded-2xl shadow-2xl flex flex-col max-h-[85vh]"
      tabindex="-1"
      onkeydown={handleKeyDown}
    >
      <!-- Header -->
      <div class="flex items-center justify-between px-5 py-3.5 border-b border-slate-800">
        <div class="flex items-center gap-2.5">
          <span class="text-2xl">🌿</span>
          <div>
            <h3 class="text-sm font-black text-slate-100 uppercase tracking-wide">Short Rest &amp; Hit Dice</h3>
            <p class="text-[11px] text-slate-400">Spend Hit Dice (1dHD + CON) to recover HP across the party.</p>
          </div>
        </div>
        <button
          type="button"
          onclick={onClose}
          class="text-slate-500 hover:text-white text-sm p-1 rounded"
          aria-label="Close rest panel"
        >✕</button>
      </div>

      <!-- Body -->
      <div class="overflow-y-auto px-5 py-4 space-y-3">
        {#if isLoading}
          <div class="text-xs text-slate-400 italic py-6 text-center">Loading party Hit Dice pools…</div>
        {:else if actors.length === 0}
          <div class="text-xs text-slate-400 italic py-6 text-center">
            No activated party actors found in the local vault.
          </div>
        {:else}
          {#each actors as actor (actor.id)}
            {@const mod = conMod(actor)}
            {@const selected = spend[actor.id] ?? 0}
            {@const rolls = previews[actor.id] ?? []}
            {@const heal = projectedHeal(actor)}
            <div class="bg-slate-900/60 border border-slate-800 rounded-xl p-3.5 space-y-2.5">
              <!-- Name + vitals -->
              <div class="flex items-center justify-between">
                <div class="flex items-center gap-2">
                  <span class="font-semibold text-slate-100 text-sm">{actor.name}</span>
                  <span class="text-[10px] text-slate-500 font-mono">Lv {actor.level}</span>
                  {#if actor.isDead}
                    <span class="px-1.5 py-0.5 rounded bg-rose-950 text-rose-300 border border-rose-800 text-[9px] font-bold uppercase">Dead</span>
                  {/if}
                </div>
                <div class="font-mono text-xs text-emerald-300">
                  {actor.hp.current}/{actor.hp.max} HP{#if actor.hp.temp > 0}<span class="text-sky-300"> (+{actor.hp.temp})</span>{/if}
                </div>
              </div>

              <!-- Hit Dice pool + expenditure stepper -->
              <div class="flex items-center flex-wrap gap-3">
                <div class="text-xs text-slate-300">
                  <span class="text-slate-500">Hit Dice:</span>
                  <span class="font-mono font-bold text-indigo-300 ml-1">{actor.hitDice.current}/{actor.hitDice.total}</span>
                  <span class="text-slate-500 font-mono ml-1">d{actor.hitDice.dieSize}</span>
                </div>
                <div class="flex items-center gap-1.5">
                  <button
                    type="button"
                    onclick={() => setSpend(actor, selected - 1)}
                    disabled={selected <= 0}
                    class="w-7 h-7 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-200 font-bold"
                    aria-label="Spend one fewer Hit Die"
                  >−</button>
                  <span class="w-8 text-center font-mono text-sm text-white tabular-nums">{selected}</span>
                  <button
                    type="button"
                    onclick={() => setSpend(actor, selected + 1)}
                    disabled={selected >= actor.hitDice.current}
                    class="w-7 h-7 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-200 font-bold"
                    aria-label="Spend one more Hit Die"
                  >+</button>
                </div>
                <button
                  type="button"
                  onclick={() => rollPreview(actor)}
                  disabled={selected <= 0}
                  class="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-xs font-semibold text-slate-200"
                >
                  🎲 Roll {selected > 0 ? `${selected}d${actor.hitDice.dieSize}` : ''}
                </button>
                {#if rolls.length > 0}
                  <span class="font-mono text-[11px] text-amber-300">
                    [{rolls.join(', ')}] {mod >= 0 ? '+' : ''}{mod} ea.
                  </span>
                {/if}
              </div>


              <!-- Projection + action -->
              <div class="flex items-center justify-between gap-3">
                <div class="text-[11px] text-slate-400">
                  CON modifier
                  <span class="font-mono {mod >= 0 ? 'text-emerald-300' : 'text-rose-300'}">{mod >= 0 ? '+' : ''}{mod}</span>
                  {#if rolls.length > 0}
                    · projected recovery <span class="font-mono font-bold text-emerald-300">+{heal} HP</span>
                  {/if}
                </div>
                <button
                  type="button"
                  onclick={() => takeShortRest(actor)}
                  disabled={isExecuting || selected <= 0 || actor.hitDice.current <= 0}
                  class="px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 disabled:opacity-40 disabled:pointer-events-none text-slate-950 font-bold text-xs shadow"
                >
                  Take Short Rest
                </button>
              </div>

              {#if summaries[actor.id]}
                <div class="text-[11px] text-emerald-300/90 bg-emerald-950/30 border border-emerald-900/50 rounded-lg px-2.5 py-1.5">
                  {plainSummary(actor.id)}
                </div>
              {/if}
            </div>
          {/each}
        {/if}
      </div>

      <!-- Footer -->
      <div class="px-5 py-3.5 bg-slate-950/80 border-t border-slate-800 flex items-center justify-between gap-3">
        <div class="text-[10px] text-slate-500">
          Short rests refresh Action Surge, Second Wind, Ki, and Warlock Pact Magic slots.
        </div>
        <div class="flex items-center gap-2.5">
          <button
            type="button"
            onclick={onClose}
            class="px-3.5 py-1.5 rounded-lg border border-slate-700 text-slate-300 hover:bg-slate-800 text-xs font-semibold"
          >
            Close
          </button>
          <button
            type="button"
            onclick={takeLongRest}
            disabled={isExecuting || actors.length === 0}
            class="px-4 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:pointer-events-none text-white font-bold text-xs shadow"
          >
            ✨ Full Party Long Rest
          </button>
        </div>
      </div>
    </div>
  </div>
{/if}

