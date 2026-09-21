// src/lib/data/handoutTables.ts
// Procedural Notice Board & Contract Generator for 5e SRD Adventurers Guild & Municipalities

export type ContractClassification = 'Exploration' | 'Hunt' | 'Protection' | 'Resource Gathering' | 'Find';

export interface ProceduralContract {
  id: string;
  classification: ContractClassification;
  title: string;
  commissioner: string;
  commissionerTitle: string;
  originSettlement: string;
  targetObjective: string;
  escrowRewardGp: number;
  deadlineDecades: number; // Standard 10-day execution window
  perils: string[];
  markdownContent: string;
  dmNotes: string;
}

const SETTLEMENTS = [
  'Capital City',
  'Frontier Town',
  'Coastal Village',
  'Crossroads Keep',
  'Mountain Outpost'
];

const COMMISSIONERS = [
  { name: 'Merchants & Carters Guild', title: 'Grand Factor Vance' },
  { name: 'The Municipal Chancellery', title: 'High Chancellor' },
  { name: 'The Master Artificers Guild', title: 'High Guildmaster' },
  { name: 'Sovereign Coastal Flotilla', title: 'Commodore' },
  { name: 'Scholarly Archive of Antiquities', title: 'Chief Archivist' },
  { name: 'The Freeholders Agricultural Union', title: 'Chief Bailiff' },
  { name: 'Apothecary & Herbalist Conclave', title: 'Master Alchemist' }
];

const EXPLORATION_OBJECTIVES = [
  {
    target: 'Survey the submerged ruins beneath the Tidal Grotto',
    reward: 450,
    perils: ['Submerged corridors', 'Drowned skeletons', 'Rapid siphon currents']
  },
  {
    target: 'Map the uncharted basalt cavern shafts of the Mountain Mine',
    reward: 600,
    perils: ['Sulfur gas fissures', 'Unstable crumbly ceilings', 'Subterranean piercer swarms']
  },
  {
    target: 'Locate and catalog the ancient boundary obelisk in the Mistfall Mire',
    reward: 380,
    perils: ['Quicksand trenches', 'Will-o-wisps', 'Planar mirage disorientation']
  }
];

const HUNT_OBJECTIVES = [
  {
    target: 'Eradicate the feral Chimera nesting in the High Pinnacles',
    reward: 850,
    perils: ['Aerial strafing breath attacks', 'Sheer precipice fighting', 'Razor winds']
  },
  {
    target: 'Cull the mutated Gorgon lurking within the Marble Quarries',
    reward: 700,
    perils: ['Petrifying gaze', 'Poison snakes', 'Shattered marble caltrops']
  },
  {
    target: 'Slay the Broodmother Ankheg disrupting the southern trade caravans',
    reward: 500,
    perils: ['Corrosive acid spray', 'Burrowing ambushes', 'Chitinous swarm larvae']
  }
];

const PROTECTION_OBJECTIVES = [
  {
    target: 'Provide armed escort for the bullion treasury carriage to the Capital Vault',
    reward: 550,
    perils: ['Organized highwaymen', 'Caltrop pit traps', 'Infiltrator spies in convoy']
  },
  {
    target: 'Guard the tidal aqueduct during the spring spring-tide sluice opening',
    reward: 400,
    perils: ['Sahuagin raiders', 'Surging floodwaters', 'Saboteur glyphs']
  },
  {
    target: 'Protect the itinerant envoys traveling through the Mountain Pass',
    reward: 650,
    perils: ['Restless wights', 'Cold fog chill', 'Ancestral curses']
  }
];

const RESOURCE_OBJECTIVES = [
  {
    target: 'Harvest four intact glands of deep-cave Bioluminescent Crawlers',
    reward: 350,
    perils: ['Chemical decomposition within 24h', 'Flash-blinding luminescence', 'Cave leeches']
  },
  {
    target: 'Extract 12 lbs of rare meteoric star-metal veins from the crater ridge',
    reward: 900,
    perils: ['Intense thermal heat', 'Distorted gravity fields', 'Planar wraiths']
  },
  {
    target: 'Gather twenty bundles of Lunar Marsh-Lotus blossoms before the full moon eclipse',
    reward: 420,
    perils: ['Hallucinogenic spores', 'Bog serpents', 'Mud mire entrapment']
  }
];

const FIND_OBJECTIVES = [
  {
    target: 'Recover the lost ancestral astrolabe stolen from the Chancellor\'s archive',
    reward: 500,
    perils: ['Black market fences', 'Fenced vault traps', 'Double-crossing informants']
  },
  {
    target: 'Locate the wreckage of the merchant cog along the serrated coast',
    reward: 480,
    perils: ['Treacherous rip-tides', 'Harpy scavengers', 'Plundered hold puzzles']
  },
  {
    target: 'Retrieve the runaway apprentice alchemist carrying experimental fire-salts',
    reward: 320,
    perils: ['Volatile chemical explosions', 'Rival bounty hunters', 'Extortionist cutthroats']
  }
];

export type SettlementHub = 'Capital City' | 'Frontier Town' | 'Coastal Village' | string;

