#!/usr/bin/env node
/**
 * purge-mockups.mjs — deletes mockup/placeholder asset files
 * Preserves: default_token.png, default_grid.png, fog_pattern.png
 * Usage: node scripts/purge-mockups.mjs [--dry-run]
 */
import { readdir, stat, rm, mkdir } from 'node:fs/promises';
import { join, basename, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const DRY_RUN = process.argv.includes('--dry-run');

const SCAN_ROOTS = ['frontend/public/assets', 'src-tauri/assets', 'campaign'];
const PRESERVE = new Set(['default_token.png', 'default_grid.png', 'fog_pattern.png']);
const MOCKUP_PATTERNS = [
  /^mockup[_-]/i, /[_-]mockup\./i,
  /^placeholder[_-]/i, /[_-]placeholder\./i,
  /^demo[_-]map/i, /^test[_-]asset/i,
  /^sample[_-](?!campaign)/i, /^dummy[_-]/i,
  /^fake[_-]/i, /^stub[_-]/i,
];

function isMockup(filename) {
  if (PRESERVE.has(filename)) return false;
  const lower = filename.toLowerCase();
  return MOCKUP_PATTERNS.some((re) => re.test(lower));
}

async function walk(dir, results = []) {
  let entries;
  try { entries = await readdir(dir); } catch { return results; }
  for (const entry of entries) {
    const full = join(dir, entry);
    let info;
    try { info = await stat(full); } catch { continue; }
    if (info.isDirectory()) await walk(full, results);
    else if (info.isFile() && isMockup(basename(full))) results.push(full);
  }
  return results;
}

async function main() {
  for (const rel of SCAN_ROOTS) await mkdir(join(ROOT, rel), { recursive: true }).catch(() => {});
  let found = 0, deleted = 0, skipped = 0;
  for (const rel of SCAN_ROOTS) {
    for (const file of await walk(join(ROOT, rel))) {
      found++;
      const display = relative(ROOT, file);
      if (DRY_RUN) { console.log(`[DRY-RUN] ${display}`); skipped++; }
      else {
        try { await rm(file, { force: true }); console.log(`Deleted: ${display}`); deleted++; }
        catch (e) { console.error(`Skip: ${display}: ${e.message}`); skipped++; }
      }
    }
  }
  console.log(`\nPurge: ${found} found, ${deleted} deleted, ${skipped} skipped. Roots: ${SCAN_ROOTS.join(', ')}`);
  if (found === 0) console.log('Asset tree is clean — no mockups found.');
}

main().catch((e) => { console.error(e); process.exit(1); });
