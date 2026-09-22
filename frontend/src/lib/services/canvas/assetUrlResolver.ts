// src/lib/services/canvas/assetUrlResolver.ts
// Maps desktop asset protocols and relative paths to LAN HTTP static asset server endpoints.

export const LAN_ASSET_PORT = 5174;

/**
 * Resolves an asset URL (asset://, https://asset.localhost/, relative path, or http URL)
 * into a local HTTP static server endpoint accessible by LAN mobile clients.
 */
export function resolveLanAssetUrl(rawUrl: string | undefined | null): string {
  if (!rawUrl || rawUrl.trim() === '') {
    return '';
  }

  const trimmed = rawUrl.trim();

  // Inlined data URIs or object blob URLs do not require rewriting
  if (trimmed.startsWith('data:') || trimmed.startsWith('blob:')) {
    return trimmed;
  }

  const hostname =
    typeof window !== 'undefined' && window.location.hostname
      ? window.location.hostname
      : '127.0.0.1';

  const lanHttpBase = `http://${hostname}:${LAN_ASSET_PORT}`;

  // Strip desktop custom protocol prefixes
  if (
    trimmed.startsWith('asset://') ||
    trimmed.startsWith('https://asset.localhost/') ||
    trimmed.startsWith('http://asset.localhost/')
  ) {
    const cleanPath = trimmed
      .replace(/^(asset:\/\/|https:\/\/asset\.localhost\/|http:\/\/asset\.localhost\/)/, '')
      .replace(/^\/+/, '');
    return `${lanHttpBase}/api/campaign/assets/${cleanPath}`;
  }

  // Already an API path
  if (trimmed.startsWith('/api/campaign/assets/')) {
    return `${lanHttpBase}${trimmed}`;
  }

  // Rewrite existing absolute URLs if they point to an asset endpoint on another port
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    if (trimmed.includes('/api/campaign/assets/')) {
      const parts = trimmed.split('/api/campaign/assets/');
      return `${lanHttpBase}/api/campaign/assets/${parts[1]}`;
    }
    return trimmed;
  }

  // Relative asset subpath: e.g. "maps/dungeon_level_1.webp" or "tokens/goblin.png"
  const cleanRelative = trimmed.replace(/^\/+/, '');
  return `${lanHttpBase}/api/campaign/assets/${cleanRelative}`;
}
