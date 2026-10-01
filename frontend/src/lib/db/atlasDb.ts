// src/lib/db/atlasDb.ts
// Re-export of AtlasMapNode / AtlasPin schema and typed query helpers from mapsDb
// Keeps atlas logic isolated from tactical map concerns

export type {
  AtlasMapNode,
  AtlasPin,
  AtlasUnit,
  AtlasPinTargetType,
} from './mapsDb';

export { mapsDb as atlasDb } from './mapsDb';

// Typed query helpers
import { mapsDb } from './mapsDb';
import type { AtlasMapNode, AtlasPin } from './mapsDb';

/** Fetch direct children of a node, or root nodes when parentId is null. */
export async function fetchAtlasChildren(parentId: string | null): Promise<AtlasMapNode[]> {
  if (parentId === null) {
    return mapsDb.atlasNodes.where('parentId').equals('__root__').toArray()
      .then(async (roots) => {
        if (roots.length) return roots;
        // fallback: nodes with no parent stored as null string
        return mapsDb.atlasNodes.filter((n) => n.parentId === null || n.parentId === '__root__').toArray();
      });
  }
  return mapsDb.atlasNodes.where('parentId').equals(parentId).toArray();
}

/** Fetch all pins for a given atlas map node. */
export async function fetchAtlasPins(atlasMapId: string): Promise<AtlasPin[]> {
  return mapsDb.atlasPins.where('atlasMapId').equals(atlasMapId).toArray();
}

/** Upsert a node; assigns parentId = '__root__' when parentId is null. */
export async function upsertAtlasNode(node: AtlasMapNode): Promise<void> {
  const stored = { ...node, parentId: node.parentId ?? '__root__' };
  await mapsDb.atlasNodes.put(stored);
}

/** Upsert a pin. */
export async function upsertAtlasPin(pin: AtlasPin): Promise<void> {
  await mapsDb.atlasPins.put(pin);
}

/** Delete a pin by id. */
export async function deleteAtlasPin(pinId: string): Promise<void> {
  await mapsDb.atlasPins.delete(pinId);
}

/** Build breadcrumb chain for a node by walking parentId links. */
export async function buildBreadcrumb(nodeId: string): Promise<AtlasMapNode[]> {
  const chain: AtlasMapNode[] = [];
  let current: AtlasMapNode | undefined = await mapsDb.atlasNodes.get(nodeId);
  while (current) {
    chain.unshift(current);
    if (!current.parentId || current.parentId === '__root__') break;
    current = await mapsDb.atlasNodes.get(current.parentId);
  }
  return chain;
}
