<script lang="ts">
  import { currencyStore, executeAssayConversion } from '../../../stores/characterStore';
  import { dispatchSoundEvent } from '../../audio/soundboardBridge';
  import Icons from '../../../components/Icons.svelte';

  export interface AssayTransactionRecord {
    id: string;
    timestamp: number;
    sunDisksSubmitted: number;
    mintedSovereigns: number;
    tariffFeeRetained: number;
    portReceiptCode: string;
  }

  let isDrawerOpen = $state(false);
  let showLedger = $state(false);
  let sunDisksInput = $state(10);
  let conversionNotice: string | null = $state(null);
  let transactionHistory = $state<AssayTransactionRecord[]>([
    {
      id: 'tx-init-001',
      timestamp: Date.now() - 3600000 * 24,
      sunDisksSubmitted: 50,
      mintedSovereigns: 45,
      tariffFeeRetained: 5,
      portReceiptCode: 'OST-ASSAY-7721',
    },
  ]);

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
    sunDisksInput = Math.max(1, Math.min(maxConvertible > 0 ? maxConvertible : 1, amount));
  }

  function handleConvert() {
    if (sunDisksInput <= 0 || sunDisksInput > maxConvertible) return;

    const submitted = sunDisksInput;
    const { mintedSovereigns, assayFeeRetained } = executeAssayConversion(submitted);

    const receiptCode = `OST-ASSAY-${Math.floor(1000 + Math.random() * 9000)}`;
    const newRecord: AssayTransactionRecord = {
      id: `tx-${Date.now()}`,
      timestamp: Date.now(),
      sunDisksSubmitted: submitted,
      mintedSovereigns,
      tariffFeeRetained: assayFeeRetained,
      portReceiptCode: receiptCode,
    };

    transactionHistory = [newRecord, ...transactionHistory];
    dispatchSoundEvent('coin_clink');

    conversionNotice = `Official Assay Complete: Minted ${mintedSovereigns} Concord Sovereigns. Retained ${assayFeeRetained} Sun-Disks (10% Port Tariff) under receipt ${receiptCode}.`;
    sunDisksInput = Math.min(sunDisksInput, pouch.ay_modlahd_sun_disks);

    setTimeout(() => {
      conversionNotice = null;
    }, 5000);
  }
</script>

