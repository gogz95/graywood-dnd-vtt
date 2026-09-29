# VTT Architectural References

This document catalogs 123 open-source repositories organized by architectural role for a local-first, modular Virtual Tabletop (VTT) application.

---

## 1. TACTICAL CANVAS & RENDERING

| Repository | URL | Primary Role |
|------------|-----|--------------|
| pixijs/pixijs | https://github.com/pixijs/pixijs | WebGL 2D rendering core |
| Lee-Martin/Pixi-VTT | https://github.com/Lee-Martin/Pixi-VTT | VTT Pixi architecture |
| davidfig/pixi-viewport | https://github.com/davidfig/pixi-viewport | Pan/zoom camera |
| konvajs/konva | https://github.com/konvajs/konva | Scene graph & canvas events |
| fabricjs/fabric.js | https://github.com/fabricjs/fabric.js | Canvas object model & SVG parsing |
| anvaka/panzoom | https://github.com/anvaka/panzoom | DOM/SVG pan & zoom |
| andyaiken/dojo | https://github.com/andyaiken/dojo | Multi-window sync |
| doodlezucc/dungeonclub | https://github.com/doodlezucc/dungeonclub | Drawing tools & cursors |
| tarrasqueapp/tarrasqueapp | https://github.com/tarrasqueapp/tarrasqueapp | Grid alignment |
| two-shots-later/vitruvian-vtt | https://github.com/two-shots-later/vitruvian-vtt | Canvas layouts |
| CheekyChinchilla/CozyVTT | https://github.com/CheekyChinchilla/CozyVTT | Minimalist mobile companion |
| beaurancourt/local-tabletop-map | https://github.com/beaurancourt/local-tabletop-map | Offline local display |
| cr-lolo/VeilCast-VTT | https://github.com/cr-lolo/VeilCast-VTT | Dual-screen setup |
| spuentesp/monitor_dm_system | https://github.com/spuentesp/monitor_dm_system | DM/Player monitor sync |
| PapiPatJr/Aure-Relics-Grid | https://github.com/PapiPatJr/Aure-Relics-Grid | Grid overlays |
| Khazlor/Open-VTT | https://github.com/Khazlor/Open-VTT | Layered canvas architecture |
| Touisse/Drag_Drop_App | https://github.com/Touisse/Drag_Drop_App | Drag and drop collisions |
| videojs/video.js | https://github.com/videojs/video.js | Animated map playback |

---

## 2. LINE OF SIGHT, LIGHTING & GEOMETRY

| Repository | URL | Primary Role |
|------------|-----|--------------|
| sruffle/2d-visibility | https://github.com/sruffle/2d-visibility | Raycasting field of view |
| martindevans/Canvas-Fog-Of-War | https://github.com/martindevans/Canvas-Fog-Of-War | Canvas fog cutouts |
| mfogel/polygon-clipping | https://github.com/mfogel/polygon-clipping | Boolean polygon clipping |
| w8r/martinez | https://github.com/w8r/martinez | High-speed polygon clipping |
| Kruptein/PlanarAlly | https://github.com/Kruptein/PlanarAlly | Dynamic lighting & doors |
| mourner/rbush | https://github.com/mourner/rbush | 2D R-Tree spatial indexing |
| bgrins/javascript-astar | https://github.com/bgrins/javascript-astar | 2D A* pathfinding |
| flauwekeul/honeycomb | https://github.com/flauwekeul/honeycomb | Hex grid math |
| madbence/node-bresenham | https://github.com/madbence/node-bresenham | Bresenham line of sight |
| ondras/rot.js | https://github.com/ondras/rot.js | FOV shadowcasting & procgen dungeons |

---

## 3. D&D 5E RULES, SCHEMAS & COMPENDIUMS

| Repository | URL | Primary Role |
|------------|-----|--------------|
| foundryvtt/dnd5e | https://github.com/foundryvtt/dnd5e | 5e schema and progression |
| 5e-bits/5e-database | https://github.com/5e-bits/5e-database | SRD 5.1 JSON data |
| avrae/avrae | https://github.com/avrae/avrae | Combat automation and sheet sync |
| Kreozot/dnd5e-spells | https://github.com/Kreozot/dnd5e-spells | Spell dataset |
| andreafra/dnd-spellbook | https://github.com/andreafra/dnd-spellbook | Spellbook UI |
| DovarFalcone/bag-of-holding | https://github.com/DovarFalcone/bag-of-holding | Inventory & encumbrance |
| manuartero/dnd-beginner-character-sheet-5e-2024 | https://github.com/manuartero/dnd-beginner-character-sheet-5e-2024 | 2024 character sheet |
| Zero-AI-Hub/dnd5e-character-manager | https://github.com/Zero-AI-Hub/dnd5e-character-manager | Character sheet API |
| gabrielaraujof/char-manager-api | https://github.com/gabrielaraujof/char-manager-api | CRUD actor state |
| volnuttz/5.5e-companion | https://github.com/volnuttz/5.5e-companion | 2024/5.5e revisions |
| ryanfp/otm.5etools-homebrew | https://github.com/ryanfp/otm.5etools-homebrew | Homebrew schemas |
| TheGiddyLimit/5etools-utils | https://github.com/TheGiddyLimit/5etools-utils | Data parsing utilities |
| kgevans3rd/byo-rulebook | https://github.com/kgevans3rd/byo-rulebook | Rulebook presentation |
| rodrigues-joaog/rpgSheet | https://github.com/rodrigues-joaog/rpgSheet | Reactive sheets |
| FernDragonborn/charnik | https://github.com/FernDragonborn/charnik | Character builder |
| NatsumeAoii/dnd5e-quickref | https://github.com/NatsumeAoii/dnd5e-quickref | Rules quick-reference |
| ironmonk33/5e-srd-api | https://github.com/ironmonk33/5e-srd-api | Local Express rules API |
| IamFlowZ/dnd-graphql | https://github.com/IamFlowZ/dnd-graphql | GraphQL RPG schema |
| justinritchie/dnd-rules-mcp-server | https://github.com/justinritchie/dnd-rules-mcp-server | MCP rules server |
| josdejong/mathjs | https://github.com/josdejong/mathjs | Safe math formula evaluation |

---

## 4. DICE & 3D ROLLING

| Repository | URL | Primary Role |
|------------|-----|--------------|
| avrae/d20 | https://github.com/avrae/d20 | D20 dice parser |
| dice-roller/rpg-dice-roller | https://github.com/dice-roller/rpg-dice-roller | Advanced RPG dice engine |
| fullpipe/ts-dice-math | https://github.com/fullpipe/ts-dice-math | Dice math evaluation |
| 3d-dice/dice-box | https://github.com/3d-dice/dice-box | 3D Three.js dice roller |
| Major-Muff/teal-dice | https://github.com/Major-Muff/teal-dice | Three.js/Cannon dice |
| 2BAD/dice | https://github.com/2BAD/dice | Canvas 2D dice |
| adiletbtrv/dicera | https://github.com/adiletbtrv/dicera | Notation parser |
| MoPaMo/open-rolls | https://github.com/MoPaMo/open-rolls | Roll auditing |

---

## 5. INGESTION, FILE PARSING & ASSETS

