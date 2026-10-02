<!-- frontend/src/lib/components/source/SourceViewerModal.svelte -->
<!-- Embedded PDF sourcebook viewer jumping to provenance page with bounding-box highlight -->
<script lang="ts">
  import { resolveAssetUrl } from '../../services/assetUrlResolver';
  import { tableStore } from '../../stores/tableStore';

  let canvasRef: HTMLCanvasElement | null = $state(null);
  let pdfDoc: any = $state(null);
  let totalPages = $state<number>(1);
  let currentPage = $state<number>(1);
  let scale = $state<number>(1.25);
  let isLoading = $state<boolean>(false);
  let renderError = $state<string | null>(null);

  const viewer = $derived(tableStore.sourceViewer);
  const isOpen = $derived(viewer.isOpen);
  const sourceFileRel = $derived(viewer.sourceFileRel);
  const targetPage = $derived(viewer.pageNumber);
  const highlightBox = $derived(viewer.highlightBox);

  // Sync target page when modal opens
  $effect(() => {
    if (isOpen && targetPage) {
      currentPage = targetPage;
    }
  });

  // Load PDF document when modal opens with a file
  $effect(() => {
    if (isOpen && sourceFileRel) {
      loadDocument(sourceFileRel);
    }
  });

  // Render page when currentPage, scale, or doc changes
  $effect(() => {
    if (pdfDoc && canvasRef && currentPage > 0) {
      renderPage(currentPage);
    }
  });

  async function loadDocument(relPath: string) {
    isLoading = true;
    renderError = null;
    try {
      const pdfjsLib = await import('pdfjs-dist');
      if (!pdfjsLib.GlobalWorkerOptions.workerSrc) {
        try {
          const workerMod = await import('pdfjs-dist/build/pdf.worker.min.mjs?url');
          pdfjsLib.GlobalWorkerOptions.workerSrc = workerMod.default;
        } catch {
          pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version || '4.0.379'}/build/pdf.worker.min.mjs`;
        }
      }

      const fileUrl = resolveAssetUrl(relPath);
      const loadingTask = pdfjsLib.getDocument({ url: fileUrl });
      pdfDoc = await loadingTask.promise;
      totalPages = pdfDoc.numPages;
      if (currentPage > totalPages) {
        currentPage = 1;
      }
    } catch (err: unknown) {
      console.error('Failed to load PDF source document:', err);
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

      // Draw bounding box highlight if specified
      if (highlightBox) {
        ctx.save();
        ctx.fillStyle = 'rgba(234, 179, 8, 0.25)'; // Amber highlight
        ctx.strokeStyle = 'rgba(234, 179, 8, 0.9)';
        ctx.lineWidth = 2;

        const boxX = highlightBox.x * scale;
        const boxY = highlightBox.y * scale;
        const boxW = highlightBox.width * scale;
        const boxH = highlightBox.height * scale;

        ctx.fillRect(boxX, boxY, boxW, boxH);
        ctx.strokeRect(boxX, boxY, boxW, boxH);
        ctx.restore();
      }
    } catch (err: unknown) {
      console.warn('Page render error:', err);
    }
  }

  function prevPage() {
    if (currentPage > 1) {
      currentPage -= 1;
    }
  }

  function nextPage() {
    if (currentPage < totalPages) {
      currentPage += 1;
    }
  }

  function zoomIn() {
    scale = Math.min(3.0, scale + 0.25);
  }

  function zoomOut() {
    scale = Math.max(0.75, scale - 0.25);
  }

  function closeModal() {
    tableStore.closeSourceViewer();
  }
</script>

{#if isOpen}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
  <div
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-200"
    role="dialog"
    aria-modal="true"
    tabindex="-1"
    onclick={closeModal}
  >
    <!-- Modal Window -->
    <div
      role="dialog"
      aria-modal="true"
      tabindex="-1"
      class="bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl flex flex-col overflow-hidden w-full max-w-5xl h-[90vh]"
      onclick={(e) => e.stopPropagation()}
      onkeydown={(e) => e.stopPropagation()}
    >
      <!-- Header Toolbar -->
      <div class="px-5 py-3.5 bg-slate-800/90 border-b border-slate-700 flex items-center justify-between gap-4">
        <div class="flex items-center gap-3 min-w-0">
          <div class="w-8 h-8 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
            <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
            </svg>
          </div>
          <div class="truncate">
            <h3 class="text-sm font-semibold text-slate-100 truncate">Source Provenance Viewer</h3>
            <p class="text-xs text-slate-400 font-mono truncate">{sourceFileRel}</p>
          </div>
        </div>

        <!-- Navigation & Zoom Controls -->
        <div class="flex items-center gap-2">
          <!-- Page pagination -->
          <div class="flex items-center bg-slate-950/60 border border-slate-700 rounded-lg px-2 py-1 gap-2 text-xs text-slate-300">
            <button
              class="p-1 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed"
              onclick={prevPage}
              disabled={currentPage <= 1}
              title="Previous Page"
            >
              ◀
            </button>
            <span>
              Page <span class="font-bold text-amber-400">{currentPage}</span> / {totalPages}
            </span>
            <button
              class="p-1 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed"
              onclick={nextPage}
              disabled={currentPage >= totalPages}
              title="Next Page"
            >
              ▶
            </button>
          </div>

          <!-- Zoom -->
          <div class="flex items-center bg-slate-950/60 border border-slate-700 rounded-lg px-2 py-1 gap-2 text-xs text-slate-300">
            <button class="hover:text-white" onclick={zoomOut} title="Zoom Out">−</button>
            <span class="w-10 text-center font-mono">{Math.round(scale * 100)}%</span>
            <button class="hover:text-white" onclick={zoomIn} title="Zoom In">+</button>
          </div>

          <!-- Close -->
          <button
            class="p-1.5 rounded-lg bg-slate-700/60 hover:bg-slate-700 text-slate-400 hover:text-white transition"
            onclick={closeModal}
            title="Close Viewer"
          >
            ✕
          </button>
        </div>
      </div>

      <!-- Viewer Body -->
      <div class="flex-1 bg-slate-950 overflow-auto flex items-center justify-center p-6 relative">
        {#if isLoading}
          <div class="flex flex-col items-center gap-3 text-slate-400">
            <div class="w-8 h-8 border-2 border-amber-500 border-t-transparent rounded-full animate-spin"></div>
            <p class="text-sm">Loading sourcebook PDF page...</p>
          </div>
        {:else if renderError}
          <div class="bg-red-500/10 border border-red-500/30 rounded-xl p-6 text-center max-w-md">
            <p class="text-red-400 font-semibold mb-1">Failed to load source document</p>
            <p class="text-xs text-slate-400 font-mono">{renderError}</p>
          </div>
        {/if}

        <canvas
          bind:this={canvasRef}
          class="rounded-lg shadow-2xl border border-slate-800 transition-transform duration-100 {isLoading ? 'hidden' : 'block'}"
        ></canvas>
      </div>
    </div>
  </div>
{/if}