<div class="bg-dark-900 border border-amber-900/40 rounded-2xl p-4 shadow-xl relative overflow-hidden">
  <!-- Subtle Parchment Glow Accent -->
  <div class="absolute -top-16 -right-16 w-36 h-36 bg-amber-500/5 rounded-full blur-3xl pointer-events-none"></div>

  <div class="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-4">
    <div class="flex items-center gap-2">
      <div class="w-8 h-8 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
        <Icons name="coins" size={18} />
      </div>
      <div>
        <h2 class="text-sm font-black text-slate-100 uppercase tracking-wider flex items-center gap-2 font-serif">
          Coin Purse & Treasury
        </h2>
        <p class="text-[11px] text-amber-200/60">
          Official Tender & Foreign Bullion Reserves
        </p>
      </div>
    </div>

    <div class="flex items-center gap-2 w-full sm:w-auto">
      <button
        onclick={() => (showLedger = !showLedger)}
        class="text-xs px-2.5 py-1.5 rounded-xl font-semibold transition-all border flex items-center gap-1.5 {
          showLedger
            ? 'bg-amber-950/60 border-amber-600/60 text-amber-300'
            : 'bg-dark-800 hover:bg-dark-700 border-dark-700 text-slate-400'
        }"
      >
        <Icons name="file-text" size={13} />
        <span>Tariff Log</span>
      </button>

      <button
        onclick={() => (isDrawerOpen = !isDrawerOpen)}
        class="text-xs px-3 py-1.5 rounded-xl font-bold transition-all border flex items-center gap-1.5 {
          isDrawerOpen
            ? 'bg-amber-500 text-black border-amber-400 shadow-md shadow-amber-500/20'
            : 'bg-gradient-to-r from-amber-600/20 to-amber-500/20 hover:from-amber-600/30 hover:to-amber-500/30 border-amber-500/40 text-amber-300'
        }"
      >
        <Icons name="refresh" size={13} />
        <span>{isDrawerOpen ? 'Close Assay Drawer' : 'Eastern Port Assay (10%)'}</span>
      </button>
    </div>
  </div>

  <!-- Currency Tiles Grid -->
  <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-2">
    <!-- Concord Sovereigns -->
    <div class="bg-dark-950/80 border border-amber-500/40 rounded-xl p-3 flex flex-col justify-between relative overflow-hidden group hover:border-amber-400/70 transition-colors">
      <div class="flex items-center justify-between mb-1">
        <span class="text-[10px] uppercase font-black text-amber-400 tracking-wider">Concord Sovereigns</span>
        <span class="w-2 h-2 rounded-full bg-amber-400"></span>
      </div>
      <div class="text-2xl font-black text-amber-300 font-mono my-0.5">
        {pouch.concord_sovereigns.toLocaleString()}
      </div>
      <span class="text-[10px] text-amber-100/50">Realm Standard (1 gp eq.)</span>
    </div>

    <!-- Ay Modlahd Sun-Disks -->
    <div class="bg-dark-950/80 border border-orange-500/40 rounded-xl p-3 flex flex-col justify-between relative overflow-hidden group hover:border-orange-400/70 transition-colors">
      <div class="flex items-center justify-between mb-1">
        <span class="text-[10px] uppercase font-black text-orange-400 tracking-wider">Sun-Disks</span>
        <span class="w-2 h-2 rounded-full bg-orange-400"></span>
      </div>
      <div class="text-2xl font-black text-orange-300 font-mono my-0.5">
        {pouch.ay_modlahd_sun_disks.toLocaleString()}
      </div>
      <span class="text-[10px] text-orange-100/50">Foreign Ay Modlahd Gold</span>
    </div>

    <!-- Trade Bars -->
    <div class="bg-dark-950/80 border border-cyan-500/40 rounded-xl p-3 flex flex-col justify-between relative overflow-hidden group hover:border-cyan-400/70 transition-colors">
      <div class="flex items-center justify-between mb-1">
        <span class="text-[10px] uppercase font-black text-cyan-400 tracking-wider">Trade Bars</span>
        <span class="w-2 h-2 rounded-full bg-cyan-400"></span>
      </div>
      <div class="text-2xl font-black text-cyan-300 font-mono my-0.5">
        {pouch.trade_bars.toLocaleString()}
      </div>
      <span class="text-[10px] text-cyan-100/50">Merchant Bullion (50 gp eq.)</span>
    </div>

    <!-- Rucean Rings -->
    <div class="bg-dark-950/80 border border-purple-500/40 rounded-xl p-3 flex flex-col justify-between relative overflow-hidden group hover:border-purple-400/70 transition-colors">
      <div class="flex items-center justify-between mb-1">
        <span class="text-[10px] uppercase font-black text-purple-400 tracking-wider">Rucean Rings</span>
        <span class="w-2 h-2 rounded-full bg-purple-400"></span>
      </div>
      <div class="text-2xl font-black text-purple-300 font-mono my-0.5">
        {pouch.rucean_rings.toLocaleString()}
      </div>
      <span class="text-[10px] text-purple-100/50">Ancient Tidal Silver</span>
    </div>
  </div>

  <!-- Notification Banner -->
  {#if conversionNotice}
    <div class="mt-3 p-3 bg-amber-950/80 border border-amber-500/60 rounded-xl text-xs text-amber-200 font-medium flex items-center gap-2 animate-fadeIn">
      <Icons name="check" size={16} class="text-amber-400 shrink-0" />
      <span>{conversionNotice}</span>
    </div>
  {/if}

  <!-- Eastern Port Assay (10%) Conversion Drawer -->
  {#if isDrawerOpen}
    <div class="mt-4 pt-4 border-t border-dark-700/80 bg-dark-950/90 rounded-xl p-4 border border-amber-900/30 space-y-4">
      <div class="flex items-start justify-between gap-3">
        <div>
          <div class="flex items-center gap-2">
            <span class="px-2 py-0.5 rounded bg-amber-500/20 border border-amber-500/40 text-amber-300 font-mono font-bold text-[10px] uppercase">
              Chancellery Customs Law §12
            </span>
            <h3 class="text-xs font-black text-slate-100 uppercase tracking-wider font-serif">
              Eastern Port Currency Assay Exchange
            </h3>
          </div>
          <p class="text-[11px] text-slate-400 mt-1">
            Mandatory harbor minting: Ay Modlahd Sun-Disks are reminted into Concord Sovereigns with an official <span class="text-amber-300 font-bold">10% municipal tariff</span> retained by the High Commissioner.
          </p>
        </div>
      </div>

      <!-- Conversion Calculator -->
      <div class="grid grid-cols-1 md:grid-cols-12 gap-4 items-center bg-dark-900/90 p-3 rounded-xl border border-dark-800">
        <!-- Input Amount -->
        <div class="md:col-span-5 space-y-2">
          <label for="sun-disks-input" class="text-[11px] font-bold text-slate-300 uppercase tracking-wider block">
            Sun-Disks to Remint
          </label>
          <div class="flex items-center gap-2">
            <input
              id="sun-disks-input"
              type="number"
              min="1"
              max={maxConvertible}
              bind:value={sunDisksInput}
              class="w-full bg-dark-950 border border-dark-700 focus:border-amber-500 text-amber-300 font-mono text-lg font-bold px-3 py-2 rounded-xl focus:outline-none"
            />
            <button
              onclick={() => setAmount(maxConvertible)}
              class="px-3 py-2 bg-dark-800 hover:bg-dark-700 border border-dark-600 rounded-xl text-xs font-bold text-amber-400 transition-colors shrink-0"
            >
              MAX
            </button>
          </div>

          <!-- Quick Preset Buttons -->
          <div class="flex items-center gap-1.5 pt-1">
            {#each [10, 25, 50, 100] as preset}
              <button
                onclick={() => setAmount(preset)}
                disabled={maxConvertible < preset}
                class="px-2 py-0.5 bg-dark-800 hover:bg-dark-700 disabled:opacity-30 border border-dark-700 rounded-md text-[10px] font-mono text-slate-300"
              >
                +{preset}
              </button>
            {/each}
          </div>
        </div>

        <!-- Conversion Arrow -->
        <div class="md:col-span-2 flex flex-col items-center justify-center text-slate-500">
          <Icons name="chevron-right" size={20} class="hidden md:block text-amber-400" />
          <Icons name="chevron-down" size={20} class="md:hidden text-amber-400" />
          <span class="text-[10px] font-mono text-amber-500 font-bold">-10% Fee</span>
        </div>

        <!-- Output Breakdown & Action -->
        <div class="md:col-span-5 space-y-3">
          <div class="bg-dark-950 p-2.5 rounded-xl border border-dark-800 text-xs space-y-1">
            <div class="flex justify-between text-slate-400">
              <span>Submitted:</span>
              <span class="font-mono text-orange-300 font-bold">{sunDisksInput} Sun-Disks</span>
            </div>
            <div class="flex justify-between text-red-400">
              <span>Port Tariff (10%):</span>
              <span class="font-mono font-bold">-{calculatedFee} Sun-Disks</span>
            </div>
            <div class="flex justify-between text-amber-300 pt-1 border-t border-dark-800 font-bold">
              <span>Minted Sovereigns:</span>
              <span class="font-mono text-sm font-black">+{calculatedMinted} Sov</span>
            </div>
          </div>

          <button
            onclick={handleConvert}
            disabled={sunDisksInput <= 0 || sunDisksInput > maxConvertible}
            class="w-full py-2.5 bg-gradient-to-r from-amber-500 to-amber-400 hover:from-amber-400 hover:to-amber-300 active:from-amber-600 active:to-amber-500 disabled:opacity-40 text-black font-black uppercase text-xs tracking-wider rounded-xl transition-all shadow-lg shadow-amber-500/20 flex items-center justify-center gap-2"
          >
            <Icons name="coins" size={15} />
            Execute Assay Minting
          </button>
        </div>
      </div>
    </div>
  {/if}

  <!-- Port Tariff Audit Ledger Drawer -->
  {#if showLedger}
    <div class="mt-4 pt-4 border-t border-dark-700/80 bg-dark-950/90 rounded-xl p-4 border border-dark-800 space-y-3">
      <div class="flex items-center justify-between">
        <h3 class="text-xs font-bold text-slate-200 uppercase tracking-wider flex items-center gap-1.5">
          <Icons name="file-text" size={14} class="text-amber-400" />
          Official Assay Tariff Ledger & Port Receipts
        </h3>
        <span class="text-[10px] text-slate-400 font-mono">
          {transactionHistory.length} Recorded Transactions
        </span>
      </div>

      <div class="overflow-x-auto">
        <table class="w-full text-left text-xs">
          <thead>
            <tr class="border-b border-dark-800 text-slate-400 text-[10px] uppercase font-bold">
              <th class="py-2 px-2">Receipt Code</th>
              <th class="py-2 px-2">Date / Time</th>
              <th class="py-2 px-2 text-right">Submitted</th>
              <th class="py-2 px-2 text-right">Tariff (10%)</th>
              <th class="py-2 px-2 text-right">Minted Sovereigns</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-dark-800/60 font-mono">
            {#each transactionHistory as tx}
              <tr class="text-slate-300 hover:bg-dark-900/50">
                <td class="py-2 px-2 text-amber-400 font-bold">{tx.portReceiptCode}</td>
                <td class="py-2 px-2 text-slate-400 text-[11px] font-sans">
                  {new Date(tx.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </td>
                <td class="py-2 px-2 text-right text-orange-300">{tx.sunDisksSubmitted}</td>
                <td class="py-2 px-2 text-right text-red-400">-{tx.tariffFeeRetained}</td>
                <td class="py-2 px-2 text-right text-amber-300 font-bold">+{tx.mintedSovereigns}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    </div>
  {/if}
</div>
