<script lang="ts">
  // WikilinkRenderer.svelte — Quartz/Obsidian-style Wikilink AST Parser & Entity Popover Host
  // Parses [[Entity Name]] or [[Entity Name|Custom Alias]], queries bestiaryStore, spellStore, and equipmentStore,
  // and renders styled interactive pill chips with floating Quartz popover cards.

  import { bestiaryStore, encounterStore } from '../../stores/bestiaryStore.svelte';
  import { spellStore, equipmentStore } from '../../stores/compendiumStore.svelte';
  import { renderMarkdown } from '../../utils/markdownRenderer';
  import type { CompendiumMonster, CompendiumSpell, CompendiumItem } from '../../db/compendiumDb';

  let {
    markdown = '',
    isDm = false,
  }: {
    markdown: string;
    isDm?: boolean;
  } = $props();

  interface MatchToken {
    type: 'text' | 'wikilink';
    text: string;
    entityName?: string;
    alias?: string;
    entityType?: 'monster' | 'spell' | 'item' | 'generic';
    monster?: CompendiumMonster;
    spell?: CompendiumSpell;
    item?: CompendiumItem;
  }

  // Active floating popover state
  let hoveredToken = $state<MatchToken | null>(null);
  let popoverPos = $state<{ x: number; y: number }>({ x: 0, y: 0 });

  function resolveEntity(name: string): {
    entityType: 'monster' | 'spell' | 'item' | 'generic';
    monster?: CompendiumMonster;
    spell?: CompendiumSpell;
    item?: CompendiumItem;
  } {
    const q = name.trim().toLowerCase();

    // 1. Monster query
    const monster = bestiaryStore.monsters.find(m => m.name.toLowerCase() === q);
    if (monster) {
      return { entityType: 'monster', monster };
    }

    // 2. Spell query
    const spell = spellStore.find(name);
    if (spell) {
      return { entityType: 'spell', spell };
    }

    // 3. Item query
    const item = equipmentStore.find(name);
    if (item) {
      return { entityType: 'item', item };
    }

    return { entityType: 'generic' };
  }

  const tokens = $derived.by(() => {
    if (!markdown) return [];

    const result: MatchToken[] = [];
    const regex = /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g;
    let lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = regex.exec(markdown)) !== null) {
      // Preceding markdown text
      if (match.index > lastIndex) {
        result.push({
          type: 'text',
          text: markdown.substring(lastIndex, match.index),
        });
      }

      const entityName = match[1].trim();
      const alias = match[2]?.trim() || entityName;
      const resolved = resolveEntity(entityName);

      result.push({
        type: 'wikilink',
        text: match[0],
        entityName,
        alias,
        ...resolved,
      });

      lastIndex = regex.lastIndex;
    }

    if (lastIndex < markdown.length) {
      result.push({
        type: 'text',
        text: markdown.substring(lastIndex),
      });
    }

    return result;
  });

  function handleMouseEnter(e: MouseEvent, token: MatchToken) {
    if (token.type !== 'wikilink' || token.entityType === 'generic') return;
    const target = e.currentTarget as HTMLElement;
    const rect = target.getBoundingClientRect();

    popoverPos = {
      x: Math.min(Math.max(10, rect.left), window.innerWidth - 320),
      y: rect.bottom + 6 + 280 > window.innerHeight ? Math.max(10, rect.top - 290) : rect.bottom + 6,
    };
    hoveredToken = token;
  }

  function handleMouseLeave() {
    hoveredToken = null;
  }

  function handleSpawnToken(monster: CompendiumMonster) {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('vtt:spawn-token', {
          detail: {
            name: monster.name,
            hp: monster.hp,
            ac: monster.ac,
            speed: monster.speed,
            cr: monster.cr,
            compendium_id: monster.id,
          },
        })
      );
    }
  }

  function handleAddToCombat(monster: CompendiumMonster) {
    encounterStore.addCombatant(monster);
  }
</script>

