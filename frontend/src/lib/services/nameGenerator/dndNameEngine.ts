// src/lib/services/nameGenerator/dndNameEngine.ts
// Canonical D&D Compound Morpheme Name Generator

export type DndCulture = 'dwarf' | 'elf' | 'halfling' | 'tiefling' | 'orc' | 'dragonborn';

const DWARF_FIRST = ['Adrik', 'Baern', 'Brottor', 'Bruenor', 'Dain', 'Darrak', 'Delg', 'Eberk', 'Fargrim', 'Harbek', 'Kildrak', 'Morgran', 'Oskar', 'Rurik', 'Taklinn', 'Thoradin', 'Tordek', 'Travok', 'Ulfgar', 'Vondal'];
const DWARF_PREFIX = ['Battle', 'Brawn', 'Fire', 'Frost', 'Iron', 'Copper', 'Gold', 'Silver', 'Stone', 'Anvil', 'Hammer', 'Axe', 'Shield', 'Rock', 'Grim', 'Steel'];
const DWARF_SUFFIX = ['hammer', 'anvil', 'forge', 'beard', 'fist', 'vein', 'brow', 'breaker', 'shield', 'grip', 'cleaver', 'stone', 'helm', 'heart', 'delver'];

const ELF_FIRST = ['Adran', 'Aelar', 'Aramil', 'Arannis', 'Beiro', 'Berrian', 'Carric', 'Enialis', 'Erdan', 'Galinndan', 'Hadarai', 'Heian', 'Himo', 'Immeral', 'Ivellios', 'Laucian', 'Mindartis', 'Paelias', 'Peren', 'Rolen', 'Soveliss', 'Thamior'];
const ELF_SURNAME = ['Amakiir (Gemflower)', 'Amastacia (Starflower)', 'Galanodel (Moonwhisper)', 'Holimion (Diamonddew)', 'Ilphelkiir (Gemblossom)', 'Liadon (Silverfrond)', 'Meliamne (Oakenheel)', 'Naïlo (Nightbreeze)', 'Siannodel (Moonbrook)'];

const HALFLING_FIRST = ['Alton', 'Ander', 'Cade', 'Corrin', 'Eldon', 'Errich', 'Finnan', 'Garret', 'Lindal', 'Lyle', 'Merric', 'Milo', 'Osborn', 'Perrin', 'Reed', 'Roscoe', 'Wellby'];
const HALFLING_PREFIX = ['Apple', 'Bramble', 'Brush', 'Cherry', 'Copper', 'Good', 'Green', 'High', 'Hill', 'Honey', 'Merry', 'Pebble', 'Tea', 'Thistle', 'Warm'];
const HALFLING_SUFFIX = ['barrel', 'bottle', 'bough', 'brook', 'burrow', 'butter', 'cheeks', 'down', 'foot', 'gather', 'hill', 'hollow', 'kettle', 'leaf', 'topple'];

const TIEFLING_VIRTUE = ['Art', 'Carrion', 'Chant', 'Creed', 'Despair', 'Excellence', 'Fear', 'Glory', 'Hope', 'Ideal', 'Music', 'Nowhere', 'Poetry', 'Quest', 'Reverence', 'Sorrow', 'Temerity', 'Torment'];
const ORC_FIRST = ['Dench', 'Feng', 'Gell', 'Henk', 'Holg', 'Imsh', 'Keth', 'Krusk', 'Mhurren', 'Ront', 'Shump', 'Thokk'];
const ORC_TRIBE = ['Bloodfist', 'Bonegnasher', 'Doomhammer', 'Gorehowl', 'Ironjaw', 'Ragescar', 'Skullcrusher'];

export function generateCanonicalDndName(culture: DndCulture): { name: string; tag: string } {
  const pick = <T>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];

  switch (culture) {
    case 'dwarf':
      return { name: `${pick(DWARF_FIRST)} ${pick(DWARF_PREFIX)}${pick(DWARF_SUFFIX)}`, tag: 'Dwarf (Mountain / Hill)' };
    case 'elf':
      return { name: `${pick(ELF_FIRST)} ${pick(ELF_SURNAME)}`, tag: 'Elf (Tel’Quessir)' };
    case 'halfling':
      return { name: `${pick(HALFLING_FIRST)} ${pick(HALFLING_PREFIX)}${pick(HALFLING_SUFFIX)}`, tag: 'Halfling (Hin)' };
    case 'tiefling':
      return { name: pick(TIEFLING_VIRTUE), tag: 'Tiefling (Virtue Concept)' };
    case 'orc':
      return { name: `${pick(ORC_FIRST)} of the ${pick(ORC_TRIBE)}`, tag: 'Orc Clan Heritage' };
    case 'dragonborn':
      return { name: `Daardendrian ${pick(['Arjhan', 'Balasar', 'Heskan', 'Kriv', 'Medrash', 'Rhogar', 'Torinn'])}`, tag: 'Dragonborn Lineage' };
  }
}
