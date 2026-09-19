<script lang="ts">
  import { currencyStore, executeAssayConversion } from '../stores/characterStore';
  import Icons from './Icons.svelte';

  let isDrawerOpen = $state(false);
  let sunDisksInput = $state(10);
  let conversionNotice: string | null = $state(null);

  let pouch = $derived($currencyStore);

  let maxConvertible = $derived(pouch.ay_modlahd_sun_disks);

  // Live calculation of 10% assay fee and minted sovereigns
  let calculatedMinted = $derived(
    sunDisksInput > 0 ? Math.floor(sunDisksInput * 0.90) : 0
  );
  let calculatedFee = $derived(
    sunDisksInput > 0 ? sunDisksInput - calculatedMinted : 0
  );

  function setAmount(amount: number) {
    sunDisksInput = Math.max(1, Math.min(maxConvertible, amount));
  }

  function handleConvert() {
    if (sunDisksInput <= 0 || sunDisksInput > maxConvertible) return;

    const { mintedSovereigns, assayFeeRetained } = executeAssayConversion(sunDisksInput);

    conversionNotice = `Assay Complete: Minted ${mintedSovereigns} Sovereigns (${assayFeeRetained} Sun-Disks retained as 10% assay fee).`;
    sunDisksInput = Math.min(sunDisksInput, pouch.ay_modlahd_sun_disks);

    setTimeout(() => {
      conversionNotice = null;
    }, 4000);
  }
</script>

