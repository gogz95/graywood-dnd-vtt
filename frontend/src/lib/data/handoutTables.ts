// src/lib/data/handoutTables.ts
// Procedural Notice Board & Contract Generator for Aleamos Adventurers Guild / Chancellery

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
  deadlineDecades: number; // 10-day Decades
  perils: string[];
  markdownContent: string;
  dmNotes: string;
}

const SETTLEMENTS = [
  'Oakhaven High Citadel',
  'Rucean Harbor Market',
  'Sunken Reef Waystation',
  'Silver Basin Outpost',
  'Gilded Crag Foundry',
  'Elderwood Watch',
  'Barrow Reach',
  'Mistfall Anchorage'
];

const COMMISSIONERS = [
  { name: 'House Vance Guild of Carters', title: 'Grand Factor Orin Vance' },
  { name: 'The Concord Chancellery of Aleamos', title: 'Chancellor Danor' },
  { name: 'The Iron Crucible Foundry Union', title: 'High Artificer Brann' },
  { name: 'Sovereign Coastal Flotilla', title: 'Commodore Lyra Hayes' },
  { name: 'Archival Scribes of the 13th Lunation', title: 'Prelate Vane' },
  { name: 'The Freeholders Agricultural League', title: 'Bailiff Kaelen' },
  { name: 'The Silent Sedge Apothecaries', title: 'Alchemist Sareth' }
];

const EXPLORATION_OBJECTIVES = [
  {
    target: 'Survey the submerged ruins beneath the Tidal Gate of Rucean',
    reward: 450,
    perils: ['Submerged corridors', 'Barnacle-clad drowned guardians', 'Rapid siphon currents']
  },
  {
    target: 'Map the uncharted basalt cavern shafts of the Gilded Crag',
    reward: 600,
    perils: ['Sulfur gas fissures', 'Unstable crumbly ceilings', 'Subterranean piercer swarms']
  },
  {
    target: 'Locate and catalog the pre-Marquisate boundary obelisk in the Mistfall Mire',
    reward: 380,
    perils: ['Quicksand trenches', 'Will-o-wisps', 'Planar mirage disorientation']
  }
];

const HUNT_OBJECTIVES = [
  {
    target: 'Eradicate the feral Chimera nesting in the High Pinnacles of Mount Ironspire',
    reward: 850,
    perils: ['Aerial strafing breath attacks', 'Sheer precipice fighting', 'Razor winds']
  },
  {
    target: 'Cull the mutated Gorgon lurking within the Cragstone Marble Quarries',
    reward: 700,
    perils: ['Petrifying gaze', 'Iron snakes in tail', 'Shattered marble caltrops']
  },
  {
    target: 'Slay the Broodmother Ankheg disrupting the southern wheat caravans',
    reward: 500,
    perils: ['Corrosive acid spray', 'Burrowing ambushes', 'Chitinous swarm larvae']
  }
];

const PROTECTION_OBJECTIVES = [
  {
    target: 'Provide armed escort for the Sun Trade Bar treasury carriage to Oakhaven',
    reward: 550,
    perils: ['Organized highwaymen', 'Caltrop pit traps', 'Infiltrator spies in convoy']
  },
  {
    target: 'Guard the tidal aqueduct during the spring spring-tide sluice opening',
    reward: 400,
    perils: ['Sahuagin raiders', 'Surging floodwaters', 'Saboteur glyphs']
  },
  {
    target: 'Protect the itinerant envoys of the Concord Sovereigns through Barrow Reach',
    reward: 650,
    perils: ['Restless wights', 'Cold fog chill', 'Ancestral bloodcurses']
  }
];

const RESOURCE_OBJECTIVES = [
  {
    target: 'Harvest four intact glands of deep-cave Bioluminescent Crawlers',
    reward: 350,
    perils: ['Chemical decomposition within 24h', 'Flash-blinding luminescence', 'Cave leeches']
  },
  {
    target: 'Extract 12 lbs of uncorrupted Void-Glass veins from the shattered meteor crater',
    reward: 900,
    perils: ['Mana toxicity radiation', 'Distorted gravity fields', 'Planar wraiths']
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
    target: 'Locate the wreckage of the merchant cog "Sea Falcon" along the serrated coast',
    reward: 480,
    perils: ['Treacherous rip-tides', 'Harpy scavengers', 'Plundered hold puzzles']
  },
  {
    target: 'Retrieve the runaway apprentice alchemist carrying experimental fire-salts',
    reward: 320,
    perils: ['Volatile chemical explosions', 'Rival bounty hunters', 'Extortionist cutthroats']
  }
];

