<!-- src/lib/components/player/SpellbookDrawer.svelte -->
<!-- Dedicated 5e SRD Spellbook Drawer for Casting Classes with DC, Attack Bonus, Slots 1-9 & Components -->
<script lang="ts">
  import { audioEngine } from '../../audio/AudioEngine';

  export interface SpellDefinition {
    id: string;
    name: string;
    level: number; // 0 for cantrip
    school: string;
    castingTime: string;
    range: string;
    components: string; // 'V, S, M'
    duration: string;
    description: string;
    isPrepared: boolean;
  }

  export interface SpellSlotTracker {
    level: number;
    current: number;
    max: number;
  }

  let {
    isOpen = $bindable(false),
    characterClass = 'Wizard',
    characterLevel = 1,
    spellcastingMod = 3, // e.g. INT mod +3
    proficiencyBonus = 2,
    spellSlots = $bindable<SpellSlotTracker[]>([
      { level: 1, current: 4, max: 4 },
      { level: 2, current: 3, max: 3 },
      { level: 3, current: 2, max: 2 },
      { level: 4, current: 0, max: 0 },
      { level: 5, current: 0, max: 0 },
      { level: 6, current: 0, max: 0 },
      { level: 7, current: 0, max: 0 },
      { level: 8, current: 0, max: 0 },
      { level: 9, current: 0, max: 0 }
    ])
  }: {
    isOpen?: boolean;
    characterClass?: string;
    characterLevel?: number;
    spellcastingMod?: number;
    proficiencyBonus?: number;
    spellSlots?: SpellSlotTracker[];
  } = $props();

  const spellSaveDc = $derived(8 + proficiencyBonus + spellcastingMod);
  const spellAttackBonus = $derived(proficiencyBonus + spellcastingMod);

  // Standard 5e SRD Spells Catalog
  let spells = $state<SpellDefinition[]>([
    {
      id: 'spell-fire-bolt',
      name: 'Fire Bolt',
      level: 0,
      school: 'Evocation',
      castingTime: '1 action',
      range: '120 feet',
      components: 'V, S',
      duration: 'Instantaneous',
      description: 'You hurl a mote of fire at a creature or object within range. Make a ranged spell attack. On a hit, the target takes 1d10 fire damage. A flammable object hit by this spell ignites if it isn\'t being worn or carried.',
      isPrepared: true
    },
    {
      id: 'spell-mage-hand',
      name: 'Mage Hand',
      level: 0,
      school: 'Transmutation',
      castingTime: '1 action',
      range: '30 feet',
      components: 'V, S',
      duration: '1 minute',
      description: 'A spectral, floating hand appears at a point you choose within range. You can use your action to control the hand to manipulate an object, open an unlocked door, or stow/retrieve an item.',
      isPrepared: true
    },
    {
      id: 'spell-prestidigitation',
      name: 'Prestidigitation',
      level: 0,
      school: 'Transmutation',
      castingTime: '1 action',
      range: '10 feet',
      components: 'V, S',
      duration: 'Up to 1 hour',
      description: 'This spell is a minor magical trick that novice spellcasters use for practice. Create a sensory effect, light/snuff a candle, clean/soil an object, or chill/warm/flavor nonliving material.',
      isPrepared: true
    },
    {
      id: 'spell-magic-missile',
      name: 'Magic Missile',
      level: 1,
      school: 'Evocation',
      castingTime: '1 action',
      range: '120 feet',
      components: 'V, S',
      duration: 'Instantaneous',
      description: 'You create three glowing darts of magical force. Each dart hits a creature of your choice that you can see within range. A dart deals 1d4 + 1 force damage to its target. The darts all strike simultaneously.',
      isPrepared: true
    },
    {
      id: 'spell-shield',
      name: 'Shield',
      level: 1,
      school: 'Abjuration',
      castingTime: '1 reaction',
      range: 'Self',
      components: 'V, S',
      duration: '1 round',
      description: 'An invisible barrier of magical force appears and protects you. Until the start of your next turn, you have a +5 bonus to AC, including against the triggering attack, and you take no damage from magic missile.',
      isPrepared: true
    },
    {
      id: 'spell-detect-magic',
      name: 'Detect Magic',
      level: 1,
      school: 'Divination (Ritual)',
      castingTime: '1 action',
      range: 'Self',
      components: 'V, S',
      duration: 'Concentration, up to 10 minutes',
      description: 'For the duration, you sense the presence of magic within 30 feet of you. You can see a faint aura around any visible creature or object in the area that bears magic, and you learn its school of magic.',
      isPrepared: true
    },
    {
      id: 'spell-misty-step',
      name: 'Misty Step',
      level: 2,
      school: 'Conjuration',
      castingTime: '1 bonus action',
      range: 'Self',
      components: 'V',
      duration: 'Instantaneous',
      description: 'Briefly surrounded by silvery mist, you teleport up to 30 feet to an unoccupied space that you can see.',
      isPrepared: true
    },
    {
      id: 'spell-scorching-ray',
      name: 'Scorching Ray',
      level: 2,
      school: 'Evocation',
      castingTime: '1 action',
      range: '120 feet',
      components: 'V, S',
      duration: 'Instantaneous',
      description: 'You create three rays of fire and hurl them at targets within range. You can hurl them at one target or several. Make a ranged spell attack for each ray. On a hit, the target takes 2d6 fire damage.',
      isPrepared: true
    },
    {
      id: 'spell-fireball',
      name: 'Fireball',
      level: 3,
      school: 'Evocation',
      castingTime: '1 action',
      range: '150 feet',
      components: 'V, S, M (a tiny ball of bat guano and sulfur)',
      duration: 'Instantaneous',
      description: 'A bright streak flashes from your pointing finger to a point you choose within range and then blossoms with a low roar into an explosion of flame. Each creature in a 20-foot-radius sphere must make a DEX save, taking 8d6 fire damage on failed save, or half on success.',
      isPrepared: true
    },
    {
      id: 'spell-counterspell',
      name: 'Counterspell',
      level: 3,
      school: 'Abjuration',
      castingTime: '1 reaction',
      range: '60 feet',
      components: 'S',
      duration: 'Instantaneous',
      description: 'You attempt to interrupt a creature in the process of casting a spell. If the creature is casting a spell of 3rd level or lower, its spell fails and has no effect.',
      isPrepared: true
    }
  ]);

  let selectedSpellLevel = $state<number | 'all'>('all');

  const cantrips = $derived(spells.filter(s => s.level === 0));
  const filteredSpells = $derived(
    spells.filter(s => {
      if (selectedSpellLevel === 'all') return s.level > 0;
      return s.level === selectedSpellLevel;
    })
  );

  function consumeSlot(level: number) {
    const slot = spellSlots.find(s => s.level === level);
    if (slot && slot.current > 0) {
      slot.current--;
      audioEngine.triggerSfx('sfx-spell');
    }
  }

  function recoverSlot(level: number) {
    const slot = spellSlots.find(s => s.level === level);
    if (slot && slot.current < slot.max) {
      slot.current++;
      audioEngine.triggerSfx('sfx-rest');
    }
  }

  function togglePrepared(spell: SpellDefinition) {
    spell.isPrepared = !spell.isPrepared;
  }
