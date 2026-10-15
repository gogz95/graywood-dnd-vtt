-- Migration 005: Component Slot & Essence Crafting Matrix and Ostrava Settlement Profile
PRAGMA foreign_keys = ON;

-- 1. Elemental Essences Catalog (28 Elemental, Para-elemental, Quasi-elemental and Planar Essences)
CREATE TABLE IF NOT EXISTS elemental_essences (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    category TEXT NOT NULL,
    tier INTEGER NOT NULL,
    ingredient_points INTEGER NOT NULL,
    weapon_bonus_dice TEXT NOT NULL,
    weapon_damage_type TEXT NOT NULL,
    armor_reduction_type TEXT NOT NULL,
    armor_damage_type TEXT NOT NULL,
    description TEXT NOT NULL
);

-- Seed the 28 Elemental Essences
INSERT OR REPLACE INTO elemental_essences (
    id, name, category, tier, ingredient_points, weapon_bonus_dice, weapon_damage_type, armor_reduction_type, armor_damage_type, description
) VALUES
-- Primary Elemental (1-4)
('essence_fire', 'Primordial Flame Essence', 'Primary Elemental', 1, 10, '1d4', 'Fire', 'PB', 'Fire', 'Concentrated thermal energy from the Plane of Fire. Coats weapon edges in searing heat or shields armor against flame.'),
('essence_water', 'Tidal Torrent Essence', 'Primary Elemental', 1, 10, '1d4', 'Cold', 'PB', 'Cold', 'Fluid hydro-kinetic matter gathered from deep oceanic trenches. Infuses attacks with chilled pressure and cushions blunt force.'),
('essence_earth', 'Tectonic Granite Essence', 'Primary Elemental', 1, 10, '1d4', 'Bludgeoning', 'PB', 'Bludgeoning', 'Dense calcified core material. Adds pulverizing weight to weapon strikes and reinforces plate mail with petrified stone skin.'),
('essence_air', 'Zephyr Gale Essence', 'Primary Elemental', 1, 10, '1d4', 'Slashing', 'PB', 'Lightning', 'Turbulent vortex air contained in crystalline amber. Grants aerodynamic cutting wind to blades and disperses electrostatic shock.'),

-- Positive & Negative Planar (5-6)
('essence_radiant', 'Solar Luminary Essence', 'Positive Planar', 2, 15, '1d6', 'Radiant', 'Resistance', 'Radiant', 'Coalesced positive energy that sears undead flesh with pure celestial light and wicks away divine corruption.'),
('essence_necrotic', 'Abyssal Decay Essence', 'Negative Planar', 2, 15, '1d6', 'Necrotic', 'Resistance', 'Necrotic', 'Entropic anti-vital essence pulled from the Black Orb threshold. Siphons biological warmth and nullifies necrotic rot.'),

-- Para-Elemental (7-12)
('essence_ice', 'Glacial Permafrost Essence', 'Para-Elemental', 1, 10, '1d4', 'Cold', 'PB', 'Cold', 'Formed along the border of Air and Water. Freezes moisture on contact and prevents hypothermic shock in sub-zero delves.'),
('essence_magma', 'Molten Basalt Essence', 'Para-Elemental', 2, 15, '1d6', 'Fire', 'PB', 'Fire', 'Intersection of Earth and Fire. Searing slag drips from weapon strikes and hardens armor against superheated siege ordnance.'),
('essence_smoke', 'Choking Cinder Essence', 'Para-Elemental', 1, 10, '1d4', 'Poison', 'PB', 'Poison', 'Acrid gaseous vapor from Fire and Air. Blinds target respiratory paths on strike and dampens airborne toxic mist.'),
('essence_ooze', 'Caustic Slime Essence', 'Para-Elemental', 1, 10, '1d4', 'Acid', 'PB', 'Acid', 'Viscous corrosive gel from the border of Water and Earth. Dissolves armor latches on impact and coats plating with repellent mucus.'),
('essence_steam', 'Scalding Vapor Essence', 'Para-Elemental', 1, 10, '1d4', 'Fire', 'PB', 'Fire', 'High-pressure boiling mist from Fire and Water. Adds thermal velocity to piercing projectiles and deflects boiling sprays.'),
('essence_dust', 'Pulverized Silt Essence', 'Para-Elemental', 1, 10, '1d4', 'Bludgeoning', 'PB', 'Slashing', 'Microscopic grinding particles from Earth and Air. Erodes enemy defenses over time and blunts incoming slashing edges.'),

