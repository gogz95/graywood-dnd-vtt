<!-- frontend/src/lib/components/modals/CheatSheetModal.svelte -->
<!-- Tactical DM Quick Reference & Keyboard Shortcut Cheat Sheet Modal (F1 / ?) -->

<script lang="ts">
  let { isOpen = $bindable(false) }: { isOpen?: boolean } = $props();

  let activeTab = $state<'shortcuts' | 'combat' | 'conditions' | 'environment'>('shortcuts');

  export function open() {
    isOpen = true;
  }

  export function close() {
    isOpen = false;
  }

  function handleKeyDown(e: KeyboardEvent) {
    if (!isOpen) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      close();
    }
  }

  const shortcuts = [
    { key: 'Ctrl + K', action: 'Quick Command Palette / Universal Compendium Search', category: 'Navigation' },
    { key: 'Ctrl + B', action: 'Toggle 5e SRD Compendium Browser Tray', category: 'Navigation' },
    { key: 'Ctrl + Shift + B', action: 'Instant Blackout Curtain Toggle on Projector', category: 'Screen' },
    { key: 'Ctrl + J', action: 'Toggle Campaign Journal & Lore Wiki Drawer', category: 'Navigation' },
    { key: 'Ctrl + I', action: 'Toggle Quick Asset Ingestion Dropzone', category: 'Assets' },
    { key: 'Space (Hold) + Drag', action: 'Pan Battlemap & Canvas Viewport', category: 'Battlemap' },
    { key: 'Delete / Backspace', action: 'Remove active or hovered token on canvas', category: 'Battlemap' },
    { key: 'T', action: 'Toggle targeting reticle on hovered token', category: 'Battlemap' },
    { key: 'Mouse Wheel', action: 'Smooth Zoom In / Out focused on cursor', category: 'Battlemap' },
    { key: 'F1 or ?', action: 'Open Keyboard Shortcuts & DM Cheat Sheet Modal', category: 'General' },
  ];

  const actionsInCombat = [
    { name: 'Attack', desc: 'Make one melee or ranged weapon/unarmed attack. Features like Extra Attack allow multiple strikes.' },
    { name: 'Cast a Spell', desc: 'Cast a spell with casting time of 1 Action. Bonus Action spells restrict action spells to cantrips.' },
    { name: 'Dash', desc: 'Gain extra movement for the current turn equal to your speed after applying modifiers.' },
    { name: 'Disengage', desc: 'Your movement does not provoke opportunity attacks for the rest of the turn.' },
    { name: 'Dodge', desc: 'Attacks against you have Disadvantage until next turn start. DEX saves are made with Advantage.' },
    { name: 'Help', desc: 'Give an ally Advantage on next ability check or next attack roll against a creature within 5 ft.' },
    { name: 'Hide', desc: 'Make a Dexterity (Stealth) check in an attempt to hide from enemies who cannot see you.' },
    { name: 'Ready', desc: 'Specify an action and a trigger condition; use your Reaction when the trigger occurs before your next turn.' },
    { name: 'Search', desc: 'Devote attention to finding an object or hidden creature (Wisdom/Intelligence check).' },
    { name: 'Use an Object', desc: 'Interact with a second object, drink/administer a potion, or activate a complex item.' }
  ];

  const conditions = [
    { name: 'Blinded', desc: 'Auto-fails checks requiring sight. Attack rolls against have Advantage; attacks made have Disadvantage.' },
    { name: 'Charmed', desc: 'Cannot attack charmer or target charmer with harmful abilities. Charmer has advantage on social checks.' },
    { name: 'Deafened', desc: 'Auto-fails checks requiring hearing.' },
    { name: 'Frightened', desc: 'Disadvantage on ability checks and attack rolls while source of fear is in line of sight. Cannot willingly move closer.' },
    { name: 'Grappled', desc: 'Speed becomes 0. Ends if grappler is incapacitated or effect removes grappled creature beyond reach.' },
    { name: 'Incapacitated', desc: 'Cannot take actions, bonus actions, or reactions.' },
    { name: 'Invisible', desc: 'Impossible to see without magic/special sense. Attacks against have Disadvantage; attacks made have Advantage.' },
    { name: 'Paralyzed', desc: 'Incapacitated and cannot move or speak. Auto-fails STR and DEX saves. Attacks against have Advantage; hits within 5 ft are criticals.' },
    { name: 'Petrified', desc: 'Transformed into solid stone. Incapacitated, attack rolls against have Advantage, resistant to all damage, immune to poison/disease.' },
    { name: 'Poisoned', desc: 'Disadvantage on attack rolls and ability checks.' },
    { name: 'Prone', desc: 'Only movement is crawling (costs double). Attacks made have Disadvantage. Attacks within 5 ft have Advantage; beyond 5 ft have Disadvantage.' },
    { name: 'Restrained', desc: 'Speed 0. Attacks against have Advantage; attacks made have Disadvantage. Disadvantage on DEX saves.' },
    { name: 'Stunned', desc: 'Incapacitated, can only falteringly speak. Auto-fails STR and DEX saves. Attack rolls against creature have Advantage.' },
    { name: 'Unconscious', desc: 'Incapacitated, drops what it is holding, falls prone. Auto-fails STR/DEX saves. Attacks against have Advantage; hits within 5 ft are criticals.' }
  ];

  const environmentalRules = [
    { topic: 'Half Cover (+2 AC, +2 DEX saves)', desc: 'Obstacle covers at least half of body (low wall, large furniture, another creature).' },
    { topic: 'Three-Quarters Cover (+5 AC, +5 DEX saves)', desc: 'Obstacle covers at least three-quarters of body (portcullis, arrow slit, thick tree trunk).' },
    { topic: 'Total Cover', desc: 'Target cannot be targeted directly by an attack or spell (unless spell explicitly spreads around corners).' },
    { topic: 'Dim Light (Lightly Obscured)', desc: 'Creatures have Disadvantage on Wisdom (Perception) checks that rely on sight.' },
    { topic: 'Darkness (Heavily Obscured)', desc: 'Blocks vision entirely. Creature effectively suffers the Blinded condition when viewing into/within it.' },
    { topic: 'Falling Damage', desc: '1d6 bludgeoning damage per 10 feet fallen (maximum 20d6). Creature lands prone unless damage avoided.' },
    { topic: 'Suffocation & Drowning', desc: 'Can hold breath for 1 + CON modifier minutes (min 30s). When breath runs out, survives CON modifier rounds before dropping to 0 HP.' }
  ];
