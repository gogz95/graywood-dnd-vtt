-- 002_compendium.sql
-- Compendium schema and complete seed data for Aleamos DM Desktop

CREATE TABLE IF NOT EXISTS compendium_classes (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    hit_die INTEGER NOT NULL CHECK (hit_die IN (6, 8, 10, 12)),
    primary_ability TEXT NOT NULL,
    saving_throws_json TEXT NOT NULL,
    description TEXT NOT NULL,
    features_json TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS compendium_spells (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    level INTEGER NOT NULL CHECK (level BETWEEN 0 AND 9),
    school TEXT NOT NULL,
    casting_time TEXT NOT NULL,
    range TEXT NOT NULL,
    components TEXT NOT NULL,
    duration TEXT NOT NULL,
    description TEXT NOT NULL,
    classes_json TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_compendium_spells_level ON compendium_spells(level);
CREATE INDEX IF NOT EXISTS idx_compendium_spells_school ON compendium_spells(school);

-- Complete seed dataset for core classes
INSERT OR IGNORE INTO compendium_classes (id, name, hit_die, primary_ability, saving_throws_json, description, features_json) VALUES
('barbarian', 'Barbarian', 12, 'Strength', '["Strength", "Constitution"]', 'A fierce warrior of primitive background who can enter a battle rage.', '["Rage", "Unarmored Defense", "Reckless Attack", "Danger Sense"]'),
('bard', 'Bard', 8, 'Charisma', '["Dexterity", "Charisma"]', 'An inspiring magician whose power echoes the music of creation.', '["Spellcasting", "Bardic Inspiration", "Jack of All Trades", "Song of Rest"]'),
('cleric', 'Cleric', 8, 'Wisdom', '["Wisdom", "Charisma"]', 'A priestly champion who wields divine magic in service of a higher power.', '["Spellcasting", "Divine Domain", "Channel Divinity", "Destroy Undead"]'),
('druid', 'Druid', 8, 'Wisdom', '["Intelligence", "Wisdom"]', 'A priest of the Old Faith, wielding the powers of nature and adopting animal forms.', '["Druidic", "Spellcasting", "Wild Shape", "Druid Circle"]'),
('fighter', 'Fighter', 10, 'Strength or Dexterity', '["Strength", "Constitution"]', 'A master of martial combat, skilled with a variety of weapons and armor.', '["Fighting Style", "Second Wind", "Action Surge", "Martial Archetype"]'),
('monk', 'Monk', 8, 'Dexterity & Wisdom', '["Strength", "Dexterity"]', 'A master of martial arts, harnessing the power of the body in pursuit of physical and spiritual perfection.', '["Unarmored Defense", "Martial Arts", "Ki", "Unarmored Movement"]'),
('paladin', 'Paladin', 10, 'Strength & Charisma', '["Wisdom", "Charisma"]', 'A holy warrior bound to a sacred oath.', '["Divine Sense", "Lay on Hands", "Fighting Style", "Divine Smite"]'),
('ranger', 'Ranger', 10, 'Dexterity & Wisdom', '["Strength", "Dexterity"]', 'A warrior who combats threats on the edges of civilization using wilderness skills.', '["Favored Enemy", "Natural Explorer", "Fighting Style", "Spellcasting"]'),
('rogue', 'Rogue', 8, 'Dexterity', '["Dexterity", "Intelligence"]', 'A scoundrel who uses stealth and trickery to overcome obstacles and enemies.', '["Expertise", "Sneak Attack", "Thieves Cant", "Cunning Action"]'),
('sorcerer', 'Sorcerer', 6, 'Charisma', '["Constitution", "Charisma"]', 'A spellcaster who draws on inherent magic from a gift or bloodline.', '["Spellcasting", "Sorcerous Origin", "Font of Magic", "Metamagic"]'),
('warlock', 'Warlock', 8, 'Charisma', '["Wisdom", "Charisma"]', 'A wielder of magic that is derived from a bargain with an otherworldly entity.', '["Otherworldly Patron", "Pact Magic", "Eldritch Invocations", "Pact Boon"]'),
('wizard', 'Wizard', 6, 'Intelligence', '["Intelligence", "Wisdom"]', 'A scholarly magic-user capable of manipulating the structures of reality.', '["Spellcasting", "Arcane Recovery", "Arcane Tradition", "Spell Mastery"]');

-- Complete seed dataset for representative spells across spell levels (Cantrips to 9th level)
INSERT OR IGNORE INTO compendium_spells (id, name, level, school, casting_time, range, components, duration, description, classes_json) VALUES
('fire-bolt', 'Fire Bolt', 0, 'Evocation', '1 action', '120 feet', 'V, S', 'Instantaneous', 'You hurl a mote of fire at a creature or object within range. Make a ranged spell attack against the target. On a hit, the target takes 1d10 fire damage. A flammable object hit by this spell ignites if it isn''t being worn or carried.', '["Sorcerer", "Wizard", "Artificer"]'),
('eldritch-blast', 'Eldritch Blast', 0, 'Evocation', '1 action', '120 feet', 'V, S', 'Instantaneous', 'A beam of crackling energy streaks toward a creature within range. Make a ranged spell attack against the target. On a hit, the target takes 1d10 force damage.', '["Warlock"]'),
('sacred-flame', 'Sacred Flame', 0, 'Evocation', '1 action', '60 feet', 'V, S', 'Instantaneous', 'Flame-like radiance descends on a creature that you can see within range. The target must succeed on a Dexterity saving throw or take 1d8 radiant damage. The target gains no benefit from cover for this saving throw.', '["Cleric"]'),
('cure-wounds', 'Cure Wounds', 1, 'Evocation', '1 action', 'Touch', 'V, S', 'Instantaneous', 'A creature you touch regains a number of hit points equal to 1d8 + your spellcasting ability modifier. This spell has no effect on undead or constructs.', '["Bard", "Cleric", "Druid", "Paladin", "Ranger", "Artificer"]'),
('shield', 'Shield', 1, 'Abjuration', '1 reaction', 'Self', 'V, S', '1 round', 'An invisible barrier of magical force appears and protects you. Until the start of your next turn, you have a +5 bonus to AC, including against the triggering attack, and you take no damage from magic missile.', '["Sorcerer", "Wizard"]'),
('magic-missile', 'Magic Missile', 1, 'Evocation', '1 action', '120 feet', 'V, S', 'Instantaneous', 'You create three glowing darts of magical force. Each dart hits a creature of your choice that you can see within range. A dart deals 1d4 + 1 force damage to its target. The darts all strike simultaneously, and you can direct them to hit one creature or several.', '["Sorcerer", "Wizard"]'),
('misty-step', 'Misty Step', 2, 'Conjuration', '1 bonus action', 'Self', 'V', 'Instantaneous', 'Briefly surrounded by silvery mist, you teleport up to 30 feet to an unoccupied space that you can see.', '["Sorcerer", "Warlock", "Wizard"]'),
('hold-person', 'Hold Person', 2, 'Enchantment', '1 action', '60 feet', 'V, S, M (a small, straight piece of iron)', 'Concentration, up to 1 minute', 'Choose a humanoid that you can see within range. The target must succeed on a Wisdom saving throw or be paralyzed for the duration. At the end of each of its turns, the target can make another Wisdom saving throw. On a success, the spell ends on the target.', '["Bard", "Cleric", "Druid", "Sorcerer", "Warlock", "Wizard"]'),
('fireball', 'Fireball', 3, 'Evocation', '1 action', '150 feet', 'V, S, M (a tiny ball of bat guano and sulfur)', 'Instantaneous', 'A bright streak flashes from your pointing finger to a point you choose within range and then blossoms with a low roar into an explosion of flame. Each creature in a 20-foot-radius sphere centered on that point must make a Dexterity saving throw. A target takes 8d6 fire damage on a failed save, or half as much damage on a successful one.', '["Sorcerer", "Wizard"]'),
('counterspell', 'Counterspell', 3, 'Abjuration', '1 reaction', '60 feet', 'S', 'Instantaneous', 'You attempt to interrupt a creature in the process of casting a spell. If the creature is casting a spell of 3rd level or lower, its spell fails and has no effect. If it is casting a spell of 4th level or higher, make an ability check using your spellcasting ability. The DC equals 10 + the spell''s level. On a success, the creature''s spell fails and has no effect.', '["Sorcerer", "Warlock", "Wizard"]'),
('revivify', 'Revivify', 3, 'Necromancy', '1 action', 'Touch', 'V, S, M (diamonds worth 300 gp, which the spell consumes)', 'Instantaneous', 'You touch a creature that has died within the last minute. That creature returns to life with 1 hit point. This spell can''t return to life a creature that has died of old age, nor can it restore any missing body parts.', '["Cleric", "Paladin", "Artificer"]'),
('polymorph', 'Polymorph', 4, 'Transmutation', '1 action', '60 feet', 'V, S, M (a caterpillar cocoon)', 'Concentration, up to 1 hour', 'This spell transforms a creature that you can see within range into a new form. An unwilling creature must make a Wisdom saving throw to avoid the effect. The transformation lasts for the duration, or until the target drops to 0 hit points or dies. The new form can be any beast whose challenge rating is equal to or less than the target''s.', '["Bard", "Druid", "Sorcerer", "Wizard"]'),
('greater-restoration', 'Greater Restoration', 5, 'Abjuration', '1 action', 'Touch', 'V, S, M (diamond dust worth at least 100 gp, which the spell consumes)', 'Instantaneous', 'You imbue a creature you touch with positive energy to undo a debilitating effect. You can reduce the target''s exhaustion level by one, or end one of the following effects on the target: charmed, petrified, cursed, or any reduction to ability scores or hit point maximum.', '["Bard", "Cleric", "Druid", "Artificer"]'),
('heal', 'Heal', 6, 'Evocation', '1 action', '60 feet', 'V, S', 'Instantaneous', 'Choose a creature that you can see within range. A surge of positive energy washes through the creature, causing it to regain 70 hit points. This spell also ends blindness, deafness, and any diseases affecting the target.', '["Cleric", "Druid"]'),
('teleport', 'Teleport', 7, 'Conjuration', '1 action', '10 feet', 'V', 'Instantaneous', 'This spell instantly transports you and up to eight willing creatures of your choice that you can see within range, or a single object that you can see within range, to a destination you select.', '["Bard", "Sorcerer", "Wizard"]'),
('sunburst', 'Sunburst', 8, 'Evocation', '1 action', '150 feet', 'V, S, M (fire and a piece of sunstone)', 'Instantaneous', 'Brilliant sunlight flashes in a 60-foot radius centered on a point you choose within range. Each creature in that light must make a Constitution saving throw. On a failed save, a creature takes 12d6 radiant damage and is blinded for 1 minute. On a successful save, it takes half as much damage and isn''t blinded.', '["Cleric", "Druid", "Sorcerer", "Wizard"]'),
('wish', 'Wish', 9, 'Conjuration', '1 action', 'Self', 'V', 'Instantaneous', 'Wish is the mightiest spell a mortal creature can cast. By simply speaking aloud, you can alter the very foundations of reality in accord with your desires. The basic use of this spell is to duplicate any other spell of 8th level or lower.', '["Sorcerer", "Wizard"]');
