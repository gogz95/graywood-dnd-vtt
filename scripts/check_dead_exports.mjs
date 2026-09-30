import fs from 'fs';
import path from 'path';

function getFiles(dir, exts = ['.ts', '.svelte']) {
  let res = [];
  if (!fs.existsSync(dir)) return res;
  for (const item of fs.readdirSync(dir)) {
    const p = path.join(dir, item);
    if (fs.statSync(p).isDirectory()) {
      if (item !== 'node_modules' && item !== 'dist' && item !== '.svelte-kit') {
        res.push(...getFiles(p, exts));
      }
    } else if (exts.some((e) => p.endsWith(e))) {
      res.push(p);
    }
  }
  return res;
}

export function auditDeadExports() {
  const rootSrc = path.resolve('frontend/src');
  const allSourceFiles = getFiles(rootSrc);
  const targetFiles = [
    ...getFiles(path.join(rootSrc, 'lib/canvas')),
    ...getFiles(path.join(rootSrc, 'lib/services')),
  ].filter((f) => !f.endsWith('.test.ts') && !f.endsWith('.spec.ts'));

  const fileContents = allSourceFiles.map((f) => ({
    path: f,
    content: fs.readFileSync(f, 'utf-8'),
  }));

  const unreferencedFiles = [];

  for (const target of targetFiles) {
    const baseName = path.basename(target).replace(/(\.svelte)?\.(ts|js)$/, '');
    const isReferenced = fileContents.some(({ path: otherPath, content }) => {
      if (otherPath === target) return false;
      return content.includes(baseName);
    });

    if (!isReferenced) {
      unreferencedFiles.push(target);
    }
  }

  return {
    unreferencedFiles,
    totalAudited: targetFiles.length,
  };
}

const result = auditDeadExports();
console.log(`[Dead Export Audit] Audited ${result.totalAudited} canvas/service modules.`);
if (result.unreferencedFiles.length > 0) {
  console.warn(`[Dead Export Audit] Found ${result.unreferencedFiles.length} disconnected files:`);
  result.unreferencedFiles.forEach((f) => console.warn(` - ${f}`));
} else {
  console.log('[Dead Export Audit] Clean! 0 disconnected symbols or entry points detected.');
}
