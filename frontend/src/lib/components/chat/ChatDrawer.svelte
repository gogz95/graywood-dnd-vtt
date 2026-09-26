<!-- src/lib/components/chat/ChatDrawer.svelte -->
<!-- Svelte 5 Integrated Tabletop Chat Feed with Dice Rolls, Whispers, OOC & Speaker Selector -->

<script lang="ts">
  import { chatStore, type ChatMessage } from '../../stores/chatStore.svelte';
  import { tokenStore } from '../../stores/tokenStore.svelte';
  import { applyDamageToToken } from '../../services/combatResolution';
  import { targetingStore } from '../../stores/targetingStore.svelte';
  import { canvasStore } from '../../../stores/canvasStore.svelte';

  let {
    isDm = true,
    userName = 'Dungeon Master',
    playerName = 'Player',
  }: {
    isDm?: boolean;
    userName?: string;
    playerName?: string;
  } = $props();

  let damageFeedback = $state<string | null>(null);
  let inputText = $state('');
  let isSecretMode = $state(false);
  let messagesContainer = $state<HTMLDivElement | null>(null);

  // Speaker Selector State: 'dm' | 'player' | characterTokenName
  let selectedSpeaker = $state<string>('');

  $effect(() => {
    if (!selectedSpeaker) {
      selectedSpeaker = isDm ? 'Dungeon Master' : (playerName || 'Player');
    }
  });

  // Available speaker options derived from tokenStore and defaults
  let speakerOptions = $derived.by(() => {
    const list: string[] = [];
    if (isDm) {
      list.push('Dungeon Master');
    }
    list.push(playerName || 'Player');

    // Add controlled/available token names
    const tokens = tokenStore.tokens || [];
    for (const t of tokens) {
      if (t.name && !list.includes(t.name)) {
        list.push(t.name);
      }
    }
    return list;
  });

  const QUICK_DICE = [
    { label: 'd4', sides: 4 },
    { label: 'd6', sides: 6 },
    { label: 'd8', sides: 8 },
    { label: 'd10', sides: 10 },
    { label: 'd12', sides: 12 },
    { label: 'd20', sides: 20 },
    { label: 'd100', sides: 100 },
  ];

  $effect(() => {
    // Auto-scroll on new messages
    if (chatStore.messages.length && messagesContainer) {
      setTimeout(() => {
        messagesContainer?.scrollTo({ top: messagesContainer.scrollHeight, behavior: 'smooth' });
      }, 50);
    }
  });

  function handleSubmit() {
    const txt = inputText.trim();
    if (!txt) return;

    const speaker = selectedSpeaker.trim() || userName;

    if (isSecretMode && !txt.startsWith('/')) {
      if (/\d*d\d+/i.test(txt)) {
        chatStore.roll(txt, { label: 'Secret DM Roll', actorName: speaker, isSecret: true });
      } else {
        chatStore.sendMessage(`/gmroll ${txt}`, speaker, isDm);
      }
    } else {
      chatStore.sendMessage(txt, speaker, isDm);
    }
    inputText = '';
  }

  function handleQuickRoll(sides: number) {
    const speaker = selectedSpeaker.trim() || userName;
    chatStore.roll(`1d${sides}`, {
      label: `d${sides} Roll`,
      actorName: speaker,
      isSecret: isSecretMode,
    });
  }

  function formatTime(ts: number): string {
    const d = new Date(ts);
    return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
  }
</script>

