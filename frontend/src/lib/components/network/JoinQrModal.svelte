<!-- frontend/src/lib/components/network/JoinQrModal.svelte -->
<!-- Mobile QR Code Pairing Modal: Zero-Configuration Local LAN IP Discovery -->

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

  interface ConnectionInfo {
    lan_ip: string;
    port: number;
    join_url: string;
  }

  let connectionInfo = $state<ConnectionInfo | null>(null);
  let isLoading = $state(false);
  let errorMsg = $state<string | null>(null);
  let copied = $state(false);

  export async function fetchConnectionInfo() {
    isLoading = true;
    errorMsg = null;
    try {
      const port = typeof window !== 'undefined' && window.location.port ? window.location.port : '4242';
      const host = typeof window !== 'undefined' && window.location.hostname ? window.location.hostname : '127.0.0.1';

      const res = await fetch('/api/system/connection-info', {
        signal: AbortSignal.timeout(3000)
      }).catch(() => fetch(`http://${host}:${port}/api/system/connection-info`, { signal: AbortSignal.timeout(3000) }));

      if (res && res.ok) {
        connectionInfo = await res.json();
      } else {
        const fallbackIp = host === 'localhost' ? '127.0.0.1' : host;
        const fallbackPort = Number(port) || 4242;
        connectionInfo = {
          lan_ip: fallbackIp,
          port: fallbackPort,
          join_url: `http://${fallbackIp}:${fallbackPort}`
        };
      }
    } catch (e) {
      errorMsg = 'Could not detect local network connection.';
    } finally {
      isLoading = false;
    }
  }

  $effect(() => {
    if (isOpen) {
      fetchConnectionInfo();
    }
  });

  let qrSvg = $derived(
    connectionInfo?.join_url ? generateQrCodeSvg(connectionInfo.join_url, 220) : ''
  );

  async function copyUrl() {
    if (!connectionInfo?.join_url) return;
    try {
      await navigator.clipboard.writeText(connectionInfo.join_url);
      copied = true;
      setTimeout(() => { copied = false; }, 2000);
    } catch {
      // Fallback
    }
  }
</script>

{#if isOpen}
  <div
    class="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 transition-opacity"
    role="presentation"
    onclick={(e) => { if (e.target === e.currentTarget) onClose(); }}
  >
    <div
      class="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col"
      role="dialog"
      aria-modal="true"
      aria-labelledby="join-qr-modal-title"
    >
      <!-- Modal Header -->
      <div class="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-950/60">
        <div class="flex items-center gap-2.5">
          <span class="text-xl">📱</span>
          <div>
            <h2 id="join-qr-modal-title" class="text-sm font-black uppercase tracking-wider text-slate-100">
              Connect Mobile Devices
            </h2>
            <p class="text-xs text-slate-400">Scan to join the local table</p>
          </div>
        </div>
        <button
          type="button"
          onclick={onClose}
          class="p-1 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-slate-800 transition-colors"
        >
          ✕
        </button>
      </div>

      <!-- Modal Body -->
      <div class="p-6 flex flex-col items-center text-center space-y-4">
        {#if isLoading}
          <div class="py-12 flex flex-col items-center gap-3">
            <div class="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
            <span class="text-xs text-slate-400">Discovering local LAN address...</span>
          </div>
        {:else if connectionInfo}
          <!-- QR Code Display Container -->
          <div class="p-3 bg-white rounded-2xl shadow-inner border border-slate-300">
            {@html qrSvg}
          </div>

          <div class="w-full space-y-2">
            <span class="text-xs font-semibold text-slate-400">Local Table URL:</span>
            <div class="flex items-center gap-2 bg-slate-950 px-3 py-2 rounded-xl border border-slate-800">
              <span class="text-xs font-mono text-indigo-300 flex-1 truncate select-all text-left">
                {connectionInfo.join_url}
              </span>
              <button
                type="button"
                onclick={copyUrl}
                class="px-2.5 py-1 text-xs font-bold rounded-lg border transition-all {copied
                  ? 'bg-emerald-950 text-emerald-300 border-emerald-700'
                  : 'bg-indigo-600 hover:bg-indigo-500 text-white border-indigo-500'}"
              >
                {copied ? 'Copied!' : 'Copy'}
              </button>
            </div>
          </div>

          <div class="text-[11px] text-slate-500">
            Ensure devices are connected to the same Wi-Fi / local network.
          </div>
        {:else if errorMsg}
          <div class="py-8 text-rose-400 text-xs">
            {errorMsg}
          </div>
        {/if}
      </div>
    </div>
  </div>
{/if}
