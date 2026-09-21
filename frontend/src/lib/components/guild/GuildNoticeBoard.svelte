<!-- GuildNoticeBoard.svelte — Procedural Guild Contract Generator & Adventurers' Guild Headquarters -->
<script module lang="ts">
  export type ContractType = 'Exploration' | 'Hunt' | 'Protection' | 'Resource Gathering' | 'Find';
  export type GuildRank = 'Apprentice' | 'Journeyman' | 'Adept' | 'Master' | 'Grandmaster';

  export interface GuildContract {
    id: string;
    title: string;
    classification: ContractType;
    client: string;
    description: string;
    destination: string; // Regional destination
    rewardGp: number;
    escrowDepositedGp: number; // 100% upfront escrow
    deadlineDays: number; // Standard 5e duration: 7, 14, or 30 days
    daysRemaining: number;
    reputationGain: number;
    minRank: GuildRank;
    status: 'Available' | 'Accepted' | 'Completed' | 'Failed';
    objectives: string[];
  }

  export type NoticeContract = GuildContract;

  export interface GuildProfile {
    rank: GuildRank;
    reputation: number;
    monthlyDuesGp: number; // 5 gp / month
    requisitionAllowanceGp: number;
    lastDuesPaidEpochDay: number;
    totalCompletedContracts: number;
  }
</script>

