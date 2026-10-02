// frontend/src/lib/services/assetUrlResolver.ts
// Relative workspace URI transformer for Graywood custom asset protocol.

export const WORKSPACE_PROTOCOL = 'graywood-asset:';
export const WORKSPACE_ORIGIN = 'graywood-asset://localhost';
export const WORKSPACE_PREFIX = `${WORKSPACE_ORIGIN}/`;

/**
 * Transforms a workspace-relative file path into a secure `graywood-asset://localhost/...` URL.
 * Scoped strictly to the active workspace directory.
 *
 * @param relativePath Relative asset path (e.g. "Maps/Dungeon.png" or "Sourcebooks/PHB.pdf")
 * @returns Fully qualified custom protocol URL
 * @throws Error if path attempts directory traversal outside the workspace boundary
 */
export function resolveAssetUrl(relativePath: string): string {
  if (!relativePath || typeof relativePath !== 'string') {
    return '';
  }

  const trimmed = relativePath.trim();
  if (trimmed === '') {
    return '';
  }

  // Preserve already formatted workspace protocol URLs
  if (trimmed.startsWith(WORKSPACE_ORIGIN)) {
    const internalPath = trimmed.slice(WORKSPACE_ORIGIN.length);
    validateNoDirectoryTraversal(internalPath);
    return trimmed;
  }

  if (trimmed.startsWith('graywood-asset://')) {
    const afterScheme = trimmed.replace(/^graywood-asset:\/\//, '');
    const cleanPath = afterScheme.replace(/^localhost\/?/, '');
    validateNoDirectoryTraversal(cleanPath);
    return `${WORKSPACE_PREFIX}${cleanPath}`;
  }

  // External web URLs, blobs, and data URIs are returned as-is
  if (
    trimmed.startsWith('http://') ||
    trimmed.startsWith('https://') ||
    trimmed.startsWith('data:') ||
    trimmed.startsWith('blob:')
  ) {
    return trimmed;
  }

  // Normalize Windows-style separators to POSIX slashes
  const normalized = trimmed.replace(/\\/g, '/');

  // Verify path does not escape the workspace directory root
  validateNoDirectoryTraversal(normalized);

  // Strip leading slashes to keep it strictly relative
  const cleanPath = normalized.replace(/^\/+/, '');

  // Encode path components safely while preserving directory slashes
  const encodedSegments = cleanPath
    .split('/')
    .filter((segment) => segment.length > 0)
    .map((segment) => {
      try {
        return encodeURIComponent(decodeURIComponent(segment));
      } catch {
        return encodeURIComponent(segment);
      }
    });

  return `${WORKSPACE_PREFIX}${encodedSegments.join('/')}`;
}

/**
 * Validates that a path does not contain directory traversal sequences ("..").
 * Throws an Error if directory traversal is detected.
 */
function validateNoDirectoryTraversal(path: string): void {
  const segments = path.split(/[/\\]/);
  for (const seg of segments) {
    if (seg === '..') {
      throw new Error(`Directory traversal rejected: asset path "${path}" cannot escape workspace root`);
    }
  }
}

/**
 * Checks if a given URL uses the `graywood-asset://` scheme.
 */
export function isWorkspaceAssetUrl(url: string): boolean {
  if (!url || typeof url !== 'string') return false;
  return url.startsWith('graywood-asset://');
}

/**
 * Converts a `graywood-asset://localhost/...` URL back to a relative workspace path.
 */
export function toRelativeAssetPath(url: string): string {
  if (!url || typeof url !== 'string') return '';
  if (url.startsWith(WORKSPACE_PREFIX)) {
    return decodeURIComponent(url.slice(WORKSPACE_PREFIX.length));
  }
  if (url.startsWith('graywood-asset://')) {
    const stripped = url.replace(/^graywood-asset:\/\/(localhost\/)?/, '');
    return decodeURIComponent(stripped);
  }
  return url;
}
