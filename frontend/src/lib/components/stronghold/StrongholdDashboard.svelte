<!-- StrongholdDashboard.svelte — Aleamos Stronghold Manager, Room Point Progression, and Payroll Auditor -->
<script lang="ts">
  import { onMount } from 'svelte';
  import { audioEngine } from '../../audio/AudioEngine';
  import {
    FACILITIES,
    UPGRADE_PROGRESSION,
    calculateLaborDiscount,
    calculatePayroll,
    evaluateDesertionRisk,
    calculateAllocatedRp,
    calculateStaffingRequirements,
    type StrongholdType,
    type FacilityId,
    type StrongholdState,
  } from '../../stronghold/strongholdEngine';

  const STORAGE_STRONGHOLD_KEY = 'vtt_stronghold_state';

  const DEFAULT_STRONGHOLD: StrongholdState = {
    id: 'stronghold-alpha',
    name: 'Greystone Bastion',
    type: 'Outpost',
    currentRp: 3, // Starts with 3 RP
    facilities: ['alchemy_lab', 'watchtower'], // 2 RP allocated
    skilledHirelingsCount: 2, // 1 Alchemist + 1 Scout
    unskilledHirelingsCount: 4, // 4 Laborers/Lookouts
    daysUnpaid: 0,
    treasuryGp: 15400,
    activeUpgrade: null,
  };

  // State
  let state = $state<StrongholdState>(DEFAULT_STRONGHOLD);
  let pcLaborLevel = $state(8); // Default Party Level for labor discount
  let depositAmount = $state(1000);
  let feedbackMessage = $state<string | null>(null);

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_STRONGHOLD_KEY);
      if (raw) {
        state = { ...DEFAULT_STRONGHOLD, ...JSON.parse(raw) };
        return;
      }
    } catch {
      // ignore
    }
    saveState();
  }

  function saveState() {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(STORAGE_STRONGHOLD_KEY, JSON.stringify(state));
    window.dispatchEvent(new CustomEvent('vtt:stronghold-updated', { detail: state }));
  }

  onMount(() => {
    loadState();
  });

  // Derived calculations
  let allocatedRp = $derived(calculateAllocatedRp(state.facilities));
  let availableRp = $derived(Math.max(0, state.currentRp - allocatedRp));

  let nextUpgradeStep = $derived(
    state.currentRp < 6 ? UPGRADE_PROGRESSION[state.currentRp] : null
  );

  let laborDiscount = $derived(calculateLaborDiscount(pcLaborLevel));
  let discountedUpgradeCost = $derived(
    nextUpgradeStep ? laborDiscount.calculateDiscountedCost(nextUpgradeStep.baseCostGp) : 0
  );

  let payroll = $derived(calculatePayroll(state.skilledHirelingsCount, state.unskilledHirelingsCount));
  let desertionAudit = $derived(evaluateDesertionRisk(state.daysUnpaid));
  let staffingRequirements = $derived(calculateStaffingRequirements(state.currentRp, state.facilities));

  function flash(msg: string) {
    feedbackMessage = msg;
    setTimeout(() => { feedbackMessage = null; }, 3000);
  }

  // Facility Management
  function constructFacility(fId: FacilityId) {
    const def = FACILITIES[fId];
    if (!def) return;
    if (availableRp < def.rpCost) {
      flash(`Insufficient Room Points! Need ${def.rpCost} RP, but only ${availableRp} available.`);
      return;
    }
    if (state.facilities.includes(fId)) {
      flash(`${def.name} is already built!`);
      return;
    }

    state.facilities = [...state.facilities, fId];
    // Suggest staffing
    state.skilledHirelingsCount += def.recommendedSkilledHirelings;
    state.unskilledHirelingsCount += def.recommendedUnskilledHirelings;
    saveState();
    audioEngine.triggerSfx('sfx-sword');
    flash(`Constructed ${def.name}!`);
  }

  function demolishFacility(fId: FacilityId) {
    const def = FACILITIES[fId];
    if (!state.facilities.includes(fId)) return;
    state.facilities = state.facilities.filter(id => id !== fId);
    if (def) {
      state.skilledHirelingsCount = Math.max(0, state.skilledHirelingsCount - def.recommendedSkilledHirelings);
      state.unskilledHirelingsCount = Math.max(0, state.unskilledHirelingsCount - def.recommendedUnskilledHirelings);
    }
    saveState();
    audioEngine.triggerSfx('sfx-rest');
    flash(`Decommissioned facility. Reclaimed ${def?.rpCost ?? 1} RP.`);
  }

  // Upgrades
  function startUpgrade() {
    if (!nextUpgradeStep) return;
    if (state.treasuryGp < discountedUpgradeCost) {
      flash(`Insufficient treasury gold! Need ${discountedUpgradeCost} gp.`);
      return;
    }

    state.treasuryGp -= discountedUpgradeCost;
    state.activeUpgrade = {
      targetRp: nextUpgradeStep.toRp,
      baseCostGp: nextUpgradeStep.baseCostGp,
      finalCostGp: discountedUpgradeCost,
      totalDays: nextUpgradeStep.days,
      daysCompleted: 0,
      isUnderway: true,
      pcLaborLevelApplied: pcLaborLevel,
    };
    saveState();
    audioEngine.triggerSfx('sfx-bell');
    flash(`Began construction for ${nextUpgradeStep.toRp} Room Points! (${nextUpgradeStep.days} days duration).`);
  }

  function progressUpgrade(days: number) {
    if (!state.activeUpgrade) return;
    state.activeUpgrade.daysCompleted += days;
    if (state.activeUpgrade.daysCompleted >= state.activeUpgrade.totalDays) {
      state.currentRp = state.activeUpgrade.targetRp;
      const target = state.activeUpgrade.targetRp;
      // Auto-staff to match upgraded RP formula
      const req = calculateStaffingRequirements(target, state.facilities);
      state.skilledHirelingsCount = Math.max(state.skilledHirelingsCount, req.recommendedSkilled);
      state.unskilledHirelingsCount = Math.max(state.unskilledHirelingsCount, req.recommendedUnskilled);
      state.activeUpgrade = null;
      audioEngine.triggerSfx('sfx-bell');
      flash(`🎉 Stronghold expanded to ${target} Room Points! Hireling staff updated to match upgraded tier.`);
    } else {
      flash(`Construction advanced by ${days} days (${state.activeUpgrade.daysCompleted}/${state.activeUpgrade.totalDays} days).`);
    }
    saveState();
  }

  // Payroll Management
  function payPayrollDays(daysCount: number) {
    const cost = Number((payroll.totalDailyGp * daysCount).toFixed(2));
    if (state.treasuryGp < cost) {
      flash(`Insufficient treasury funds to pay ${daysCount} day(s) of payroll (${cost} gp)!`);
      return;
    }

    state.treasuryGp = Math.max(0, Number((state.treasuryGp - cost).toFixed(2)));
    state.daysUnpaid = 0;
    saveState();
    audioEngine.triggerSfx('sfx-bell');
    flash(`Disbursed ${cost} gp for ${daysCount} day(s) payroll. Staff morale restored to Loyal!`);
  }

  function advanceUnpaidDay() {
    state.daysUnpaid += 1;
    saveState();
    if (state.daysUnpaid >= 7) {
      audioEngine.triggerSfx('sfx-sword');
    }
  }

  function depositTreasury() {
    if (depositAmount <= 0) return;
    state.treasuryGp += depositAmount;
    saveState();
    flash(`Deposited ${depositAmount} gp into Stronghold Treasury.`);
  }

  function withdrawTreasury(amount: number) {
    if (amount <= 0 || state.treasuryGp < amount) return;
    state.treasuryGp -= amount;
    saveState();
    flash(`Withdrew ${amount} gp from Stronghold Treasury.`);
  }