<script lang="ts">
  import { onMount } from 'svelte';
  import { audioEngine } from '../../audio/AudioEngine';
  import { sessionStore } from '../../../stores/sessionStore';

  const STORAGE_CONTRACTS_KEY = 'vtt_guild_contracts';
  const STORAGE_PROFILE_KEY = 'vtt_guild_profile';

  const RANK_REQUIREMENTS: Record<GuildRank, { minRep: number; allowanceGp: number }> = {
    Apprentice: { minRep: 0, allowanceGp: 50 },
    Journeyman: { minRep: 50, allowanceGp: 200 },
    Adept: { minRep: 150, allowanceGp: 500 },
    Master: { minRep: 300, allowanceGp: 1500 },
    Grandmaster: { minRep: 600, allowanceGp: 5000 },
  };

  const CONTRACT_BADGES: Record<ContractType, { badgeBg: string; border: string; text: string; icon: string }> = {
    Exploration: { badgeBg: 'bg-emerald-950/70', border: 'border-emerald-700/60', text: 'text-emerald-300', icon: '🧭' },
    Hunt: { badgeBg: 'bg-rose-950/70', border: 'border-rose-700/60', text: 'text-rose-300', icon: '🏹' },
    Protection: { badgeBg: 'bg-amber-950/70', border: 'border-amber-700/60', text: 'text-amber-300', icon: '🛡️' },
    'Resource Gathering': { badgeBg: 'bg-cyan-950/70', border: 'border-cyan-700/60', text: 'text-cyan-300', icon: '🌿' },
    Find: { badgeBg: 'bg-purple-950/70', border: 'border-purple-700/60', text: 'text-purple-300', icon: '🔍' },
  };

  // State (STRICT ZERO-MOCK INITIALIZATION)
  let notices = $state<NoticeContract[]>([]);
  let contracts = $state<GuildContract[]>([]);
  $effect(() => {
    notices = contracts;
  });

  let profile = $state<GuildProfile>({
    rank: 'Journeyman',
    reputation: 65,
    monthlyDuesGp: 5,
    requisitionAllowanceGp: 200,
    lastDuesPaidEpochDay: 1,
    totalCompletedContracts: 4,
  });

  let activeFilter = $state<ContractType | 'All'>('All');
  let selectedContract = $state<GuildContract | null>(null);

  // Settlement Selection (Capital City / Frontier Town / Coastal Village / Custom)
  let settlementPreset = $state<'Capital City' | 'Frontier Town' | 'Coastal Village' | 'Custom'>('Capital City');
  let customSettlementName = $state<string>('');
  let activeSettlement = $derived(settlementPreset === 'Custom' ? (customSettlementName.trim() || 'Frontier Outpost') : settlementPreset);

  function loadState() {
    try {
      const rawC = localStorage.getItem(STORAGE_CONTRACTS_KEY);
      if (rawC) {
        const parsed = JSON.parse(rawC);
        // Purge legacy mock contracts
        contracts = parsed.filter((c: any) =>
          !c.title?.includes('Bloodhorn Chimera') &&
          !c.title?.includes('Pyric Sulfur') &&
          !c.title?.includes('Sunken Amphitheater') &&
          !c.title?.includes('Alchemical Reagents') &&
          !c.title?.includes('House Vane') &&
          !c.client?.includes('House Vane') &&
          !c.client?.includes('Temple Scribes of the Dawn') &&
          !c.client?.includes('Temple Scribes') &&
          !c.client?.includes('Master Apothecary Corvus') &&
          !c.client?.includes('Merchants & Traders Guild')
        );
      } else {
        contracts = [];
      }

      const rawP = localStorage.getItem(STORAGE_PROFILE_KEY);
      if (rawP) profile = JSON.parse(rawP);
    } catch {
      contracts = [];
    }
  }

  function saveState() {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(STORAGE_CONTRACTS_KEY, JSON.stringify(contracts));
    localStorage.setItem(STORAGE_PROFILE_KEY, JSON.stringify(profile));
  }

  onMount(() => {
    loadState();
  });

  // ── Procedural Generator Templates (Neutral 5e SRD) ─────────────────────────
  const PROCEDURAL_POOLS = {
    clients: [
      'Town Merchant Consortium', 'Miners Guild Syndicate', 'Town Watch High Command',
      'The Arcane Archive', 'Temple of the Dawn', 'Master Herbalist Conclave',
      'The Municipal Council', 'Dockmaster & Harbor Guild', 'Order of the Golden Scale'
    ],
    destinations: [
      'Weeping Mire — Sector 4', 'Sunken Crypts of the Ancients', 'Basalt Foothills',
      'Whispering Pines — Eastern Verge', 'Shattered Crags Post 3', 'Old Aqueducts',
      'Black Hollow Barrows', 'Ruins of the Border Bastion', 'Serpent Coast Shallows'
    ],
    huntMonsters: [
      { name: 'Chimera', cr: 6, reward: 450 },
      { name: 'Basilisk Broodmother', cr: 5, reward: 350 },
      { name: 'Owlbear Pack', cr: 4, reward: 250 },
      { name: 'Wyvern', cr: 7, reward: 600 },
      { name: 'Gorgon of the Vale', cr: 5, reward: 380 },
    ],
    explorationSites: [
      { name: 'Subterranean Sunken Caverns', objective: 'Survey and map all navigable subterranean chambers' },
      { name: 'Flooded Catacombs', objective: 'Chart secret corridors and locate structural breach points' },
      { name: 'Old Watchtower Spire', objective: 'Clear upper parapet and establish signal lantern beacon' },
    ],
    resources: [
      { name: 'Rare Grave Lotus (x10)', objective: 'Harvest undisturbed blossoms from cemetery soil under moonlight' },
      { name: 'Pure Mineral Salt Nodes (x6)', objective: 'Extract intact mineral nodes from cavern walls' },
      { name: 'Wyvern Venom Sample', objective: 'Collect uncoagulated essence in lead-lined alchemical phial' },
    ],
    protectionClients: [
      { cargo: 'Merchant Trade Caravan', route: 'High Road to Crossroads', reward: 300 },
      { cargo: 'Silver Bar Ingot Waybill', route: 'Smelter Way to Vault', reward: 400 },
      { cargo: 'Archivist Scholarly Expedition', route: 'Ancient Standing Stones', reward: 250 },
    ],
    findArtifacts: [
      { item: 'Ancient Planar Astrolabe', reward: 500, desc: 'A lost mechanical navigation device.' },
      { item: 'Smuggler Tariff Ledger', reward: 200, desc: 'Stolen accounting records detailing illicit tariffs.' },
      { item: 'Ancient Council Signet Ring', reward: 350, desc: 'Heirloom lost in goblin-infested scrublands.' },
    ],
  };

  function generateContract(type?: ContractType): GuildContract {
    const types: ContractType[] = ['Exploration', 'Hunt', 'Protection', 'Resource Gathering', 'Find'];
    const chosenType = type || types[Math.floor(Math.random() * types.length)];
    const client = PROCEDURAL_POOLS.clients[Math.floor(Math.random() * PROCEDURAL_POOLS.clients.length)];
    const baseDest = PROCEDURAL_POOLS.destinations[Math.floor(Math.random() * PROCEDURAL_POOLS.destinations.length)];
    const destination = `${baseDest} (${activeSettlement})`;
    const id = `contract-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

    let title = '';
    let description = '';
    let rewardGp = 200;
    let objectives: string[] = [];
    let minRank: GuildRank = 'Apprentice';

    switch (chosenType) {
      case 'Hunt': {
        const monster = PROCEDURAL_POOLS.huntMonsters[Math.floor(Math.random() * PROCEDURAL_POOLS.huntMonsters.length)];
        title = `Bounty: Slay the ${monster.name}`;
        description = `Local caravans and scouts report sightings of a violent ${monster.name} preying along the transit corridors. Slay the creature and return proof of the kill.`;
        rewardGp = monster.reward;
        minRank = monster.cr >= 6 ? 'Master' : monster.cr >= 5 ? 'Adept' : 'Journeyman';
        objectives = [`Locate creature den in ${destination}`, `Defeat the ${monster.name}`, 'Deliver severed trophy to Guildmaster'];
        break;
      }
      case 'Exploration': {
        const site = PROCEDURAL_POOLS.explorationSites[Math.floor(Math.random() * PROCEDURAL_POOLS.explorationSites.length)];
        title = `Cartography Expedition: ${site.name}`;
        description = `The Guild requires an accurate geological and tactical map of ${site.name}. Identify defensive choke points and hazard areas.`;
        rewardGp = 250;
        minRank = 'Journeyman';
        objectives = [site.objective, 'Record elevation contours and water tables', 'Return annotated parchment survey to Guild Hall'];
        break;
      }
      case 'Protection': {
        const escort = PROCEDURAL_POOLS.protectionClients[Math.floor(Math.random() * PROCEDURAL_POOLS.protectionClients.length)];
        title = `Armed Escort: ${escort.cargo}`;
        description = `Provide defensive vanguard and rearguard security for a sensitive shipment along ${escort.route}. Bandit incursions are guaranteed.`;
        rewardGp = escort.reward;
        minRank = 'Adept';
        objectives = [`Rendezvous with transport master at ${destination}`, 'Protect all cargo wagons from damage or theft', 'Sign off receipt voucher with client receiver'];
        break;
      }
      case 'Resource Gathering': {
        const res = PROCEDURAL_POOLS.resources[Math.floor(Math.random() * PROCEDURAL_POOLS.resources.length)];
        title = `Requisition Order: ${res.name}`;
        description = `The Guild Alchemical Lab and town hospital urgently require raw specimen samples. Strict preservation guidelines apply.`;
        rewardGp = 180;
        minRank = 'Apprentice';
        objectives = [res.objective, 'Preserve organic samples against decay', 'Deliver specimens within 24 hours of extraction'];
        break;
      }
      case 'Find': {
        const artifact = PROCEDURAL_POOLS.findArtifacts[Math.floor(Math.random() * PROCEDURAL_POOLS.findArtifacts.length)];
        title = `Recovery Contract: ${artifact.item}`;
        description = `${client} has posted a certified recovery bounty for ${artifact.item}. ${artifact.desc}`;
        rewardGp = artifact.reward;
        minRank = 'Adept';
        objectives = [`Investigate last known sighting at ${destination}`, `Recover intact ${artifact.item}`, 'Deliver artifact to client in sealed lockbox'];
        break;
      }
    }

    return {
      id,
      title,
      classification: chosenType,
      client,
      description,
      destination,
      rewardGp,
      escrowDepositedGp: rewardGp, // 100% upfront escrow
      deadlineDays: 14,
      daysRemaining: 14,
      reputationGain: Math.floor(rewardGp / 10),
      minRank,
      status: 'Available',
      objectives,
    };
  }


  function postNewContract() {
    const c = generateContract();
    contracts = [c, ...contracts];
    saveState();
    audioEngine.triggerSfx('sfx-dice');
  }

  function acceptContract(c: GuildContract) {
    c.status = 'Accepted';
    contracts = [...contracts];
    saveState();
    audioEngine.triggerSfx('sfx-bell');
  }

  function completeContract(c: GuildContract) {
    c.status = 'Completed';
    profile.reputation += c.reputationGain;
    profile.totalCompletedContracts += 1;

    // Credit escrow payment into party stash
    sessionStore.addItemToPartyStash({
      name: `Escrow Payment: ${c.title}`,
      category: 'Currency Escrow',
      quantity: 1,
      weight: 0.1,
      description: `Certified guild treasury draft totaling ${c.rewardGp} gp paid for completion of contract ${c.id}.`,
      valueGp: c.rewardGp,
    });

    // Credit 100% escrow cash directly into party coin purse
    try {
      const rawCoins = localStorage.getItem('vtt_party_coins');
      const coins = rawCoins ? JSON.parse(rawCoins) : { pp: 0, gp: 500, ep: 0, sp: 200, cp: 50 };
      coins.gp = (coins.gp ?? 0) + c.rewardGp;
      localStorage.setItem('vtt_party_coins', JSON.stringify(coins));
      window.dispatchEvent(new CustomEvent('vtt:coins-updated', { detail: coins }));
    } catch {
      // ignore
    }

    // Check rank promotion
    checkRankPromotion();
    contracts = [...contracts];
    saveState();
    audioEngine.triggerSfx('sfx-critical');
  }

  function checkRankPromotion() {
    const ranks: GuildRank[] = ['Grandmaster', 'Master', 'Adept', 'Journeyman', 'Apprentice'];
    for (const r of ranks) {
      if (profile.reputation >= RANK_REQUIREMENTS[r].minRep) {
        if (profile.rank !== r) {
          profile.rank = r;
          profile.requisitionAllowanceGp = RANK_REQUIREMENTS[r].allowanceGp;
        }
        break;
      }
    }
  }

  function payMonthlyDues() {
    profile.monthlyDuesGp = 5;
    profile.lastDuesPaidEpochDay = Date.now();
    saveState();
    audioEngine.triggerSfx('sfx-bell');
  }

  let filteredContracts = $derived(
    activeFilter === 'All'
      ? contracts
      : contracts.filter(c => c.classification === activeFilter)
  );
</script>

<div class="h-full flex flex-col bg-slate-950 text-slate-100 overflow-hidden select-none">

  <!-- Header -->
  <header class="px-6 py-4 border-b border-slate-800 bg-slate-900/80 shrink-0 flex items-center justify-between">
    <div class="flex items-center gap-3">
      <div class="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500/20 to-indigo-500/20 border border-amber-500/30 flex items-center justify-center text-xl shadow-md">
        📋
      </div>
      <div>
        <h1 class="text-base font-black text-slate-100 uppercase tracking-wide flex items-center gap-2">
          <span>Adventurers' Guild Notice Board</span>
          <span class="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-amber-950 text-amber-300 border border-amber-700/60 font-mono">
            100% Upfront Escrow
          </span>
        </h1>
        <p class="text-xs text-slate-400">
          Certified mercenary contracts, bounty targets, and territorial exploration commissions.
        </p>
      </div>
    </div>

    <!-- Right Controls -->
    <div class="flex items-center gap-3">
      <!-- Settlement Selector -->
      <div class="flex items-center gap-1.5 bg-slate-950 border border-slate-800 rounded-xl px-2.5 py-1 text-xs">
        <span class="text-slate-500 font-bold uppercase text-[10px]">Settlement:</span>
        <select
          bind:value={settlementPreset}
          class="bg-transparent text-amber-300 font-bold text-xs focus:outline-none cursor-pointer"
        >
          <option value="Capital City" class="bg-slate-900 text-slate-200">Capital City</option>
          <option value="Frontier Town" class="bg-slate-900 text-slate-200">Frontier Town</option>
          <option value="Coastal Village" class="bg-slate-900 text-slate-200">Coastal Village</option>
          <option value="Custom" class="bg-slate-900 text-slate-200">Custom...</option>
        </select>
        {#if settlementPreset === 'Custom'}
          <input
            type="text"
            bind:value={customSettlementName}
            placeholder="Settlement name..."
            class="bg-slate-900 border border-slate-700 rounded px-1.5 py-0.5 text-xs text-slate-200 w-28 focus:outline-none focus:border-indigo-500"
          />
        {/if}
      </div>

      <button
        onclick={postNewContract}
        class="px-3.5 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs shadow-md shadow-indigo-600/20 flex items-center gap-1.5 transition-all"
      >
        <span>➕ Post Notice</span>
      </button>
    </div>
  </header>

  <!-- Sub-Header: Party Guild Standing & Rank Status -->
  <div class="px-6 py-3 border-b border-slate-800/80 bg-slate-950/70 shrink-0 flex items-center justify-between text-xs">
    <div class="flex items-center gap-4">
      <div class="flex items-center gap-2">
        <span class="text-slate-500 font-bold uppercase text-[10px]">Guild Rank:</span>
        <span class="px-2 py-0.5 rounded-md text-xs font-black font-mono bg-indigo-950 text-indigo-300 border border-indigo-700/60">
          {profile.rank}
        </span>
      </div>
      <div class="flex items-center gap-1.5 font-mono">
        <span class="text-slate-500 text-[10px] font-bold uppercase">Reputation:</span>
        <span class="text-amber-300 font-bold">{profile.reputation} pts</span>
      </div>
      <div class="flex items-center gap-1.5 font-mono">
        <span class="text-slate-500 text-[10px] font-bold uppercase">Requisition Allowance:</span>
        <span class="text-emerald-400 font-bold">{profile.requisitionAllowanceGp} gp</span>
      </div>
      <div class="flex items-center gap-1.5 font-mono">
        <span class="text-slate-500 text-[10px] font-bold uppercase">Monthly Dues:</span>
        <span class="text-slate-300">{profile.monthlyDuesGp} gp / mo (Paid ✓)</span>
      </div>
    </div>

    <!-- Category Filters -->
    <div class="flex items-center gap-1 bg-slate-900 border border-slate-800 rounded-xl p-1 text-[11px]">
      {#each ['All', 'Hunt', 'Exploration', 'Protection', 'Resource Gathering', 'Find'] as cat}
        <button
          onclick={() => activeFilter = cat as any}
          class="px-2.5 py-1 rounded-lg font-bold transition-colors {activeFilter === cat
            ? 'bg-indigo-600 text-white shadow-sm'
            : 'text-slate-400 hover:text-slate-200'}"
        >
          {cat}
        </button>
      {/each}
    </div>
  </div>

  <!-- Board Body -->
  <div class="flex-1 flex min-h-0 overflow-hidden">

    <!-- Contract Cards Feed -->
    <div class="flex-1 overflow-y-auto p-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 auto-rows-max">
      {#if filteredContracts.length === 0}
        <div class="col-span-full py-16 text-center text-slate-600">
          <p class="text-4xl mb-2">📜</p>
          <p class="text-sm font-semibold text-slate-400">No notices posted under this category.</p>
          <p class="text-xs mt-1">Click "+ Post Notice" to generate fresh regional bounties.</p>
        </div>
      {/if}

      {#each filteredContracts as contract (contract.id)}
        {@const style = CATEGORY_COLORS[contract.classification]}
        <div
          role="button"
          tabindex="0"
          onclick={() => selectedContract = contract}
          onkeydown={(e) => { if (e.key === 'Enter') selectedContract = contract; }}
          class="p-5 rounded-2xl border transition-all cursor-pointer flex flex-col justify-between space-y-3 bg-slate-900/70 border-slate-800 hover:border-slate-700 hover:bg-slate-850 hover:shadow-xl relative overflow-hidden group {contract.status === 'Completed' ? 'opacity-60 bg-slate-950' : ''}"
        >
          <!-- Top Tag & Escrow -->
          <div>
            <div class="flex items-center justify-between mb-2">
              <span class="px-2 py-0.5 rounded-md text-[10px] font-bold uppercase border flex items-center gap-1 {style.badgeBg} {style.text} {style.border}">
                <span>{style.icon}</span> {contract.classification}
              </span>
              <span class="text-xs font-black font-mono text-amber-300">
                {contract.rewardGp} GP
              </span>
            </div>

            <!-- Title & Client -->
            <h3 class="text-sm font-black text-slate-100 group-hover:text-amber-200 transition-colors line-clamp-2">
              {contract.title}
            </h3>
            <div class="flex items-center gap-2 text-[10px] text-slate-400 mt-1">
              <span>Client: <strong class="text-slate-300">{contract.client}</strong></span>
            </div>

            <p class="text-xs text-slate-400 mt-2 line-clamp-3 leading-relaxed">
              {contract.description}
            </p>
          </div>

          <!-- Bottom Waybill & Actions -->
          <div class="pt-3 border-t border-slate-800/80 space-y-2">
            <div class="flex items-center justify-between text-[10px] font-mono text-slate-500">
              <span>📍 {contract.destination}</span>
              <span>⏱️ {contract.daysRemaining}d (Decade)</span>
            </div>

            <div class="flex items-center justify-between pt-1">
              <span class="text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-slate-950 border border-slate-800 text-slate-400">
                Rank: {contract.minRank}
              </span>

              {#if contract.status === 'Available'}
                <button
                  onclick={(e) => { e.stopPropagation(); acceptContract(contract); }}
                  class="px-3 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-[11px] transition-colors"
                >
                  Accept Contract
                </button>
              {:else if contract.status === 'Accepted'}
                <button
                  onclick={(e) => { e.stopPropagation(); completeContract(contract); }}
                  class="px-3 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-[11px] transition-colors shadow-sm shadow-emerald-950"
                >
                  Claim Escrow ✓
                </button>
              {:else}
                <span class="text-[10px] font-bold text-emerald-400 uppercase font-mono">Completed ✓</span>
              {/if}
            </div>
          </div>

        </div>
      {/each}
    </div>

    <!-- Right: Selected Contract Detail Drawer -->
    {#if selectedContract}
      <aside class="w-96 border-l border-slate-800 bg-slate-900/90 p-6 flex flex-col justify-between shrink-0 overflow-y-auto space-y-6">
        <div class="space-y-4">
          <div class="flex items-center justify-between">
            <span class="text-[10px] font-bold uppercase tracking-wider text-slate-500">Official Guild Waybill</span>
            <button
              onclick={() => selectedContract = null}
              class="w-6 h-6 rounded-lg bg-slate-800 text-slate-400 hover:text-slate-200 text-xs font-bold"
            >
              ✕
            </button>
          </div>

          <div>
            <h2 class="text-base font-black text-slate-100">{selectedContract.title}</h2>
            <div class="text-xs text-slate-400 mt-1">Client: <strong class="text-slate-200">{selectedContract.client}</strong></div>
          </div>

          <!-- Escrow Guarantee Box -->
          <div class="p-3.5 rounded-2xl bg-amber-950/40 border border-amber-600/50 space-y-1">
            <div class="flex items-center justify-between text-xs font-bold text-amber-300">
              <span>🔒 100% Upfront Escrow Deposited</span>
              <span class="font-mono text-sm">{selectedContract.rewardGp} GP</span>
            </div>
            <p class="text-[10px] text-amber-200/70 leading-tight">
              Funds are secured in the Grand Guild Vault at Silvercrest. Full bounty will automatically disperse upon verification of proof.
            </p>
          </div>

          <!-- Destination & Objectives -->
          <div class="space-y-2">
            <span class="text-[10px] font-bold uppercase tracking-wider text-slate-400">Mission Objectives</span>
            <ul class="space-y-1.5 text-xs text-slate-300">
              {#each selectedContract.objectives as obj}
                <li class="flex items-start gap-2 p-2 rounded-xl bg-slate-950 border border-slate-800">
                  <span class="text-indigo-400 font-bold">✓</span>
                  <span>{obj}</span>
                </li>
              {/each}
            </ul>
          </div>

          <!-- Specs -->
          <div class="grid grid-cols-2 gap-2 text-[11px] font-mono">
            <div class="p-2 rounded-xl bg-slate-950 border border-slate-800">
              <span class="text-[9px] text-slate-500 block uppercase">Destination</span>
              <span class="text-slate-200 font-bold truncate block">{selectedContract.destination}</span>
            </div>
            <div class="p-2 rounded-xl bg-slate-950 border border-slate-800">
              <span class="text-[9px] text-slate-500 block uppercase">Decade Deadline</span>
              <span class="text-amber-300 font-bold block">{selectedContract.daysRemaining} Days</span>
            </div>
          </div>
        </div>

        <!-- Action buttons -->
        <div class="pt-4 border-t border-slate-800">
          {#if selectedContract.status === 'Available'}
            <button
              onclick={() => { acceptContract(selectedContract!); }}
              class="w-full py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-black text-xs uppercase tracking-wide transition-all shadow-lg"
            >
              Sign &amp; Accept Waybill
            </button>
          {:else if selectedContract.status === 'Accepted'}
            <button
              onclick={() => { completeContract(selectedContract!); }}
              class="w-full py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs uppercase tracking-wide transition-all shadow-lg shadow-emerald-950"
            >
              Verify Proof &amp; Disburse Escrow ({selectedContract.rewardGp} GP)
            </button>
          {:else}
            <div class="w-full py-2.5 rounded-xl bg-emerald-950/60 border border-emerald-700/60 text-emerald-300 text-center text-xs font-bold">
              Contract Completed &amp; Paid
            </div>
          {/if}
        </div>
      </aside>
    {/if}

  </div>

</div>