const CAPITAL_CITY_CONTRACTS = [
  {
    title: 'High Treasury Bullion Escrow Escort',
    subtitle: 'Inner District Armed Vault Convoy',
    objective: 'Safeguard the transfer of 10,000 Gold Pieces (gp) from the Lower Ward vault to the High Treasury counting-house.',
    reward: 750,
    perils: ['Lower ward smuggling ambuscades', 'Sewer grate cutthroats', 'Rooftop crossbowmen in the fog'],
    dmNotes: 'A corrupt clerk alerted a local thieves syndicate. DC 15 Insight detects the carriage driver glancing at rooftop signals.'
  },
  {
    title: 'Grand Harbor Drake Cull & Channel Clearance',
    subtitle: 'Outer Harbor Navigation Clearance',
    objective: 'Eradicate three coastal drakes nesting in the navigational channel bell buoys outside the harbor.',
    reward: 600,
    perils: ['Slick submerged reefs', 'Corrosive breath', 'Swamping tidal surges'],
    dmNotes: 'One drake is bonded to an exiled smuggler captain hiding on a derelict vessel nearby.'
  },
  {
    title: 'Lower Ward Smuggling Ring Interdiction',
    subtitle: 'Chancellery Excise Investigation',
    objective: 'Infiltrate the salt fish packing wharves in the lower ward to locate and seize contraband goods.',
    reward: 500,
    perils: ['Rotting pier timbers (DC 13 DEX)', 'Concealed trapdoor drops into seawater', 'Hired thug enforcers'],
    dmNotes: 'The smuggling ring is financed by a junior guild factor who attempts a 200 GP bribe if cornered.'
  }
];

const FRONTIER_TOWN_CONTRACTS = [
  {
    title: 'Deep Mine Basalt Extraction Security',
    subtitle: 'Subterranean Excavation Security',
    objective: 'Provide protective cordon for dwarven miners extracting pure volcanic minerals on Lower Shaft 7.',
    reward: 850,
    perils: ['Sulfur steam vents', 'Unstable rockfall tremors', 'Cave beasts emerging from magma fissures'],
    dmNotes: 'Disturbing the mineral veins triggers an earth elemental encounter.'
  },
  {
    title: 'Refined Iron Incline Cart Escort',
    subtitle: 'Mine-to-Surface Rail Incline Escort',
    objective: 'Escort heavy ore haulers bearing raw smelted iron up the Great Incline Shaft against subterranean raiders.',
    reward: 650,
    perils: ['Steep track incline (cables under strain)', 'Troglodyte ambushes from ventilation flues', 'Falling slag caltrops'],
    dmNotes: 'A sabotaged winch brake requires a DC 14 Athletics or Smith\'s Tools check to prevent a runaway cart.'
  },
  {
    title: 'Cave Beast Bounty in the Flooded Lower Sump',
    subtitle: 'Mine Shaft Sanitation Decree',
    objective: 'Descend into the abandoned flooded lower sump to hunt down the multi-legged monstrosity devouring pump technicians.',
    reward: 900,
    perils: ['Knee-deep acidic runoff', 'Pitch darkness (magical dimming)', 'Wall-climbing predator ambush'],
    dmNotes: 'The horror is a mutated carrion crawler that releases an acidic death burst upon dropping to 0 HP.'
  }
];

const COASTAL_VILLAGE_CONTRACTS = [
  {
    title: 'Sunken Shoal Salvage & Relic Recovery',
    subtitle: 'Outer Archipelago Marine Expedition',
    objective: 'Dive the sunken reef shoal to retrieve three bronze-sealed navigation chronometers before the tide turns.',
    reward: 800,
    perils: ['Limited diving air (20 minutes)', 'Barnacled drowned guardians', 'Crushing tidal undertow'],
    dmNotes: 'The navigation chronometers still function magically and detect tidal cycles.'
  },
  {
    title: 'Outer Island Corsair Interception',
    subtitle: 'Coastal Watch Admiralty Reprisal',
    objective: 'Board and neutralize the rogue trade cog operating unlicensed pirating off the outer shoals.',
    reward: 1000,
    perils: ['Grappling hook boarding under fire', 'Rigging sniper fire', 'Gunpowder cask traps on lower deck'],
    dmNotes: 'The captain carries forged letters of marque.'
  },
  {
    title: 'Open-Water Specimen Collection',
    subtitle: 'Marine Apothecary Commission',
    objective: 'Capture an intact bioluminescent deep eel from the marine trench off the western headland.',
    reward: 550,
    perils: ['Stunning electrical discharge (DC 14 CON)', 'Midnight storm squalls', 'Slippery deck fighting'],
    dmNotes: 'The eel’s fluid must be kept in seawater within 3 hours or its sample spoils.'
  }
];

