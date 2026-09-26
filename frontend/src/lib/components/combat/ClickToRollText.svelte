<!-- ClickToRollText.svelte — AboveVTT-Style Click-to-Roll Interactive Action Parser -->
<script lang="ts">
  import { chatStore } from '../../stores/chatStore.svelte';

  interface Props {
    text: string;
    actorName?: string;
    actionName?: string;
  }

  let { text = '', actorName = 'Monster', actionName = '' }: Props = $props();

  interface TokenSegment {
    type: 'text' | 'attack' | 'damage' | 'save';
    content: string;
    raw: string;
    attackBonus?: number;
    damageFormula?: string;
    damageType?: string;
    dc?: number;
    saveAbility?: string;
  }

  // Parses text into interactive AboveVTT pills and plain text segments
  function parseSegments(rawText: string): TokenSegment[] {
    if (!rawText) return [];

    // Combined regex capturing:
    // 1. Attack rolls: (+/-X to hit)
    // 2. Damage expressions: (XdY +/- Z [type] damage)
    // 3. Saving throws: (DC N Ability)
    const combinedRegex = /(?:(\+?\d+)\s+to\s+hit)|(?:(\d+d\d+(?:\s*[+-]\s*\d+)?)\s*([a-zA-Z]+)?\s*damage)|(?:DC\s+(\d+)\s+(Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma))/gi;

    const segments: TokenSegment[] = [];
    let lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = combinedRegex.exec(rawText)) !== null) {
      if (match.index > lastIndex) {
        segments.push({
          type: 'text',
          content: rawText.slice(lastIndex, match.index),
          raw: rawText.slice(lastIndex, match.index),
        });
      }

      if (match[1] !== undefined) {
        // Attack Roll
        const bonus = parseInt(match[1], 10);
        segments.push({
          type: 'attack',
          content: match[0],
          raw: match[0],
          attackBonus: bonus,
        });
      } else if (match[2] !== undefined) {
        // Damage Expression
        const formula = match[2].trim();
        const dmgType = match[3] ? match[3].trim() : '';
        segments.push({
          type: 'damage',
          content: match[0],
          raw: match[0],
          damageFormula: formula,
          damageType: dmgType,
        });
      } else if (match[4] !== undefined) {
        // Saving Throw
        const dc = parseInt(match[4], 10);
        const ability = match[5];
        segments.push({
          type: 'save',
          content: match[0],
          raw: match[0],
          dc,
          saveAbility: ability,
        });
      }

      lastIndex = combinedRegex.lastIndex;
    }

    if (lastIndex < rawText.length) {
      segments.push({
        type: 'text',
        content: rawText.slice(lastIndex),
        raw: rawText.slice(lastIndex),
      });
    }

    return segments;
  }

  let parsedSegments = $derived(parseSegments(text));

  function handleAttackClick(e: MouseEvent, seg: TokenSegment) {
    e.stopPropagation();
    e.preventDefault();
    if (seg.attackBonus === undefined) return;

    const bonus = seg.attackBonus;
    const sign = bonus >= 0 ? '+' : '';

    if (e.shiftKey) {
      // Advantage: roll 2d20 keep highest
      chatStore.roll(`2d20kh1${sign}${bonus}`, {
        label: `${actorName}: ${actionName || 'Attack'} (Advantage)`,
        actorName,
        actionType: 'attack',
      });
    } else if (e.altKey) {
      // Disadvantage: roll 2d20 keep lowest
      chatStore.roll(`2d20kl1${sign}${bonus}`, {
        label: `${actorName}: ${actionName || 'Attack'} (Disadvantage)`,
        actorName,
        actionType: 'attack',
      });
    } else {
      // Normal attack roll
      chatStore.roll(`1d20${sign}${bonus}`, {
        label: `${actorName}: ${actionName || 'Attack'} (To Hit)`,
        actorName,
        actionType: 'attack',
        explicitTerms: [
          { label: '1d20', value: 0 },
          { label: 'To Hit', value: bonus },
        ],
      });
    }
  }

  function handleDamageClick(e: MouseEvent, seg: TokenSegment) {
    e.stopPropagation();
    e.preventDefault();
    if (!seg.damageFormula) return;

    let formula = seg.damageFormula;
    let label = `${actorName}: ${actionName || 'Damage'} (${seg.damageType ? seg.damageType + ' ' : ''}damage)`;

    if (e.shiftKey) {
      // Critical Hit: double dice count in formula (e.g. 2d6+3 -> 4d6+3)
      formula = formula.replace(/^(\d+)d(\d+)/i, (_match, count, sides) => {
        return `${parseInt(count, 10) * 2}d${sides}`;
      });
      label = `💥 ${actorName}: ${actionName || 'Damage'} [CRITICAL HIT] (${seg.damageType ? seg.damageType + ' ' : ''}damage)`;
    }

    chatStore.roll(formula, {
      label,
      actorName,
      actionType: 'damage',
    });
  }

  function handleSaveClick(e: MouseEvent, seg: TokenSegment) {
    e.stopPropagation();
    e.preventDefault();
    if (seg.dc === undefined || !seg.saveAbility) return;

    chatStore.sendMessage(
      `⚡ **${actorName}** forces a **DC ${seg.dc} ${seg.saveAbility} Saving Throw** with *${actionName || 'Action'}*!`,
      actorName,
      true
    );
  }
</script>

<span>
  {#each parsedSegments as seg}
    {#if seg.type === 'text'}
      <span>{seg.content}</span>
    {:else if seg.type === 'attack'}
      <button
        type="button"
        onclick={(e) => handleAttackClick(e, seg)}
        class="inline-flex items-center gap-1 mx-1 px-1.5 py-0.5 rounded font-mono font-bold text-xs bg-amber-900/80 hover:bg-amber-800 active:scale-95 text-amber-200 border border-amber-600/60 shadow-xs cursor-pointer select-none transition-all"
        title="⚔️ Click: Roll Attack | Shift: Advantage | Alt: Disadvantage"
      >
        <span>⚔️</span>
        <span>{seg.content}</span>
      </button>
    {:else if seg.type === 'damage'}
      <button
        type="button"
        onclick={(e) => handleDamageClick(e, seg)}
        class="inline-flex items-center gap-1 mx-1 px-1.5 py-0.5 rounded font-mono font-bold text-xs bg-rose-950/80 hover:bg-rose-900 active:scale-95 text-rose-200 border border-rose-600/60 shadow-xs cursor-pointer select-none transition-all"
        title="💥 Click: Roll Damage | Shift: Critical Hit"
      >
        <span>💥</span>
        <span>{seg.content}</span>
      </button>
    {:else if seg.type === 'save'}
      <button
        type="button"
        onclick={(e) => handleSaveClick(e, seg)}
        class="inline-flex items-center gap-1 mx-1 px-1.5 py-0.5 rounded font-mono font-bold text-xs bg-indigo-950/80 hover:bg-indigo-900 active:scale-95 text-indigo-200 border border-indigo-600/60 shadow-xs cursor-pointer select-none transition-all"
        title="⚡ Click: Announce DC Save Challenge"
      >
        <span>⚡</span>
        <span>{seg.content}</span>
      </button>
    {/if}
  {/each}
</span>
