// frontend/src/lib/services/errorBoundary.ts
// Global Crash Guard & Local Session Backup for Graywood VTT Workstation

import { canvasStore } from '../stores/canvasStore';
import { combatStore } from '../stores/combatStore.svelte';
import { tokenStore } from '../stores/tokenStore.svelte';

export const EMERGENCY_RESTORE_KEY = 'graywood_emergency_restore';

export interface EmergencySnapshot {
  timestamp: number;
  error: {
    message: string;
    stack?: string;
  };
  activeMapId: string | null;
  mapImageUrl: string;
  combatRound: number;
  combatTurnIndex: number;
  isCombatActive: boolean;
  tokens: Array<{
    id: string;
    name: string;
    x: number;
    y: number;
    hp?: number;
    maxHp?: number;
    conditions?: string[];
  }>;
}

/**
 * Serializes active unsaved state (token positions, combat round, active map)
 * into localStorage under `graywood_emergency_restore`.
 */
export function captureEmergencyRestore(reason: Error | string): EmergencySnapshot | null {
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') {
    return null;
  }

  try {
    const errorDetails =
      reason instanceof Error
        ? { message: reason.message, stack: reason.stack }
        : { message: String(reason) };

    const tokensSnapshot = (tokenStore.tokens.length > 0 ? tokenStore.tokens : canvasStore.tokens).map(
      (t) => ({
        id: t.id,
        name: t.name,
        x: t.x,
        y: t.y,
        hp: t.hp,
        maxHp: t.maxHp,
        conditions: t.conditions ? [...t.conditions] : [],
      })
    );

    const snapshot: EmergencySnapshot = {
      timestamp: Date.now(),
      error: errorDetails,
      activeMapId: (canvasStore as any).activeMapId || null,
      mapImageUrl: canvasStore.mapImageUrl || '',
      combatRound: combatStore.round ?? 1,
      combatTurnIndex: combatStore.turnIndex ?? 0,
      isCombatActive: combatStore.isActive ?? false,
      tokens: tokensSnapshot,
    };

    localStorage.setItem(EMERGENCY_RESTORE_KEY, JSON.stringify(snapshot));
    return snapshot;
  } catch (err) {
    console.error('[ErrorBoundary] Failed to serialize emergency recovery snapshot:', err);
    return null;
  }
}

/**
 * Checks for a saved emergency snapshot in localStorage.
 */
export function getEmergencySnapshot(): EmergencySnapshot | null {
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(EMERGENCY_RESTORE_KEY);
    return raw ? (JSON.parse(raw) as EmergencySnapshot) : null;
  } catch {
    return null;
  }
}

/**
 * Clears the emergency recovery snapshot.
 */
export function clearEmergencySnapshot(): void {
  if (typeof window !== 'undefined' && typeof localStorage !== 'undefined') {
    localStorage.removeItem(EMERGENCY_RESTORE_KEY);
  }
}

/**
 * Displays a lightweight non-blocking toast warning allowing the user to refresh
 * without losing tactical combat state.
 */
export function showCrashRecoveryToast(message: string): void {
  if (typeof document === 'undefined') return;

  const existingToast = document.getElementById('graywood-crash-recovery-toast');
  if (existingToast) {
    existingToast.remove();
  }

  const toast = document.createElement('div');
  toast.id = 'graywood-crash-recovery-toast';
  toast.setAttribute('role', 'alert');
  toast.style.cssText = `
    position: fixed;
    bottom: 24px;
    right: 24px;
    z-index: 999999;
    max-width: 440px;
    background: #18181b;
    border: 1px solid #dc2626;
    border-radius: 8px;
    box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.7), 0 8px 10px -6px rgba(220, 38, 38, 0.4);
    color: #f4f4f5;
    font-family: system-ui, -apple-system, sans-serif;
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 10px;
    animation: fadeIn 0.2s ease-out;
  `;

  toast.innerHTML = `
    <div style="display: flex; align-items: center; gap: 8px;">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"></path>
        <line x1="12" y1="9" x2="12" y2="13"></line>
        <line x1="12" y1="17" x2="12.01" y2="17"></line>
      </svg>
      <strong style="color: #ef4444; font-size: 14px;">Crash Guard: Tactical State Backed Up</strong>
    </div>
    <p style="margin: 0; font-size: 12px; color: #a1a1aa; line-height: 1.4;">
      An unexpected error occurred. Active token positions, combat round, and map state were saved to local emergency storage.
    </p>
    <div style="font-family: monospace; font-size: 11px; color: #f87171; background: #27272a; padding: 6px 8px; border-radius: 4px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
      ${message.replace(/</g, '&lt;').replace(/>/g, '&gt;')}
    </div>
    <div style="display: flex; justify-content: flex-end; gap: 8px; margin-top: 4px;">
      <button id="graywood-dismiss-toast" style="background: transparent; border: 1px solid #3f3f46; color: #d4d4d8; font-size: 12px; padding: 4px 10px; border-radius: 4px; cursor: pointer;">
        Dismiss
      </button>
      <button id="graywood-reload-btn" style="background: #dc2626; border: none; color: #ffffff; font-size: 12px; font-weight: 500; padding: 4px 12px; border-radius: 4px; cursor: pointer;">
        Reload Session
      </button>
    </div>
  `;

  document.body.appendChild(toast);

  document.getElementById('graywood-dismiss-toast')?.addEventListener('click', () => {
    toast.remove();
  });

  document.getElementById('graywood-reload-btn')?.addEventListener('click', () => {
    window.location.reload();
  });
}

/**
 * Initializes global error and unhandled rejection listeners.
 */
export function initGlobalCrashGuard(): void {
  if (typeof window === 'undefined') return;

  window.addEventListener('error', (event: ErrorEvent) => {
    console.error('[GlobalCrashGuard] Uncaught error:', event.error || event.message);
    const err = event.error || new Error(event.message || 'Unknown runtime error');
    captureEmergencyRestore(err);
    showCrashRecoveryToast(err.message || 'Script error occurred');
  });

  window.addEventListener('unhandledrejection', (event: PromiseRejectionEvent) => {
    console.error('[GlobalCrashGuard] Unhandled promise rejection:', event.reason);
    const reason = event.reason instanceof Error ? event.reason : new Error(String(event.reason));
    captureEmergencyRestore(reason);
    showCrashRecoveryToast(reason.message || 'Async promise rejection');
  });
}
