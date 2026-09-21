// loreGraph.test.ts — Automated Unit Test Suite for Relational Lore Graph & Valuation Engine

// Setup runtime polyfill for Svelte 5 runes & localStorage in Node.js test runner
if (typeof (globalThis as Record<string, unknown>).$state === 'undefined') {
  (globalThis as Record<string, unknown>).$state = <T>(val: T): T => val;
}

if (typeof (globalThis as Record<string, unknown>).localStorage === 'undefined') {
  const memStore: Record<string, string> = {};
  (globalThis as Record<string, unknown>).localStorage = {
    getItem: (k: string) => memStore[k] ?? null,
    setItem: (k: string, v: string) => { memStore[k] = String(v); },
    removeItem: (k: string) => { delete memStore[k]; },
    clear: () => { Object.keys(memStore).forEach(k => delete memStore[k]); },
  };
}

import {
  calculateSanePrice,
  generateManifest,
  addCargoToPartyStash,
} from '../economy/valuationEngine';

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`Assertion Failed: ${message}`);
  }
}

async function runTests() {
  const { loreGraphStore } = await import('./loreGraphStore.svelte');

  console.log('--- 1. Testing Relational Lore Graph Database Store ---');

  // Verify store can be cleared to zero-state (zero mock data baseline)
  loreGraphStore.clearAll();
  assert(loreGraphStore.entities.length === 0, 'Store must initialize or clear strictly to 0 entities');
  assert(loreGraphStore.relationships.length === 0, 'Store must initialize or clear strictly to 0 relationships');

  // Add test entities dynamically
  const guardFaction = loreGraphStore.addEntity({
    type: 'FACTION',
    name: 'City Guard Watch',
    summary: 'Metropolitan security and peacekeepers.',
    bodyMarkdown: '### Headquarters\nCentral Citadel Watchtower.',
    tags: ['faction', 'guard', 'city'],
    attributes: { leader: 'Commander Marcus' }
  });

  const marcus = loreGraphStore.addEntity({
    type: 'NPC',
    name: 'Commander Marcus',
    summary: 'High Commander of the Watch.',
    bodyMarkdown: '### Details\nVeteran warrior.',
    tags: ['npc', 'commander', 'guard'],
    attributes: { cr: 8, hp: 110, ac: 18 }
  });

  const fort = loreGraphStore.addEntity({
    type: 'LOCATION',
    name: 'North Gate Citadel',
    summary: 'Fortified stone keep and gatehouse.',
    bodyMarkdown: 'Defensive bastion.',
    tags: ['location', 'fortress'],
    attributes: { defenseRating: 'Tier 3' }
  });

  // Link entities
  loreGraphStore.addRelationship({
    sourceId: marcus.id,
    targetId: guardFaction.id,
    relationType: 'MEMBER_OF',
    notes: 'Marcus commands the guard.'
  });

  loreGraphStore.addRelationship({
    sourceId: guardFaction.id,
    targetId: fort.id,
    relationType: 'CONTROLS',
    notes: 'Garrison base.'
  });

  // Test bidirectional relationship queries
  const marcusLinks = loreGraphStore.getLinkedEntities(marcus.id);
  assert(marcusLinks.length >= 1, 'Commander Marcus should have at least 1 linked relationship');
  const memberLink = marcusLinks.find(l => l.entity.id === guardFaction.id);
  assert(memberLink !== undefined, 'Marcus should be linked to City Guard Watch');
  assert(memberLink?.relation.relationType === 'MEMBER_OF', 'Marcus should be MEMBER_OF City Guard');

  const factionLinks = loreGraphStore.getLinkedEntities(guardFaction.id);
  const incomingMarcus = factionLinks.find(l => l.entity.id === marcus.id);
  assert(incomingMarcus !== undefined, 'Guard should have incoming relationship from Marcus');
  assert(incomingMarcus?.direction === 'incoming', 'Relation direction should be incoming to Guard');

  // Test search queries
  const searchNpc = loreGraphStore.searchEntities('Marcus', 'NPC');
  assert(searchNpc.length === 1 && searchNpc[0].id === marcus.id, 'Search for Marcus as NPC should return Marcus');

  const searchTag = loreGraphStore.searchEntities('', 'ALL', 'guard');
  assert(searchTag.length >= 2, 'Tag search for guard should return matching entities');

  // Test @mention suggestions
  const suggestions = loreGraphStore.getMentionSuggestions('Marc');
  assert(suggestions.some(s => s.name === 'Commander Marcus'), 'Mention suggestion for "Marc" should return Commander Marcus');

  // Test Entity CRUD
  const createdEntity = loreGraphStore.addEntity({
    type: 'NPC',
    name: 'Captain Thorne',
    summary: 'Captain of the city watch and loyal patrol scout.',
    bodyMarkdown: '### Role\nPatrols northern gates and guards caravan depots.',
    tags: ['npc', 'guard', 'cr-4'],
    attributes: { cr: 4, hp: 65, ac: 17 },
  });
  assert(loreGraphStore.getEntityById(createdEntity.id) !== undefined, 'Created entity should be retrievable by ID');

  const updatedEntity = loreGraphStore.updateEntity(createdEntity.id, {
    summary: 'Updated summary: Promoted to Watch Commander.',
  });
  assert(Boolean(updatedEntity?.summary.includes('Promoted')), 'Entity summary should be updated');

  // Test Relationship CRUD
  const newRel = loreGraphStore.addRelationship({
    sourceId: createdEntity.id,
    targetId: guardFaction.id,
    relationType: 'ALLIED_WITH',
    notes: 'Mutual border defense treaty.',
  });
  assert(newRel !== undefined, 'Relationship should be created');
  assert(loreGraphStore.getLinkedEntities(createdEntity.id).length === 1, 'Created entity should have 1 linked relationship');

  // Test Cascading Deletion
  const relsBefore = loreGraphStore.relationships.length;
  loreGraphStore.deleteEntity(createdEntity.id);
  assert(loreGraphStore.getEntityById(createdEntity.id) === undefined, 'Entity should be deleted');
  const relsAfter = loreGraphStore.relationships.length;
  assert(relsAfter === relsBefore - 1, 'Relationship should be cascaded and deleted when entity is deleted');

  console.log('✓ Relational Lore Graph Database tests passed completely.');

  console.log('\n--- 2. Testing Sane Magical Prices Valuation Engine ---');

  // 1. Common Consumable (Potion of Healing)
  const potionHealing = calculateSanePrice({
    rarity: 'COMMON',
    spellLevelEquivalent: 1,
    isConsumable: true,
    requiresAttunement: false,
    utilityFeatures: ['HEALING'],
  });
  console.log(`Potion of Healing Valuation: ${potionHealing.finalPriceGp} GP`);
  assert(potionHealing.consumableDiscountMultiplier === 0.5, 'Consumable discount multiplier should be 0.5');
  assert(potionHealing.finalPriceGp >= 25 && potionHealing.finalPriceGp <= 100, 'Common healing potion should price between 25-100 GP');

  // 2. Rare Attunement Flight Item (Winged Boots / Broom of Flying)
  const wingedBoots = calculateSanePrice({
    rarity: 'UNCOMMON',
    spellLevelEquivalent: 3, // Fly is 3rd level spell
    isConsumable: false,
    requiresAttunement: true,
    utilityFeatures: ['FLIGHT'],
  });
  console.log(`Winged Boots Valuation: ${wingedBoots.finalPriceGp} GP`);
  assert(wingedBoots.attunementMultiplier === 1.35, 'Attunement multiplier should be 1.35');
  assert(wingedBoots.finalPriceGp > 2000, 'Permanent flight item should price above 2000 GP on utility curve');

  // 3. Very Rare +2 Attunement Weapon (+2 Greatsword of Storms)
  const stormSword = calculateSanePrice({
    rarity: 'VERY_RARE',
    spellLevelEquivalent: 5,
    combatBonusScalar: 2,
    requiresAttunement: true,
    utilityFeatures: ['DAMAGE_RESISTANCE'],
  });
  console.log(`+2 Storm Greatsword Valuation: ${stormSword.finalPriceGp} GP`);
  assert(stormSword.combatScalarMultiplier === 3.2, '+2 combat scalar multiplier should be 3.2');
  assert(stormSword.finalPriceGp > 40000, '+2 Attuned Very Rare weapon should price > 40,000 GP');

  console.log('✓ Sane Magical Prices Valuation Engine tests passed completely.');

  console.log('\n--- 3. Testing Procedural Trade Manifest Generator ---');

  // Test Caravan Manifest
  const caravan = generateManifest('CARAVAN', 'MODEST');
  assert(caravan.category === 'CARAVAN', 'Category should be CARAVAN');
  assert(caravan.items.length >= 3, 'Manifest should contain at least 3 cargo items');
  assert(caravan.totalCrates > 0, 'Total crates should be positive');
  assert(caravan.totalWeightLbs > 0, 'Total weight should be positive');
  assert(caravan.totalCustomsValueGp > 0, 'Total customs value should be positive');
  console.log(`Caravan Manifest: "${caravan.manifestCode}" · ${caravan.totalCrates} crates · ${caravan.totalWeightLbs} lbs · ${caravan.totalCustomsValueGp} GP`);

  // Test Ship Cargo Manifest
  const shipCargo = generateManifest('SHIP_CARGO', 'WEALTHY');
  assert(shipCargo.category === 'SHIP_CARGO', 'Category should be SHIP_CARGO');
  assert(shipCargo.totalCustomsValueGp > caravan.totalCustomsValueGp, 'Wealthy ship cargo should exceed modest caravan value');
  console.log(`Ship Cargo Manifest: "${shipCargo.manifestCode}" · ${shipCargo.totalCrates} crates · ${shipCargo.totalWeightLbs} lbs · ${shipCargo.totalCustomsValueGp} GP`);

  // Test Contraband Manifest
  const contraband = generateManifest('CONTRABAND', 'ARISTOCRATIC');
  assert(contraband.category === 'CONTRABAND', 'Category should be CONTRABAND');
  assert(contraband.items.some(i => i.hazardRating === 'ILLICIT' || i.hazardRating === 'VOLATILE'), 'Contraband should contain illicit or volatile hazard ratings');
  console.log(`Contraband Manifest: "${contraband.manifestCode}" · ${contraband.totalCrates} crates · ${contraband.totalCustomsValueGp} GP`);

  // Test Transfer Cargo to Party Stash
  const stashResult = addCargoToPartyStash(caravan);
  assert(stashResult.addedCount === caravan.items.length, 'Added items count should match manifest items');
  assert(stashResult.totalWeightLbs === caravan.totalWeightLbs, 'Stashed weight should match manifest gross weight');
  assert(stashResult.totalValueGp === caravan.totalCustomsValueGp, 'Stashed value should match manifest customs valuation');
  console.log(`Transferred ${stashResult.addedCount} cargo items (${stashResult.totalWeightLbs} lbs) into Party Stash!`);

  console.log('\n========================================');
  console.log('ALL TESTS PASSED WITH 100% SPEC COMPLIANCE!');
  console.log('========================================');
}

import { describe, it } from 'vitest';

describe('Relational Lore Graph & Valuation Engine', () => {
  it('passes all valuation engine, manifest generation, and cargo stash tests', async () => {
    await runTests();
  });
});
