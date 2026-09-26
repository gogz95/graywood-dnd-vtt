<script lang="ts">
  // play/+page.svelte — Hardened Player Mobile/Tablet Companion Portal
  // Enforces strict PIN gateway, zero data leakage prior to auth, "Wrong PIN" rejection,
  // Live Combat Banner, Mobile Character HUD, Aleamos Tri-Stat Init, 0-HP Exhaustion, RP Sunder, DM Whispers, Dice Tray, Handouts.

  import { onMount, onDestroy } from 'svelte';
  import {
    sessionStore,
    applyHpMutationWithExhaustionCheck,
    EXHAUSTION_PENALTIES
  } from '../../stores/sessionStore';
  import {
    initWebSocket,
    sendWsEvent,
    dispatchAuthFailure,
    dmWhispersStore,
    combatTurnStore,
    type WhisperMessage,
    type CombatTurnSync
  } from '../../stores/websocketStore';
  import { audioEngine } from '../../lib/audio/AudioEngine';
  import ParchmentViewer from '../../lib/components/handouts/ParchmentViewer.svelte';
  import ManaRecoveryModal from '../../lib/components/party/ManaRecoveryModal.svelte';
  import PetManagerDrawer from '../../lib/components/player/PetManagerDrawer.svelte';
  import WhisperInboxModal from '../../lib/components/player/WhisperInboxModal.svelte';
  import DowntimeManager from '../../lib/components/downtime/DowntimeManager.svelte';
  import SpellbookDrawer from '../../lib/components/player/SpellbookDrawer.svelte';
  import ActionHotbar from '../../lib/components/navigation/ActionHotbar.svelte';
  import { hotkeyManager } from '../../lib/services/hotkeyManager';
  import type { CompanionAnimal } from '../../lib/types/character';
  import {
    sendTradeOffer,
    acceptTradeOffer,
    declineTradeOffer,
    activeTradeOfferStore,
  } from '../../lib/network/broadcastBridge';
  import type { TradeOfferPayload } from '../../lib/types/item';
  import { rulesEngine } from '../../lib/stores/rulesEngine.svelte';
  import { curtainStore } from '../../lib/stores/curtainStore.svelte';

  interface PlayerCharacter {
    id: string;
    name: string;
    playerName: string;
    class: string;
    level: number;
    hpCurrent: number;
    hpMax: number;
    tempHp: number;
    ac: number;
    speed: number;
    passivePerception: number;
    pin: string;
    str: number;
    dex: number;
    con: number;
    int: number;
    wis: number;
    cha: number;
    savingThrows: string[];
    exhaustion: number;
    hitDiceCurrent: number;
    hitDiceMax: number;
    isOrbSealed?: boolean;
  }

  interface PlayerItem {
    id: string;
    name: string;
    type: string;
    category?: string;
    rarity?: string;
    quantity?: number;
    weight?: number;
    currentRp: number;
    maxRp: number;
    attackBonus?: number;
    damageFormula?: string;
    damageType?: string;
    acBonus?: number;
    description: string;
    isPerishable?: boolean;
    harvestTimestamp?: number | null;
    essenceTag?: string;
  }

  // ── Gateway & Security State ───────────────────────────────────────────────
  let enteredPin = $state('');
  let authError = $state('');
  let isAuthenticated = $state(false);
  let isConnecting = $state(false);
  let isShaking = $state(false);

  // ── Active Player Session State (NULL until authenticated — ZERO DATA LEAKAGE) ─
  let character = $state<PlayerCharacter | null>(null);

  // Safe Derived Initiative: Standard 5e DEX by default, or tri-stat mental if enabled
  let initiativeMod = $derived.by(() => {
    if (!character) return 0;
    if (rulesEngine.isEnabled('enableTriStatInitiative')) {
      const c = character.class.toLowerCase();
      if (c.includes('wizard')) return Math.floor((character.int - 10) / 2);
      if (c.includes('cleric') || c.includes('druid')) return Math.floor((character.wis - 10) / 2);
      if (c.includes('sorcerer') || c.includes('warlock') || c.includes('bard')) return Math.floor((character.cha - 10) / 2);
    }
    return Math.floor((character.dex - 10) / 2);
  });

  let initiativeLabel = $derived.by(() => {
    if (!character) return '+0 (DEX)';
    if (rulesEngine.isEnabled('enableTriStatInitiative')) {
      const c = character.class.toLowerCase();
      if (c.includes('wizard')) {
        const mod = Math.floor((character.int - 10) / 2);
        return mod >= 0 ? `+${mod} (INT)` : `${mod} (INT)`;
      }
      if (c.includes('cleric') || c.includes('druid')) {
        const mod = Math.floor((character.wis - 10) / 2);
        return mod >= 0 ? `+${mod} (WIS)` : `${mod} (WIS)`;
      }
      if (c.includes('sorcerer') || c.includes('warlock') || c.includes('bard')) {
        const mod = Math.floor((character.cha - 10) / 2);
        return mod >= 0 ? `+${mod} (CHA)` : `${mod} (CHA)`;
      }
    }
    const mod = Math.floor((character.dex - 10) / 2);
    return mod >= 0 ? `+${mod} (DEX)` : `${mod} (DEX)`;
  });

  // Equipment & Companions
  let equipment = $state<PlayerItem[]>([]);
  let companions = $state<CompanionAnimal[]>([]);

  // Resource Bubbles
  let spellSlots = $state<Array<{ level: number; total: number; used: number }>>([]);
  let classResources = $state<Array<{ id: string; name: string; total: number; used: number }>>([]);

  // Dice Mode: Digital Tray vs Physical Reference
  let isDigitalDiceEnabled = $state(true);
  let latestRollResult = $state<{ formula: string; result: number; rolls: number[]; isCrit?: boolean } | null>(null);

  // Session Notes (LocalStorage Keyed by Character ID)
  let personalNotes = $state('');
  $effect(() => {
    if (character && typeof localStorage !== 'undefined') {
      personalNotes = localStorage.getItem(`vtt_player_notes_${character.id}`) || '';
    }
  });

  function handleNotesInput(e: Event) {
    const val = (e.target as HTMLTextAreaElement).value;
    personalNotes = val;
    if (character && typeof localStorage !== 'undefined') {
      localStorage.setItem(`vtt_player_notes_${character.id}`, val);
    }
  }

  // UI Drawers & Modals
  let isStatsDrawerOpen = $state(false);
  let isWhispersDrawerOpen = $state(false);
  let isManaModalOpen = $state(false);
  let isSpellbookOpen = $state(false);
  let isDowntimeOpen = $state(false);
  let activeWhisperAlert = $state<WhisperMessage | null>(null);

  // Incoming Broadcast Handout Modal
  let broadcastHandout = $state<any | null>(null);

  // ── Peer-to-Peer Trading State ─────────────────────────────────────────────
  let tradingItemId = $state<string | null>(null);
  let tradeTargetAllyId = $state('');
  let tradeQuantity = $state(1);
  let tradeToast = $state<string | null>(null);
  let partyRoster = $state<Array<{ id: string; name: string; class: string; level: number; pin: string; isOrbSealed?: boolean }>>([]);

  function loadPartyRoster() {
    if (typeof localStorage === 'undefined') return;
    try {
      const raw = localStorage.getItem('vtt_party_roster');
      if (raw) partyRoster = JSON.parse(raw);
    } catch {
      partyRoster = [];
    }
  }

  let availableAllies = $derived(
    partyRoster.filter(m => m.id !== character?.id && !m.isOrbSealed)
  );

  let incomingTrade = $derived(
    $activeTradeOfferStore && character && $activeTradeOfferStore.receiver_id === character.id
      ? $activeTradeOfferStore
      : null
  );

  let totalCarriedWeight = $derived(
    equipment.reduce((sum, item) => sum + (Number(item.weight) || 1.0) * (Number(item.quantity) || 1), 0)
  );

  let carryingCapacity = $derived((character?.str || 10) * 15);
  let encumberedThreshold = $derived((character?.str || 10) * 5);

  let incomingEncumbrance = $derived.by(() => {
    if (!incomingTrade || !character) return null;
    const addWeight = (Number(incomingTrade.item.weight) || 1.0) * (Number(incomingTrade.quantity) || 1);
    const newWeight = Math.round((totalCarriedWeight + addWeight) * 10) / 10;
    const isHeavy = newWeight > carryingCapacity;
    const isEnc = newWeight > encumberedThreshold;
    return {
      current: Math.round(totalCarriedWeight * 10) / 10,
      added: Math.round(addWeight * 10) / 10,
      newTotal: newWeight,
      capacity: carryingCapacity,
      status: isHeavy ? 'Heavily Encumbered' : isEnc ? 'Encumbered' : 'Unencumbered',
      isWarning: isHeavy,
    };
  });

  // Live Combat Turn Order
  let liveCombat = $derived($combatTurnStore);
  let isMyTurn = $derived(
    Boolean(
      character &&
      liveCombat?.combatants?.some(
        c => c.is_active && (c.name.toLowerCase() === character!.name.toLowerCase() || c.id === character!.id)
      )
    )
  );

  // ── Setup Class-Specific Equipment & Slots ─────────────────────────────────
  function setupEquipmentAndResources(char: PlayerCharacter) {
    const baseClass = char.class.toLowerCase();

    if (baseClass.includes('wizard')) {
      equipment = [
        { id: 'eq-1', name: 'Arcane Focus Staff', type: 'weapon', currentRp: 15, maxRp: 15, attackBonus: 5, damageFormula: '1d6+2', damageType: 'bludgeoning', description: 'Carved with warding runes.' },
        { id: 'eq-2', name: 'Scholar Robes', type: 'armor', currentRp: 10, maxRp: 10, acBonus: 0, description: 'Supple woven cloth.' },
        { id: 'eq-3', name: 'Silver Dagger', type: 'weapon', currentRp: 10, maxRp: 10, attackBonus: 5, damageFormula: '1d4+2', damageType: 'piercing', description: 'Simple emergency blade.' },
      ];
      spellSlots = [
        { level: 1, total: 4, used: 1 },
        { level: 2, total: 3, used: 0 },
        { level: 3, total: 2, used: 0 },
      ];
      classResources = [
        { id: 'arcane-recovery', name: 'Arcane Recovery', total: 1, used: 0 },
        { id: 'sculpt-spells', name: 'Sculpt Spells', total: 3, used: 0 },
      ];
    } else if (baseClass.includes('fighter')) {
      equipment = [
        { id: 'eq-1', name: 'Steel Longsword', type: 'weapon', currentRp: 20, maxRp: 20, attackBonus: 7, damageFormula: '1d8+4', damageType: 'slashing', description: 'Well-balanced martial blade.' },
        { id: 'eq-2', name: 'Chain Mail Armor', type: 'armor', currentRp: 25, maxRp: 25, acBonus: 6, description: 'Interlocking steel rings. Fully functional standard armor.' },
        { id: 'eq-3', name: 'Heavy Iron Shield', type: 'armor', currentRp: 15, maxRp: 15, acBonus: 2, description: 'Reinforced wood and iron.' },
      ];
      spellSlots = [];
      classResources = [
        { id: 'second-wind', name: 'Second Wind', total: 1, used: 0 },
        { id: 'action-surge', name: 'Action Surge', total: 1, used: 0 },
        { id: 'superiority-dice', name: 'Superiority Dice (d8)', total: 4, used: 1 },
      ];
    } else if (baseClass.includes('barbarian')) {
      equipment = [
        { id: 'eq-1', name: 'Greataxe of Cleaving', type: 'weapon', currentRp: 25, maxRp: 25, attackBonus: 7, damageFormula: '1d12+4', damageType: 'slashing', description: 'Heavy two-handed greataxe.' },
        { id: 'eq-2', name: 'Fur & Hide Garb', type: 'armor', currentRp: 15, maxRp: 15, acBonus: 2, description: 'Unarmored defense padding.' },
        { id: 'eq-3', name: 'Throwing Handaxe', type: 'weapon', currentRp: 12, maxRp: 12, attackBonus: 7, damageFormula: '1d6+4', damageType: 'slashing', description: 'Balanced handaxe.' },
      ];
      spellSlots = [];
      classResources = [
        { id: 'rage', name: 'Rage (Bonus Dmg +2)', total: 3, used: 0 },
        { id: 'reckless-attack', name: 'Reckless Attack', total: 1, used: 0 },
      ];
    } else if (baseClass.includes('monk')) {
      equipment = [
        { id: 'eq-1', name: 'Quarterstaff of Flowing Water', type: 'weapon', currentRp: 15, maxRp: 15, attackBonus: 6, damageFormula: '1d8+3', damageType: 'bludgeoning', description: 'Versatile monastery staff.' },
        { id: 'eq-2', name: 'Unarmed Strike Wraps', type: 'weapon', currentRp: 20, maxRp: 20, attackBonus: 6, damageFormula: '1d6+3', damageType: 'bludgeoning', description: 'Reinforced hand wraps.' },
        { id: 'eq-3', name: 'Monk Vestments', type: 'armor', currentRp: 10, maxRp: 10, acBonus: 0, description: 'Lightweight linen robes.' },
      ];
      spellSlots = [];
      classResources = [
        { id: 'ki-points', name: 'Ki Points (Total Pool)', total: 5, used: 1 },
        { id: 'flurry-of-blows', name: 'Flurry of Blows (1 Ki)', total: 1, used: 0 },
        { id: 'patient-defense', name: 'Patient Defense (1 Ki)', total: 1, used: 0 },
        { id: 'step-of-the-wind', name: 'Step of the Wind (1 Ki)', total: 1, used: 0 },
      ];
    } else if (baseClass.includes('cleric')) {
      equipment = [
        { id: 'eq-1', name: 'Blessed Warhammer', type: 'weapon', currentRp: 20, maxRp: 20, attackBonus: 6, damageFormula: '1d8+3', damageType: 'bludgeoning', description: 'Engraved with deity iconography.' },
        { id: 'eq-2', name: 'Scale Mail', type: 'armor', currentRp: 18, maxRp: 20, acBonus: 4, description: 'Overlapping brass scales.' },
        { id: 'eq-3', name: 'Holy Relic Shield', type: 'armor', currentRp: 15, maxRp: 15, acBonus: 2, description: 'Blessed steel shield with holy crest.' },
      ];
      spellSlots = [
        { level: 1, total: 4, used: 1 },
        { level: 2, total: 3, used: 1 },
        { level: 3, total: 2, used: 0 },
      ];
      classResources = [
        { id: 'channel-divinity', name: 'Channel Divinity', total: 2, used: 0 },
        { id: 'divine-domain', name: 'Domain Power', total: 3, used: 1 },
      ];
    } else {
      // Rogue / Default
      equipment = [
        { id: 'eq-1', name: 'Shadowforged Rapier', type: 'weapon', currentRp: 15, maxRp: 20, attackBonus: 7, damageFormula: '1d8+4', damageType: 'piercing', description: 'Finesse, light. Cold wrought dark steel.' },
        { id: 'eq-2', name: 'Studded Leather Armor', type: 'armor', currentRp: 25, maxRp: 25, acBonus: 2, description: 'Reinforced with iron rivets. Supple and sound.' },
        { id: 'eq-3', name: 'Dagger of Subtlety', type: 'weapon', currentRp: 10, maxRp: 10, attackBonus: 7, damageFormula: '1d4+4', damageType: 'piercing', description: 'Easily concealed beneath cloak.' },
      ];
      spellSlots = [
        { level: 1, total: 4, used: 1 },
        { level: 2, total: 3, used: 0 },
        { level: 3, total: 2, used: 1 },
      ];
      classResources = [
        { id: 'sneak-attack', name: 'Sneak Attack (3d6)', total: 1, used: 0 },
        { id: 'cunning-action', name: 'Cunning Action', total: 1, used: 0 },
        { id: 'mage-hand-legerdemain', name: 'Mage Hand Trick', total: 1, used: 0 },
      ];
    }
  }

  // ── Authorization Pipeline & Lifecycle ──────────────────────────────────────
  onMount(() => {
    // 1. Check URL for Jackbox-style ?pin=XXXX or cached session in localStorage
    const urlParams = new URLSearchParams(window.location.search);
    const pinParam = urlParams.get('pin');
    const cachedPin = typeof localStorage !== 'undefined' ? localStorage.getItem('vtt_active_pin') : null;

    if (pinParam !== null) {
      const pinStr = String(pinParam).trim();
      // Only auto-authenticate if the URL param is a valid 4-digit numeric PIN
      // — silently ignore malformed params to avoid spurious "Wrong PIN" shakes
      if (/^\d{4}$/.test(pinStr)) {
        enteredPin = pinStr;
        attemptPinLogin(pinStr);
      }
      // else: malformed ?pin= — fall through to manual keypad, no error shown
    } else if (cachedPin && cachedPin.length === 4) {
      enteredPin = cachedPin;
      attemptPinLogin(cachedPin);
    }

    // 2. Listen for Handout Broadcasts
    const handleBroadcast = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail && isAuthenticated) {
        broadcastHandout = detail;
        audioEngine.triggerSfx('sfx-secret');
      }
    };
    const handleDismiss = () => { broadcastHandout = null; };

    // 3. Listen for DM Whispers (only deliver if target matches authenticated character)
    const handleWhisper = (e: Event) => {
      const whisper = (e as CustomEvent<WhisperMessage>).detail;
      if (!whisper || !isAuthenticated || !character) return;
      if (!whisper.target_pin || whisper.target_pin === character.pin || whisper.target_character_id === character.id) {
        activeWhisperAlert = whisper;
        audioEngine.triggerSfx('sfx-bell');
        setTimeout(() => { activeWhisperAlert = null; }, 6000);
      }
    };

    // 4. Listen for explicit WebSocket Auth Rejection
    const handleAuthFailure = (e: Event) => {
      const detail = (e as CustomEvent<{ message?: string }>).detail;
      triggerAuthFailure(detail?.message || 'Wrong PIN');
    };

    // 5. Listen for Black Orb Temporal Extraction events
    const handleBlackOrbToggle = (e: Event) => {
      const detail = (e as CustomEvent<{ character_id: string; is_orb_sealed: boolean }>).detail;
      if (detail && character && detail.character_id === character.id) {
        character.isOrbSealed = detail.is_orb_sealed;
        if (detail.is_orb_sealed) {
          audioEngine.triggerSfx('sfx-secret');
        } else {
          audioEngine.triggerSfx('sfx-bell');
        }
      }
    };

    window.addEventListener('vtt:handout-broadcast', handleBroadcast);
    window.addEventListener('vtt:handout-dismiss', handleDismiss);
    window.addEventListener('vtt:dm-whisper', handleWhisper);
    window.addEventListener('vtt:auth-failure', handleAuthFailure);
    window.addEventListener('vtt:black-orb-toggle', handleBlackOrbToggle);

    loadPartyRoster();

    const handleRosterUpdate = () => {
      loadPartyRoster();
    };

    const handleInventoryUpdate = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (character && (!detail || detail.characterId === character.id)) {
        loadCharacterInventory(character.id);
      }
    };

    window.addEventListener('vtt:roster-updated', handleRosterUpdate);
    window.addEventListener('vtt:inventory-updated', handleInventoryUpdate);

    // 6. Resilient Networking: periodic 15-second heartbeat ping over the session channel
    const heartbeatTimer = setInterval(() => {
      if (isAuthenticated) {
        sendWsEvent({
          type: 'PING',
          payload: { timestamp: Date.now(), pin: enteredPin || character?.pin }
        });
      } else {
        // Auto-reconnect with cached PIN if connection drops
        const savedPin = typeof localStorage !== 'undefined' ? localStorage.getItem('vtt_active_pin') : null;
        if (savedPin && savedPin.length === 4 && !isConnecting) {
          attemptPinLogin(savedPin);
        }
      }
    }, 15000);

    // 7. Tab-Sleep & Network Reconnection: reconnect automatically when tab wakes up or network recovers
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        const savedPin = localStorage.getItem('vtt_active_pin');
        if (savedPin && (!isAuthenticated || !character)) {
          attemptPinLogin(savedPin);
        } else if (savedPin && isAuthenticated) {
          sendWsEvent({
            type: 'PING',
            payload: { timestamp: Date.now(), pin: savedPin, wake: true }
          });
        }
      }
    };

    const handleOnline = () => {
      const savedPin = typeof localStorage !== 'undefined' ? localStorage.getItem('vtt_active_pin') : null;
      if (savedPin && savedPin.length === 4 && (!isAuthenticated || !character)) {
        attemptPinLogin(savedPin);
      }
    };

    const unbindHotkeys = hotkeyManager.init();

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('online', handleOnline);

    return () => {
      unbindHotkeys();
      clearInterval(heartbeatTimer);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('vtt:handout-broadcast', handleBroadcast);
      window.removeEventListener('vtt:handout-dismiss', handleDismiss);
      window.removeEventListener('vtt:dm-whisper', handleWhisper);
      window.removeEventListener('vtt:auth-failure', handleAuthFailure);
      window.removeEventListener('vtt:black-orb-toggle', handleBlackOrbToggle);
      window.removeEventListener('vtt:roster-updated', handleRosterUpdate);
      window.removeEventListener('vtt:inventory-updated', handleInventoryUpdate);
    };
  });

  function triggerAuthFailure(msg = 'Wrong PIN') {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem('vtt_active_pin');
    }
    authError = msg;
    isShaking = true;
    enteredPin = '';
    isAuthenticated = false;
    character = null;
    isConnecting = false;
    audioEngine.triggerSfx('sfx-failure');
    setTimeout(() => {
      isShaking = false;
    }, 500);
  }

  function attemptPinLogin(pinToVerify: string) {
    const pin = String(pinToVerify).trim();
    if (!pin || pin.length !== 4 || !/^\d{4}$/.test(pin)) {
      triggerAuthFailure('Wrong PIN');
      return;
    }

    authError = '';
    isConnecting = true;

    // Connect WebSocket targeting ws://<HOST>:8080/ws?pin=XXXX
    initWebSocket(pin);

    // Verify against local party roster storage
    try {
      const rawRoster = localStorage.getItem('vtt_party_roster');
      if (rawRoster) {
        const roster = JSON.parse(rawRoster);
        const match = roster.find((m: any) => String(m.pin).trim() === String(pin).trim());
        if (match) {
          const isStowed = Boolean(match.isOrbSealed || match.isStowed || match.inReserve);
          if (isStowed) {
            triggerAuthFailure('Character is currently in reserve. Contact the DM to return to active play.');
            return;
          }
          const baseClass = match.class || 'Adventurer';
          character = {
            id: match.id,
            name: match.name,
            playerName: match.playerName || 'Player',
            class: baseClass,
            level: match.level || 1,
            hpCurrent: match.hpCurrent ?? match.hpMax ?? 20,
            hpMax: match.hpMax || 20,
            tempHp: 0,
            ac: match.ac || 10,
            speed: match.speed || 30,
            passivePerception: match.passivePerception || 10,
            pin: match.pin,
            str: match.str || 10,
            dex: match.dex || (baseClass.includes('Rogue') ? 18 : 12),
            con: match.con || 14,
            int: match.int || (baseClass.includes('Wizard') ? 18 : 12),
            wis: match.wis || (baseClass.includes('Cleric') ? 18 : 12),
            cha: match.cha || 10,
            savingThrows: match.savingThrows || (baseClass.includes('Rogue') ? ['DEX', 'INT'] : ['STR', 'CON']),
            exhaustion: match.exhaustion || 0,
            hitDiceCurrent: match.level || 1,
            hitDiceMax: match.level || 1,
            isOrbSealed: Boolean(match.isOrbSealed),
          };

          setupEquipmentAndResources(character);
          loadCharacterInventory(character.id);
          if (typeof localStorage !== 'undefined') {
            localStorage.setItem('vtt_active_pin', pin);
          }
          isAuthenticated = true;
          isConnecting = false;
          authError = '';
          audioEngine.triggerSfx('sfx-rest');
          return;
        }
      }
    } catch {
      // storage parsing fallback
    }

    // No match found in registered roster -> strictly reject access
    dispatchAuthFailure('Wrong PIN');
    triggerAuthFailure('Wrong PIN');
  }

  function handleKeypadPress(num: string) {
    if (enteredPin.length < 4) {
      enteredPin += num;
      authError = '';
      if (enteredPin.length === 4) {
        attemptPinLogin(enteredPin);
      }
    }
  }

  function handleKeypadBackspace() {
    enteredPin = enteredPin.slice(0, -1);
    authError = '';
  }

  function disconnect() {
    isAuthenticated = false;
    character = null;
    enteredPin = '';
    authError = '';
  }

  // ── Inventory Loading & Synchronization ────────────────────────────────────
  function loadCharacterInventory(charId: string) {
    const pack = sessionStore.getPlayerPack(charId);
    if (pack && pack.length > 0) {
      equipment = pack.map((p: any) => ({
        id: p.id,
        name: p.name,
        type: p.type || 'gear',
        category: p.category,
        rarity: p.rarity,
        quantity: p.quantity || 1,
        weight: p.weight !== undefined ? p.weight : 1.0,
        currentRp: p.currentRp !== undefined ? p.currentRp : p.current_rp ?? 15,
        maxRp: p.maxRp !== undefined ? p.maxRp : p.max_rp ?? 15,
        attackBonus: p.attackBonus,
        damageFormula: p.damageFormula,
        damageType: p.damageType,
        acBonus: p.acBonus,
        description: p.description || '',
        isPerishable: p.isPerishable,
        harvestTimestamp: p.harvestTimestamp,
        essenceTag: p.essenceTag,
      }));
    } else {
      // Seed initial equipment to player pack storage
      for (const item of equipment) {
        sessionStore.addItemToPlayerPack(charId, item);
      }
    }
  }

  // ── Peer-to-Peer Trading Handlers ──────────────────────────────────────────
  function handleInitiateSendOffer(item: PlayerItem) {
    if (!tradeTargetAllyId && availableAllies.length > 0) {
      tradeTargetAllyId = availableAllies[0].id;
    }
    tradingItemId = tradingItemId === item.id ? null : item.id;
    tradeQuantity = 1;
  }

  function handleConfirmSendOffer(item: PlayerItem) {
    if (!character || !tradeTargetAllyId) return;
    const targetAlly = partyRoster.find(m => m.id === tradeTargetAllyId);
    if (!targetAlly) return;

    const qty = Math.min(item.quantity || 1, Math.max(1, Number(tradeQuantity) || 1));

    sendTradeOffer({
      sender_id: character.id,
      sender_name: character.name,
      receiver_id: targetAlly.id,
      receiver_name: targetAlly.name,
      item: {
        ...item,
        id: item.id,
        name: item.name,
        type: item.type as any,
        category: item.category || 'Gear',
        rarity: (item.rarity as any) || 'Common',
        weight: item.weight || 1.0,
        description: item.description,
        currentRp: item.currentRp,
        maxRp: item.maxRp,
        attackBonus: item.attackBonus,
        damageFormula: item.damageFormula,
        damageType: item.damageType,
        acBonus: item.acBonus,
        isPerishable: item.isPerishable,
        harvestTimestamp: item.harvestTimestamp,
        essenceTag: item.essenceTag,
        quantity: qty,
      },
      quantity: qty,
      notes: `Trade offer from ${character.name}`,
    });

    audioEngine.triggerSfx('sfx-rest');
    tradeToast = `Sent trade offer of ${qty}x ${item.name} to ${targetAlly.name}!`;
    tradingItemId = null;
    setTimeout(() => { tradeToast = null; }, 4000);
  }

  function handleAcceptIncomingTrade() {
    if (!incomingTrade) return;
    const res = acceptTradeOffer(incomingTrade);
    if (res.success) {
      audioEngine.triggerSfx('sfx-bell');
      if (character) loadCharacterInventory(character.id);
      tradeToast = `Accepted ${incomingTrade.quantity}x ${incomingTrade.item.name} from ${incomingTrade.sender_name}!`;
      setTimeout(() => { tradeToast = null; }, 4000);
    } else {
      tradeToast = `Trade error: ${res.error || 'Failed to complete trade'}`;
      setTimeout(() => { tradeToast = null; }, 4000);
    }
  }

  function handleDeclineIncomingTrade() {
    if (!incomingTrade) return;
    declineTradeOffer(incomingTrade, 'Declined by recipient');
    audioEngine.triggerSfx('sfx-sword');
    tradeToast = `Declined trade offer from ${incomingTrade.sender_name}.`;
    setTimeout(() => { tradeToast = null; }, 3000);
  }

  // ── Character State Mutations (Aleamos Rules) ──────────────────────────────
  function modifyHp(delta: number) {
    if (!character) return;
    const { nextHp, nextExhaustion, exhaustionTriggered } = applyHpMutationWithExhaustionCheck(
      character.hpCurrent,
      delta,
      character.hpMax,
      character.exhaustion
    );

    character.hpCurrent = nextHp;
    if (exhaustionTriggered) {
      character.exhaustion = nextExhaustion;
      audioEngine.triggerSfx('sfx-combat');
    } else {
      audioEngine.triggerSfx(delta < 0 ? 'sfx-sword' : 'sfx-rest');
    }

    // Broadcast updated HP to DM workstation over WebSocket
    sendWsEvent({
      type: 'HP_UPDATE',
      character_id: character.id,
      current_hp: character.hpCurrent,
      temp_hp: character.tempHp,
      exhaustion_level: character.exhaustion,
    });
  }

  function modifyTempHp(delta: number) {
    if (!character) return;
    character.tempHp = Math.max(0, character.tempHp + delta);
    audioEngine.triggerSfx('sfx-spell');
    sendWsEvent({
      type: 'HP_UPDATE',
      character_id: character.id,
      current_hp: character.hpCurrent,
      temp_hp: character.tempHp,
      exhaustion_level: character.exhaustion,
    });
  }

  function spendHitDie() {
    if (!character || character.hitDiceCurrent <= 0) return;
    const conMod = Math.floor((character.con - 10) / 2);
    const dieRoll = Math.floor(Math.random() * 8) + 1;
    const healing = Math.max(1, dieRoll + conMod);
    character.hitDiceCurrent -= 1;
    modifyHp(healing);
    audioEngine.triggerSfx('sfx-rest');
    sendWsEvent({
      type: 'DICE_ROLL',
      character_id: character.id,
      character_name: character.name,
      formula: `Hit Die 1d8+${conMod}`,
      result: healing,
      breakdown: `[${dieRoll}] + ${conMod} CON`,
    });
  }

  function rollWeaponAttack(item: PlayerItem) {
    if (!character || item.attackBonus === undefined) return;
    const attackBonus = item.attackBonus || 0;
    const d20 = Math.floor(Math.random() * 20) + 1;
    const total = d20 + attackBonus;
    const isCrit = d20 === 20;

    latestRollResult = {
      formula: `${item.name} (1d20${attackBonus >= 0 ? '+' : ''}${attackBonus})`,
      result: total,
      rolls: [d20],
      isCrit,
    };
    audioEngine.triggerSfx(isCrit ? 'sfx-critical' : 'sfx-sword');
    sendWsEvent({
      type: 'DICE_ROLL',
      character_id: character.id,
      character_name: character.name,
      formula: `${item.name} Attack (1d20${attackBonus >= 0 ? '+' : ''}${attackBonus})`,
      result: total,
      is_critical: isCrit,
      breakdown: `[${d20}] + ${attackBonus} (${item.damageFormula})`,
    });
  }

  function toggleSpellSlot(levelIdx: number, slotIdx: number) {
    const slot = spellSlots[levelIdx];
    if (!slot) return;
    if (slot.used > slotIdx) {
      slot.used = slotIdx; // Unspend
    } else {
      slot.used = slotIdx + 1; // Spend
      audioEngine.triggerSfx('sfx-spell');
    }
  }

  function toggleClassResource(resId: string) {
    const res = classResources.find(r => r.id === resId);
    if (!res) return;
    if (res.used < res.total) {
      res.used += 1;
      audioEngine.triggerSfx('sfx-bell');
    } else {
      res.used = 0; // Reset
    }
  }

  function triggerSafeHavenRest() {
    if (!character) return;
    character.hpCurrent = character.hpMax;
    character.tempHp = 0;
    character.exhaustion = Math.max(0, character.exhaustion - 1);
    character.hitDiceCurrent = character.hitDiceMax;
    spellSlots.forEach(s => { s.used = 0; });
    classResources.forEach(r => { r.used = 0; });
    audioEngine.triggerSfx('sfx-rest');
    sendWsEvent({
      type: 'HP_UPDATE',
      character_id: character.id,
      current_hp: character.hpCurrent,
      temp_hp: 0,
      exhaustion_level: character.exhaustion,
    });
  }

  function triggerCampRest() {
    if (!character) return;
    // Camp Rest in Wilds recovers half hit dice & spell slots, but does NOT remove exhaustion without sanctuary
    character.hpCurrent = Math.min(character.hpMax, character.hpCurrent + Math.floor(character.hpMax * 0.5));
    character.tempHp = 0;
    character.hitDiceCurrent = Math.min(character.hitDiceMax, character.hitDiceCurrent + Math.max(1, Math.floor(character.hitDiceMax * 0.5)));
    spellSlots.forEach(s => { s.used = Math.floor(s.used / 2); });
    classResources.forEach(r => { r.used = 0; });
    audioEngine.triggerSfx('sfx-rest');
    sendWsEvent({
      type: 'HP_UPDATE',
      character_id: character.id,
      current_hp: character.hpCurrent,
      temp_hp: 0,
      exhaustion_level: character.exhaustion,
    });
  }

  // ── Digital Dice Roller ───────────────────────────────────────────────────
  function rollDice(sides: number) {
    if (!character) return;
    const roll = Math.floor(Math.random() * sides) + 1;
    const isCrit = sides === 20 && roll === 20;

    latestRollResult = {
      formula: `1d${sides}`,
      result: roll,
      rolls: [roll],
      isCrit,
    };

    audioEngine.triggerSfx('sfx-dice');

    // Broadcast roll to DM Workstation terminal
    sendWsEvent({
      type: 'DICE_ROLL',
      character_id: character.id,
      character_name: character.name,
      formula: `1d${sides}`,
      result: roll,
      is_critical: isCrit,
      breakdown: `[${roll}]`,
    });
  }
