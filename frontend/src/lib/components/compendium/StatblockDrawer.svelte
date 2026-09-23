<!-- src/lib/components/compendium/StatblockDrawer.svelte -->
<!-- Sliding Slide-Over Drawer for 5e Monster Statblocks, Spells, Items & Rules (Svelte 5 Runes) -->

<script lang="ts">
  import type {
    CompendiumMonster,
    CompendiumSpell,
    CompendiumItem,
    CompendiumRule,
  } from '../../db/compendiumDb';

  export type SelectedCompendiumEntry =
    | { type: 'monster'; data: CompendiumMonster }
    | { type: 'spell'; data: CompendiumSpell }
    | { type: 'item'; data: CompendiumItem }
    | { type: 'rule'; data: CompendiumRule };

  let {
    isOpen = $bindable(false),
    entry = null,
    onClose = () => { isOpen = false; },
    onAddToEncounter,
    onPinToQuickbar,
  }: {
    isOpen?: boolean;
    entry?: SelectedCompendiumEntry | null;
    onClose?: () => void;
    onAddToEncounter?: (monster: CompendiumMonster) => void;
    onPinToQuickbar?: (entry: SelectedCompendiumEntry) => void;
  } = $props();

  let toastMessage = $state<string | null>(null);

  function showToast(msg: string) {
    toastMessage = msg;
    setTimeout(() => {
      if (toastMessage === msg) toastMessage = null;
    }, 2500);
  }

  function formatModifier(score: number | undefined): string {
    if (score === undefined) return '+0';
    const mod = Math.floor((score - 10) / 2);
    return mod >= 0 ? `+${mod}` : `${mod}`;
  }

  function formatCr(cr: number | undefined): string {
    if (cr === undefined) return '—';
    if (cr === 0.125) return '1/8 (25 XP)';
    if (cr === 0.25) return '1/4 (50 XP)';
    if (cr === 0.5) return '1/2 (100 XP)';
    const xpMap: Record<number, number> = {
      0: 10, 1: 200, 2: 450, 3: 700, 4: 1100, 5: 1800, 6: 2300, 7: 2900, 8: 3900,
      9: 5000, 10: 5900, 11: 7200, 12: 8400, 13: 10000, 14: 11500, 15: 13000,
      16: 15000, 17: 18000, 18: 20000, 19: 22000, 20: 25000, 21: 33000, 22: 41000,
      23: 50000, 24: 62000, 30: 155000
    };
    const xp = xpMap[cr] || Math.round(cr * 200);
    return `${cr} (${xp.toLocaleString()} XP)`;
  }

  function getHitDiceFormula(m: CompendiumMonster): string {
    if (m.hitDice) return `${m.hp} (${m.hitDice})`;
    const sizeDice: Record<string, number> = {
      tiny: 4,
      small: 6,
      medium: 8,
      large: 10,
      huge: 12,
      gargantuan: 20
    };
    const d = sizeDice[m.size?.toLowerCase() || 'medium'] || 8;
    const conMod = Math.floor(((m.con ?? 10) - 10) / 2);
    const avgPerDie = (d + 1) / 2;
    const effectiveAvg = Math.max(1, avgPerDie + conMod);
    const numDice = Math.max(1, Math.round(m.hp / effectiveAvg));
    const bonus = numDice * conMod;
    const bonusStr = bonus > 0 ? ` + ${bonus}` : bonus < 0 ? ` - ${Math.abs(bonus)}` : '';
    return `${m.hp} (${numDice}d${d}${bonusStr})`;
  }

  function getSenses(m: CompendiumMonster): string {
    if (m.senses) return m.senses;
    const wisMod = Math.floor(((m.wis ?? 10) - 10) / 2);
    const passivePerc = 10 + wisMod;
    return `passive Perception ${passivePerc}`;
  }

  function formatSpellHeader(level: number, school: string): string {
    if (level === 0) return `${school} cantrip`;
    const ord = ['th', 'st', 'nd', 'rd', 'th', 'th', 'th', 'th', 'th', 'th'][level] || 'th';
    return `${level}${ord}-level ${school.toLowerCase()}`;
  }

  function rarityClass(r?: string): string {
    const lower = (r || '').toLowerCase();
    if (lower.includes('uncommon')) return 'text-emerald-400 bg-emerald-950/60 border-emerald-800/60';
    if (lower.includes('very rare')) return 'text-purple-400 bg-purple-950/60 border-purple-800/60';
    if (lower.includes('rare')) return 'text-blue-400 bg-blue-950/60 border-blue-800/60';
    if (lower.includes('legendary') || lower.includes('artifact')) return 'text-amber-400 bg-amber-950/60 border-amber-800/60';
    return 'text-slate-400 bg-slate-900 border-slate-700';
  }

  function requiresAttunement(it: CompendiumItem): boolean {
    if (it.attunement) return true;
    if (it.properties?.some((p) => p.toLowerCase().includes('attunement'))) return true;
    return !!(it.description && it.description.toLowerCase().includes('requires attunement'));
  }

  function handleAddCombat() {
    if (entry?.type === 'monster') {
      onAddToEncounter?.(entry.data);
      showToast(`Added ${entry.data.name} to Encounter`);
    }
  }

  function handlePin() {
    if (entry) {
      onPinToQuickbar?.(entry);
      const name = entry.type === 'rule' ? entry.data.title : entry.data.name;
      showToast(`Pinned "${name}" to Quickbar`);
    }
  }
