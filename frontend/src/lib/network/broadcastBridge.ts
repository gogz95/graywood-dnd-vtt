// broadcastBridge.ts — Local LAN WebSocket & Cross-Device Handout Broadcast Bridge
// Dispatches sanitized parchment handouts across the Axum WebSocket server and handles player client overlays.

import { writable, get } from 'svelte/store';
import { sendWsEvent } from '../../stores/websocketStore';
import { dispatchSoundEvent } from '../audio/soundboardBridge';
import { sessionStore } from '../../stores/sessionStore';
import type {
  TradeOfferPayload,
  TradeAcceptPayload,
  TradeDeclinePayload,
  TradeAuditLogPayload,
} from '../types/item';

export type HandoutTheme = 'bounty' | 'proclamation' | 'journal' | 'contract' | 'classic';
export type WaxSealType = 'wax_red' | 'wax_gold' | 'imperial_black' | 'none';

export interface HandoutDocument {
  id: string;
  title: string;
  subtitle?: string;
  theme: HandoutTheme;
  sealType: WaxSealType;
  sealText?: string;
  contentMarkdown: string;
  dmNotes?: string;
  createdAt: number;
  updatedAt: number;
}

export interface PlayerBroadcastPayload {
  handout_id: string;
  title: string;
  subtitle?: string;
  content_markdown: string;
  theme: HandoutTheme;
  seal_type: WaxSealType;
  seal_text?: string;
  timestamp: number;
}

const STORAGE_ACTIVE_BROADCAST_KEY = 'vtt_active_broadcast_handout';

// ── Svelte Store for Received Player Handouts ─────────────────────────────────
export const activePlayerHandoutStore = writable<PlayerBroadcastPayload | null>(null);

// ── Svelte Stores for Peer-to-Peer Trading Handshake ───────────────────────────
export const activeTradeOfferStore = writable<TradeOfferPayload | null>(null);
export const tradeAuditLogsStore = writable<TradeAuditLogPayload[]>([]);

// Initialize from storage on browser boot
if (typeof window !== 'undefined') {
  try {
    const raw = localStorage.getItem(STORAGE_ACTIVE_BROADCAST_KEY);
    if (raw) {
      activePlayerHandoutStore.set(JSON.parse(raw) as PlayerBroadcastPayload);
    }
  } catch { /* storage safe */ }

  window.addEventListener('vtt:handout-broadcast', (e: Event) => {
    const detail = (e as CustomEvent<PlayerBroadcastPayload>).detail;
    if (detail) {
      activePlayerHandoutStore.set(detail);
      dispatchSoundEvent('turn_bell');
    }
  });

  window.addEventListener('vtt:handout-dismiss', () => {
    activePlayerHandoutStore.set(null);
  });

  // Peer Trade Listeners
  window.addEventListener('vtt:trade-offer', (e: Event) => {
    const offer = (e as CustomEvent<TradeOfferPayload>).detail;
    if (offer) {
      activeTradeOfferStore.set(offer);
      dispatchSoundEvent('turn_bell');
    }
  });

  window.addEventListener('vtt:trade-accept', (e: Event) => {
    const detail = (e as CustomEvent<TradeAcceptPayload>).detail;
    if (detail && get(activeTradeOfferStore)?.trade_id === detail.trade_id) {
      activeTradeOfferStore.set(null);
    }
  });

  window.addEventListener('vtt:trade-decline', (e: Event) => {
    const detail = (e as CustomEvent<TradeDeclinePayload>).detail;
    if (detail && get(activeTradeOfferStore)?.trade_id === detail.trade_id) {
      activeTradeOfferStore.set(null);
    }
  });

  window.addEventListener('vtt:trade-audit', (e: Event) => {
    const audit = (e as CustomEvent<TradeAuditLogPayload>).detail;
    if (audit) {
      tradeAuditLogsStore.update((logs) => [audit, ...logs].slice(0, 50));
    }
  });
}

import { stripSecretCallouts } from '../utils/markdownRenderer';

/**
 * Broadcasts a rendered parchment handout to all connected player screens.
 * Strips secret DM notes before serialization to guarantee zero player leakage.
 */
export function broadcastHandoutToParty(handout: HandoutDocument): PlayerBroadcastPayload {
  const sanitizedContent = stripSecretCallouts(handout.contentMarkdown);
  const sanitizedPayload: PlayerBroadcastPayload = {
    handout_id: handout.id,
    title: handout.title,
    subtitle: handout.subtitle || undefined,
    content_markdown: sanitizedContent,
    theme: handout.theme,
    seal_type: handout.sealType,
    seal_text: handout.sealText || undefined,
    timestamp: Date.now(),
  };

  // 1. Emit across Axum WebSocket server
  sendWsEvent({
    type: 'HANDOUT_BROADCAST',
    handout_id: sanitizedPayload.handout_id,
    title: sanitizedPayload.title,
    subtitle: sanitizedPayload.subtitle,
    content_markdown: sanitizedPayload.content_markdown,
    theme: sanitizedPayload.theme,
    seal_type: sanitizedPayload.seal_type,
    seal_text: sanitizedPayload.seal_text,
    timestamp: sanitizedPayload.timestamp,
  });

  // 2. Persist to local storage for instant cross-tab / reconnect sync
  if (typeof window !== 'undefined') {
    localStorage.setItem(STORAGE_ACTIVE_BROADCAST_KEY, JSON.stringify(sanitizedPayload));
    window.dispatchEvent(
      new CustomEvent('vtt:handout-broadcast', { detail: sanitizedPayload })
    );
  }

  // 3. Play auditory confirmation cue
  dispatchSoundEvent('turn_bell');

  return sanitizedPayload;
}

