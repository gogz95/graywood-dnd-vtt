<!-- frontend/src/routes/mobile/+page.svelte -->
<!-- Mobile Companion Shell: Touch-First Character Dashboard, HP Sync & Resilient Auto-Reconnect (Svelte 5 Runes) -->

<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import MobileDiceTray, { type DiceResultItem } from '$lib/components/mobile/MobileDiceTray.svelte';

  // ── Svelte 5 Rune State ───────────────────────────────────────────────────
  let connectionStatus = $state<
    'disconnected' | 'connecting' | 'authenticating' | 'connected' | 'reconnecting' | 'error'
  >('disconnected');

  let session = $state<{
    sessionId: string;
    campaignName: string;
    characterName: string;
  } | null>(null);

  let rollHistory = $state<DiceResultItem[]>([]);

  // Authentication & Form
  let pin = $state('');
  let activePin = $state('');
  let characterName = $state(
    typeof localStorage !== 'undefined'
      ? localStorage.getItem('vtt_companion_char_name') || ''
      : ''
  );
  let errorMessage = $state<string | null>(null);
  let userDisconnected = $state(false);

  // Character Stats & HP State
  let currentHp = $state(28);
  let maxHp = $state(32);
  let tempHp = $state(0);
  let armorClass = $state(16);
  let conditions = $state<string[]>([]);

  // Calculator Mode
  let calcInput = $state('');
  let calcMode = $state<'quick' | 'calculator'>('quick');

  // Network & Auto-Reconnect Engine
  let socket = $state<WebSocket | null>(null);
  let heartbeatTimer: any = null;
  let reconnectTimer: any = null;
  let reconnectAttempt = $state(0);
  const BACKOFF_DELAYS = [1000, 2000, 5000, 10000];

  // ── Keypad Input Handlers ──────────────────────────────────────────────────
  function handleKeyPress(digit: string) {
    if (connectionStatus === 'connecting' || connectionStatus === 'authenticating') return;
    errorMessage = null;
    if (pin.length < 4) {
      pin += digit;
      if (pin.length === 4) {
        handleSubmitAuth();
      }
    }
  }

  function handleBackspace() {
    if (connectionStatus === 'connecting' || connectionStatus === 'authenticating') return;
    errorMessage = null;
    if (pin.length > 0) {
      pin = pin.slice(0, -1);
    }
  }

  function handleClear() {
    if (connectionStatus === 'connecting' || connectionStatus === 'authenticating') return;
    pin = '';
    errorMessage = null;
  }

  // ── WebSocket Connection & Auto-Reconnect Engine ───────────────────────────
  function connectWebSocket() {
    if (socket) {
      try {
        socket.close();
      } catch (_) {}
      socket = null;
    }

    const pinToUse = activePin || pin;
    if (pinToUse.length !== 4) return;

    connectionStatus = reconnectAttempt > 0 ? 'reconnecting' : 'connecting';
    errorMessage = null;

    try {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const host = window.location.host;
      const wsUrl = `${protocol}//${host}/ws/companion`;

      socket = new WebSocket(wsUrl);

      socket.addEventListener('open', () => {
        connectionStatus = 'authenticating';
        const cleanCharName = characterName.trim() || 'Player Companion';
        const authPayload = {
          type: 'Auth',
          pin: pinToUse,
          device_name: cleanCharName,
          role: 'player',
        };
        socket?.send(JSON.stringify(authPayload));
      });

      socket.addEventListener('message', (event) => {
        try {
          const msg = JSON.parse(event.data as string);
          if (msg.type === 'AuthSuccess') {
            const cleanCharName = characterName.trim() || 'Player Companion';
            session = {
              sessionId: msg.session_id,
              campaignName: msg.campaign_name || 'Active Campaign',
              characterName: cleanCharName,
            };
            connectionStatus = 'connected';
            errorMessage = null;
            reconnectAttempt = 0;
            startHeartbeat();
          } else if (msg.type === 'AuthError') {
            connectionStatus = 'error';
            errorMessage = msg.reason || 'Authentication failed. Please verify Table PIN.';
            pin = '';
            activePin = '';
            disconnectSocket();
          } else if (msg.type === 'CombatantSync' && Array.isArray(msg.combatants)) {
            handleCombatantSync(msg.combatants);
          } else if (msg.type === 'DiceResult') {
            const rollItem: DiceResultItem = {
              roll_id: msg.roll_id || `roll-${Date.now()}`,
              roller: msg.roller || 'Player Companion',
              expression: msg.expression || '',
              total: typeof msg.total === 'number' ? msg.total : 0,
              breakdown: msg.breakdown || '',
              timestamp: Date.now(),
            };
            rollHistory = [rollItem, ...rollHistory.slice(0, 49)];
          }
        } catch {
          // Ignore invalid socket payloads
        }
      });

      socket.addEventListener('error', () => {
        if (connectionStatus !== 'connected') {
          connectionStatus = 'error';
          errorMessage = 'Unable to establish WebSocket connection with host workstation.';
        }
      });

      socket.addEventListener('close', () => {
        stopHeartbeat();
        if (!userDisconnected && activePin) {
          scheduleReconnect();
        } else {
          connectionStatus = 'disconnected';
          session = null;
        }
      });
    } catch (err: any) {
      connectionStatus = 'error';
      errorMessage = err?.message || 'Failed to initialize WebSocket client.';
      if (!userDisconnected && activePin) {
        scheduleReconnect();
      }
    }
  }

  function scheduleReconnect() {
    if (userDisconnected || !activePin) return;
    connectionStatus = 'reconnecting';
    const delay = BACKOFF_DELAYS[Math.min(reconnectAttempt, BACKOFF_DELAYS.length - 1)];

    if (reconnectTimer) clearTimeout(reconnectTimer);
    reconnectTimer = setTimeout(() => {
      reconnectAttempt++;
      connectWebSocket();
    }, delay);
  }

  function handleSubmitAuth() {
    if (pin.length !== 4) {
      errorMessage = 'Please enter a 4-digit Table PIN';
      return;
    }

    const cleanCharName = characterName.trim() || 'Player Companion';
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('vtt_companion_char_name', cleanCharName);
    }

    activePin = pin;
    userDisconnected = false;
    reconnectAttempt = 0;
    connectWebSocket();
  }

  function disconnectSocket() {
    userDisconnected = true;
    activePin = '';
    stopHeartbeat();
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    if (socket) {
      try {
        socket.close();
      } catch (_) {}
      socket = null;
    }
    connectionStatus = 'disconnected';
    session = null;
  }

  function startHeartbeat() {
    stopHeartbeat();
    heartbeatTimer = setInterval(() => {
      if (socket && socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ type: 'Heartbeat' }));
      }
    }, 15000);
  }

  function stopHeartbeat() {
    if (heartbeatTimer) {
      clearInterval(heartbeatTimer);
      heartbeatTimer = null;
    }
  }

  // ── Sync & HP Mutation Handlers ────────────────────────────────────────────
  function handleCombatantSync(combatants: any[]) {
    const targetName = (characterName.trim() || 'Player Companion').toLowerCase();
    const found = combatants.find(
      (c) =>
        c.name?.toLowerCase() === targetName ||
        (session?.sessionId && c.id === session.sessionId)
    );

    if (found) {
      currentHp = typeof found.hp === 'number' ? found.hp : currentHp;
      maxHp = typeof found.max_hp === 'number' ? found.max_hp : maxHp;
      armorClass = typeof found.ac === 'number' ? found.ac : armorClass;
      conditions = Array.isArray(found.conditions) ? found.conditions : [];
    }
  }

  function emitHpUpdate(newHp: number) {
    currentHp = Math.max(0, newHp);
    const charId = session?.characterName || characterName.trim() || 'Player Companion';

    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(
        JSON.stringify({
          type: 'UpdateHp',
          entity_id: charId,
          delta: currentHp,
        })
      );
    }
  }

  function adjustQuickHp(delta: number) {
    if (delta > 0) {
      // Heal
      const nextHp = Math.min(maxHp, currentHp + delta);
      emitHpUpdate(nextHp);
    } else {
      // Damage
      const dmg = Math.abs(delta);
      applyDamage(dmg);
    }
  }

  function applyDamage(amount: number) {
    let remaining = amount;
    if (tempHp > 0) {
      if (tempHp >= remaining) {
        tempHp -= remaining;
        remaining = 0;
      } else {
        remaining -= tempHp;
        tempHp = 0;
      }
    }
    if (remaining > 0) {
      emitHpUpdate(Math.max(0, currentHp - remaining));
    }
  }

  function applyHeal(amount: number) {
    emitHpUpdate(Math.min(maxHp, currentHp + amount));
  }

  function handleApplyCalculator(type: 'damage' | 'heal' | 'temp') {
    const val = parseInt(calcInput, 10);
    if (isNaN(val) || val <= 0) return;

    if (type === 'damage') {
      applyDamage(val);
    } else if (type === 'heal') {
      applyHeal(val);
    } else if (type === 'temp') {
      tempHp = val;
    }
    calcInput = '';
  }

  // ── Mobile Lifecycle & Visibility Change ───────────────────────────────────
  function handleVisibilityChange() {
    if (typeof document === 'undefined') return;
    if (document.visibilityState === 'visible') {
      if (
        !userDisconnected &&
        activePin &&
        (!socket || socket.readyState === WebSocket.CLOSED || socket.readyState === WebSocket.CLOSING)
      ) {
        if (reconnectTimer) clearTimeout(reconnectTimer);
        reconnectAttempt = 0;
        connectWebSocket();
      }
    }
  }

  function handleOnline() {
    if (!userDisconnected && activePin && (!socket || socket.readyState !== WebSocket.OPEN)) {
      if (reconnectTimer) clearTimeout(reconnectTimer);
      reconnectAttempt = 0;
      connectWebSocket();
    }
  }

  onMount(() => {
    if (typeof window !== 'undefined') {
      document.addEventListener('visibilitychange', handleVisibilityChange);
      window.addEventListener('online', handleOnline);
    }
  });

  onDestroy(() => {
    disconnectSocket();
    if (typeof window !== 'undefined') {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('online', handleOnline);
    }
  });

  // Derived HP bar calculation
  let hpPercent = $derived(
    Math.min(100, Math.max(0, Math.round((currentHp / (maxHp || 1)) * 100)))
  );