| Repository | URL | Primary Role |
|------------|-----|--------------|
| hunter-read/grimoire | https://github.com/hunter-read/grimoire | Directory crawling & asset hashing |
| UniversalVTT/UniversalVTT | https://github.com/UniversalVTT/UniversalVTT | UVTT/dd2vtt parser |
| PSPDFKit/pdf-to-markdown | https://github.com/PSPDFKit/pdf-to-markdown | PDF to Markdown conversion |
| sindresorhus/file-type | https://github.com/sindresorhus/file-type | Magic byte validation |
| crowbartools/TokenStamp | https://github.com/crowbartools/TokenStamp | Token rim generation |
| RPTools/TokenTool | https://github.com/RPTools/TokenTool | Token border mask logic |
| Durtur/Dungeoneer | https://github.com/Durtur/Dungeoneer | Map tile slicing |
| samcf/ogres | https://github.com/samcf/ogres | Compendium packaging |
| M-ybeme/Worldbinder | https://github.com/M-ybeme/Worldbinder | Asset tagging |

---

## 6. CAMPAIGN ATLAS, TRAVEL & PROCEDURAL GENERATION

| Repository | URL | Primary Role |
|------------|-----|--------------|
| DSPaul/COMPASS | https://github.com/DSPaul/COMPASS | Hex-crawl travel engine |
| Leaflet/Leaflet | https://github.com/Leaflet/Leaflet | Interactive world atlas |
| tzoorlee/DM-Second-Brain | https://github.com/tzoorlee/DM-Second-Brain | Markdown campaign wiki |
| jfdubois/Obsidian_TTRPG_Journal | https://github.com/jfdubois/Obsidian_TTRPG_Journal | Session logging |
| sergekostenchuk/LLM-WIKI-RAG | https://github.com/sergekostenchuk/LLM-WIKI-RAG | Local markdown RAG |
| thomascgray/fantasy-content-generator | https://github.com/thomascgray/fantasy-content-generator | Procedural generators |
| opendnd/genetica | https://github.com/opendnd/genetica | Character genetics |
| opendnd/nomina | https://github.com/opendnd/nomina | Fantasy names |
| opendnd/personae | https://github.com/opendnd/personae | NPC personalities |
| Tawe/NPC-generator | https://github.com/Tawe/NPC-generator | NPC generator |
| Tawe/ArcaneForge | https://github.com/Tawe/ArcaneForge | Magic item generation |
| Multarix/DnD-NPC | https://github.com/Multarix/DnD-NPC | Statblock generator |
| paulinadupin/the-dms-marketplace | https://github.com/paulinadupin/the-dms-marketplace | Shop inventories |
| alex-c-s/markov-namegen | https://github.com/alex-c-s/markov-namegen | Markov phonetic names |
| Renddslow/theogony | https://github.com/Renddslow/theogony | Pantheon generation |
| Bryan-Legend/stonetop-wiki-generator | https://github.com/Bryan-Legend/stonetop-wiki-generator | Wiki generator |
| benwebber/tiddlywiki-dnd | https://github.com/benwebber/tiddlywiki-dnd | Micro-wiki |
| jsnee/vscode-dmbinder | https://github.com/jsnee/vscode-dmbinder | DM binder structures |
| Cthomp7/QuestBase | https://github.com/Cthomp7/QuestBase | Quest tracking |
| lonelog/lonelog | https://github.com/lonelog/lonelog | Timeline trackers |
| Tenebrie/neverkin | https://github.com/Tenebrie/neverkin | Setting traits |
| datashaman/fable | https://github.com/datashaman/fable | Narrative quest hooks |

---

## 7. NETWORKING & MULTIPLAYER SYNC

| Repository | URL | Primary Role |
|------------|-----|--------------|
| yjs/yjs | https://github.com/yjs/yjs | CRDT real-time sync |
| automerge/automerge | https://github.com/automerge/automerge | Local-first state sync |
| peers/peerjs | https://github.com/peers/peerjs | WebRTC P2P networking |
| webrtc/samples | https://github.com/webrtc/samples | WebRTC reference |
| IvanMathy/diecast-companion | https://github.com/IvanMathy/diecast-companion | Companion screen mirroring |
| brian-gates/dnd-digital-companion | https://github.com/brian-gates/dnd-digital-companion | Mobile sheet sync |
| jrmi/airboardgame | https://github.com/jrmi/airboardgame | Turn sync |
| repeated-pleasant-games/tabletop | https://github.com/repeated-pleasant-games/tabletop | P2P state sync |
| bengo501/GameMasterCompanionApp | https://github.com/bengo501/GameMasterCompanionApp | Companion app sync |
| Nolat/virtual-dnd-next | https://github.com/Nolat/virtual-dnd-next | Socket room state |

---

## 8. DESKTOP RUNTIME & PERSISTENCE

| Repository | URL | Primary Role |
|------------|-----|--------------|
| electron/electron | https://github.com/electron/electron | Desktop wrapper |
| sql-js/sql.js | https://github.com/sql-js/sql.js | SQLite Wasm offline database |
| dexie/Dexie.js | https://github.com/dexie/Dexie.js | IndexedDB wrapper |
| leeoniya/uFuzzy | https://github.com/leeoniya/uFuzzy | Fast client fuzzy search |
| krisk/Fuse | https://github.com/krisk/Fuse | Fuzzy search |
| chroma-core/chroma | https://github.com/chroma-core/chroma | Local vector DB |
| remarkjs/remark | https://github.com/remarkjs/remark | Markdown AST processor |

---

## 9. UI CONTROLS & SHORTCUTS

| Repository | URL | Primary Role |
|------------|-----|--------------|
| immerjs/immer | https://github.com/immerjs/immer | Immutable state |
| taye/interact.js | https://github.com/taye/interact.js | Draggable floating panels |
| jamiebuilds/tinykeys | https://github.com/jamiebuilds/tinykeys | Key shortcuts |
| jaywcjlove/hotkeys-js | https://github.com/jaywcjlove/hotkeys-js | Hotkeys |
| ccampbell/mousetrap | https://github.com/ccampbell/mousetrap | Scoped keybindings |
| juditdidit/dm-screen | https://github.com/juditdidit/dm-screen | DM screen layout |
| jaltepeter/dm-screen | https://github.com/jaltepeter/dm-screen | Collapsible reference tables |
| elymsyr/dungeon-master-tool | https://github.com/elymsyr/dungeon-master-tool | Dockable tools |
| kunkristoffer/dnd-misc-tools | https://github.com/kunkristoffer/dnd-misc-tools | Quick utility modals |
| TajwarSaiyeed/smart-todo | https://github.com/TajwarSaiyeed/smart-todo | Task tracking |
| gillesdemey/dnd.banner | https://github.com/gillesdemey/dnd.banner | UI banners |
| R-Rudolph/OmegaRPG | https://github.com/R-Rudolph/OmegaRPG | RPG interface design |

---

## 10. COMBAT & INITIATIVE TRACKING

| Repository | URL | Primary Role |
|------------|-----|--------------|
| M-ybeme/Initiative-Tracker | https://github.com/M-ybeme/Initiative-Tracker | Initiative order tracker |
| Gurumi-glitch/war-table-5e | https://github.com/Gurumi-glitch/war-table-5e | Battlefield manager |
| pspeter3/monster-stadium | https://github.com/pspeter3/monster-stadium | Multi-monster combat |
| ivorisoutdoors/dwight-discord-bot | https://github.com/ivorisoutdoors/dwight-discord-bot | Combat state machine |
| AdamxSimon/ReQuest | https://github.com/AdamxSimon/ReQuest | Encounter progression |
| Andrea-Bertarione/Project-Dungeon | https://github.com/Andrea-Bertarione/Project-Dungeon | Dungeon combat sequencing |
| andyed/wyrdforge | https://github.com/andyed/wyrdforge | Action resource tracking |
| darthinvader/borealis | https://github.com/darthinvader/borealis | Tactical overlays |