</script>

<style>
  @keyframes shake {
    0%, 100% { transform: translateX(0); }
    20%, 60% { transform: translateX(-9px); }
    40%, 80% { transform: translateX(9px); }
  }
  .shake-field {
    animation: shake 0.4s cubic-bezier(0.36, 0.07, 0.19, 0.97) both;
  }
</style>

<div class="h-screen w-full bg-slate-950 text-slate-100 font-sans select-none flex flex-col overflow-hidden">

  <!-- ═════════════════════════════════════════════════════════════════════════
       GATEWAY: HARDENED PIN ENTRY (ZERO DATA LEAKAGE)
  ══════════════════════════════════════════════════════════════════════════ -->
  {#if !isAuthenticated || !character}
    <div class="flex-1 flex flex-col items-center justify-center p-6 max-w-sm mx-auto w-full space-y-6 animate-in fade-in duration-200">
      
      <!-- Brand Header: ZERO Campaign / Character / Party Leakage -->
      <div class="text-center space-y-2">
        <div class="w-16 h-16 rounded-2xl bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center text-3xl mx-auto shadow-lg shadow-indigo-600/10">
          🛡️
        </div>
        <h1 class="text-xl font-black text-slate-100 uppercase tracking-widest">ALEAMOS COMPANION</h1>
        <p class="text-xs text-slate-400">Enter your 4-digit table PIN to connect</p>
      </div>

      <!-- PIN Display / Input Box with Shake on Rejection -->
      <div class="w-full bg-slate-900 border rounded-2xl p-4 text-center shadow-xl transition-all {isShaking
        ? 'shake-field border-rose-500 bg-rose-950/20 shadow-rose-950/50'
        : 'border-slate-800'}">
        <div class="flex justify-center gap-3">
          {#each [0, 1, 2, 3] as idx}
            <div class="w-12 h-14 rounded-xl border flex items-center justify-center text-2xl font-mono font-black transition-all {enteredPin.length > idx
              ? 'bg-indigo-600/30 border-indigo-500 text-indigo-200 shadow-sm'
              : 'bg-slate-950 border-slate-800 text-slate-600'}">
              {enteredPin[idx] ? '●' : ''}
            </div>
          {/each}
        </div>

        {#if authError}
          <div class="mt-3.5 inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-rose-950 border border-rose-600/70 text-rose-300 font-bold text-xs shadow-md animate-pulse">
            <span>🚫</span>
            <span>{authError}</span>
          </div>
        {/if}
      </div>

      <!-- Prominent CONNECT Button -->
      <button
        onclick={() => attemptPinLogin(enteredPin)}
        disabled={isConnecting}
        class="w-full py-3.5 rounded-2xl bg-indigo-600 hover:bg-indigo-500 active:scale-98 text-white font-black text-xs uppercase tracking-widest shadow-lg shadow-indigo-600/30 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
      >
        {#if isConnecting}
          <span class="animate-spin text-sm">⏳</span>
          <span>CONNECTING...</span>
        {:else}
          <span>🔑</span>
          <span>CONNECT</span>
        {/if}
      </button>

      <!-- Touch Numeric Keypad -->
      <div class="w-full grid grid-cols-3 gap-2.5">
        {#each ['1', '2', '3', '4', '5', '6', '7', '8', '9'] as digit}
          <button
            onclick={() => handleKeypadPress(digit)}
            class="h-14 rounded-2xl bg-slate-900 hover:bg-slate-800 active:scale-95 border border-slate-800/80 text-xl font-black font-mono text-slate-200 transition-all shadow-sm"
          >
            {digit}
          </button>
        {/each}

        <button
          onclick={() => { enteredPin = ''; authError = ''; }}
          class="h-14 rounded-2xl bg-slate-900/60 hover:bg-slate-800 text-xs font-bold uppercase text-slate-400 transition-all"
        >
          Clear
        </button>

        <button
          onclick={() => handleKeypadPress('0')}
          class="h-14 rounded-2xl bg-slate-900 hover:bg-slate-800 active:scale-95 border border-slate-800/80 text-xl font-black font-mono text-slate-200 transition-all shadow-sm"
        >
          0
        </button>

        <button
          onclick={handleKeypadBackspace}
          class="h-14 rounded-2xl bg-slate-900/60 hover:bg-slate-800 text-base font-bold text-slate-400 transition-all flex items-center justify-center"
        >
          ⌫
        </button>
      </div>
    </div>

  <!-- ═════════════════════════════════════════════════════════════════════════
       AUTHENTICATED: MOBILE CHARACTER HUD & COMBAT PORTAL
  ══════════════════════════════════════════════════════════════════════════ -->
  {:else}

    <!-- ═════════════════════════════════════════════════════════════════════════
         RESERVE / BLACK ORB SUSPENDED ANIMATION OVERLAY
    ══════════════════════════════════════════════════════════════════════════ -->
    {#if character.isOrbSealed}
      <div class="fixed inset-0 bg-slate-950/95 backdrop-blur-md z-50 flex flex-col items-center justify-center p-6 text-center space-y-5 animate-in fade-in duration-300">
        <div class="w-24 h-24 rounded-full {rulesEngine.isEnabled('enableBlackOrbRoster') ? 'bg-purple-950/80 border-purple-500/80 shadow-purple-600/40' : 'bg-slate-900 border-slate-700 shadow-slate-700/40'} border-2 flex items-center justify-center text-5xl shadow-2xl animate-pulse">
          {#if rulesEngine.isEnabled('enableBlackOrbRoster')}🔮{:else}🛡️{/if}
        </div>
        <div class="space-y-2 max-w-sm">
          <span class="px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider {rulesEngine.isEnabled('enableBlackOrbRoster') ? 'bg-purple-950 text-purple-300 border-purple-800/80' : 'bg-slate-800 text-slate-300 border-slate-700'} border">
            {#if rulesEngine.isEnabled('enableBlackOrbRoster')}Temporal Amnesia Protocol Active{:else}Reserve Status Active{/if}
          </span>
          <h2 class="text-xl font-black text-slate-100 tracking-wide">
            {#if rulesEngine.isEnabled('enableBlackOrbRoster')}Suspended in the Black Orb{:else}Character in Reserve{/if}
          </h2>
          <p class="text-xs text-amber-200/90 leading-relaxed font-semibold">
            Character is currently in reserve. Contact the DM to return to active play.
          </p>
        </div>
        <div class="p-3 rounded-xl bg-slate-900 border border-slate-800/80 text-[11px] text-slate-400 font-mono">
          Session state: <strong class="{rulesEngine.isEnabled('enableBlackOrbRoster') ? 'text-purple-300' : 'text-amber-300'}">{rulesEngine.isEnabled('enableBlackOrbRoster') ? 'ORB_STOWED' : 'RESERVE_STOWED'}</strong> · Session locked until DM release
        </div>
      </div>
    {/if}

    <!-- ── Live Combat Turn Order Banner ────────────────────────────────── -->
    {#if liveCombat && liveCombat.combatants && liveCombat.combatants.length > 0}
      {@const activeCombatant = liveCombat.combatants.find(c => c.is_active)}
      {@const onDeckCombatant = liveCombat.combatants.find(c => c.is_on_deck)}
      <div class="px-4 py-2 border-b transition-all {isMyTurn
        ? 'bg-amber-950/70 border-amber-500 shadow-md shadow-amber-500/20 animate-pulse'
        : 'bg-slate-900 border-slate-800'}">
        <div class="flex items-center justify-between text-xs">
          <div class="flex items-center gap-2">
            <span class="px-2 py-0.5 rounded bg-slate-950 border border-slate-800 font-mono font-bold text-[10px] text-amber-300">
              RND {liveCombat.round}
            </span>
            <div class="flex items-center gap-1.5">
              <span class="text-[10px] uppercase font-bold text-slate-400">Active:</span>
              <span class="font-bold {isMyTurn ? 'text-amber-300 font-black' : 'text-slate-200'}">
                {activeCombatant ? (activeCombatant.is_hidden ? 'Unknown Creature' : activeCombatant.name) : 'None'}
              </span>
              {#if isMyTurn}
                <span class="px-1.5 py-0.2 rounded bg-amber-500 text-slate-950 font-black text-[9px] uppercase tracking-wider">
                  YOUR TURN
                </span>
              {/if}
            </div>
          </div>

          {#if onDeckCombatant}
            <div class="text-[10px] text-slate-400 hidden sm:block">
              <span class="uppercase">On Deck:</span>
              <span class="font-semibold text-slate-300 ml-1">
                {onDeckCombatant.is_hidden ? 'Unknown' : onDeckCombatant.name}
              </span>
            </div>
          {/if}
        </div>
      </div>
    {/if}

    <!-- ── Live Trade Notification Banner ─────────────────────────────────── -->
    {#if tradeToast}
      <div class="px-4 py-2 bg-indigo-950 border-b border-indigo-700/60 text-center text-xs font-bold text-indigo-300 animate-pulse shrink-0">
        ⚡ {tradeToast}
      </div>
    {/if}

    <!-- ── Mobile Character HUD Header ───────────────────────────────────── -->
    <header class="h-14 bg-slate-900 border-b border-slate-800 px-4 flex items-center justify-between shrink-0">
      <div class="flex items-center gap-3 min-w-0">
        <div class="w-9 h-9 rounded-xl bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center font-black text-sm text-indigo-300">
          {character.name.charAt(0)}
        </div>
        <div class="min-w-0">
          <h2 class="text-sm font-black text-slate-100 truncate">{character.name}</h2>
          <p class="text-[10px] text-slate-400 truncate">Lvl {character.level} {character.class}</p>
        </div>
      </div>

      <div class="flex items-center gap-2">
        <button
          onclick={() => isSpellbookOpen = true}
          class="p-1.5 rounded-lg bg-indigo-950/70 border border-indigo-600/50 hover:bg-indigo-900 text-indigo-200 text-xs font-bold flex items-center gap-1 transition-all"
          title="Open Grimoire & Spellbook"
        >
          <span>📖</span>
          <span class="text-[10px] hidden sm:inline">Spells</span>
        </button>

        <button
          onclick={() => isDowntimeOpen = true}
          class="p-1.5 rounded-lg bg-amber-950/70 border border-amber-600/50 hover:bg-amber-900 text-amber-200 text-xs font-bold flex items-center gap-1 transition-all"
          title="Open 5e Downtime Activities"
        >
          <span>⏳</span>
          <span class="text-[10px] hidden sm:inline">Downtime</span>
        </button>

        <button
          onclick={() => isDigitalDiceEnabled = !isDigitalDiceEnabled}
          class="p-1.5 rounded-lg border text-xs transition-colors {isDigitalDiceEnabled
            ? 'bg-indigo-600/30 border-indigo-500 text-indigo-300'
            : 'bg-slate-800 border-slate-700 text-slate-400'}"
          title="Toggle Digital Roller vs Physical Mode"
        >
          🎲
        </button>

        <button
          onclick={() => isStatsDrawerOpen = !isStatsDrawerOpen}
          class="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs"
          title="Toggle Ability Scores & Saves Drawer"
        >
          📊
        </button>

        <WhisperInboxModal characterId={character.id} bind:isOpen={isWhispersDrawerOpen} />

        <button
          onclick={disconnect}
          class="p-1.5 rounded-lg bg-slate-800 text-slate-400 hover:text-rose-400 text-xs"
          title="Disconnect PIN Session"
        >
          🚪
        </button>
      </div>
    </header>

    <!-- ── Drop-Down Alert Toast for Incoming DM Whisper ─────────────────── -->
    {#if activeWhisperAlert}
      <div class="bg-amber-950 border-b border-amber-600/70 p-3 shadow-xl animate-in slide-in-from-top duration-300">
        <div class="flex items-start justify-between gap-2">
          <div class="flex items-center gap-2">
            <span class="text-base">🤫</span>
            <div>
              <span class="text-[10px] font-bold uppercase tracking-wider text-amber-400">Secret DM Whisper</span>
              <p class="text-xs text-amber-100 mt-0.5 leading-snug">{activeWhisperAlert.message}</p>
            </div>
          </div>
          <button onclick={() => activeWhisperAlert = null} class="text-amber-400 hover:text-white text-xs">✕</button>
        </div>
      </div>
    {/if}

    <!-- ── Main Scrollable Body ─────────────────────────────────────────── -->
    <main class="flex-1 min-h-0 overflow-y-auto p-4 space-y-4 max-w-md mx-auto w-full pb-24">

      <!-- 1. VITALS BAR (HP, AC, Speed, Initiative) -->
      <section class="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-xl space-y-3">
        <!-- Vitals Grid -->
        <div class="grid grid-cols-3 gap-2 text-center">
          <div class="bg-slate-950 border border-slate-800 rounded-xl p-2.5">
            <span class="text-[9px] font-bold uppercase text-slate-500 block">Armor Class</span>
            <span class="text-lg font-black font-mono text-indigo-300">🛡️ {character.ac}</span>
          </div>

          <div class="bg-slate-950 border border-slate-800 rounded-xl p-2.5">
            <span class="text-[9px] font-bold uppercase text-slate-500 block">Speed</span>
            <span class="text-lg font-black font-mono text-emerald-300">🏃 {character.speed} ft</span>
          </div>

          <div class="bg-slate-950 border border-slate-800 rounded-xl p-2.5">
            <span class="text-[9px] font-bold uppercase text-slate-500 block">Initiative</span>
            <span class="text-lg font-black font-mono text-amber-300">⚡ {initiativeLabel}</span>
          </div>
        </div>

        <!-- Health Points Bar & Adjusters -->
        <div class="space-y-1.5 pt-1">
          <div class="flex items-center justify-between text-xs">
            <span class="font-bold text-slate-400 uppercase tracking-wider text-[10px]">Hit Points</span>
            <span class="font-mono font-bold {character.hpCurrent <= character.hpMax * 0.25 ? 'text-rose-400 animate-pulse' : 'text-slate-100'}">
              {character.hpCurrent} / {character.hpMax} HP
            </span>
          </div>

          <!-- Progress Bar -->
          <div class="w-full h-3 rounded-full bg-slate-800 overflow-hidden shadow-inner">
            <div
              class="h-full transition-all duration-300 {character.hpCurrent > character.hpMax * 0.5 ? 'bg-emerald-500' : character.hpCurrent > character.hpMax * 0.25 ? 'bg-amber-500' : 'bg-rose-500'}"
              style="width: {Math.max(0, Math.min(100, (character.hpCurrent / character.hpMax) * 100))}%"
            ></div>
          </div>

          <!-- Quick Modifiers -->
          <div class="flex items-center justify-between gap-1 pt-1">
            <button onclick={() => modifyHp(-5)} class="px-3 py-1.5 rounded-lg bg-rose-950/60 hover:bg-rose-900/80 text-rose-300 font-mono font-bold text-xs border border-rose-800/40">-5</button>
            <button onclick={() => modifyHp(-1)} class="px-3 py-1.5 rounded-lg bg-rose-950/40 hover:bg-rose-900/60 text-rose-300 font-mono font-bold text-xs border border-rose-800/30">-1</button>
            <div class="flex-1 text-center">
              {#if character.hpCurrent === 0}
                <span class="text-[10px] font-black text-rose-400 uppercase tracking-widest animate-bounce block">UNCONSCIOUS</span>
              {/if}
            </div>
            <button onclick={() => modifyHp(1)} class="px-3 py-1.5 rounded-lg bg-emerald-950/40 hover:bg-emerald-900/60 text-emerald-300 font-mono font-bold text-xs border border-emerald-800/30">+1</button>
            <button onclick={() => modifyHp(5)} class="px-3 py-1.5 rounded-lg bg-emerald-950/60 hover:bg-emerald-900/80 text-emerald-300 font-mono font-bold text-xs border border-emerald-800/40">+5</button>
          </div>

          <!-- Temp HP & Hit Dice Controls -->
          <div class="grid grid-cols-2 gap-2 pt-1">
            <div class="bg-slate-950 border border-slate-800/80 rounded-xl p-2 flex items-center justify-between">
              <div>
                <span class="text-[9px] font-bold uppercase text-slate-500 block">Temp HP</span>
                <span class="text-sm font-mono font-bold text-indigo-300">+{character.tempHp}</span>
              </div>
              <div class="flex items-center gap-1">
                <button
                  onclick={() => modifyTempHp(-1)}
                  disabled={character.tempHp <= 0}
                  class="w-6 h-6 rounded bg-slate-900 hover:bg-slate-800 text-slate-300 font-mono text-xs disabled:opacity-30 border border-slate-800"
                >-</button>
                <button
                  onclick={() => modifyTempHp(1)}
                  class="w-6 h-6 rounded bg-slate-900 hover:bg-slate-800 text-indigo-300 font-mono text-xs border border-slate-800"
                >+</button>
              </div>
            </div>

            <div class="bg-slate-950 border border-slate-800/80 rounded-xl p-2 flex items-center justify-between">
              <div>
                <span class="text-[9px] font-bold uppercase text-slate-500 block">Hit Dice</span>
                <span class="text-sm font-mono font-bold text-emerald-300">{character.hitDiceCurrent}/{character.hitDiceMax}</span>
              </div>
              <button
                onclick={spendHitDie}
                disabled={character.hitDiceCurrent <= 0}
                class="px-2 py-1 rounded bg-emerald-950/60 hover:bg-emerald-900 text-emerald-300 font-bold text-[10px] border border-emerald-800/50 disabled:opacity-30"
                title="Spend 1 Hit Die to Heal"
              >
                Roll
              </button>
            </div>
          </div>
        </div>

        <!-- Aleamos 0-HP Exhaustion Tracker -->
        {#if character.exhaustion > 0}
          <div class="p-2.5 rounded-xl bg-rose-950/60 border border-rose-800/50 space-y-1">
            <div class="flex items-center justify-between text-xs">
              <span class="font-bold text-rose-300 uppercase tracking-wider flex items-center gap-1.5">
                <span>⚠️</span> Exhaustion Tier {character.exhaustion}/6
              </span>
              <span class="text-[10px] font-mono text-rose-400">Anti-Heal-Scum</span>
            </div>
            <p class="text-[11px] text-rose-200 leading-tight">
              {EXHAUSTION_PENALTIES[character.exhaustion] || 'Severe physical and mental strain.'}
            </p>
          </div>
        {/if}
      </section>

      <!-- 2. ABILITY SCORES & PROFICIENT SAVES DRAWER -->
      {#if isStatsDrawerOpen}
        <section class="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-xl space-y-3">
          <div class="flex items-center justify-between">
            <h3 class="text-xs font-bold uppercase tracking-wider text-slate-300">Ability Scores &amp; Saves</h3>
            <span class="text-[10px] text-indigo-400 font-mono">Init: {initiativeLabel}</span>
          </div>

          <div class="grid grid-cols-6 gap-1.5 text-center">
            {#each [
              { name: 'STR', val: character.str },
              { name: 'DEX', val: character.dex },
              { name: 'CON', val: character.con },
              { name: 'INT', val: character.int },
              { name: 'WIS', val: character.wis },
              { name: 'CHA', val: character.cha }
            ] as stat}
              {@const mod = Math.floor((stat.val - 10) / 2)}
              {@const isProf = character.savingThrows.includes(stat.name)}
              <div class="bg-slate-950 border rounded-xl p-2 {isProf ? 'border-indigo-500/50 bg-indigo-950/20' : 'border-slate-800'}">
                <span class="text-[9px] font-bold text-slate-400 block">{stat.name}</span>
                <span class="text-sm font-black font-mono text-slate-100 block">{stat.val}</span>
                <span class="text-[10px] font-mono font-bold {mod >= 0 ? 'text-emerald-400' : 'text-rose-400'}">
                  {mod >= 0 ? `+${mod}` : mod}
                </span>
                {#if isProf}
                  <span class="text-[8px] font-bold text-indigo-400 block uppercase mt-0.5">Save ✓</span>
                {/if}
              </div>
            {/each}
          </div>
        </section>
      {/if}

      <!-- 3. RESOURCE BUBBLES: SPELL SLOTS & CLASS ABILITIES -->
      {#if spellSlots.length > 0 || classResources.length > 0}
        <section class="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-xl space-y-3">
          <div class="flex items-center justify-between">
            <h3 class="text-xs font-bold uppercase tracking-wider text-slate-300">Slots &amp; Class Resources</h3>
            {#if spellSlots.length > 0}
              <button
                onclick={() => isManaModalOpen = true}
                class="px-2.5 py-1 rounded-xl bg-cyan-950/80 border border-cyan-600/50 hover:bg-cyan-900/90 text-cyan-300 text-[10px] font-bold flex items-center gap-1 shadow-sm transition-all"
              >
                <span>🧪</span> Drink Mana Potion
              </button>
            {/if}
          </div>

          <!-- Spell Slots -->
          {#if spellSlots.length > 0}
            <div class="space-y-2">
              {#each spellSlots as slot, lIdx}
                <div class="flex items-center justify-between text-xs">
                  <span class="text-slate-400 font-mono text-[11px] font-bold">Lvl {slot.level} Slots</span>
                  <div class="flex items-center gap-1.5">
                    {#each Array(slot.total) as _, sIdx}
                      <button
                        onclick={() => toggleSpellSlot(lIdx, sIdx)}
                        class="w-5 h-5 rounded-full border transition-all {sIdx < slot.used
                          ? 'bg-slate-950 border-slate-800 opacity-40 shadow-inner'
                          : 'bg-indigo-600 border-indigo-400 shadow-sm shadow-indigo-500/50'}"
                        title="Click to Spend / Restore Spell Slot"
                      ></button>
                    {/each}
                  </div>
                </div>
              {/each}
            </div>
          {/if}

          <!-- Class Resources (Rage, Action Surge, Ki, etc.) -->
          {#if classResources.length > 0}
            <div class="pt-2 border-t border-slate-800/80 space-y-2">
              {#each classResources as res}
                <div class="flex items-center justify-between text-xs">
                  <span class="text-slate-300 font-medium text-[11px]">{res.name}</span>
                  <button
                    onclick={() => toggleClassResource(res.id)}
                    class="px-2.5 py-1 rounded-lg bg-slate-950 border border-slate-800 hover:border-amber-500/50 text-amber-300 font-mono font-bold text-xs"
                  >
                    {res.total - res.used} / {res.total}
                  </button>
                </div>
              {/each}
            </div>
          {/if}
        </section>
      {/if}

      <!-- 4. EQUIPMENT CARDS (STANDARD 5E SRD) -->
      <section class="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-xl space-y-3">
        <div class="flex items-center justify-between">
          <h3 class="text-xs font-bold uppercase tracking-wider text-slate-300">Equipped Gear &amp; Inventory</h3>
          <span class="text-[10px] text-slate-500 font-mono">🔒 Inventory Edits Locked (DM Regulated)</span>
        </div>

        <div class="space-y-2">
          {#each equipment as item (item.id)}
            <div class="bg-slate-950 border border-slate-800 rounded-xl p-3 space-y-2 transition-all">
              <div class="flex items-start justify-between gap-2">
                <div>
                  <div class="flex items-center gap-2">
                    <span class="text-xs font-bold text-slate-200">
                      {item.name}
                    </span>
                    <span class="px-1.5 py-0.2 rounded text-[9px] font-mono uppercase bg-slate-900 text-slate-400 border border-slate-800">
                      {item.type}
                    </span>
                  </div>
                  <p class="text-[10px] text-slate-400 mt-0.5">{item.description}</p>
                </div>

                <!-- Reference Badge (Physical Mode) or Quick Roll -->
                <div class="text-right shrink-0">
                  {#if item.type === 'weapon'}
                    {#if isDigitalDiceEnabled}
                      <button
                        onclick={() => rollWeaponAttack(item)}
                        class="px-2.5 py-1 rounded-lg bg-amber-950/40 hover:bg-amber-900/60 active:scale-95 border border-amber-600/50 font-mono text-[10px] font-bold text-amber-300 transition-all shadow flex items-center gap-1"
                        title="Click to roll attack and damage"
                      >
                        <span>⚔️</span>
                        <span>+{item.attackBonus || 0} | {item.damageFormula}</span>
                      </button>
                    {:else}
                      <span class="px-2 py-0.5 rounded bg-slate-900 border border-slate-800 font-mono text-[10px] font-bold text-amber-300 block">
                        +{item.attackBonus || 0} | {item.damageFormula}
                      </span>
                    {/if}
                  {:else if item.type === 'armor'}
                    <span class="px-2 py-0.5 rounded bg-slate-900 border border-slate-800 font-mono text-[10px] font-bold text-indigo-300 block">
                      +{item.acBonus || 0} AC
                    </span>
                  {/if}
                </div>
              </div>

              <!-- Durability Resistance Points Bar (Only when enableDurabilitySystem is active) -->
              {#if rulesEngine.isEnabled('enableDurabilitySystem') && item.maxRp}
                <div class="space-y-1 py-1">
                  <div class="flex items-center justify-between text-[10px] font-mono">
                    <span class="text-slate-400">Resistance Points (RP)</span>
                    <span class="text-slate-300 font-bold">{item.currentRp ?? item.maxRp} / {item.maxRp} RP</span>
                  </div>
                  <div class="w-full bg-slate-900 h-1.5 rounded-full overflow-hidden border border-slate-800">
                    <div
                      class="h-full transition-all duration-300 {(item.currentRp ?? item.maxRp) <= 5 ? 'bg-rose-500' : (item.currentRp ?? item.maxRp) <= 12 ? 'bg-amber-500' : 'bg-emerald-500'}"
                      style="width: {Math.max(0, Math.min(100, (((item.currentRp ?? item.maxRp)) / item.maxRp) * 100))}%"
                    ></div>
                  </div>
                </div>
              {/if}

              <!-- Item Details & Peer Trade Bar -->
              <div class="pt-2 border-t border-slate-900 flex flex-wrap items-center justify-between gap-2 text-[10px]">
                <div class="flex items-center gap-1.5 text-slate-400">
                  <span>⚖️ {item.weight || 1.0} lbs</span>
                  {#if item.quantity && item.quantity > 1}
                    <span class="px-1.5 py-0.2 rounded bg-slate-900 border border-slate-800 text-amber-300 font-bold font-mono">Qty: {item.quantity}</span>
                  {/if}
                  {#if item.essenceTag}
                    <span class="px-1.5 py-0.2 rounded bg-indigo-950 text-indigo-300 border border-indigo-800/40 font-mono">{item.essenceTag}</span>
                  {/if}
                  {#if item.isPerishable}
                    <span class="px-1.5 py-0.2 rounded bg-amber-950 text-amber-300 border border-amber-800/40">Perishable</span>
                  {/if}
                </div>

                <!-- [ Send to Ally ▾ ] Button -->
                <button
                  type="button"
                  onclick={() => handleInitiateSendOffer(item)}
                  class="px-2.5 py-1 rounded-lg bg-indigo-950/60 hover:bg-indigo-900/80 active:scale-95 border border-indigo-600/40 font-bold text-[10px] text-indigo-300 transition-all flex items-center gap-1"
                >
                  <span>🤝</span> Send to Ally ▾
                </button>
              </div>

              <!-- Inline Peer Trade Dispatcher Tray -->
              {#if tradingItemId === item.id}
                <div class="p-3 mt-2 rounded-xl bg-slate-900 border border-indigo-600/50 space-y-2.5 animate-in fade-in duration-150">
                  <div class="flex items-center justify-between">
                    <span class="text-[10px] font-bold uppercase tracking-wider text-indigo-300">
                      Handshake Transfer: {item.name}
                    </span>
                    <button
                      onclick={() => tradingItemId = null}
                      class="text-slate-400 hover:text-white text-xs"
                    >✕</button>
                  </div>

                  {#if availableAllies.length === 0}
                    <p class="text-[11px] text-slate-400">No other party members available to trade with.</p>
                  {:else}
                    <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <div class="space-y-1">
                        <label for="ally-select-{item.id}" class="text-[10px] text-slate-400 font-semibold">Choose Ally</label>
                        <select
                          id="ally-select-{item.id}"
                          bind:value={tradeTargetAllyId}
                          class="w-full bg-slate-950 border border-slate-700 rounded-lg px-2 py-1 text-slate-200 text-xs focus:outline-none"
                        >
                          {#each availableAllies as ally}
                            <option value={ally.id}>{ally.name} ({ally.class})</option>
                          {/each}
                        </select>
                      </div>

                      {#if (item.quantity || 1) > 1}
                        <div class="space-y-1">
                          <label for="qty-input-{item.id}" class="text-[10px] text-slate-400 font-semibold">Quantity (Max: {item.quantity})</label>
                          <input
                            id="qty-input-{item.id}"
                            type="number"
                            min="1"
                            max={item.quantity || 1}
                            bind:value={tradeQuantity}
                            class="w-full bg-slate-950 border border-slate-700 rounded-lg px-2 py-1 text-slate-200 text-xs font-mono focus:outline-none"
                          />
                        </div>
                      {/if}
                    </div>

                    <div class="flex justify-end gap-2 pt-1">
                      <button
                        onclick={() => tradingItemId = null}
                        class="px-3 py-1 rounded-lg bg-slate-800 text-slate-300 text-[10px] font-bold"
                      >
                        Cancel
                      </button>
                      <button
                        onclick={() => handleConfirmSendOffer(item)}
                        class="px-3.5 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-[10px] font-bold shadow transition-all active:scale-95 flex items-center gap-1"
                      >
                        <span>🤝</span> Send Offer
                      </button>
                    </div>
                  {/if}
                </div>
              {/if}
            </div>
          {/each}
        </div>
      </section>

      <!-- Mount, Beast & Familiar Manager -->
      <section class="space-y-3">
        <PetManagerDrawer bind:companions isDm={false} />
      </section>

      <!-- 5. DIGITAL DICE ROLLER TRAY (When Enabled) -->
      {#if isDigitalDiceEnabled}
        <section class="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-xl space-y-3">
          <div class="flex items-center justify-between">
            <h3 class="text-xs font-bold uppercase tracking-wider text-slate-300">1-Tap Dice Tray</h3>
            {#if latestRollResult}
              <span class="text-xs font-mono font-bold {latestRollResult.isCrit ? 'text-amber-300 animate-bounce' : 'text-emerald-400'}">
                Rolled {latestRollResult.formula} ➔ {latestRollResult.result}
              </span>
            {/if}
          </div>

          <div class="grid grid-cols-6 gap-2">
            {#each [
              { sides: 20, label: 'd20', color: 'border-indigo-500/50 hover:bg-indigo-950/40 text-indigo-300' },
              { sides: 12, label: 'd12', color: 'border-blue-500/50 hover:bg-blue-950/40 text-blue-300' },
              { sides: 10, label: 'd10', color: 'border-cyan-500/50 hover:bg-cyan-950/40 text-cyan-300' },
              { sides: 8,  label: 'd8',  color: 'border-emerald-500/50 hover:bg-emerald-950/40 text-emerald-300' },
              { sides: 6,  label: 'd6',  color: 'border-amber-500/50 hover:bg-amber-950/40 text-amber-300' },
              { sides: 4,  label: 'd4',  color: 'border-rose-500/50 hover:bg-rose-950/40 text-rose-300' },
            ] as die}
              <button
                onclick={() => rollDice(die.sides)}
                class="py-3 rounded-xl bg-slate-950 border {die.color} font-mono font-black text-sm active:scale-90 transition-all shadow-sm flex flex-col items-center justify-center gap-0.5"
              >
                <span>{die.label}</span>
              </button>
            {/each}
          </div>
        </section>
      {/if}

      <!-- 6. REST ACTIONS & RECOVERY -->
      <section class="grid grid-cols-2 gap-3">
        <button
          onclick={triggerCampRest}
          class="p-3 bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded-xl text-left space-y-1 transition-all"
        >
          <span class="text-xs font-bold text-amber-300 block">🏕️ Camp Rest (Wilds)</span>
          <span class="text-[10px] text-slate-400 block leading-tight">Recover 50% HP &amp; resources. Exhaustion stays.</span>
        </button>

        <button
          onclick={triggerSafeHavenRest}
          class="p-3 bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded-xl text-left space-y-1 transition-all"
        >
          <span class="text-xs font-bold text-emerald-300 block">🏰 Safe-Haven Rest</span>
          <span class="text-[10px] text-slate-400 block leading-tight">Full restore &amp; recovers -1 Exhaustion tier.</span>
        </button>
      </section>

      <!-- 7. PERSONAL SESSION NOTES -->
      <section class="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-xl space-y-2">
        <div class="flex items-center justify-between">
          <h3 class="text-xs font-bold uppercase tracking-wider text-slate-300">Session Notes &amp; Quest Clues</h3>
          <span class="text-[10px] text-emerald-400 font-mono">● Auto-saving</span>
        </div>
        <textarea
          value={personalNotes}
          oninput={handleNotesInput}
          rows="4"
          placeholder="Record campaign clues, secrets, NPC interactions, and personal objectives..."
          class="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-indigo-500 transition-colors font-sans resize-y"
        ></textarea>
      </section>

    </main>

    <!-- ── Spellbook Grimoire Drawer ──────────────────────────────────────── -->
    <SpellbookDrawer
      bind:isOpen={isSpellbookOpen}
      characterClass={character.class}
      characterLevel={character.level}
      spellcastingMod={Math.max(
        Math.floor((character.int - 10) / 2),
        Math.floor((character.wis - 10) / 2),
        Math.floor((character.cha - 10) / 2)
      )}
    />

    <!-- ── 5e SRD Downtime Manager Modal ──────────────────────────────────── -->
    <DowntimeManager
      bind:isOpen={isDowntimeOpen}
      characterName={character.name}
    />

    <!-- ── Secret DM Whispers Inbox Modal / Slide-Out ────────────────────── -->
    {#if isWhispersDrawerOpen}
      <div class="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex flex-col justify-end">
        <div class="bg-slate-900 border-t border-slate-800 rounded-t-3xl p-5 max-w-md mx-auto w-full max-h-[80vh] flex flex-col space-y-4 shadow-2xl">
          <div class="flex items-center justify-between border-b border-slate-800 pb-3">
            <div class="flex items-center gap-2">
              <span class="text-xl">🤫</span>
              <div>
                <h3 class="text-xs font-black uppercase tracking-wider text-slate-100">Secret DM Whispers</h3>
                <p class="text-[10px] text-slate-400">Private communications from your DM</p>
              </div>
            </div>
            <button
              onclick={() => isWhispersDrawerOpen = false}
              class="w-7 h-7 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs flex items-center justify-center"
            >
              ✕
            </button>
          </div>

          <div class="flex-1 overflow-y-auto space-y-2.5 min-h-[150px]">
            {#if $dmWhispersStore.length === 0}
              <div class="text-center py-8 text-slate-500 text-xs">
                No secret whispers received yet.
              </div>
            {:else}
              {#each $dmWhispersStore as whisper (whisper.id)}
                <div class="p-3 rounded-xl bg-slate-950 border border-slate-800/80 space-y-1">
                  <div class="flex items-center justify-between text-[10px]">
                    <span class="font-bold text-amber-400">{whisper.sender_name}</span>
                    <span class="text-slate-500 font-mono">{new Date(whisper.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                  </div>
                  <p class="text-xs text-slate-200 leading-snug">{whisper.message}</p>
                </div>
              {/each}
            {/if}
          </div>
        </div>
      </div>
    {/if}

    <!-- ── Received Handout Parchment Modal ──────────────────────────────── -->
    {#if broadcastHandout}
      <div class="fixed inset-0 bg-slate-950/85 backdrop-blur-sm z-50 p-4 flex items-center justify-center overflow-y-auto">
        <div class="max-w-md w-full my-auto space-y-3">
          <div class="flex justify-end">
            <button
              onclick={() => broadcastHandout = null}
              class="px-3 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold shadow-lg"
            >
              Close Handout ✕
            </button>
          </div>

          <ParchmentViewer
            title={broadcastHandout.title}
            subtitle={broadcastHandout.subtitle}
            contentMarkdown={broadcastHandout.content_markdown}
            theme={broadcastHandout.theme || 'classic'}
            sealType={broadcastHandout.seal_type || 'none'}
            sealText={broadcastHandout.seal_text}
          />
        </div>
      </div>
    {/if}

    <!-- Mana Potion Slot Recovery Modal -->
    <ManaRecoveryModal
      bind:isOpen={isManaModalOpen}
      characterId={character.id}
      characterName={character.name}
      bind:spellSlots
      onClose={() => isManaModalOpen = false}
    />

    <!-- ── Incoming Peer Trade Banner Modal ──────────────────────────────── -->
    {#if incomingTrade}
      {@const enc = incomingEncumbrance}
      <div class="fixed inset-0 bg-black/80 backdrop-blur-md z-50 p-4 flex items-center justify-center animate-in fade-in zoom-in-95 duration-200">
        <div class="w-full max-w-md bg-slate-900 border-2 border-indigo-500 rounded-3xl shadow-2xl shadow-indigo-600/30 overflow-hidden flex flex-col space-y-4 p-5">

          <!-- Header -->
          <div class="flex items-center justify-between border-b border-slate-800 pb-3">
            <div class="flex items-center gap-2.5">
              <div class="w-10 h-10 rounded-2xl bg-indigo-600/20 border border-indigo-500/40 flex items-center justify-center text-xl">
                🤝
              </div>
              <div>
                <span class="text-[10px] font-bold uppercase tracking-widest text-indigo-400 block">Incoming Trade Offer</span>
                <h3 class="text-sm font-black text-slate-100">From {incomingTrade.sender_name}</h3>
              </div>
            </div>
            <span class="px-2 py-0.5 rounded-full text-[10px] font-bold font-mono bg-indigo-950 text-indigo-300 border border-indigo-700/50">
              Qty: {incomingTrade.quantity}
            </span>
          </div>

          <!-- Item Preview Card -->
          <div class="p-3.5 rounded-2xl bg-slate-950 border border-slate-800 space-y-3">
            <div class="flex items-start justify-between gap-2">
              <div>
                <div class="flex items-center gap-2">
                  <span class="text-sm font-bold text-slate-100">{incomingTrade.item.name}</span>
                  <span class="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase bg-amber-950 text-amber-300 border border-amber-800/40">
                    {incomingTrade.item.rarity || 'Common'}
                  </span>
                </div>
                <p class="text-[11px] text-slate-400 mt-1 leading-snug">{incomingTrade.item.description}</p>
              </div>

              {#if incomingTrade.item.type === 'weapon'}
                <div class="px-2 py-1 rounded-lg bg-amber-950/40 border border-amber-600/40 text-[10px] font-mono font-bold text-amber-300 shrink-0">
                  +{incomingTrade.item.attackBonus || 0} | {incomingTrade.item.damageFormula || '1d6'}
                </div>
              {:else if incomingTrade.item.type === 'armor'}
                <div class="px-2 py-1 rounded-lg bg-indigo-950/40 border border-indigo-600/40 text-[10px] font-mono font-bold text-indigo-300 shrink-0">
                  +{incomingTrade.item.acBonus || 0} AC
                </div>
              {/if}
            </div>

            <!-- Metadata Badges: Essence & Perishables -->
            {#if incomingTrade.item.essenceTag || incomingTrade.item.isPerishable}
              <div class="flex items-center gap-2 pt-1">
                {#if incomingTrade.item.essenceTag}
                  <span class="px-2 py-0.5 rounded bg-indigo-950/80 border border-indigo-700/50 text-[10px] font-bold text-indigo-300 font-mono">
                    ✦ {incomingTrade.item.essenceTag}
                  </span>
                {/if}
                {#if incomingTrade.item.isPerishable}
                  <span class="px-2 py-0.5 rounded bg-amber-950/80 border border-amber-700/50 text-[10px] font-bold text-amber-300 font-mono">
                    ⏳ Perishable Harvest
                  </span>
                {/if}
              </div>
            {/if}
          </div>

          <!-- Encumbrance Impact Preview -->
          {#if enc}
            <div class="p-3 rounded-xl {enc.isWarning ? 'bg-rose-950/40 border border-rose-800/60' : 'bg-slate-950/80 border border-slate-800'} space-y-1.5 text-xs">
              <div class="flex items-center justify-between">
                <span class="text-[11px] font-bold text-slate-400 flex items-center gap-1">
                  <span>⚖️</span> Encumbrance Preview:
                </span>
                <span class="text-[10px] font-bold font-mono px-2 py-0.5 rounded {enc.isWarning ? 'bg-rose-900/60 text-rose-300 border border-rose-700' : 'bg-slate-800 text-slate-300'}">
                  {enc.status}
                </span>
              </div>
              <div class="flex items-center justify-between text-[11px] font-mono text-slate-300">
                <span>Weight: {enc.current} lbs + {enc.added} lbs</span>
                <span><strong>{enc.newTotal}</strong> / {enc.capacity} lbs</span>
              </div>
            </div>
          {/if}

          <!-- Accept / Reject Actions -->
          <div class="grid grid-cols-2 gap-3 pt-2">
            <button
              onclick={handleDeclineIncomingTrade}
              class="py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs transition-colors flex items-center justify-center gap-1.5 active:scale-95"
            >
              <span>✕</span> Decline
            </button>

            <button
              onclick={handleAcceptIncomingTrade}
              class="py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 text-slate-950 font-black text-xs shadow-lg shadow-emerald-600/30 transition-all flex items-center justify-center gap-1.5 active:scale-95"
            >
              <span>✓</span> Accept Item
            </button>
          </div>

        </div>
      </div>
    {/if}

    <!-- Persistent Quick-Action Hotbar -->
    <ActionHotbar />

  {/if}

</div>

{#if curtainStore.active}
  <div class="fixed inset-0 z-50 flex items-center justify-center bg-black transition-opacity duration-300">
    <span class="text-zinc-600 font-mono tracking-widest uppercase text-sm">Scene Staging in Progress</span>
  </div>
{/if}