export function generateLocalizedHubContract(hub: SettlementHub = 'Capital City'): ProceduralContract {
  let list = CAPITAL_CITY_CONTRACTS;
  let authority = 'High Municipal Chancellery';
  let commissioner = 'Chancellery Trade Factor';

  const normalized = hub.toLowerCase();
  if (normalized.includes('frontier') || normalized.includes('kladno') || normalized.includes('mine')) {
    list = FRONTIER_TOWN_CONTRACTS;
    authority = 'Frontier Town Council';
    commissioner = 'Deep Mine Overseer';
  } else if (normalized.includes('coastal') || normalized.includes('port') || normalized.includes('village') || normalized.includes('ruceas')) {
    list = COASTAL_VILLAGE_CONTRACTS;
    authority = 'Port Admiralty & Coast Guard';
    commissioner = 'Admiralty Harbor Master';
  } else if (!normalized.includes('capital') && !normalized.includes('ostrava')) {
    authority = `${hub} Town Council`;
    commissioner = `${hub} Magistrate`;
  }

  const contractDef = pickRandom(list);
  const deadlineDecades = Math.floor(Math.random() * 2) + 1; // 1 to 2 standard 10-day cycles (10 to 20 days)
  const contractId = `CON-${hub.slice(0, 3).toUpperCase().replace(/[^A-Z]/g, 'X')}-${Math.floor(1000 + Math.random() * 9000)}`;

  const markdown = `## ADVENTURERS GUILD OFFICIAL CHARTER
**Contract ID:** \`${contractId}\` · **Regional Hub:** ${hub.toUpperCase()}  
**Presiding Authority:** ${authority}  
**Commissioned By:** ${commissioner}

---

### Contract Scope: ${contractDef.title}
*${contractDef.subtitle}*

> **Mandate Objective:** ${contractDef.objective}

### Bonded Escrow & Execution Window
- **Guaranteed Guild Escrow:** **${contractDef.reward} Gold Pieces (gp)** held at the ${hub} Guild Vault.
- **Execution Window:** **${deadlineDecades * 10} days** (${deadlineDecades} ten-day cycle${deadlineDecades > 1 ? 's' : ''}).

### Hazard Assessment & Field Perils
${contractDef.perils.map(p => `- ⚠️ ${p}`).join('\n')}

---

[!SIGNATURE: ${commissioner}, ${authority}]
[!SIGNATURE: Guild Provost, ${hub} Chapter]`;

  return {
    id: contractId,
    classification: 'Protection',
    title: contractDef.title,
    commissioner,
    commissionerTitle: authority,
    originSettlement: hub,
    targetObjective: contractDef.objective,
    escrowRewardGp: contractDef.reward,
    deadlineDecades,
    perils: contractDef.perils,
    markdownContent: markdown,
    dmNotes: contractDef.dmNotes
  };
}

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

export function generateProceduralContract(category?: ContractClassification, originSettlement?: string): ProceduralContract {
  const classes: ContractClassification[] = ['Exploration', 'Hunt', 'Protection', 'Resource Gathering', 'Find'];
  const classification = category || pickRandom(classes);

  let pool = EXPLORATION_OBJECTIVES;
  if (classification === 'Hunt') pool = HUNT_OBJECTIVES;
  else if (classification === 'Protection') pool = PROTECTION_OBJECTIVES;
  else if (classification === 'Resource Gathering') pool = RESOURCE_OBJECTIVES;
  else if (classification === 'Find') pool = FIND_OBJECTIVES;

  const obj = pickRandom(pool);
  const comm = pickRandom(COMMISSIONERS);
  const settlement = originSettlement || pickRandom(SETTLEMENTS);
  const deadlineDecades = Math.floor(Math.random() * 3) + 1;
  const contractId = `CON-${Math.floor(1000 + Math.random() * 9000)}`;

  const markdown = `## ADVENTURERS GUILD OFFICIAL CONTRACT
**Registry Code:** \`${contractId}\` · **Classification:** ${classification.toUpperCase()}  
**Origin Station:** ${settlement}  
**Commissioned By:** ${comm.name} (${comm.title})

---

### Objective & Mandate
> **Target Mandate:** ${obj.target}.

### Terms & Escrow Disbursement
- **Guaranteed Guild Bounty:** **${obj.reward} Gold Pieces (gp)** held in bonded escrow at ${settlement}.
- **Fulfillment Period:** **${deadlineDecades * 10} days** (${deadlineDecades} ten-day cycle${deadlineDecades > 1 ? 's' : ''}).

### Registered Environmental Perils
${obj.perils.map(p => `- ⚠️ ${p}`).join('\n')}

---

[!SIGNATURE: ${comm.title}]
[!SIGNATURE: Guild Provost, ${settlement}]`;

  const dmNotes = `Secret DM Context: ${comm.name} has placed an escrow of ${obj.reward} GP. Hidden complication: One of the perils (${obj.perils[0]}) was intentionally worsened by a rival faction. A successful DC 14 Investigation check uncovers the saboteur's guild mark.`;

  return {
    id: contractId,
    classification,
    title: `CONTRACT: ${obj.target.slice(0, 40)}...`,
    commissioner: comm.name,
    commissionerTitle: comm.title,
    originSettlement: settlement,
    targetObjective: obj.target,
    escrowRewardGp: obj.reward,
    deadlineDecades,
    perils: obj.perils,
    markdownContent: markdown,
    dmNotes
  };
}

