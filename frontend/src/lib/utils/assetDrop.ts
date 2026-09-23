// assetDrop.ts — Global drag-and-drop asset ingestion utility
// Handles audio, images, and text/JSON files dropped anywhere on the window.

import { audioEngine } from '../audio/AudioEngine';

export type DropCategory = 'audio' | 'image' | 'map' | 'json' | 'text' | 'pdf' | 'unknown';

export interface DroppedAsset {
  category: DropCategory;
  fileName: string;
  url: string;   // Object URL (audio/image/map) or empty string (text/json handled in-line)
  data?: string; // text content for json/text files
  file?: File;
}

export type DropCallback = (asset: DroppedAsset) => void;

const AUDIO_EXTS = new Set(['.mp3', '.ogg', '.wav', '.flac', '.webm', '.m4a', '.aac']);
const IMAGE_EXTS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.svg', '.avif', '.bmp']);
const MAP_EXTS = new Set(['.dd2vtt', '.uvtt', '.geojson', '.map', '.ds']);

function ext(name: string): string {
  const idx = name.lastIndexOf('.');
  return idx >= 0 ? name.slice(idx).toLowerCase() : '';
}

function categorize(file: File): DropCategory {
  const e = ext(file.name);
  if (MAP_EXTS.has(e)) return 'map';
  if (AUDIO_EXTS.has(e)) return 'audio';
  if (IMAGE_EXTS.has(e)) return 'image';
  if (e === '.pdf' || file.type === 'application/pdf') return 'pdf';
  if (e === '.json') return 'json';
  if (e === '.txt' || e === '.md') return 'text';
  if (file.type.startsWith('audio/')) return 'audio';
  if (file.type.startsWith('image/')) return 'image';
  if (file.type === 'application/json') return 'json';
  if (file.type.startsWith('text/')) return 'text';
  return 'unknown';
}

async function processFile(file: File): Promise<DroppedAsset> {
  const category = categorize(file);

  if (category === 'audio' || category === 'image' || category === 'map') {
    const url = URL.createObjectURL(file);
    return { category, fileName: file.name, url, file };
  }

  if (category === 'json' || category === 'text') {
    const data = await file.text();
    return { category, fileName: file.name, url: '', data, file };
  }

  if (category === 'pdf') {
    const url = URL.createObjectURL(file);
    return { category, fileName: file.name, url, file };
  }

  return { category: 'unknown', fileName: file.name, url: '', file };
}

/**
 * Registers a global window drag-and-drop listener that:
 *   - Auto-registers dropped audio files into the AudioEngine track list
 *   - Calls the provided callback for each processed asset
 *
 * Returns a cleanup function to remove event listeners.
 */
export function registerGlobalDropZone(onDrop: DropCallback): () => void {
  let dragCounter = 0;

  function onDragEnter(e: DragEvent) {
    e.preventDefault();
    dragCounter++;
    document.body.classList.add('drop-active');
  }

  function onDragLeave(e: DragEvent) {
    e.preventDefault();
    dragCounter--;
    if (dragCounter <= 0) {
      dragCounter = 0;
      document.body.classList.remove('drop-active');
    }
  }

  function onDragOver(e: DragEvent) {
    e.preventDefault();
    if (e.dataTransfer) {
      e.dataTransfer.dropEffect = 'copy';
    }
  }

  async function onDropEvent(e: DragEvent) {
    e.preventDefault();
    dragCounter = 0;
    document.body.classList.remove('drop-active');

    if (!e.dataTransfer?.files?.length) return;

    const files = Array.from(e.dataTransfer.files);
    for (const file of files) {
      const asset = await processFile(file);

      // Auto-ingest audio into the AudioEngine ambience bus
      if (asset.category === 'audio') {
        const name = file.name.replace(/\.[^/.]+$/, '');
        audioEngine.addTrack({
          id: `track-dropped-${Date.now()}-${Math.random().toString(36).slice(2)}`,
          label: name,
          url: asset.url,
          loop: true,
          isAmbience: true,
        });
      }

      onDrop(asset);
    }
  }

  window.addEventListener('dragenter', onDragEnter);
  window.addEventListener('dragleave', onDragLeave);
  window.addEventListener('dragover', onDragOver);
  window.addEventListener('drop', onDropEvent);

  return () => {
    window.removeEventListener('dragenter', onDragEnter);
    window.removeEventListener('dragleave', onDragLeave);
    window.removeEventListener('dragover', onDragOver);
    window.removeEventListener('drop', onDropEvent);
    document.body.classList.remove('drop-active');
  };
}