-- Quasi-Elemental: Positive Border (13-15)
('essence_lightning', 'Fulminating Storm Essence', 'Quasi-Elemental', 2, 15, '1d6', 'Lightning', 'Resistance', 'Lightning', 'Pure arc discharge at the junction of Air and Positive Energy. Causes chain arcing across targets and grounds lethal lightning strikes.'),
('essence_mineral', 'Adamantine Vein Essence', 'Quasi-Elemental', 2, 15, '1d6', 'Force', 'PB', 'Piercing', 'Crystalline geometric core from Earth and Positive Energy. Grants unmatched armor penetration and deflection against piercing bolts.'),
('essence_spark', 'Pyrotechnic Radiance Essence', 'Quasi-Elemental', 2, 15, '1d6', 'Radiant', 'PB', 'Fire', 'Blinding flash fire from Fire and Positive Energy. Disorients foes with dazzle flashes and dissipates heat flares.'),

-- Quasi-Elemental: Negative Border (16-19)
('essence_salt', 'Desiccating Brine Essence', 'Quasi-Elemental', 1, 10, '1d4', 'Necrotic', 'PB', 'Necrotic', 'Water drained of vitality by the Negative Plane. Dries and withers organic targets and resists biological dehydration curses.'),
('essence_ash', 'Smoldering Cinder Essence', 'Quasi-Elemental', 1, 10, '1d4', 'Fire', 'PB', 'Cold', 'Fire extinguished by the Void. Retains a cold burning touch that saps target stamina and buffers against freezing temperatures.'),
('essence_vacuum', 'Singularity Void Essence', 'Quasi-Elemental', 2, 15, '1d6', 'Force', 'Resistance', 'Force', 'Air erased by the Negative Plane. Creates miniature atmospheric collapses that yank enemies and repels crushing kinetic force.'),
('essence_rust', 'Oxidizing Ferric Essence', 'Quasi-Elemental', 1, 10, '1d4', 'Acid', 'PB', 'Acid', 'Corrosive entropy consuming Earth. Degrades hostile metallic equipment on contact and hardens iron alloys against rust beasts.'),

-- Alchemical & Exotic (20-24)
('essence_vitriol', 'Concentrated Vitriol Essence', 'Alchemical', 2, 15, '1d6', 'Acid', 'Resistance', 'Acid', 'Distilled alchemical green liquor. Burns through shields and organic chitin alike while creating an acid-neutralizing armor patina.'),
('essence_venom', 'Hydra Neurotoxin Essence', 'Alchemical', 1, 10, '1d4', 'Poison', 'PB', 'Poison', 'Stabilized predatory venom extract. Paralyzes motor nerves and neutralizes environmental poisons entering the bloodstream.'),
('essence_aether', 'Distilled Aether Essence', 'Planar Arcane', 2, 15, '1d6', 'Force', 'Resistance', 'Force', 'Unbound raw magical plasma. Punches through physical barriers with pure force and diffuses magical missile impacts.'),
('essence_sonic', 'Resonant Bell-Metal Essence', 'Planar Arcane', 2, 15, '1d6', 'Thunder', 'Resistance', 'Thunder', 'Vibrating acoustic alloy that shatters glass and bone with concussive sonic waves and absorbs thunderous blasts.'),
('essence_astral', 'Psionic Crystal Essence', 'Planar Arcane', 2, 15, '1d6', 'Psychic', 'Resistance', 'Psychic', 'Silvery residue harvested from Astral drift reefs. Bypasses physical armor into the psyche and buffers mental assault.'),

