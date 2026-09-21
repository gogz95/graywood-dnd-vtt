<!-- src/lib/components/chat/SessionChatLog.svelte -->
<!-- Collapsible slide-over drawer tracking public rolls, secret DM whispers, arithmetic breakdowns, and chat feed -->

<script lang="ts">
  import { chatStore, type ChatMessage } from '../../stores/chatStore.svelte';
  import { audioEngine } from '../../audio/AudioEngine';
  import { applyDamageToToken } from '../../services/combatResolution';
  import { targetingStore } from '../../stores/targetingStore.svelte';
  import { canvasStore } from '../../../stores/canvasStore.svelte';

  let {
    isDm = true,
    userName = 'Dungeon Master'
  }: {
    isDm?: boolean;
    userName?: string;
  } = $props();

  let damageFeedback = $state<string | null>(null);

  let inputText = $state('');
  let isSecretMode = $state(false);
  let messagesContainer = $state<HTMLDivElement | null>(null);

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

    if (isSecretMode && !txt.startsWith('/')) {
      // Send as secret DM roll if it contains dice formula, or secret whisper
      if (/\d*d\d+/i.test(txt)) {
        chatStore.roll(txt, { label: 'Secret DM Roll', actorName: userName, isSecret: true });
      } else {
        chatStore.sendMessage(`/gmroll ${txt}`, userName, isDm);
      }
    } else {
      chatStore.sendMessage(txt, userName, isDm);
    }
    inputText = '';
  }

  function handleQuickRoll(sides: number) {
    chatStore.roll(`1d${sides}`, {
      label: `d${sides} Roll`,
      actorName: userName,
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
    <span class="text-base">🎲</span>
    <span>Dice &amp; Chat</span>
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
    aria-label="Session Chat Log"
  >
    <!-- Drawer Header -->
    <div class="px-4 py-3 border-b border-slate-800/80 bg-slate-900/80 flex items-center justify-between shrink-0">
      <div class="flex items-center gap-2">
        <span class="text-lg">🎲</span>
        <div>
          <h2 class="text-xs font-black uppercase tracking-wider text-slate-200">Session Chat &amp; Rolls</h2>
          <p class="text-[10px] text-slate-500 font-mono">Live Universal Dice Log</p>
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
          <p class="text-xs font-semibold">No rolls or messages yet</p>
          <p class="text-[10px] text-slate-500">
            Roll from statblocks or type <code class="text-amber-400">/r 1d20+5</code> below.
          </p>
        </div>
      {/if}

      {#each chatStore.messages as msg (msg.id)}
        <div
          class="rounded-xl p-2.5 border transition-all text-xs {msg.channel === 'whisper'
            ? 'bg-purple-950/30 border-purple-800/50 shadow-sm shadow-purple-950/20'
            : msg.roll
            ? 'bg-slate-900/90 border-slate-800'
            : 'bg-slate-900/50 border-slate-850'}"
        >
          <!-- Message Header -->
          <div class="flex items-center justify-between gap-2 mb-1">
            <div class="flex items-center gap-1.5 min-w-0">
              <span class="font-bold truncate text-slate-200">{msg.sender}</span>
              {#if msg.channel === 'whisper'}
                <span class="px-1.5 py-0.2 rounded text-[8px] font-black uppercase bg-purple-900 text-purple-200 border border-purple-700">
                  👁️ SECRET WHISPER
                </span>
              {:else if msg.roll}
                <span class="px-1.5 py-0.2 rounded text-[8px] font-bold uppercase bg-slate-800 text-slate-400 border border-slate-700">
                  PUBLIC ROLL
                </span>
              {/if}
            </div>
            <span class="text-[9px] font-mono text-slate-500 shrink-0">{formatTime(msg.timestamp)}</span>
          </div>

          <!-- Plain Text Content -->
          {#if msg.text}
            <p class="text-slate-300 text-xs leading-relaxed whitespace-pre-wrap">{msg.text}</p>
          {/if}

          <!-- Roll Result Card -->
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

              <!-- One-Click Apply Damage Button (Visible to DM when target is available) -->
              {#if (msg.actionType === 'damage' || msg.damageAmount !== undefined) && (msg.targetId || targetingStore.activeTargetTokenId)}
                {@const targetIdToDamage = msg.targetId || targetingStore.activeTargetTokenId}
                {@const targetToken = canvasStore.tokens.find(t => t.id === targetIdToDamage)}
                {@const dmgVal = msg.damageAmount !== undefined ? msg.damageAmount : (msg.roll?.total || 0)}
                {#if targetToken && dmgVal > 0}
                  <div class="pt-1 flex items-center justify-between gap-2">
                    <button
                      type="button"
                      onclick={async () => {
                        const res = await applyDamageToToken(targetToken.id, dmgVal);
                        damageFeedback = `Applied ${dmgVal} dmg to ${targetToken.name}`;
                        setTimeout(() => { damageFeedback = null; }, 3000);
                      }}
                      class="w-full py-1.5 px-3 rounded-lg bg-rose-700 hover:bg-rose-600 active:scale-95 text-white font-bold text-[10px] uppercase tracking-wider shadow flex items-center justify-center gap-1.5 transition-all"
                    >
                      <span>💥</span>
                      <span>Apply {dmgVal} Damage to {targetToken.name}</span>
                    </button>
                  </div>
                {/if}
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
          placeholder={isSecretMode ? 'Secret roll/whisper: 1d20+5 or /w Player...' : 'Roll or chat: /r 1d20+5, /gmroll 2d6, /w...'}
          class="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-amber-500 font-mono"
        />
        <button
          type="submit"
          class="px-3 py-2 rounded-xl bg-gradient-to-r from-amber-600 to-amber-500 hover:from-amber-500 hover:to-amber-400 active:scale-95 text-slate-950 font-black text-xs transition-all shadow-md flex items-center justify-center"
          title="Send roll or message"
        >
          🎲
        </button>
      </form>

      <div class="flex items-center justify-between text-[9px] text-slate-500 font-mono">
        <span>/r 1d20+5 [label]</span>
        <span>/gmroll 2d6+3</span>
        <span>/w [Target] [Msg]</span>
      </div>
    </div>
  </aside>
{/if}
