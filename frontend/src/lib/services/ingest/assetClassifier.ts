// src/lib/services/ingest/assetClassifier.ts
// Classifies ingested assets by directory topology, file extension, or MIME type

import type { AssetCategory } from './ingestTypes';

export const SUPPORTED_EXTENSIONS: Record<AssetCategory, string[]> = {
  source: ['md', 'txt', 'json', 'jsonl', 'csv', 'tsv', 'zip', 'ds', 'pdf'],
  image: ['png', 'jpg', 'jpeg', 'webp', 'dd2vtt', 'uvtt', 'geojson'],
  audio: ['ogg', 'mp3', 'wav', 'flac', 'm4a'],
  video: ['mp4', 'webm'],
};

export const ALL_SUPPORTED_EXTENSIONS = Object.values(SUPPORTED_EXTENSIONS).flat();

/**
 * Classifies an asset into one of the four designated categories:
 * 'source', 'image', 'audio', or 'video'.
 */
export function classifyAsset(
  pathOrName: string,
  mimeType?: string
): AssetCategory {
  const normalized = pathOrName.replace(/\\/g, '/').toLowerCase();

  // 1. Check Subfolder-Aware Ingestion Topology
  if (
    normalized.includes('/source material/') ||
    normalized.startsWith('source material/') ||
    normalized.includes('/sources/') ||
    normalized.startsWith('sources/') ||
    normalized.includes('/compendiums/') ||
    normalized.startsWith('compendiums/')
  ) {
    return 'source';
  }

  if (
    normalized.includes('/image/') ||
    normalized.startsWith('image/') ||
    normalized.includes('/images/') ||
    normalized.startsWith('images/') ||
    normalized.includes('/maps/') ||
    normalized.startsWith('maps/') ||
    normalized.includes('/tokens/') ||
    normalized.startsWith('tokens/')
  ) {
    return 'image';
  }

  if (
    normalized.includes('/audio/') ||
    normalized.startsWith('audio/') ||
    normalized.includes('/sounds/') ||
    normalized.startsWith('sounds/') ||
    normalized.includes('/music/') ||
    normalized.startsWith('music/')
  ) {
    return 'audio';
  }

  if (
    normalized.includes('/video/') ||
    normalized.startsWith('video/') ||
    normalized.includes('/videos/') ||
    normalized.startsWith('videos/')
  ) {
    return 'video';
  }

  // 2. Extension-based Classification
  const ext = normalized.split('.').pop() || '';
  if (SUPPORTED_EXTENSIONS.source.includes(ext)) {
    return 'source';
  }
  if (SUPPORTED_EXTENSIONS.image.includes(ext)) {
    return 'image';
  }
  if (SUPPORTED_EXTENSIONS.audio.includes(ext)) {
    return 'audio';
  }
  if (SUPPORTED_EXTENSIONS.video.includes(ext)) {
    return 'video';
  }

  // 3. MIME-type fallback
  if (mimeType) {
    const lowerMime = mimeType.toLowerCase();
    if (lowerMime.startsWith('video/')) return 'video';
    if (lowerMime.startsWith('audio/')) return 'audio';
    if (lowerMime.startsWith('image/')) return 'image';
    if (
      lowerMime.startsWith('text/') ||
      lowerMime.includes('json') ||
      lowerMime.includes('pdf') ||
      lowerMime.includes('zip')
    ) {
      return 'source';
    }
  }

  return 'source';
}

/**
 * Checks whether an extension is supported by the ingestion pipeline.
 */
export function isSupportedExtension(extension: string): boolean {
  const cleanExt = extension.toLowerCase().replace(/^\./, '');
  return ALL_SUPPORTED_EXTENSIONS.includes(cleanExt);
}
