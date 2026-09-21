<!-- src/lib/components/dm/QuickReferenceDrawer.svelte -->
<!-- Slide-Over DM Screen Quick Reference: 5e Conditions, Actions, DCs, and Environmental Rules -->

<script lang="ts">
  let {
    isOpen = $bindable(false),
    onClose = () => {}
  }: {
    isOpen?: boolean;
    onClose?: () => void;
  } = $props();

  type TabCategory = 'all' | 'conditions' | 'actions' | 'dcs' | 'environment';

  let activeTab = $state<TabCategory>('all');
  let searchQuery = $state('');

  interface ConditionRule {
    name: string;
    summary: string;
    bullets: string[];
    color: string;
  }

  const conditions: ConditionRule[] = [
    {
      name: 'Blinded',
      summary: 'Can’t see; automatically fails sight-based ability checks.',
      bullets: [
        'Attack rolls against the creature have Advantage.',
        'The creature’s attack rolls have Disadvantage.'
      ],
      color: 'rose'
    },
    {
      name: 'Charmed',
      summary: 'Can’t harm the charmer; charmer has advantage on social checks.',
      bullets: [
        'Can’t attack the charmer or target the charmer with harmful abilities/magical effects.',
        'The charmer has Advantage on any ability check to interact socially with the creature.'
      ],
      color: 'pink'
    },
    {
      name: 'Deafened',
      summary: 'Can’t hear; automatically fails hearing-based checks.',
      bullets: [
        'Automatically fails any ability check that requires hearing.'
      ],
      color: 'slate'
    },
    {
      name: 'Frightened',
      summary: 'Disadvantage on checks/attacks while source is in sight; can’t move closer.',
      bullets: [
        'Disadvantage on ability checks and attack rolls while the source of fear is within line of sight.',
        'Cannot willingly move closer to the source of its fear.'
      ],
      color: 'amber'
    },
    {
      name: 'Grappled',
      summary: 'Speed becomes 0; ends if grappler is incapacitated.',
      bullets: [
        'Speed becomes 0, and it can’t benefit from any bonus to its speed.',
        'Condition ends if grappler is Incapacitated or moved away via shove/thunderwave.'
      ],
      color: 'orange'
    },
    {
      name: 'Incapacitated',
      summary: 'Can’t take actions or reactions.',
      bullets: [
        'Cannot take actions or reactions.',
        'Concentration on spells is immediately broken.'
      ],
      color: 'red'
    },
    {
      name: 'Invisible',
      summary: 'Impossible to see without aid; heavily obscured for hiding.',
      bullets: [
        'Attack rolls against creature have Disadvantage.',
        'Creature’s attack rolls have Advantage.'
      ],
      color: 'cyan'
    },
    {
      name: 'Paralyzed',
      summary: 'Incapacitated, can’t move/speak; auto-fails STR/DEX saves; auto-crit within 5ft.',
      bullets: [
        'Incapacitated and cannot move or speak.',
        'Automatically fails Strength and Dexterity saving throws.',
        'Attack rolls against the creature have Advantage.',
        'Any attack that hits the creature is a Critical Hit if attacker is within 5 feet.'
      ],
      color: 'purple'
    },
    {
      name: 'Petrified',
      summary: 'Transformed into solid substance; weight x10; Incapacitated; resistant to all damage.',
      bullets: [
        'Incapacitated, can’t move or speak, unaware of surroundings.',
        'Attack rolls against creature have Advantage; auto-fails STR/DEX saves.',
        'Resistance to all damage; immune to poison and disease.'
      ],
      color: 'stone'
    },
    {
      name: 'Poisoned',
      summary: 'Disadvantage on attack rolls and ability checks.',
      bullets: [
        'Disadvantage on attack rolls and ability checks.'
      ],
      color: 'emerald'
    },
    {
      name: 'Prone',
      summary: 'Only crawl unless spending half speed to stand up.',
      bullets: [
        'Disadvantage on its own attack rolls.',
        'Attack rolls against creature have Advantage if attacker is within 5 ft; otherwise Disadvantage.'
      ],
      color: 'yellow'
    },
    {
      name: 'Restrained',
      summary: 'Speed 0; disadvantage on Dex saves & attacks; attacks against have advantage.',
      bullets: [
        'Speed becomes 0, and cannot benefit from any bonus to speed.',
        'Attack rolls against the creature have Advantage.',
        'Creature’s attack rolls have Disadvantage.',
        'Disadvantage on Dexterity saving throws.'
      ],
      color: 'violet'
    },
    {
      name: 'Stunned',
      summary: 'Incapacitated, can’t move, faltering speech; auto-fails STR/DEX saves.',
      bullets: [
        'Incapacitated, cannot move, and can speak only falteringly.',
        'Automatically fails Strength and Dexterity saving throws.',
        'Attack rolls against creature have Advantage.'
      ],
      color: 'blue'
    },
    {
      name: 'Unconscious',
      summary: 'Incapacitated, drops held items, falls prone; auto-fails STR/DEX; auto-crit within 5ft.',
      bullets: [
        'Incapacitated, can’t move or speak, unaware of surroundings.',
        'Drops whatever it’s holding and falls prone.',
        'Automatically fails Strength and Dexterity saving throws.',
        'Attack rolls against have Advantage; any hit within 5 ft is a Critical Hit.'
      ],
      color: 'rose'
    }
  ];

  interface ActionItem {
    name: string;
    type: 'Action' | 'Bonus Action' | 'Reaction' | 'Free Interaction';
    desc: string;
  }

  const actions: ActionItem[] = [
    { name: 'Attack', type: 'Action', desc: 'Make one or more melee or ranged attacks based on Extra Attack features.' },
    { name: 'Cast a Spell', type: 'Action', desc: 'Cast a spell with a casting time of 1 action (follows bonus action spell rules).' },
    { name: 'Dash', type: 'Action', desc: 'Gain extra movement for the current turn equal to your speed after modifiers.' },
    { name: 'Disengage', type: 'Action', desc: 'Your movement doesn’t provoke opportunity attacks for the rest of the turn.' },
    { name: 'Dodge', type: 'Action', desc: 'Attacks against you have Disadvantage; advantage on Dex saves until start of next turn.' },
    { name: 'Help', type: 'Action', desc: 'Grant an ally advantage on next ability check or next attack roll against a target within 5 ft.' },
    { name: 'Hide', type: 'Action', desc: 'Make a Dexterity (Stealth) check in an attempt to become hidden.' },
    { name: 'Ready', type: 'Action', desc: 'Wait for a perceptible trigger to use your reaction before the start of next turn.' },
    { name: 'Search', type: 'Action', desc: 'Devote attention to finding something via Wisdom (Perception) or Intelligence (Investigation).' },
    { name: 'Use an Object', type: 'Action', desc: 'Interact with a second object, activate a complex mechanism, or use a potion/item.' },
    { name: 'Off-Hand Two-Weapon Fighting', type: 'Bonus Action', desc: 'Attack with light weapon in other hand (don’t add ability mod to damage unless negative).' },
    { name: 'Bonus Action Spell', type: 'Bonus Action', desc: 'If cast, you can’t cast another spell this turn except a cantrip with 1 action.' },
    { name: 'Opportunity Attack', type: 'Reaction', desc: 'Make 1 melee attack when a hostile creature moves out of your reach without Disengaging.' },
    { name: 'Readied Action Trigger', type: 'Reaction', desc: 'Execute the action readied earlier when the designated trigger condition occurs.' },
    { name: 'Free Object Interaction', type: 'Free Interaction', desc: 'Draw or sheathe a sword, open an unlocked door, take an item from a belt pouch (1 free per turn).' }
  ];

  const dcTable = [
    { difficulty: 'Very Easy', dc: 5, example: 'Notice a large creature walking in broad daylight.' },
    { difficulty: 'Easy', dc: 10, example: 'Climb a knotted rope, remember common town history.' },
    { difficulty: 'Medium', dc: 15, example: 'Pick a typical chest lock, hear footsteps in a noisy tavern.' },
    { difficulty: 'Hard', dc: 20, example: 'Swim against a raging current, detect subtle arcane traps.' },
    { difficulty: 'Very Hard', dc: 25, example: 'Recall obscure ancient forgotten deities, leap across a 30ft chasm.' },
    { difficulty: 'Nearly Impossible', dc: 30, example: 'Track a displacer beast across solid stone in pouring rain.' }
  ];

  const environments = [
    {
      title: 'Falling Damage',
      rules: [
        '1d6 bludgeoning damage for every 10 feet fallen, to a maximum of 20d6 (200 ft).',
        'Creature lands Prone unless it avoids taking damage from the fall (e.g., Feather Fall).'
      ]
    },
    {
      title: 'Suffocation & Holding Breath',
      rules: [
        'A creature can hold its breath for 1 + Constitution modifier minutes (minimum 30 seconds).',
        'When out of breath or choking, it can survive for Constitution modifier rounds (minimum 1 round).',
        'At the start of its next turn, it drops to 0 hit points and is dying (cannot regain HP until breathing).'
      ]
    },
    {
      title: 'Vision & Light Levels',
      rules: [
        'Bright Light: Normal vision for all creatures.',
        'Dim Light (Lightly Obscured): Disadvantage on Wisdom (Perception) checks that rely on sight.',
        'Darkness (Heavily Obscured): Blocks vision entirely; creatures effectively suffer Blinded condition.',
        'Darkvision: See in Dim Light as Bright Light, and Darkness as Dim Light (shades of gray only).'
      ]
    },
    {
      title: 'Cover Modifiers',
      rules: [
        'Half Cover: +2 bonus to AC and Dexterity saving throws (e.g., low wall, large furniture, another creature).',
        'Three-Quarters Cover: +5 bonus to AC and Dexterity saving throws (e.g., portcullis, arrow slit).',
        'Total Cover: A target cannot be targeted directly by an attack or a spell, though area effects may spread.'
      ]
    }
  ];

  let filteredConditions = $derived(
    conditions.filter(c =>
      c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.summary.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.bullets.some(b => b.toLowerCase().includes(searchQuery.toLowerCase()))
    )
  );

  let filteredActions = $derived(
    actions.filter(a =>
      a.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      a.type.toLowerCase().includes(searchQuery.toLowerCase()) ||
      a.desc.toLowerCase().includes(searchQuery.toLowerCase())
    )
  );

  let filteredDcs = $derived(
    dcTable.filter(d =>
      d.difficulty.toLowerCase().includes(searchQuery.toLowerCase()) ||
      d.example.toLowerCase().includes(searchQuery.toLowerCase()) ||
      d.dc.toString().includes(searchQuery)
    )
  );

  let filteredEnvironments = $derived(
    environments.filter(e =>
      e.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      e.rules.some(r => r.toLowerCase().includes(searchQuery.toLowerCase()))
    )
  );
