// src/lib/services/ingest/ingestTypes.ts
// Universal Ingestion Types and Subsystem Routing Definitions

export type AssetCategory = 'source' | 'image' | 'audio' | 'video';

export type IngestItemStatus = 'queued' | 'scanning' | 'processing' | 'done' | 'error';

export interface IngestScanEntry {
  name: string;
  relative_path: string;
  full_path?: string;
  category: AssetCategory;
  extension: string;
  size_bytes: number;
  mime_type: string;
}

export interface IngestScanResult {
  root_path: string;
  total_files: number;
  total_bytes: number;
  entries: IngestScanEntry[];
}

export interface IngestQueueItem {
  id: string;
  name: string;
  relativePath: string;
  fullPath?: string;
  category: AssetCategory;
  extension: string;
  sizeBytes: number;
  mimeType: string;
  file?: File | Blob;
  status: IngestItemStatus;
  progress: number; // 0 to 100
  message?: string;
  error?: string;
  resultSummary?: string;
}

export interface IngestCategorySummary {
  total: number;
  completed: number;
  failed: number;
}