export type SettlementHub = 'Ostrava Harbor' | 'Kladno Deep Foundry' | 'Port Ruceas';

const OSTRAVA_CONTRACTS = [
  {
    title: 'High Chancellery Bullion Escrow Escort',
    subtitle: 'Docks District Armed Marine Convoy',
    objective: 'Safeguard the transfer of 10,000 Concord Sovereigns from the Docks District vault to the High Chancellery inner counting-house.',
    reward: 750,
    perils: ['Lower ward smuggling ambuscades', 'Sewer grate cutthroats', 'Rooftop crossbowmen in the fog'],
    dmNotes: 'A corrupt Chancellery clerk alerted the dockside smuggler syndicate. DC 15 Insight detects the carriage driver glancing at rooftop signals.'
  },
  {
    title: 'Coastal Reef Drake Cull & Nest Suppression',
    subtitle: 'Outer Harbor Navigation Clearance',
    objective: 'Eradicate three coastal reef drakes nesting in the navigational channel bell buoys outside Ostrava Harbor.',
    reward: 600,
    perils: ['Slick submerged reefs', 'Corrosive brine breath', 'Swamping tidal surges'],
    dmNotes: 'One drake is bonded to an exiled smuggler captain hiding on a derelict ketch nearby.'
  },
  {
    title: 'Lower Ward Smuggling Ring Interdiction',
    subtitle: 'Chancellery Excise Investigation',
    objective: 'Infiltrate the salt fish packing wharves in the lower ward to locate and seize contraband Void-Glass vials.',
    reward: 500,
    perils: ['Rotting pier timbers (DC 13 DEX)', 'Concealed trapdoor drops into seawater', 'Hired thug enforcers'],
    dmNotes: 'The smuggling ring is financed by a junior guild factor who attempts a 200 GP bribe if cornered.'
  }
];

const KLADNO_CONTRACTS = [
  {
    title: 'Basalt Shelf Deep Core Extraction',
    subtitle: 'Subterranean Excavation Security',
    objective: 'Provide protective cordon for Gilionite dwarven miners extracting pure volcanic basalt cores on Shelf 7.',
    reward: 850,
    perils: ['Sulfur steam vents', 'Unstable rockfall tremors', 'Basalt striders emerging from magma vents'],
    dmNotes: 'The basalt core is resonant with planar earth elementals; disturbing it triggers an tremorsense encounter.'
  },
  {
    title: 'Sundered Iron Ore Supply Run Escort',
    subtitle: 'Kladno-to-Surface Cart Incline Escort',
    objective: 'Escort heavy ore haulers bearing raw sundered iron up the Great Incline Shaft against subterranean raiders.',
    reward: 650,
    perils: ['Steep track incline (cables under strain)', 'Troglodyte ambushes from ventilation flues', 'Falling slag caltrops'],
    dmNotes: 'A sabotaged winch brake requires a DC 14 Athletics or Smith\'s Tools check to prevent a runaway cart.'
  },
  {
    title: 'Cave Horror Bounty in the Lower Sump',
    subtitle: 'Mine Shaft Sanitation Decree',
    objective: 'Descend into the abandoned flooded lower sump to hunt down the multi-legged abomination devouring foundry pump technicians.',
    reward: 900,
    perils: ['Knee-deep acidic runoff', 'Pitch darkness (magical dimming)', 'Wall-climbing predator ambush'],
    dmNotes: 'The horror is an aberrant mutated carrion crawler that releases an acidic death burst upon dropping to 0 HP.'
  }
];