<!-- Floating Collapsed Toggle Button (Visible when closed) -->
{#if !chatStore.isOpen}
  <button
    type="button"
    onclick={() => chatStore.open()}
    class="fixed bottom-4 right-4 z-40 px-3.5 py-2.5 rounded-2xl bg-slate-900/90 hover:bg-slate-800 border border-slate-700/80 text-amber-300 font-bold text-xs shadow-2xl shadow-black/80 backdrop-blur-md flex items-center gap-2 transition-all hover:scale-105 active:scale-95"
    title="Open Session Chat & Universal Dice Log"
  >
    <span class="text-base">💬</span>
    <span>Tabletop Chat</span>
    {#if chatStore.messages.length > 0}
      <span class="px-1.5 py-0.2 rounded-full bg-amber-500 text-slate-950 font-mono text-[10px] font-black">
        {chatStore.messages.length}
      </span>
    {/if}
  </button>
{/if}

<!-- Slide-Over Drawer Shell -->
{#if chatStore.isOpen}
  <aside
    class="fixed top-0 right-0 h-full w-80 sm:w-96 bg-slate-950/95 backdrop-blur-xl border-l border-slate-800 shadow-2xl z-50 flex flex-col transition-all duration-300 animate-in slide-in-from-right"
    aria-label="Tabletop Chat Feed"
  >
    <!-- Drawer Header -->
    <div class="px-4 py-3 border-b border-slate-800/80 bg-slate-900/80 flex items-center justify-between shrink-0">
      <div class="flex items-center gap-2">
        <span class="text-lg">💬</span>
        <div>
          <h2 class="text-xs font-black uppercase tracking-wider text-slate-200">Tabletop Chat &amp; Rolls</h2>
          <p class="text-[10px] text-slate-500 font-mono">Live Session Feed</p>
        </div>
      </div>

      <div class="flex items-center gap-1.5">
        <button
          type="button"
          onclick={() => chatStore.clear()}
          class="p-1.5 text-slate-500 hover:text-rose-400 rounded-lg hover:bg-slate-800 transition-colors text-xs"
          title="Clear session history"
        >
          🗑️
        </button>
        <button
          type="button"
          onclick={() => chatStore.close()}
          class="p-1.5 text-slate-400 hover:text-slate-100 rounded-lg hover:bg-slate-800 transition-colors text-sm font-bold"
          title="Close Drawer"
        >
          ✕
        </button>
      </div>
    </div>

    <!-- Speaker Selection Bar -->
    <div class="px-3 py-2 border-b border-slate-800/70 bg-slate-900/60 shrink-0 flex items-center gap-2">
      <label for="speaker-select" class="text-[10px] font-bold uppercase tracking-wider text-amber-400 shrink-0">
        Speak As:
      </label>
      <select
        id="speaker-select"
        bind:value={selectedSpeaker}
        class="flex-1 bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1 text-xs text-slate-200 font-semibold focus:outline-none focus:border-amber-500 truncate"
      >
        {#each speakerOptions as opt}
          <option value={opt}>{opt}</option>
        {/each}
      </select>
    </div>

    <!-- Quick Dice Tray -->
    <div class="px-3 py-2 border-b border-slate-800/60 bg-slate-900/40 shrink-0">
      <div class="flex items-center justify-between mb-1.5">
        <span class="text-[9px] font-bold uppercase tracking-wider text-slate-400">Quick Dice Tray</span>
        <label class="flex items-center gap-1.5 text-[10px] text-slate-400 cursor-pointer select-none">
          <input type="checkbox" bind:checked={isSecretMode} class="rounded accent-purple-600" />
          <span class={isSecretMode ? 'text-purple-400 font-bold' : ''}>👁️ Secret DM Roll</span>
        </label>
      </div>

      <div class="grid grid-cols-7 gap-1">
        {#each QUICK_DICE as die}
          <button
            type="button"
            onclick={() => handleQuickRoll(die.sides)}
            class="py-1 rounded-lg bg-slate-900 hover:bg-slate-800 active:scale-95 border border-slate-700/60 font-mono text-[11px] font-bold text-amber-300 hover:text-amber-200 transition-all text-center shadow-sm"
          >
            {die.label}
          </button>
        {/each}
      </div>
    </div>

    <!-- Message & Roll Stream -->
    <div
      bind:this={messagesContainer}
      class="flex-1 overflow-y-auto p-3 space-y-2.5 scrollbar-thin scrollbar-thumb-slate-800"
    >
      {#if chatStore.messages.length === 0}
        <div class="text-center py-16 text-slate-600 space-y-2">
          <span class="text-3xl block">⚔️</span>
          <p class="text-xs font-semibold">No messages or rolls yet</p>
          <p class="text-[10px] text-slate-500">
            Type <code class="text-amber-400">/r 1d20+5</code>, <code class="text-purple-400">/w Player hi</code>, or <code class="text-blue-400">/ooc hello</code> below.
          </p>
        </div>
      {/if}

      {#each chatStore.messages as msg (msg.id)}
        <div
          class="rounded-xl p-2.5 border transition-all text-xs {msg.channel === 'whisper' || msg.recipient_id
            ? 'bg-purple-950/70 border-purple-800 text-purple-100 shadow-md shadow-purple-950/40'
            : msg.is_ooc
            ? 'bg-sky-950/30 border-dashed border-sky-800/70 text-sky-200'
            : msg.roll
            ? 'bg-slate-900/90 border-slate-800'
            : 'bg-slate-900/50 border-slate-850 text-slate-200'}"
        >
          <!-- Message Header -->
          <div class="flex items-center justify-between gap-2 mb-1">
            <div class="flex items-center gap-1.5 min-w-0 flex-wrap">
              <span class="font-bold truncate text-slate-100">{msg.sender_name || msg.sender}</span>

              {#if msg.channel === 'whisper' || msg.recipient_id}
                <span class="px-1.5 py-0.5 rounded text-[8px] font-black uppercase bg-purple-900 text-purple-200 border border-purple-700 flex items-center gap-1">
                  <span>🔒</span>
                  <span>Whisper {msg.recipient_id ? `to ${msg.recipient_name || msg.recipient_id}` : 'from DM'}</span>
                </span>
              {:else if msg.is_ooc}
                <span class="px-1.5 py-0.5 rounded text-[8px] font-bold uppercase bg-sky-900 text-sky-200 border border-sky-700">
                  (( OOC ))
                </span>
              {:else if msg.roll}
                <span class="px-1.5 py-0.5 rounded text-[8px] font-bold uppercase bg-slate-800 text-slate-400 border border-slate-700">
                  PUBLIC ROLL
                </span>
              {/if}
            </div>
            <span class="text-[9px] font-mono text-slate-500 shrink-0">{formatTime(msg.timestamp)}</span>
          </div>

          <!-- Plain Text / OOC Content -->
          {#if msg.text || msg.content}
            <div class="text-xs leading-relaxed whitespace-pre-wrap {msg.is_ooc ? 'font-mono italic text-sky-300' : ''}">
              {#if msg.is_ooc}
                <span>(( {msg.text || msg.content} ))</span>
              {:else}
                <span>{msg.text || msg.content}</span>
              {/if}
            </div>
          {/if}

          <!-- Roll Result Card with Action Chips -->
          {#if msg.roll}
            <div class="mt-1.5 pt-1.5 border-t border-slate-800/60 space-y-1.5">
              <div class="flex items-center justify-between">
                <span class="font-bold text-[11px] text-amber-300 truncate">
                  {msg.rollLabel || msg.roll.rawFormula}
                </span>

                <!-- Critical Hit / Fumble Banners -->
                {#if msg.roll.isCritical}
                  <span class="px-1.5 py-0.5 rounded font-black text-[9px] bg-amber-500 text-slate-950 animate-bounce shadow-md">
                    ⭐ CRITICAL HIT!
                  </span>
                {:else if msg.roll.isFumble}
                  <span class="px-1.5 py-0.5 rounded font-black text-[9px] bg-rose-700 text-white animate-pulse shadow-md">
                    💀 CRITICAL FUMBLE!
                  </span>
                {/if}
              </div>

              <!-- Main Roll Arithmetic Breakdown -->
              <div class="bg-slate-950/80 rounded-lg p-2 border border-slate-800 flex items-center justify-between">
                <span class="font-mono text-[11px] text-slate-400 break-all pr-2">
                  {msg.roll.formattedBreakdown}
                </span>
                <span class="font-mono font-black text-lg text-emerald-400 shrink-0">
                  {msg.roll.total}
                </span>
              </div>

              <!-- Attack vs AC Resolution Tag -->
              {#if msg.attackResolution && msg.attackResolution.isTargeted}
                <div class="flex items-center justify-between px-2 py-1 rounded text-[10px] font-bold border {msg.attackResolution.isHit ? 'bg-emerald-950/80 border-emerald-600 text-emerald-300' : 'bg-rose-950/80 border-rose-600 text-rose-300'}">
                  <span>🎯 Target: {msg.attackResolution.targetName} (AC {msg.attackResolution.targetAc})</span>
                  <span class="px-1.5 py-0.5 rounded uppercase tracking-wider {msg.attackResolution.isHit ? 'bg-emerald-600 text-white' : 'bg-rose-600 text-white'}">
                    {msg.attackResolution.isCrit ? 'CRITICAL HIT!' : msg.attackResolution.isHit ? 'HIT!' : 'MISS!'}
                  </span>
                </div>
              {/if}

              <!-- Interactive Damage / Heal Action Chips -->
              {#if msg.targetId || targetingStore.activeTargetTokenId}
                {@const activeTargetId = msg.targetId || targetingStore.activeTargetTokenId}
                {@const targetToken = activeTargetId ? canvasStore.tokens.find(t => t.id === activeTargetId) : null}
                {@const dmgVal = msg.damageAmount !== undefined ? msg.damageAmount : (msg.roll?.total || 0)}

                {#if targetToken && dmgVal > 0}
                  <div class="pt-1.5 flex flex-wrap items-center gap-1.5">
                    <button
                      type="button"
                      onclick={async () => {
                        await applyDamageToToken(targetToken.id, dmgVal);
                        damageFeedback = `Applied ${dmgVal} dmg to ${targetToken.name}`;
                        setTimeout(() => { damageFeedback = null; }, 3000);
                      }}
                      class="flex-1 py-1 px-2 rounded-lg bg-rose-700 hover:bg-rose-600 active:scale-95 text-white font-bold text-[10px] uppercase tracking-wider shadow flex items-center justify-center gap-1 transition-all"
                    >
                      <span>💥</span>
                      <span>Full Dmg ({dmgVal})</span>
                    </button>

                    <button
                      type="button"
                      onclick={async () => {
                        const halfDmg = Math.floor(dmgVal / 2);
                        await applyDamageToToken(targetToken.id, halfDmg);
                        damageFeedback = `Applied ${halfDmg} half-dmg to ${targetToken.name}`;
                        setTimeout(() => { damageFeedback = null; }, 3000);
                      }}
                      class="py-1 px-2 rounded-lg bg-amber-700 hover:bg-amber-600 active:scale-95 text-white font-bold text-[10px] uppercase tracking-wider shadow flex items-center justify-center gap-1 transition-all"
                      title="Apply half damage (e.g. Save passed)"
                    >
                      <span>🛡️</span>
                      <span>Half ({Math.floor(dmgVal / 2)})</span>
                    </button>

                    <button
                      type="button"
                      onclick={async () => {
                        await applyDamageToToken(targetToken.id, -dmgVal);
                        damageFeedback = `Healed ${dmgVal} HP for ${targetToken.name}`;
                        setTimeout(() => { damageFeedback = null; }, 3000);
                      }}
                      class="py-1 px-2 rounded-lg bg-emerald-700 hover:bg-emerald-600 active:scale-95 text-white font-bold text-[10px] uppercase tracking-wider shadow flex items-center justify-center gap-1 transition-all"
                      title="Apply healing"
                    >
                      <span>💚</span>
                      <span>Heal ({dmgVal})</span>
                    </button>
                  </div>
                {/if}
              {/if}

              {#if damageFeedback}
                <p class="text-[10px] text-amber-300 font-bold text-center mt-1 animate-pulse">
                  {damageFeedback}
                </p>
              {/if}
            </div>
          {/if}
        </div>
      {/each}
    </div>

    <!-- Input Form & Commands Guide -->
    <div class="p-3 border-t border-slate-800 bg-slate-900/90 shrink-0 space-y-2">
      <form onsubmit={(e) => { e.preventDefault(); handleSubmit(); }} class="flex gap-1.5">
        <input
          type="text"
          bind:value={inputText}
          placeholder={isSecretMode ? 'Secret roll/whisper: 1d20+5 or /w Player...' : 'Message or /r, /w, /gm, /ooc...'}
          class="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-amber-500 font-mono"
        />
        <button
          type="submit"
          class="px-3.5 py-2 rounded-xl bg-gradient-to-r from-amber-600 to-amber-500 hover:from-amber-500 hover:to-amber-400 active:scale-95 text-slate-950 font-black text-xs transition-all shadow-md flex items-center justify-center gap-1"
          title="Send message or roll"
        >
          <span>💬</span>
        </button>
      </form>

      <div class="flex items-center justify-between text-[8px] text-slate-500 font-mono flex-wrap gap-1">
        <span>/r 2d20kh1+5</span>
        <span>/w Player msg</span>
        <span>/gm msg</span>
        <span>/ooc msg</span>
      </div>
    </div>
  </aside>
{/if}
