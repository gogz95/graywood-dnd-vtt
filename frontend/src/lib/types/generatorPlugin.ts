// src/lib/types/generatorPlugin.ts
// Uniform plugin contract for sandboxed procedural map generators

export type GeneratorId = 'azgaar' | 'watabou' | 'dungeon-scrawl' | 'eigengrau';

export type ExportFormat = 'png' | 'webp' | 'uvtt' | 'geojson' | 'svg';

/** Message sent FROM the iframe TO the parent when the user exports a map. */
export interface GeneratorExportMessage {
  type: 'GENERATOR_EXPORT';
  generatorId: GeneratorId;
  format: ExportFormat;
  /** Base64-encoded file content (no data-URI prefix). */
  dataBase64: string;
  /** Suggested filename including extension, e.g. "world_map.png" */
  filename: string;
  /** Optional UVTT/GeoJSON metadata payload (if format === 'uvtt') */
  metadata?: Record<string, unknown>;
}

/** Message sent FROM the parent TO the iframe to request export. */
export interface GeneratorRequestExportMessage {
  type: 'REQUEST_EXPORT';
  format: ExportFormat;
}

/** Message sent FROM the parent TO the iframe to request teardown. */
export interface GeneratorDestroyMessage {
  type: 'GENERATOR_DESTROY';
}

export type GeneratorInboundMessage =
  | GeneratorRequestExportMessage
  | GeneratorDestroyMessage;

export type GeneratorOutboundMessage = GeneratorExportMessage;

export interface GeneratorPlugin {
  id: GeneratorId;
  label: string;
  description: string;
  icon: string;
  /** Publicly hosted URL embedded in the sandboxed iframe */
  sandboxUrl: string;
  /** Export formats this generator supports */
  supportedFormats: ExportFormat[];
}

export const GENERATOR_PLUGINS: GeneratorPlugin[] = [
  {
    id: 'azgaar',
    label: 'Azgaar Fantasy Map',
    description: 'Procedural political world maps with cultures, religions, and biomes.',
    icon: '🌍',
    sandboxUrl: 'https://azgaar.github.io/Fantasy-Map-Generator/',
    supportedFormats: ['png', 'svg'],
  },
  {
    id: 'watabou',
    label: 'Watabou Medieval City',
    description: 'One-page dungeon & city generators with GeoJSON export.',
    icon: '🏰',
    sandboxUrl: 'https://watabou.github.io/city-generator/',
    supportedFormats: ['png', 'geojson'],
  },
  {
    id: 'dungeon-scrawl',
    label: 'Dungeon Scrawl',
    description: 'Grid-accurate dungeon mapper with wall/door export.',
    icon: '🗺️',
    sandboxUrl: 'https://app.dungeonscrawl.com/',
    supportedFormats: ['png', 'uvtt'],
  },
  {
    id: 'eigengrau',
    label: "Eigengrau's Generator",
    description: 'Full town generator with named NPCs, shops, and quests.',
    icon: '🏘️',
    sandboxUrl: 'https://eigengrausgenerator.com/',
    supportedFormats: ['png'],
  },
];
