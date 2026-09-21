<!-- BastionManagerView.svelte — Keep / Stronghold Zero-State Creation & Municipal Land Charter Workflow -->
<script module lang="ts">
  export type CharterAuthority =
    | 'Capital High Chancellery'
    | 'Highland Regional Council'
    | 'Coastal Port Admiralty'
    | 'Frontier March Authority';

  export interface BastionFacility {
    id: string;
    type: 'animal_pen' | 'smithy' | 'market_stalls' | 'caravansary' | 'water_docks';
    name: string;
    icon: string;
    rpCost: number; // Building slot cost
    purchaseCostGp: number;
    description: string;
    yieldDesc: string;
    skilledCount: number;
    unskilledCount: number;
  }

  export interface BastionHolding {
    id: string;
    name: string;
    authority: CharterAuthority;
    acquiredDate: string;
    charterCostGp: number;
    roomPointsTotal: number; // Maximum building slots
    treasuryGp: number;
    facilities: BastionFacility[];
    skilledHirelings: number;
    unskilledHirelings: number;
    daysUnpaid: number;
    commercialHistory: {
      timestamp: string;
      facilityName: string;
      gpYield: number;
      formula: string;
    }[];
  }
</script>

<script lang="ts">
  import { onMount } from 'svelte';
  import { audioEngine } from '../../audio/AudioEngine';
  import {
    COMMERCIAL_FACILITIES,
    rollFacilityYield,
    type CommercialFacilityId,
    type CommercialYieldResult
  } from '../../mechanics/strongholdEngine';

  const STORAGE_KEY = 'aleamos_bastion_holding_state';

  const AVAILABLE_FACILITY_TEMPLATES: BastionFacility[] = [
    {
      id: 'animal_pen_1',
      type: 'animal_pen',
      name: 'Paddock & Animal Pen',
      icon: '🐾',
      rpCost: 1,
      purchaseCostGp: 2500,
      description: 'Covered stalls and exercise corrals for steeds, draught oxen, and pack animals.',
      yieldDesc: 'Provides 10 stabling slots; prevents pet/mount exposure penalties.',
      skilledCount: 0,
      unskilledCount: 2
    },
    {
      id: 'animal_pen_2',
      type: 'animal_pen',
      name: 'Fortified Breeding Barn',
      icon: '🐎',
      rpCost: 2,
      purchaseCostGp: 5000,
      description: 'Expanded stone masonry stables with specialized veterinary quarantine.',
      yieldDesc: 'Provides 25 stabling slots and free feed for up to 10 mounts.',
      skilledCount: 1,
      unskilledCount: 3
    },
    {
      id: 'smithy_1',
      type: 'smithy',
      name: 'Masterwork Smithy',
      icon: '⚒️',
      rpCost: 1,
      purchaseCostGp: 3000,
      description: 'Basalt forge with cold-water quenching basin and master anvils.',
      yieldDesc: 'Allows masterwork gear crafting and weapon maintenance at standard 5e rates during rests.',
      skilledCount: 1,
      unskilledCount: 2
    },
    {
      id: 'market_stalls_1',
      type: 'market_stalls',
      name: 'Municipal Market Stalls',
      icon: '⚖️',
      rpCost: 1,
      purchaseCostGp: 2500,
      description: 'Shaded wooden stalls leased to itinerant tradesmen and spice vendors.',
      yieldDesc: 'Generates 30 gp × 2d6 per month in rental tariffs.',
      skilledCount: 0,
      unskilledCount: 1
    },
    {
      id: 'caravansary_1',
      type: 'caravansary',
      name: 'Overland Caravansary',
      icon: '🐪',
      rpCost: 2,
      purchaseCostGp: 6000,
      description: 'Wagon staging courtyard, teamster dormitory, and locked cargo depots.',
      yieldDesc: 'Generates 50 gp × 1d8 per month in staging fees.',
      skilledCount: 1,
      unskilledCount: 3
    },
    {
      id: 'water_docks_1',
      type: 'water_docks',
      name: 'Deepwater Quay & Water Docks',
      icon: '⚓',
      rpCost: 2,
      purchaseCostGp: 8000,
      description: 'Timber and stone pilings with manual cargo capstans and mooring cleats.',
      yieldDesc: 'Generates 20 gp per moored vessel per week (7 days).',
      skilledCount: 1,
      unskilledCount: 4
    }
  ];

  let holding = $state<BastionHolding | null>(null);

  // Charter Acquisition Modal State
  let showCharterModal = $state(false);
  let newHoldingName = $state('Capital Vanguard Watch');
  let selectedAuthority = $state<CharterAuthority>('Capital High Chancellery');
  let initialTreasury = $state(10000);

  // Facility Installation Modal State
  let showInstallModal = $state(false);
  let feedbackMessage = $state<string | null>(null);

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        holding = JSON.parse(raw);
      }
    } catch {
      holding = null;
    }
  }

  function saveState() {
    if (typeof localStorage === 'undefined') return;
    if (holding) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(holding));
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
    window.dispatchEvent(new CustomEvent('vtt:bastion-updated', { detail: holding }));
  }

  onMount(() => {
    loadState();
  });

  function flash(msg: string) {
    feedbackMessage = msg;
    setTimeout(() => { feedbackMessage = null; }, 3500);
  }

  // Derived Values
  let allocatedRp = $derived(
    holding?.facilities.reduce((acc, f) => acc + f.rpCost, 0) ?? 0
  );
  let availableRp = $derived(
    holding ? Math.max(0, holding.roomPointsTotal - allocatedRp) : 0
  );

  // Daily hireling wages: Skilled: 2 gp/day; Unskilled: 2 sp (0.2 gp)/day
  let dailyPayrollGp = $derived(
    holding ? (holding.skilledHirelings * 2.0) + (holding.unskilledHirelings * 0.2) : 0
  );
  let monthlyPayrollGp = $derived(Number((dailyPayrollGp * 30).toFixed(1)));

  let isDesertionAlert = $derived((holding?.daysUnpaid ?? 0) >= 7);

  // Acquire Charter Workflow
  function acquireCharter() {
    if (initialTreasury < 5000) {
      flash('Insufficient funds! A Municipal Land Charter requires 5,000 Gold Pieces (gp).');
      return;
    }

    holding = {
      id: 'bastion-' + Date.now(),
      name: newHoldingName.trim() || 'Stronghold Holding',
      authority: selectedAuthority,
      acquiredDate: 'Year 1, 1st Day of Ches',
      charterCostGp: 5000,
      roomPointsTotal: 2, // 2 initial Facility Slots granted by unfortified parcel
      treasuryGp: initialTreasury - 5000,
      facilities: [],
      skilledHirelings: 0,
      unskilledHirelings: 2, // 2 caretakers included
      daysUnpaid: 0,
      commercialHistory: []
    };

    saveState();
    showCharterModal = false;
    audioEngine.triggerSfx('sfx-bell');
    flash(`Land Charter deed sealed under the ${selectedAuthority}! 2 Facility Slots granted.`);
  }

  function demolishHolding() {
    if (!confirm('Are you certain you wish to surrender this Municipal Land Charter and abandon holdings?')) return;
    holding = null;
    saveState();
    flash('Holding decommissioned. Returned to zero-state.');
  }

  function installFacility(template: BastionFacility) {
    if (!holding) return;
    if (availableRp < template.rpCost) {
      flash(`Insufficient Room Points! Need ${template.rpCost} RP, but only ${availableRp} available.`);
      return;
    }
    if (holding.treasuryGp < template.purchaseCostGp) {
      flash(`Insufficient Treasury! Costs ${template.purchaseCostGp.toLocaleString()} gp, but treasury has ${holding.treasuryGp.toLocaleString()} gp.`);
      return;
    }

    holding.treasuryGp -= template.purchaseCostGp;
    holding.facilities = [...holding.facilities, { ...template, id: `${template.type}_${Date.now()}` }];
    holding.skilledHirelings += template.skilledCount;
    holding.unskilledHirelings += template.unskilledCount;

    saveState();
    showInstallModal = false;
    audioEngine.triggerSfx('sfx-secret');
    flash(`Installed ${template.name} for ${template.purchaseCostGp.toLocaleString()} gp! Staffing automatically adjusted.`);
  }

  function removeFacility(facilityId: string) {
    if (!holding) return;
    const fac = holding.facilities.find(f => f.id === facilityId);
    if (!fac) return;
    holding.facilities = holding.facilities.filter(f => f.id !== facilityId);
    holding.skilledHirelings = Math.max(0, holding.skilledHirelings - fac.skilledCount);
    holding.unskilledHirelings = Math.max(0, holding.unskilledHirelings - fac.unskilledCount);
    saveState();
    flash(`Dismantled ${fac.name}. Freed ${fac.rpCost} Room Points.`);
  }

  // Commercial Revenue Engine
  function rollMonthlyYield() {
    if (!holding) return;
    let monthSum = 0;
    const records: BastionHolding['commercialHistory'] = [];

    for (const fac of holding.facilities) {
      if (fac.type === 'market_stalls') {
        const d1 = Math.floor(Math.random() * 6) + 1;
        const d2 = Math.floor(Math.random() * 6) + 1;
        const yieldAmt = 30 * (d1 + d2);
        monthSum += yieldAmt;
        records.push({
          timestamp: new Date().toLocaleTimeString(),
          facilityName: fac.name,
          gpYield: yieldAmt,
          formula: `30 gp × 2d6 (${d1}+${d2}=${d1+d2})`
        });
      } else if (fac.type === 'caravansary') {
        const d8 = Math.floor(Math.random() * 8) + 1;
        const yieldAmt = 50 * d8;
        monthSum += yieldAmt;
        records.push({
          timestamp: new Date().toLocaleTimeString(),
          facilityName: fac.name,
          gpYield: yieldAmt,
          formula: `50 gp × 1d8 (${d8})`
        });
      } else if (fac.type === 'water_docks') {
        // 3 Decades in a month, 2-5 moored vessels per Decade
        const vessels = Math.floor(Math.random() * 4) + 2;
        const yieldAmt = 20 * vessels * 3;
        monthSum += yieldAmt;
        records.push({
          timestamp: new Date().toLocaleTimeString(),
          facilityName: fac.name,
          gpYield: yieldAmt,
          formula: `${vessels} vessels/Decade × 20 gp × 3 Decades`
        });
      }
    }

    if (monthSum === 0) {
      flash('No commercial income-producing facilities installed (Market Stalls, Caravansary, Water Docks).');
      return;
    }

    holding.treasuryGp += monthSum;
    holding.commercialHistory = [...records, ...holding.commercialHistory].slice(0, 15);
    saveState();
    audioEngine.triggerSfx('sfx-bell');
    flash(`Commercial yield collected: +${monthSum.toLocaleString()} Gold Pieces (gp)!`);
  }

  // Payroll Settlement
  function disbursePayroll(daysCount: number) {
    if (!holding) return;
    const cost = Number((dailyPayrollGp * daysCount).toFixed(1));
    if (holding.treasuryGp < cost) {
      flash(`Treasury deficit! Needs ${cost} gp, but treasury only holds ${holding.treasuryGp.toFixed(1)} gp.`);
      return;
    }

    holding.treasuryGp = Math.round((holding.treasuryGp - cost) * 10) / 10;
    holding.daysUnpaid = 0;
    saveState();
    audioEngine.triggerSfx('sfx-bell');
    flash(`Disbursed ${cost} gp for ${daysCount} day(s) wages. Staff morale loyal.`);
  }

  function triggerDefaultDay() {
    if (!holding) return;
    holding.daysUnpaid += 1;
    saveState();
    if (holding.daysUnpaid >= 7) {
      audioEngine.triggerSfx('sfx-sword');
    }
  }

  function depositTreasury(amount: number) {
    if (!holding || amount <= 0) return;
    holding.treasuryGp += amount;
    saveState();
    flash(`Deposited ${amount.toLocaleString()} gp into Stronghold Vault.`);
  }
