<!-- frontend/src/lib/components/encounters/EncounterQuickLaunchModal.svelte -->
<!-- Quick-Launch Modal / Drawer for Pre-Made 5e Encounters -->
<script lang="ts">
  import { loadEncounter } from '../../services/encounterLoader';
  import { TRIBOAR_AMBUSH_ENCOUNTER } from '../../data/encounters/triboarAmbush';

  let {
    isOpen = $bindable(false),
    onClose = () => { isOpen = false; },
  }: {
    isOpen?: boolean;
    onClose?: () => void;
  } = $props();

  let isDeploying = $state(false);
  let toastMessage = $state<string | null>(null);

  function showToast(msg: string) {
    toastMessage = msg;
    setTimeout(() => {
      if (toastMessage === msg) toastMessage = null;
    }, 3000);
  }

  async function handleDeployEncounter(encounterId: string) {
    const confirmDeploy = confirm(
      'Overwrite active scene tokens and initialize "Ambush at Triboar Trail" with tactical wall colliders and combat initiative?'
    );
    if (!confirmDeploy) return;

    isDeploying = true;
    try {
      const res = await loadEncounter(encounterId);
      if (res.success) {
        showToast(`Encounter deployed! Loaded ${res.combatantCount} combatants.`);
        setTimeout(() => {
          isOpen = false;
          onClose();
        }, 600);
      } else {
        alert('Failed to deploy encounter.');
      }
    } catch (e) {
      console.error(e);
      alert('Error launching encounter.');
    } finally {
      isDeploying = false;
    }
  }
</script>

<svelte:window onkeydown={(e) => { if (e.key === 'Escape' && isOpen) onClose(); }} />

{#if isOpen}
  <!-- Backdrop -->
  <div
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-200"
    role="dialog"
    aria-modal="true"
    tabindex="-1"
    onclick={onClose}
  >
    <!-- Modal Container -->
    <div
      class="bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl flex flex-col overflow-hidden w-full max-w-2xl text-slate-100"
      onclick={(e) => e.stopPropagation()}
    >
      <!-- Modal Header -->
      <div class="px-5 py-3.5 bg-slate-950/80 border-b border-slate-800 flex items-center justify-between shrink-0">
        <div class="flex items-center gap-2.5">
          <span class="text-xl">⚔️</span>
          <div>
            <h2 class="text-sm font-black text-slate-100">Pre-Made Encounters</h2>
            <p class="text-[11px] font-mono text-slate-400">One-Click Starter Tactical Deployments</p>
          </div>
        </div>

        <button
          type="button"
          onclick={onClose}
          class="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          aria-label="Close Modal"
        >
          ✕
        </button>
      </div>

      {#if toastMessage}
        <div class="px-4 py-2 bg-emerald-950 border-b border-emerald-800/80 text-emerald-300 text-xs font-bold text-center animate-in fade-in">
          {toastMessage}
        </div>
      {/if}

      <!-- Modal Body (Cards List) -->
      <div class="p-5 space-y-4 max-h-[75vh] overflow-y-auto">
        <!-- Ambush at Triboar Trail Card -->
        <div class="bg-slate-950 border border-slate-800 hover:border-slate-700 rounded-xl overflow-hidden shadow-lg transition-all">
          <!-- Card Banner -->
          <div class="h-28 bg-gradient-to-r from-emerald-950/80 via-amber-950/60 to-slate-900 p-4 flex flex-col justify-end relative">
            <div class="absolute top-3 right-3 flex items-center gap-1.5">
              <span class="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-rose-950 text-rose-300 border border-rose-800/60">
                CR 1/4 (Goblins)
              </span>
              <span class="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-emerald-950 text-emerald-300 border border-emerald-800/60">
                Level 1–2
              </span>
            </div>
            <h3 class="text-lg font-black text-slate-100 font-serif">{TRIBOAR_AMBUSH_ENCOUNTER.title}</h3>
            <p class="text-xs text-amber-200/90 italic font-serif truncate">
              "{TRIBOAR_AMBUSH_ENCOUNTER.flavorPrompt}"
            </p>
          </div>

          <!-- Card Content -->
          <div class="p-4 space-y-3">
            <div class="grid grid-cols-2 gap-2 text-xs">
              <div class="bg-slate-900/80 p-2.5 rounded-lg border border-slate-800/60">
                <span class="text-slate-400 font-bold block text-[10px] uppercase">Terrain Setup</span>
                <span class="text-slate-200 font-mono">30 × 20 Grid (70px cell)</span>
                <span class="text-[11px] text-slate-400 block mt-0.5">2 Dead Horses (Difficult Terrain)</span>
              </div>
              <div class="bg-slate-900/80 p-2.5 rounded-lg border border-slate-800/60">
                <span class="text-slate-400 font-bold block text-[10px] uppercase">Enemies</span>
                <span class="text-rose-400 font-semibold">4 Goblins (AC 15, HP 7)</span>
                <span class="text-[11px] text-slate-400 block mt-0.5">2 in visible brush, 2 hidden on ridge</span>
              </div>
            </div>

            <!-- Tactical Notes -->
            <div class="text-xs text-slate-300 leading-relaxed bg-slate-900/40 p-2.5 rounded-lg border border-slate-800/40">
              <strong class="text-indigo-400 font-bold">Tactical Summary:</strong>
              Two goblins fire from the northern ridge (+10ft elevation, half cover), while two skirmishers flush the party from the south. High embankments block Line-of-Sight via dynamic raycast walls.
            </div>

            <!-- Action Button -->
            <div class="pt-2 flex items-center justify-between">
              <span class="text-[11px] font-mono text-slate-500">
                Auto-rolls initiative & mounts LOS colliders
              </span>
              <button
                type="button"
                onclick={() => handleDeployEncounter('triboar_ambush')}
                disabled={isDeploying}
                class="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold rounded-lg shadow-md transition-all flex items-center gap-1.5 disabled:opacity-50"
              >
                <span>⚔️</span>
                <span>{isDeploying ? 'Deploying...' : 'Deploy to Canvas'}</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
{/if}