-- Esoteric & Synthesized (25-28)
('essence_blood', 'Sanguine Crucible Essence', 'Vitalist', 2, 15, '1d6', 'Necrotic', 'PB', 'Necrotic', 'Congealed life-ichor from ancient blood sacrifice. Bestows minor life-leech on critical hits and reinforces cardiovascular resilience.'),
('essence_chrono', 'Temporal Sand Essence', 'Planar Temporal', 3, 20, '1d6', 'Force', 'Resistance', 'Force', 'Golden particulate harvested from unstable chronomantic rifts. Hastens weapon swing recovery and decelerates incoming projectile velocity.'),
('essence_shadow', 'Umbral Weaver Essence', 'Shadowfell', 2, 15, '1d6', 'Necrotic', 'Resistance', 'Necrotic', 'Threaded dark matter from the Penumbra. Obscures strikes with disorienting darkness and blends armor seamlessly into dim shadows.'),
('essence_prime', 'Harmonic Quintessence', 'Synthesized Prime', 3, 20, '1d6', 'Force', 'Resistance', 'All', 'The theoretical unified element synthesized by master alchemists. Harmonizes all adjacent essences, completely nullifying socket volatility.');

-- 2. Item Sockets Table (1-2 sockets for weapons, 1-3 sockets for armor)
CREATE TABLE IF NOT EXISTS item_sockets (
    id TEXT PRIMARY KEY NOT NULL,
    item_id TEXT NOT NULL,
    socket_index INTEGER NOT NULL,
    slotted_essence_id TEXT,
    created_at BIGINT NOT NULL,
    FOREIGN KEY (slotted_essence_id) REFERENCES elemental_essences(id) ON DELETE SET NULL,
    UNIQUE(item_id, socket_index)
);

-- 3. Settlement Profiles Table (Gazetteer & Compendium)
CREATE TABLE IF NOT EXISTS settlement_profiles (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    region TEXT NOT NULL,
    population_count INTEGER NOT NULL,
    demographics_json TEXT NOT NULL,
    governance_title TEXT NOT NULL,
    governance_details TEXT NOT NULL,
    security_posture TEXT NOT NULL,
    precursor_under_ruins_json TEXT NOT NULL,
    economic_enforcement_json TEXT NOT NULL,
    municipal_laws_json TEXT NOT NULL,
    created_at BIGINT NOT NULL
);

