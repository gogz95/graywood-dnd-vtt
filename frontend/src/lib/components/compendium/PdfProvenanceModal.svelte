<!-- frontend/src/lib/components/compendium/PdfProvenanceModal.svelte -->
<!-- In-App PDF Provenance Viewer for compendium rules citations with exact page jumping & snippet highlighting -->
<script lang="ts">
  import { compendiumStore } from '../../stores/compendiumStore.svelte';
  import { resolveAssetUrl } from '../../services/assetUrlResolver';

  let canvasRef: HTMLCanvasElement | null = $state(null);
  let pdfDoc: any = $state(null);
  let totalPages = $state<number>(1);
  let currentPage = $state<number>(1);
  let scale = $state<number>(1.25);
  let isLoading = $state<boolean>(false);
  let renderError = $state<string | null>(null);
  let snippetText = $state<string | null>(null);

  const modal = $derived(compendiumStore.provenanceModal);
  const isOpen = $derived(modal.isOpen);
  const source = $derived(modal.source);
  const targetPage = $derived(modal.page);
  const exactMatch = $derived(modal.exactMatch);

  // Sync state when modal opens or targetPage changes
  $effect(() => {
    if (isOpen && targetPage) {
      currentPage = Math.max(1, targetPage);
    }
  });

  // Load document whenever source changes while modal is open
  $effect(() => {
    if (isOpen && source) {
      loadDocument(source);
      if (exactMatch) {
        fetchProvenanceSnippet(source, currentPage, exactMatch);
      } else {
        snippetText = null;
      }
    }
  });

  // Re-render canvas whenever page, scale, or doc changes
  $effect(() => {
    if (pdfDoc && canvasRef && currentPage > 0) {
      renderPage(currentPage);
    }
  });

  async function fetchProvenanceSnippet(sourcebookId: string, pageNum: number, term: string) {
    try {
      if (typeof window !== 'undefined') {
        const tauri = (window as unknown as {
          __TAURI__?: {
            core?: {
              invoke: <T>(cmd: string, args?: unknown) => Promise<T>;
            };
          };
        }).__TAURI__;

        if (tauri?.core?.invoke) {
          const res = await tauri.core.invoke<{ surrounding_text: string }>('get_provenance_snippet', {
            sourcebookId,
            pageNum,
            term,
          });
          if (res?.surrounding_text) {
            snippetText = res.surrounding_text;
          }
        }
      }
    } catch (e) {
      console.warn('Snippet fetch non-fatal error:', e);
    }
  }

  async function loadDocument(src: string) {
    isLoading = true;
    renderError = null;
    try {
      // 1. Try fetching PDF bytes directly from Tauri IPC get_pdf_page_image
      let docData: Uint8Array | null = null;
      if (typeof window !== 'undefined') {
        const tauri = (window as unknown as {
          __TAURI__?: {
            core?: {
              invoke: <T>(cmd: string, args?: unknown) => Promise<T>;
            };
          };
        }).__TAURI__;

        if (tauri?.core?.invoke) {
          try {
            const rawBytes = await tauri.core.invoke<number[]>('get_pdf_page_image', {
              sourcebookId: src,
              pageNum: currentPage,
            });
            if (rawBytes && rawBytes.length > 0) {
              docData = new Uint8Array(rawBytes);
            }
          } catch (ipcErr) {
            console.warn('get_pdf_page_image IPC fallback to asset protocol URL:', ipcErr);
          }
        }
      }

      const pdfjsLib = await import('pdfjs-dist');
      if (!pdfjsLib.GlobalWorkerOptions.workerSrc) {
        try {
          const workerMod = await import('pdfjs-dist/build/pdf.worker.min.mjs?url');
          pdfjsLib.GlobalWorkerOptions.workerSrc = workerMod.default;
        } catch {
          pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version || '4.0.379'}/build/pdf.worker.min.mjs`;
        }
      }

      const loadingTask = docData
        ? pdfjsLib.getDocument({ data: docData })
        : pdfjsLib.getDocument({ url: resolveAssetUrl(src) });

      pdfDoc = await loadingTask.promise;
      totalPages = pdfDoc.numPages || 1;
      if (currentPage > totalPages) {
        currentPage = 1;
      }
    } catch (err: unknown) {
      console.error('Failed to load PDF provenance document:', err);
      renderError = err instanceof Error ? err.message : String(err);
    } finally {
      isLoading = false;
    }
  }

  async function renderPage(pageNum: number) {
    if (!pdfDoc || !canvasRef) return;
    try {
      const page = await pdfDoc.getPage(pageNum);
      const viewport = page.getViewport({ scale });
      const ctx = canvasRef.getContext('2d');
      if (!ctx) return;

      canvasRef.width = viewport.width;
      canvasRef.height = viewport.height;

      await page.render({
        canvasContext: ctx,
        viewport,
      }).promise;
    } catch (err: unknown) {
      console.warn('Page render error:', err);
    }
  }

  function prevPage() {
    if (currentPage > 1) {
      currentPage -= 1;
      if (exactMatch && source) fetchProvenanceSnippet(source, currentPage, exactMatch);
    }
  }

  function nextPage() {
    if (currentPage < totalPages) {
      currentPage += 1;
      if (exactMatch && source) fetchProvenanceSnippet(source, currentPage, exactMatch);
    }
  }

  function zoomIn() {
    scale = Math.min(3.0, scale + 0.25);
  }

  function zoomOut() {
    scale = Math.max(0.75, scale - 0.25);
  }

  function closeModal() {
    compendiumStore.closeProvenanceModal();
  }

  function openInSystemViewer() {
    if (typeof window !== 'undefined' && source) {
      const fileUrl = resolveAssetUrl(source);
      window.open(fileUrl, '_blank');
    }
  }
</script>

<svelte:window onkeydown={(e) => { if (e.key === 'Escape' && isOpen) closeModal(); }} />

{#if isOpen}
  <!-- Backdrop -->
  <div
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-200"
    role="dialog"
    aria-modal="true"
    tabindex="-1"
    onclick={closeModal}
  >
    <!-- Modal Window (stops propagation) -->
    <div
      class="bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl flex flex-col overflow-hidden w-full max-w-5xl h-[90vh] text-slate-100"
      onclick={(e) => e.stopPropagation()}
    >
      <!-- Header Toolbar -->
      <div class="px-5 py-3.5 bg-slate-950/80 border-b border-slate-800 flex items-center justify-between gap-4 shrink-0">
        <div class="flex items-center gap-3 min-w-0">
          <span class="text-xl">📖</span>
          <div class="min-w-0">
            <h2 class="text-sm font-black text-slate-100 truncate flex items-center gap-2">
              <span>{source || 'Sourcebook Document'}</span>
              {#if exactMatch}
                <span class="px-2 py-0.5 rounded text-[10px] font-mono bg-amber-500/20 text-amber-300 border border-amber-500/40">
                  Citation: "{exactMatch}"
                </span>
              {/if}
            </h2>
            <p class="text-[11px] font-mono text-slate-400">
              Page {currentPage} of {totalPages}
            </p>
          </div>
        </div>

        <!-- Controls: Prev/Next, Zoom, Fallback External Viewer, Close -->
        <div class="flex items-center gap-2">
          <!-- Page Nav -->
          <div class="flex items-center bg-slate-800/80 rounded-lg p-0.5 border border-slate-700">
            <button
              type="button"
              onclick={prevPage}
              disabled={currentPage <= 1 || isLoading}
              class="px-2.5 py-1 text-xs font-semibold rounded hover:bg-slate-700 text-slate-300 disabled:opacity-40 disabled:hover:bg-transparent transition-colors"
              title="Previous Page"
            >
              ◀ Prev
            </button>
            <span class="px-2 text-xs font-mono text-slate-400">
              {currentPage} / {totalPages}
            </span>
            <button
              type="button"
              onclick={nextPage}
              disabled={currentPage >= totalPages || isLoading}
              class="px-2.5 py-1 text-xs font-semibold rounded hover:bg-slate-700 text-slate-300 disabled:opacity-40 disabled:hover:bg-transparent transition-colors"
              title="Next Page"
            >
              Next ▶
            </button>
          </div>

          <!-- Zoom Controls -->
          <div class="flex items-center bg-slate-800/80 rounded-lg p-0.5 border border-slate-700">
            <button
              type="button"
              onclick={zoomOut}
              class="px-2 py-1 text-xs font-bold text-slate-300 hover:bg-slate-700 rounded transition-colors"
              title="Zoom Out"
            >
              −
            </button>
            <span class="px-1.5 text-[11px] font-mono text-slate-400">
              {Math.round(scale * 100)}%
            </span>
            <button
              type="button"
              onclick={zoomIn}
              class="px-2 py-1 text-xs font-bold text-slate-300 hover:bg-slate-700 rounded transition-colors"
              title="Zoom In"
            >
              +
            </button>
          </div>

          <!-- Fallback: Open in Default System Viewer -->
          <button
            type="button"
            onclick={openInSystemViewer}
            class="px-3 py-1.5 text-xs font-semibold rounded-lg bg-indigo-950/80 hover:bg-indigo-900/80 text-indigo-300 border border-indigo-700/60 transition-colors flex items-center gap-1.5 shadow-sm"
            title="Open in Default System Viewer"
          >
            <span>↗</span> System Viewer
          </button>

          <!-- Close Button -->
          <button
            type="button"
            onclick={closeModal}
            class="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            aria-label="Close Viewer"
          >
            ✕
          </button>
        </div>
      </div>

      <!-- Provenance Snippet Banner (if exact match extracted from SQLite) -->
      {#if snippetText}
        <div class="px-5 py-2 bg-amber-950/40 border-b border-amber-900/50 flex items-center gap-2.5 text-xs text-amber-200/90 shrink-0">
          <span class="text-amber-400 font-bold shrink-0">📜 Provenance Snippet:</span>
          <p class="truncate font-mono italic">{snippetText}</p>
        </div>
      {/if}

      <!-- Canvas Viewport Body -->
      <div class="flex-1 overflow-auto bg-slate-950/90 flex items-start justify-center p-6 relative">
        {#if isLoading}
          <div class="absolute inset-0 flex flex-col items-center justify-center bg-slate-950/60 backdrop-blur-sm z-10">
            <div class="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
            <p class="text-xs font-semibold text-slate-400 mt-3">Decompressing & Rendering Page {currentPage}...</p>
          </div>
        {/if}

        {#if renderError}
          <div class="m-auto max-w-md p-6 bg-rose-950/60 border border-rose-800/80 rounded-xl text-center space-y-3">
            <span class="text-3xl">⚠️</span>
            <h3 class="text-sm font-bold text-rose-300">Document Render Notice</h3>
            <p class="text-xs text-rose-200/80 leading-relaxed">{renderError}</p>
            <button
              type="button"
              onclick={openInSystemViewer}
              class="px-4 py-1.5 bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold rounded-lg shadow transition-colors"
            >
              Open via System PDF Viewer
            </button>
          </div>
        {:else}
          <div class="shadow-2xl rounded-sm border border-slate-800 bg-white">
            <canvas bind:this={canvasRef} class="block max-w-none"></canvas>
          </div>
        {/if}
      </div>
    </div>
  </div>
{/if}
