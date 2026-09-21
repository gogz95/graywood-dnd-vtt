<script lang="ts">
  // PlayerCompanionPortalModal.svelte
  // Svelte 5 Runes: Dynamic LAN Discovery, Scannable QR Code & Player PIN Roster

  import { onMount } from 'svelte';
  import { getLanIp, getLanPort, setLanIp, getPlayUrl } from '../../services/networkDiscovery';
  import { generateQrCodeSvg } from '../../utils/qrcode';

  let { isOpen = $bindable(false) } = $props<{ isOpen: boolean }>();

  let lanIp = $state('localhost');
  let lanPort = $state(5173);
  let isResolving = $state(false);
  let copiedUrl = $state(false);
  let copiedPinId = $state<string | null>(null);

  interface PartyPinEntry {
    id: string;
    name: string;
    class: string;
    level: number;
    pin: string;
    playerName?: string;
    isNpc?: boolean;
    isOrbSealed?: boolean;
  }

  let partyMembers = $state<PartyPinEntry[]>([]);

  function loadParty() {
    if (typeof localStorage === 'undefined') return;
    try {
      const raw = localStorage.getItem('vtt_party_roster');
      if (raw) {
        partyMembers = JSON.parse(raw);
      }
    } catch {
      partyMembers = [];
    }
  }

  let playerJoinUrl = $derived(getPlayUrl(undefined, lanPort));
  let qrCodeSvg = $derived(generateQrCodeSvg(playerJoinUrl, 210));

  async function refreshNetwork() {
    isResolving = true;
    try {
      const ip = await getLanIp();
      lanIp = ip;
      lanPort = getLanPort();
    } finally {
      isResolving = false;
    }
  }

  function handleIpChange(e: Event) {
    const val = (e.target as HTMLInputElement).value;
    lanIp = val;
    setLanIp(val);
  }

  function copyBaseUrl() {
    navigator.clipboard.writeText(playerJoinUrl).catch(() => {});
    copiedUrl = true;
    setTimeout(() => { copiedUrl = false; }, 2500);
  }

  function copyCharacterLink(member: PartyPinEntry) {
    const charUrl = getPlayUrl(member.pin, lanPort);
    navigator.clipboard.writeText(charUrl).catch(() => {});
    copiedPinId = member.id;
    setTimeout(() => { copiedPinId = null; }, 2500);
  }

  onMount(() => {
    refreshNetwork();
    loadParty();

    const handleRosterUpdate = () => loadParty();
    window.addEventListener('vtt:roster-updated', handleRosterUpdate);
    return () => {
      window.removeEventListener('vtt:roster-updated', handleRosterUpdate);
    };
  });
</script>

