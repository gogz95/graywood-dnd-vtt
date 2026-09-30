// src/lib/services/generators/npcGenerator.test.ts
import { describe, it, expect } from 'vitest';
import { MarkovNameGenerator, generateName } from './markovNameGen';
import {
  generateNpc,
  actorToCharacter,
  actorToCompendiumMonster,
  actorToCanvasToken
} from './npcGenerator';
import type { NpcCulture, NpcArchetype } from '../../types/actor';

describe('Phase 11: Markov Name Generator', () => {
  it('initializes and trains Markov models on built-in corpora', () => {
    const engine = new MarkovNameGenerator(2);
    const cultures: NpcCulture[] = ['common', 'elven', 'dwarven', 'draconic', 'orcish'];

    for (const cult of cultures) {
      const name = engine.generateName(cult, 4, 12);
      expect(name).toBeTruthy();
      expect(typeof name).toBe('string');
      expect(name.length).toBeGreaterThanOrEqual(2);
      // Valid title casing: first letter capitalized
      expect(name[0]).toBe(name[0].toUpperCase());
    }
  });

  it('produces deterministic output when seeded RNG is provided', () => {
    const seededRng1 = () => 0.42;
    const seededRng2 = () => 0.42;

    const name1 = generateName('elven', 4, 12, seededRng1);
    const name2 = generateName('elven', 4, 12, seededRng2);

    expect(name1).toBe(name2);
  });

  it('trains custom corpora correctly', () => {
    const engine = new MarkovNameGenerator(2);
    const customWords = ['Valoria', 'Valandor', 'Valamir', 'Valerius'];
    const model = engine.trainModel(customWords, 2);

    expect(model.transitions.size).toBeGreaterThan(0);
    expect(model.starts.length).toBeGreaterThan(0);
  });
});

describe('Phase 11: Procedural 5e NPC Generator', () => {
  const archetypes: NpcArchetype[] = ['Guard', 'Mage', 'Priest', 'Bandit', 'Noble'];

  it('generates complete 5e actor records for all archetypes', () => {
    for (const archetype of archetypes) {
      const npc = generateNpc({
        archetype,
        cr: 1,
        culture: 'human'
      });

      expect(npc.id).toContain('npc-');
      expect(npc.name).toBeTruthy();
      expect(npc.archetype).toBe(archetype);
      expect(npc.cr).toBe(1);
      expect(npc.hp).toBeGreaterThan(0);
      expect(npc.ac).toBeGreaterThanOrEqual(10);
      expect(npc.speed).toBe(30);

      // Attributes check
      expect(npc.attributes.str.score).toBeGreaterThan(0);
      expect(npc.attributes.dex.score).toBeGreaterThan(0);
      expect(npc.attributes.con.score).toBeGreaterThan(0);
      expect(npc.attributes.int.score).toBeGreaterThan(0);
      expect(npc.attributes.wis.score).toBeGreaterThan(0);
      expect(npc.attributes.cha.score).toBeGreaterThan(0);

      // Persona check
      expect(npc.personality.trait).toBeTruthy();
      expect(npc.personality.ideal).toBeTruthy();
      expect(npc.personality.bond).toBeTruthy();
      expect(npc.personality.flaw).toBeTruthy();
      expect(npc.appearance).toBeTruthy();

      // Actions check
      expect(npc.actions.length).toBeGreaterThan(0);
      expect(npc.token.color).toBeTruthy();
      expect(npc.token.initials).toBeTruthy();
    }
  });

  it('scales stats predictably from CR 0 to CR 5', () => {
    const cr0 = generateNpc({ archetype: 'Guard', cr: 0, seed: 100 });
    const cr5 = generateNpc({ archetype: 'Guard', cr: 5, seed: 100 });

    expect(cr5.hp).toBeGreaterThan(cr0.hp);
    expect(cr5.ac).toBeGreaterThanOrEqual(cr0.ac);
    expect(cr5.proficiencyBonus).toBe(3);
    expect(cr0.proficiencyBonus).toBe(2);
  });

  it('converts ActorSchema to 5e Character entity correctly', () => {
    const actor = generateNpc({ archetype: 'Priest', cr: 2, seed: 200 });
    const char = actorToCharacter(actor);

    expect(char.id).toBe(actor.id);
    expect(char.name).toBe(actor.name);
    expect(char.class).toBe('Priest');
    expect(char.armorClass).toBe(actor.ac);
    expect(char.currentHp).toBe(actor.hp);
    expect(char.maxHp).toBe(actor.maxHp);
    expect(char.abilities.wis.score).toBe(actor.attributes.wis.score);
    expect(char.notes).toContain(actor.personality.trait);
  });

  it('converts ActorSchema to CompendiumMonster entity correctly', () => {
    const actor = generateNpc({ archetype: 'Bandit', cr: 1, seed: 300 });
    const monster = actorToCompendiumMonster(actor);

    expect(monster.id).toBe(actor.id);
    expect(monster.name).toBe(actor.name);
    expect(monster.cr).toBe(1);
    expect(monster.ac).toBe(actor.ac);
    expect(monster.hp).toBe(actor.hp);
    expect(monster.origin).toBe('USER_IMPORT');
    expect(monster.actions.length).toBe(actor.actions.length);
  });

  it('converts ActorSchema to CanvasToken entity correctly', () => {
    const actor = generateNpc({ archetype: 'Mage', cr: 3, seed: 400 });
    const token = actorToCanvasToken(actor, 5, 8);

    expect(token.id).toBe(actor.id);
    expect(token.name).toBe(actor.name);
    expect(token.x).toBe(5);
    expect(token.y).toBe(8);
    expect(token.hp).toBe(actor.hp);
    expect(token.ac).toBe(actor.ac);
    expect(token.isPlayer).toBe(false);
  });
});
