// verifyParsers.test.ts — Automated verification script for Dungeon Scrawl and Watabou vector map parsers
import {
  parseDungeonScrawl,
  toggleDoorState,
  hitTestDoor,
  getActiveOccluders,
  convertToTacticalWalls,
  generateSampleDungeonScrawlJson,
} from './parsers/dungeonScrawlParser';
import {
  parseWatabouGeoJson,
  hitTestBuildingParcel,
  assignParcelEntity,
  pointInPolygon,
  generateSampleWatabouGeoJson,
} from './parsers/watabouParser';
import {
  buildVisibilitySegments,
  computeVisionPolygon,
  createPixiWallGraphics,
  createPixiShadowMask,
  createPixiWatabouContainer,
} from './LightShadowRenderer';

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`Assertion Failed: ${message}`);
  }
}

async function runTests() {
  console.log('--- 1. Testing Dungeon Scrawl Parser ---');
  const rawDs = generateSampleDungeonScrawlJson();
  const dsMap = parseDungeonScrawl(rawDs, 60);

  console.log(`Parsed DS Map: "${dsMap.name}", GridSize: ${dsMap.gridSize}, Walls: ${dsMap.walls.length}, Doors: ${dsMap.doors.length}`);
  assert(dsMap.walls.length >= 10, 'Expected at least 10 wall segments in sample DS map');
  assert(dsMap.doors.length === 2, 'Expected 2 doors in sample DS map');
  assert(dsMap.gridSize === 60, 'Expected grid size normalized to 60');

  // Test door states and toggling
  const door1 = dsMap.doors[0];
  assert(door1.state === 'CLOSED', 'Sample door 1 should initially be CLOSED');
  const toggledDoors = toggleDoorState(dsMap.doors, door1.id);
  const updatedDoor1 = toggledDoors.find(d => d.id === door1.id);
  assert(updatedDoor1?.state === 'OPEN', 'Door 1 should now be OPEN after toggle');

  // Test door hit-testing
  const doorMidX = (door1.x1 + door1.x2) / 2;
  const doorMidY = (door1.y1 + door1.y2) / 2;
  const hit = hitTestDoor(dsMap.doors, doorMidX, doorMidY, 20);
  assert(hit?.id === door1.id, 'hitTestDoor should find door at its midpoint');
  const miss = hitTestDoor(dsMap.doors, doorMidX + 1000, doorMidY + 1000, 20);
  assert(miss === null, 'hitTestDoor should return null for out-of-range coords');

  // Test active occluders
  const closedOccluders = getActiveOccluders(dsMap.walls, dsMap.doors);
  const openOccluders = getActiveOccluders(dsMap.walls, toggledDoors);
  assert(closedOccluders.length === dsMap.walls.length + 2, 'Closed doors must be included in raycast occluders');
  assert(openOccluders.length === dsMap.walls.length + 1, 'Open door should not occlude raycast');

  // Test conversion to generic tactical walls
  const tacticalWalls = convertToTacticalWalls(dsMap);
  assert(tacticalWalls.length === dsMap.walls.length + dsMap.doors.length, 'Tactical walls count should match total walls + doors');
  console.log('✓ Dungeon Scrawl Parser tests passed completely.');

  console.log('\n--- 2. Testing Watabou GeoJSON Ingestion ---');
  const rawGeo = generateSampleWatabouGeoJson();
  const cityMap = parseWatabouGeoJson(rawGeo);

  console.log(`Parsed Watabou City: "${cityMap.name}", Districts: ${cityMap.districts.length}, Roads: ${cityMap.roads.length}, Walls: ${cityMap.walls.length}, Buildings: ${cityMap.buildings.length}`);
  assert(cityMap.districts.length === 3, 'Expected 3 districts in sample Watabou city');
  assert(cityMap.buildings.length === 4, 'Expected 4 buildings in sample Watabou city');
  assert(cityMap.roads.length >= 1, 'Expected roads in sample Watabou city');
  assert(cityMap.walls.length >= 1, 'Expected walls in sample Watabou city');

  // Test pointInPolygon
  const testParcel = cityMap.buildings[0];
  const insideX = (testParcel.bounds.minX + testParcel.bounds.maxX) / 2;
  const insideY = (testParcel.bounds.minY + testParcel.bounds.maxY) / 2;
  assert(pointInPolygon(insideX, insideY, testParcel.points), 'Centroid should be inside test building polygon');
  assert(!pointInPolygon(insideX + 1000, insideY + 1000, testParcel.points), 'Far point should be outside polygon');

  // Test building hit-test
  const hitBldg = hitTestBuildingParcel(cityMap.buildings, insideX, insideY);
  assert(hitBldg?.id === testParcel.id, 'hitTestBuildingParcel should detect building at centroid');

  // Test entity assignment
  const updatedBuildings = assignParcelEntity(cityMap.buildings, testParcel.id, {
    entityType: 'Tavern',
    customName: 'The Salty Anchor',
    notes: 'A bustling harborside tavern.',
    npcContact: 'Barkeep Harlen',
  });
  const assigned = updatedBuildings.find(b => b.id === testParcel.id);
  assert(assigned?.entityType === 'Tavern', 'Parcel should have Tavern entityType assigned');
  assert(assigned?.customName === 'The Salty Anchor', 'Parcel should have custom name set');
  assert(assigned?.npcContact === 'Barkeep Harlen', 'Parcel should have NPC contact set');
  console.log('✓ Watabou GeoJSON Ingestion tests passed completely.');

  console.log('\n--- 3. Testing Raycast Visibility & Shadow Generation ---');
  const segments = buildVisibilitySegments(dsMap.walls, dsMap.doors);
  assert(segments.length >= dsMap.walls.length, 'Segments list should include all wall and closed door segments');

  const origin = { x: 120, y: 120 };
  const radius = 300;
  const poly = computeVisionPolygon(origin, radius, dsMap.walls, dsMap.doors);
  console.log(`Computed Vision Polygon vertices count: ${poly.length}`);
  assert(poly.length >= 3, 'Vision polygon must form a closed polygon with at least 3 vertices');

  // Test PixiJS v8 Graphic objects generation
  console.log('\n--- 4. Testing PixiJS v8 Graphics Construction ---');
  const pixiWalls = createPixiWallGraphics(dsMap.walls, dsMap.doors);
  assert(pixiWalls !== null && typeof pixiWalls === 'object', 'Pixi wall graphics created successfully');

  const visionSources = [{ id: 'test-tok', x: 120, y: 120, radius: 300 }];
  const pixiMask = createPixiShadowMask(visionSources, dsMap.walls, dsMap.doors);
  assert(pixiMask.blendMode === 'erase', 'Pixi shadow mask should use erase blend mode');

  const pixiCity = createPixiWatabouContainer(cityMap, testParcel.id);
  assert(pixiCity.children.length === 4, 'Pixi Watabou container should contain 4 child graphic layers');
  console.log('✓ PixiJS v8 Graphics generation tests passed completely.');

  console.log('\n========================================');
  console.log('ALL TESTS PASSED WITH 100% SPEC COMPLIANCE!');
  console.log('========================================');
}

import { describe, it } from 'vitest';

describe('Dungeon Scrawl & Watabou Parser Verification', () => {
  it('passes all parser, raycast visibility, and PixiJS generation tests', async () => {
    await runTests();
  });
});