<div class="bg-dark-900 border border-dark-700/80 rounded-2xl p-4 shadow-xl">
  <div class="flex items-center justify-between mb-3">
    <h2 class="text-sm font-bold text-slate-200 uppercase tracking-wider flex items-center gap-2">
      <Icons name="coins" size={16} class="text-amber-400" /> Currency Pouch
    </h2>
    <button
      onclick={() => (isDrawerOpen = !isDrawerOpen)}
      class="text-xs px-3 py-1 rounded-lg font-semibold transition-all border {
        isDrawerOpen
          ? 'bg-amber-500/20 border-amber-500/50 text-amber-300'
          : 'bg-dark-800 hover:bg-dark-700 border-dark-600 text-slate-300'
      }"
    >
      {isDrawerOpen ? 'Close Assay Drawer' : 'Eastern Port Assay (10%)'}
    </button>
  </div>

  <!-- Currency Tiles Grid -->
  <div class="grid grid-cols-2 sm:grid-cols-4 gap-2.5 mb-2">
    <!-- Concord Sovereigns -->
    <div class="bg-dark-800/80 border border-amber-500/30 rounded-xl p-3 flex flex-col justify-between">
      <span class="text-[10px] uppercase font-bold text-amber-400 tracking-wider">Concord Sovereigns</span>
      <div class="text-xl font-black text-amber-300 font-mono mt-1">
        {pouch.concord_sovereigns.toLocaleString()}
      </div>
      <span class="text-[10px] text-slate-400 mt-1">Standard Realm Coin</span>
    </div>

    <!-- Ay Modlahd Sun-Disks -->
    <div class="bg-dark-800/80 border border-orange-500/30 rounded-xl p-3 flex flex-col justify-between">
      <span class="text-[10px] uppercase font-bold text-orange-400 tracking-wider">Sun-Disks</span>
      <div class="text-xl font-black text-orange-300 font-mono mt-1">
        {pouch.ay_modlahd_sun_disks.toLocaleString()}
      </div>
      <span class="text-[10px] text-slate-400 mt-1">Ay Modlahd Gold</span>
    </div>

    <!-- Trade Bars -->
    <div class="bg-dark-800/80 border border-cyan-500/30 rounded-xl p-3 flex flex-col justify-between">
      <span class="text-[10px] uppercase font-bold text-cyan-400 tracking-wider">Trade Bars</span>
      <div class="text-xl font-black text-cyan-300 font-mono mt-1">
        {pouch.trade_bars.toLocaleString()}
      </div>
      <span class="text-[10px] text-slate-400 mt-1">Merchant Bullion</span>
    </div>

    <!-- Rucean Rings -->
    <div class="bg-dark-800/80 border border-purple-500/30 rounded-xl p-3 flex flex-col justify-between">
      <span class="text-[10px] uppercase font-bold text-purple-400 tracking-wider">Rucean Rings</span>
      <div class="text-xl font-black text-purple-300 font-mono mt-1">
        {pouch.rucean_rings.toLocaleString()}
      </div>
      <span class="text-[10px] text-slate-400 mt-1">Ancient Silver</span>
    </div>
  </div>

  <!-- Eastern Port Assay (10%) Conversion Drawer -->
  {#if isDrawerOpen}
    <div class="mt-4 pt-4 border-t border-dark-700/80 bg-dark-950/60 rounded-xl p-4 border border-dark-800">
      <div class="flex items-start justify-between gap-2 mb-3">
        <div>
          <h3 class="text-xs font-bold text-amber-400 uppercase tracking-wider">
            Eastern Port Assay Exchange
          </h3>
          <p class="text-[11px] text-slate-400 mt-0.5">
            Convert foreign Ay Modlahd Sun-Disks to Concord Sovereigns. The Port Assayer automatically deducts a mandatory 10% fee.
          </p>
        </div>
        <span class="px-2 py-0.5 rounded bg-amber-500/15 border border-amber-500/40 text-amber-300 text-[10px] font-bold shrink-0">
          Fee: 10%
        </span>
      </div>

      {#if maxConvertible <= 0}
        <div class="p-3 bg-dark-800/50 border border-dark-700 rounded-lg text-xs text-slate-400 text-center">
          You do not possess any Ay Modlahd Sun-Disks to convert.
        </div>
      {:else}
        <!-- Amount Selection & Presets -->
        <div class="space-y-3 mb-4">
          <div class="flex items-center justify-between text-xs text-slate-300 font-medium">
            <span>Amount to Convert:</span>
            <span class="font-mono text-amber-400 font-bold">{sunDisksInput} Sun-Disks</span>
          </div>

          <input
            type="range"
            min="1"
            max={maxConvertible}
            bind:value={sunDisksInput}
            class="w-full h-2 bg-dark-800 rounded-lg appearance-none cursor-pointer accent-amber-500"
          />

          <!-- Quick Presets -->
          <div class="flex items-center gap-2">
            <button
              onclick={() => setAmount(5)}
              class="px-2.5 py-1 bg-dark-800 hover:bg-dark-700 border border-dark-700 rounded text-xs text-slate-300 font-mono"
            >
              5
            </button>
            <button
              onclick={() => setAmount(10)}
              class="px-2.5 py-1 bg-dark-800 hover:bg-dark-700 border border-dark-700 rounded text-xs text-slate-300 font-mono"
            >
              10
            </button>
            <button
              onclick={() => setAmount(Math.floor(maxConvertible / 2))}
              class="px-2.5 py-1 bg-dark-800 hover:bg-dark-700 border border-dark-700 rounded text-xs text-slate-300 font-mono"
            >
              Half ({Math.floor(maxConvertible / 2)})
            </button>
            <button
              onclick={() => setAmount(maxConvertible)}
              class="px-2.5 py-1 bg-dark-800 hover:bg-dark-700 border border-dark-700 rounded text-xs text-slate-300 font-mono"
            >
              Max ({maxConvertible})
            </button>
          </div>

          <!-- Transaction Preview Box -->
          <div class="bg-dark-900 border border-dark-700 rounded-xl p-3 grid grid-cols-2 gap-2 text-xs">
            <div>
              <span class="text-[10px] text-slate-500 uppercase font-bold">You Mint</span>
              <div class="text-emerald-400 font-mono font-bold text-sm">
                +{calculatedMinted} Sovereigns
              </div>
            </div>
            <div>
              <span class="text-[10px] text-slate-500 uppercase font-bold">Port Fee (10%)</span>
              <div class="text-red-400 font-mono font-bold text-sm">
                -{calculatedFee} Sun-Disks
              </div>
            </div>
          </div>

          {#if conversionNotice}
            <div class="p-2.5 bg-emerald-950/60 border border-emerald-500/40 rounded-lg text-emerald-300 text-xs flex items-center gap-2">
              <Icons name="check" size={14} class="shrink-0" />
              <span>{conversionNotice}</span>
            </div>
          {/if}

          <!-- Execute Button -->
          <button
            onclick={handleConvert}
            class="w-full py-2.5 bg-amber-500 hover:bg-amber-400 active:bg-amber-600 text-black font-bold rounded-xl transition-all shadow-md shadow-amber-500/20 text-xs flex items-center justify-center gap-1.5"
          >
            <Icons name="sparkles" size={14} /> Authorize Assay Minting
          </button>
        </div>
      {/if}
    </div>
  {/if}
</div>
