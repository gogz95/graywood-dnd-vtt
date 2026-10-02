import { describe, it, expect } from 'vitest';
import {
  resolveAssetUrl,
  isWorkspaceAssetUrl,
  toRelativeAssetPath,
  WORKSPACE_ORIGIN,
} from './assetUrlResolver';

describe('assetUrlResolver', () => {
  it('transforms standard relative paths to custom protocol URLs', () => {
    expect(resolveAssetUrl('Maps/Dungeon.png')).toBe(
      `${WORKSPACE_ORIGIN}/Maps/Dungeon.png`
    );
    expect(resolveAssetUrl('Sourcebooks/PHB.pdf')).toBe(
      `${WORKSPACE_ORIGIN}/Sourcebooks/PHB.pdf`
    );
    expect(resolveAssetUrl('tokens/monster.webp')).toBe(
      `${WORKSPACE_ORIGIN}/tokens/monster.webp`
    );
  });

  it('normalizes Windows backslashes and leading slashes', () => {
    expect(resolveAssetUrl('Maps\\SubFolder\\Dungeon.png')).toBe(
      `${WORKSPACE_ORIGIN}/Maps/SubFolder/Dungeon.png`
    );
    expect(resolveAssetUrl('/Maps/Dungeon.png')).toBe(
      `${WORKSPACE_ORIGIN}/Maps/Dungeon.png`
    );
    expect(resolveAssetUrl('///Maps/Dungeon.png')).toBe(
      `${WORKSPACE_ORIGIN}/Maps/Dungeon.png`
    );
  });

  it('rejects directory traversal attempts attempting to escape workspace root', () => {
    expect(() => resolveAssetUrl('../secret.txt')).toThrow(/Directory traversal rejected/);
    expect(() => resolveAssetUrl('Maps/../../secret.txt')).toThrow(/Directory traversal rejected/);
    expect(() => resolveAssetUrl('..\\secret.txt')).toThrow(/Directory traversal rejected/);
  });

  it('preserves existing external and workspace URLs', () => {
    expect(resolveAssetUrl('https://example.com/map.jpg')).toBe('https://example.com/map.jpg');
    expect(resolveAssetUrl('data:image/png;base64,abc')).toBe('data:image/png;base64,abc');
    expect(resolveAssetUrl('blob:http://localhost/123')).toBe('blob:http://localhost/123');
    expect(resolveAssetUrl('graywood-asset://localhost/Maps/Dungeon.png')).toBe(
      'graywood-asset://localhost/Maps/Dungeon.png'
    );
  });

  it('validates workspace asset url detection and inverse transformation', () => {
    const fullUrl = 'graywood-asset://localhost/Maps/Dungeon.png';
    expect(isWorkspaceAssetUrl(fullUrl)).toBe(true);
    expect(isWorkspaceAssetUrl('https://other.com/a.png')).toBe(false);

    expect(toRelativeAssetPath(fullUrl)).toBe('Maps/Dungeon.png');
  });
});