</script>

<svelte:window onkeydown={handleKeyDown} />

{#if isOpen}
  <div
    class="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 select-none animate-in fade-in duration-100"
    role="presentation"
    onclick={() => close()}
  >
    <div
      class="w-full max-w-4xl bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]"
      role="dialog"
      tabindex="-1"
      aria-label="Keyboard Shortcuts and DM Cheat Sheet"
      onclick={(e) => e.stopPropagation()}
      onkeydown={(e) => e.stopPropagation()}
    >
      <!-- Modal Header -->
      <div class="flex items-center justify-between px-6 py-4 bg-slate-950 border-b border-slate-800">
        <div class="flex items-center gap-3">
          <span class="text-2xl">📜</span>
          <div>
            <h2 class="text-base font-black text-slate-100 uppercase tracking-wider">
              DM Tactical Cheat Sheet & Shortcuts
            </h2>
            <p class="text-xs text-slate-400">
              Quick keyboard ergonomics, combat action economy, and 5e SRD 5.1 baseline rules
            </p>
          </div>
        </div>
        <button
          type="button"
          onclick={() => close()}
          class="p-1.5 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-slate-800 transition-colors"
        >
          ✕
        </button>
      </div>

      <!-- Navigation Tabs -->
      <div class="flex border-b border-slate-800 bg-slate-950/60 px-6 gap-2">
        <button
          type="button"
          class="px-4 py-2.5 text-xs font-bold transition-colors border-b-2 {activeTab === 'shortcuts' ? 'border-indigo-500 text-indigo-400' : 'border-transparent text-slate-400 hover:text-slate-200'}"
          onclick={() => (activeTab = 'shortcuts')}
        >
          ⌨️ Hotkeys & Ergonomics
        </button>
        <button
          type="button"
          class="px-4 py-2.5 text-xs font-bold transition-colors border-b-2 {activeTab === 'combat' ? 'border-indigo-500 text-indigo-400' : 'border-transparent text-slate-400 hover:text-slate-200'}"
          onclick={() => (activeTab = 'combat')}
        >
          ⚔️ Combat Actions
        </button>
        <button
          type="button"
          class="px-4 py-2.5 text-xs font-bold transition-colors border-b-2 {activeTab === 'conditions' ? 'border-indigo-500 text-indigo-400' : 'border-transparent text-slate-400 hover:text-slate-200'}"
          onclick={() => (activeTab = 'conditions')}
        >
          ✨ Conditions
        </button>
        <button
          type="button"
          class="px-4 py-2.5 text-xs font-bold transition-colors border-b-2 {activeTab === 'environment' ? 'border-indigo-500 text-indigo-400' : 'border-transparent text-slate-400 hover:text-slate-200'}"
          onclick={() => (activeTab = 'environment')}
        >
          🌫️ Cover & Environment
        </button>
      </div>

      <!-- Content Area -->
      <div class="flex-1 overflow-y-auto p-6">
        {#if activeTab === 'shortcuts'}
          <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
            {#each shortcuts as sc}
              <div class="flex items-center justify-between p-3 rounded-xl bg-slate-950/50 border border-slate-800">
                <span class="text-xs font-medium text-slate-300">{sc.action}</span>
                <kbd class="px-2 py-1 text-xs font-mono font-bold bg-slate-800 text-indigo-300 border border-slate-700 rounded-md shadow-xs shrink-0 ml-3">
                  {sc.key}
                </kbd>
              </div>
            {/each}
          </div>
        {:else if activeTab === 'combat'}
          <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
            {#each actionsInCombat as action}
              <div class="p-3 rounded-xl bg-slate-950/50 border border-slate-800">
                <h3 class="text-xs font-bold text-amber-400 mb-1">{action.name}</h3>
                <p class="text-xs text-slate-400 leading-relaxed">{action.desc}</p>
              </div>
            {/each}
          </div>
        {:else if activeTab === 'conditions'}
          <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
            {#each conditions as cond}
              <div class="p-3 rounded-xl bg-slate-950/50 border border-slate-800">
                <h3 class="text-xs font-bold text-rose-400 mb-1">{cond.name}</h3>
                <p class="text-xs text-slate-400 leading-relaxed">{cond.desc}</p>
              </div>
            {/each}
          </div>
        {:else if activeTab === 'environment'}
          <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
            {#each environmentalRules as env}
              <div class="p-3 rounded-xl bg-slate-950/50 border border-slate-800">
                <h3 class="text-xs font-bold text-sky-400 mb-1">{env.topic}</h3>
                <p class="text-xs text-slate-400 leading-relaxed">{env.desc}</p>
              </div>
            {/each}
          </div>
        {/if}
      </div>

      <!-- Footer -->
      <div class="px-6 py-3 bg-slate-950 border-t border-slate-800 flex justify-between items-center text-xs text-slate-500">
        <span>Press <kbd class="px-1.5 py-0.5 bg-slate-800 text-slate-300 rounded">ESC</kbd> or <kbd class="px-1.5 py-0.5 bg-slate-800 text-slate-300 rounded">F1</kbd> to dismiss</span>
        <span class="text-slate-400 font-mono text-[11px]">System Reference Document 5.1 Baseline</span>
      </div>
    </div>
  </div>
{/if}
