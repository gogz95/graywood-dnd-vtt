// src/lib/services/ingest/ingestPipelineStore.svelte.ts
// Svelte 5 Rune-based Universal Ingestion Pipeline Store

import { classifyAsset } from './assetClassifier';
import { routeAsset } from './subsystemRouter';
import { compendiumDb } from '../../db/compendiumDb';
import { notifyMonstersUpdated } from '../ingestPipeline';
import type {
  AssetCategory,
  IngestQueueItem,
  IngestScanResult,
  IngestScanEntry,
} from './ingestTypes';

function isTauriEnvironment(): boolean {
  return typeof window !== 'undefined' && ('__TAURI_INTERNALS__' in window || '__TAURI__' in window);
}

class IngestPipelineStore {
  queue = $state<IngestQueueItem[]>([]);
  isScanning = $state(false);
  isProcessing = $state(false);
  activeFilter = $state<string>('all');
  errorMessage = $state<string | null>(null);
  lastScanRoot = $state<string | null>(null);

  // Derived Statistics
  totalCount = $derived(this.queue.length);
  queuedCount = $derived(this.queue.filter((i) => i.status === 'queued').length);
  processingCount = $derived(this.queue.filter((i) => i.status === 'processing').length);
  doneCount = $derived(this.queue.filter((i) => i.status === 'done').length);
  errorCount = $derived(this.queue.filter((i) => i.status === 'error').length);

  filteredQueue = $derived(
    this.activeFilter === 'all'
      ? this.queue
      : this.queue.filter((i) => i.category === this.activeFilter)
  );

  overallProgressPercent = $derived.by(() => {
    if (this.queue.length === 0) return 0;
    const completedOrFailed = this.doneCount + this.errorCount;
    return Math.round((completedOrFailed / this.queue.length) * 100);
  });

  categoryCounts = $derived.by<Record<AssetCategory, number>>(() => ({
    source: this.queue.filter((i) => i.category === 'source').length,
    image: this.queue.filter((i) => i.category === 'image').length,
    audio: this.queue.filter((i) => i.category === 'audio').length,
    video: this.queue.filter((i) => i.category === 'video').length,
  }));

  /**
   * Scans campaign directory or user-selected folder via Rust crawler.
   */
  async scanCampaignFolder(path?: string): Promise<IngestScanResult | null> {
    this.isScanning = true;
    this.errorMessage = null;

    try {
      let scanResult: IngestScanResult | null = null;

      if (isTauriEnvironment()) {
        try {
          const tauri = (window as any).__TAURI__;
          if (tauri?.core?.invoke) {
            scanResult = await tauri.core.invoke('scan_ingest_directory', {
              target_path: path,
            });
          }
        } catch (ipcErr) {
          console.warn('Tauri IPC scan failed, falling back to REST endpoint:', ipcErr);
        }
      }

      if (!scanResult) {
        const res = await fetch('/api/campaign/ingest/scan', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ path: path || null }),
        });

        if (!res.ok) {
          throw new Error(`Folder scan failed: ${res.statusText}`);
        }
        scanResult = await res.json();
      }

      if (scanResult && scanResult.entries) {
        this.lastScanRoot = scanResult.root_path;
        this.addScannedEntries(scanResult.entries);
      }

      return scanResult;
    } catch (err: any) {
      this.errorMessage = err?.message || 'Failed to scan ingest folder';
      return null;
    } finally {
      this.isScanning = false;
    }
  }

  /**
   * Adds files discovered by the native crawler into the ingestion queue.
   */
  addScannedEntries(entries: IngestScanEntry[]): void {
    const existingPaths = new Set(this.queue.map((q) => q.relativePath));
    const newItems: IngestQueueItem[] = [];

    for (const entry of entries) {
      if (existingPaths.has(entry.relative_path)) continue;

      newItems.push({
        id: `ingest-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        name: entry.name,
        relativePath: entry.relative_path,
        fullPath: entry.full_path,
        category: entry.category,
        extension: entry.extension,
        sizeBytes: entry.size_bytes,
        mimeType: entry.mime_type,
        status: 'queued',
        progress: 0,
      });
    }

    this.queue = [...this.queue, ...newItems];
  }

  /**
   * Adds flat or batch files selected from drag-and-drop or file browsing.
   */
  addFiles(files: FileList | File[]): void {
    const fileArray = Array.from(files);
    const newItems: IngestQueueItem[] = [];

    for (const file of fileArray) {
      const ext = file.name.split('.').pop()?.toLowerCase() || '';
      const category = classifyAsset(file.name, file.type);

      newItems.push({
        id: `ingest-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        name: file.name,
        relativePath: file.name,
        category,
        extension: ext,
        sizeBytes: file.size,
        mimeType: file.type,
        file,
        status: 'queued',
        progress: 0,
      });
    }

    this.queue = [...this.queue, ...newItems];
  }

  /**
   * Non-blocking queue processor with concurrency.
   */
  async startIngestion(concurrency = 2): Promise<void> {
    if (this.isProcessing) return;
    this.isProcessing = true;

    try {
      while (true) {
        const queuedItems = this.queue.filter((item) => item.status === 'queued');
        if (queuedItems.length === 0) break;

        // Take batch of items up to concurrency limit
        const batch = queuedItems.slice(0, concurrency);

        await Promise.all(
          batch.map(async (item) => {
            item.status = 'processing';
            item.progress = 10;
            item.message = 'Initializing subsystem routing...';

            try {
              const result = await routeAsset(item, (percent, msg) => {
                item.progress = percent;
                item.message = msg;
              });

              item.status = 'done';
              item.progress = 100;
              item.message = result.summary;
              item.resultSummary = result.summary;
            } catch (err: any) {
              item.status = 'error';
              item.progress = 100;
              item.error = err?.message || 'Ingestion routing failed';
            }
          })
        );
      }
    } finally {
      this.isProcessing = false;
      await notifyMonstersUpdated();
    }
  }

  /**
   * Removes finished items from the queue.
   */
  clearCompleted(): void {
    this.queue = this.queue.filter(
      (item) => item.status !== 'done' && item.status !== 'error'
    );
  }

  /**
   * Clears the entire queue.
   */
  clearAll(): void {
    this.queue = [];
  }

  /**
   * Hard Reset Compendium Cache:
   * Confirmation-gated purge that clears parsed user compendium records from Dexie
   * while preserving campaign disk files.
   */
  async hardResetCompendiumCache(): Promise<void> {
    await compendiumDb.transaction(
      'rw',
      [
        compendiumDb.spells,
        compendiumDb.subclasses,
        compendiumDb.monsters,
        compendiumDb.facilities,
        compendiumDb.media,
        compendiumDb.ingestedTables,
      ],
      async () => {
        await compendiumDb.spells.where('origin').equals('USER_IMPORT').delete();
        await compendiumDb.subclasses.where('origin').equals('USER_IMPORT').delete();
        await compendiumDb.monsters.where('origin').equals('USER_IMPORT').delete();
        await compendiumDb.facilities.where('origin').equals('USER_IMPORT').delete();
        await compendiumDb.media.clear();
        await compendiumDb.ingestedTables.clear();
      }
    );

    // Re-verify SRD 5.1 seeds
    await compendiumDb.ensureSrdBaseline();
    await notifyMonstersUpdated();
  }
}

export const ingestPipelineStore = new IngestPipelineStore();
