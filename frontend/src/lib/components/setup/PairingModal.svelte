<!-- frontend/src/lib/components/setup/PairingModal.svelte -->
<!-- Workstation QR Code Pairing Modal: Zero-Configuration LAN Pairing & Plain 4-Digit PIN -->

<script lang="ts">
  import { onMount } from 'svelte';
  import { generateQrCodeSvg } from '$lib/utils/qrcode';

  let {
    isOpen = $bindable(false),
    onClose = () => { isOpen = false; }
  }: {
    isOpen: boolean;
    onClose?: () => void;
  } = $props();

  interface CompanionNetworkInfo {
    host_ip: string;
    port: number;
    active_pin: string;
    connection_url: string;
  }

  let networkInfo = $state<CompanionNetworkInfo | null>(null);
  let isLoading = $state(false);
  let fetchError = $state<string | null>(null);
  let copiedUrl = $state(false);
  let copiedPin = $state(false);

  // Derived connection URL and QR code
  let connectionUrl = $derived(
    networkInfo?.connection_url ||
      (networkInfo ? `http://${networkInfo.host_ip}:${networkInfo.port}/mobile?pin=${networkInfo.active_pin}` : '')
  );

  let qrCodeSvg = $derived(connectionUrl ? generateQrCodeSvg(connectionUrl, 220) : '');

  export async function fetchNetworkInfo() {
    isLoading = true;
    fetchError = null;

    try {
      const port = typeof window !== 'undefined' && window.location.port ? window.location.port : '5174';
      const host = typeof window !== 'undefined' && window.location.hostname ? window.location.hostname : '127.0.0.1';

      // Probe backend network-info endpoint
      const res = await fetch(`http://${host}:${port}/api/companion/network-info`, {
        signal: AbortSignal.timeout(3000)
      }).catch(() => fetch('/api/companion/network-info', { signal: AbortSignal.timeout(3000) }));

      if (res && res.ok) {
        networkInfo = await res.json();
      } else {
        // Fallback default
        networkInfo = {
          host_ip: host === 'localhost' ? '127.0.0.1' : host,
          port: Number(port) || 5174,
          active_pin: '1337',
          connection_url: `http://${host === 'localhost' ? '127.0.0.1' : host}:${port}/mobile?pin=1337`
        };
      }
    } catch (e: any) {
      fetchError = e?.message || 'Failed to detect host LAN IP';
      const host = typeof window !== 'undefined' ? window.location.hostname : '127.0.0.1';
      networkInfo = {
        host_ip: host,
        port: 5174,
        active_pin: '1337',
        connection_url: `http://${host}:5174/mobile?pin=1337`
      };
    } finally {
      isLoading = false;
    }
  }

  function copyUrl() {
    if (!connectionUrl) return;
    navigator.clipboard.writeText(connectionUrl).catch(() => {});
    copiedUrl = true;
    setTimeout(() => { copiedUrl = false; }, 2500);
  }

  function copyPin() {
    if (!networkInfo?.active_pin) return;
    navigator.clipboard.writeText(networkInfo.active_pin).catch(() => {});
    copiedPin = true;
    setTimeout(() => { copiedPin = false; }, 2500);
  }

  $effect(() => {
    if (isOpen) {
      fetchNetworkInfo();
    }
  });

  onMount(() => {
    if (isOpen) {
      fetchNetworkInfo();
    }
  });
</script>

