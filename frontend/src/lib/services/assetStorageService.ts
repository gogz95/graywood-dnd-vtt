// src/lib/services/assetStorageService.ts
// Direct Campaign Directory Asset Persistence Service
// Routes parsed maps, tokens, audio, and source material into scaffolded campaign folders.

export type CampaignAssetFolder =
  | 'maps'
  | 'tokens'
  | 'audio'
  | 'Ingest/Source material'
  | 'compendiums';

export interface AssetStorageResult {
  success: boolean;
  url?: string;
  relativePath: string;
  error?: string;
}

/**
 * Converts a Blob or Uint8Array to a pure Base64 string (without data URL prefix).
 */
export async function toBase64String(data: Blob | Uint8Array | string): Promise<string> {
  if (typeof data === 'string') {
    // If it's already a data URL, strip prefix
    if (data.includes(',')) {
      return data.split(',')[1];
    }
    return data;
  }

  if (data instanceof Uint8Array) {
    let binary = '';
    const len = data.byteLength;
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(data[i]);
    }
    return btoa(binary);
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result as string;
      const base64 = result.includes(',') ? result.split(',')[1] : result;
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(data);
  });
}

/**
 * Converts a base64 string to a Blob.
 */
export function base64ToBlob(base64: string, mimeType = 'application/octet-stream'): Blob {
  const cleanBase64 = base64.includes(',') ? base64.split(',')[1] : base64;
  const byteChars = atob(cleanBase64);
  const byteNumbers = new Array(byteChars.length);
  for (let i = 0; i < byteChars.length; i++) {
    byteNumbers[i] = byteChars.charCodeAt(i);
  }
  const byteArray = new Uint8Array(byteNumbers);
  return new Blob([byteArray], { type: mimeType });
}

/**
 * Persists an asset into the active campaign's scaffolded folders via the Axum backend route.
 */
export async function saveCampaignAsset(
  subfolder: CampaignAssetFolder,
  filename: string,
  data: Blob | Uint8Array | string
): Promise<AssetStorageResult> {
  const cleanFilename = filename.replace(/[/\\]/g, '_');
  const relativePath = `${subfolder}/${cleanFilename}`;

  try {
    const base64Data = await toBase64String(data);

    // Call Axum HTTP backend: POST /api/campaign/assets/save
    const response = await fetch('/api/campaign/assets/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        subfolder,
        filename: cleanFilename,
        data_base64: base64Data,
      }),
    });

    if (response.ok) {
      const json = await response.json();
      return {
        success: true,
        url: json.url || `/api/campaign/assets/${subfolder}/${encodeURIComponent(cleanFilename)}`,
        relativePath,
      };
    }

    const errData = await response.json().catch(() => ({}));
    return {
      success: false,
      relativePath,
      error: errData.error || response.statusText || 'Failed to save asset to campaign folder',
    };
  } catch (err: any) {
    // Graceful fallback for offline or browser-only mock modes
    return {
      success: false,
      relativePath,
      error: err?.message || 'Network error saving asset',
    };
  }
}

/**
 * Convenience helper to save a map image and its accompanying metadata JSON sidecar.
 */
export async function saveMapWithSidecar(
  mapName: string,
  imagePayload: Blob | string,
  sidecarMetadata: Record<string, any>,
  imageExtension: 'png' | 'webp' = 'png'
): Promise<{ imageResult: AssetStorageResult; sidecarResult: AssetStorageResult }> {
  const baseName = mapName.replace(/\.[^/.]+$/, '');
  const imageFilename = `${baseName}.${imageExtension}`;
  const sidecarFilename = `${baseName}.uvtt.json`;

  const imageResult = await saveCampaignAsset('maps', imageFilename, imagePayload);

  const sidecarBlob = new Blob([JSON.stringify(sidecarMetadata, null, 2)], {
    type: 'application/json',
  });
  const sidecarResult = await saveCampaignAsset('maps', sidecarFilename, sidecarBlob);

  return { imageResult, sidecarResult };
}
