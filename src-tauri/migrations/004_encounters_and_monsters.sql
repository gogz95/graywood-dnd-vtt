-- 004_encounters_and_monsters.sql
-- Active encounter initiative tracking, combatants, and monster compendium

CREATE TABLE IF NOT EXISTS encounters (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    round INTEGER NOT NULL DEFAULT 1 CHECK (round >= 1),
    current_turn_index INTEGER NOT NULL DEFAULT 0 CHECK (current_turn_index >= 0),
    is_active BOOLEAN NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
    created_at BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS active_combatants (
    id TEXT PRIMARY KEY NOT NULL,
    encounter_id TEXT NOT NULL,
    token_id TEXT NOT NULL,
    name TEXT NOT NULL,
    initiative INTEGER NOT NULL,
    hp_current INTEGER NOT NULL,
    hp_max INTEGER NOT NULL CHECK (hp_max > 0),
    temp_hp INTEGER NOT NULL DEFAULT 0 CHECK (temp_hp >= 0),
    ac INTEGER NOT NULL CHECK (ac >= 0),
    is_monster BOOLEAN NOT NULL DEFAULT 0 CHECK (is_monster IN (0, 1)),
    monster_compendium_id TEXT NULL,
    multiattack_profile TEXT NULL,
    conditions_json TEXT NOT NULL DEFAULT '[]',
    created_at BIGINT NOT NULL,
    FOREIGN KEY (encounter_id) REFERENCES encounters(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_combatants_encounter ON active_combatants(encounter_id, initiative DESC);

CREATE TABLE IF NOT EXISTS compendium_monsters (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    size TEXT NOT NULL,
    creature_type TEXT NOT NULL,
    alignment TEXT NOT NULL,
    ac INTEGER NOT NULL CHECK (ac >= 0),
    hp_max INTEGER NOT NULL CHECK (hp_max > 0),
    hit_dice TEXT NOT NULL,
    speed INTEGER NOT NULL CHECK (speed >= 0),
    challenge_rating REAL NOT NULL CHECK (challenge_rating >= 0),
    multiattack_profile TEXT NOT NULL,
    actions_json TEXT NOT NULL,
    traits_json TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_monsters_cr ON compendium_monsters(challenge_rating);

-- Seed initial active skirmish encounter
INSERT OR IGNORE INTO encounters (id, name, round, current_turn_index, is_active, created_at)
VALUES ('encounter-001', 'Crypt of the Iron Warden', 1, 0, 1, 1700000000);

-- Complete seed dataset for representative monster statblocks
INSERT OR IGNORE INTO compendium_monsters (id, name, size, creature_type, alignment, ac, hp_max, hit_dice, speed, challenge_rating, multiattack_profile, actions_json, traits_json) VALUES
('goblin', 'Goblin', 'Small', 'Humanoid (goblinoid)', 'Neutral Evil', 15, 7, '2d6', 30, 0.25,
 'The goblin makes one attack with its scimitar or shortbow.',
 '[{"name":"Scimitar","attack_bonus":4,"damage":"1d6+2 slashing"},{"name":"Shortbow","attack_bonus":4,"damage":"1d6+2 piercing"}]',
 '["Nimble Escape: The goblin can take the Disengage or Hide action as a bonus action on each of its turns."]'
),
('skeleton', 'Skeleton', 'Medium', 'Undead', 'Lawful Evil', 13, 13, '2d8+4', 30, 0.25,
 'The skeleton makes one attack with its shortsword or shortbow.',
 '[{"name":"Shortsword","attack_bonus":4,"damage":"1d6+2 piercing"},{"name":"Shortbow","attack_bonus":4,"damage":"1d6+2 piercing"}]',
 '["Damage Vulnerability: Bludgeoning","Condition Immunities: Poisoned, Exhaustion"]'
),
('shadow', 'Shadow', 'Medium', 'Undead', 'Chaotic Evil', 12, 16, '3d8+3', 40, 0.5,
 'The shadow makes one Strength Drain attack.',
 '[{"name":"Strength Drain","attack_bonus":4,"damage":"2d6+2 necrotic plus 1d4 Strength reduction"}]',
 '["Amorphous: The shadow can move through a space as narrow as 1 inch without squeezing.","Shadow Stealth: While in dim light or darkness, the shadow can take the Hide action as a bonus action."]'
),
('owlbear', 'Owlbear', 'Large', 'Monstrosity', 'Unaligned', 13, 59, '7d10+21', 40, 3.0,
 'The owlbear makes two attacks: one with its beak and one with its claws.',
 '[{"name":"Beak","attack_bonus":7,"damage":"1d10+5 piercing"},{"name":"Claws","attack_bonus":7,"damage":"2d8+5 slashing"}]',
 '["Keen Sight and Smell: The owlbear has advantage on Wisdom (Perception) checks that rely on sight or smell."]'
),
('young-red-dragon', 'Young Red Dragon', 'Large', 'Dragon', 'Chaotic Evil', 18, 178, '17d10+85', 40, 10.0,
 'The dragon makes three attacks: one with its bite and two with its claws. It can use its Fire Breath instead.',
 '[{"name":"Bite","attack_bonus":10,"damage":"2d10+6 piercing plus 1d6 fire"},{"name":"Claw","attack_bonus":10,"damage":"2d6+6 slashing"},{"name":"Fire Breath (Recharge 5-6)","damage":"16d6 fire in a 30-foot cone, DC 17 Dex save for half"}]',
 '["Damage Immunity: Fire","Blindsight 30 ft., Darkvision 120 ft."]'
),
('mind-flayer', 'Mind Flayer', 'Medium', 'Aberration', 'Lawful Evil', 15, 71, '13d8+13', 30, 7.0,
 'The mind flayer makes one Tentacles attack or uses Mind Blast.',
 '[{"name":"Tentacles","attack_bonus":7,"damage":"2d10+4 psychic and target is grappled"},{"name":"Extract Brain","attack_bonus":7,"damage":"10d10 piercing to incapacitated humanoid"},{"name":"Mind Blast (Recharge 5-6)","damage":"4d8+4 psychic in a 60-foot cone, DC 15 Int save or stunned for 1 minute"}]',
 '["Magic Resistance: Advantage on saving throws against spells and other magical effects.","Innate Spellcasting (Psionics): Levitate, Detect Thoughts, Dominate Monster."]'
),
('beholder', 'Beholder', 'Large', 'Aberration', 'Lawful Evil', 18, 180, '19d10+76', 20, 13.0,
 'The beholder makes one Bite attack and uses three random eye rays.',
 '[{"name":"Bite","attack_bonus":5,"damage":"4d6 piercing"},{"name":"Eye Rays","description":"Shoots three random eye rays: Charm, Paralyzing, Fear, Slowing, Enervation, Telekinetic, Sleep, Petrification, Disintegration, or Death Ray (DC 16 saves)"}]',
 '["Antimagic Cone: The beholder''s central eye creates an area of antimagic in a 150-foot cone.","Condition Immunities: Prone"]'
);
