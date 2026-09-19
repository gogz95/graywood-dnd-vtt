import { describe, it, expect, beforeEach } from 'vitest';
import type { CustomItemDefinition } from '../types/item';
import { addCustomItem, getCustomItems, deleteCustomItem, clearCustomItems } from './compendiumStore';
import { sessionStore } from './sessionStore';
import {
  sendTradeOffer,
  acceptTradeOffer,
  declineTradeOffer,
  tradeAuditLogsStore,
  activeTradeOfferStore,
} from '../network/broadcastBridge';
import { get } from 'svelte/store';

describe('DM Manual Custom Item Creation & Dispatch + Peer-to-Peer Trading', () => {

  beforeEach(() => {
    if (typeof localStorage !== 'undefined') {
      localStorage.clear();
    }
    sessionStore.clearPlayerPack();
    tradeAuditLogsStore.set([]);
    activeTradeOfferStore.set(null);
  });

  describe('1. Custom Item Schema & Compendium Store', () => {
    it('creates and persists a custom weapon with durability RP and essence tags', async () => {
      const customWeapon: CustomItemDefinition = {
        id: 'test-weapon-1',
        name: 'Pyretic Sunblade',
        type: 'weapon',
        category: 'Weapon (Martial)',
        rarity: 'Rare',
        weight: 3.0,
        costGp: 500,
        description: 'A blade infused with solar flames.',
        currentRp: 25,
        maxRp: 25,
        attackBonus: 2,
        damageFormula: '1d8 + 2',
        damageType: 'slashing/fire',
        essenceTag: 'Pyretic (Fire)',
        isPerishable: false,
      };

      const saved = await addCustomItem(customWeapon);
      expect(saved.id).toBe('test-weapon-1');
      expect(saved.name).toBe('Pyretic Sunblade');
      expect(saved.currentRp).toBe(25);
      expect(saved.essenceTag).toBe('Pyretic (Fire)');

      const items = await getCustomItems();
      const found = items.find(i => i.id === 'test-weapon-1');
      expect(found).toBeDefined();
      expect(found?.name).toBe('Pyretic Sunblade');
    });

    it('creates and persists a perishable harvested ingredient with decay timestamp', async () => {
      const nowSec = Math.floor(Date.now() / 1000);
      const harvestItem: CustomItemDefinition = {
        id: 'test-harvest-1',
        name: 'Fresh Wyvern Bile',
        type: 'ingredient',
        category: 'Alchemy Reagent',
        rarity: 'Uncommon',
        weight: 1.5,
        costGp: 75,
        description: 'Potent acidic enzyme from a wyvern pouch.',
        isPerishable: true,
        harvestTimestamp: nowSec,
        essenceTag: 'Toxic (Venom)',
      };

      const saved = await addCustomItem(harvestItem);
      expect(saved.isPerishable).toBe(true);
      expect(saved.harvestTimestamp).toBe(nowSec);

      const items = await getCustomItems();
      const found = items.find(i => i.id === 'test-harvest-1');
      expect(found).toBeDefined();
      expect(found?.isPerishable).toBe(true);
      expect(found?.harvestTimestamp).toBe(nowSec);
    });

    it('deletes custom item from storage', async () => {
      await addCustomItem({
        id: 'to-delete',
        name: 'Temporary Trinket',
        type: 'gear',
        category: 'Gear',
        rarity: 'Common',
        weight: 0.5,
        description: 'Soon to be removed.',
      });

      const deleted = await deleteCustomItem('to-delete');
      expect(deleted).toBe(true);

      const items = await getCustomItems();
      expect(items.find(i => i.id === 'to-delete')).toBeUndefined();
    });
  });

  describe('2. Direct Injection into Collaborative Stash & Player Packs', () => {
    it('injects custom item directly into sessionStore.collaborativeStash', () => {
      const item = sessionStore.addItemToCollaborativeStash({
        name: 'Ring of Sovereign Wards',
        category: 'Wondrous Item',
        quantity: 1,
        weight: 0.1,
        description: 'Provides +1 bonus to saving throws.',
        valueGp: 1000,
        essence: 'Sovereign (Arcane)',
      });

      expect(item.id).toBeDefined();
      const stash = sessionStore.collaborativeStash;
      const found = stash.find(i => i.name === 'Ring of Sovereign Wards');
      expect(found).toBeDefined();
      expect(found?.essence).toBe('Sovereign (Arcane)');
    });

    it('injects custom item directly into player personal pack', () => {
      const playerId = 'player-valeros';
      const customArmor = {
        id: 'valeros-shield',
        name: 'Aegis of the Dawn',
        type: 'armor',
        category: 'Shield',
        rarity: 'Rare',
        weight: 6.0,
        acBonus: 2,
        currentRp: 30,
        maxRp: 30,
        description: 'Blessed iron kite shield.',
        essenceTag: 'Solar (Radiant)',
      };

      const res = sessionStore.addItemToPlayerPack(playerId, customArmor);
      expect(res.success).toBe(true);

      const pack = sessionStore.getPlayerPack(playerId);
      expect(pack.length).toBe(1);
      expect(pack[0].name).toBe('Aegis of the Dawn');
      expect(pack[0].currentRp).toBe(30);
      expect(pack[0].essenceTag).toBe('Solar (Radiant)');
    });
  });

  describe('3. Atomic Peer-to-Peer Item Trading & Metadata Preservation', () => {
    const senderId = 'char-sender-1';
    const receiverId = 'char-receiver-2';

    beforeEach(() => {
      // Seed sender pack
      sessionStore.addItemToPlayerPack(senderId, {
        id: 'item-magic-sword',
        name: 'Moon-Silver Longsword',
        type: 'weapon',
        category: 'Weapon (Martial)',
        rarity: 'Rare',
        quantity: 1,
        weight: 3.0,
        currentRp: 18,
        maxRp: 25,
        attackBonus: 1,
        damageFormula: '1d8 + 3',
        damageType: 'slashing',
        essenceTag: 'Glacial (Cold)',
        description: 'Chilled steel blade that sheds dim moonlight.',
      });

      sessionStore.addItemToPlayerPack(senderId, {
        id: 'item-healing-potions',
        name: 'Greater Potion of Healing',
        type: 'potion',
        category: 'Potion',
        rarity: 'Uncommon',
        quantity: 4,
        weight: 0.5,
        currentRp: 5,
        maxRp: 5,
        description: 'Restores 4d4+4 HP.',
      });

      // Clear receiver pack
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(`vtt_player_inventory_${receiverId}`, JSON.stringify([]));
      }
    });

    it('executes atomic transfer of single item preserving all metadata (durability RP, essence tags)', () => {
      const tradeRes = sessionStore.executePeerTrade(
        senderId,
        receiverId,
        'item-magic-sword',
        1
      );

      expect(tradeRes.success).toBe(true);
      expect(tradeRes.transferredItem).toBeDefined();
      expect(tradeRes.transferredItem.name).toBe('Moon-Silver Longsword');
      expect(tradeRes.transferredItem.currentRp).toBe(18);
      expect(tradeRes.transferredItem.maxRp).toBe(25);
      expect(tradeRes.transferredItem.essenceTag).toBe('Glacial (Cold)');
      expect(tradeRes.transferredItem.attackBonus).toBe(1);

      // Verify removed from sender
      const senderPack = sessionStore.getPlayerPack(senderId);
      expect(senderPack.find(i => i.id === 'item-magic-sword')).toBeUndefined();

      // Verify appended to receiver with full metadata
      const receiverPack = sessionStore.getPlayerPack(receiverId);
      expect(receiverPack.length).toBe(1);
      expect(receiverPack[0].name).toBe('Moon-Silver Longsword');
      expect(receiverPack[0].currentRp).toBe(18);
      expect(receiverPack[0].maxRp).toBe(25);
      expect(receiverPack[0].essenceTag).toBe('Glacial (Cold)');
    });

    it('executes partial quantity transfer from a stacked item', () => {
      const tradeRes = sessionStore.executePeerTrade(
        senderId,
        receiverId,
        'item-healing-potions',
        2
      );

      expect(tradeRes.success).toBe(true);

      // Sender should now have 2 potions remaining
      const senderPack = sessionStore.getPlayerPack(senderId);
      const senderPotions = senderPack.find(i => i.id === 'item-healing-potions');
      expect(senderPotions).toBeDefined();
      expect(senderPotions?.quantity).toBe(2);

      // Receiver should have received 2 potions
      const receiverPack = sessionStore.getPlayerPack(receiverId);
      expect(receiverPack.length).toBe(1);
      expect(receiverPack[0].name).toBe('Greater Potion of Healing');
      expect(receiverPack[0].quantity).toBe(2);
    });

    it('rejects trade when requested quantity exceeds available sender stack', () => {
      const tradeRes = sessionStore.executePeerTrade(
        senderId,
        receiverId,
        'item-healing-potions',
        10
      );

      expect(tradeRes.success).toBe(false);
      expect(tradeRes.error).toContain('Insufficient quantity');
    });

    it('rejects trade with non-existent item', () => {
      const tradeRes = sessionStore.executePeerTrade(
        senderId,
        receiverId,
        'non-existent-item-xyz',
        1
      );

      expect(tradeRes.success).toBe(false);
      expect(tradeRes.error).toContain('not found in sender\'s pack');
    });

    it('rejects trading with self', () => {
      const tradeRes = sessionStore.executePeerTrade(
        senderId,
        senderId,
        'item-magic-sword',
        1
      );

      expect(tradeRes.success).toBe(false);
      expect(tradeRes.error).toContain('Cannot trade with yourself');
    });
  });

  describe('4. WebSocket Bridge Handshake & DM Copilot Audit Logging', () => {
    const senderId = 'char-sender-1';
    const receiverId = 'char-receiver-2';

    beforeEach(() => {
      sessionStore.addItemToPlayerPack(senderId, {
        id: 'trade-ring-1',
        name: 'Ring of Feather Fall',
        type: 'gear',
        category: 'Ring',
        rarity: 'Rare',
        quantity: 1,
        weight: 0.1,
        currentRp: 20,
        maxRp: 20,
        description: 'Negates falling damage.',
      });
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(`vtt_player_inventory_${receiverId}`, JSON.stringify([]));
      }
    });

    it('dispatches TRADE_OFFER and logs to DM Copilot audit stream with status OFFERED', () => {
      const offer = sendTradeOffer({
        sender_id: senderId,
        sender_name: 'Valen Shadowborn',
        receiver_id: receiverId,
        receiver_name: 'Eldrin Starfall',
        item: {
          id: 'trade-ring-1',
          name: 'Ring of Feather Fall',
          type: 'gear',
          category: 'Ring',
          rarity: 'Rare',
          quantity: 1,
          weight: 0.1,
          description: 'Negates falling damage.',
        },
        quantity: 1,
        notes: 'Take this before the chasm jump!',
      });

      expect(offer.trade_id).toBeDefined();

      const auditLogs = get(tradeAuditLogsStore);
      expect(auditLogs.length).toBeGreaterThan(0);
      const firstLog = auditLogs[0];
      expect(firstLog.status).toBe('OFFERED');
      expect(firstLog.sender_name).toBe('Valen Shadowborn');
      expect(firstLog.receiver_name).toBe('Eldrin Starfall');
      expect(firstLog.item_name).toBe('Ring of Feather Fall');
    });

    it('accepts trade offer, executes atomic transfer, and logs ACCEPTED to DM Copilot', () => {
      const offer = sendTradeOffer({
        sender_id: senderId,
        sender_name: 'Valen',
        receiver_id: receiverId,
        receiver_name: 'Eldrin',
        item: {
          id: 'trade-ring-1',
          name: 'Ring of Feather Fall',
          type: 'gear',
          category: 'Ring',
          rarity: 'Rare',
          quantity: 1,
          weight: 0.1,
          description: 'Negates falling damage.',
          currentRp: 20,
          maxRp: 20,
        },
        quantity: 1,
      });

      const acceptRes = acceptTradeOffer(offer);
      expect(acceptRes.success).toBe(true);

      // Verify inventory transfer
      const senderPack = sessionStore.getPlayerPack(senderId);
      expect(senderPack.find(i => i.id === 'trade-ring-1')).toBeUndefined();

      const receiverPack = sessionStore.getPlayerPack(receiverId);
      expect(receiverPack.find(i => i.name === 'Ring of Feather Fall')).toBeDefined();

      // Verify audit log
      const auditLogs = get(tradeAuditLogsStore);
      const acceptLog = auditLogs.find(l => l.status === 'ACCEPTED');
      expect(acceptLog).toBeDefined();
      expect(acceptLog?.item_name).toBe('Ring of Feather Fall');
      expect(acceptLog?.sender_name).toBe('Valen');
      expect(acceptLog?.receiver_name).toBe('Eldrin');
    });

    it('declines trade offer and logs DECLINED to DM Copilot', () => {
      const offer = sendTradeOffer({
        sender_id: senderId,
        sender_name: 'Valen',
        receiver_id: receiverId,
        receiver_name: 'Eldrin',
        item: {
          id: 'trade-ring-1',
          name: 'Ring of Feather Fall',
          type: 'gear',
          category: 'Ring',
          rarity: 'Rare',
          quantity: 1,
          weight: 0.1,
          description: 'Negates falling damage.',
        },
        quantity: 1,
      });

      declineTradeOffer(offer, 'Inventory full, cannot accept ring');

      const auditLogs = get(tradeAuditLogsStore);
      const declineLog = auditLogs.find(l => l.status === 'DECLINED');
      expect(declineLog).toBeDefined();
      expect(declineLog?.notes).toBe('Inventory full, cannot accept ring');
    });
  });
});
