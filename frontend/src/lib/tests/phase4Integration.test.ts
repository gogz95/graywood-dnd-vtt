import { describe, it, expect } from 'vitest';
import { MultiBusAudioEngine } from '../services/audioEngine';
import { searchCampaignFts } from '../ipc/tauriBridge';

describe('Phase 4 Integration Suite', () => {
  describe('Multi-Bus Audio Mixer', () => {
    it('initializes with three independent buses: ambient, music, sfx', () => {
      const engine = new MultiBusAudioEngine();
      expect(engine.volumes.ambient).toBeDefined();
      expect(engine.volumes.music).toBeDefined();
      expect(engine.volumes.sfx).toBeDefined();
      expect(engine.volumes.master).toBeDefined();
    });

    it('calculates effective volume properly with master scaling', () => {
      const engine = new MultiBusAudioEngine();
      engine.setVolume('master', 0.5);
      engine.setVolume('ambient', 0.8);
      expect(engine.getEffectiveVolume('ambient')).toBeCloseTo(0.4);
    });

    it('returns zero volume when a bus or master is muted', () => {
      const engine = new MultiBusAudioEngine();
      engine.setVolume('sfx', 0.9);
      expect(engine.getEffectiveVolume('sfx')).toBeGreaterThan(0);

      engine.toggleMute('sfx');
      expect(engine.isMuted('sfx')).toBe(true);
      expect(engine.getEffectiveVolume('sfx')).toBe(0);

      engine.toggleMute('sfx');
      expect(engine.isMuted('sfx')).toBe(false);
      expect(engine.getEffectiveVolume('sfx')).toBeGreaterThan(0);

      engine.toggleMute('master');
      expect(engine.getEffectiveVolume('sfx')).toBe(0);
    });

    it('manages and filters sound tracks by bus', () => {
      const engine = new MultiBusAudioEngine();
      const ambientTracks = engine.getTracks('ambient');
      const musicTracks = engine.getTracks('music');
      const sfxTracks = engine.getTracks('sfx');

      expect(ambientTracks.every(t => t.bus === 'ambient')).toBe(true);
      expect(musicTracks.every(t => t.bus === 'music')).toBe(true);
      expect(sfxTracks.every(t => t.bus === 'sfx')).toBe(true);
    });
  });

  describe('Campaign Journal Wikilink Regex & Category Parsing', () => {
    function parseWikilinkTags(src: string): Array<{ raw: string; categoryHint: string | null; cleanTag: string }> {
      const regex = /\[\[(.*?)\]\]/g;
      const matches: Array<{ raw: string; categoryHint: string | null; cleanTag: string }> = [];
      let m: RegExpExecArray | null;
      while ((m = regex.exec(src)) !== null) {
        const raw = m[1].trim();
        let categoryHint: string | null = null;
        let cleanTag = raw;
        if (raw.includes(':')) {
          const parts = raw.split(':');
          categoryHint = parts[0].trim().toLowerCase();
          cleanTag = parts.slice(1).join(':').trim();
        }
        matches.push({ raw, categoryHint, cleanTag });
      }
      return matches;
    }

    it('correctly parses category-prefixed wikilinks for monsters, spells, items, rules', () => {
      const sample = `The [[Monster: Goblin]] cast [[Spell: Fireball]] using a [[Item: Wand of Wonder]]. See [[Rule: Concentration]].`;
      const links = parseWikilinkTags(sample);

      expect(links).toHaveLength(4);
      expect(links[0]).toEqual({ raw: 'Monster: Goblin', categoryHint: 'monster', cleanTag: 'Goblin' });
      expect(links[1]).toEqual({ raw: 'Spell: Fireball', categoryHint: 'spell', cleanTag: 'Fireball' });
      expect(links[2]).toEqual({ raw: 'Item: Wand of Wonder', categoryHint: 'item', cleanTag: 'Wand of Wonder' });
      expect(links[3]).toEqual({ raw: 'Rule: Concentration', categoryHint: 'rule', cleanTag: 'Concentration' });
    });

    it('correctly handles untyped standard wikilinks', () => {
      const sample = `The [[Goblin]] fled the room.`;
      const links = parseWikilinkTags(sample);

      expect(links).toHaveLength(1);
      expect(links[0]).toEqual({ raw: 'Goblin', categoryHint: null, cleanTag: 'Goblin' });
    });
  });

  describe('FTS5 Search Fallback Interface', () => {
    it('returns empty array when query is empty or whitespace', async () => {
      const results = await searchCampaignFts('   ');
      expect(results).toEqual([]);
    });
  });
});
