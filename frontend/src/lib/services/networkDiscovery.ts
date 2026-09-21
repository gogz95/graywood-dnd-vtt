// src/lib/services/networkDiscovery.ts
// Dynamic LAN IP resolution and Player Mobile Companion URL generation

export interface NetworkInfo {
  ip: string;
  port: number;
  playUrl: string;
}

const STORAGE_LAN_IP_KEY = 'vtt_lan_ip';
const STORAGE_LAN_PORT_KEY = 'vtt_lan_port';

let cachedLanIp: string | null = null;
let cachedLanPort: number | null = null;

/**
 * Dynamically resolves the active local LAN IP address.
 * 1. Checks if running under Tauri runtime (`invoke('get_lan_ip')`).
 * 2. Checks backend `/api/system/network-info` endpoint.
 * 3. Falls back to window.location.hostname (if not localhost).
 * 4. Checks localStorage cache or defaults to 'localhost'.
 */
export async function getLanIp(): Promise<string> {
  if (cachedLanIp && cachedLanIp !== '127.0.0.1' && cachedLanIp !== 'localhost') {
    return cachedLanIp;
  }

  // 1. Tauri Runtime Check
  if (typeof window !== 'undefined' && (('__TAURI__' in window) || ('__TAURI_INTERNALS__' in window))) {
    try {
      const win = window as any;
      const invokeFn = win.__TAURI__?.core?.invoke || win.__TAURI_INTERNALS__?.invoke;
      if (typeof invokeFn === 'function') {
        const ip = await invokeFn('get_lan_ip');
        if (ip && ip !== '127.0.0.1' && ip !== 'localhost') {
          cachedLanIp = ip;
          localStorage.setItem(STORAGE_LAN_IP_KEY, ip);
          return ip;
        }
      }
    } catch {
      // Non-blocking fallback
    }
  }

  // 2. Embedded Server Network Info API
  if (typeof window !== 'undefined') {
    try {
      const port = window.location.port || '8080';
      const res = await fetch(`http://${window.location.hostname || 'localhost'}:${port}/api/system/network-info`, {
        signal: AbortSignal.timeout(1500)
      }).catch(() => fetch('/api/system/network-info', { signal: AbortSignal.timeout(1500) }));

      if (res && res.ok) {
        const data = await res.json();
        if (data.ip && data.ip !== '127.0.0.1' && data.ip !== 'localhost') {
          cachedLanIp = data.ip;
          localStorage.setItem(STORAGE_LAN_IP_KEY, data.ip);
          return data.ip;
        }
      }
    } catch {
      // Non-blocking fallback
    }
  }

  // 3. Current window location host detection
  if (typeof window !== 'undefined') {
    const host = window.location.hostname;
    if (host && host !== 'localhost' && host !== '127.0.0.1' && !host.startsWith('127.')) {
      cachedLanIp = host;
      localStorage.setItem(STORAGE_LAN_IP_KEY, host);
      return host;
    }
  }

  // 4. Stored user preference in localStorage
  if (typeof localStorage !== 'undefined') {
    const saved = localStorage.getItem(STORAGE_LAN_IP_KEY);
    if (saved && saved.trim()) {
      cachedLanIp = saved.trim();
      return cachedLanIp;
    }
  }

  // Fallback
  return typeof window !== 'undefined' && window.location.hostname ? window.location.hostname : 'localhost';
}

/**
 * Returns the effective port for player connections.
 */
export function getLanPort(): number {
  if (cachedLanPort) return cachedLanPort;
  if (typeof window !== 'undefined') {
    const port = window.location.port;
    if (port) {
      cachedLanPort = parseInt(port, 10);
      return cachedLanPort;
    }
  }
  if (typeof localStorage !== 'undefined') {
    const saved = localStorage.getItem(STORAGE_LAN_PORT_KEY);
    if (saved) {
      cachedLanPort = parseInt(saved, 10);
      return cachedLanPort;
    }
  }
  return 5173;
}

/**
 * Sets and persists an explicit manual LAN IP override if configured by the DM.
 */
export function setLanIp(ip: string): void {
  cachedLanIp = ip.trim();
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(STORAGE_LAN_IP_KEY, cachedLanIp);
  }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('vtt:lan-ip-updated', { detail: { ip: cachedLanIp } }));
  }
}

/**
 * Generates the direct, scannable player companion URL.
 */
export function getPlayUrl(pin?: string, port?: number): string {
  const protocol = typeof window !== 'undefined' ? window.location.protocol : 'http:';
  const resolvedHost = cachedLanIp || (typeof window !== 'undefined' ? window.location.hostname : 'localhost');
  const resolvedPort = port || getLanPort();

  const isStandardPort = (protocol === 'http:' && resolvedPort === 80) || (protocol === 'https:' && resolvedPort === 443);
  const portPart = isStandardPort ? '' : `:${resolvedPort}`;
  const pinPart = pin ? `?pin=${encodeURIComponent(pin.trim())}` : '';

  return `${protocol}//${resolvedHost}${portPart}/play${pinPart}`;
}