</script>

{#if isOpen}
  <!-- Backdrop -->
  <div
    role="presentation"
    class="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 select-none"
    onclick={(e) => { if (e.target === e.currentTarget) isOpen = false; }}
  >
    <!-- Modal Container -->
    <div class="w-full max-w-2xl bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden animate-in fade-in duration-200">
      
      <!-- Top Bar -->
      <div class="h-14 bg-slate-950/90 border-b border-slate-800 px-5 flex items-center justify-between shrink-0">
        <div class="flex items-center gap-2.5">
          <span class="text-xl">📖</span>
          <div>
            <h2 class="text-sm font-bold text-slate-100 uppercase tracking-wider">
              Spellbook &amp; Arcana Grimoire
            </h2>
            <p class="text-[10px] text-slate-400">
              Level {characterLevel} {characterClass} · Standard 5e SRD
            </p>
          </div>
        </div>
        <button
          type="button"
          onclick={() => isOpen = false}
          class="w-8 h-8 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center text-sm"
        >
          ✕
        </button>
      </div>

      <!-- Spell Metrics Summary (Save DC & Attack Bonus) -->
      <div class="bg-slate-950 px-5 py-3 border-b border-slate-800 grid grid-cols-2 gap-4 shrink-0">
        <div class="bg-indigo-950/40 border border-indigo-500/40 rounded-xl p-2.5 text-center">
          <span class="text-[10px] font-bold uppercase tracking-wider text-indigo-300 block">Spell Save DC</span>
          <span class="text-xl font-black font-mono text-indigo-100">{spellSaveDc}</span>
          <span class="text-[9px] text-slate-400 block mt-0.5">8 + Prof (+{proficiencyBonus}) + Mod (+{spellcastingMod})</span>
        </div>

        <div class="bg-indigo-950/40 border border-indigo-500/40 rounded-xl p-2.5 text-center">
          <span class="text-[10px] font-bold uppercase tracking-wider text-indigo-300 block">Spell Attack Bonus</span>
          <span class="text-xl font-black font-mono text-indigo-100">+{spellAttackBonus}</span>
          <span class="text-[9px] text-slate-400 block mt-0.5">Prof (+{proficiencyBonus}) + Mod (+{spellcastingMod})</span>
        </div>
      </div>

      <!-- Spell Slot Trackers (Levels 1–9) -->
      <div class="bg-slate-950/70 px-5 py-3 border-b border-slate-800 shrink-0">
        <span class="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-2">Spell Slots (Levels 1–9)</span>
        <div class="grid grid-cols-9 gap-1.5 text-center">
          {#each spellSlots as slot}
            <div class="bg-slate-900 border border-slate-800 rounded-lg p-1.5 flex flex-col items-center justify-between">
              <span class="text-[9px] font-mono font-bold text-slate-400">L{slot.level}</span>
              <span class="text-xs font-mono font-black {slot.current === 0 ? 'text-rose-400' : 'text-indigo-300'}">
                {slot.current}/{slot.max}
              </span>
              {#if slot.max > 0}
                <div class="flex items-center gap-1 mt-1">
                  <button
                    onclick={() => consumeSlot(slot.level)}
                    disabled={slot.current <= 0}
                    class="w-4 h-4 rounded bg-slate-800 hover:bg-rose-950 text-slate-300 hover:text-rose-300 text-[10px] flex items-center justify-center font-mono disabled:opacity-20"
                    title="Cast spell (consume slot)"
                  >-</button>
                  <button
                    onclick={() => recoverSlot(slot.level)}
                    disabled={slot.current >= slot.max}
                    class="w-4 h-4 rounded bg-slate-800 hover:bg-indigo-950 text-slate-300 hover:text-indigo-300 text-[10px] flex items-center justify-center font-mono disabled:opacity-20"
                    title="Recover slot"
                  >+</button>
                </div>
              {:else}
                <span class="text-[9px] text-slate-600">—</span>
              {/if}
            </div>
          {/each}
        </div>
      </div>

      <!-- Scrollable Spells Body -->
      <div class="flex-1 overflow-y-auto p-5 space-y-4">
        
        <!-- Cantrips Section -->
        <div>
          <span class="text-xs font-bold uppercase tracking-wider text-slate-300 block mb-2">
            Cantrips Known (Level 0)
          </span>
          <div class="space-y-2">
            {#each cantrips as cantrip}
              <div class="p-3 bg-slate-950 rounded-xl border border-slate-800 space-y-1.5 text-xs">
                <div class="flex items-center justify-between">
                  <span class="font-bold text-slate-100">{cantrip.name}</span>
                  <span class="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-900 border border-slate-800 text-slate-400">
                    {cantrip.school}
                  </span>
                </div>
                <div class="flex items-center gap-3 text-[10px] text-slate-400 font-mono">
                  <span>⏱️ {cantrip.castingTime}</span>
                  <span>🎯 {cantrip.range}</span>
                  <span>✨ {cantrip.components}</span>
                </div>
                <p class="text-[11px] text-slate-300 leading-relaxed">{cantrip.description}</p>
              </div>
            {/each}
          </div>
        </div>

        <!-- Prepared Spells Filter Bar -->
        <div>
          <div class="flex items-center justify-between mb-2">
            <span class="text-xs font-bold uppercase tracking-wider text-slate-300">
              Prepared &amp; Grimoire Spells
            </span>
            <!-- Level Filter Pills -->
            <div class="flex items-center gap-1">
              <button
                onclick={() => selectedSpellLevel = 'all'}
                class="px-2 py-0.5 rounded text-[10px] font-mono font-bold {selectedSpellLevel === 'all' ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-400'}"
              >
                All
              </button>
              {#each [1, 2, 3, 4, 5, 6, 7, 8, 9] as lvl}
                <button
                  onclick={() => selectedSpellLevel = lvl}
                  class="px-1.5 py-0.5 rounded text-[10px] font-mono font-bold {selectedSpellLevel === lvl ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-400'}"
                >
                  {lvl}
                </button>
              {/each}
            </div>
          </div>

          <!-- Spells List -->
          <div class="space-y-2">
            {#each filteredSpells as spell}
              <div class="p-3 bg-slate-950 rounded-xl border transition-all text-xs space-y-1.5 {spell.isPrepared ? 'border-indigo-500/50 bg-indigo-950/10' : 'border-slate-800'}">
                <div class="flex items-center justify-between">
                  <div class="flex items-center gap-2">
                    <span class="font-bold text-slate-100">{spell.name}</span>
                    <span class="text-[10px] font-mono px-1.5 py-0.2 rounded bg-indigo-950 text-indigo-300 border border-indigo-800/40">
                      Level {spell.level} {spell.school}
                    </span>
                  </div>
                  <button
                    onclick={() => togglePrepared(spell)}
                    class="px-2 py-0.5 rounded text-[10px] font-bold border transition-colors {spell.isPrepared ? 'bg-indigo-600/30 border-indigo-500 text-indigo-200' : 'bg-slate-800 border-slate-700 text-slate-400'}"
                  >
                    {spell.isPrepared ? '✓ Prepared' : 'Prepare'}
                  </button>
                </div>
                <div class="flex items-center gap-3 text-[10px] text-slate-400 font-mono">
                  <span>⏱️ {spell.castingTime}</span>
                  <span>🎯 {spell.range}</span>
                  <span>✨ {spell.components}</span>
                  <span>⏳ {spell.duration}</span>
                </div>
                <p class="text-[11px] text-slate-300 leading-relaxed">{spell.description}</p>
              </div>
            {/each}
          </div>
        </div>

      </div>
    </div>
  </div>
{/if}
