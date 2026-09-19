// tradeBridge.ts — Resilient Atomic P2P Player Trade Handshake Bridge
// Implements strict 'PENDING_TRADE' inventory locks, atomic commit upon TRADE_ACCEPT,
// and automatic unlock upon TRADE_REJECT or 60-second timeout.

import type { TradeOfferPayload, TradeAcceptPayload, TradeDeclinePayload } from '../types/item';
import { audioEngine } from '../audio/AudioEngine';
import { sendWsEvent } from '../../stores/websocketStore';

export interface LockedTradeRecord {
  tradeId: string;
  senderId: string;
  receiverId: string;
  itemId: string;
  quantity: number;
  lockedAt: number;
  timeoutSeconds: number;
  itemData: any;
  status: 'PENDING_TRADE' | 'COMMITTED' | 'REJECTED' | 'TIMED_OUT';
}

const activeLockedTrades = new Map<string, LockedTradeRecord>();
const TRADE_TIMEOUT_SEC = 60;

/**
 * Initiates an atomic trade lock on the sender's inventory item.
 */
export function initiateTradeLock(
  senderId: string,
  receiverId: string,
  receiverName: string,
  senderName: string,
  item: any,
  quantity = 1
): { success: boolean; tradeId: string; error?: string } {
  if (!item || !item.id) {
    return { success: false, tradeId: '', error: 'Invalid trade item.' };
  }

  const tradeId = `trade-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;

  // 1. Lock item in sender's inventory in localStorage
  const senderStorageKey = `vtt_inventory_${senderId}`;
  try {
    const raw = localStorage.getItem(senderStorageKey);
    const inv = raw ? JSON.parse(raw) : [];
    const targetItem = inv.find((i: any) => i.id === item.id);

    if (!targetItem) {
      return { success: false, tradeId, error: 'Item not found in sender pack.' };
    }

    if (targetItem.tradeLock === 'PENDING_TRADE') {
      return { success: false, tradeId, error: 'Item is already locked in an active trade.' };
    }

    targetItem.tradeLock = 'PENDING_TRADE';
    targetItem.lockedTradeId = tradeId;
    localStorage.setItem(senderStorageKey, JSON.stringify(inv));

    // Notify inventory update
    window.dispatchEvent(new CustomEvent('vtt:inventory-updated', { detail: { characterId: senderId } }));
  } catch (err: any) {
    return { success: false, tradeId, error: `Lock storage error: ${err.message}` };
  }

  // 2. Track locked record
  const record: LockedTradeRecord = {
    tradeId,
    senderId,
    receiverId,
    itemId: item.id,
    quantity,
    lockedAt: Date.now(),
    timeoutSeconds: TRADE_TIMEOUT_SEC,
    itemData: { ...item },
    status: 'PENDING_TRADE',
  };
  activeLockedTrades.set(tradeId, record);

  // 3. Broadcast TRADE_OFFER
  const offerPayload: TradeOfferPayload = {
    trade_id: tradeId,
    sender_id: senderId,
    sender_name: senderName,
    receiver_id: receiverId,
    receiver_name: receiverName,
    item: { ...item, quantity },
    quantity,
    timestamp: Date.now(),
  };

  sendWsEvent({
    type: 'TRADE_OFFER',
    payload: offerPayload,
  });

  window.dispatchEvent(new CustomEvent('vtt:trade-offer-sent', { detail: offerPayload }));
  audioEngine.triggerSfx('sfx-dice');

  // 4. Set auto-timeout safety timer
  setTimeout(() => {
    if (activeLockedTrades.get(tradeId)?.status === 'PENDING_TRADE') {
      releaseTradeLock(tradeId, 'TIMED_OUT', 'Trade proposal timed out after 60 seconds.');
    }
  }, TRADE_TIMEOUT_SEC * 1000);

  return { success: true, tradeId };
}

/**
 * Commits the atomic trade transfer upon receipt of TRADE_ACCEPT.
 */
export function commitTradeTransfer(
  acceptPayload: TradeAcceptPayload
): { success: boolean; error?: string } {
  const { trade_id, sender_id, receiver_id, item_id, quantity } = acceptPayload;
  const record = activeLockedTrades.get(trade_id);

  const senderKey = `vtt_inventory_${sender_id}`;
  const receiverKey = `vtt_inventory_${receiver_id}`;

  try {
    // 1. Remove locked item from sender
    const rawSender = localStorage.getItem(senderKey);
    const senderInv = rawSender ? JSON.parse(rawSender) : [];
    const itemIndex = senderInv.findIndex((i: any) => i.id === item_id);

    let transferredItem = record?.itemData;
    if (itemIndex >= 0) {
      transferredItem = senderInv[itemIndex];
      // If quantity is partial, decrement quantity; else remove
      if (transferredItem.quantity && transferredItem.quantity > quantity) {
        transferredItem.quantity -= quantity;
        delete transferredItem.tradeLock;
        delete transferredItem.lockedTradeId;
      } else {
        senderInv.splice(itemIndex, 1);
      }
      localStorage.setItem(senderKey, JSON.stringify(senderInv));
    }

    if (!transferredItem) {
      return { success: false, error: 'Transferred item data unavailable.' };
    }

    // 2. Clean trade locks from item before depositing to receiver
    const cleanItem = { ...transferredItem, quantity };
    delete cleanItem.tradeLock;
    delete cleanItem.lockedTradeId;

    // 3. Append into receiver inventory
    const rawReceiver = localStorage.getItem(receiverKey);
    const receiverInv = rawReceiver ? JSON.parse(rawReceiver) : [];
    receiverInv.push(cleanItem);
    localStorage.setItem(receiverKey, JSON.stringify(receiverInv));

    if (record) {
      record.status = 'COMMITTED';
      activeLockedTrades.delete(trade_id);
    }

    // 4. Dispatch synchronization updates
    window.dispatchEvent(new CustomEvent('vtt:inventory-updated', { detail: { characterId: sender_id } }));
    window.dispatchEvent(new CustomEvent('vtt:inventory-updated', { detail: { characterId: receiver_id } }));
    window.dispatchEvent(new CustomEvent('vtt:trade-committed', { detail: acceptPayload }));

    audioEngine.triggerSfx('sfx-bell');
    return { success: true };
  } catch (err: any) {
    console.error('Failed to atomically commit peer trade:', err);
    return { success: false, error: err.message };
  }
}

/**
 * Releases the 'PENDING_TRADE' lock and restores item to active inventory
 * upon TRADE_REJECT, cancellation, or timeout.
 */
export function releaseTradeLock(
  tradeId: string,
  reason: 'REJECTED' | 'TIMED_OUT' = 'REJECTED',
  message?: string
): void {
  const record = activeLockedTrades.get(tradeId);
  if (!record) return;

  record.status = reason;

  // Unlock in sender inventory
  const senderKey = `vtt_inventory_${record.senderId}`;
  try {
    const raw = localStorage.getItem(senderKey);
    if (raw) {
      const inv = JSON.parse(raw);
      const item = inv.find((i: any) => i.id === record.itemId);
      if (item) {
        delete item.tradeLock;
        delete item.lockedTradeId;
        localStorage.setItem(senderKey, JSON.stringify(inv));
      }
    }
  } catch {
    // ignore
  }

  activeLockedTrades.delete(tradeId);

  window.dispatchEvent(new CustomEvent('vtt:inventory-updated', { detail: { characterId: record.senderId } }));
  window.dispatchEvent(
    new CustomEvent('vtt:trade-lock-released', {
      detail: { tradeId, reason, message: message || `Trade ${reason.toLowerCase()}` },
    })
  );
}

export function getActiveLockedTrades(): ReadonlyMap<string, LockedTradeRecord> {
  return activeLockedTrades;
}
