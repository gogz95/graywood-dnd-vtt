<!-- frontend/src/routes/mobile/+page.svelte -->
<!-- Mobile Companion Shell & Virtual Numeric Keypad Authentication (Svelte 5 Runes) -->

<script lang="ts">
  import { onMount, onDestroy } from 'svelte';

  // ── Svelte 5 Rune State ───────────────────────────────────────────────────
  let connectionStatus = $state<
    'disconnected' | 'connecting' | 'authenticating' | 'connected' | 'error'
  >('disconnected');

  let session = $state<{
    sessionId: string;
    campaignName: string;
    characterName: string;
  } | null>(null);

  let pin = $state('');
  let characterName = $state(
    typeof localStorage !== 'undefined'
      ? localStorage.getItem('vtt_companion_char_name') || ''
      : ''
  );
  let errorMessage = $state<string | null>(null);

  let socket: WebSocket | null = null;
  let heartbeatTimer: any = null;

  // ── Keypad Input Handlers ──────────────────────────────────────────────────
  function handleKeyPress(digit: string) {
    if (connectionStatus === 'connecting' || connectionStatus === 'authenticating') return;
    errorMessage = null;
    if (pin.length < 4) {
      pin += digit;
      if (pin.length === 4) {
        // Auto-connect once 4 digits entered if character name is filled
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

  // ── WebSocket Connection & Authentication ──────────────────────────────────
  function handleSubmitAuth() {
    if (pin.length !== 4) {
      errorMessage = 'Please enter a 4-digit Table PIN';
      return;
    }

    const cleanCharName = characterName.trim() || 'Player Companion';
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('vtt_companion_char_name', cleanCharName);
    }

    if (socket) {
      try {
        socket.close();
      } catch (_) {}
      socket = null;
    }

    connectionStatus = 'connecting';
    errorMessage = null;

    try {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const host = window.location.host;
      const wsUrl = `${protocol}//${host}/ws/companion`;

      socket = new WebSocket(wsUrl);

      socket.addEventListener('open', () => {
        connectionStatus = 'authenticating';
        const authPayload = {
          type: 'Auth',
          pin,
          device_name: cleanCharName,
          role: 'player',
        };
        socket?.send(JSON.stringify(authPayload));
      });

      socket.addEventListener('message', (event) => {
        try {
          const msg = JSON.parse(event.data as string);
          if (msg.type === 'AuthSuccess') {
            session = {
              sessionId: msg.session_id,
              campaignName: msg.campaign_name || 'Active Campaign',
              characterName: cleanCharName,
            };
            connectionStatus = 'connected';
            errorMessage = null;
            startHeartbeat();
          } else if (msg.type === 'AuthError') {
            connectionStatus = 'error';
            errorMessage = msg.reason || 'Authentication failed. Please verify Table PIN.';
            pin = '';
            disconnectSocket();
          }
        } catch {
          // Non-JSON socket frame ignored
        }
      });

      socket.addEventListener('error', () => {
        if (connectionStatus !== 'connected') {
          connectionStatus = 'error';
          errorMessage = 'Unable to establish WebSocket connection with host workstation.';
          pin = '';
        }
      });

      socket.addEventListener('close', () => {
        stopHeartbeat();
        if (connectionStatus === 'connected') {
          connectionStatus = 'disconnected';
          errorMessage = 'Disconnected from VTT host workstation.';
          session = null;
        } else if (connectionStatus === 'authenticating' || connectionStatus === 'connecting') {
          connectionStatus = 'error';
          if (!errorMessage) {
            errorMessage = 'Connection closed during table authentication.';
          }
          pin = '';
        }
      });
    } catch (err: any) {
      connectionStatus = 'error';
      errorMessage = err?.message || 'Failed to initialize WebSocket client.';
      pin = '';
    }
  }

  function disconnectSocket() {
    stopHeartbeat();
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
        socket.send(JSON.stringify({ type: 'Ping', timestamp: Date.now() }));
      }
    }, 15000);
  }

  function stopHeartbeat() {
    if (heartbeatTimer) {
      clearInterval(heartbeatTimer);
      heartbeatTimer = null;
    }
  }

  onDestroy(() => {
    disconnectSocket();
  });
</script>