</script>

<svelte:window onkeydown={(e) => { if (e.key === 'Escape' && isOpen) onClose(); }} />

{#if isOpen && entry}
  <!-- Backdrop -->
  <div
    class="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-sm transition-opacity"
    role="presentation"
    onclick={onClose}
  ></div>

  <!-- Slide-Over Drawer Container -->
  <div
    class="fixed inset-y-0 right-0 z-50 w-full max-w-lg bg-slate-900 border-l border-slate-800 shadow-2xl flex flex-col text-slate-100 transition-transform duration-300 ease-out"
    role="dialog"
    aria-modal="true"
    aria-labelledby="drawer-title"
  >
    <!-- Drawer Header -->
    <div class="px-5 py-3.5 border-b border-slate-800 flex items-center justify-between bg-slate-950/60 shrink-0">
      <div class="flex items-center gap-2.5 min-w-0">
        <span class="text-xl">
          {#if entry.type === 'monster'}🐉{:else if entry.type === 'spell'}✨{:else if entry.type === 'item'}⚔️{:else}📜{/if}
        </span>
        <div class="min-w-0">
          <h2 id="drawer-title" class="text-sm font-black text-slate-100 truncate">
            {entry.type === 'rule' ? entry.data.title : entry.data.name}
          </h2>
          <span class="text-[10px] font-mono text-slate-400 uppercase tracking-wider">
            5e SRD 5.1 · {entry.type}
          </span>
        </div>
      </div>

      <div class="flex items-center gap-2">
        <button
          type="button"
          onclick={handlePin}
          class="px-2.5 py-1 text-xs font-semibold rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition-colors flex items-center gap-1"
          title="Pin to Quickbar"
        >
          <span>📌</span> Pin to Quickbar
        </button>

        {#if entry.type === 'monster'}
          <button
            type="button"
            onclick={handleAddCombat}
            class="px-3 py-1 text-xs font-bold rounded-lg bg-rose-600 hover:bg-rose-500 text-white transition-colors shadow flex items-center gap-1"
            title="Add to Encounter Combat Tracker"
          >
            <span>⚔️</span> Add to Encounter
          </button>
        {/if}

        <button
          type="button"
          onclick={onClose}
          class="p-1.5 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-slate-800 transition-colors ml-1"
          aria-label="Close Drawer"
        >
          ✕
        </button>
      </div>
    </div>

    {#if toastMessage}
      <div class="px-4 py-1.5 bg-indigo-600 text-white text-xs font-bold text-center animate-fade-in shrink-0">
        {toastMessage}
      </div>
    {/if}

    <!-- Drawer Body -->
    <div class="flex-1 overflow-y-auto p-5 space-y-4 scrollbar-thin">
      <!-- ═════════════════════════════════════════════════════════════════════
           1. MONSTER STATBLOCK
      ══════════════════════════════════════════════════════════════════════ -->
      {#if entry.type === 'monster'}
        {@const m = entry.data}
        <div class="space-y-3 font-sans">
          <!-- Title & Subtitle -->
          <div class="border-b-2 border-rose-900/60 pb-2">
            <h1 class="text-2xl font-black text-rose-400 font-serif tracking-wide">{m.name}</h1>
            <p class="text-xs italic text-slate-400">
              {m.size || 'Medium'} {m.type}, {m.alignment || 'unaligned'}
            </p>
          </div>

          <!-- Basic Vitals (AC, HP with Hit Dice formula, Speed) -->
          <div class="text-xs space-y-1.5 text-slate-300 border-b border-slate-800 pb-2.5">
            <div>
              <strong class="text-rose-400 font-semibold">Armor Class</strong>
              <span class="ml-2 font-mono text-slate-100">{m.ac}</span>
            </div>
            <div>
              <strong class="text-rose-400 font-semibold">Hit Points</strong>
              <span class="ml-2 font-mono text-slate-100">{getHitDiceFormula(m)}</span>
            </div>
            <div>
              <strong class="text-rose-400 font-semibold">Speed</strong>
              <span class="ml-2 text-slate-200">{m.speed || '30 ft.'}</span>
            </div>
          </div>

          <!-- 6 Ability Scores Grid (+ Modifiers) -->
          <div class="grid grid-cols-6 gap-1 bg-slate-950/80 p-2.5 rounded-xl border border-slate-800 text-center text-xs">
            {#each [
              { name: 'STR', val: m.str ?? 10 },
              { name: 'DEX', val: m.dex ?? 10 },
              { name: 'CON', val: m.con ?? 10 },
              { name: 'INT', val: m.int ?? 10 },
              { name: 'WIS', val: m.wis ?? 10 },
              { name: 'CHA', val: m.cha ?? 10 }
            ] as stat}
              <div class="space-y-0.5">
                <span class="block text-[10px] font-bold text-slate-500 uppercase">{stat.name}</span>
                <span class="block font-bold text-slate-200">{stat.val}</span>
                <span class="block text-[10px] font-mono font-semibold text-indigo-400">
                  {formatModifier(stat.val)}
                </span>
              </div>
            {/each}
          </div>

          <!-- 5e Meta Details: Saving Throws, Skills, Senses, Languages, CR/XP -->
          <div class="text-xs space-y-1 text-slate-300 border-b border-slate-800 pb-2.5">
            {#if m.savingThrows}
              <div>
                <strong class="text-rose-400 font-semibold">Saving Throws:</strong>
                <span class="ml-1 text-slate-200">{m.savingThrows}</span>
              </div>
            {/if}

            {#if m.skills}
              <div>
                <strong class="text-rose-400 font-semibold">Skills:</strong>
                <span class="ml-1 text-slate-200">{m.skills}</span>
              </div>
            {/if}

            <div>
              <strong class="text-rose-400 font-semibold">Senses:</strong>
              <span class="ml-1 text-slate-200">{getSenses(m)}</span>
            </div>

            <div>
              <strong class="text-rose-400 font-semibold">Languages:</strong>
              <span class="ml-1 text-slate-200">{m.languages || '—'}</span>
            </div>

            <div>
              <strong class="text-rose-400 font-semibold">Challenge:</strong>
              <span class="ml-1 font-mono text-slate-100">{formatCr(m.cr)}</span>
            </div>
          </div>

          <!-- Traits -->
          {#if m.traits && m.traits.length > 0}
            <div class="space-y-2 pt-1">
              {#each m.traits as trait}
                <div class="text-xs text-slate-300 leading-relaxed">
                  <strong class="font-bold text-slate-100 italic">{trait.name}.</strong>
                  <span class="ml-1">{trait.description}</span>
                </div>
              {/each}
            </div>
          {/if}

          <!-- Actions -->
          {#if m.actions && m.actions.length > 0}
            <div class="space-y-2 pt-1">
              <h3 class="text-xs font-bold uppercase tracking-wider text-rose-400 border-b border-rose-900/40 pb-1">
                Actions
              </h3>
              {#each m.actions as action}
                <div class="text-xs text-slate-300 leading-relaxed">
                  <strong class="font-bold text-slate-100 italic">{action.name}.</strong>
                  <span class="ml-1">{action.description}</span>
                </div>
              {/each}
            </div>
          {/if}

          <!-- Legendary Actions -->
          {#if (m.legendaryActions && m.legendaryActions.length > 0) || (m.legendary_actions && m.legendary_actions.length > 0)}
            <div class="space-y-2 pt-1">
              <h3 class="text-xs font-bold uppercase tracking-wider text-amber-400 border-b border-amber-900/40 pb-1">
                Legendary Actions
              </h3>
              <p class="text-[11px] text-slate-400 italic">
                The {m.name} can take 3 legendary actions, choosing from the options below.
              </p>
              {#each (m.legendaryActions || m.legendary_actions || []) as legAction}
                <div class="text-xs text-slate-300 leading-relaxed">
                  <strong class="font-bold text-amber-200 italic">{legAction.name}.</strong>
                  <span class="ml-1">{legAction.description}</span>
                </div>
              {/each}
            </div>
          {/if}
        </div>

      <!-- ═════════════════════════════════════════════════════════════════════
           2. SPELL DETAILS
      ══════════════════════════════════════════════════════════════════════ -->
      {:else if entry.type === 'spell'}
        {@const s = entry.data}
        <div class="space-y-3">
          <div class="border-b-2 border-cyan-900/60 pb-2">
            <h1 class="text-2xl font-black text-cyan-300 font-serif tracking-wide">{s.name}</h1>
            <p class="text-xs italic text-slate-400">
              {formatSpellHeader(s.level, s.school)}
              {#if s.ritual}
                <span class="ml-1 px-1.5 py-0.2 rounded text-[9px] bg-cyan-950 text-cyan-300 border border-cyan-800 font-sans not-italic">
                  Ritual
                </span>
              {/if}
            </p>
          </div>

          <!-- Casting Parameters Grid -->
          <div class="grid grid-cols-2 gap-2 text-xs bg-slate-950/80 p-3 rounded-xl border border-slate-800">
            <div>
              <strong class="text-slate-500 block text-[10px] uppercase font-bold">Casting Time</strong>
              <span class="text-slate-200">{s.castingTime || s.casting_time || '1 action'}</span>
            </div>
            <div>
              <strong class="text-slate-500 block text-[10px] uppercase font-bold">Range</strong>
              <span class="text-slate-200">{s.range}</span>
            </div>
            <div>
              <strong class="text-slate-500 block text-[10px] uppercase font-bold">Components</strong>
              <span class="text-slate-200">{s.components}</span>
            </div>
            <div>
              <strong class="text-slate-500 block text-[10px] uppercase font-bold">Duration</strong>
              <span class="text-slate-200">
                {s.duration}
                {#if s.concentration || s.duration.toLowerCase().includes('concentration')}
                  <span class="text-amber-400 text-[10px] font-bold block">(Concentration)</span>
                {/if}
              </span>
            </div>
          </div>

          <!-- Spell Description -->
          <div class="pt-2 text-xs text-slate-200 leading-relaxed whitespace-pre-wrap space-y-2">
            <p>{s.description}</p>
          </div>

          {#if s.parentClass && s.parentClass.length > 0}
            <div class="pt-2 border-t border-slate-800 text-xs text-slate-400">
              <strong class="text-slate-500">Classes:</strong> {s.parentClass.join(', ')}
            </div>
          {/if}
        </div>

      <!-- ═════════════════════════════════════════════════════════════════════
           3. ITEM DETAILS
      ══════════════════════════════════════════════════════════════════════ -->
      {:else if entry.type === 'item'}
        {@const it = entry.data}
        <div class="space-y-3">
          <div class="border-b-2 border-amber-900/60 pb-2">
            <h1 class="text-2xl font-black text-amber-300 font-serif tracking-wide">{it.name}</h1>
            <div class="flex items-center gap-2 mt-1 flex-wrap">
              <span class="px-2 py-0.5 rounded text-[10px] font-semibold border {rarityClass(it.rarity)}">
                {it.rarity || 'Common'}
              </span>
              <span class="text-xs text-slate-400 font-semibold">{it.type}</span>
              {#if requiresAttunement(it)}
                <span class="text-[10px] text-amber-400 font-mono italic bg-amber-950/60 border border-amber-800/50 px-1.5 py-0.5 rounded">
                  Requires Attunement
                </span>
              {/if}
            </div>
          </div>

          <!-- Stats / Cost / Weight / Properties -->
          <div class="flex flex-wrap gap-4 text-xs bg-slate-950/80 p-3 rounded-xl border border-slate-800">
            {#if it.cost}
              <div>
                <strong class="text-slate-500 block text-[10px] uppercase font-bold">Cost</strong>
                <span class="text-slate-200 font-semibold">{it.cost}</span>
              </div>
            {/if}
            {#if it.weight !== undefined}
              <div>
                <strong class="text-slate-500 block text-[10px] uppercase font-bold">Weight</strong>
                <span class="text-slate-200 font-semibold">{it.weight} lb.</span>
              </div>
            {/if}
            {#if it.damage}
              <div>
                <strong class="text-slate-500 block text-[10px] uppercase font-bold">Damage</strong>
                <span class="text-rose-400 font-semibold">{it.damage}</span>
              </div>
            {/if}
            {#if it.armorClass}
              <div>
                <strong class="text-slate-500 block text-[10px] uppercase font-bold">Armor Class</strong>
                <span class="text-indigo-400 font-semibold">{it.armorClass}</span>
              </div>
            {/if}
          </div>

          <!-- Properties Chips -->
          {#if it.properties && it.properties.length > 0}
            <div class="space-y-1">
              <strong class="text-slate-500 block text-[10px] uppercase font-bold">Properties</strong>
              <div class="flex flex-wrap gap-1.5">
                {#each it.properties as prop}
                  <span class="px-2 py-0.5 rounded-md bg-slate-800 text-slate-300 border border-slate-700 text-[10px] font-mono">
                    {prop}
                  </span>
                {/each}
              </div>
            </div>
          {/if}

          <!-- Description -->
          <div class="pt-2 text-xs text-slate-200 leading-relaxed whitespace-pre-wrap">
            <p>{it.description || 'No detailed lore notes registered for this item.'}</p>
          </div>
        </div>

      <!-- ═════════════════════════════════════════════════════════════════════
           4. RULE DETAILS
      ══════════════════════════════════════════════════════════════════════ -->
      {:else if entry.type === 'rule'}
        {@const r = entry.data}
        <div class="space-y-3">
          <div class="border-b-2 border-indigo-900/60 pb-2">
            <h1 class="text-2xl font-black text-indigo-300 font-serif tracking-wide">{r.title}</h1>
            <div class="flex items-center gap-2 mt-1">
              <span class="px-2 py-0.5 rounded text-[10px] font-semibold bg-indigo-950/80 text-indigo-300 border border-indigo-800/60">
                {r.category}
              </span>
              <span class="text-[10px] font-mono text-slate-500">#{r.slug}</span>
            </div>
          </div>

          <div class="pt-2 text-xs text-slate-200 leading-relaxed whitespace-pre-wrap">
            <p>{r.content}</p>
          </div>
        </div>
      {/if}
    </div>
  </div>
{/if}
