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
  const deadlineDecades = Math.floor(Math.random() * 3) + 1; // 1 to 3 decades (10-30 days)
  const contractId = `CON-${Math.floor(1000 + Math.random() * 9000)}`;

  const markdown = `## ADVENTURERS GUILD OFFICIAL CONTRACT
**Registry Code:** \`${contractId}\` · **Classification:** ${classification.toUpperCase()}  
**Origin Station:** ${settlement}  
**Commissioned By:** ${comm.name} (${comm.title})

---

### Objective & Mandate
> **Target Mandate:** ${obj.target}.
> 
> Safe execution, preservation of collateral, and delivery of material proof is required for escrow disbursement.

### Terms & Escrow Disbursement
- **Guaranteed Guild Bounty:** **${obj.reward} Concord Sovereigns (GP)** held in bonded escrow at ${settlement}.
- **Fulfillment Period:** **${deadlineDecades} Decade${deadlineDecades > 1 ? 's' : ''}** (${deadlineDecades * 10} standard solar days).
- **Hazard Level:** Moderate to Lethal. Standard field maintenance & apothecary allowances apply.

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