</script>

<div class="h-full flex flex-col bg-slate-950 text-slate-100 overflow-hidden font-sans select-none">
  <!-- Top Banner -->
  <div class="px-6 py-4 bg-slate-900 border-b border-slate-800 flex items-center justify-between gap-4 shrink-0">
    <div class="flex items-center gap-3">
      <div class="w-10 h-10 rounded-xl bg-amber-950/60 border border-amber-600/50 flex items-center justify-center text-xl shadow-lg">
        🏰
      </div>
      <div>
        <h1 class="text-base font-black text-slate-100 uppercase tracking-wide">
          {holding ? holding.name : 'Stronghold & Bastion Holdings'}
        </h1>
        <p class="text-xs text-slate-400">
          {holding ? `Chartered by ${holding.authority}` : 'Municipal Land Charters & Feudal Expansion Engine'}
        </p>
      </div>
    </div>

    {#if holding}
      <div class="flex items-center gap-3">
        <!-- Room Point Capacity -->
        <div class="bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5 flex items-center gap-3">
          <div>
            <span class="text-[9px] uppercase font-bold text-slate-500 block">Facility Slots</span>
            <div class="flex items-center gap-1.5 font-mono text-xs">
              <span class="font-black text-amber-400 text-sm">{allocatedRp}</span>
              <span class="text-slate-500">/ {holding.roomPointsTotal}</span>
              <span class="px-1.5 py-0.2 rounded text-[10px] {availableRp > 0 ? 'bg-emerald-950 text-emerald-300 border border-emerald-800/60' : 'bg-slate-800 text-slate-400'}">
                {availableRp} Free
              </span>
            </div>
          </div>
        </div>

        <!-- Treasury -->
        <div class="bg-slate-950 border border-amber-800/40 rounded-xl px-3 py-1.5">
          <span class="text-[9px] uppercase font-bold text-amber-500/80 block">Stronghold Treasury</span>
          <span class="font-mono text-sm font-black text-amber-300">
            {holding.treasuryGp.toLocaleString()} gp
          </span>
        </div>

        <button
          onclick={() => showInstallModal = true}
          class="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold transition-all shadow flex items-center gap-1.5"
        >
          <span>+</span> Install Facility
        </button>

        <button
          onclick={demolishHolding}
          class="p-2 bg-slate-800 hover:bg-rose-900/60 text-slate-400 hover:text-rose-300 rounded-xl text-xs transition-colors"
          title="Surrender Land Charter"
        >
          🗑️
        </button>
      </div>
    {/if}
  </div>

  {#if feedbackMessage}
    <div class="bg-indigo-950/80 border-b border-indigo-700/50 px-4 py-1.5 text-center text-xs text-indigo-300 font-semibold animate-pulse">
      {feedbackMessage}
    </div>
  {/if}

  <!-- Main View Content -->
  <div class="flex-1 overflow-y-auto p-6">
    {#if !holding}
      <!-- ZERO-STATE HOLDINGS VIEW -->
      <div class="max-w-2xl mx-auto my-12 bg-slate-900/90 border border-slate-800 rounded-3xl p-8 text-center space-y-6 shadow-2xl">
        <div class="w-20 h-20 mx-auto rounded-3xl bg-amber-950/40 border border-amber-700/40 flex items-center justify-center text-4xl shadow-inner">
          📜
        </div>

        <div class="space-y-2">
          <h2 class="text-xl font-black text-slate-100 tracking-wide">No Registered Stronghold Holdings</h2>
          <p class="text-xs text-slate-400 max-w-md mx-auto leading-relaxed">
            Feudal strongholds, coastal quays, and trade outposts cannot pre-exist without municipal grant. To initiate construction, the party must purchase an authorized <b class="text-amber-300">Municipal Land Charter</b>.
          </p>
        </div>

        <!-- Charter Cost Specs Card -->
        <div class="bg-slate-950 border border-slate-800 rounded-2xl p-5 text-left grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
          <div>
            <span class="text-[10px] uppercase font-bold text-slate-500 block">Deed Cost</span>
            <span class="font-mono text-base font-black text-amber-400">5,000 gp</span>
            <span class="text-[10px] text-slate-500 block">Gold Pieces</span>
          </div>
          <div>
            <span class="text-[10px] uppercase font-bold text-slate-500 block">Initial Capacity</span>
            <span class="font-mono text-base font-black text-indigo-400">2 Facility Slots</span>
            <span class="text-[10px] text-slate-500 block">Unfortified parcel</span>
          </div>
          <div>
            <span class="text-[10px] uppercase font-bold text-slate-500 block">Charter Authority</span>
            <span class="text-xs font-bold text-slate-300 block">Municipal / Regional</span>
            <span class="text-[10px] text-slate-500 block">Recognized Crown Seal</span>
          </div>
        </div>

        <div>
          <button
            onclick={() => showCharterModal = true}
            class="px-6 py-3 bg-gradient-to-r from-amber-600 to-amber-700 hover:from-amber-500 hover:to-amber-600 text-slate-950 font-black rounded-xl text-xs uppercase tracking-wider shadow-lg transition-all"
          >
            Acquire Municipal Land Charter (5,000 gp)
          </button>
        </div>
      </div>
    {:else}
      <!-- ACTIVE STRONGHOLD MANAGEMENT -->
      <div class="max-w-7xl mx-auto space-y-6">

        <!-- Desertion Warning Banner -->
        {#if isDesertionAlert}
          <div class="bg-rose-950/80 border border-rose-600 rounded-2xl p-4 flex items-center justify-between gap-4 text-xs text-rose-200 shadow-xl">
            <div class="flex items-center gap-3">
              <span class="text-2xl">⚠️</span>
              <div>
                <h3 class="font-black text-rose-300 uppercase tracking-wide">CRITICAL DESERTION ALERT (7+ Days Unpaid)</h3>
                <p class="text-[11px] text-rose-200">
                  Hirelings and retainers have gone {holding.daysUnpaid} days without wages. Guards and artisans are deserting their posts; facility yields are halved!
                </p>
              </div>
            </div>
            <button
              onclick={() => disbursePayroll(7)}
              class="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white font-bold rounded-xl shadow transition-colors shrink-0"
            >
              Pay Back-Wages Now
            </button>
          </div>
        {/if}

        <!-- Top Overview Grid: Ledger & Payroll -->
        <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">

          <!-- Card 1: Payroll & Staffing Ledger -->
          <div class="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 space-y-4">
            <div class="flex items-center justify-between">
              <h3 class="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
                <span>👥</span> Hireling Payroll &amp; Morale
              </h3>
              <span class="px-2 py-0.5 rounded text-[10px] font-bold font-mono {holding.daysUnpaid > 0 ? 'bg-rose-950 text-rose-300 border border-rose-800' : 'bg-emerald-950 text-emerald-300 border border-emerald-800'}">
                {holding.daysUnpaid > 0 ? `${holding.daysUnpaid}d Unpaid` : 'Loyal'}
              </span>
            </div>

            <div class="grid grid-cols-2 gap-3 text-xs bg-slate-950 p-3 rounded-xl border border-slate-800">
              <div>
                <span class="text-[10px] text-slate-500 block">Skilled Artisans (2 gp/d)</span>
                <span class="font-mono text-base font-bold text-slate-200">{holding.skilledHirelings} staff</span>
              </div>
              <div>
                <span class="text-[10px] text-slate-500 block">Laborers (2 sp/d)</span>
                <span class="font-mono text-base font-bold text-slate-200">{holding.unskilledHirelings} staff</span>
              </div>
              <div>
                <span class="text-[10px] text-slate-500 block">Daily Payroll</span>
                <span class="font-mono text-sm font-bold text-amber-400">{dailyPayrollGp.toFixed(2)} gp</span>
              </div>
              <div>
                <span class="text-[10px] text-slate-500 block">Monthly Overhead</span>
                <span class="font-mono text-sm font-bold text-amber-400">{monthlyPayrollGp.toFixed(1)} gp</span>
              </div>
            </div>

            <!-- Payroll Controls -->
            <div class="flex items-center gap-2 pt-1">
              <button
                onclick={() => disbursePayroll(1)}
                class="flex-1 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-bold transition-colors"
              >
                Pay 1 Day ({dailyPayrollGp.toFixed(1)} gp)
              </button>
              <button
                onclick={() => disbursePayroll(10)}
                class="flex-1 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-bold transition-colors shadow"
              >
                Pay 1 Decade ({(dailyPayrollGp * 10).toFixed(1)} gp)
              </button>
              <button
                onclick={triggerDefaultDay}
                class="px-2.5 py-1.5 bg-rose-950/60 hover:bg-rose-900 border border-rose-800/40 text-rose-300 rounded-lg text-xs font-bold transition-colors"
                title="Advance 1 Unpaid Day (Test Desertion Threshold)"
              >
                +1d Unpaid
              </button>
            </div>
          </div>

          <!-- Card 2: Commercial Yield Engine -->
          <div class="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 space-y-4">
            <div class="flex items-center justify-between">
              <h3 class="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
                <span>🪙</span> Commercial Yields
              </h3>
              <span class="text-[10px] text-slate-400 font-mono">Decade / Month Auditing</span>
            </div>

            <p class="text-xs text-slate-400 leading-relaxed">
              Roll municipal tariffs from Market Stalls, Caravansary staging, and Port Ruceas wharves.
            </p>

            <button
              onclick={rollMonthlyYield}
              class="w-full py-2.5 bg-gradient-to-r from-amber-600 to-amber-700 hover:from-amber-500 hover:to-amber-600 text-slate-950 font-black rounded-xl text-xs uppercase tracking-wider shadow transition-all flex items-center justify-center gap-2"
            >
              <span>🎲</span> Collect Monthly Commercial Yield
            </button>

            <!-- Quick Treasury Deposit -->
            <div class="flex items-center gap-2 pt-2 border-t border-slate-800">
              <span class="text-[11px] text-slate-400 font-medium">Vault Deposit:</span>
              <button
                onclick={() => depositTreasury(500)}
                class="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-amber-300 rounded text-xs font-mono font-bold"
              >
                +500 gp
              </button>
              <button
                onclick={() => depositTreasury(2500)}
                class="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-amber-300 rounded text-xs font-mono font-bold"
              >
                +2,500 gp
              </button>
            </div>
          </div>

          <!-- Card 3: Recent Commercial Ledger -->
          <div class="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 space-y-3 flex flex-col">
            <h3 class="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
              <span>📜</span> Commercial Ledger
            </h3>
            <div class="flex-1 overflow-y-auto max-h-40 space-y-2 pr-1">
              {#if holding.commercialHistory.length === 0}
                <div class="text-center py-6 text-slate-500 text-xs italic">
                  No commercial transactions recorded yet.
                </div>
              {:else}
                {#each holding.commercialHistory as log}
                  <div class="bg-slate-950 border border-slate-800/80 rounded-lg p-2 text-xs flex items-center justify-between gap-2">
                    <div>
                      <span class="font-bold text-slate-200 block">{log.facilityName}</span>
                      <span class="text-[10px] text-slate-500 font-mono">{log.formula}</span>
                    </div>
                    <span class="font-mono font-black text-emerald-400 shrink-0">+{log.gpYield} gp</span>
                  </div>
                {/each}
              {/if}
            </div>
          </div>
        </div>

        <!-- Installed Facilities Grid -->
        <div class="space-y-4">
          <div class="flex items-center justify-between">
            <h3 class="text-sm font-black uppercase tracking-wider text-slate-200 flex items-center gap-2">
              <span>🏗️</span> Installed Bastion Facilities ({holding.facilities.length})
            </h3>
            <span class="text-xs text-slate-400 font-mono">
              Facility Slots Used: <b class="text-amber-300">{allocatedRp}</b> / {holding.roomPointsTotal} Slots
            </span>
          </div>

          {#if holding.facilities.length === 0}
            <div class="bg-slate-900/50 border border-dashed border-slate-800 rounded-2xl p-10 text-center space-y-3">
              <span class="text-3xl block">🔨</span>
              <p class="text-xs font-bold text-slate-400">Parcel is currently empty.</p>
              <p class="text-xs text-slate-500">Click "Install Facility" to construct Animal Pens, Smithies, or Market Stalls.</p>
            </div>
          {:else}
            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {#each holding.facilities as fac}
                <div class="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-3 relative group">
                  <div class="flex items-start justify-between gap-2">
                    <div class="flex items-center gap-2.5">
                      <span class="text-2xl">{fac.icon}</span>
                      <div>
                        <h4 class="text-xs font-black text-slate-100">{fac.name}</h4>
                        <span class="text-[10px] font-mono text-amber-400">{fac.rpCost} Room Point{fac.rpCost > 1 ? 's' : ''}</span>
                      </div>
                    </div>
                    <button
                      onclick={() => removeFacility(fac.id)}
                      class="text-slate-600 hover:text-rose-400 text-xs p-1 transition-colors"
                      title="Dismantle Facility"
                    >
                      ✕
                    </button>
                  </div>

                  <p class="text-[11px] text-slate-400 leading-relaxed">
                    {fac.description}
                  </p>

                  <div class="p-2 bg-slate-950 border border-slate-800 rounded-xl space-y-1 text-[10px]">
                    <span class="text-emerald-400 font-semibold block">⭐ {fac.yieldDesc}</span>
                    <span class="text-slate-500 block">
                      Staffing: {fac.skilledCount} Skilled · {fac.unskilledCount} Laborers
                    </span>
                  </div>
                </div>
              {/each}
            </div>
          {/if}
        </div>

      </div>
    {/if}
  </div>
</div>

<!-- ═══════════════════════════════════════════════════════════════════════
     ACQUIRE CHARTER MODAL
════════════════════════════════════════════════════════════════════════════ -->
{#if showCharterModal}
  <div
    role="presentation"
    class="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4"
    onclick={(e) => { if (e.target === e.currentTarget) showCharterModal = false; }}
  >
    <div class="w-full max-w-lg bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl p-6 space-y-5 text-xs">
      <div class="flex items-center justify-between border-b border-slate-800 pb-3">
        <h3 class="text-base font-black text-slate-100 flex items-center gap-2">
          <span>📜</span> Municipal Land Charter Acquisition
        </h3>
        <button onclick={() => showCharterModal = false} class="text-slate-500 hover:text-slate-300">✕</button>
      </div>

      <div class="space-y-4">
        <div>
          <label for="holding-name-input" class="font-bold text-slate-400 uppercase tracking-wider text-[10px] block mb-1">Holding Name</label>
          <input
            id="holding-name-input"
            type="text"
            bind:value={newHoldingName}
            class="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-100 font-bold focus:outline-none focus:border-amber-500"
          />
        </div>

        <div>
          <label for="charter-auth-select" class="font-bold text-slate-400 uppercase tracking-wider text-[10px] block mb-1">Charter Authority</label>
          <select
            id="charter-auth-select"
            bind:value={selectedAuthority}
            class="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-amber-300 font-semibold focus:outline-none"
          >
            <option value="Capital High Chancellery">Capital High Chancellery (Municipal Jurisdiction)</option>
            <option value="Highland Regional Council">Highland Regional Council (Subsurface &amp; Mining Rights)</option>
            <option value="Coastal Port Admiralty">Coastal Port Admiralty (Shoal &amp; Archipelago Anchorage)</option>
            <option value="Frontier March Authority">Frontier March Authority (Borderlands Defense)</option>
          </select>
        </div>

        <div>
          <label for="charter-treasury-input" class="font-bold text-slate-400 uppercase tracking-wider text-[10px] block mb-1">Party Treasury Reserve (gp)</label>
          <input
            id="charter-treasury-input"
            type="number"
            min="5000"
            step="500"
            bind:value={initialTreasury}
            class="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-100 font-mono focus:outline-none focus:border-amber-500"
          />
          <span class="text-[10px] text-slate-500 block mt-1">
            5,000 gp will be debited for the land charter fee; remaining balance becomes starting vault treasury.
          </span>
        </div>
      </div>

      <div class="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
        <button
          onclick={() => showCharterModal = false}
          class="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl font-medium"
        >
          Cancel
        </button>
        <button
          onclick={acquireCharter}
          class="px-5 py-2 bg-amber-600 hover:bg-amber-500 text-slate-950 font-black rounded-xl shadow"
        >
          Affix Seal &amp; Pay 5,000 gp
        </button>
      </div>
    </div>
  </div>
{/if}

<!-- ═══════════════════════════════════════════════════════════════════════
     INSTALL FACILITY MODAL
═══════════════════════════════════════════════════════════════════════ -->
{#if showInstallModal}
  <div
    role="presentation"
    class="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4"
    onclick={(e) => { if (e.target === e.currentTarget) showInstallModal = false; }}
  >
    <div class="w-full max-w-2xl bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl p-6 space-y-4 max-h-[85vh] flex flex-col text-xs">
      <div class="flex items-center justify-between border-b border-slate-800 pb-3 shrink-0">
        <h3 class="text-base font-black text-slate-100 flex items-center gap-2">
          <span>🔨</span> Select Bastion Facility to Construct
        </h3>
        <button onclick={() => showInstallModal = false} class="text-slate-500 hover:text-slate-300">✕</button>
      </div>

      <div class="flex-1 overflow-y-auto space-y-3 pr-1">
        {#each AVAILABLE_FACILITY_TEMPLATES as template}
          {@const canAfford = (holding?.treasuryGp ?? 0) >= template.purchaseCostGp}
          {@const hasRp = availableRp >= template.rpCost}
          <div class="bg-slate-950 border border-slate-800/80 rounded-xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div class="space-y-1 min-w-0">
              <div class="flex items-center gap-2">
                <span class="text-xl">{template.icon}</span>
                <span class="font-black text-slate-200">{template.name}</span>
                <span class="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-amber-950/80 text-amber-300 border border-amber-800/40">
                  {template.rpCost} RP
                </span>
              </div>
              <p class="text-[11px] text-slate-400">{template.description}</p>
              <div class="text-[10px] text-emerald-400 font-semibold">{template.yieldDesc}</div>
            </div>

            <div class="flex sm:flex-col items-center sm:items-end justify-between w-full sm:w-auto gap-2 shrink-0">
              <span class="font-mono text-xs font-black text-amber-300">
                {template.purchaseCostGp.toLocaleString()} gp
              </span>
              <button
                disabled={!canAfford || !hasRp}
                onclick={() => installFacility(template)}
                class="px-4 py-2 rounded-xl font-bold transition-all text-xs {canAfford && hasRp
                  ? 'bg-indigo-600 hover:bg-indigo-500 text-white shadow'
                  : 'bg-slate-800 text-slate-500 cursor-not-allowed'}"
              >
                {!hasRp ? 'Insufficient RP' : !canAfford ? 'Insufficient GP' : 'Construct'}
              </button>
            </div>
          </div>
        {/each}
      </div>
    </div>
  </div>
{/if}