-- Seed Ostrava Settlement Profile
INSERT OR REPLACE INTO settlement_profiles (
    id, name, region, population_count, demographics_json,
    governance_title, governance_details, security_posture,
    precursor_under_ruins_json, economic_enforcement_json, municipal_laws_json, created_at
) VALUES (
    'settlement_ostrava',
    'Ostrava',
    'Graywood Reach & Rucean Bay',
    18400,
    json('{
        "human_percentage": 45,
        "coastal_dwarf_percentage": 25,
        "halfling_gnome_percentage": 15,
        "half_elf_percentage": 10,
        "tiefling_other_percentage": 5,
        "permanent_residents": 14200,
        "transient_sailors_merchants": 4200,
        "primary_languages": ["Common", "Dwarvish", "Low Rucean", "Chancellery Sign"],
        "major_quarters": [
            {"name": "High Pier", "role": "Deep-water docks, naval slips, and Chancellery customs bastions"},
            {"name": "The Lower Bilge", "role": "Taverns, flophouses, alchemical black markets, and low-tide drydocks"},
            {"name": "Foundry Spit", "role": "Smithies, coin smelters, metal assay workshops, and steam pumps"},
            {"name": "Beacon Hill", "role": "Grand Chancellery administration, banking houses, and the Rucean Lighthouse"}
        ]
    }'),
    'Grand Chancellery Port Authority & Sea Guild Oligarchy',
    'Governed jointly by High Commissioner Aldous Vane (appointed by the Chancellery Imperial Council) and the Council of Seven Shipmasters representing the local merchant syndicates. While the Commissioner dictates foreign policy, taxation, and military defense, municipal ordinances and dock privileges require a four-vote guild majority.',
    'Formidable. 400 High Watch City Bailiffs equipped with masterwork crossbows and alchemical smoke grenades, supplemented by 150 harbor marine pikemen. The harbor mouth is guarded by twin sea-chain bastions mounted with heavy naval ballistas capable of winching closed against hostile blockades or leviathans.',
    json('{
        "title": "The Drowned Precursor Vaults of Rucean Arch",
        "origin": "Pre-Cataclysmic obsidian subterranean engineering predating modern Chancellery records by millennia.",
        "access_points": [
            "Warehouse 14 Sub-Basement (Secret hoist tunnel behind salt-curing vats)",
            "Low-Tide Sea Cave beneath South Jetty (Submerged during high Rucean tides)",
            "The Old Mint Cistern (Forgotten sewer grating beneath Foundry Spit)"
        ],
        "depth_strata": [
            {
                "level": 1,
                "name": "The Flooded Sluices",
                "danger": "Knee-deep brackish water, scavenging giant eels, and rusted iron sluice grates.",
                "relics": "Sealed ceramic amphorae and precursor copper glyph tokens."
            },
            {
                "level": 2,
                "name": "The Obsidian Atrium",
                "danger": "Silent vacuum traps, floating crystalline spheres, and semi-functional guardian automatons.",
                "relics": "Intact elemental essence matrices and uncarved void glass crystals."
            },
            {
                "level": 3,
                "name": "The Resonant Conduit",
                "danger": "Active planar frequency hum that causes temporary sensory disorientation; strange biological growths mimicking coral.",
                "relics": "Precursor energy focus crystals capable of powering Stronghold alchemical facilities."
            }
        ],
        "current_dm_hooks": [
            "Smugglers from the Lower Bilge inadvertently breached a Level 2 vault wall, releasing bioluminescent phase stalkers into the dock sewers.",
            "Water levels in the precursor vaults dropped 10 feet overnight without tidal correlation, revealing a previously submerged archway inscribed with glowing Rucean script."
        ]
    }'),
    json('{
        "mandatory_assay_tariff_percentage": 10,
        "regulated_currencies": {
            "domestic_tender": "Concord Sovereign (Gold) & Ay Silver Groat",
            "foreign_tender": "Ay Modlahd Sun-Disks & Trade Bars"
        },
        "assay_rules": "All foreign coinage, trade ingots, and unminted bullion entering Ostrava harbor or overland gates must be presented at the Assay Bastion in High Pier. The Chief Assayer applies an indelible municipal stamp and extracts a statutory 10% assay tariff. Possessing unstamped foreign sun-disks within city limits constitutes contraband and carries full confiscation penalties.",
        "banking_hours": "07:00 to 18:00 daily under guard of the Gold-Scale Guard.",
        "currency_exchange_standard": "1 Sun-Disk = 0.9 Concord Sovereigns (after 10% municipal fee)."
    }'),
    json('{
        "weapon_peace_bonding": {
            "rule": "Every blade exceeding 4 inches, polearm, and heavy crossbow carried within the gates must be peace-bonded by the Gate Bailiffs upon entry.",
            "bonding_method": "Scabbards and bowstrings are bound with red silk twine and secured with a crimped Chancellery lead seal. Only daggers and certified merchant canes are exempt.",
            "penalty_for_broken_seal": "Breaking a peace-bond seal without an active judicial emergency decree or approved bounty license incurs an immediate 50 Concord Sovereign fine and 14 days hard labor in the salt quarries."
        },
        "contraband_laws": [
            "Unpreserved necrotic reagents exceeding 1 pound must be registered with the Port Surgeon.",
            "Black Orb resonance shards are subject to immediate obsidian quarantine under System 15 protocols.",
            "Brawling in the Foundry Spit carries mandatory restitution for damaged steam infrastructure."
        ]
    }'),
    1710000000
);