{#if isOpen}
  <div
    class="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200"
    role="dialog"
    aria-modal="true"
    aria-labelledby="pairing-modal-title"
    tabindex="-1"
    onkeydown={(e) => { if (e.key === 'Escape') onClose(); }}
  >
    <div
      class="bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden text-slate-100 flex flex-col animate-in zoom-in-95 duration-150"
    >
      <!-- Modal Header -->
      <div class="px-6 py-4 bg-slate-950/70 border-b border-slate-800 flex items-center justify-between">
        <div class="flex items-center gap-3">
          <div class="w-9 h-9 rounded-xl bg-indigo-950/90 border border-indigo-700/60 flex items-center justify-center text-lg text-indigo-400 shadow-sm">
            📱
          </div>
          <div>
            <h2 id="pairing-modal-title" class="text-sm font-black uppercase tracking-wider text-slate-100">
              Connect Mobile Companions
            </h2>
            <p class="text-xs text-slate-400">
              Zero-Configuration LAN QR Code Pairing
            </p>
          </div>
        </div>

        <div class="flex items-center gap-2">
          <button
            type="button"
            onclick={fetchNetworkInfo}
            disabled={isLoading}
            class="p-1.5 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-slate-800 transition-colors disabled:opacity-50"
            title="Refresh LAN Network Status"
          >
            <span class={isLoading ? 'animate-spin inline-block' : ''}>🔄</span>
          </button>
          <button
            type="button"
            onclick={onClose}
            class="p-1.5 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-slate-800 transition-colors text-base"
            aria-label="Close Pairing Modal"
          >
            ✕
          </button>
        </div>
      </div>

      <!-- Modal Body -->
      <div class="p-6 space-y-5">
        <!-- QR Code Stage -->
        <div class="flex flex-col items-center justify-center p-4 bg-slate-950/60 border border-slate-800 rounded-2xl">
          {#if isLoading && !qrCodeSvg}
            <div class="w-[220px] h-[220px] flex flex-col items-center justify-center gap-3 text-slate-500">
              <span class="text-2xl animate-spin">⚙️</span>
              <span class="text-xs font-medium">Resolving Host LAN Address…</span>
            </div>
          {:else if qrCodeSvg}
            <div class="p-3 bg-white rounded-xl shadow-lg shadow-black/40 flex items-center justify-center">
              {@html qrCodeSvg}
            </div>
            <p class="text-[11px] text-slate-400 font-medium mt-3 text-center">
              Scan with camera on iOS or Android to pair instantly without entering PIN
            </p>
          {/if}
        </div>

        <!-- Master PIN Display & Copy -->
        <div class="bg-slate-950/80 border border-slate-800/80 rounded-xl p-3.5 flex items-center justify-between">
          <div>
            <div class="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
              Master Table PIN
            </div>
            <div class="text-2xl font-mono font-black text-indigo-400 tracking-widest mt-0.5">
              {networkInfo?.active_pin || '••••'}
            </div>
          </div>
          <button
            type="button"
            onclick={copyPin}
            class="px-3 py-1.5 rounded-lg text-xs font-bold border transition-all flex items-center gap-1.5 {copiedPin
              ? 'bg-emerald-950/80 text-emerald-300 border-emerald-600'
              : 'bg-slate-900 hover:bg-slate-800 text-slate-200 border-slate-700'}"
          >
            <span>{copiedPin ? '✓' : '📋'}</span>
            <span>{copiedPin ? 'Copied' : 'Copy PIN'}</span>
          </button>
        </div>

        <!-- Direct Connection URL Fallback -->
        <div class="space-y-1.5">
          <div class="flex items-center justify-between text-[11px]">
            <span class="font-bold text-slate-400 uppercase tracking-wider text-[10px]">
              Direct Connection URL
            </span>
            <span class="font-mono text-slate-500 text-[10px]">
              Host: {networkInfo?.host_ip || '...'}:{networkInfo?.port || '5174'}
            </span>
          </div>

          <div class="flex items-center gap-2">
            <input
              type="text"
              readonly
              value={connectionUrl}
              class="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs font-mono text-slate-300 select-all focus:outline-none focus:border-indigo-500"
            />
            <button
              type="button"
              onclick={copyUrl}
              class="px-3.5 py-2 rounded-xl text-xs font-bold border transition-all flex items-center gap-1.5 shrink-0 {copiedUrl
                ? 'bg-emerald-950/80 text-emerald-300 border-emerald-600'
                : 'bg-indigo-950/70 hover:bg-indigo-900/80 text-indigo-300 border-indigo-800/60'}"
            >
              <span>{copiedUrl ? '✓' : '🔗'}</span>
              <span>{copiedUrl ? 'Copied URL' : 'Copy Link'}</span>
            </button>
          </div>
        </div>

        {#if fetchError}
          <div class="p-2.5 rounded-xl bg-amber-950/40 border border-amber-800/60 text-amber-300 text-[11px] flex items-center gap-2">
            <span>⚠️</span>
            <span>{fetchError}. Local fallback active.</span>
          </div>
        {/if}
      </div>

      <!-- Modal Footer -->
      <div class="px-6 py-3 bg-slate-950/60 border-t border-slate-800 flex items-center justify-between text-[11px] text-slate-500">
        <span>Both host and mobile devices must be on the same local Wi-Fi / LAN.</span>
        <button
          type="button"
          onclick={onClose}
          class="px-3 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-semibold transition-colors"
        >
          Done
        </button>
      </div>
    </div>
  </div>
{/if}