---

## 11. AUDIO & SOUNDSCAPES

| Repository | URL | Primary Role |
|------------|-----|--------------|
| goldfire/howler.js | https://github.com/goldfire/howler.js | Multi-channel audio mixer |
| Tonejs/Tone.js | https://github.com/Tonejs/Tone.js | Procedural sound synthesis |
| resonance-audio/resonance-audio-web-sdk | https://github.com/resonance-audio/resonance-audio-web-sdk | 3D spatial audio |
| michaelgrosman/soundboard | https://github.com/michaelgrosman/soundboard | Soundboard interface |
| bbc/waveform-data.js | https://github.com/bbc/waveform-data.js | Waveform rendering |

---

## MAPPED CHECKLIST: KEY REPOSITORY UTILIZATION

### Dynamic 2D Line of Sight and Permanent Fog of War
- `sruffle/2d-visibility` — Raycasting field of view implementation
- `martindevans/Canvas-Fog-Of-War` — Canvas fog cutouts for visibility layers
- `mfogel/polygon-clipping` — Boolean polygon clipping for wall occlusion
- `w8r/martinez` — High-speed polygon clipping for performance-critical FOV calculations
- `Kruptein/PlanarAlly` — Dynamic lighting and door handling
- `mourner/rbush` — 2D R-Tree spatial indexing for efficient visibility queries
- `bgrins/javascript-astar` — 2D A* pathfinding for tactical movement validation
- `flauwekeul/honeycomb` — Hex grid math for hex-based VTTs
- `madbence/node-bresenham` — Bresenham line of sight algorithm
- `ondras/rot.js` — FOV shadowcasting and procedural dungeon generation

### D&D 5e Character Progression and Spell Slot Tracking
- `foundryvtt/dnd5e` — 5e schema and progression reference
- `5e-bits/5e-database` — SRD 5.1 JSON data foundation
- `avrae/avrae` — Combat automation and sheet sync patterns
- `Kreozot/dnd5e-spells` — Spell dataset for spell slot tracking
- `andreafra/dnd-spellbook` — Spellbook UI implementation
- `DovarFalcone/bag-of-holding` — Inventory and encumbrance management
- `manuartero/dnd-beginner-character-sheet-5e-2024` — 2024 character sheet reference
- `Zero-AI-Hub/dnd5e-character-manager` — Character sheet API patterns
- `gabrielaraujof/char-manager-api` — CRUD actor state management
- `volnuttz/5.5e-companion` — 2024/5.5e revision support
- `ryanfp/otm.5etools-homebrew` — Homebrew schema handling
- `TheGiddyLimit/5etools-utils` — Data parsing utilities for character data
- `kgevans3rd/byo-rulebook` — Rulebook presentation layer
- `rodrigues-joaog/rpgSheet` — Reactive sheet implementation
- `FernDragonborn/charnik` — Character builder patterns
- `NatsumeAoii/dnd5e-quickref` — Rules quick-reference data
- `ironmonk33/5e-srd-api` — Local Express rules API reference
- `IamFlowZ/dnd-graphql` — GraphQL RPG schema patterns
- `justinritchie/dnd-rules-mcp-server` — MCP rules server implementation
- `josdejong/mathjs` — Safe math formula evaluation for ability checks

### Client-side PDF Ingestion into Markdown Compendiums
- `hunter-read/grimoire` — Directory crawling and asset hashing
- `UniversalVTT/UniversalVTT` — UVTT/dd2vtt parser integration
- `PSPDFKit/pdf-to-markdown` — PDF to Markdown conversion engine
- `sindresorhus/file-type` — Magic byte validation for file type detection
- `crowbartools/TokenStamp` — Token rim generation for asset processing
- `RPTools/TokenTool` — Token border mask logic
- `Durtur/Dungeoneer` — Map tile slicing for PDF assets
- `samcf/ogres` — Compendium packaging utilities
- `M-ybeme/Worldbinder` — Asset tagging and metadata extraction

### Multi-device Companion Reconnects Without Losing Room Authentication
- `yjs/yjs` — CRDT real-time sync for state reconciliation
- `automerge/automerge` — Local-first state sync with conflict resolution
- `peers/peerjs` — WebRTC P2P networking for direct connections
- `webrtc/samples` — WebRTC reference implementations
- `IvanMathy/diecast-companion` — Companion screen mirroring patterns
- `brian-gates/dnd-digital-companion` — Mobile sheet sync implementation
- `jrmi/airboardgame` — Turn synchronization for state consistency
- `repeated-pleasant-games/tabletop` — P2P state sync protocols
- `bengo501/GameMasterCompanionApp` — Companion app sync patterns
- `Nolat/virtual-dnd-next` — Socket room state management

---

## COMMANDS TO WRITE THIS FILE

