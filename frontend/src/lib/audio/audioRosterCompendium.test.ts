// audioRosterCompendium.test.ts — Unit tests for AudioEngine, Document Chunker, Compendium Importer, and Session Store

import { AudioEngine } from './AudioEngine';
import { chunkText } from '../importers/documentImporter';
import { normalizeEntity } from '../importers/compendiumImporter';
import { sessionStore } from '../../stores/sessionStore';

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) {
    throw new Error(`Assertion Failed: ${message}`);
  }
}

function assertEqual<T>(actual: T, expected: T, message?: string): void {
  if (actual !== expected) {
    throw new Error(`Assertion Failed: expected ${String(expected)}, got ${String(actual)}. ${message || ''}`);
  }
}

async function runAllTests() {
  console.log('--- 1. Testing AudioEngine Dual-Bus & Procedural Synthesizers ---');

  const engine = new AudioEngine();
  // Context should be deferred until user interaction
  assert((engine as any).ctx === null, 'Context should be null before user gesture');
  assertEqual(engine.getMasterVolume(), 0.8, 'Default master volume');
  assertEqual(engine.getAmbienceVolume(), 0.7, 'Default ambience volume');
  assertEqual(engine.getSfxVolume(), 0.8, 'Default sfx volume');

  // Volume clamping
  engine.setMasterVolume(1.5);
  assertEqual(engine.getMasterVolume(), 1.0, 'Master volume clamped to 1.0');

  engine.setMasterVolume(-0.5);
  assertEqual(engine.getMasterVolume(), 0.0, 'Master volume clamped to 0.0');

  engine.setAmbienceVolume(0.45);
  assertEqual(engine.getAmbienceVolume(), 0.45, 'Ambience volume set to 0.45');

  engine.setSfxVolume(0.65);
  assertEqual(engine.getSfxVolume(), 0.65, 'SFX volume set to 0.65');

  // Track & SFX Button registration
  engine.addTrack({
    id: 'test-track-1',
    label: 'Dungeon Ambience',
    url: 'https://example.com/ambience.mp3',
    loop: true,
    isAmbience: true,
  });

  assertEqual(engine.getTracks().length, 1, 'Track count should be 1');
  assertEqual(engine.getTracks()[0].label, 'Dungeon Ambience', 'Track label should match');

  engine.addSfxButton({
    id: 'sfx-dice',
    label: 'Dice Clatter',
    hotkey: 1,
    url: null,
    procedural: true,
  });

  assertEqual(engine.getSfxButtons().length, 1, 'SFX button count should be 1');
  assertEqual(engine.getSfxButtons()[0].hotkey, 1, 'SFX hotkey should be 1');

  console.log('✓ AudioEngine tests passed.');

  console.log('--- 2. Testing Document Chunker & Header Path Tracking ---');

  const markdown = `# Chapter 1: Combat
In combat, each participant has a turn.

## Actions in Combat
When you take your action, you can choose from attack, cast a spell, dash, disengage, dodge, help, hide, ready, search, or use an object.

### Attack Action
The most common action to take in combat is the Attack action, whether you are swinging a sword, firing an arrow, or brawling with your fists. With this action, you make one melee or ranged attack. See the "Making an Attack" section for the rules that govern attacks.

### Cast a Spell Action
Spellcasters such as wizards and clerics, as well as many monsters, have access to spells and can use them to great effect in combat. Each spell has a casting time, which specifies whether the caster must use an action, a reaction, minutes, or even hours to cast the spell.`;

  const chunks = chunkText(markdown, 200, 30, 'doc-1', 'Rules Reference');
  assert(chunks.length >= 2, `Expected at least 2 chunks, got ${chunks.length}`);

  // Verify header breadcrumb paths
  const hasCombatActionHeader = chunks.some(c =>
    c.headerPath.includes('Combat') && c.headerPath.includes('Actions in Combat')
  );
  assert(hasCombatActionHeader, 'Expected header breadcrumbs to track Chapter and Section');

  const attackChunk = chunks.find(c => c.content.includes('Attack action'));
  assert(attackChunk !== undefined, 'Expected chunk containing Attack action');
  assert(attackChunk.headerPath.includes('Attack Action'), 'Header path should contain Attack Action');
  assert(attackChunk.tokenEstimate > 0, 'Token estimate should be > 0');

  // Plain text handling
  const plain = 'Simple plain text without markdown headers. Just standard sentences describing a room or scene.';
  const plainChunks = chunkText(plain, 500, 50, 'doc-plain', 'Scene Notes');
  assertEqual(plainChunks.length, 1, 'Plain text should produce 1 chunk');
  assertEqual(plainChunks[0].headerPath, 'Scene Notes', 'Header path should default to title');
  assertEqual(plainChunks[0].content, plain, 'Content should match input text');

  console.log('✓ Document Chunker tests passed.');

  console.log('--- 3. Testing 5E Compendium Importer Normalization ---');

  const rawMonster = {
    name: 'Young Red Dragon',
    size: 'Large',
    type: 'dragon',
    alignment: 'chaotic evil',
    armor_class: 18,
    hit_points: 178,
    speed: '40 ft., climb 40 ft., fly 80 ft.',
    challenge_rating: 10,
    strength: 23,
    dexterity: 10,
    constitution: 21,
    intelligence: 14,
    wisdom: 11,
    charisma: 19,
    actions: [
      { name: 'Multiattack', desc: 'The dragon makes three attacks: one with its bite and two with its claws.' },
      { name: 'Fire Breath', desc: 'The dragon exhales fire in a 30-foot cone. Each creature in that area must make a DC 17 Dexterity saving throw...' }
    ],
    description: 'A young chromatic dragon with crimson scales and fiery breath.'
  };

  const monster = normalizeEntity(rawMonster);
  assert(monster !== null, 'Monster should be normalized');
  assertEqual(monster.name, 'Young Red Dragon', 'Monster name');
  assertEqual(monster.type, 'creature', 'Monster type');
  assertEqual(monster.cr, 10, 'Monster CR');
  assertEqual(monster.ac, 18, 'Monster AC');
  assertEqual(monster.hp, 178, 'Monster HP');
  assertEqual(monster.str, 23, 'Monster STR');
  assertEqual(monster.actions?.length, 2, 'Actions count');

  // Spell normalization
  const rawSpell = {
    name: 'Misty Step',
    level: 2,
    school: 'Conjuration',
    casting_time: '1 bonus action',
    range: 'Self',
    components: 'V',
    duration: 'Instantaneous',
    description: 'Briefly surrounded by silvery mist, you teleport up to 30 feet to an unoccupied space you can see.'
  };

  const spell = normalizeEntity(rawSpell);
  assert(spell !== null, 'Spell should be normalized');
  assertEqual(spell.name, 'Misty Step', 'Spell name');
  assertEqual(spell.type, 'spell', 'Spell type');
  assertEqual(spell.level, 2, 'Spell level');
  assertEqual(spell.school, 'Conjuration', 'Spell school');

  // Item normalization
  const rawItem = {
    name: 'Boots of Elvenkind',
    category: 'Wondrous Item',
    rarity: 'Uncommon',
    weight: 1.0,
    requires_attunement: false,
    description: 'While you wear these boots, your steps make no sound, regardless of the surface you are moving across.'
  };

  const item = normalizeEntity(rawItem);
  assert(item !== null, 'Item should be normalized');
  assertEqual(item.name, 'Boots of Elvenkind', 'Item name');
  assertEqual(item.type, 'item', 'Item type');
  assertEqual(item.rarity, 'Uncommon', 'Item rarity');
  assertEqual(item.weight, 1.0, 'Item weight');

  console.log('✓ 5E Compendium Importer tests passed.');

  console.log('--- 4. Testing SessionStore Stash & Combat Dispatch ---');

  const addedItem = sessionStore.addItemToPartyStash({
    name: 'Test Elixir of Giants',
    category: 'Potion',
    quantity: 2,
    weight: 0.5,
    description: 'Increases strength to 21 for 1 hour.',
  });

  assert(Boolean(addedItem.id), 'Item should have an id');
  assertEqual(addedItem.name, 'Test Elixir of Giants', 'Item name');

  // Add same item again to verify quantity stacking
  sessionStore.addItemToPartyStash({
    name: 'Test Elixir of Giants',
    category: 'Potion',
    quantity: 3,
  });

  const found = sessionStore.getPartyStash().find(i => i.name === 'Test Elixir of Giants');
  assert(found !== undefined, 'Found item should exist');
  assertEqual(found.quantity, 5, 'Stacked quantity should be 5');

  // Clean up
  sessionStore.removePartyStashItem(addedItem.id);

  // Monster combat dispatch
  const combatant = sessionStore.addMonsterToCombat({
    name: 'Owlbear',
    hp: 59,
    ac: 13,
    cr: 3,
    description: 'A monstrous cross between a giant owl and a bear.',
  });

  assert(Boolean(combatant.id), 'Combatant should have an id');
  assertEqual(combatant.name, 'Owlbear', 'Combatant name');
  assertEqual(combatant.hp_current, 59, 'Combatant current HP');
  assertEqual(combatant.hp_max, 59, 'Combatant max HP');
  assertEqual(combatant.ac, 13, 'Combatant AC');
  assertEqual(combatant.is_monster, true, 'Combatant is_monster flag');
  assert(combatant.initiative >= 1 && combatant.initiative <= 20, 'Initiative between 1 and 20');

  console.log('✓ SessionStore tests passed.');

  console.log('\n========================================');
  console.log('ALL AUDIO, ROSTER, AND COMPENDIUM TESTS PASSED!');
  console.log('========================================');
}

runAllTests().catch((err) => {
  console.error('Test Suite Failed:', err);
  throw err;
});
