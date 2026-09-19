<script lang="ts">
  // CopilotPanel.svelte — Independent, dockable Session Co-Pilot command terminal
  // Features: Slash commands (/roll, /npc, /loot, /scene, /trap, /whisper), improv generation, DM whisper integration

  import { onMount } from 'svelte';
  import { sessionStore } from '../../../stores/sessionStore';
  import { audioEngine } from '../../audio/AudioEngine';
  import { sendWsEvent } from '../../../stores/websocketStore';

  interface TerminalMessage {
    id: string;
    sender: 'dm' | 'copilot' | 'system';
    text: string;
    timestamp: number;
    isCommand?: boolean;
  }

  let inputVal = $state('');
  let isGenerating = $state(false);
  let terminalBottom: HTMLElement | null = $state(null);
  let whisperFeedback = $state<string | null>(null);

  let messages = $state<TerminalMessage[]>([
    {
      id: 'init-1',
      sender: 'copilot',
      text: 'Session Co-Pilot terminal online. Type prompt or use slash commands:\n• /roll [formula] (e.g. /roll 2d20kh1+5)\n• /whisper [pin/name] [message]\n• /npc [archetype] (e.g. /npc shady fence)\n• /loot [CR] (e.g. /loot 5)\n• /scene [mood] (e.g. /scene damp crypt)\n• /trap [DC] (e.g. /trap 14)',
      timestamp: Date.now(),
    }
  ]);

  const QUICK_CHIPS = [
    { label: '🎲 /roll 1d20+5', cmd: '/roll 1d20+5' },
    { label: '👁️ Describe Scene', cmd: '/scene eerie cavern' },
    { label: '🎭 Quick NPC', cmd: '/npc suspicious merchant' },
    { label: '💰 Roll Loot', cmd: '/loot 4' },
    { label: '⚡ Combat Twist', cmd: 'Give me an unexpected combat hazard or terrain complication right now.' },
  ];

  function executeSlashCommand(cmdLine: string): boolean {
    const trimmed = cmdLine.trim();
    if (!trimmed.startsWith('/')) return false;

    const parts = trimmed.slice(1).split(/\s+/);
    const cmd = parts[0].toLowerCase();
    const args = parts.slice(1).join(' ');

    // 1. /roll [formula]
    if (cmd === 'roll') {
      const formula = args || '1d20';
      const match = formula.match(/^(\d*)d(\d+)([+-]\d+)?$/i);
      let result = 0;
      let rolls: number[] = [];

      if (match) {
        const count = parseInt(match[1] || '1', 10);
        const sides = parseInt(match[2], 10);
        const mod = parseInt(match[3] || '0', 10);

        for (let i = 0; i < Math.min(count, 20); i++) {
          const r = Math.floor(Math.random() * sides) + 1;
          rolls.push(r);
          result += r;
        }
        result += mod;

        audioEngine.triggerSfx('sfx-dice');
        messages = [...messages, {
          id: `cmd-${Date.now()}`,
          sender: 'system',
          text: `🎲 Rolled ${formula}: [${rolls.join(', ')}]${mod ? (mod > 0 ? ` + ${mod}` : ` - ${Math.abs(mod)}`) : ''} = **${result}**`,
          timestamp: Date.now(),
          isCommand: true,
        }];

        // Broadcast to WebSocket dice feed
        sendWsEvent({
          type: 'DICE_ROLL',
          character_id: 'dm',
          character_name: 'Dungeon Master',
          formula,
          result,
          is_critical: rolls.includes(20) && sides === 20,
          breakdown: `[${rolls.join(', ')}]`,
        });
      } else {
        const simple = Math.floor(Math.random() * 20) + 1;
        audioEngine.triggerSfx('sfx-dice');
        messages = [...messages, {
          id: `cmd-${Date.now()}`,
          sender: 'system',
          text: `🎲 Rolled d20: **${simple}**`,
          timestamp: Date.now(),
          isCommand: true,
        }];
      }
      return true;
    }

    // 2. /whisper [target] [message]
    if (cmd === 'whisper') {
      const whisperParts = args.split(/\s+/);
      const target = whisperParts[0] || 'all';
      const secret = whisperParts.slice(1).join(' ');

      if (!secret) {
        messages = [...messages, {
          id: `err-${Date.now()}`,
          sender: 'system',
          text: `⚠️ Usage: /whisper [pin/charName] [secret message]`,
          timestamp: Date.now(),
        }];
        return true;
      }

      sessionStore.sendDmWhisper(target, secret);
      audioEngine.triggerSfx('sfx-bell');
      whisperFeedback = `Secret whisper sent to ${target}!`;
      setTimeout(() => { whisperFeedback = null; }, 3000);

      messages = [...messages, {
        id: `wh-${Date.now()}`,
        sender: 'system',
        text: `🤫 *Whispered to ${target}:* "${secret}"`,
        timestamp: Date.now(),
        isCommand: true,
      }];
      return true;
    }

    // 3. /npc [archetype]
    if (cmd === 'npc') {
      const names = ['Barnaby Fallow', 'Kaelen Thorne', 'Mira Vance', 'Thorik Ironbreaker', 'Elowen Starling'];
      const traits = ['Nervous eye twitch', 'Speaks in whispered riddles', 'Fiddles with a brass coin', 'Smells of crushed lavender'];
      const secrets = ['Indebted to local smuggler guild', 'Possesses half of an ancient tomb map', 'Former paladin who abandoned their vow'];

      const randomName = names[Math.floor(Math.random() * names.length)];
      const randomTrait = traits[Math.floor(Math.random() * traits.length)];
      const randomSecret = secrets[Math.floor(Math.random() * secrets.length)];

      messages = [...messages, {
        id: `npc-${Date.now()}`,
        sender: 'copilot',
        text: `🎭 **Generated NPC: ${randomName}** (${args || 'Wanderer'})\n• **Mannerism:** ${randomTrait}\n• **Secret:** ${randomSecret}\n• **Quote:** "The road ahead has swallowed wiser souls than you."`,
        timestamp: Date.now(),
      }];
      return true;
    }

    // 4. /loot [CR]
    if (cmd === 'loot') {
      const crNum = parseInt(args, 10) || 3;
      const gp = Math.floor(Math.random() * (crNum * 40)) + 15;
      const trinkets = [
        'Silver pocket watch stopped at midnight',
        'Carved bone dice with glowing numerals',
        'Vial of iridescent phosphorescent oil',
        'Signet ring depicting an owl gripping a key'
      ];
      const selectedTrinket = trinkets[Math.floor(Math.random() * trinkets.length)];

      messages = [...messages, {
        id: `loot-${Date.now()}`,
        sender: 'copilot',
        text: `💰 **Loot Cache (CR ${crNum}):**\n• Currency: **${gp} GP**, 42 SP\n• Valuables: ${selectedTrinket} (worth ~25 GP)\n• Consumable: Potion of Healing (2d4+2 HP)`,
        timestamp: Date.now(),
      }];
      return true;
    }

    // 5. /scene [mood]
    if (cmd === 'scene') {
      messages = [...messages, {
        id: `scene-${Date.now()}`,
        sender: 'copilot',
        text: `👁️ **Atmospheric Description (${args || 'Gloomy'}):**\n"The air hangs cold and stagnant, carrying the sharp scent of damp stone and ozone. Water drips steadily into a shadow-shrouded cistern, and faint scratchings behind the crumbling masonry suggest you are not alone."`,
        timestamp: Date.now(),
      }];
      return true;
    }

    // 6. /trap [DC]
    if (cmd === 'trap') {
      const dcNum = parseInt(args, 10) || 13;
      messages = [...messages, {
        id: `trap-${Date.now()}`,
        sender: 'copilot',
        text: `⚠️ **Dungeon Hazard (DC ${dcNum}):**\n• **Trigger:** Thin copper tripwire across the corridor archway.\n• **Detection:** DC ${dcNum} Wisdom (Perception).\n• **Disarm:** DC ${dcNum} Dexterity (Thieves' Tools).\n• **Effect:** Scythe blade swings from the ceiling; DC ${dcNum} Dex save or take 2d8 slashing damage.`,
        timestamp: Date.now(),
      }];
      return true;
    }

    return false;
  }

  async function handleSend() {
    const raw = inputVal.trim();
    if (!raw || isGenerating) return;
    inputVal = '';

    // Check if slash command
    if (executeSlashCommand(raw)) {
      return;
    }

    // Standard creative improv query
    messages = [...messages, {
      id: `dm-${Date.now()}`,
      sender: 'dm',
      text: raw,
      timestamp: Date.now(),
    }];

    isGenerating = true;

    // Simulate / fetch LLM improv response
    setTimeout(() => {
      messages = [...messages, {
        id: `co-${Date.now()}`,
        sender: 'copilot',
        text: `**Co-Pilot Guidance:**\n• **Dramatic Twist:** A sudden tremor rattles the chamber, threatening to collapse the archway in 3 rounds.\n• **NPC Reaction:** The guards raise shields cautiously and demand the party drop weapons.\n• **Combat Terrain:** An overturned brazier creates an area of difficult terrain that deals 1d6 fire damage.`,
        timestamp: Date.now(),
      }];
      isGenerating = false;
    }, 600);
  }

  function handleKeyDown(e: KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  onMount(() => {
    const handleTradeAudit = (e: Event) => {
      const audit = (e as CustomEvent).detail;
      if (!audit) return;
      const icon = audit.status === 'ACCEPTED' ? '🤝' : audit.status === 'DECLINED' ? '❌' : '📦';
      messages = [...messages, {
        id: `trade-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        sender: 'system',
        text: `${icon} **[Peer Trade: ${audit.status}]** ${audit.sender_name} ➔ ${audit.receiver_name}: **${audit.quantity}x ${audit.item_name}**${audit.notes ? ` — *${audit.notes}*` : ''}`,
        timestamp: audit.timestamp || Date.now(),
        isCommand: true,
      }];
    };

    window.addEventListener('vtt:trade-audit', handleTradeAudit);
    return () => {
      window.removeEventListener('vtt:trade-audit', handleTradeAudit);
    };
  });

  $effect(() => {
    if (messages.length) {
      setTimeout(() => terminalBottom?.scrollIntoView({ behavior: 'smooth' }), 50);
    }
  });
</script>

<div class="h-full flex flex-col bg-slate-900 border-l border-slate-800 text-slate-100 select-none overflow-hidden">
  <!-- Header -->
  <div class="h-10 px-3 bg-slate-950 border-b border-slate-800 flex items-center justify-between shrink-0">
    <div class="flex items-center gap-2">
      <span class="text-sm">🤖</span>
      <span class="text-xs font-bold uppercase tracking-wider text-amber-300">Session Co-Pilot</span>
      <span class="text-[9px] font-mono px-1.5 py-0.5 rounded bg-amber-950/80 text-amber-400 border border-amber-800/40">DM Terminal</span>
    </div>

    <button
      onclick={() => messages = messages.slice(0, 1)}
      class="p-1 rounded text-slate-500 hover:text-rose-400 hover:bg-slate-800 transition-colors text-xs"
      title="Clear Terminal Output"
    >
      🗑️
    </button>
  </div>

  {#if whisperFeedback}
    <div class="bg-amber-950/90 border-b border-amber-700/60 px-3 py-1.5 text-center text-xs font-bold text-amber-300 animate-pulse shrink-0">
      ⚡ {whisperFeedback}
    </div>
  {/if}

  <!-- Quick Action Chips -->
  <div class="p-2 border-b border-slate-800 bg-slate-950/40 flex flex-wrap gap-1 shrink-0">
    {#each QUICK_CHIPS as chip}
      <button
        onclick={() => { inputVal = chip.cmd; handleSend(); }}
        class="px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors"
      >
        {chip.label}
      </button>
    {/each}
  </div>

  <!-- Terminal Messages Thread -->
  <div class="flex-1 overflow-y-auto p-3 space-y-3 text-xs font-sans">
    {#each messages as msg (msg.id)}
      <div class="flex flex-col gap-1 {msg.sender === 'dm' ? 'items-end' : 'items-start'}">
        <div class="flex items-center gap-1.5 text-[10px] text-slate-500">
          <span class="font-semibold uppercase tracking-wider">
            {msg.sender === 'dm' ? 'DM Command' : msg.sender === 'system' ? 'System' : 'Co-Pilot'}
          </span>
        </div>

        <div
          class="max-w-[92%] rounded-xl px-3 py-2 leading-relaxed whitespace-pre-wrap {msg.sender === 'dm'
            ? 'bg-amber-600 text-slate-950 font-semibold rounded-tr-none'
            : msg.sender === 'system'
            ? 'bg-slate-950/90 border border-amber-800/40 text-amber-200 rounded-tl-none font-mono text-[11px]'
            : 'bg-slate-950 border border-slate-800 text-slate-200 rounded-tl-none shadow-sm'}"
        >
          {msg.text}
        </div>
      </div>
    {/each}
    <div bind:this={terminalBottom}></div>
  </div>

  <!-- Terminal Input -->
  <div class="p-2.5 bg-slate-950 border-t border-slate-800 shrink-0">
    <div class="flex gap-1.5">
      <input
        type="text"
        bind:value={inputVal}
        onkeydown={handleKeyDown}
        placeholder="Type command (/roll, /whisper, /npc, /loot, /scene) or improv prompt…"
        class="flex-1 bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-amber-500"
      />
      <button
        onclick={handleSend}
        disabled={!inputVal.trim() || isGenerating}
        class="px-3 bg-amber-600 hover:bg-amber-500 disabled:opacity-30 text-slate-950 rounded-lg text-xs font-bold transition-colors shadow"
      >
        Run
      </button>
    </div>
  </div>
</div>