-- 4. Regional Settlement Notice Board Contracts (5 Level-4 Contracts with 10-day expiration windows)
CREATE TABLE IF NOT EXISTS settlement_contracts (
    id TEXT PRIMARY KEY NOT NULL,
    settlement_id TEXT NOT NULL,
    title TEXT NOT NULL,
    category TEXT NOT NULL,
    target_location TEXT NOT NULL,
    description TEXT NOT NULL,
    reward_gold INTEGER NOT NULL,
    reward_rp INTEGER NOT NULL,
    min_level INTEGER NOT NULL DEFAULT 4,
    expiration_days INTEGER NOT NULL DEFAULT 10,
    is_completed BOOLEAN NOT NULL DEFAULT 0,
    created_at BIGINT NOT NULL,
    FOREIGN KEY (settlement_id) REFERENCES settlement_profiles(id) ON DELETE CASCADE
);

INSERT OR REPLACE INTO settlement_contracts (
    id, settlement_id, title, category, target_location, description,
    reward_gold, reward_rp, min_level, expiration_days, is_completed, created_at
) VALUES
(
    'contract_ostrava_01',
    'settlement_ostrava',
    'The Drowned Vault of Rucean Arch',
    'Exploration',
    'Ostrava Harbor - Level 1 Precursor Sluices',
    'Survey the newly drained entrance of the Level 1 precursor sluice beneath South Jetty. Map the flooded chambers, disable any active water-trap runes, and extract one intact precursor copper glyph token for High Commissioner Aldous Vane.',
    350,
    4,
    4,
    10,
    0,
    1710000000
),
(
    'contract_ostrava_02',
    'settlement_ostrava',
    'Chittering Tide Stalker',
    'Hunt',
    'Lower Bilge Drydocks & Salt Slips',
    'A predatory chitinous horror from the undersea trenches has nested in the bilge hulls along Low Pier, having already slain three night watchmen. Track and slay the beast; bring its primary venom gland to Bailiff Morren.',
    400,
    5,
    4,
    10,
    0,
    1710000000
),
(
    'contract_ostrava_03',
    'settlement_ostrava',
    'Ay Modlahd Gold Convoy Escort',
    'Protection',
    'Eastern Port Road through Graywood Verge',
    'The Merchant Syndicate is moving an armored wagon of stamped Concord Sovereigns from the High Pier Assay Bastion to the regional Chancellery garrison. Provide vanguard armed escort through the bandit-infested Graywood verge.',
    300,
    3,
    4,
    10,
    0,
    1710000000
),
(
    'contract_ostrava_04',
    'settlement_ostrava',
    'Deep Chasm Luminescent Algae',
    'Resource Gathering',
    'Precursor Under-Ruins Rift Wells',
    'Master Alchemist Thessalia requires uncorrupted bioluminescent blue moss growing along the geothermal steam vents of the Under-Ruin rift wells to brew stability elixirs for the Stronghold laboratory. Deliver 6 fresh clusters before harvest spoilage.',
    250,
    4,
    4,
    10,
    0,
    1710000000
),
(
    'contract_ostrava_05',
    'settlement_ostrava',
    'The Chancellery Bailiff''s Stolen Ledger',
    'Find',
    'The Rusty Anchor & Lower Bilge Flophouses',
    'A tariff smuggler pickpocketed Chief Bailiff Karen''s encrypted ledger containing scheduled contraband searches and port assay audits. Infiltrate the smuggler network in the Lower Bilge, retrieve the ledger unopened, and silence loose tongues.',
    200,
    3,
    4,
    10,
    0,
    1710000000
);