const RUCEAS_CONTRACTS = [
  {
    title: 'Precursor Shoal Salvage & Relic Recovery',
    subtitle: 'Outer Archipelago Marine Expedition',
    objective: 'Dive the sunken Precursor Shoal to retrieve three bronze-sealed astro-chronometers before the tide turns.',
    reward: 800,
    perils: ['Limited diving air (20 minutes)', 'Barnacled drowned guardians', 'Crushing tidal undertow'],
    dmNotes: 'The astro-chronometers are attuned to the 13th maritime cycle and still tick in synchronization with the moons.'
  },
  {
    title: 'Outer Island Privateer Interception',
    subtitle: 'Rucean Port Admiralty Reprisal',
    objective: 'Board and neutralize the rogue trade cog "Silt Gull" operating unlicensed privateering off the outer shoals.',
    reward: 1000,
    perils: ['Grappling hook boarding under fire', 'Rigging sniper fire', 'Gunpowder cask traps on lower deck'],
    dmNotes: 'The captain carries letters of marque stamped with a forged Admiralty seal.'
  },
  {
    title: 'Open-Water Specimen Collection',
    subtitle: 'Rucean Marine Apothecary Commission',
    objective: 'Capture an intact bioluminescent abyssal eel from the deep trench off the western headland.',
    reward: 550,
    perils: ['Stunning electrical discharge (DC 14 CON)', 'Midnight storm squalls', 'Slippery deck fighting'],
    dmNotes: 'The eel’s fluid must be kept in seawater within 3 hours or its harvest essence spoils.'
  }
];

export function generateLocalizedHubContract(hub: SettlementHub): ProceduralContract {
  let list = OSTRAVA_CONTRACTS;
  let authority = 'High Chancellery of Ostrava';
  let commissioner = 'Chancellery Maritime Comptroller';

  if (hub === 'Kladno Deep Foundry') {
    list = KLADNO_CONTRACTS;
    authority = 'Gilionite Foundry Council';
    commissioner = 'Deep Ore Overseer';
  } else if (hub === 'Port Ruceas') {
    list = RUCEAS_CONTRACTS;
    authority = 'Rucean Port Admiralty';
    commissioner = 'Admiralty Harbor Master';
  }

  const contractDef = pickRandom(list);
  const deadlineDecades = Math.floor(Math.random() * 2) + 1; // 1 to 2 Decades (10 to 20 days)
  const contractId = `CON-${hub.slice(0, 3).toUpperCase()}-${Math.floor(1000 + Math.random() * 9000)}`;

  const markdown = `## ADVENTURERS GUILD OFFICIAL CHARTER
**Contract ID:** \`${contractId}\` · **Regional Hub:** ${hub.toUpperCase()}  
**Presiding Authority:** ${authority}  
**Commissioned By:** ${commissioner}

---

### Contract Scope: ${contractDef.title}
*${contractDef.subtitle}*

> **Mandate Objective:** ${contractDef.objective}

### Bonded Escrow & Execution Window
- **Guaranteed Guild Escrow:** **${contractDef.reward} Concord Sovereigns (gp)** held at the ${hub} Guild Vault.
- **Execution Window:** **${deadlineDecades} Decade${deadlineDecades > 1 ? 's' : ''}** (${deadlineDecades * 10} solar days).
- **Durability Allotment:** Standard +5 RP tool repair voucher included at local guild workshops.

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

export function generateProceduralContract(category?: ContractClassification): ProceduralContract {
  const classes: ContractClassification[] = ['Exploration', 'Hunt', 'Protection', 'Resource Gathering', 'Find'];
  const classification = category || pickRandom(classes);

  let pool = EXPLORATION_OBJECTIVES;
  if (classification === 'Hunt') pool = HUNT_OBJECTIVES;
  else if (classification === 'Protection') pool = PROTECTION_OBJECTIVES;
  else if (classification === 'Resource Gathering') pool = RESOURCE_OBJECTIVES;
  else if (classification === 'Find') pool = FIND_OBJECTIVES;

  const obj = pickRandom(pool);
  const comm = pickRandom(COMMISSIONERS);
  const settlement = pickRandom(SETTLEMENTS);
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
- **Guaranteed Guild Bounty:** **${obj.reward} Concord Sovereigns (GP)** held in bonded escrow at ${settlement}.
- **Fulfillment Period:** **${deadlineDecades} Decade${deadlineDecades > 1 ? 's' : ''}** (${deadlineDecades * 10} standard solar days).

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