/**
 * Dismisses the active broadcast handout from all player client displays.
 */
export function dismissHandoutFromParty(handoutId?: string): void {
  // 1. Send WebSocket dismiss signal
  sendWsEvent({
    type: 'HANDOUT_DISMISS',
    handout_id: handoutId,
  });

  // 2. Clear local storage and update local player view
  if (typeof window !== 'undefined') {
    localStorage.removeItem(STORAGE_ACTIVE_BROADCAST_KEY);
    window.dispatchEvent(
      new CustomEvent('vtt:handout-dismiss', { detail: { handout_id: handoutId } })
    );
  }

  activePlayerHandoutStore.set(null);
}

/**
 * Dispatches an official trade audit log across the WebSocket server and to the DM Copilot dock.
 */
export function dispatchTradeAudit(audit: TradeAuditLogPayload): void {
  sendWsEvent(audit);

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('vtt:trade-audit', { detail: audit }));
  }

  tradeAuditLogsStore.update((curr) => [audit, ...curr].slice(0, 50));
}

/**
 * Initiates a peer-to-peer trade offer across the WebSocket bridge and alerts DM Copilot.
 */
export function sendTradeOffer(
  offerData: Omit<TradeOfferPayload, 'trade_id' | 'timestamp'> & {
    trade_id?: string;
    timestamp?: number;
  }
): TradeOfferPayload {
  const trade_id = offerData.trade_id || `trade-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const timestamp = offerData.timestamp || Date.now();

  const fullOffer: TradeOfferPayload = {
    ...offerData,
    trade_id,
    timestamp,
  };

  // 1. Dispatch over WebSocket server
  sendWsEvent(fullOffer);

  // 2. Dispatch audit log for DM Copilot dock
  dispatchTradeAudit({
    trade_id: fullOffer.trade_id,
    sender_id: fullOffer.sender_id,
    sender_name: fullOffer.sender_name,
    receiver_id: fullOffer.receiver_id,
    receiver_name: fullOffer.receiver_name,
    item_id: fullOffer.item.id,
    item_name: fullOffer.item.name,
    quantity: fullOffer.quantity,
    status: 'OFFERED',
    timestamp,
    notes: fullOffer.notes || `Offered ${fullOffer.quantity}x ${fullOffer.item.name}`,
  });

  return fullOffer;
}

/**
 * Accepts an incoming peer-to-peer trade, atomically executing inventory transfer
 * and notifying the DM Copilot dock.
 */
export function acceptTradeOffer(offer: TradeOfferPayload): { success: boolean; error?: string } {
  // 1. Execute atomic state transfer in sessionStore
  const transferResult = sessionStore.executePeerTrade(
    offer.sender_id,
    offer.receiver_id,
    offer.item.id,
    offer.quantity
  );

  if (!transferResult.success) {
    console.error('Peer trade execution failed:', transferResult.error);
    return transferResult;
  }

  // 2. Emit WebSocket handshake confirmation
  const acceptPayload: TradeAcceptPayload = {
    trade_id: offer.trade_id,
    sender_id: offer.sender_id,
    sender_name: offer.sender_name,
    receiver_id: offer.receiver_id,
    receiver_name: offer.receiver_name,
    item_id: offer.item.id,
    item_name: offer.item.name,
    quantity: offer.quantity,
    timestamp: Date.now(),
  };

  sendWsEvent({
    type: 'TRADE_ACCEPT',
    ...acceptPayload,
  });

  // 3. Dispatch DM audit log
  dispatchTradeAudit({
    trade_id: offer.trade_id,
    sender_id: offer.sender_id,
    sender_name: offer.sender_name,
    receiver_id: offer.receiver_id,
    receiver_name: offer.receiver_name,
    item_id: offer.item.id,
    item_name: offer.item.name,
    quantity: offer.quantity,
    status: 'ACCEPTED',
    timestamp: Date.now(),
    notes: 'Atomic transfer confirmed with complete metadata preservation',
  });

  // 4. Auditory confirmation & clear local active offer
  dispatchSoundEvent('turn_bell');
  activeTradeOfferStore.set(null);

  return { success: true };
}

/**
 * Rejects or cancels an incoming peer-to-peer trade and notifies DM Copilot.
 */
export function declineTradeOffer(offer: TradeOfferPayload, reason: string = 'Declined by recipient'): void {
  const declinePayload: TradeDeclinePayload = {
    trade_id: offer.trade_id,
    sender_id: offer.sender_id,
    sender_name: offer.sender_name,
    receiver_id: offer.receiver_id,
    receiver_name: offer.receiver_name,
    item_id: offer.item.id,
    item_name: offer.item.name,
    timestamp: Date.now(),
    reason,
  };

  sendWsEvent({
    type: 'TRADE_DECLINE',
    ...declinePayload,
  });

  dispatchTradeAudit({
    trade_id: offer.trade_id,
    sender_id: offer.sender_id,
    sender_name: offer.sender_name,
    receiver_id: offer.receiver_id,
    receiver_name: offer.receiver_name,
    item_id: offer.item.id,
    item_name: offer.item.name,
    quantity: offer.quantity,
    status: 'DECLINED',
    timestamp: Date.now(),
    notes: reason,
  });

  activeTradeOfferStore.set(null);
}