<div class="wikilink-content leading-relaxed">
  {#each tokens as token}
    {#if token.type === 'text'}
      {@html renderMarkdown(token.text, { isDm })}
    {:else}
      <!-- Interactive Wikilink Chip -->
      <span
        role="button"
        tabindex="0"
        onmouseenter={(e) => handleMouseEnter(e, token)}
        onmouseleave={handleMouseLeave}
        onclick={(e) => handleMouseEnter(e, token)}
        onkeydown={(e) => { if (e.key === 'Enter') handleMouseEnter(e as any, token); }}
        class="wikilink-chip
          {token.entityType === 'monster' ? 'wikilink-monster' :
           token.entityType === 'spell' ? 'wikilink-spell' :
           token.entityType === 'item' ? 'wikilink-item' : 'wikilink-generic'}"
      >
        <span>
          {#if token.entityType === 'monster'}🐉
          {:else if token.entityType === 'spell'}✨
          {:else if token.entityType === 'item'}⚔️
          {:else}🔗
          {/if}
        </span>
        <span>{token.alias}</span>
      </span>
    {/if}
  {/each}
</div>

<!-- ── Floating Quartz-Style Popover Entity Card ─────────────────────────── -->
{#if hoveredToken && hoveredToken.entityType !== 'generic'}
  <div
    class="fixed z-[100] w-80 bg-slate-900 border border-slate-700/80 rounded-xl shadow-2xl p-3.5 text-slate-100 pointer-events-auto backdrop-blur-md animate-fadeIn"
    style="left: {popoverPos.x}px; top: {popoverPos.y}px;"
    onmouseenter={() => {}}
    onmouseleave={handleMouseLeave}
    role="tooltip"
  >
    <!-- Monster Entity Card -->
    {#if hoveredToken.entityType === 'monster' && hoveredToken.monster}
      {@const m = hoveredToken.monster}
      <div class="space-y-2">
        <div class="flex items-center justify-between border-b border-slate-800 pb-1.5">
          <div>
            <h4 class="font-bold text-sm text-rose-300">{m.name}</h4>
            <p class="text-[10px] text-slate-400 italic">
              {m.size || 'Medium'} {m.type || 'creature'}{m.alignment ? `, ${m.alignment}` : ''}
            </p>
          </div>
          <span class="px-2 py-0.5 rounded bg-rose-950/80 border border-rose-800/80 text-[10px] font-mono text-rose-300 font-bold">
            CR {m.cr}
          </span>
        </div>

        <!-- Combat Stats Grid -->
        <div class="grid grid-cols-3 gap-1 bg-slate-950/60 p-2 rounded-lg text-center text-xs">
          <div>
            <span class="text-[9px] uppercase text-slate-500 font-bold block">AC</span>
            <span class="font-black text-slate-200">{m.ac}</span>
          </div>
          <div>
            <span class="text-[9px] uppercase text-slate-500 font-bold block">HP</span>
            <span class="font-black text-rose-400">{m.hp}</span>
          </div>
          <div>
            <span class="text-[9px] uppercase text-slate-500 font-bold block">Speed</span>
            <span class="font-bold text-slate-300 text-[11px] truncate">{m.speed || '30 ft.'}</span>
          </div>
        </div>

        <!-- Attacks / Actions Preview -->
        {#if m.actions && m.actions.length > 0}
          <div class="text-[11px] text-slate-300 space-y-1">
            <span class="text-[9px] uppercase text-slate-400 font-bold tracking-wider">Primary Attack:</span>
            <p class="line-clamp-2 italic text-slate-400 bg-slate-950/40 p-1.5 rounded">
              <strong class="text-rose-300">{m.actions[0].name}.</strong> {m.actions[0].description}
            </p>
          </div>
        {/if}

        <!-- Quick Action Buttons -->
        <div class="pt-2 border-t border-slate-800 flex gap-2">
          <button
            onclick={() => handleSpawnToken(m)}
            class="flex-1 px-2 py-1 bg-indigo-600 hover:bg-indigo-500 text-white rounded text-[10px] font-bold transition-colors flex items-center justify-center gap-1 shadow"
          >
            <span>📍</span>
            <span>Spawn Token</span>
          </button>
          <button
            onclick={() => handleAddToCombat(m)}
            class="flex-1 px-2 py-1 bg-rose-700 hover:bg-rose-600 text-white rounded text-[10px] font-bold transition-colors flex items-center justify-center gap-1 shadow"
          >
            <span>⚔️</span>
            <span>Add to Combat</span>
          </button>
        </div>
      </div>

    <!-- Spell Entity Card -->
    {:else if hoveredToken.entityType === 'spell' && hoveredToken.spell}
      {@const s = hoveredToken.spell}
      <div class="space-y-2">
        <div class="border-b border-slate-800 pb-1.5">
          <h4 class="font-bold text-sm text-indigo-300">{s.name}</h4>
          <p class="text-[10px] text-slate-400 italic">
            {s.level === 0 ? 'Cantrip' : `Level ${s.level}`} {s.school || 'Evocation'}
          </p>
        </div>

        <div class="grid grid-cols-2 gap-1.5 bg-slate-950/60 p-2 rounded-lg text-[10px] text-slate-300">
          <div><strong class="text-slate-500">Casting Time:</strong> {s.castingTime || '1 action'}</div>
          <div><strong class="text-slate-500">Range:</strong> {s.range || 'Self'}</div>
          <div><strong class="text-slate-500">Duration:</strong> {s.duration || 'Instant'}</div>
          <div><strong class="text-slate-500">Components:</strong> {s.components || 'V, S'}</div>
        </div>

        {#if s.description}
          <p class="text-[11px] text-slate-300 line-clamp-3 leading-relaxed bg-slate-950/30 p-1.5 rounded">
            {s.description}
          </p>
        {/if}
      </div>

    <!-- Item / Equipment Entity Card -->
    {:else if hoveredToken.entityType === 'item' && hoveredToken.item}
      {@const it = hoveredToken.item}
      <div class="space-y-2">
        <div class="border-b border-slate-800 pb-1.5">
          <h4 class="font-bold text-sm text-amber-300">{it.name}</h4>
          <p class="text-[10px] text-slate-400 capitalize">
            {it.rarity || 'Common'} {it.type || 'Equipment'}
          </p>
        </div>

        <div class="grid grid-cols-2 gap-1 bg-slate-950/60 p-2 rounded-lg text-[10px]">
          <div><strong class="text-slate-500">Cost:</strong> <span class="text-amber-400">{it.cost || '—'}</span></div>
          <div><strong class="text-slate-500">Weight:</strong> <span class="text-slate-300">{it.weight || '—'}</span></div>
        </div>

        {#if it.properties && it.properties.length > 0}
          <div class="flex flex-wrap gap-1">
            {#each it.properties as prop}
              <span class="px-1.5 py-0.5 rounded bg-amber-950/40 border border-amber-800/40 text-[9px] text-amber-200">
                {prop}
              </span>
            {/each}
          </div>
        {/if}

        {#if it.description}
          <p class="text-[11px] text-slate-300 line-clamp-3 leading-relaxed bg-slate-950/30 p-1.5 rounded">
            {it.description}
          </p>
        {/if}
      </div>
    {/if}
  </div>
{/if}

<style>
  @keyframes fadeIn {
    from { opacity: 0; transform: translateY(-4px); }
    to { opacity: 1; transform: translateY(0); }
  }
  .animate-fadeIn {
    animation: fadeIn 0.15s ease-out forwards;
  }
</style>