### Linux / macOS (Bash)
```bash
cat << 'EOF' > VTT_ARCHITECTURAL_REFERENCES.md
# VTT Architectural References

This document catalogs 123 open-source repositories organized by architectural role for a local-first, modular Virtual Tabletop (VTT) application.

---

## 1. TACTICAL CANVAS & RENDERING

| Repository | URL | Primary Role |
|------------|-----|--------------|
| pixijs/pixijs | https://github.com/pixijs/pixijs | WebGL 2D rendering core |
| Lee-Martin/Pixi-VTT | https://github.com/Lee-Martin/Pixi-VTT | VTT Pixi architecture |
| davidfig/pixi-viewport | https://github.com/davidfig/pixi-viewport | Pan/zoom camera |
| konvajs/konva | https://github.com/konvajs/konva | Scene graph & canvas events |
| fabricjs/fabric.js | https://github.com/fabricjs/fabric.js | Canvas object model & SVG parsing |
| anvaka/panzoom | https://github.com/anvaka/panzoom | DOM/SVG pan & zoom |
| andyaiken/dojo | https://github.com/andyaiken/dojo | Multi-window sync |
| doodlezucc/dungeonclub | https://github.com/doodlezucc/dungeonclub | Drawing tools & cursors |
| tarrasqueapp/tarrasqueapp | https://github.com/tarrasqueapp/tarrasqueapp | Grid alignment |
| two-shots-later/vitruvian-vtt | https://github.com/two-shots-later/vitruvian-vtt | Canvas layouts |
| CheekyChinchilla/CozyVTT | https://github.com/CheekyChinchilla/CozyVTT | Minimalist mobile companion |
| beaurancourt/local-tabletop-map | https://github.com/beaurancourt/local-tabletop-map | Offline local display |
| cr-lolo/VeilCast-VTT | https://github.com/cr-lolo/VeilCast-VTT | Dual-screen setup |
| spuentesp/monitor_dm_system | https://github.com/spuentesp/monitor_dm_system | DM/Player monitor sync |
| PapiPatJr/Aure-Relics-Grid | https://github.com/PapiPatJr/Aure-Relics-Grid | Grid overlays |
| Khazlor/Open-VTT | https://github.com/Khazlor/Open-VTT | Layered canvas architecture |
| Touisse/Drag_Drop_App | https://github.com/Touisse/Drag_Drop_App | Drag and drop collisions |
| videojs/video.js | https://github.com/videojs/video.js | Animated map playback |

---

## 2. LINE OF SIGHT, LIGHTING & GEOMETRY

| Repository | URL | Primary Role |
|------------|-----|--------------|
| sruffle/2d-visibility | https://github.com/sruffle/2d-visibility | Raycasting field of view |
| martindevans/Canvas-Fog-Of-War | https://github.com/martindevans/Canvas-Fog-Of-War | Canvas fog cutouts |
| mfogel/polygon-clipping | https://github.com/mfogel/polygon-clipping | Boolean polygon clipping |
| w8r/martinez | https://github.com/w8r/martinez | High-speed polygon clipping |
| Kruptein/PlanarAlly | https://github.com/Kruptein/PlanarAlly | Dynamic lighting & doors |
| mourner/rbush | https://github.com/mourner/rbush | 2D R-Tree spatial indexing |
| bgrins/javascript-astar | https://github.com/bgrins/javascript-astar | 2D A* pathfinding |
| flauwekeul/honeycomb | https://github.com/flauwekeul/honeycomb | Hex grid math |
| madbence/node-bresenham | https://github.com/madbence/node-bresenham | Bresenham line of sight |
| ondras/rot.js | https://github.com/ondras/rot.js | FOV shadowcasting & procgen dungeons |

---

## 3. D&D 5E RULES, SCHEMAS & COMPENDIUMS

| Repository | URL | Primary Role |
|------------|-----|--------------|
| foundryvtt/dnd5e | https://github.com/foundryvtt/dnd5e | 5e schema and progression |
| 5e-bits/5e-database | https://github.com/5e-bits/5e-database | SRD 5.1 JSON data |
| avrae/avrae | https://github.com/avrae/avrae | Combat automation and sheet sync |
| Kreozot/dnd5e-spells | https://github.com/Kreozot/dnd5e-spells | Spell dataset |
| andreafra/dnd-spellbook | https://github.com/andreafra/dnd-spellbook | Spellbook UI |
| DovarFalcone/bag-of-holding | https://github.com/DovarFalcone/bag-of-holding | Inventory & encumbrance |
| manuartero/dnd-beginner-character-sheet-5e-2024 | https://github.com/manuartero/dnd-beginner-character-sheet-5e-2024 | 2024 character sheet |
| Zero-AI-Hub/dnd5e-character-manager | https://github.com/Zero-AI-Hub/dnd5e-character-manager | Character sheet API |
| gabrielaraujof/char-manager-api | https://github.com/gabrielaraujof/char-manager-api | CRUD actor state |
| volnuttz/5.5e-companion | https://github.com/volnuttz/5.5e-companion | 2024/5.5e revisions |
| ryanfp/otm.5etools-homebrew | https://github.com/ryanfp/otm.5etools-homebrew | Homebrew schemas |
| TheGiddyLimit/5etools-utils | https://github.com/TheGiddyLimit/5etools-utils | Data parsing utilities |
| kgevans3rd/byo-rulebook | https://github.com/kgevans3rd/byo-rulebook | Rulebook presentation |
| rodrigues-joaog/rpgSheet | https://github.com/rodrigues-joaog/rpgSheet | Reactive sheets |
| FernDragonborn/charnik | https://github.com/FernDragonborn/charnik | Character builder |
| NatsumeAoii/dnd5e-quickref | https://github.com/NatsumeAoii/dnd5e-quickref | Rules quick-reference |
| ironmonk33/5e-srd-api | https://github.com/ironmonk33/5e-srd-api | Local Express rules API |
| IamFlowZ/dnd-graphql | https://github.com/IamFlowZ/dnd-graphql | GraphQL RPG schema |
| justinritchie/dnd-rules-mcp-server | https://github.com/justinritchie/dnd-rules-mcp-server | MCP rules server |
| josdejong/mathjs | https://github.com/josdejong/mathjs | Safe math formula evaluation |

---

## 4. DICE & 3D ROLLING

| Repository | URL | Primary Role |
|------------|-----|--------------|
| avrae/d20 | https://github.com/avrae/d20 | D20 dice parser |
| dice-roller/rpg-dice-roller | https://github.com/dice-roller/rpg-dice-roller | Advanced RPG dice engine |
| fullpipe/ts-dice-math | https://github.com/fullpipe/ts-dice-math | Dice math evaluation |
| 3d-dice/dice-box | https://github.com/3d-dice/dice-box | 3D Three.js dice roller |
| Major-Muff/teal-dice | https://github.com/Major-Muff/teal-dice | Three.js/Cannon dice |
| 2BAD/dice | https://github.com/2BAD/dice | Canvas 2D dice |
| adiletbtrv/dicera | https://github.com/adiletbtrv/dicera | Notation parser |
| MoPaMo/open-rolls | https://github.com/MoPaMo/open-rolls | Roll auditing |

---

## 5. INGESTION, FILE PARSING & ASSETS

| Repository | URL | Primary Role |
|------------|-----|--------------|
| hunter-read/grimoire | https://github.com/hunter-read/grimoire | Directory crawling & asset hashing |
| UniversalVTT/UniversalVTT | https://github.com/UniversalVTT/UniversalVTT | UVTT/dd2vtt parser |
| PSPDFKit/pdf-to-markdown | https://github.com/PSPDFKit/pdf-to-markdown | PDF to Markdown conversion |
| sindresorhus/file-type | https://github.com/sindresorhus/file-type | Magic byte validation |
| crowbartools/TokenStamp | https://github.com/crowbartools/TokenStamp | Token rim generation |
| RPTools/TokenTool | https://github.com/RPTools/TokenTool | Token border mask logic |
| Durtur/Dungeoneer | https://github.com/Durtur/Dungeoneer | Map tile slicing |
| samcf/ogres | https://github.com/samcf/ogres | Compendium packaging |
| M-ybeme/Worldbinder | https://github.com/M-ybeme/Worldbinder | Asset tagging |

---

## 6. CAMPAIGN ATLAS, TRAVEL & PROCEDURAL GENERATION

| Repository | URL | Primary Role |
|------------|-----|--------------|
| DSPaul/COMPASS | https://github.com/DSPaul/COMPASS | Hex-crawl travel engine |
| Leaflet/Leaflet | https://github.com/Leaflet/Leaflet | Interactive world atlas |
| tzoorlee/DM-Second-Brain | https://github.com/tzoorlee/DM-Second-Brain | Markdown campaign wiki |
| jfdubois/Obsidian_TTRPG_Journal | https://github.com/jfdubois/Obsidian_TTRPG_Journal | Session logging |
| sergekostenchuk/LLM-WIKI-RAG | https://github.com/sergekostenchuk/LLM-WIKI-RAG | Local markdown RAG |
| thomascgray/fantasy-content-generator | https://github.com/thomascgray/fantasy-content-generator | Procedural generators |
| opendnd/genetica | https://github.com/opendnd/genetica | Character genetics |
| opendnd/nomina | https://github.com/opendnd/nomina | Fantasy names |
| opendnd/personae | https://github.com/opendnd/personae | NPC personalities |
| Tawe/NPC-generator | https://github.com/Tawe/NPC-generator | NPC generator |
| Tawe/ArcaneForge | https://github.com/Tawe/ArcaneForge | Magic item generation |
| Multarix/DnD-NPC | https://github.com/Multarix/DnD-NPC | Statblock generator |
| paulinadupin/the-dms-marketplace | https://github.com/paulinadupin/the-dms-marketplace | Shop inventories |
| alex-c-s/markov-namegen | https://github.com/alex-c-s/markov-namegen | Markov phonetic names |
| Renddslow/theogony | https://github.com/Renddslow/theogony | Pantheon generation |
| Bryan-Legend/stonetop-wiki-generator | https://github.com/Bryan-Legend/stonetop-wiki-generator | Wiki generator |
| benwebber/tiddlywiki-dnd | https://github.com/benwebber/tiddlywiki-dnd | Micro-wiki |
| jsnee/vscode-dmbinder | https://github.com/jsnee/vscode-dmbinder | DM binder structures |
| Cthomp7/QuestBase | https://github.com/Cthomp7/QuestBase | Quest tracking |
| lonelog/lonelog | https://github.com/lonelog/lonelog | Timeline trackers |
| Tenebrie/neverkin | https://github.com/Tenebrie/neverkin | Setting traits |
| datashaman/fable | https://github.com/datashaman/fable | Narrative quest hooks |

---

## 7. NETWORKING & MULTIPLAYER SYNC

| Repository | URL | Primary Role |
|------------|-----|--------------|
| yjs/yjs | https://github.com/yjs/yjs | CRDT real-time sync |
| automerge/automerge | https://github.com/automerge/automerge | Local-first state sync |
| peers/peerjs | https://github.com/peers/peerjs | WebRTC P2P networking |
| webrtc/samples | https://github.com/webrtc/samples | WebRTC reference |
| IvanMathy/diecast-companion | https://github.com/IvanMathy/diecast-companion | Companion screen mirroring |
| brian-gates/dnd-digital-companion | https://github.com/brian-gates/dnd-digital-companion | Mobile sheet sync |
| jrmi/airboardgame | https://github.com/jrmi/airboardgame | Turn sync |
| repeated-pleasant-games/tabletop | https://github.com/repeated-pleasant-games/tabletop | P2P state sync |
| bengo501/GameMasterCompanionApp | https://github.com/bengo501/GameMasterCompanionApp | Companion app sync |
| Nolat/virtual-dnd-next | https://github.com/Nolat/virtual-dnd-next | Socket room state |

---

## 8. DESKTOP RUNTIME & PERSISTENCE

| Repository | URL | Primary Role |
|------------|-----|--------------|
| electron/electron | https://github.com/electron/electron | Desktop wrapper |
| sql-js/sql.js | https://github.com/sql-js/sql.js | SQLite Wasm offline database |
| dexie/Dexie.js | https://github.com/dexie/Dexie.js | IndexedDB wrapper |
| leeoniya/uFuzzy | https://github.com/leeoniya/uFuzzy | Fast client fuzzy search |
| krisk/Fuse | https://github.com/krisk/Fuse | Fuzzy search |
| chroma-core/chroma | https://github.com/chroma-core/chroma | Local vector DB |
| remarkjs/remark | https://github.com/remarkjs/remark | Markdown AST processor |

---

## 9. UI CONTROLS & SHORTCUTS

| Repository | URL | Primary Role |
|------------|-----|--------------|
| immerjs/immer | https://github.com/immerjs/immer | Immutable state |
| taye/interact.js | https://github.com/taye/interact.js | Draggable floating panels |
| jamiebuilds/tinykeys | https://github.com/jamiebuilds/tinykeys | Key shortcuts |
| jaywcjlove/hotkeys-js | https://github.com/jaywcjlove/hotkeys-js | Hotkeys |
| ccampbell/mousetrap | https://github.com/ccampbell/mousetrap | Scoped keybindings |
| juditdidit/dm-screen | https://github.com/juditdidit/dm-screen | DM screen layout |
| jaltepeter/dm-screen | https://github.com/jaltepeter/dm-screen | Collapsible reference tables |
| elymsyr/dungeon-master-tool | https://github.com/elymsyr/dungeon-master-tool | Dockable tools |
| kunkristoffer/dnd-misc-tools | https://github.com/kunkristoffer/dnd-misc-tools | Quick utility modals |
| TajwarSaiyeed/smart-todo | https://github.com/TajwarSaiyeed/smart-todo | Task tracking |
| gillesdemey/dnd.banner | https://github.com/gillesdemey/dnd.banner | UI banners |
| R-Rudolph/OmegaRPG | https://github.com/R-Rudolph/OmegaRPG | RPG interface design |

---

## 10. COMBAT & INITIATIVE TRACKING

| Repository | URL | Primary Role |
|------------|-----|--------------|
| M-ybeme/Initiative-Tracker | https://github.com/M-ybeme/Initiative-Tracker | Initiative order tracker |
| Gurumi-glitch/war-table-5e | https://github.com/Gurumi-glitch/war-table-5e | Battlefield manager |
| pspeter3/monster-stadium | https://github.com/pspeter3/monster-stadium | Multi-monster combat |
| ivorisoutdoors/dwight-discord-bot | https://github.com/ivorisoutdoors/dwight-discord-bot | Combat state machine |
| AdamxSimon/ReQuest | https://github.com/AdamxSimon/ReQuest | Encounter progression |
| Andrea-Bertarione/Project-Dungeon | https://github.com/Andrea-Bertarione/Project-Dungeon | Dungeon combat sequencing |
| andyed/wyrdforge | https://github.com/andyed/wyrdforge | Action resource tracking |
| darthinvader/borealis | https://github.com/darthinvader/borealis | Tactical overlays |

---

## 11. AUDIO & SOUNDSCAPES

| Repository | URL | Primary Role |
|------------|-----|--------------|
| goldfire/howler.js | https://github.com/goldfire/howler.js | Multi-channel audio mixer |
| Tonejs/Tone.js | https://github.com/Tonejs/Tone.js | Procedural sound synthesis |
| resonance-audio/resonance-audio-web-sdk | https://github.com/resonance-audio/resonance-audio-web-sdk | 3D spatial audio |
| michaelgrosman/soundboard | https://github.com/michaelgrosman/soundboard | Soundboard interface |
| bbc/waveform-data.js | https://github.com/bbc/waveform-data.js | Waveform rendering |

---

## MAPPED CHECKLIST: KEY REPOSITORY UTILIZATION

### Dynamic 2D Line of Sight and Permanent Fog of War
- `sruffle/2d-visibility` — Raycasting field of view implementation
- `martindevans/Canvas-Fog-Of-War` — Canvas fog cutouts for visibility layers
- `mfogel/polygon-clipping` — Boolean polygon clipping for wall occlusion
- `w8r/martinez` — High-speed polygon clipping for performance-critical FOV calculations
- `Kruptein/PlanarAlly` — Dynamic lighting and door handling
- `mourner/rbush` — 2D R-Tree spatial indexing for efficient visibility queries
- `bgrins/javascript-astar` — 2D A* pathfinding for tactical movement validation
- `flauwekeul/honeycomb` — Hex grid math for hex-based VTTs
- `madbence/node-bresenham` — Bresenham line of sight algorithm
- `ondras/rot.js` — FOV shadowcasting and procedural dungeon generation

### D&D 5e Character Progression and Spell Slot Tracking
- `foundryvtt/dnd5e` — 5e schema and progression reference
- `5e-bits/5e-database` — SRD 5.1 JSON data foundation
- `avrae/avrae` — Combat automation and sheet sync patterns
- `Kreozot/dnd5e-spells` — Spell dataset for spell slot tracking
- `andreafra/dnd-spellbook` — Spellbook UI implementation
- `DovarFalcone/bag-of-holding` — Inventory and encumbrance management
- `manuartero/dnd-beginner-character-sheet-5e-2024` — 2024 character sheet reference
- `Zero-AI-Hub/dnd5e-character-manager` — Character sheet API patterns
- `gabrielaraujof/char-manager-api` — CRUD actor state management
- `volnuttz/5.5e-companion` — 2024/5.5e revision support
- `ryanfp/otm.5etools-homebrew` — Homebrew schema handling
- `TheGiddyLimit/5etools-utils` — Data parsing utilities for character data
- `kgevans3rd/byo-rulebook` — Rulebook presentation layer
- `rodrigues-joaog/rpgSheet` — Reactive sheet implementation
- `FernDragonborn/charnik` — Character builder patterns
- `NatsumeAoii/dnd5e-quickref` — Rules quick-reference data
- `ironmonk33/5e-srd-api` — Local Express rules API reference
- `IamFlowZ/dnd-graphql` — GraphQL RPG schema patterns
- `justinritchie/dnd-rules-mcp-server` — MCP rules server implementation
- `josdejong/mathjs` — Safe math formula evaluation for ability checks

### Client-side PDF Ingestion into Markdown Compendiums
- `hunter-read/grimoire` — Directory crawling and asset hashing
- `UniversalVTT/UniversalVTT` — UVTT/dd2vtt parser integration
- `PSPDFKit/pdf-to-markdown` — PDF to Markdown conversion engine
- `sindresorhus/file-type` — Magic byte validation for file type detection
- `crowbartools/TokenStamp` — Token rim generation for asset processing
- `RPTools/TokenTool` — Token border mask logic
- `Durtur/Dungeoneer` — Map tile slicing for PDF assets
- `samcf/ogres` — Compendium packaging utilities
- `M-ybeme/Worldbinder` — Asset tagging and metadata extraction

### Multi-device Companion Reconnects Without Losing Room Authentication
- `yjs/yjs` — CRDT real-time sync for state reconciliation
- `automerge/automerge` — Local-first state sync with conflict resolution
- `peers/peerjs` — WebRTC P2P networking for direct connections
- `webrtc/samples` — WebRTC reference implementations
- `IvanMathy/diecast-companion` — Companion screen mirroring patterns
- `brian-gates/dnd-digital-companion` — Mobile sheet sync implementation
- `jrmi/airboardgame` — Turn synchronization for state consistency
- `repeated-pleasant-games/tabletop` — P2P state sync protocols
- `bengo501/GameMasterCompanionApp` — Companion app sync patterns
- `Nolat/virtual-dnd-next` — Socket room state management

---

EOF
```

