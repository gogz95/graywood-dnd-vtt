/// <reference lib="webworker" />

self.onmessage = async (e: MessageEvent<{ rawContent: string; sourceName: string }>) => {
  const { rawContent, sourceName } = e.data;
  const lines = rawContent.split(/\r?\n/);
  const total = lines.length;
  
  const extractedTables: Array<{ title: string; rows: string[][] }> = [];
  let currentTable: { title: string; rows: string[][] } | null = null;

  for (let i = 0; i < total; i++) {
    const line = lines[i].trim();
    if (line.startsWith('#')) {
      if (currentTable) extractedTables.push(currentTable);
      currentTable = { title: line.replace(/^#+\s*/, ''), rows: [] };
    } else if (line.startsWith('|') && currentTable) {
      const cols = line.split('|').map(c => c.trim()).filter(Boolean);
      if (cols.length > 0 && !cols[0].includes('---')) {
        currentTable.rows.push(cols);
      }
    }

    if (i % 200 === 0 || i === total - 1) {
      self.postMessage({ type: 'PROGRESS', percent: Math.round((i / total) * 100) });
    }
  }

  if (currentTable) extractedTables.push(currentTable);
  self.postMessage({ type: 'COMPLETE', sourceName, tables: extractedTables });
};

export {};