<div
  class="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans select-none pt-[env(safe-area-inset-top,0px)] pb-[env(safe-area-inset-bottom,0px)] pl-[env(safe-area-inset-left,0px)] pr-[env(safe-area-inset-right,0px)]"
>
  <main class="w-full max-w-md mx-auto flex-1 flex flex-col p-4 sm:p-6 justify-between">
    <!-- Header -->
    <header class="flex items-center justify-between pb-3 border-b border-slate-800/80">
      <div class="flex items-center gap-2.5">
        <div class="w-3 h-3 rounded-full {connectionStatus === 'connected' ? 'bg-emerald-500 shadow-sm shadow-emerald-500/80 animate-pulse' : connectionStatus === 'connecting' || connectionStatus === 'authenticating' ? 'bg-amber-400 animate-ping' : 'bg-slate-700'}"></div>
        <div>
          <h1 class="text-xs font-black uppercase tracking-widest text-slate-200">
            Graywood Mobile
          </h1>
          <p class="text-[10px] text-slate-400 font-mono">
            {#if connectionStatus === 'connected'}
              Connected to {session?.campaignName}
            {:else if connectionStatus === 'connecting'}
              Connecting to host…
            {:else if connectionStatus === 'authenticating'}
              Verifying PIN…
            {:else}
              Tabletop Player Companion
            {/if}
          </p>
        </div>
      </div>

      {#if connectionStatus === 'connected'}
        <button
          type="button"
          onclick={disconnectSocket}
          class="px-2.5 py-1 text-[11px] font-semibold text-rose-400 hover:text-rose-300 bg-rose-950/40 hover:bg-rose-900/60 border border-rose-800/50 rounded-lg transition-colors active:scale-95"
        >
          Leave
        </button>
      {/if}
    </header>

    <!-- Content Screen -->
    {#if connectionStatus === 'connected' && session}
      <!-- Connected Companion Screen Shell -->
      <section class="flex-1 flex flex-col justify-center py-6 space-y-6 animate-in fade-in">
        <!-- Player Identity Card -->
        <div class="p-5 rounded-2xl bg-slate-900/90 border border-slate-800 shadow-xl space-y-3">
          <div class="flex items-center justify-between">
            <span class="text-[10px] uppercase font-bold text-indigo-400 tracking-wider">Active Character</span>
            <span class="px-2 py-0.5 rounded text-[10px] font-mono bg-emerald-950 border border-emerald-800/60 text-emerald-300 font-bold">
              ONLINE
            </span>
          </div>
          <h2 class="text-xl font-black text-slate-100">{session.characterName}</h2>
          <div class="flex items-center gap-2 text-xs text-slate-400 pt-1 border-t border-slate-800/60 font-mono">
            <span>Session ID:</span>
            <span class="text-slate-300 truncate">{session.sessionId}</span>
          </div>
        </div>

        <!-- Placeholder Action Grid for Milestone 3 Extensions -->
        <div class="grid grid-cols-2 gap-3 text-center">
          <div class="p-4 rounded-xl bg-slate-900/60 border border-slate-800/80 flex flex-col items-center justify-center space-y-1">
            <span class="text-2xl">❤️</span>
            <span class="text-xs font-bold text-slate-200">HP Tracker</span>
            <span class="text-[10px] text-slate-500">Milestone 3</span>
          </div>
          <div class="p-4 rounded-xl bg-slate-900/60 border border-slate-800/80 flex flex-col items-center justify-center space-y-1">
            <span class="text-2xl">🎲</span>
            <span class="text-xs font-bold text-slate-200">Quick Roller</span>
            <span class="text-[10px] text-slate-500">Milestone 3</span>
          </div>
        </div>
      </section>
    {:else}
      <!-- Authentication PIN & Keypad View -->
      <section class="flex-1 flex flex-col justify-center py-4 space-y-5">
        <!-- Instructions & Name Input -->
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

        <!-- Manual Connect Button (Optional if not auto-submitted) -->
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

    <!-- Footer Security Notice -->
    <footer class="pt-3 border-t border-slate-800/80 text-center text-[10px] text-slate-500 font-mono">
      Graywood VTT Companion &bull; Safe-Area Notch Guarded
    </footer>
  </main>
</div>
