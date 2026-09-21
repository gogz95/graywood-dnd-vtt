<!-- src/lib/components/settings/AutomationSettingsTab.svelte -->
<!-- Automation & Physical Dice Settings Tab (Requirements 9 & 11) -->

<script lang="ts">
  import { automationSettings } from '../../stores/automationSettings.svelte';

  const TOGGLES: Array<{
    key: keyof Omit<typeof automationSettings.config, 'globalRollMode'>;
    label: string;
    description: string;
    icon: string;
  }> = [
    {
      key: 'autoRollInitiative',
      label: 'Auto-Roll Initiative',
      description: 'Automatically roll d20 + DEX/Tri-Stat when combat begins.',
      icon: '⚡'
    },
    {
      key: 'autoRollAttacks',
      label: 'Auto-Roll Attack Rolls',
      description: 'Compute attack bonus against target AC with digital RNG.',
      icon: '⚔️'
    },
    {
      key: 'autoRollDamage',
      label: 'Auto-Roll Damage Formulas',
      description: 'Automatically calculate weapon and spell damage dice.',
      icon: '💥'
    },
    {
      key: 'autoRollConcentration',
      label: 'Auto-Roll Concentration Saves',
      description: 'Prompt DC check max(10, damage/2) automatically when damaged.',
      icon: '🔮'
    },
    {
      key: 'autoRollDeathSaves',
      label: 'Auto-Roll Death Saving Throws',
      description: 'Automatically roll d20 for dying combatants on their turn.',
      icon: '💀'
    },
    {
      key: 'autoRollHitDice',
      label: 'Auto-Roll Short Rest Hit Dice',
      description: 'Roll hit dice automatically when taking a short rest.',
      icon: '☕'
    }
  ];
</script>

<div class="space-y-6 text-xs text-slate-300">
  <!-- Header -->
  <div class="border-b border-slate-800 pb-3">
    <h3 class="text-sm font-black text-slate-100 uppercase tracking-wider flex items-center gap-2">
      <span>🎲</span> Automation &amp; Physical Table Dice
    </h3>
    <p class="text-[11px] text-slate-400 mt-1">
      Choose whether mechanics auto-resolve digitally or prompt players and DMs for manual physical dice results.
    </p>
  </div>

  <!-- Global Roll Mode Selector Cards -->
  <div class="space-y-2">
    <span class="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
      Primary Table Rolling Mode
    </span>

    <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
      <!-- Digital Mode Card -->
      <button
        type="button"
        onclick={() => automationSettings.setGlobalMode('digital')}
        class="p-4 rounded-xl border text-left transition-all relative {automationSettings.config.globalRollMode === 'digital'
          ? 'bg-indigo-950/50 border-indigo-500 shadow-md shadow-indigo-950/40'
          : 'bg-slate-900/60 border-slate-800 hover:border-slate-700'}"
      >
        <div class="flex items-center justify-between mb-2">
          <span class="text-xl">💻</span>
          {#if automationSettings.config.globalRollMode === 'digital'}
            <span class="w-2.5 h-2.5 rounded-full bg-indigo-400 shadow-sm shadow-indigo-400/80"></span>
          {/if}
        </div>
        <div class="font-bold text-slate-100 text-xs">Digital Auto-Roll</div>
        <p class="text-[10px] text-slate-400 mt-1 leading-relaxed">
          The VTT evaluates dice formulas, modifiers, criticals, and arithmetic instantly via random number generators.
        </p>
      </button>

      <!-- Physical Dice Mode Card -->
      <button
        type="button"
        onclick={() => automationSettings.setGlobalMode('manual_prompt')}
        class="p-4 rounded-xl border text-left transition-all relative {automationSettings.config.globalRollMode === 'manual_prompt'
          ? 'bg-amber-950/50 border-amber-500 shadow-md shadow-amber-950/40'
          : 'bg-slate-900/60 border-slate-800 hover:border-slate-700'}"
      >
        <div class="flex items-center justify-between mb-2">
          <span class="text-xl">🎲</span>
          {#if automationSettings.config.globalRollMode === 'manual_prompt'}
            <span class="w-2.5 h-2.5 rounded-full bg-amber-400 shadow-sm shadow-amber-400/80"></span>
          {/if}
        </div>
        <div class="font-bold text-slate-100 text-xs">Physical Table Dice</div>
        <p class="text-[10px] text-slate-400 mt-1 leading-relaxed">
          Actions pause and open an on-screen prompt asking the user to roll physical dice on the tabletop and type the result.
        </p>
      </button>
    </div>
  </div>

  <!-- Granular Mechanical Toggles -->
  <div class="space-y-3 pt-2">
    <div class="flex items-center justify-between">
      <span class="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
        Granular Check Automation
      </span>
      <button
        type="button"
        onclick={() => automationSettings.resetToDefaults()}
        class="text-[10px] text-slate-500 hover:text-amber-400 transition-colors"
      >
        Reset to Defaults
      </button>
    </div>

    <div class="space-y-2">
      {#each TOGGLES as item}
        <div class="bg-slate-900/80 border border-slate-800/80 rounded-xl p-3 flex items-center justify-between gap-3">
          <div class="flex items-center gap-3">
            <span class="text-base">{item.icon}</span>
            <div>
              <div class="font-bold text-slate-200 text-xs">{item.label}</div>
              <div class="text-[10px] text-slate-400">{item.description}</div>
            </div>
          </div>

          <label class="relative inline-flex items-center cursor-pointer shrink-0">
            <input
              type="checkbox"
              checked={automationSettings.config[item.key]}
              onchange={() => automationSettings.toggleCheck(item.key)}
              class="sr-only peer"
            />
            <div class="w-9 h-5 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-amber-600"></div>
          </label>
        </div>
      {/each}
    </div>
  </div>
</div>
