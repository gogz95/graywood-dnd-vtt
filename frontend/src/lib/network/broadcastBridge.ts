// broadcastBridge.ts — Local LAN WebSocket & Cross-Device Handout Broadcast Bridge
// Dispatches sanitized parchment handouts across the Axum WebSocket server and handles player client overlays.

import { writable, get } from 'svelte/store';
import { sendWsEvent } from '../../stores/websocketStore';
import { dispatchSoundEvent } from '../audio/soundboardBridge';

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
}

/**
 * Broadcasts a rendered parchment handout to all connected player screens.
 * Strips secret DM notes before serialization to guarantee zero player leakage.
 */
export function broadcastHandoutToParty(handout: HandoutDocument): PlayerBroadcastPayload {
  const sanitizedPayload: PlayerBroadcastPayload = {
    handout_id: handout.id,
    title: handout.title,
    subtitle: handout.subtitle || undefined,
    content_markdown: handout.contentMarkdown,
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
