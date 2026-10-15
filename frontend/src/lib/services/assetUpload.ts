export type AssetCategory = 'maps' | 'tokens' | 'audio' | 'models';

/**
 * Uploads a local file asset to the backend storage endpoint.
 * Returns the relative URL string accessible across all LAN nodes.
 */
export async function uploadAsset(
  file: File,
  category: AssetCategory
): Promise<string> {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('category', category);

  const response = await fetch('/api/assets/upload', {
    method: 'POST',
    body: formData
  });

  if (!response.ok) {
    throw new Error(`Asset upload failed with status ${response.status}: ${response.statusText}`);
  }

  const result = await response.json();
  const assetUrl = result?.url ?? result?.assetUrl ?? result?.path ?? `/assets/${category}/${file.name}`;
  return assetUrl;
}