</script>

{#if isOpen}
  <!-- Backdrop -->
  <div
    class="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs transition-opacity"
    onclick={onClose}
    role="presentation"
  ></div>

  <!-- Slide-Over Drawer Container -->
  <div
    class="fixed inset-y-0 right-0 z-50 w-full max-w-xl bg-slate-900 border-l border-slate-800 shadow-2xl flex flex-col animate-in slide-in-from-right duration-200"
    role="dialog"
    aria-label="DM Quick Reference Screen"
  >
    <!-- Header -->
    <div class="px-5 py-3.5 border-b border-slate-800 bg-slate-950 flex items-center justify-between shrink-0">
      <div class="flex items-center gap-2">
        <span class="text-lg">📜</span>
        <h2 class="text-sm font-black text-slate-100 uppercase tracking-wider">DM Quick Reference Screen</h2>
      </div>
      <button
        type="button"
        onclick={onClose}
        class="w-7 h-7 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-slate-100 flex items-center justify-center font-bold text-sm transition-colors"
        aria-label="Close Reference Drawer"
      >
        ✕
      </button>
    </div>

    <!-- Search & Filter Bar -->
    <div class="p-4 border-b border-slate-800 bg-slate-900/80 space-y-3 shrink-0">
      <div class="relative">
        <input
          type="text"
          bind:value={searchQuery}
          placeholder="Filter rules, conditions, actions, cover, DCs..."
          class="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500"
        />
        {#if searchQuery}
          <button
            type="button"
            onclick={() => searchQuery = ''}
            class="absolute right-2.5 top-2 text-xs text-slate-500 hover:text-slate-300"
          >
            ✕
          </button>
        {/if}
      </div>

      <!-- Categories -->
      <div class="flex items-center gap-1.5 overflow-x-auto pb-1 text-[11px] font-bold">
        {#each [
          { id: 'all', label: 'All Rules' },
          { id: 'conditions', label: 'Conditions' },
          { id: 'actions', label: 'Actions' },
          { id: 'dcs', label: 'DC Table' },
          { id: 'environment', label: 'Environment' }
        ] as tab}
          <button
            type="button"
            onclick={() => activeTab = tab.id as TabCategory}
            class="px-2.5 py-1 rounded-lg transition-colors whitespace-nowrap {activeTab === tab.id
              ? 'bg-amber-500 text-slate-950 font-black shadow-sm'
              : 'bg-slate-800/80 hover:bg-slate-800 text-slate-400 hover:text-slate-200'}"
          >
            {tab.label}
          </button>
        {/each}
      </div>
    </div>

    <!-- Content Body -->
    <div class="flex-1 overflow-y-auto p-5 space-y-6 scrollbar-thin">
      <!-- 1. CONDITIONS -->
      {#if (activeTab === 'all' || activeTab === 'conditions') && filteredConditions.length > 0}
        <div class="space-y-3">
          <div class="flex items-center gap-2 text-xs font-black text-amber-400 uppercase tracking-wider">
            <span>🛡️</span>
            <span>Conditions Reference ({filteredConditions.length})</span>
          </div>
          <div class="grid grid-cols-1 gap-2.5">
            {#each filteredConditions as cond}
              <div class="p-3 bg-slate-950 border border-slate-800/80 rounded-xl space-y-1.5 hover:border-slate-700 transition-colors">
                <div class="flex items-center justify-between">
                  <span class="font-bold text-xs text-slate-200">{cond.name}</span>
                  <span class="text-[10px] text-slate-400 font-mono italic">{cond.summary}</span>
                </div>
                <ul class="text-[11px] text-slate-300 space-y-1 list-disc list-inside">
                  {#each cond.bullets as bullet}
                    <li class="leading-relaxed">{bullet}</li>
                  {/each}
                </ul>
              </div>
            {/each}
          </div>
        </div>
      {/if}

      <!-- 2. ACTION ECONOMY -->
      {#if (activeTab === 'all' || activeTab === 'actions') && filteredActions.length > 0}
        <div class="space-y-3">
          <div class="flex items-center gap-2 text-xs font-black text-indigo-400 uppercase tracking-wider">
            <span>⚡</span>
            <span>Action Economy ({filteredActions.length})</span>
          </div>
          <div class="grid grid-cols-1 gap-2">
            {#each filteredActions as act}
              <div class="p-2.5 bg-slate-950 border border-slate-800 rounded-xl flex items-start gap-3">
                <span class="px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-wider shrink-0 mt-0.5 {
                  act.type === 'Action' ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30' :
                  act.type === 'Bonus Action' ? 'bg-indigo-500/20 text-indigo-400 border border-indigo-500/30' :
                  act.type === 'Reaction' ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30' :
                  'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                }">
                  {act.type}
                </span>
                <div class="flex-1 min-w-0">
                  <span class="font-bold text-xs text-slate-200">{act.name}</span>
                  <p class="text-[11px] text-slate-400 leading-relaxed mt-0.5">{act.desc}</p>
                </div>
              </div>
            {/each}
          </div>
        </div>
      {/if}

      <!-- 3. COMMON DCS -->
      {#if (activeTab === 'all' || activeTab === 'dcs') && filteredDcs.length > 0}
        <div class="space-y-3">
          <div class="flex items-center gap-2 text-xs font-black text-emerald-400 uppercase tracking-wider">
            <span>🎯</span>
            <span>Standard Difficulty Classes (DC)</span>
          </div>
          <div class="overflow-hidden border border-slate-800 rounded-xl bg-slate-950">
            <table class="w-full text-left text-xs">
              <thead class="bg-slate-900/90 text-slate-400 font-bold border-b border-slate-800">
                <tr>
                  <th class="py-2 px-3">Difficulty</th>
                  <th class="py-2 px-3">DC</th>
                  <th class="py-2 px-3">Example Feat</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-850">
                {#each filteredDcs as row}
                  <tr class="hover:bg-slate-900/40 transition-colors">
                    <td class="py-2 px-3 font-semibold text-slate-200">{row.difficulty}</td>
                    <td class="py-2 px-3 font-mono font-black text-amber-400">{row.dc}</td>
                    <td class="py-2 px-3 text-[11px] text-slate-400">{row.example}</td>
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>
        </div>
      {/if}

      <!-- 4. ENVIRONMENTAL RULES -->
      {#if (activeTab === 'all' || activeTab === 'environment') && filteredEnvironments.length > 0}
        <div class="space-y-3">
          <div class="flex items-center gap-2 text-xs font-black text-cyan-400 uppercase tracking-wider">
            <span>🌪️</span>
            <span>Environmental & Hazards</span>
          </div>
          <div class="grid grid-cols-1 gap-3">
            {#each filteredEnvironments as env}
              <div class="p-3.5 bg-slate-950 border border-slate-800 rounded-xl space-y-2">
                <span class="font-bold text-xs text-slate-200">{env.title}</span>
                <ul class="text-[11px] text-slate-300 space-y-1 list-disc list-inside">
                  {#each env.rules as rule}
                    <li class="leading-relaxed">{rule}</li>
                  {/each}
                </ul>
              </div>
            {/each}
          </div>
        </div>
      {/if}
    </div>
  </div>
{/if}
