<script lang="ts">
  import { onMount } from 'svelte';
  import { currencyStore, inventoryStore } from '../../../stores/characterStore';
  import {
    sessionStore,
    partyStashStore,
    type PartyStashItem,
    calculateTriStatInitiative,
    applyHpMutationWithExhaustionCheck,
    calculatePartyEffectiveCr,
    EXHAUSTION_PENALTIES
  } from '../../../stores/sessionStore';
  import { audioEngine } from '../../audio/AudioEngine';
  import { canvasStore } from '../../../stores/canvasStore.svelte';
  import { sendWsEvent } from '../../../stores/websocketStore';
  import CharacterBuilderModal, { type CreatedCharacter } from '../character/CharacterBuilderModal.svelte';
  import CharacterSheetModal from '../character/CharacterSheetModal.svelte';
  import PetManagerDrawer from '../player/PetManagerDrawer.svelte';
  import { getLanIp, getPlayUrl } from '../../services/networkDiscovery';
  import { rulesEngine } from '../../stores/rulesEngine.svelte';
  import { chatStore } from '../../stores/chatStore.svelte';

  interface PartyMember {
    id: string;
    name: string;
    playerName: string;
    class: string;
    level: number;
    hpCurrent: number;
    hpMax: number;
    tempHp?: number;
    ac: number;
    passivePerception: number;
    pin: string;
    isOnline: boolean;
    isNpc: boolean;
    conditions: string[];
    exhaustion?: number;
    isOrbSealed?: boolean;
    race?: string;
    dialect?: string;
    str?: number;
    dex?: number;
    con?: number;
    int?: number;
    wis?: number;
    cha?: number;
    weaponName?: string;
    armorName?: string;
    cp?: number;
    sp?: number;
    ep?: number;
    gp?: number;
    pp?: number;
    hitDiceCurrent?: number;
    hitDiceMax?: number;
    manaToxicity?: number;
    skills?: Record<string, boolean>;
    expertises?: Record<string, boolean>;
  }

  const STORAGE_ROSTER_KEY = 'vtt_party_roster';
  const STORAGE_LAN_IP_KEY = 'vtt_lan_ip';
  const STORAGE_PARTY_COINS_KEY = 'vtt_party_coins';

  const DND_CONDITIONS = [
    'Blinded', 'Charmed', 'Deafened', 'Frightened', 'Grappled',
    'Incapacitated', 'Invisible', 'Paralyzed', 'Petrified',
    'Poisoned', 'Prone', 'Restrained', 'Stunned', 'Unconscious'
  ];

  const DND_CLASSES = [
    'Artificer', 'Barbarian', 'Bard', 'Cleric', 'Druid', 'Fighter',
    'Monk', 'Paladin', 'Ranger', 'Rogue', 'Sorcerer', 'Warlock', 'Wizard', 'NPC'
  ];

  function genPin(): string {
    if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
      const array = new Uint32Array(1);
      crypto.getRandomValues(array);
      return (1000 + (array[0] % 9000)).toString();
    }
    return Math.floor(1000 + Math.random() * 9000).toString();
  }

  function loadRoster(): PartyMember[] {
    try {
      const raw = localStorage.getItem(STORAGE_ROSTER_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as PartyMember[];
        // Sanitize legacy mock fixture heroes if any
        const cleaned = parsed.filter(m => !(
          (m.id === 'pc-1' && m.name === 'Valen Shadowborn') ||
          (m.id === 'pc-2' && m.name === 'Eldrin Starfall') ||
          (m.id === 'pc-3' && m.name === 'Kareth Stonefist') ||
          (m.id === 'pc-4' && m.name === 'Althea Dawnseeker')
        ));
        const sanitized = cleaned.map(m => {
          if (!m.pin || m.pin === '1234' || m.pin === '2345' || m.pin === '3456' || m.pin === '4567' || m.pin === '0000') {
            return { ...m, pin: genPin() };
          }
          return m;
        });
        localStorage.setItem(STORAGE_ROSTER_KEY, JSON.stringify(sanitized));
        return sanitized;
      }
    } catch {
      // Fallback
    }
    return [];
  }

  function genId() { return `pc-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`; }

  // ── Reactive State ────────────────────────────────────────────────────────
  let roster = $state<PartyMember[]>(loadRoster());
  let lanIp = $state(localStorage.getItem(STORAGE_LAN_IP_KEY) || 'localhost');
  let lanPort = $state(5173);
  let copiedPin = $state<string | null>(null);
  let copiedLink = $state<string | null>(null);

  onMount(() => {
    getLanIp().then(ip => {
      if (ip && ip !== 'localhost' && ip !== '127.0.0.1') {
        lanIp = ip;
      }
    }).catch(() => {});
  });

  // Economy & Stash Sub-Menu Collapsible State
  let isEconomyOpen = $state(false);
  let coins = $state({
    pp: 2,
    gp: 245,
    ep: 15,
    sp: 84,
    cp: 140,
  });

  // Load coins
  try {
    const rawCoins = localStorage.getItem(STORAGE_PARTY_COINS_KEY);
    if (rawCoins) {
      coins = JSON.parse(rawCoins);
    }
  } catch {
    // default
  }

  $effect(() => {
    localStorage.setItem(STORAGE_ROSTER_KEY, JSON.stringify(roster));
  });

  $effect(() => {
    localStorage.setItem(STORAGE_LAN_IP_KEY, lanIp);
  });

  $effect(() => {
    localStorage.setItem(STORAGE_PARTY_COINS_KEY, JSON.stringify(coins));
  });

  // Coin weight calculation: standard 5e rule is 50 coins = 1 lb
  let totalCoinsCount = $derived(coins.pp + coins.gp + coins.ep + coins.sp + coins.cp);
  let totalCoinsWeightLbs = $derived((totalCoinsCount / 50).toFixed(1));
  let totalValueInGp = $derived((coins.pp * 10) + coins.gp + (coins.ep * 0.5) + (coins.sp * 0.1) + (coins.cp * 0.01));

  // Party Stash Items (reactive from sessionStore)
  let stashItems = $state<PartyStashItem[]>([...sessionStore.getPartyStash()]);
  let newStashName = $state('');
  let newStashCategory = $state('Gear');
  let newStashQty = $state(1);
  let newStashWeight = $state(1.0);

  let totalStashWeightLbs = $derived(
    stashItems.reduce((acc, item) => acc + (item.weight * item.quantity), 0)
  );

  // ── Character Modal State ──────────────────────────────────────────────────
  let showCharModal = $state(false);
  let editingId = $state<string | null>(null);
  let form = $state({
    name: '',
    playerName: '',
    class: 'Fighter',
    level: 1,
    hpMax: 10,
    ac: 10,
    passivePerception: 10,
    pin: '',
    isNpc: false,
    conditions: [] as string[],
  });

  let isBuilderOpen = $state(false);
  let isPetDrawerOpen = $state(false);
  let inspectedMemberId = $state<string | null>(null);
  let inspectedMember = $derived(roster.find(m => m.id === inspectedMemberId) || null);

  const SKILL_DEFS: { name: string; ability: 'str' | 'dex' | 'con' | 'int' | 'wis' | 'cha' }[] = [
    { name: 'Acrobatics', ability: 'dex' },
    { name: 'Animal Handling', ability: 'wis' },
    { name: 'Arcana', ability: 'int' },
    { name: 'Athletics', ability: 'str' },
    { name: 'Deception', ability: 'cha' },
    { name: 'History', ability: 'int' },
    { name: 'Insight', ability: 'wis' },
    { name: 'Intimidation', ability: 'cha' },
    { name: 'Investigation', ability: 'int' },
    { name: 'Medicine', ability: 'wis' },
    { name: 'Nature', ability: 'int' },
    { name: 'Perception', ability: 'wis' },
    { name: 'Performance', ability: 'cha' },
    { name: 'Persuasion', ability: 'cha' },
    { name: 'Religion', ability: 'int' },
    { name: 'Sleight of Hand', ability: 'dex' },
    { name: 'Stealth', ability: 'dex' },
    { name: 'Survival', ability: 'wis' }
  ];

  function getAbilityMod(score?: number): number {
    return Math.floor(((score ?? 10) - 10) / 2);
  }

  function getProficiencyBonus(level: number = 1): number {
    return Math.floor((level - 1) / 4) + 2;
  }

  function getSkillMod(member: PartyMember, skill: typeof SKILL_DEFS[0]): number {
    const baseMod = getAbilityMod(member[skill.ability]);
    const prof = getProficiencyBonus(member.level);
    const isProf = member.skills?.[skill.name] ?? false;
    const isExpert = member.expertises?.[skill.name] ?? false;
    if (isExpert) return baseMod + prof * 2;
    if (isProf) return baseMod + prof;
    return baseMod;
  }

  function rollAbilityCheck(member: PartyMember, stat: string, score: number) {
    const mod = getAbilityMod(score);
    const sign = mod >= 0 ? '+' : '';
    chatStore.roll(`1d20${sign}${mod}`, {
      label: `${member.name}: ${stat.toUpperCase()} Check`,
      actorName: member.name,
      actionType: 'check',
      explicitTerms: [
        { label: '1d20', value: 0 },
        { label: stat.toUpperCase(), value: mod }
      ]
    });
  }

  function rollSavingThrow(member: PartyMember, stat: string, score: number) {
    const mod = getAbilityMod(score);
    const sign = mod >= 0 ? '+' : '';
    chatStore.roll(`1d20${sign}${mod}`, {
      label: `${member.name}: ${stat.toUpperCase()} Save`,
      actorName: member.name,
      actionType: 'save',
      explicitTerms: [
        { label: '1d20', value: 0 },
        { label: `${stat.toUpperCase()} Save`, value: mod }
      ]
    });
  }

  function rollSkillCheck(member: PartyMember, skillName: string, ability: string, totalMod: number) {
    const sign = totalMod >= 0 ? '+' : '';
    chatStore.roll(`1d20${sign}${totalMod}`, {
      label: `${member.name}: ${skillName} (${ability.toUpperCase()})`,
      actorName: member.name,
      actionType: 'check',
      explicitTerms: [
        { label: '1d20', value: 0 },
        { label: skillName, value: totalMod }
      ]
    });
  }

  function rollWeaponAttack(member: PartyMember, weaponName: string) {
    const prof = getProficiencyBonus(member.level);
    const strMod = getAbilityMod(member.str ?? 10);
    const atkBonus = prof + strMod;
    const sign = atkBonus >= 0 ? '+' : '';
    chatStore.roll(`1d20${sign}${atkBonus}`, {
      label: `${member.name}: ${weaponName} (Attack)`,
      actorName: member.name,
      actionType: 'attack',
      explicitTerms: [
        { label: '1d20', value: 0 },
        { label: 'Attack Bonus', value: atkBonus }
      ]
    });
    // Also roll standard weapon damage
    const dmgSign = strMod >= 0 ? '+' : '';
    chatStore.roll(`1d8${dmgSign}${strMod}`, {
      label: `${member.name}: ${weaponName} (Damage)`,
      actorName: member.name,
      actionType: 'damage',
      explicitTerms: [
        { label: '1d8', value: 0 },
        { label: 'STR', value: strMod }
      ]
    });
  }

  function rollInitiative(member: PartyMember) {
    const dexMod = getAbilityMod(member.dex ?? 10);
    const sign = dexMod >= 0 ? '+' : '';
    chatStore.roll(`1d20${sign}${dexMod}`, {
      label: `${member.name}: Initiative`,
      actorName: member.name,
      actionType: 'check',
      explicitTerms: [
        { label: '1d20', value: 0 },
        { label: 'DEX', value: dexMod }
      ]
    });
  }

  function handleShortRest(memberId: string) {
    roster = roster.map(m => {
      if (m.id !== memberId) return m;
      const hitDiceLeft = m.hitDiceCurrent ?? m.level;
      if (hitDiceLeft <= 0) return m;
      const conMod = getAbilityMod(m.con);
      const hitDieSize = m.class.includes('Barbarian') ? 12 : m.class.includes('Fighter') || m.class.includes('Paladin') || m.class.includes('Ranger') ? 10 : m.class.includes('Wizard') || m.class.includes('Sorcerer') ? 6 : 8;
      const roll = Math.floor(Math.random() * hitDieSize) + 1;
      const healed = Math.max(1, roll + conMod);
      const newHp = Math.min(m.hpMax, m.hpCurrent + healed);
      audioEngine.triggerSfx('sfx-rest');
      return {
        ...m,
        hpCurrent: newHp,
        hitDiceCurrent: hitDiceLeft - 1
      };
    });
  }

  function handleLongRest(memberId: string) {
    roster = roster.map(m => {
      if (m.id !== memberId) return m;
      const maxHitDice = m.level;
      const regainedDice = Math.max(1, Math.floor(maxHitDice / 2));
      audioEngine.triggerSfx('sfx-rest');
      return {
        ...m,
        hpCurrent: m.hpMax,
        tempHp: 0,
        hitDiceCurrent: Math.min(maxHitDice, (m.hitDiceCurrent ?? maxHitDice) + regainedDice),
        manaToxicity: 0,
        exhaustion: Math.max(0, (m.exhaustion ?? 0) - 1)
      };
    });
  }

  function handleCharacterCreated(char: CreatedCharacter) {
    const newMember: PartyMember = {
      id: char.id,
      name: char.name,
      playerName: char.playerName,
      class: char.class,
      level: char.level,
      hpCurrent: char.hpCurrent,
      hpMax: char.hpMax,
      tempHp: char.tempHp,
      ac: char.ac,
      passivePerception: char.passivePerception,
      pin: char.pin,
      isOnline: true,
      isNpc: false,
      conditions: [],
      race: char.race,
      dialect: char.dialect,
      str: char.str,
      dex: char.dex,
      con: char.con,
      int: char.int,
      wis: char.wis,
      cha: char.cha,
      weaponName: char.weaponName,
      armorName: char.armorName,
      cp: char.cp,
      sp: char.sp,
      ep: char.ep,
      gp: char.gp,
      pp: char.pp,
      hitDiceCurrent: char.level,
      hitDiceMax: char.level,
      manaToxicity: 0,
      skills: char.skills.reduce((acc, s) => ({ ...acc, [s]: true }), {})
    };
    roster = [...roster, newMember];
    audioEngine.triggerSfx('sfx-secret');
  }

  function openAddModal() {
    form = {
      name: '',
      playerName: '',
      class: 'Fighter',
      level: 1,
      hpMax: 10,
      ac: 10,
      passivePerception: 10,
      pin: genPin(),
      isNpc: false,
      conditions: []
    };
    editingId = null;
    showCharModal = true;
  }

  function openEditModal(member: PartyMember) {
    form = {
      name: member.name,
      playerName: member.playerName,
      class: member.class,
      level: member.level,
      hpMax: member.hpMax,
      ac: member.ac,
      passivePerception: member.passivePerception,
      pin: member.pin,
      isNpc: member.isNpc,
      conditions: [...member.conditions]
    };
    editingId = member.id;
    showCharModal = true;
  }

  function saveCharacter() {
    if (!form.name.trim()) return;
    const pin = form.pin.trim().padStart(4, '0').slice(-4) || genPin();

    if (editingId) {
      roster = roster.map(m => m.id === editingId ? {
        ...m,
        name: form.name.trim(),
        playerName: form.playerName.trim(),
        class: form.class,
        level: form.level,
        hpMax: form.hpMax,
        hpCurrent: Math.min(m.hpCurrent, form.hpMax),
        ac: form.ac,
        passivePerception: form.passivePerception,
        pin,
        isNpc: form.isNpc,
        conditions: form.conditions
      } : m);
    } else {
      const newChar: PartyMember = {
        id: genId(),
        name: form.name.trim(),
        playerName: form.playerName.trim() || 'Player',
        class: form.class,
        level: form.level,
        hpCurrent: form.hpMax,
        hpMax: form.hpMax,
        ac: form.ac,
        passivePerception: form.passivePerception,
        pin,
        isOnline: false,
        isNpc: form.isNpc,
        conditions: form.conditions
      };
      roster = [...roster, newChar];
    }
    showCharModal = false;
    editingId = null;
  }

  function deleteCharacter(id: string) {
    roster = roster.filter(m => m.id !== id);
    if (editingId === id) {
      showCharModal = false;
      editingId = null;
    }
  }

  // ── Aleamos Black Orb Extraction Protocol ──────────────────────────────────
  let activePartyMembers = $derived(roster.filter(m => !m.isOrbSealed && !m.isNpc));
  let partyEffectiveCr = $derived(
    calculatePartyEffectiveCr(roster).effectiveCr
  );

  function toggleBlackOrbStow(memberId: string) {
    const member = roster.find(m => m.id === memberId);
    if (!member) return;

    const willBeSealed = !member.isOrbSealed;

    if (willBeSealed) {
      sessionStore.stowCharacterIntoBlackOrb(member.id, member.name, member.pin);
    } else {
      sessionStore.releaseCharacterFromBlackOrb(member.id, member.name, member.pin);
    }

    // Update local roster state
    roster = roster.map(m => m.id === memberId ? { ...m, isOrbSealed: willBeSealed } : m);
    audioEngine.triggerSfx(willBeSealed ? 'sfx-secret' : 'sfx-bell');
  }

  function generateNewPin(id: string) {
    const pin = genPin();
    roster = roster.map(m => m.id === id ? { ...m, pin } : m);
    copiedPin = `PIN for ${roster.find(m => m.id === id)?.name}: ${pin}`;
    setTimeout(() => { copiedPin = null; }, 3000);
  }

  function copyJoinLink(pin: string) {
    const link = getPlayUrl(pin, lanPort);
    navigator.clipboard.writeText(link).catch(() => {});
    copiedLink = pin;
    setTimeout(() => { copiedLink = null; }, 2500);
  }

  function adjustHp(id: string, delta: number) {
    roster = roster.map(m => {
      if (m.id !== id) return m;
      const currentExhaustion = m.exhaustion ?? 0;
      const { nextHp, nextExhaustion, exhaustionTriggered } = applyHpMutationWithExhaustionCheck(
        m.hpCurrent,
        delta,
        m.hpMax,
        currentExhaustion
      );
      const nextConditions = [...m.conditions];
      if (exhaustionTriggered && !nextConditions.some(c => c.startsWith('Exhaustion'))) {
        nextConditions.push(`Exhaustion ${nextExhaustion}`);
      } else if (nextExhaustion > currentExhaustion) {
        const idx = nextConditions.findIndex(c => c.startsWith('Exhaustion'));
        if (idx >= 0) nextConditions[idx] = `Exhaustion ${nextExhaustion}`;
        else nextConditions.push(`Exhaustion ${nextExhaustion}`);
      }
      return {
        ...m,
        hpCurrent: nextHp,
        exhaustion: nextExhaustion,
        conditions: nextConditions,
      };
    });
    if (delta < 0) audioEngine.triggerSfx('sfx-sword');
    else audioEngine.triggerSfx('sfx-rest');
  }

  function toggleCondition(memberId: string, condition: string) {
    roster = roster.map(m => {
      if (m.id !== memberId) return m;
      const exists = m.conditions.includes(condition);
      const nextConditions = exists
        ? m.conditions.filter(c => c !== condition)
        : [...m.conditions, condition];
      return { ...m, conditions: nextConditions };
    });
  }

  function toggleOnline(id: string) {
    roster = roster.map(m => m.id === id ? { ...m, isOnline: !m.isOnline } : m);
  }

  // ── Stash Handlers ────────────────────────────────────────────────────────
  function addStashItem() {
    if (!newStashName.trim()) return;
    sessionStore.addItemToPartyStash({
      name: newStashName.trim(),
      category: newStashCategory,
      quantity: Math.max(1, newStashQty),
      weight: Math.max(0, newStashWeight),
      description: 'Added via DM Party Stash manager',
    });
    stashItems = [...sessionStore.getPartyStash()];
    newStashName = '';
    audioEngine.triggerSfx('sfx-bell');
  }

  function removeStashItem(id: string) {
    sessionStore.removePartyStashItem(id);
    stashItems = [...sessionStore.getPartyStash()];
  }

  function preserveStashItem(id: string) {
    partyStashStore.update(curr => curr.map(item => item.id === id ? { ...item, isPreserved: true } : item));
    stashItems = [...sessionStore.getPartyStash()];
    audioEngine.triggerSfx('sfx-rest');
  }

  onMount(() => {
    // Listen to custom stash sync events
    const syncStash = () => { stashItems = [...sessionStore.getPartyStash()]; };
    window.addEventListener('vtt:stash-updated', syncStash);
    return () => window.removeEventListener('vtt:stash-updated', syncStash);
  });