{#if isOpen}
  <div
    class="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200"
    role="dialog"
    aria-modal="true"
    aria-label="Player Companion Portal Modal"
    tabindex="-1"
    onkeydown={(e) => { if (e.key === 'Escape') isOpen = false; }}
  >
    <div class="bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl max-w-xl w-full max-h-[90vh] flex flex-col overflow-hidden text-slate-100">
      
      <!-- Header -->
      <div class="px-6 py-4 bg-slate-950/60 border-b border-slate-800 flex items-center justify-between shrink-0">
        <div class="flex items-center gap-2.5">
          <div class="w-8 h-8 rounded-lg bg-indigo-600/20 border border-indigo-500/40 flex items-center justify-center text-lg">
            📱
          </div>
          <div>
            <h3 class="text-sm font-black uppercase tracking-wider text-slate-100">Player Companion Portal</h3>
            <p class="text-[11px] text-slate-400">Connect mobile phones and tablets at the table</p>
          </div>
        </div>
        <button
          type="button"
          onclick={() => isOpen = false}
          class="w-7 h-7 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center transition-colors text-xs font-bold"
        >
          ✕
        </button>
      </div>

      <!-- Body Container (Scrollable) -->
      <div class="p-6 overflow-y-auto space-y-6">

        <!-- Top Section: Dynamic Network Info & QR Code -->
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-5 items-center">
          
          <!-- QR Code Canvas Display -->
          <div class="flex flex-col items-center justify-center p-4 bg-white rounded-xl shadow-inner border border-slate-300/40">
            {@html qrCodeSvg}
            <span class="mt-2 text-[10px] font-bold text-slate-600 uppercase tracking-wider">
              Scan with Phone Camera
            </span>
          </div>

          <!-- Network Connection Details -->
          <div class="space-y-4">
            <div>
              <label for="companion-lan-ip" class="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                LAN Host Address
              </label>
              <div class="flex items-center gap-2">
                <input
                  id="companion-lan-ip"
                  type="text"
                  value={lanIp}
                  oninput={handleIpChange}
                  placeholder="e.g. 192.168.1.15"
                  class="flex-1 bg-slate-950 border border-slate-800 focus:border-indigo-500 rounded-lg px-3 py-2 text-xs font-mono text-indigo-300 focus:outline-none"
                />
                <button
                  type="button"
                  onclick={refreshNetwork}
                  disabled={isResolving}
                  class="px-2.5 py-2 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-300 rounded-lg text-xs font-bold transition-colors"
                  title="Re-detect LAN IP"
                >
                  {#if isResolving}🔄{:else}Detect{/if}
                </button>
              </div>
              <p class="text-[10px] text-slate-500 mt-1">
                Port :{lanPort} · Standard mobile companion route: <code>/play</code>
              </p>
            </div>

            <!-- Direct URL & Copy -->
            <div class="space-y-1">
              <div class="flex items-center justify-between text-[11px] font-bold text-slate-400">
                <span>Direct Companion Link</span>
                {#if copiedUrl}
                  <span class="text-emerald-400 font-bold text-[10px] animate-pulse">Copied!</span>
                {/if}
              </div>
              <div class="flex items-center gap-1.5 bg-slate-950 border border-slate-800 rounded-lg p-1.5 font-mono text-xs text-indigo-300">
                <span class="truncate flex-1 select-all">{playerJoinUrl}</span>
                <button
                  type="button"
                  onclick={copyBaseUrl}
                  class="px-2.5 py-1 bg-indigo-600 hover:bg-indigo-500 text-white rounded text-[11px] font-bold shrink-0 transition-colors"
                >
                  Copy
                </button>
              </div>
            </div>

            <!-- Quick Launch in Browser -->
            <a
              href={playerJoinUrl}
              target="_blank"
              rel="noreferrer"
              class="inline-flex items-center justify-center gap-1.5 w-full py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 hover:text-white rounded-lg text-xs font-semibold transition-colors"
            >
              <span>🌐</span> Open Companion in New Tab ↗
            </a>
          </div>
        </div>

        <!-- Divider -->
        <div class="border-t border-slate-800"></div>

        <!-- Party Characters & Quick PIN Link Generator -->
        <div class="space-y-3">
          <div class="flex items-center justify-between">
            <h4 class="text-xs font-black uppercase tracking-wider text-slate-300">
              Active Party Character Access PINs
            </h4>
            <span class="text-[10px] text-slate-500">
              {partyMembers.filter(m => !m.isNpc).length} Registered PCs
            </span>
          </div>

          {#if partyMembers.length === 0}
            <div class="p-4 rounded-xl bg-slate-950/50 border border-slate-800/80 text-center text-xs text-slate-500">
              No party characters registered yet. Use the Party Roster to add heroes.
            </div>
          {:else}
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {#each partyMembers as member (member.id)}
                <div class="p-3 bg-slate-950 border border-slate-800 rounded-xl flex items-center justify-between gap-2 {member.isOrbSealed ? 'opacity-50' : ''}">
                  <div class="min-w-0">
                    <div class="flex items-center gap-1.5">
                      <span class="text-xs font-bold text-slate-200 truncate">{member.name}</span>
                      {#if member.isNpc}
                        <span class="text-[9px] px-1 py-0.2 rounded bg-slate-800 text-slate-400">NPC</span>
                      {/if}
                      {#if member.isOrbSealed}
                        <span class="text-[9px] px-1 py-0.2 rounded bg-purple-950 text-purple-300 border border-purple-800">Stowed</span>
                      {/if}
                    </div>
                    <div class="text-[10px] text-slate-500 truncate">
                      {member.class} · PIN: <span class="font-mono font-bold text-amber-400">{member.pin}</span>
                    </div>
                  </div>

                  <button
                    type="button"
                    onclick={() => copyCharacterLink(member)}
                    class="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white text-[10px] font-bold shrink-0 transition-colors flex items-center gap-1"
                    title="Copy direct join link with pre-filled PIN for this character"
                  >
                    {#if copiedPinId === member.id}
                      <span class="text-emerald-400">Copied!</span>
                    {:else}
                      <span>🔗 Join Link</span>
                    {/if}
                  </button>
                </div>
              {/each}
            </div>
          {/if}
        </div>

      </div>

      <!-- Footer -->
      <div class="px-6 py-3 bg-slate-950/80 border-t border-slate-800 flex items-center justify-between shrink-0 text-[11px] text-slate-500">
        <span>Players entering a valid 4-digit PIN bypass manual selection.</span>
        <button
          type="button"
          onclick={() => isOpen = false}
          class="px-4 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-bold transition-colors"
        >
          Done
        </button>
      </div>

    </div>
  </div>
{/if}