</script>

<div class="h-full flex flex-col bg-slate-950 text-slate-100 overflow-hidden font-sans select-none">

  <!-- Header -->
  <div class="px-6 py-4 bg-slate-900 border-b border-slate-800 flex flex-wrap items-center justify-between gap-4 shrink-0">
    <div class="flex items-center gap-3">
      <span class="text-3xl">🏰</span>
      <div>
        <div class="flex items-center gap-2">
          <input
            type="text"
            bind:value={state.name}
            onchange={saveState}
            class="bg-slate-950 border border-slate-700/60 rounded px-2 py-0.5 text-base font-black text-slate-100 focus:outline-none focus:border-amber-500"
          />
          <select
            bind:value={state.type}
            onchange={saveState}
            class="bg-slate-950 border border-slate-800 rounded px-2 py-1 text-xs text-amber-300 font-semibold focus:outline-none"
          >
            <option value="Outpost">Outpost</option>
            <option value="Guild Annex">Guild Annex</option>
            <option value="Estate">Estate</option>
            <option value="Keep">Keep</option>
            <option value="Fortress">Fortress</option>
          </select>
        </div>
        <p class="text-xs text-slate-400 mt-0.5">Aleamos Settlement Logistics &amp; Modular Room Point Architecture</p>
      </div>
    </div>

    <!-- Top Metrics -->
    <div class="flex items-center gap-3">
      <!-- RP Capacity Gauge -->
      <div class="px-3.5 py-1.5 rounded-xl bg-slate-950 border border-slate-800 flex items-center gap-2.5">
        <div>
          <span class="text-[9px] font-bold uppercase tracking-wider text-slate-500 block">Room Points (RP)</span>
          <div class="flex items-center gap-1.5 mt-0.5">
            <span class="text-base font-mono font-black text-amber-300">{allocatedRp}</span>
            <span class="text-xs text-slate-500 font-mono">/ {state.currentRp} RP</span>
            <span class="text-[10px] font-bold px-1.5 py-0.2 rounded {availableRp > 0 ? 'bg-emerald-950 text-emerald-300 border border-emerald-800/50' : 'bg-slate-800 text-slate-400'}">
              {availableRp} Free
            </span>
          </div>
        </div>

        <div class="w-20 h-2 bg-slate-800 rounded-full overflow-hidden flex">
          <div
            class="bg-amber-500 h-full transition-all"
            style="width: {(allocatedRp / state.currentRp) * 100}%"
          ></div>
        </div>
      </div>

      <!-- Treasury Gauge -->
      <div class="px-3.5 py-1.5 rounded-xl bg-slate-950 border border-slate-800">
        <span class="text-[9px] font-bold uppercase tracking-wider text-slate-500 block">Stronghold Treasury</span>
        <span class="text-base font-mono font-black text-emerald-400">{state.treasuryGp.toLocaleString()} gp</span>
      </div>

      <!-- Morale & Desertion Badge -->
      <div class="px-3.5 py-1.5 rounded-xl border flex items-center gap-2 {
        desertionAudit.status === 'Loyal' ? 'bg-emerald-950/40 border-emerald-700/50 text-emerald-300' :
        desertionAudit.status === 'Warning' ? 'bg-amber-950/40 border-amber-700/50 text-amber-300' :
        desertionAudit.status === 'Critical' ? 'bg-orange-950/60 border-orange-600 text-orange-300 animate-pulse' :
        'bg-rose-950/80 border-rose-600 text-rose-200 animate-bounce'
      }">
        <span class="text-sm">
          {desertionAudit.status === 'Loyal' ? '🛡️' : desertionAudit.status === 'Deserted' ? '☠️' : '⚠️'}
        </span>
        <div>
          <span class="text-[9px] font-bold uppercase block">Morale Status</span>
          <span class="text-xs font-black">{desertionAudit.status}</span>
        </div>
      </div>
    </div>
  </div>

  <!-- Feedback Banner -->
  {#if feedbackMessage}
    <div class="bg-indigo-950/90 border-b border-indigo-700/60 px-4 py-2 text-xs text-center text-indigo-200 font-bold transition-all">
      {feedbackMessage}
    </div>
  {/if}

  <!-- Main Split Layout -->
  <div class="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-3 divide-y lg:divide-y-0 lg:divide-x divide-slate-800 overflow-y-auto">

    <!-- ═══════════════════════════════════════════════════════════════════════
         COLUMN 1: SEQUENTIAL UPGRADE ENGINE & ROOM POINT BUILDER
    ════════════════════════════════════════════════════════════════════════ -->
    <div class="p-5 space-y-5 overflow-y-auto">
      <div class="flex items-center justify-between">
        <h3 class="text-xs font-black uppercase tracking-wider text-slate-200 flex items-center gap-1.5">
          <span>📐</span> Sequential Room Point Engine
        </h3>
        <span class="text-[10px] font-bold text-slate-400 font-mono">Current: Tier {state.currentRp} RP</span>
      </div>

      <!-- Upgrade Progress or Start Upgrade Card -->
      {#if state.activeUpgrade}
        <div class="p-4 rounded-2xl bg-amber-950/20 border border-amber-800/60 space-y-3">
          <div class="flex items-center justify-between text-xs">
            <span class="font-bold text-amber-200 flex items-center gap-1.5">
              <span class="w-2 h-2 rounded-full bg-amber-400 animate-pulse"></span>
              Expansion Underway: {state.currentRp} ➔ {state.activeUpgrade.targetRp} RP
            </span>
            <span class="font-mono font-bold text-slate-300">
              {state.activeUpgrade.daysCompleted} / {state.activeUpgrade.totalDays} Days
            </span>
          </div>

          <div class="w-full h-2.5 bg-slate-900 rounded-full overflow-hidden border border-slate-800">
            <div
              class="bg-amber-500 h-full rounded-full transition-all"
              style="width: {(state.activeUpgrade.daysCompleted / state.activeUpgrade.totalDays) * 100}%"
            ></div>
          </div>

          <div class="flex items-center justify-between text-[11px] text-slate-400">
            <span>PC Labor Discount: <strong>{state.activeUpgrade.pcLaborLevelApplied * 0.5}%</strong> applied</span>
            <span>Cost: <strong>{state.activeUpgrade.finalCostGp.toLocaleString()} gp</strong></span>
          </div>

          <!-- Advance Construction Controls -->
          <div class="flex items-center gap-2 pt-1">
            <button
              onclick={() => progressUpgrade(10)}
              class="flex-1 py-1.5 px-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold rounded-lg border border-slate-700 transition-colors"
            >
              +10 Days Work
            </button>
            <button
              onclick={() => progressUpgrade(state.activeUpgrade ? state.activeUpgrade.totalDays - state.activeUpgrade.daysCompleted : 0)}
              class="flex-1 py-1.5 px-2 bg-amber-600 hover:bg-amber-500 text-slate-950 text-xs font-black rounded-lg transition-colors shadow-sm"
            >
              Complete Now
            </button>
          </div>
        </div>
      {:else if nextUpgradeStep}
        <div class="p-4 rounded-2xl bg-slate-900 border border-slate-800 space-y-3">
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-2">
              <span class="text-xl">🏗️</span>
              <div>
                <span class="text-xs font-black text-slate-100">Next Expansion: {nextUpgradeStep.toRp} Room Points</span>
                <p class="text-[10px] text-slate-400">Unlock capacity for an additional modular facility</p>
              </div>
            </div>
            <span class="text-xs font-mono font-bold text-amber-400">{nextUpgradeStep.days} Days</span>
          </div>

          <!-- PC Labor Discount Calculator -->
          <div class="bg-slate-950 p-3 rounded-xl border border-slate-800/80 space-y-2">
            <div class="flex items-center justify-between text-xs">
              <span class="text-slate-300 font-semibold flex items-center gap-1">
                <span>🛠️ PC Full Labor Discount</span>
              </span>
              <span class="font-mono font-bold text-emerald-400">
                -{laborDiscount.discountPercent}% (Level {pcLaborLevel})
              </span>
            </div>

            <div class="flex items-center gap-2">
              <span class="text-[10px] text-slate-500">Party Level:</span>
              <input
                type="range"
                min="1"
                max="20"
                bind:value={pcLaborLevel}
                class="flex-1 accent-indigo-500 cursor-pointer"
              />
              <span class="font-mono text-xs font-bold text-slate-200 w-6 text-right">{pcLaborLevel}</span>
            </div>
            <p class="text-[9px] text-slate-500">
              PC full labor reduces cost by half character level % ({pcLaborLevel} × 0.5% = {laborDiscount.discountPercent}% discount).
            </p>
          </div>

          <!-- Cost Breakdown -->
          <div class="flex items-center justify-between text-xs px-1">
            <span class="text-slate-400">Required Treasury:</span>
            <div class="text-right font-mono">
              <span class="text-slate-500 line-through text-[11px] mr-1.5">{nextUpgradeStep.baseCostGp.toLocaleString()} gp</span>
              <span class="text-emerald-400 font-black text-sm">{discountedUpgradeCost.toLocaleString()} gp</span>
            </div>
          </div>

          <button
            onclick={startUpgrade}
            disabled={state.treasuryGp < discountedUpgradeCost}
            class="w-full py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white text-xs font-black rounded-xl transition-all shadow-md shadow-indigo-600/30 flex items-center justify-center gap-1.5"
          >
            <span>🔨</span> Initiate {nextUpgradeStep.toRp} RP Construction
          </button>
        </div>
      {:else}
        <div class="p-4 rounded-2xl bg-emerald-950/30 border border-emerald-800/60 text-center space-y-1">
          <span class="text-2xl">👑</span>
          <h4 class="text-xs font-black text-emerald-300 uppercase">Maximum Stronghold Tier Reached</h4>
          <p class="text-[11px] text-slate-400">6 Room Points achieved. The citadel is at peak capacity.</p>
        </div>
      {/if}

      <!-- Sequential Upgrade Reference Table -->
      <div class="space-y-2">
        <span class="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Codified Aleamos Progression</span>
        <div class="space-y-1 text-xs">
          {#each Object.values(UPGRADE_PROGRESSION) as step}
            <div class="p-2 rounded-lg border flex items-center justify-between font-mono {
              state.currentRp > step.toRp ? 'bg-slate-900/30 border-slate-800/40 text-slate-600 line-through' :
              state.currentRp === step.fromRp ? 'bg-indigo-950/30 border-indigo-700/60 text-indigo-200 font-bold' :
              'bg-slate-950 border-slate-800 text-slate-400'
            }">
              <span>{step.fromRp} ➔ {step.toRp} RP</span>
              <span>{step.baseCostGp.toLocaleString()} gp</span>
              <span>{step.days} Days</span>
            </div>
          {/each}
        </div>
      </div>

      <!-- Treasury Management Sub-panel -->
      <div class="p-3.5 rounded-xl bg-slate-900/70 border border-slate-800 space-y-2">
        <span class="text-xs font-bold text-slate-300">Treasury Vault Management</span>
        <div class="flex items-center gap-2">
          <input
            type="number"
            bind:value={depositAmount}
            class="flex-1 bg-slate-950 border border-slate-700 rounded-lg px-2 py-1 text-xs font-mono text-slate-200"
            placeholder="Amount gp…"
          />
          <button
            onclick={depositTreasury}
            class="px-2.5 py-1 bg-emerald-700 hover:bg-emerald-600 text-white rounded-lg text-xs font-bold transition-colors"
          >
            Deposit
          </button>
          <button
            onclick={() => withdrawTreasury(depositAmount)}
            class="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-bold transition-colors"
          >
            Withdraw
          </button>
        </div>
      </div>
    </div>

    <!-- ═══════════════════════════════════════════════════════════════════════
         COLUMN 2: MODULAR FACILITIES (ALCHEMY LAB, FORGE, CHAPEL, VAULT, WATCHTOWER)
    ════════════════════════════════════════════════════════════════════════ -->
    <div class="p-5 space-y-4 overflow-y-auto">
      <div class="flex items-center justify-between">
        <h3 class="text-xs font-black uppercase tracking-wider text-slate-200 flex items-center gap-1.5">
          <span>🏛️</span> Modular Facilities
        </h3>
        <span class="text-[10px] font-bold text-amber-400 font-mono">
          {availableRp} RP Available
        </span>
      </div>

      <div class="space-y-3">
        {#each Object.values(FACILITIES) as fac}
          {@const isBuilt = state.facilities.includes(fac.id)}
          <div class="p-3.5 rounded-2xl border transition-all {isBuilt
            ? 'bg-indigo-950/20 border-indigo-600/70 shadow-md shadow-indigo-950/20'
            : 'bg-slate-900 border-slate-800 opacity-80 hover:opacity-100'}">

            <div class="flex items-center justify-between mb-1.5">
              <div class="flex items-center gap-2">
                <span class="text-xl">{fac.icon}</span>
                <div>
                  <h4 class="text-xs font-black text-slate-100">{fac.name}</h4>
                  <span class="text-[10px] font-mono text-slate-400">{fac.rpCost} Room Point</span>
                </div>
              </div>

              {#if isBuilt}
                {#if desertionAudit.isDesertionTriggered}
                  <span class="px-2 py-0.5 rounded-full text-[9px] font-black bg-rose-950 text-rose-300 border border-rose-700/60 flex items-center gap-1 animate-pulse">
                    <span class="w-1.5 h-1.5 rounded-full bg-rose-400"></span>
                    DESERTED (OFFLINE)
                  </span>
                {:else}
                  <span class="px-2 py-0.5 rounded-full text-[9px] font-black bg-emerald-950 text-emerald-300 border border-emerald-700/60 flex items-center gap-1">
                    <span class="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                    OPERATIONAL
                  </span>
                {/if}
              {:else}
                <span class="text-[10px] text-slate-500 font-mono">Unbuilt</span>
              {/if}
            </div>

            <p class="text-[11px] text-slate-400 mb-2 leading-relaxed">{fac.description}</p>

            <!-- Benefit highlight -->
            <div class="p-2 rounded-lg bg-slate-950/80 border border-slate-800/80 text-[10px] text-slate-300 mb-2.5">
              <strong class="text-amber-300">Aleamos Benefit:</strong> {fac.benefit}
            </div>

            <!-- Action button -->
            <div class="flex items-center justify-between pt-1 border-t border-slate-800/60">
              <span class="text-[10px] text-slate-500">
                Staff: {fac.recommendedSkilledHirelings} Skilled, {fac.recommendedUnskilledHirelings} Unskilled
              </span>

              {#if isBuilt}
                <button
                  onclick={() => demolishFacility(fac.id)}
                  class="px-2.5 py-1 bg-rose-950/50 hover:bg-rose-900/60 text-rose-300 text-[10px] font-bold rounded-lg border border-rose-800/50 transition-colors"
                >
                  Decommission
                </button>
              {:else}
                <button
                  onclick={() => constructFacility(fac.id)}
                  disabled={availableRp < fac.rpCost}
                  class="px-3 py-1 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-30 text-white text-[10px] font-bold rounded-lg transition-all shadow-sm shadow-indigo-600/30"
                >
                  + Build Facility (1 RP)
                </button>
              {/if}
            </div>
          </div>
        {/each}
      </div>
    </div>

    <!-- ═══════════════════════════════════════════════════════════════════════
         COLUMN 3: PAYROLL & DESERTION AUDITOR
    ════════════════════════════════════════════════════════════════════════ -->
    <div class="p-5 space-y-5 overflow-y-auto">
      <div class="flex items-center justify-between">
        <h3 class="text-xs font-black uppercase tracking-wider text-slate-200 flex items-center gap-1.5">
          <span>⚖️</span> Payroll &amp; Desertion Auditor
        </h3>
        <span class="text-[10px] font-bold text-slate-400 font-mono">Daily / Monthly Run</span>
      </div>

      <!-- Staffing Roster Controls -->
      <div class="space-y-3 bg-slate-900 p-4 rounded-2xl border border-slate-800">
        <div class="flex items-center justify-between text-[11px] pb-2 border-b border-slate-800/80">
          <span class="text-slate-400 font-medium">Formula Target ({state.currentRp} RP):</span>
          <div class="flex items-center gap-2">
            <span class="font-mono font-bold text-amber-300">
              {staffingRequirements.recommendedSkilled} Skilled · {staffingRequirements.recommendedUnskilled} Unskilled
            </span>
            <button
              onclick={() => {
                state.skilledHirelingsCount = staffingRequirements.recommendedSkilled;
                state.unskilledHirelingsCount = staffingRequirements.recommendedUnskilled;
                saveState();
                flash('Staffing aligned with codified RP formula.');
              }}
              class="px-2 py-0.5 bg-indigo-950 hover:bg-indigo-900 text-indigo-300 border border-indigo-700/60 rounded text-[9px] font-bold"
              title="Snap staff count to codified RP requirements"
            >
              Align to Formula
            </button>
          </div>
        </div>

        <!-- Skilled Hirelings -->
        <div class="flex items-center justify-between">
          <div>
            <span class="text-xs font-bold text-slate-200">Skilled Hirelings</span>
            <p class="text-[10px] text-slate-400">2.0 gp/day each (Alchemists, Smiths, Priests, Guards)</p>
          </div>
          <div class="flex items-center gap-1.5">
            <button
              onclick={() => { if (state.skilledHirelingsCount > 0) { state.skilledHirelingsCount--; saveState(); } }}
              class="w-6 h-6 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold"
            >-</button>
            <span class="w-8 text-center font-mono font-bold text-sm text-amber-300">{state.skilledHirelingsCount}</span>
            <button
              onclick={() => { state.skilledHirelingsCount++; saveState(); }}
              class="w-6 h-6 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold"
            >+</button>
          </div>
        </div>

        <!-- Unskilled Hirelings -->
        <div class="flex items-center justify-between pt-2 border-t border-slate-800/80">
          <div>
            <span class="text-xs font-bold text-slate-200">Unskilled Laborers</span>
            <p class="text-[10px] text-slate-400">0.2 gp (2 sp)/day each (Laborers, Porters, Servants)</p>
          </div>
          <div class="flex items-center gap-1.5">
            <button
              onclick={() => { if (state.unskilledHirelingsCount > 0) { state.unskilledHirelingsCount--; saveState(); } }}
              class="w-6 h-6 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold"
            >-</button>
            <span class="w-8 text-center font-mono font-bold text-sm text-slate-200">{state.unskilledHirelingsCount}</span>
            <button
              onclick={() => { state.unskilledHirelingsCount++; saveState(); }}
              class="w-6 h-6 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold"
            >+</button>
          </div>
        </div>
      </div>

      <!-- Financial Calculations Card -->
      <div class="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-2.5">
        <div class="flex items-center justify-between text-xs">
          <span class="text-slate-400">Daily Payroll Burn:</span>
          <span class="font-mono font-bold text-slate-200">{payroll.totalDailyGp} gp / day</span>
        </div>
        <div class="flex items-center justify-between text-xs">
          <span class="text-slate-400">Monthly Run Rate (30 days):</span>
          <span class="font-mono font-black text-amber-400">{payroll.totalMonthlyGp} gp / month</span>
        </div>
        <div class="flex items-center justify-between text-xs pt-2 border-t border-slate-800">
          <span class="text-slate-400">Days Unpaid:</span>
          <span class="font-mono font-black {state.daysUnpaid > 0 ? 'text-rose-400' : 'text-emerald-400'}">
            {state.daysUnpaid} Days
          </span>
        </div>
      </div>

      <!-- Desertion Warning Banner -->
      <div class="p-4 rounded-2xl border space-y-2 {
        desertionAudit.status === 'Loyal' ? 'bg-emerald-950/20 border-emerald-800/50' :
        desertionAudit.status === 'Warning' ? 'bg-amber-950/30 border-amber-700/60' :
        desertionAudit.status === 'Critical' ? 'bg-orange-950/50 border-orange-600' :
        'bg-rose-950/70 border-rose-600 animate-pulse'
      }">
        <div class="flex items-center gap-2">
          <span class="text-xl">
            {desertionAudit.status === 'Loyal' ? '✓' : desertionAudit.status === 'Deserted' ? '☠️' : '⚠️'}
          </span>
          <span class="text-xs font-black uppercase text-slate-100">{desertionAudit.status} Status</span>
        </div>
        <p class="text-[11px] leading-relaxed {desertionAudit.status === 'Loyal' ? 'text-emerald-200' : 'text-slate-300'}">
          {desertionAudit.warningMessage}
        </p>
      </div>

      <!-- Payroll Action Buttons -->
      <div class="space-y-2 pt-1">
        <button
          onclick={() => payPayrollDays(1)}
          disabled={state.treasuryGp < payroll.totalDailyGp}
          class="w-full py-2 bg-emerald-700 hover:bg-emerald-600 disabled:opacity-30 text-white text-xs font-bold rounded-xl transition-all shadow-md shadow-emerald-700/20 flex items-center justify-center gap-1.5"
        >
          <span>💰</span> Disburse 1 Day ({payroll.totalDailyGp} gp)
        </button>

        <button
          onclick={() => payPayrollDays(30)}
          disabled={state.treasuryGp < payroll.totalMonthlyGp}
          class="w-full py-2 bg-indigo-700 hover:bg-indigo-600 disabled:opacity-30 text-white text-xs font-bold rounded-xl transition-all shadow-md shadow-indigo-700/20 flex items-center justify-center gap-1.5"
        >
          <span>📅</span> Disburse 30 Days ({payroll.totalMonthlyGp} gp)
        </button>

        <button
          onclick={advanceUnpaidDay}
          class="w-full py-1.5 bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-slate-200 text-xs font-medium rounded-xl border border-slate-800 transition-colors"
          title="Simulate unpaid day progression"
        >
          Advance 1 Day Unpaid (Audit Risk)
        </button>
      </div>
    </div>

  </div>

</div>