</script>

<div
  class="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans select-none pt-[env(safe-area-inset-top,0px)] pb-[env(safe-area-inset-bottom,0px)] pl-[env(safe-area-inset-left,0px)] pr-[env(safe-area-inset-right,0px)]"
>
  <main class="w-full max-w-md mx-auto flex-1 flex flex-col p-4 sm:p-5 justify-between">
    <!-- ═════════════════════════════════════════════════════════════════════════
         HEADER & REAL-TIME CONNECTION STATUS BADGE
    ══════════════════════════════════════════════════════════════════════════ -->
    <header class="flex items-center justify-between pb-3 border-b border-slate-800/80">
      <div class="flex items-center gap-2.5">
        <span class="text-lg">🛡️</span>
        <div>
          <h1 class="text-xs font-black uppercase tracking-widest text-slate-200">
            Graywood Mobile
          </h1>
          <p class="text-[10px] text-slate-400 font-mono truncate max-w-[150px]">
            {session?.campaignName || 'Player Companion'}
          </p>
        </div>
      </div>

      <div class="flex items-center gap-2">
        <!-- Status Badge -->
        {#if connectionStatus === 'connected'}
          <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-950/80 border border-emerald-500/40 text-emerald-300">
            <span class="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
            Connected
          </span>
        {:else if connectionStatus === 'reconnecting'}
          <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold bg-amber-950/80 border border-amber-500/40 text-amber-300">
            <span class="w-2 h-2 rounded-full bg-amber-400 animate-ping"></span>
            Reconnecting…
          </span>
        {:else if connectionStatus === 'connecting' || connectionStatus === 'authenticating'}
          <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold bg-amber-950/80 border border-amber-500/40 text-amber-300">
            <span class="w-2 h-2 rounded-full bg-amber-400 animate-pulse"></span>
            Connecting…
          </span>
        {:else}
          <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold bg-slate-900 border border-slate-700 text-slate-400">
            <span class="w-2 h-2 rounded-full bg-slate-600"></span>
            Offline
          </span>
        {/if}

        {#if connectionStatus === 'connected' || connectionStatus === 'reconnecting'}
          <button
            type="button"
            onclick={disconnectSocket}
            class="px-2 py-1 text-[10px] font-semibold text-rose-400 hover:text-rose-300 bg-rose-950/40 hover:bg-rose-900/60 border border-rose-800/50 rounded-lg transition-colors active:scale-95"
            title="Disconnect from session"
          >
            Leave
          </button>
        {/if}
      </div>
    </header>

    <!-- ═════════════════════════════════════════════════════════════════════════
         ACTIVE COMPANION DASHBOARD (CONNECTED / RECONNECTING)
    ══════════════════════════════════════════════════════════════════════════ -->
    {#if (connectionStatus === 'connected' || connectionStatus === 'reconnecting') && session}
      <section class="flex-1 flex flex-col justify-start py-4 space-y-4 animate-in fade-in">
        <!-- Character Identity & AC Bar -->
        <div class="flex items-center justify-between px-1">
          <div>
            <span class="text-[10px] uppercase font-bold text-indigo-400 tracking-wider">Player Character</span>
            <h2 class="text-xl font-black text-slate-100">{session.characterName}</h2>
          </div>
          <div class="flex items-center gap-2 bg-slate-900/90 border border-slate-800 px-3 py-1.5 rounded-xl shadow-sm">
            <span class="text-xs">🛡️</span>
            <span class="text-[10px] font-bold uppercase text-slate-400">AC</span>
            <span class="text-base font-black text-slate-200 font-mono">{armorClass}</span>
          </div>
        </div>

        <!-- ── PROMINENT HP MANAGEMENT CARD ──────────────────────────────────── -->
        <div class="p-5 rounded-2xl bg-slate-900/90 border border-slate-800 shadow-xl space-y-4">
          <!-- HP Numerics & Health Bar -->
          <div class="space-y-2">
            <div class="flex items-baseline justify-between">
              <span class="text-xs font-bold uppercase tracking-wider text-slate-400">Hit Points</span>
              <div class="flex items-baseline gap-1 font-mono">
                <span class="text-3xl font-black {currentHp <= (maxHp * 0.2) ? 'text-rose-400 animate-pulse' : currentHp <= (maxHp * 0.5) ? 'text-amber-400' : 'text-emerald-400'}">
                  {currentHp}
                </span>
                <span class="text-slate-500 font-bold text-sm">/ {maxHp}</span>
                {#if tempHp > 0}
                  <span class="ml-2 text-xs font-bold text-cyan-400 bg-cyan-950/80 px-2 py-0.5 rounded-full border border-cyan-800/60">
                    +{tempHp} Temp
                  </span>
                {/if}
              </div>
            </div>

            <!-- Health Bar Gauge -->
            <div class="w-full h-3 bg-slate-950 rounded-full overflow-hidden border border-slate-800/80 p-0.5">
              <div
                class="h-full rounded-full transition-all duration-300 {hpPercent <= 20 ? 'bg-gradient-to-r from-rose-600 to-rose-400' : hpPercent <= 50 ? 'bg-gradient-to-r from-amber-600 to-amber-400' : 'bg-gradient-to-r from-emerald-600 to-emerald-400'}"
                style="width: {hpPercent}%"
              ></div>
            </div>
          </div>

          <!-- Mode Toggle: Quick Increment vs Calculator -->
          <div class="flex rounded-xl bg-slate-950 p-1 border border-slate-800">
            <button
              type="button"
              onclick={() => (calcMode = 'quick')}
              class="flex-1 py-1.5 text-xs font-bold rounded-lg transition-colors {calcMode === 'quick' ? 'bg-slate-800 text-slate-100 shadow-sm' : 'text-slate-400 hover:text-slate-200'}"
            >
              Quick (+/-)
            </button>
            <button
              type="button"
              onclick={() => (calcMode = 'calculator')}
              class="flex-1 py-1.5 text-xs font-bold rounded-lg transition-colors {calcMode === 'calculator' ? 'bg-slate-800 text-slate-100 shadow-sm' : 'text-slate-400 hover:text-slate-200'}"
            >
              Damage / Heal Calc
            </button>
          </div>

          <!-- Sub-View A: Quick +/- Buttons -->
          {#if calcMode === 'quick'}
            <div class="grid grid-cols-4 gap-2 pt-1">
              <button
                type="button"
                onclick={() => adjustQuickHp(-5)}
                class="min-h-[48px] rounded-xl bg-rose-950/40 hover:bg-rose-900/60 active:bg-rose-800 text-rose-300 font-mono font-bold text-sm border border-rose-800/50 transition-all active:scale-95 shadow-sm"
              >
                -5
              </button>
              <button
                type="button"
                onclick={() => adjustQuickHp(-1)}
                class="min-h-[48px] rounded-xl bg-rose-950/40 hover:bg-rose-900/60 active:bg-rose-800 text-rose-300 font-mono font-bold text-sm border border-rose-800/50 transition-all active:scale-95 shadow-sm"
              >
                -1
              </button>
              <button
                type="button"
                onclick={() => adjustQuickHp(1)}
                class="min-h-[48px] rounded-xl bg-emerald-950/40 hover:bg-emerald-900/60 active:bg-emerald-800 text-emerald-300 font-mono font-bold text-sm border border-emerald-800/50 transition-all active:scale-95 shadow-sm"
              >
                +1
              </button>
              <button
                type="button"
                onclick={() => adjustQuickHp(5)}
                class="min-h-[48px] rounded-xl bg-emerald-950/40 hover:bg-emerald-900/60 active:bg-emerald-800 text-emerald-300 font-mono font-bold text-sm border border-emerald-800/50 transition-all active:scale-95 shadow-sm"
              >
                +5
              </button>
            </div>
          {:else}
            <!-- Sub-View B: Damage & Heal Calculator -->
            <div class="space-y-2.5 pt-1">
              <input
                type="number"
                min="1"
                placeholder="Enter amount…"
                bind:value={calcInput}
                class="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-center text-lg font-mono font-bold text-slate-100 placeholder-slate-600 focus:outline-none focus:border-indigo-500"
              />
              <div class="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onclick={() => handleApplyCalculator('damage')}
                  class="py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 active:bg-rose-700 text-white font-bold text-xs shadow-md shadow-rose-950/40 active:scale-95 transition-all"
                >
                  💔 Damage
                </button>
                <button
                  type="button"
                  onclick={() => handleApplyCalculator('heal')}
                  class="py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white font-bold text-xs shadow-md shadow-emerald-950/40 active:scale-95 transition-all"
                >
                  💚 Heal
                </button>
                <button
                  type="button"
                  onclick={() => handleApplyCalculator('temp')}
                  class="py-2.5 rounded-xl bg-cyan-700 hover:bg-cyan-600 active:bg-cyan-800 text-white font-bold text-xs shadow-md shadow-cyan-950/40 active:scale-95 transition-all"
                >
                  🛡️ Temp HP
                </button>
              </div>
            </div>
          {/if}
        </div>

        <!-- Active Conditions Pill Tray -->
        {#if conditions.length > 0}
          <div class="space-y-1.5">
            <span class="text-[10px] font-bold uppercase tracking-wider text-slate-400">Active Conditions</span>
            <div class="flex flex-wrap gap-1.5">
              {#each conditions as cond}
                <span class="px-2.5 py-1 rounded-lg text-xs font-bold bg-amber-950/60 border border-amber-600/40 text-amber-300 flex items-center gap-1 shadow-sm">
                  <span>⚠️</span>
                  <span>{cond}</span>
                </span>
              {/each}
            </div>
          </div>
        {/if}

        <!-- ── QUICK DICE ROLLER & LIVE FEED (TKT-06) ───────────────────────── -->
        <MobileDiceTray
          characterName={session.characterName}
          {socket}
          bind:rollHistory
        />
      </section>
    {:else}
      <!-- ═════════════════════════════════════════════════════════════════════════
           AUTHENTICATION PIN & KEYPAD VIEW
      ══════════════════════════════════════════════════════════════════════════ -->
      <section class="flex-1 flex flex-col justify-center py-4 space-y-5">
        <div class="space-y-3 text-center">
          <div class="w-12 h-12 rounded-2xl bg-indigo-950/80 border border-indigo-700/60 mx-auto flex items-center justify-center text-xl shadow-lg shadow-indigo-950/50">
            🎲
          </div>
          <div>
            <h2 class="text-base font-black text-slate-100">Join Table Session</h2>
            <p class="text-xs text-slate-400 mt-0.5">
              Enter your character name and 4-digit Table PIN
            </p>
          </div>

          <!-- Character Name Input -->
          <div class="text-left pt-1">
            <label for="char-name-input" class="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
              Character / Player Name
            </label>
            <input
              id="char-name-input"
              type="text"
              bind:value={characterName}
              placeholder="e.g. Valerius the Paladin"
              maxlength="32"
              class="w-full bg-slate-900 border border-slate-800 rounded-xl px-3.5 py-2.5 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all font-medium"
            />
          </div>
        </div>

        <!-- 4-Digit PIN Visual Display -->
        <div class="space-y-2">
          <div class="flex items-center justify-center gap-3 py-2">
            {#each [0, 1, 2, 3] as idx}
              <div
                class="w-12 h-14 rounded-xl border-2 flex items-center justify-center text-2xl font-mono font-black transition-all duration-150 {pin.length > idx
                  ? 'border-indigo-500 bg-indigo-950/40 text-indigo-300 shadow-md shadow-indigo-950/60 scale-105'
                  : 'border-slate-800 bg-slate-900/60 text-slate-600'}"
              >
                {pin.length > idx ? '●' : '—'}
              </div>
            {/each}
          </div>

          <!-- Error Alert Banner -->
          {#if errorMessage}
            <div class="p-2.5 rounded-xl bg-rose-950/60 border border-rose-800/80 text-rose-300 text-xs text-center font-medium animate-in fade-in">
              {errorMessage}
            </div>
          {/if}
        </div>

        <!-- Touch-Optimized Numeric Keypad -->
        <div class="grid grid-cols-3 gap-2.5 pt-1">
          {#each ['1', '2', '3', '4', '5', '6', '7', '8', '9'] as num}
            <button
              type="button"
              onclick={() => handleKeyPress(num)}
              disabled={connectionStatus === 'connecting' || connectionStatus === 'authenticating'}
              class="min-h-[58px] rounded-2xl bg-slate-900/90 hover:bg-slate-800/90 active:bg-indigo-600 border border-slate-800 hover:border-slate-700 active:border-indigo-500 text-xl font-bold text-slate-100 transition-all active:scale-95 disabled:opacity-50 shadow-sm flex items-center justify-center"
            >
              {num}
            </button>
          {/each}

          <!-- Bottom Row: Clear, 0, Backspace -->
          <button
            type="button"
            onclick={handleClear}
            disabled={connectionStatus === 'connecting' || connectionStatus === 'authenticating'}
            class="min-h-[58px] rounded-2xl bg-slate-900/60 hover:bg-slate-800/60 active:bg-slate-700 border border-slate-800 text-xs font-bold text-slate-400 uppercase tracking-wider transition-all active:scale-95 disabled:opacity-50 flex items-center justify-center"
          >
            Clear
          </button>

          <button
            type="button"
            onclick={() => handleKeyPress('0')}
            disabled={connectionStatus === 'connecting' || connectionStatus === 'authenticating'}
            class="min-h-[58px] rounded-2xl bg-slate-900/90 hover:bg-slate-800/90 active:bg-indigo-600 border border-slate-800 hover:border-slate-700 active:border-indigo-500 text-xl font-bold text-slate-100 transition-all active:scale-95 disabled:opacity-50 shadow-sm flex items-center justify-center"
          >
            0
          </button>

          <button
            type="button"
            onclick={handleBackspace}
            disabled={connectionStatus === 'connecting' || connectionStatus === 'authenticating'}
            class="min-h-[58px] rounded-2xl bg-slate-900/60 hover:bg-slate-800/60 active:bg-slate-700 border border-slate-800 text-lg font-bold text-slate-400 transition-all active:scale-95 disabled:opacity-50 flex items-center justify-center"
            aria-label="Backspace"
          >
            ⌫
          </button>
        </div>

        <!-- Manual Connect Button -->
        <button
          type="button"
          onclick={handleSubmitAuth}
          disabled={pin.length !== 4 || connectionStatus === 'connecting' || connectionStatus === 'authenticating'}
          class="w-full py-3.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:hover:bg-indigo-600 text-white font-bold text-sm transition-all active:scale-[0.98] shadow-lg shadow-indigo-950/60 flex items-center justify-center gap-2"
        >
          {#if connectionStatus === 'connecting' || connectionStatus === 'authenticating'}
            <div class="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
            <span>Authenticating…</span>
          {:else}
            <span>Connect to Table</span>
          {/if}
        </button>
      </section>
    {/if}

    <!-- Footer Notice -->
    <footer class="pt-3 border-t border-slate-800/80 text-center text-[10px] text-slate-500 font-mono">
      Graywood VTT Companion &bull; Safe-Area Notch Guarded
    </footer>
  </main>
</div>
