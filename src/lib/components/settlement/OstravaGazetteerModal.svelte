<script lang="ts">
  import { onMount } from 'svelte';
  import type {
    SettlementProfile,
    SettlementContract,
    SettlementDemographics,
    PrecursorUnderRuins,
    EconomicEnforcement,
    MunicipalLaws,
  } from '../../../types/settlement';
  import { dispatchSoundEvent } from '../../audio/soundboardBridge';
  import Icons from '../../../components/Icons.svelte';

  let {
    isOpen = $bindable(false),
    onClose,
  }: {
    isOpen: boolean;
    onClose?: () => void;
  } = $props();

  let profile = $state<SettlementProfile | null>(null);
  let contracts = $state<SettlementContract[]>([]);
  let activeTab: 'overview' | 'ruins' | 'contracts' | 'laws' = $state('overview');
  let isLoading = $state(true);

  onMount(async () => {
    await loadSettlementData();
  });

  async function loadSettlementData() {
    try {
      const res = await fetch('/api/settlements/ostrava');
      if (res.ok) {
        const data = await res.json();
        profile = data.profile;
        contracts = data.contracts;
      }
    } catch (err) {
      console.error('Failed loading Ostrava settlement profile:', err);
    } finally {
      isLoading = false;
    }
  }

  let demographics = $derived<SettlementDemographics | null>(() => {
    if (!profile?.demographics_json) return null;
    try {
      return JSON.parse(profile.demographics_json);
    } catch {
      return null;
    }
  });

  let underRuins = $derived<PrecursorUnderRuins | null>(() => {
    if (!profile?.precursor_under_ruins_json) return null;
    try {
      return JSON.parse(profile.precursor_under_ruins_json);
    } catch {
      return null;
    }
  });

  let economics = $derived<EconomicEnforcement | null>(() => {
    if (!profile?.economic_enforcement_json) return null;
    try {
      return JSON.parse(profile.economic_enforcement_json);
    } catch {
      return null;
    }
  });

  let laws = $derived<MunicipalLaws | null>(() => {
    if (!profile?.municipal_laws_json) return null;
    try {
      return JSON.parse(profile.municipal_laws_json);
    } catch {
      return null;
    }
  });

  function getCategoryColor(category: string): string {
    switch (category) {
      case 'Exploration':
        return 'bg-blue-950/80 border-blue-500/50 text-blue-300';
      case 'Hunt':
        return 'bg-red-950/80 border-red-500/50 text-red-300';
      case 'Protection':
        return 'bg-amber-950/80 border-amber-500/50 text-amber-300';
      case 'Resource Gathering':
        return 'bg-emerald-950/80 border-emerald-500/50 text-emerald-300';
      case 'Find':
        return 'bg-purple-950/80 border-purple-500/50 text-purple-300';
      default:
        return 'bg-slate-800 border-slate-700 text-slate-300';
    }
  }
</script>