### Windows (PowerShell)
```powershell
Set-Content -Path "VTT_ARCHITECTURAL_REFERENCES.md" -Value @'
# VTT Architectural References

This document catalogs 123 open-source repositories organized by architectural role for a local-first, modular Virtual Tabletop (VTT) application.

---

## 1. TACTICAL CANVAS & RENDERING

| Repository | URL | Primary Role |
|------------|-----|--------------|
| pixijs/pixijs | https://github.com/pixijs/pixijs | WebGL 2D rendering core |
| Lee-Martin/Pixi-VTT | https://github.com/Lee-Martin/Pixi-VTT | VTT Pixi architecture |
| davidfig/pixi-viewport | https://github.com/davidfig/pixi-viewport | Pan/zoom camera |
| konvajs/konva | https://github.com/konvajs/konva | Scene graph & canvas events |
| fabricjs/fabric.js | https://github.com/fabricjs/fabric.js | Canvas object model & SVG parsing |
| anvaka/panzoom | https://github.com/anvaka/panzoom | DOM/SVG pan & zoom |
| andyaiken/dojo | https://github.com/andyaiken/dojo | Multi-window sync |
| doodlezucc/dungeonclub | https://github.com/doodlezucc/dungeonclub | Drawing tools & cursors |
| tarrasqueapp/tarrasqueapp | https://github.com/tarrasqueapp/tarrasqueapp | Grid alignment |
| two-shots-later/vitruvian-vtt | https://github.com/two-shots-later/vitruvian-vtt | Canvas layouts |
| CheekyChinchilla/CozyVTT | https://github.com/CheekyChinchilla/CozyVTT | Minimalist mobile companion |
| beaurancourt/local-tabletop-map | https://github.com/beaurancourt/local-tabletop-map | Offline local display |
| cr-lolo/VeilCast-VTT | https://github.com/cr-lolo/VeilCast-VTT | Dual-screen setup |
| spuentesp/monitor_dm_system | https://github.com/spuentesp/monitor_dm_system | DM/Player monitor sync |
| PapiPatJr/Aure-Relics-Grid | https://github.com/PapiPatJr/Aure-Relics-Grid | Grid overlays |
| Khazlor/Open-VTT | https://github.com/Khazlor/Open-VTT | Layered canvas architecture |
| Touisse/Drag_Drop_App | https://github.com/Touisse/Drag_Drop_App | Drag and drop collisions |
| videojs/video.js | https://github.com/videojs/video.js | Animated map playback |

---

## 2. LINE OF SIGHT, LIGHTING & GEOMETRY

| Repository | URL | Primary Role |
|------------|-----|--------------|
| sruffle/2d-visibility | https://github.com/sruffle/2d-visibility | Raycasting field of view |
| martindevans/Canvas-Fog-Of-War | https://github.com/martindevans/Canvas-Fog-Of-War | Canvas fog cutouts |
| mfogel/polygon-clipping | https://github.com/mfogel/polygon-clipping | Boolean polygon clipping |
| w8r/martinez | https://github.com/w8r/martinez | High-speed polygon clipping |
| Kruptein/PlanarAlly | https://github.com/Kruptein/PlanarAlly | Dynamic lighting & doors |
| mourner/rbush | https://github.com/mourner/rbush | 2D R-Tree spatial indexing |
| bgrins/javascript-astar | https://github.com/bgrins/javascript-astar | 2D A* pathfinding |
| flauwekeul/honeycomb | https://github.com/flauwekeul/honeycomb | Hex grid math |
| madbence/node-bresenham | https://github.com/madbence/node-bresenham | Bresenham line of sight |
| ondras/rot.js | https://github.com/ondras/rot.js | FOV shadowcasting & procgen dungeons |

---

## 3. D&D 5E RULES, SCHEMAS & COMPENDIUMS

| Repository | URL | Primary Role |
|------------|-----|--------------|
| foundryvtt/dnd5e | https://github.com/foundryvtt/dnd5e | 5e schema and progression |
| 5e-bits/5e-database | https://github.com/5e-bits/5e-database | SRD 5.1 JSON data |
| avrae/avrae | https://github.com/avrae/avrae | Combat automation and sheet sync |
| Kreozot/dnd5e-spells | https://github.com/Kreozot/dnd5e-spells | Spell dataset |
| andreafra/dnd-spellbook | https://github.com/andreafra/dnd-spellbook | Spellbook UI |
| DovarFalcone/bag-of-holding | https://github.com/DovarFalcone/bag-of-holding | Inventory & encumbrance |
| manuartero/dnd-beginner-character-sheet-5e-2024 | https://github.com/manuartero/dnd-beginner-character-sheet-5e-2024 | 2024 character sheet |
| Zero-AI-Hub/dnd5e-character-manager | https://github.com/Zero-AI-Hub/dnd5e-character-manager | Character sheet API |
| gabrielaraujof/char-manager-api | https://github.com/gabrielaraujof/char-manager-api | CRUD actor state |
| volnuttz/5.5e-companion | https://github.com/volnuttz/5.5e-companion | 2024/5.5e revisions |
| ryanfp/otm.5etools-homebrew | https://github.com/ryanfp/otm.5etools-homebrew | Homebrew schemas |
| TheGiddyLimit/5etools-utils | https://github.com/TheGiddyLimit/5etools-utils | Data parsing utilities |
| kgevans3rd/byo-rulebook | https://github.com/kgevans3rd/byo-rulebook | Rulebook presentation |
| rodrigues-joaog/rpgSheet | https://github.com/rodrigues-joaog/rpgSheet | Reactive sheets |
| FernDragonborn/charnik | https://github.com/FernDragonborn/charnik | Character builder |
| NatsumeAoii/dnd5e-quickref | https://github.com/NatsumeAoii/dnd5e-quickref | Rules quick-reference |
| ironmonk33/5e-srd-api | https://github.com/ironmonk33/5e-srd-api | Local Express rules API |
| IamFlowZ/dnd-graphql | https://github.com/IamFlowZ/dnd-graphql | GraphQL RPG schema |
| justinritchie/dnd-rules-mcp-server | https://github.com/justinritchie/dnd-rules-mcp-server | MCP rules server |
| josdejong/mathjs | https://github.com/josdejong/mathjs | Safe math formula evaluation |

---

## 4. DICE & 3D ROLLING

| Repository | URL | Primary Role |
|------------|-----|--------------|
| avrae/d20 | https://github.com/avrae/d20 | D20 dice parser |
| dice-roller/rpg-dice-roller | https://github.com/dice-roller/rpg-dice-roller | Advanced RPG dice engine |
| fullpipe/ts-dice-math | https://github.com/fullpipe/ts-dice-math | Dice math evaluation |
| 3d-dice/dice-box | https://github.com/3d-dice/dice-box | 3D Three.js dice roller |
| Major-Muff/teal-dice | https://github.com/Major-Muff/teal-dice | Three.js/Cannon dice |
| 2BAD/dice | https://github.com/2BAD/dice | Canvas 2D dice |
| adiletbtrv/dicera | https://github.com/adiletbtrv/dicera | Notation parser |
| MoPaMo/open-rolls | https://github.com/MoPaMo/open-rolls | Roll auditing |

---

## 5. INGESTION, FILE PARSING & ASSETS

| Repository | URL | Primary Role |
|------------|-----|--------------|
| hunter-read/grimoire | https://github.com/hunter-read/grimoire | Directory crawling & asset hashing |
| UniversalVTT/UniversalVTT | https://github.com/UniversalVTT/UniversalVTT | UVTT/dd2vtt parser |
| PSPDFKit/pdf-to-markdown | https://github.com/PSPDFKit/pdf-to-markdown | PDF to Markdown conversion |
| sindresorhus/file-type | https://github.com/sindresorhus/file-type | Magic byte validation |
| crowbartools/TokenStamp | https://github.com/crowbartools/TokenStamp | Token rim generation |
| RPTools/TokenTool | https://github.com/RPTools/TokenTool | Token border mask logic |
| Durtur/Dungeoneer | https://github.com/Durtur/Dungeoneer | Map tile slicing |
| samcf/ogres | https://github.com/samcf/ogres | Compendium packaging |
| M-ybeme/Worldbinder | https://github.com/M-ybeme/Worldbinder | Asset tagging |

---

## 6. CAMPAIGN ATLAS, TRAVEL & PROCEDURAL GENERATION

| Repository | URL | Primary Role |
|------------|-----|--------------|
| DSPaul/COMPASS | https://github.com/DSPaul/COMPASS | Hex-crawl travel engine |
| Leaflet/Leaflet | https://github.com/Leaflet/Leaflet | Interactive world atlas |
| tzoorlee/DM-Second-Brain | https://github.com/tzoorlee/DM-Second-Brain | Markdown campaign wiki |
| jfdubois/Obsidian_TTRPG_Journal | https://github.com/jfdubois/Obsidian_TTRPG_Journal | Session logging |
| sergekostenchuk/LLM-WIKI-RAG | https://github.com/sergekostenchuk/LLM-WIKI-RAG | Local markdown RAG |
| thomascgray/fantasy-content-generator | https://github.com/thomascgray/fantasy-content-generator | Procedural generators |
| opendnd/genetica | https://github.com/opendnd/genetica | Character genetics |
| opendnd/nomina | https://github.com/opendnd/nomina | Fantasy names |
| opendnd/personae | https://github.com/opendnd/personae | NPC personalities |
| Tawe/NPC-generator | https://github.com/Tawe/NPC-generator | NPC generator |
| Tawe/ArcaneForge | https://github.com/Tawe/ArcaneForge | Magic item generation |
| Multarix/DnD-NPC | https://github.com/Multarix/DnD-NPC | Statblock generator |
| paulinadupin/the-dms-marketplace | https://github.com/paulinadupin/the-dms-marketplace | Shop inventories |
| alex-c-s/markov-namegen | https://github.com/alex-c-s/markov-namegen | Markov phonetic names |
| Renddslow/theogony | https://github.com/Renddslow/theogony | Pantheon generation |
| Bryan-Legend/stonetop-wiki-generator | https://github.com/Bryan-Legend/stonetop-wiki-generator | Wiki generator |
| benwebber/tiddlywiki-dnd | https://github.com/benwebber/tiddlywiki-dnd | Micro-wiki |
| jsnee/vscode-dmbinder | https://github.com/jsnee/vscode-dmbinder | DM binder structures |
| Cthomp7/QuestBase | https://github.com/Cthomp7/QuestBase | Quest tracking |
| lonelog/lonelog | https://github.com/lonelog/lonelog | Timeline trackers |
| Tenebrie/neverkin | https://github.com/Tenebrie/neverkin | Setting traits |
| datashaman/fable | https://github.com/datashaman/fable | Narrative quest hooks |

---

## 7. NETWORKING & MULTIPLAYER SYNC

| Repository | URL | Primary Role |
|------------|-----|--------------|
| yjs/yjs | https://github.com/yjs/yjs | CRDT real-time sync |
| automerge/automerge | https://github.com/automerge/automerge | Local-first state sync |
| peers/peerjs | https://github.com/peers/peerjs | WebRTC P2P networking |
| webrtc/samples | https://github.com/webrtc/samples | WebRTC reference |
| IvanMathy/diecast-companion | https://github.com/IvanMathy/diecast-companion | Companion screen mirroring |
| brian-gates/dnd-digital-companion | https://github.com/brian-gates/dnd-digital-companion | Mobile sheet sync |
| jrmi/airboardgame | https://github.com/jrmi/airboardgame | Turn sync |
| repeated-pleasant-games/tabletop | https://github.com/repeated-pleasant-games/tabletop | P2P state sync |
| bengo501/GameMasterCompanionApp | https://github.com/bengo501/GameMasterCompanionApp | Companion app sync |
| Nolat/virtual-dnd-next | https://github.com/Nolat/virtual-dnd-next | Socket room state |

---

## 8. DESKTOP RUNTIME & PERSISTENCE

| Repository | URL | Primary Role |
|------------|-----|--------------|
| electron/electron | https://github.com/electron/electron | Desktop wrapper |
| sql-js/sql.js | https://github.com/sql-js/sql.js | SQLite Wasm offline database |
| dexie/Dexie.js | https://github.com/dexie/Dexie.js | IndexedDB wrapper |
| leeoniya/uFuzzy | https://github.com/leeoniya/uFuzzy | Fast client fuzzy search |
| krisk/Fuse | https://github.com/krisk/Fuse | Fuzzy search |
| chroma-core/chroma | https://github.com/chroma-core/chroma | Local vector DB |
| remarkjs/remark | https://github.com/remarkjs/remark | Markdown AST processor |

---

## 9. UI CONTROLS & SHORTCUTS

| Repository | URL | Primary Role |
|------------|-----|--------------|
| immerjs/immer | https://github.com/immerjs/immer | Immutable state |
| taye/interact.js | https://github.com/taye/interact.js | Draggable floating panels |
| jamiebuilds/tinykeys | https://github.com/jamiebuilds/tinykeys | Key shortcuts |
| jaywcjlove/hotkeys-js | https://github.com/jaywcjlove/hotkeys-js | Hotkeys |
| ccampbell/mousetrap | https://github.com/ccampbell/mousetrap | Scoped keybindings |
| juditdidit/dm-screen | https://github.com/juditdidit/dm-screen | DM screen layout |
| jaltepeter/dm-screen | https://github.com/jaltepeter/dm-screen | Collapsible reference tables |
| elymsyr/dungeon-master-tool | https://github.com/elymsyr/dungeon-master-tool | Dockable tools |
| kunkristoffer/dnd-misc-tools | https://github.com/kunkristoffer/dnd-misc-tools | Quick utility modals |
| TajwarSaiyeed/smart-todo | https://github.com/TajwarSaiyeed/smart-todo | Task tracking |
| gillesdemey/dnd.banner | https://github.com/gillesdemey/dnd.banner | UI banners |
| R-Rudolph/OmegaRPG | https://github.com/R-Rudolph/OmegaRPG | RPG interface design |

---

## 10. COMBAT & INITIATIVE TRACKING

| Repository | URL | Primary Role |
|------------|-----|--------------|
| M-ybeme/Initiative-Tracker | https://github.com/M-ybeme/Initiative-Tracker | Initiative order tracker |
| Gurumi-glitch/war-table-5e | https://github.com/Gurumi-glitch/war-table-5e | Battlefield manager |
| pspeter3/monster-stadium | https://github.com/pspeter3/monster-stadium | Multi-monster combat |
| ivorisoutdoors/dwight-discord-bot | https://github.com/ivorisoutdoors/dwight-discord-bot | Combat state machine |
| AdamxSimon/ReQuest | https://github.com/AdamxSimon/ReQuest | Encounter progression |
| Andrea-Bertarione/Project-Dungeon | https://github.com/Andrea-Bertarione/Project-Dungeon | Dungeon combat sequencing |
| andyed/wyrdforge | https://github.com/andyed/wyrdforge | Action resource tracking |
| darthinvader/borealis | https://github.com/darthinvader/borealis | Tactical overlays |

---

## 11. AUDIO & SOUNDSCAPES

| Repository | URL | Primary Role |
|------------|-----|--------------|
| goldfire/howler.js | https://github.com/goldfire/howler.js | Multi-channel audio mixer |
| Tonejs/Tone.js | https://github.com/Tonejs/Tone.js | Procedural sound synthesis |
| resonance-audio/resonance-audio-web-sdk | https://github.com/resonance-audio/resonance-audio-web-sdk | 3D spatial audio |
| michaelgrosman/soundboard | https://github.com/michaelgrosman/soundboard | Soundboard interface |
| bbc/waveform-data.js | https://github.com/bbc/waveform-data.js | Waveform rendering |

---

## MAPPED CHECKLIST: KEY REPOSITORY UTILIZATION

### Dynamic 2D Line of Sight and Permanent Fog of War
- `sruffle/2d-visibility` — Raycasting field of view implementation
- `martindevans/Canvas-Fog-Of-War` — Canvas fog cutouts for visibility layers
- `mfogel/polygon-clipping` — Boolean polygon clipping for wall occlusion
- `w8r/martinez` — High-speed polygon clipping for performance-critical FOV calculations
- `Kruptein/PlanarAlly` — Dynamic lighting and door handling
- `mourner/rbush` — 2D R-Tree spatial indexing for efficient visibility queries
- `bgrins/javascript-astar` — 2D A* pathfinding for tactical movement validation
- `flauwekeul/honeycomb` — Hex grid math for hex-based VTTs
- `madbence/node-bresenham` — Bresenham line of sight algorithm
- `ondras/rot.js` — FOV shadowcasting and procedural dungeon generation

### D&D 5e Character Progression and Spell Slot Tracking
- `foundryvtt/dnd5e` — 5e schema and progression reference
- `5e-bits/5e-database` — SRD 5.1 JSON data foundation
- `avrae/avrae` — Combat automation and sheet sync patterns
- `Kreozot/dnd5e-spells` — Spell dataset for spell slot tracking
- `andreafra/dnd-spellbook` — Spellbook UI implementation
- `DovarFalcone/bag-of-holding` — Inventory and encumbrance management
- `manuartero/dnd-beginner-character-sheet-5e-2024` — 2024 character sheet reference
- `Zero-AI-Hub/dnd5e-character-manager` — Character sheet API patterns
- `gabrielaraujof/char-manager-api` — CRUD actor state management
- `volnuttz/5.5e-companion` — 2024/5.5e revision support
- `ryanfp/otm.5etools-homebrew` — Homebrew schema handling
- `TheGiddyLimit/5etools-utils` — Data parsing utilities for character data
- `kgevans3rd/byo-rulebook` — Rulebook presentation layer
- `rodrigues-joaog/rpgSheet` — Reactive sheet implementation
- `FernDragonborn/charnik` — Character builder patterns
- `NatsumeAoii/dnd5e-quickref` — Rules quick-reference data
- `ironmonk33/5e-srd-api` — Local Express rules API reference
- `IamFlowZ/dnd-graphql` — GraphQL RPG schema patterns
- `justinritchie/dnd-rules-mcp-server` — MCP rules server implementation
- `josdejong/mathjs` — Safe math formula evaluation for ability checks

### Client-side PDF Ingestion into Markdown Compendiums
- `hunter-read/grimoire` — Directory crawling and asset hashing
- `UniversalVTT/UniversalVTT` — UVTT/dd2vtt parser integration
- `PSPDFKit/pdf-to-markdown` — PDF to Markdown conversion engine
- `sindresorhus/file-type` — Magic byte validation for file type detection
- `crowbartools/TokenStamp` — Token rim generation for asset processing
- `RPTools/TokenTool` — Token border mask logic
- `Durtur/Dungeoneer` — Map tile slicing for PDF assets
- `samcf/ogres` — Compendium packaging utilities
- `M-ybeme/Worldbinder` — Asset tagging and metadata extraction

### Multi-device Companion Reconnects Without Losing Room Authentication
- `yjs/yjs` — CRDT real-time sync for state reconciliation
- `automerge/automerge` — Local-first state sync with conflict resolution
- `peers/peerjs` — WebRTC P2P networking for direct connections
- `webrtc/samples` — WebRTC reference implementations
- `IvanMathy/diecast-companion` — Companion screen mirroring patterns
- `brian-gates/dnd-digital-companion` — Mobile sheet sync implementation
- `jrmi/airboardgame` — Turn synchronization for state consistency
- `repeated-pleasant-games/tabletop` — P2P state sync protocols
- `bengo501/GameMasterCompanionApp` — Companion app sync patterns
- `Nolat/virtual-dnd-next` — Socket room state management

---
'@