</script>

<div class="h-full flex flex-col bg-slate-950 text-slate-100 overflow-hidden select-none">

  <!-- ═══════════════════════════════════════════════════════════════════════
       SUBHEADER & ACTIONS
  ════════════════════════════════════════════════════════════════════════════ -->
  <div class="px-5 py-3 border-b border-slate-800 bg-slate-900/80 flex flex-wrap items-center justify-between gap-3 shrink-0">
    <div class="flex items-center gap-3">
      <div class="w-9 h-9 rounded-xl bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center text-lg">👥</div>
      <div>
        <h1 class="text-base font-black text-slate-100 uppercase tracking-wide">Active Party Roster</h1>
        <p class="text-[11px] text-slate-400">
          {roster.filter(m => !m.isNpc).length} PCs · {roster.filter(m => m.isNpc).length} Companions/NPCs · LAN Join Port :{lanPort}
        </p>
      </div>
    </div>

    <!-- Toolbar actions -->
    <div class="flex items-center gap-2">
      <!-- LAN IP input -->
      <div class="flex items-center gap-1.5 bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1 text-xs text-slate-400">
        <span class="text-slate-600 font-mono">LAN:</span>
        <input
          type="text"
          bind:value={lanIp}
          placeholder="e.g. 192.168.1.15"
          class="bg-transparent text-slate-200 text-xs font-mono w-28 focus:outline-none"
        />
      </div>

      <button
        onclick={() => isBuilderOpen = true}
        class="px-3.5 py-1.5 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white text-xs font-bold rounded-lg shadow-sm transition-all flex items-center gap-1.5"
      >
        <span>✨</span> 3-Mode Builder
      </button>

      <button
        onclick={openAddModal}
        class="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold rounded-lg border border-slate-700 shadow-sm transition-colors flex items-center gap-1.5"
      >
        <span>+</span> Quick Add
      </button>

      <button
        onclick={() => isPetDrawerOpen = true}
        class="px-3 py-1.5 bg-emerald-950/60 hover:bg-emerald-900/60 border border-emerald-700/50 text-emerald-300 text-xs font-bold rounded-lg shadow-sm transition-colors flex items-center gap-1.5"
        title="Bound Animals, Steeds, Carts & Cargo"
      >
        <span>🐾</span> Companions &amp; Pets
      </button>

      <button
        onclick={() => isEconomyOpen = !isEconomyOpen}
        class="px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors flex items-center gap-1.5 {isEconomyOpen ? 'bg-amber-950/60 border-amber-500/50 text-amber-300' : 'bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-300'}"
      >
        <span>🪙</span> Economy &amp; Stash {isEconomyOpen ? '▲' : '▼'}
      </button>

      <!-- Downtime Subsystem Quick Jump Shortcuts -->
      <div class="hidden lg:flex items-center gap-1 bg-slate-950 border border-slate-800 rounded-lg p-0.5">
        <button
          onclick={() => window.dispatchEvent(new CustomEvent('vtt:switch-tab', { detail: { tab: 'alchemy' } }))}
          class="px-2 py-1 hover:bg-slate-800 text-slate-300 rounded text-xs font-semibold flex items-center gap-1 transition-colors"
          title="Open Alchemy Lab & 28-Essence Matrix"
        >
          <span>⚗️</span> Alchemy
        </button>
        <button
          onclick={() => window.dispatchEvent(new CustomEvent('vtt:switch-tab', { detail: { tab: 'guild' } }))}
          class="px-2 py-1 hover:bg-slate-800 text-slate-300 rounded text-xs font-semibold flex items-center gap-1 transition-colors"
          title="Open Guild Notice Board"
        >
          <span>📋</span> Guild
        </button>
        <button
          onclick={() => window.dispatchEvent(new CustomEvent('vtt:switch-tab', { detail: { tab: 'stronghold' } }))}
          class="px-2 py-1 hover:bg-slate-800 text-slate-300 rounded text-xs font-semibold flex items-center gap-1 transition-colors"
          title="Open Stronghold Dashboard"
        >
          <span>🏰</span> Stronghold
        </button>
      </div>
    </div>
  </div>

  {#if copiedPin || copiedLink}
    <div class="bg-indigo-950/80 border-b border-indigo-800/50 px-4 py-1.5 text-center text-xs text-indigo-300 font-semibold animate-pulse">
      {copiedPin ? copiedPin : `Copied player join link for PIN ${copiedLink}!`}
    </div>
  {/if}

  <!-- ═══════════════════════════════════════════════════════════════════════
       NESTED SUB-MENU: COLLAPSIBLE ECONOMY & PARTY STASH
  ════════════════════════════════════════════════════════════════════════════ -->
  {#if isEconomyOpen}
    <div class="border-b border-amber-900/40 bg-gradient-to-b from-amber-950/20 to-slate-950/80 p-4 shrink-0 space-y-4 max-h-72 overflow-y-auto">
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-2">
          <span class="text-base">💰</span>
          <h2 class="text-xs font-bold uppercase tracking-wider text-amber-300">Shared Party Economy &amp; Stash Ledger</h2>
        </div>
        <div class="flex items-center gap-4 text-xs font-mono">
          <span class="text-slate-400">Coin Weight: <b class="text-amber-400">{totalCoinsWeightLbs} lbs</b> ({totalCoinsCount} coins)</span>
          <span class="text-slate-400">Total Equiv: <b class="text-emerald-400">{totalValueInGp.toFixed(2)} GP</b></span>
          <span class="text-slate-400">Stash Weight: <b class="text-indigo-300">{totalStashWeightLbs.toFixed(1)} lbs</b></span>
        </div>
      </div>

      <!-- Denomination Counters -->
      <div class="grid grid-cols-5 gap-3">
        {#each [
          { key: 'pp', label: 'Platinum (PP)', mult: '10 GP', color: 'text-cyan-300 border-cyan-800/40' },
          { key: 'gp', label: 'Gold (GP)', mult: '1 GP', color: 'text-amber-300 border-amber-800/40' },
          { key: 'ep', label: 'Electrum (EP)', mult: '½ GP', color: 'text-blue-300 border-blue-800/40' },
          { key: 'sp', label: 'Silver (SP)', mult: '1/10 GP', color: 'text-slate-300 border-slate-700' },
          { key: 'cp', label: 'Copper (CP)', mult: '1/100 GP', color: 'text-orange-300 border-orange-800/40' },
        ] as coin}
          <div class="bg-slate-900/90 border {coin.color} rounded-xl p-2.5 flex flex-col justify-between shadow-sm">
            <div class="flex justify-between items-center text-[10px] text-slate-400">
              <span class="font-bold">{coin.label}</span>
              <span class="font-mono text-[9px] text-slate-500">{coin.mult}</span>
            </div>
            <div class="flex items-center justify-between mt-2">
              <button
                onclick={() => coins[coin.key as keyof typeof coins] = Math.max(0, coins[coin.key as keyof typeof coins] - 10)}
                class="w-6 h-6 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold"
              >-10</button>
              <input
                type="number"
                min="0"
                bind:value={coins[coin.key as keyof typeof coins]}
                class="w-16 bg-slate-950 border border-slate-800 rounded px-1 text-center font-mono text-sm font-bold text-slate-100 focus:outline-none focus:border-amber-500"
              />
              <button
                onclick={() => coins[coin.key as keyof typeof coins] += 10}
                class="w-6 h-6 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold"
              >+10</button>
            </div>
          </div>
        {/each}
      </div>

      <!-- Party Inventory / Stash Ledger -->
      <div class="space-y-2">
        <div class="flex items-center justify-between text-xs">
          <span class="font-bold text-slate-300 uppercase tracking-wider">Party Inventory Stash</span>
          <span class="text-[11px] text-slate-500">{stashItems.length} items logged</span>
        </div>

        <!-- Add item row -->
        <div class="flex gap-2">
          <input
            type="text"
            bind:value={newStashName}
            placeholder="Item name (e.g., Potion of Healing, Rations, Rope)…"
            class="flex-1 bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-amber-500 placeholder:text-slate-600"
          />
          <select
            bind:value={newStashCategory}
            class="bg-slate-950 border border-slate-800 rounded-lg px-2 py-1.5 text-xs text-slate-300 focus:outline-none"
          >
            <option value="Gear">Adventuring Gear</option>
            <option value="Potion">Potion / Consumable</option>
            <option value="Scroll">Scroll / Tome</option>
            <option value="Weapon">Weapon / Armor</option>
            <option value="Quest">Quest Artifact</option>
          </select>
          <input
            type="number"
            min="1"
            bind:value={newStashQty}
            placeholder="Qty"
            class="w-16 bg-slate-950 border border-slate-800 rounded-lg px-2 py-1.5 text-xs text-center text-slate-200 focus:outline-none"
          />
          <input
            type="number"
            step="0.1"
            min="0"
            bind:value={newStashWeight}
            placeholder="lbs"
            class="w-16 bg-slate-950 border border-slate-800 rounded-lg px-2 py-1.5 text-xs text-center text-slate-200 focus:outline-none"
          />
          <button
            onclick={addStashItem}
            class="px-3 py-1.5 bg-amber-600 hover:bg-amber-500 text-slate-950 text-xs font-bold rounded-lg transition-colors"
          >
            Add to Stash
          </button>
        </div>

        <!-- Stash items list -->
        {#if stashItems.length === 0}
          <p class="text-center py-3 text-xs text-slate-600">The party stash is currently empty.</p>
        {:else}
          <div class="grid grid-cols-3 gap-2 max-h-32 overflow-y-auto pr-1">
            {#each stashItems as item (item.id)}
              <div class="bg-slate-950/80 border border-slate-800 rounded-lg p-2 flex items-center justify-between gap-2 text-xs">
                <div class="min-w-0">
                  <div class="flex items-center gap-1.5">
                    <span class="font-semibold text-slate-200 block truncate">{item.name}</span>
                    {#if item.isSpoiled}
                      <span class="px-1 py-0.2 rounded text-[8px] font-black bg-rose-950 text-rose-300 border border-rose-800/60">SPOILED</span>
                    {:else if item.isPreserved}
                      <span class="px-1 py-0.2 rounded text-[8px] font-bold bg-cyan-950 text-cyan-300 border border-cyan-800/60">PRESERVED</span>
                    {:else if item.harvestedAtHour}
                      <span class="px-1 py-0.2 rounded text-[8px] font-bold bg-amber-950 text-amber-300 border border-amber-800/60">24H DECAY</span>
                    {/if}
                  </div>
                  <span class="text-[10px] text-slate-500">Qty: {item.quantity} · {item.weight} lbs ({item.category})</span>
                </div>
                <div class="flex items-center gap-1 shrink-0">
                  {#if !item.isPreserved && !item.isSpoiled && item.harvestedAtHour}
                    <button
                      onclick={() => preserveStashItem(item.id)}
                      class="text-[9px] px-1.5 py-0.5 bg-cyan-950 hover:bg-cyan-900 text-cyan-300 rounded border border-cyan-800/50 font-bold transition-colors"
                      title="Apply preservation salting/oil (stops 24-hour decay)"
                    >
                      ❄️ Preserve
                    </button>
                  {/if}
                  <button
                    onclick={() => removeStashItem(item.id)}
                    class="text-slate-600 hover:text-rose-400 text-xs p-1"
                    title="Remove from Stash"
                  >✕</button>
                </div>
              </div>
            {/each}
          </div>
        {/if}
      </div>
    </div>
  {/if}

  <!-- ═══════════════════════════════════════════════════════════════════════
       ACTIVE ROSTER GRID
  ════════════════════════════════════════════════════════════════════════════ -->
  <div class="px-5 py-2.5 border-b border-slate-800 bg-slate-900/60 flex items-center justify-between text-xs text-slate-400">
    <div class="flex items-center gap-3">
      <span class="font-bold text-slate-300">Active Party: {activePartyMembers.length} / {roster.length}</span>
      <span class="px-2.5 py-0.5 rounded-full bg-indigo-950/80 border border-indigo-500/40 font-mono font-bold text-indigo-300 text-[11px]">
        Party Encounter CR: {partyEffectiveCr}
      </span>
    </div>
    <span class="text-[10px] text-slate-500 hidden sm:inline">
      {#if rulesEngine.isEnabled('enableBlackOrbRoster')}
        Temporal Black Orb extraction recalculates CR automatically
      {:else}
        Reserve characters excluded from active party and encounter CR
      {/if}
    </span>
  </div>

  <div class="flex-1 overflow-y-auto p-5">
    {#if roster.length === 0}
      <div class="text-center py-20 space-y-3 text-slate-500">
        <span class="text-4xl block">🛡️</span>
        <p class="text-base font-bold text-slate-400">No characters in the active roster.</p>
        <p class="text-xs">Click "Add Character (DM Manual)" to populate your party or staged companions.</p>
      </div>
    {:else}
      <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {#each roster as member (member.id)}
          {@const hpPercent = Math.max(0, Math.min(100, (member.hpCurrent / member.hpMax) * 100))}
          {@const tri = calculateTriStatInitiative({
            dex: member.dex ?? (member.class.includes('Rogue') ? 18 : 12),
            int: member.int ?? (member.class.includes('Wizard') ? 18 : 10),
            wis: member.wis ?? (member.class.includes('Cleric') ? 18 : 12),
          })}
          <div class="bg-slate-900/90 border border-slate-800 hover:border-slate-700/80 rounded-2xl p-4 flex flex-col justify-between gap-4 shadow-lg transition-all relative overflow-hidden group">

            <!-- Card Header -->
            <div class="flex items-start justify-between gap-2">
              <div class="min-w-0">
                <div class="flex items-center gap-2">
                  <span class="text-base font-black text-slate-100 truncate">{member.name}</span>
                  {#if member.isNpc}
                    <span class="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase bg-amber-950/60 text-amber-400 border border-amber-800/40">NPC</span>
                  {/if}
                  {#if member.isOrbSealed}
                    {#if rulesEngine.isEnabled('enableBlackOrbRoster')}
                      <span class="px-2 py-0.5 rounded text-[9px] font-bold uppercase bg-purple-950 text-purple-300 border border-purple-800/70 animate-pulse shadow-sm shadow-purple-900/50">🔮 In Black Orb</span>
                    {:else}
                      <span class="px-2 py-0.5 rounded text-[9px] font-bold uppercase bg-slate-800 text-slate-300 border border-slate-700">🛡️ In Reserve</span>
                    {/if}
                  {/if}
                </div>
                <p class="text-xs text-slate-400 mt-0.5">
                  Lvl {member.level} {member.class} · <span class="text-slate-500">{member.playerName}</span>
                </p>
              </div>

              <!-- Connection badge -->
              <button
                onclick={() => toggleOnline(member.id)}
                title="Toggle LAN Connection Status"
                class="px-2 py-0.5 rounded-full text-[10px] font-semibold border flex items-center gap-1.5 transition-colors {member.isOnline ? 'bg-emerald-950/60 text-emerald-300 border-emerald-800/40' : 'bg-slate-800/80 text-slate-400 border-slate-700'}"
              >
                <span class="w-1.5 h-1.5 rounded-full {member.isOnline ? 'bg-emerald-400 animate-pulse' : 'bg-slate-500'}"></span>
                {member.isOnline ? 'Connected' : 'Offline'}
              </button>
            </div>

            <!-- Stats Badge Trio (AC, Passive Perception, Tri-Stat or 5e DEX Initiative) -->
            <div class="grid grid-cols-3 gap-2">
              <div class="bg-slate-950/80 border border-slate-800/80 rounded-xl p-2 text-center">
                <span class="text-[9px] uppercase font-bold text-slate-500 block">Armor Class</span>
                <span class="text-sm font-mono font-black text-indigo-300">🛡️ {member.ac}</span>
              </div>
              <div class="bg-slate-950/80 border border-slate-800/80 rounded-xl p-2 text-center">
                <span class="text-[9px] uppercase font-bold text-slate-500 block">Perception</span>
                <span class="text-sm font-mono font-black text-amber-300">👁️ {member.passivePerception}</span>
              </div>
              <div class="bg-slate-950/80 border border-slate-800/80 rounded-xl p-2 text-center">
                {#if rulesEngine.isEnabled('enableTriStatInitiative')}
                  <span class="text-[9px] uppercase font-bold text-slate-500 block">Tri-Stat Init</span>
                  <span class="text-sm font-mono font-black text-emerald-300">⚡ {tri.label}</span>
                {:else}
                  {@const dexMod = getAbilityMod(member.dex)}
                  <span class="text-[9px] uppercase font-bold text-slate-500 block">Initiative</span>
                  <span class="text-sm font-mono font-black text-emerald-300">⚡ {dexMod >= 0 ? `+${dexMod}` : dexMod} (DEX)</span>
                {/if}
              </div>
            </div>

            <!-- HP Section with Visual Bar & Quick Buttons -->
            <div class="space-y-1.5 bg-slate-950/60 border border-slate-800/60 rounded-xl p-3">
              <div class="flex items-center justify-between text-xs">
                <span class="font-bold text-slate-400 uppercase tracking-wider text-[10px]">Hit Points</span>
                <span class="font-mono font-bold {member.hpCurrent <= member.hpMax * 0.25 ? 'text-rose-400' : 'text-slate-200'}">
                  {member.hpCurrent} / {member.hpMax} HP
                </span>
              </div>

              <!-- Bar -->
              <div class="w-full h-2 rounded-full bg-slate-800 overflow-hidden">
                <div
                  class="h-full transition-all duration-300 {hpPercent > 50 ? 'bg-emerald-500' : hpPercent > 25 ? 'bg-amber-500' : 'bg-rose-500'}"
                  style="width: {hpPercent}%"
                ></div>
              </div>

              <!-- Quick Modifiers -->
              <div class="flex items-center justify-between gap-1 pt-1">
                <button
                  onclick={() => adjustHp(member.id, -5)}
                  class="px-2 py-1 bg-rose-950/50 hover:bg-rose-900/60 text-rose-300 text-[10px] font-bold rounded border border-rose-800/30 transition-colors"
                >-5</button>
                <button
                  onclick={() => adjustHp(member.id, -1)}
                  class="px-2 py-1 bg-rose-950/30 hover:bg-rose-900/40 text-rose-300 text-[10px] font-bold rounded border border-rose-800/20 transition-colors"
                >-1</button>
                <div class="flex-1"></div>
                <button
                  onclick={() => adjustHp(member.id, 1)}
                  class="px-2 py-1 bg-emerald-950/30 hover:bg-emerald-900/40 text-emerald-300 text-[10px] font-bold rounded border border-emerald-800/20 transition-colors"
                >+1</button>
                <button
                  onclick={() => adjustHp(member.id, 5)}
                  class="px-2 py-1 bg-emerald-950/50 hover:bg-emerald-900/60 text-emerald-300 text-[10px] font-bold rounded border border-emerald-800/30 transition-colors"
                >+5</button>
              </div>
            </div>

            <!-- Aleamos 0-HP Exhaustion Trigger Badge -->
            {#if member.exhaustion && member.exhaustion > 0}
              <div class="p-2 rounded-xl bg-rose-950/70 border border-rose-800/60 space-y-0.5">
                <div class="flex items-center justify-between text-[11px]">
                  <span class="font-bold text-rose-300 flex items-center gap-1">
                    <span>⚠️</span> Exhaustion Tier {member.exhaustion}/6
                  </span>
                  <span class="text-[9px] font-mono text-rose-400">Anti-Heal-Scumming</span>
                </div>
                <p class="text-[10px] text-rose-200 leading-tight">
                  {EXHAUSTION_PENALTIES[member.exhaustion] || 'Severe physical strain.'}
                </p>
              </div>
            {/if}

            <!-- Status Conditions -->
            <div class="space-y-1.5">
              <div class="flex items-center justify-between text-[10px]">
                <span class="text-slate-500 uppercase font-bold tracking-wider">Active Conditions</span>
              </div>
              <div class="flex flex-wrap gap-1">
                {#if member.conditions.length === 0}
                  <span class="text-[10px] text-slate-600 italic">None</span>
                {:else}
                  {#each member.conditions as condition}
                    <button
                      onclick={() => toggleCondition(member.id, condition)}
                      class="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-rose-950/60 text-rose-300 border border-rose-800/40 hover:bg-rose-900/80 transition-colors"
                      title="Click to remove condition"
                    >
                      {condition} ✕
                    </button>
                  {/each}
                {/if}
              </div>
            </div>

            <!-- PIN Management & Direct Link -->
            <div class="bg-slate-950/80 border border-slate-800 rounded-xl p-2.5 flex items-center justify-between gap-2">
              <div class="flex items-center gap-2">
                <span class="text-slate-500 text-[10px] uppercase font-bold">PIN:</span>
                <span class="font-mono text-sm font-black text-amber-300 tracking-wider">{member.pin}</span>
                <button
                  onclick={() => generateNewPin(member.id)}
                  class="px-1.5 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-slate-200 text-[9px] font-bold uppercase transition-colors"
                  title="Auto-Generate New 4-Digit PIN"
                >
                  Regen
                </button>
              </div>

              <div class="flex items-center gap-1">
                <button
                  onclick={() => copyJoinLink(member.pin)}
                  class="px-2 py-1 bg-indigo-950/80 hover:bg-indigo-900 text-indigo-300 text-[10px] font-bold rounded border border-indigo-800/40 transition-colors"
                  title="Copy Direct Player Join Link: http://<IP>:8080?pin=XXXX"
                >
                  🔗 Join Link
                </button>
                <button
                  onclick={() => inspectedMemberId = member.id}
                  class="px-2 py-1 bg-amber-950/70 hover:bg-amber-900 border border-amber-700/50 text-amber-300 text-[10px] font-bold rounded transition-colors flex items-center gap-1"
                  title="Open Full 5e Aleamos Character Sheet"
                >
                  <span>📜</span> Sheet
                </button>
                <button
                  onclick={() => openEditModal(member)}
                  class="p-1 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs rounded transition-colors"
                  title="Edit Character"
                >
                  ✏️
                </button>
                <button
                  onclick={() => deleteCharacter(member.id)}
                  class="p-1 text-slate-600 hover:text-rose-400 text-xs transition-colors"
                  title="Delete Character"
                >
                  🗑️
                </button>
              </div>
            </div>

            <!-- Reserve / Black Orb Extraction Button -->
            <button
              onclick={() => toggleBlackOrbStow(member.id)}
              class="w-full py-2 px-3 rounded-xl border text-xs font-bold transition-all flex items-center justify-center gap-1.5 {member.isOrbSealed
                ? (rulesEngine.isEnabled('enableBlackOrbRoster')
                    ? 'bg-purple-950/80 hover:bg-purple-900 border-purple-500/70 text-purple-200 shadow-md shadow-purple-950/50'
                    : 'bg-slate-800 hover:bg-slate-700 border-slate-600 text-slate-200')
                : (rulesEngine.isEnabled('enableBlackOrbRoster')
                    ? 'bg-slate-950/60 hover:bg-purple-950/40 border-slate-800 hover:border-purple-800/60 text-slate-300 hover:text-purple-200'
                    : 'bg-slate-950/60 hover:bg-slate-800/60 border-slate-800 hover:border-slate-700 text-slate-300')}"
              title={member.isOrbSealed
                ? (rulesEngine.isEnabled('enableBlackOrbRoster') ? 'Release character from Black Orb back into active world' : 'Return character from reserve to active roster')
                : (rulesEngine.isEnabled('enableBlackOrbRoster') ? 'Stow absent player into temporal amnesia Black Orb (1-lb wondrous item)' : 'Move character to reserve roster')}
            >
              <span>{rulesEngine.isEnabled('enableBlackOrbRoster') ? '🔮' : (member.isOrbSealed ? '📤' : '📥')}</span>
              <span>
                {#if rulesEngine.isEnabled('enableBlackOrbRoster')}
                  {member.isOrbSealed ? 'Release from Black Orb' : 'Stow into Black Orb'}
                {:else}
                  {member.isOrbSealed ? 'Return to Active' : 'Move to Reserve'}
                {/if}
              </span>
            </button>

          </div>
        {/each}
      </div>
    {/if}
  </div>
</div>

<!-- ═══════════════════════════════════════════════════════════════════════
     ADD / EDIT CHARACTER MODAL (DM MANUAL)
════════════════════════════════════════════════════════════════════════════ -->
{#if showCharModal}
  <div
    role="presentation"
    class="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4"
    onclick={(e) => { if (e.target === e.currentTarget) showCharModal = false; }}
  >
    <div class="w-full max-w-lg bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl p-6 space-y-5">
      <div class="flex items-center justify-between border-b border-slate-800 pb-3">
        <h3 class="text-base font-bold text-slate-100">
          {editingId ? 'Edit Character' : 'Add Character (DM Manual)'}
        </h3>
        <button onclick={() => showCharModal = false} class="text-slate-500 hover:text-slate-300 text-sm">✕</button>
      </div>

      <div class="space-y-4 text-xs">
        <div class="grid grid-cols-2 gap-3">
          <div class="space-y-1">
            <label for="char-name" class="font-bold text-slate-400 uppercase tracking-wider text-[10px]">Character Name</label>
            <input
              id="char-name"
              type="text"
              bind:value={form.name}
              placeholder="Valen Shadowborn"
              class="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-slate-100 focus:outline-none focus:border-indigo-500"
            />
          </div>
          <div class="space-y-1">
            <label for="player-name" class="font-bold text-slate-400 uppercase tracking-wider text-[10px]">Player Name</label>
            <input
              id="player-name"
              type="text"
              bind:value={form.playerName}
              placeholder="Player 1"
              class="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-slate-100 focus:outline-none focus:border-indigo-500"
            />
          </div>
        </div>

        <div class="grid grid-cols-3 gap-3">
          <div class="space-y-1">
            <label for="char-class" class="font-bold text-slate-400 uppercase tracking-wider text-[10px]">Class</label>
            <select
              id="char-class"
              bind:value={form.class}
              class="w-full bg-slate-950 border border-slate-800 rounded-lg px-2 py-2 text-slate-200 focus:outline-none focus:border-indigo-500"
            >
              {#each DND_CLASSES as c}
                <option value={c}>{c}</option>
              {/each}
            </select>
          </div>
          <div class="space-y-1">
            <label for="char-lvl" class="font-bold text-slate-400 uppercase tracking-wider text-[10px]">Level</label>
            <input
              id="char-lvl"
              type="number"
              min="1"
              max="20"
              bind:value={form.level}
              class="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-slate-100 focus:outline-none focus:border-indigo-500 font-mono"
            />
          </div>
          <div class="space-y-1">
            <label for="char-pin" class="font-bold text-slate-400 uppercase tracking-wider text-[10px]">4-Digit PIN</label>
            <input
              id="char-pin"
              type="text"
              maxlength="4"
              bind:value={form.pin}
              class="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-amber-300 font-mono font-bold tracking-wider text-center focus:outline-none focus:border-indigo-500"
            />
          </div>
        </div>

        <div class="grid grid-cols-3 gap-3">
          <div class="space-y-1">
            <label for="char-hp" class="font-bold text-slate-400 uppercase tracking-wider text-[10px]">Max HP</label>
            <input
              id="char-hp"
              type="number"
              min="1"
              bind:value={form.hpMax}
              class="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-slate-100 focus:outline-none focus:border-indigo-500 font-mono"
            />
          </div>
          <div class="space-y-1">
            <label for="char-ac" class="font-bold text-slate-400 uppercase tracking-wider text-[10px]">Armor Class (AC)</label>
            <input
              id="char-ac"
              type="number"
              min="1"
              bind:value={form.ac}
              class="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-slate-100 focus:outline-none focus:border-indigo-500 font-mono"
            />
          </div>
          <div class="space-y-1">
            <label for="char-pp" class="font-bold text-slate-400 uppercase tracking-wider text-[10px]">Passive Perception</label>
            <input
              id="char-pp"
              type="number"
              min="1"
              bind:value={form.passivePerception}
              class="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-slate-100 focus:outline-none focus:border-indigo-500 font-mono"
            />
          </div>
        </div>

        <div class="flex items-center gap-2 pt-1">
          <input id="npc-check" type="checkbox" bind:checked={form.isNpc} class="rounded accent-indigo-600" />
          <label for="npc-check" class="text-xs text-slate-300 font-medium cursor-pointer">Mark as Staged Companion / NPC</label>
        </div>

        <!-- Condition toggles -->
        <div class="space-y-1.5 pt-2">
          <span class="font-bold text-slate-400 uppercase tracking-wider text-[10px] block">Toggle Starting Conditions</span>
          <div class="flex flex-wrap gap-1.5">
            {#each DND_CONDITIONS as cond}
              <button
                type="button"
                onclick={() => {
                  form.conditions = form.conditions.includes(cond)
                    ? form.conditions.filter(c => c !== cond)
                    : [...form.conditions, cond];
                }}
                class="px-2 py-0.5 rounded text-[10px] font-semibold border transition-colors {form.conditions.includes(cond) ? 'bg-rose-950 text-rose-300 border-rose-800' : 'bg-slate-950 text-slate-400 border-slate-800'}"
              >
                {cond}
              </button>
            {/each}
          </div>
        </div>
      </div>

      <div class="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
        <button
          onclick={() => showCharModal = false}
          class="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-medium transition-colors"
        >
          Cancel
        </button>
        <button
          onclick={saveCharacter}
          class="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold transition-colors shadow"
        >
          {editingId ? 'Save Changes' : 'Create Character'}
        </button>
      </div>
    </div>
  </div>
{/if}

<!-- ═══════════════════════════════════════════════════════════════════════
     3-MODE CHARACTER BUILDER MODAL
════════════════════════════════════════════════════════════════════════════ -->
<CharacterBuilderModal
  bind:isOpen={isBuilderOpen}
  onCharacterCreated={handleCharacterCreated}
/>

<!-- ═══════════════════════════════════════════════════════════════════════
     BOUND ANIMAL & PET DRAWER
════════════════════════════════════════════════════════════════════════════ -->
{#if isPetDrawerOpen}
  <div
    role="presentation"
    class="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4"
    onclick={(e) => { if (e.target === e.currentTarget) isPetDrawerOpen = false; }}
  >
    <div class="w-full max-w-2xl max-h-[85vh] overflow-y-auto bg-slate-900 border border-slate-700 rounded-2xl p-4 shadow-2xl">
      <div class="flex justify-end mb-2">
        <button onclick={() => isPetDrawerOpen = false} class="px-3 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded font-bold text-xs">Close ✕</button>
      </div>
      <PetManagerDrawer isDm={true} />
    </div>
  </div>
{/if}

<!-- ═══════════════════════════════════════════════════════════════════════
     FULL 5E ALEAMOS CHARACTER SHEET INSPECTOR MODAL
════════════════════════════════════════════════════════════════════════════ -->
{#if inspectedMember}
  <CharacterSheetModal
    isOpen={true}
    characterOverride={inspectedMember}
    onClose={() => (inspectedMemberId = null)}
  />
{/if}