{#if isOpen}
  <div class="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/80 backdrop-blur-md">
    <div class="bg-dark-900 border border-dark-700/90 rounded-3xl w-full max-w-5xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
      <!-- Header -->
      <div class="px-6 py-4 bg-dark-950 border-b border-dark-800 flex items-center justify-between">
        <div class="flex items-center gap-3">
          <div class="w-10 h-10 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
            <Icons name="shield" size={22} />
          </div>
          <div>
            <div class="flex items-center gap-2">
              <h2 class="text-base font-black text-slate-100 uppercase tracking-tight">
                Settlement Profile: {profile?.name ?? 'Ostrava'}
              </h2>
              <span class="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40 text-[10px] font-bold uppercase font-mono">
                Trade Port &bull; Pop. {profile?.population_count.toLocaleString() ?? '18,400'}
              </span>
            </div>
            <p class="text-xs text-slate-400">
              {profile?.region ?? 'Graywood Reach & Rucean Bay'} &bull; Official Gazetteer &amp; Compendium Record
            </p>
          </div>
        </div>

        <button
          onclick={() => {
            isOpen = false;
            if (onClose) onClose();
          }}
          class="w-8 h-8 rounded-xl bg-dark-800 hover:bg-dark-700 border border-dark-700 text-slate-300 flex items-center justify-center text-sm font-bold transition-colors"
        >
          &times;
        </button>
      </div>

      <!-- Navigation Tabs -->
      <div class="px-6 pt-3 bg-dark-950/60 border-b border-dark-800 flex items-center gap-2 overflow-x-auto">
        <button
          onclick={() => (activeTab = 'overview')}
          class="pb-2.5 px-3 text-xs font-bold transition-all border-b-2 {
            activeTab === 'overview'
              ? 'border-amber-500 text-amber-400'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }"
        >
          Demographics &amp; Governance
        </button>
        <button
          onclick={() => (activeTab = 'ruins')}
          class="pb-2.5 px-3 text-xs font-bold transition-all border-b-2 {
            activeTab === 'ruins'
              ? 'border-amber-500 text-amber-400'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }"
        >
          Precursor Under-Ruins
        </button>
        <button
          onclick={() => (activeTab = 'contracts')}
          class="pb-2.5 px-3 text-xs font-bold transition-all border-b-2 flex items-center gap-1.5 {
            activeTab === 'contracts'
              ? 'border-amber-500 text-amber-400'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }"
        >
          <span>Notice Board Calamities</span>
          <span class="px-1.5 py-0.2 rounded-full bg-amber-500 text-black text-[10px] font-black">
            {contracts.length}
          </span>
        </button>
        <button
          onclick={() => (activeTab = 'laws')}
          class="pb-2.5 px-3 text-xs font-bold transition-all border-b-2 {
            activeTab === 'laws'
              ? 'border-amber-500 text-amber-400'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }"
        >
          Assay Tariff (10%) &amp; Peace-Bonding
        </button>
      </div>

      <!-- Content Area -->
      <div class="flex-1 overflow-y-auto p-6 space-y-6">
        {#if isLoading}
          <div class="py-12 text-center text-slate-400 flex flex-col items-center justify-center">
            <div class="w-8 h-8 border-2 border-amber-500 border-t-transparent rounded-full animate-spin mb-3"></div>
            <span>Loading Ostrava compendium profile...</span>
          </div>
        {:else if activeTab === 'overview'}
          <!-- TAB 1: Demographics & Governance -->
          <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
            <!-- Left: Governance & Security -->
            <div class="space-y-4">
              <div class="bg-dark-950/80 border border-dark-800 rounded-2xl p-4">
                <h3 class="text-xs font-black text-amber-400 uppercase tracking-wider mb-2">
                  Municipal Governance
                </h3>
                <h4 class="font-bold text-sm text-slate-100 mb-1">
                  {profile?.governance_title}
                </h4>
                <p class="text-xs text-slate-300 leading-relaxed">
                  {profile?.governance_details}
                </p>
              </div>

              <div class="bg-dark-950/80 border border-dark-800 rounded-2xl p-4">
                <h3 class="text-xs font-black text-blue-400 uppercase tracking-wider mb-2">
                  Security &amp; Military Posture
                </h3>
                <p class="text-xs text-slate-300 leading-relaxed">
                  {profile?.security_posture}
                </p>
              </div>
            </div>

            <!-- Right: Population & Quarters -->
            <div class="space-y-4">
              {#if demographics}
                <div class="bg-dark-950/80 border border-dark-800 rounded-2xl p-4">
                  <h3 class="text-xs font-black text-slate-100 uppercase tracking-wider mb-3">
                    Demographic Split ({demographics.permanent_residents.toLocaleString()} Residents &bull; {demographics.transient_sailors_merchants.toLocaleString()} Transient)
                  </h3>

                  <div class="space-y-2 text-xs">
                    <div>
                      <div class="flex justify-between text-slate-300 mb-1">
                        <span>Human (Chancellery &amp; Coastland)</span>
                        <strong>{demographics.human_percentage}%</strong>
                      </div>
                      <div class="w-full h-1.5 rounded-full bg-dark-900 overflow-hidden">
                        <div class="h-full bg-amber-500" style="width: {demographics.human_percentage}%"></div>
                      </div>
                    </div>

                    <div>
                      <div class="flex justify-between text-slate-300 mb-1">
                        <span>Coastal Dwarves (Foundry &amp; Masonry)</span>
                        <strong>{demographics.coastal_dwarf_percentage}%</strong>
                      </div>
                      <div class="w-full h-1.5 rounded-full bg-dark-900 overflow-hidden">
                        <div class="h-full bg-blue-500" style="width: {demographics.coastal_dwarf_percentage}%"></div>
                      </div>
                    </div>

                    <div>
                      <div class="flex justify-between text-slate-300 mb-1">
                        <span>Halflings &amp; Gnomes (Pilots &amp; Logistics)</span>
                        <strong>{demographics.halfling_gnome_percentage}%</strong>
                      </div>
                      <div class="w-full h-1.5 rounded-full bg-dark-900 overflow-hidden">
                        <div class="h-full bg-emerald-500" style="width: {demographics.halfling_gnome_percentage}%"></div>
                      </div>
                    </div>

                    <div>
                      <div class="flex justify-between text-slate-300 mb-1">
                        <span>Half-Elves &amp; Others</span>
                        <strong>{demographics.half_elf_percentage + demographics.tiefling_other_percentage}%</strong>
                      </div>
                      <div class="w-full h-1.5 rounded-full bg-dark-900 overflow-hidden">
                        <div class="h-full bg-purple-500" style="width: {demographics.half_elf_percentage + demographics.tiefling_other_percentage}%"></div>
                      </div>
                    </div>
                  </div>
                </div>

                <!-- Major Quarters -->
                <div class="bg-dark-950/80 border border-dark-800 rounded-2xl p-4">
                  <h3 class="text-xs font-black text-slate-100 uppercase tracking-wider mb-2">
                    Municipal Quarters &amp; Districts
                  </h3>
                  <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {#each demographics.major_quarters as quarter}
                      <div class="p-2.5 rounded-xl bg-dark-900 border border-dark-800">
                        <span class="font-bold text-xs text-amber-400 block">{quarter.name}</span>
                        <span class="text-[11px] text-slate-400">{quarter.role}</span>
                      </div>
                    {/each}
                  </div>
                </div>
              {/if}
            </div>
          </div>
        {:else if activeTab === 'ruins'}
          <!-- TAB 2: Precursor Under-Ruins -->
          {#if underRuins}
            <div class="space-y-5">
              <div class="bg-dark-950/80 border border-purple-500/40 rounded-2xl p-4 shadow-lg">
                <div class="flex items-center gap-2 mb-1">
                  <Icons name="sparkles" size={16} class="text-purple-400" />
                  <h3 class="text-sm font-black text-purple-300 uppercase tracking-tight">
                    {underRuins.title}
                  </h3>
                </div>
                <p class="text-xs text-slate-300 leading-relaxed">
                  {underRuins.origin}
                </p>

                <div class="mt-3 pt-3 border-t border-dark-800">
                  <span class="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1.5">
                    Known Ingress / Access Portals
                  </span>
                  <ul class="space-y-1">
                    {#each underRuins.access_points as access}
                      <li class="text-xs text-slate-300 flex items-center gap-1.5 font-mono">
                        <span class="text-amber-400 font-bold">&rsaquo;</span> {access}
                      </li>
                    {/each}
                  </ul>
                </div>
              </div>

              <!-- Depth Strata Cards -->
              <div>
                <h4 class="text-xs font-black text-slate-200 uppercase tracking-wider mb-3">
                  Subterranean Depth Strata
                </h4>
                <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
                  {#each underRuins.depth_strata as strata}
                    <div class="bg-dark-950/80 border border-dark-800 rounded-2xl p-4 flex flex-col justify-between">
                      <div>
                        <div class="flex items-center justify-between mb-1">
                          <span class="font-mono text-xs font-bold text-purple-400">Level {strata.level}</span>
                          <span class="px-1.5 py-0.5 rounded bg-dark-800 text-[10px] text-slate-400 font-bold">Sub-Port Depth</span>
                        </div>
                        <h5 class="font-bold text-sm text-slate-100 mb-2">{strata.name}</h5>

                        <div class="space-y-2 text-xs">
                          <div>
                            <span class="text-[10px] font-bold text-red-400 uppercase block">Hazards &amp; Fauna:</span>
                            <p class="text-slate-400 leading-snug">{strata.danger}</p>
                          </div>
                          <div>
                            <span class="text-[10px] font-bold text-emerald-400 uppercase block">Relics &amp; Salvage:</span>
                            <p class="text-slate-400 leading-snug">{strata.relics}</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  {/each}
                </div>
              </div>

              <!-- Active DM Hooks -->
              <div class="bg-dark-950/80 border border-dark-800 rounded-2xl p-4">
                <h4 class="text-xs font-black text-amber-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                  <Icons name="alert-triangle" size={14} /> Active Delve Calamity Hooks
                </h4>
                <div class="space-y-2">
                  {#each underRuins.current_dm_hooks as hook}
                    <div class="p-3 bg-dark-900 rounded-xl border border-dark-800 text-xs text-slate-300 leading-relaxed">
                      {hook}
                    </div>
                  {/each}
                </div>
              </div>
            </div>
          {/if}
        {:else if activeTab === 'contracts'}
          <!-- TAB 3: Notice Board Contracts (5 Level-4 Contracts) -->
          <div class="space-y-4">
            <div class="flex items-center justify-between">
              <div>
                <h3 class="text-xs font-black text-slate-100 uppercase tracking-wider">
                  Active Regional Notice Board (Level 4 Adventurers)
                </h3>
                <p class="text-xs text-slate-400">
                  All contracts enforce a strict 10-day (240-hour) completion timer from issuance.
                </p>
              </div>
              <span class="text-xs font-mono text-amber-400 font-bold">
                Bailiff Bounty Seal Verified
              </span>
            </div>

            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
              {#each contracts as contract}
                <div class="bg-dark-950/80 border border-dark-800 hover:border-amber-500/50 rounded-2xl p-4 flex flex-col justify-between transition-all">
                  <div>
                    <div class="flex items-start justify-between gap-2 mb-1.5">
                      <h4 class="font-bold text-sm text-slate-100 leading-snug">
                        {contract.title}
                      </h4>
                      <span class="px-2 py-0.5 rounded-md border text-[10px] font-bold shrink-0 {getCategoryColor(contract.category)}">
                        {contract.category}
                      </span>
                    </div>

                    <span class="text-[11px] font-mono text-amber-400 block mb-2">
                      Location: {contract.target_location}
                    </span>

                    <p class="text-xs text-slate-300 leading-relaxed mb-4">
                      {contract.description}
                    </p>
                  </div>

                  <div class="pt-3 border-t border-dark-850 flex items-center justify-between text-xs">
                    <div class="flex items-center gap-3">
                      <span class="font-bold text-amber-400 font-mono flex items-center gap-1">
                        <Icons name="award" size={14} /> {contract.reward_gold} gp
                      </span>
                      <span class="font-bold text-blue-400 font-mono">
                        +{contract.reward_rp} RP
                      </span>
                    </div>

                    <div class="flex items-center gap-2 font-mono text-[11px] text-slate-400">
                      <span>Level {contract.min_level}</span>
                      <span>&bull;</span>
                      <span class="text-emerald-400 font-bold">{contract.expiration_days}d Timer</span>
                    </div>
                  </div>
                </div>
              {/each}
            </div>
          </div>
        {:else}
          <!-- TAB 4: Laws & 10% Currency Assay -->
          <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
            <!-- 10% Currency Assay Tariff Card -->
            {#if economics}
              <div class="bg-dark-950/80 border border-amber-500/40 rounded-2xl p-5 shadow-xl space-y-4">
                <div class="flex items-center gap-2">
                  <Icons name="award" size={20} class="text-amber-400" />
                  <h3 class="text-sm font-black text-amber-300 uppercase tracking-tight">
                    Mandatory 10% Currency Assay Tariff
                  </h3>
                </div>

                <div class="bg-dark-900 border border-dark-800 rounded-xl p-3 text-xs space-y-1 font-mono">
                  <div class="text-slate-300">
                    <span class="text-slate-500">Domestic Tender:</span> {economics.regulated_currencies.domestic_tender}
                  </div>
                  <div class="text-slate-300">
                    <span class="text-slate-500">Foreign Tender:</span> {economics.regulated_currencies.foreign_tender}
                  </div>
                  <div class="text-amber-400 font-bold pt-1 border-t border-dark-800">
                    Standard: {economics.currency_exchange_standard}
                  </div>
                </div>

                <p class="text-xs text-slate-300 leading-relaxed">
                  {economics.assay_rules}
                </p>

                <div class="text-[11px] text-slate-400 font-mono">
                  {economics.banking_hours}
                </div>
              </div>
            {/if}

            <!-- Municipal Weapon Peace-Bonding Laws -->
            {#if laws}
              <div class="bg-dark-950/80 border border-dark-800 rounded-2xl p-5 shadow-xl space-y-4">
                <div class="flex items-center gap-2">
                  <Icons name="sword" size={20} class="text-blue-400" />
                  <h3 class="text-sm font-black text-slate-100 uppercase tracking-tight">
                    Municipal Weapon Peace-Bonding Laws
                  </h3>
                </div>

                <div class="bg-dark-900 border border-dark-800 rounded-xl p-3 text-xs space-y-2">
                  <p class="text-slate-200 font-semibold">
                    {laws.weapon_peace_bonding.rule}
                  </p>
                  <p class="text-slate-400">
                    <strong class="text-slate-300">Method:</strong> {laws.weapon_peace_bonding.bonding_method}
                  </p>
                  <p class="text-red-300 font-mono text-[11px] pt-1 border-t border-dark-800">
                    <strong class="text-red-400">Penalty:</strong> {laws.weapon_peace_bonding.penalty_for_broken_seal}
                  </p>
                </div>

                <div>
                  <h4 class="text-xs font-black text-slate-400 uppercase tracking-wider mb-2">
                    Contraband &amp; Municipal Ordinances
                  </h4>
                  <ul class="space-y-1.5">
                    {#each laws.contraband_laws as law}
                      <li class="text-xs text-slate-300 flex items-start gap-1.5">
                        <span class="text-red-400 font-bold mt-0.5">&bull;</span> {law}
                      </li>
                    {/each}
                  </ul>
                </div>
              </div>
            {/if}
          </div>
        {/if}
      </div>
    </div>
  </div>
{/if}
