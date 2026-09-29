// frontend/src/lib/services/ingest/preClassifyWorkerClient.ts
// Background pre-classification client for the ingestion pipeline.
//
// Instantiates `ingestionWorker.ts` as a real Web Worker (Vite `?worker`
// import) and binds incoming jobs to it, so magic-byte sniffing, two-column
// layout cleaning, and schema validation run off the main thread. Corrupt or
// unsupported files resolve `{ status: 'failed', error }` through the same
// error boundary instead of throwing unhandled rejections.

import type {
  IngestionCompleteEvent,
  IngestionProgressEvent,
  IngestionWorkerTask,
} from '../../workers/ingestionWorker';

export interface PreClassifySuccess {
  status: 'classified';
  fileName: string;
  detectedFormat: string;
  chunksCount: number;
  entitiesCount: number;
}

export interface PreClassifyFailure {
  status: 'failed';
  fileName: string;
  error: string;
}

export type PreClassifyResult = PreClassifySuccess | PreClassifyFailure;

type ProgressCallback = (percent: number, message: string) => void;

let worker: Worker | null = null;
let workerInitFailed = false;
let seq = 0;

function workerSupported(): boolean {
  return typeof window !== 'undefined' && typeof window.Worker !== 'undefined';
}

/**
 * Lazily creates the singleton ingestion worker. Returns null when workers
 * are unsupported (SSR) or a previous instantiation failed, letting callers
 * fall back to main-thread routing.
 */
function getWorker(): Worker | null {
  if (!workerSupported() || workerInitFailed) return null;
  if (worker) return worker;

  try {
    // Vite worker import — bundles `ingestionWorker.ts` as a separate chunk.
    worker = new Worker(new URL('../../workers/ingestionWorker.ts', import.meta.url), {
      type: 'module',
    });
    return worker;
  } catch (err) {
    console.warn('[PreClassifyWorker] Failed to instantiate ingestion worker:', err);
    workerInitFailed = true;
    return null;
  }
}

/** Tears down the singleton worker (queue cleared / HMR / tests). */
export function terminatePreClassifyWorker(): void {
  try {
    worker?.terminate();
  } catch {
    // ignore teardown races
  }
  worker = null;
}

function readAsArrayBuffer(file: File | Blob): Promise<ArrayBuffer> {
  if (typeof (file as File).arrayBuffer === 'function') {
    return (file as File).arrayBuffer();
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = () => reject(reader.error ?? new Error('Failed to read file bytes'));
    reader.readAsArrayBuffer(file);
  });
}


/**
 * Runs background pre-classification for one file inside the ingestion worker.
 *
 * Resolves `{ status: 'classified', ... }` on success. Rejects only when no
 * worker is available (caller falls back to main-thread routing) or the
 * worker itself errors/times out (caller degrades the same way). Unreadable
 * file bytes reject with a descriptive error the caller records as failed.
 */
export function preClassifyWithWorker(
  file: File | Blob,
  fileName: string,
  onProgress?: ProgressCallback,
  timeoutMs = 30000
): Promise<PreClassifySuccess> {
  const active = getWorker();
  if (!active) {
    return Promise.reject(new Error('Ingestion worker unavailable'));
  }

  return new Promise<PreClassifySuccess>((resolve, reject) => {
    let settled = false;
    const taskId = `pre-${Date.now()}-${seq++}`;

    const cleanup = () => {
      active.removeEventListener('message', onMessage);
      active.removeEventListener('error', onError);
      window.clearTimeout(timer);
    };
    const settleResolve = (value: PreClassifySuccess) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(value);
    };
    const settleReject = (err: Error) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(err);
    };

    const timer = window.setTimeout(() => {
      settleReject(new Error(`Pre-classification timed out for ${fileName}`));
    }, timeoutMs);

    const onError = (event: ErrorEvent) => {
      settleReject(new Error(event.message || `Worker error while pre-classifying ${fileName}`));
    };

    const onMessage = (event: MessageEvent<IngestionProgressEvent | IngestionCompleteEvent>) => {
      const data = event.data;
      if (!data || typeof data !== 'object') return;

      if (data.type === 'PROGRESS' && 'fileName' in data && data.fileName === fileName) {
        onProgress?.(data.progressPercent ?? 0, data.currentStep ?? 'Pre-classifying…');
        return;
      }

      if (data.type === 'COMPLETE') {
        const match = data.results?.find((r) => r.fileName === fileName);
        if (match) {
          settleResolve({
            status: 'classified',
            fileName,
            detectedFormat: match.detectedFormat,
            chunksCount: match.chunksCount,
            entitiesCount: match.entitiesCount,
          });
          return;
        }
        const artifact = data.unparsedArtifacts?.find((a) => a.fileName === fileName);
        if (artifact) {
          settleReject(new Error(artifact.error || `Worker could not parse ${fileName}`));
        }
      }
    };

    active.addEventListener('message', onMessage);
    active.addEventListener('error', onError);

    readAsArrayBuffer(file).then(
      (buffer) => {
        if (settled) return;
        const task: IngestionWorkerTask = { id: taskId, name: fileName, buffer };
        try {
          active.postMessage({ tasks: [task] }, [buffer]);
        } catch (err) {
          settleReject(err instanceof Error ? err : new Error(String(err)));
        }
      },
      (err) => {
        settleReject(err instanceof Error ? err : new Error(`Cannot read ${fileName}: ${String(err)}`));
      }
    );
  });
}

/**
 * Convenience wrapper that never rejects: corrupt files resolve
 * `{ status: 'failed', error }` so queue processors can record the failure
 * without an unhandled rejection.
 */
export async function tryPreClassify(
  file: File | Blob,
  fileName: string,
  onProgress?: ProgressCallback
): Promise<PreClassifyResult> {
  try {
    return await preClassifyWithWorker(file, fileName, onProgress);
  } catch (err) {
    return {
      status: 'failed',
      fileName,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
