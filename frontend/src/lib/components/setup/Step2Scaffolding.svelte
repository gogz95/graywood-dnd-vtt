<!-- src/lib/components/setup/Step2Scaffolding.svelte -->
<!-- Campaign Directory Verification & Auto-Scaffolding – Step 2 of Setup Wizard -->

<script lang="ts">
  import { campaignDirectoryStore } from "$lib/stores/campaignDirectoryStore.svelte";

  // ── Props ────────────────────────────────────────────────────────────────
  let {
    selectedDirectory = $bindable(),
    onDirectoryConfirmed,
  }: {
    selectedDirectory?: string | null;
    onDirectoryConfirmed?: (path: string) => void;
  } = $props();

  // ── Types ────────────────────────────────────────────────────────────────
  interface SubdirStatus {
    path: string;
    existed: boolean;
    created: boolean;
  }

  interface TriagedFile {
    filename: string;
    destination: string;
  }

  interface ScaffoldReport {
    root_path: string;
    subdirs: SubdirStatus[];
    triaged: TriagedFile[];
    triage_errors: string[];
  }

  // ── State ────────────────────────────────────────────────────────────────
  let isSelectingFolder = $state(false);
  let isVerifying = $state(false);
  let report = $state<ScaffoldReport | null>(null);
  let verifyError = $state<string | null>(null);
  let manualPath = $state("");
  let seedSrd = $state(true); // SRD 5.1 baseline seeding toggle

  $effect(() => {
    if (selectedDirectory && !manualPath) manualPath = selectedDirectory;
  });

  // ── Core logic ───────────────────────────────────────────────────────────
  async function runVerify(path: string): Promise<void> {
    if (!path.trim()) return;
    isVerifying = true;
    verifyError = null;
    report = null;

    try {
      const res = await fetch("/api/campaign/directory/verify-scaffold", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          root_path: path.trim(),
          seed_srd: seedSrd,
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as any).error ?? `HTTP ${res.status}`);
      }

      report = (await res.json()) as ScaffoldReport;
      selectedDirectory = path.trim();
      onDirectoryConfirmed?.(path.trim());
    } catch (err: any) {
      verifyError = err?.message ?? "Unknown error";
    } finally {
      isVerifying = false;
    }
  }

  async function handleBrowse(): Promise<void> {
    isSelectingFolder = true;
    try {
      const info = await campaignDirectoryStore.selectDirectory();
      if (info) {
        manualPath = info.root_path;
        await runVerify(info.root_path);
      }
    } catch (err: any) {
      verifyError = err?.message ?? "Failed to open folder picker";
    } finally {
      isSelectingFolder = false;
    }
  }

  // ── Display helpers ──────────────────────────────────────────────────────
  function subdirIcon(s: SubdirStatus): string {
    if (s.existed) return "✓";
    if (s.created) return "+";
    return "✕";
  }

  function subdirColor(s: SubdirStatus): string {
    if (s.existed) return "text-emerald-400";
    if (s.created) return "text-sky-400";
    return "text-rose-400";
  }

  const REQUIRED_SUBDIRS = [
    "Ingest/Source material",
    "Ingest/Image",
    "Ingest/Audio",
    "Ingest/Video",
    "maps",
    "tokens",
    "audio",
  ];

  let displaySubdirs = $derived<SubdirStatus[]>(
    report
      ? report.subdirs
      : REQUIRED_SUBDIRS.map((p) => ({
          path: p,
          existed: false,
          created: false,
        })),
  );
</script>

<div class="space-y-3">
  <h3 class="font-bold text-sm text-slate-200">
    Campaign Directory &amp; Auto-Scaffolding
  </h3>
  <p class="text-[11px] text-slate-400">
    Select or create a root folder on disk. Graywood VTT verifies all required
    subdirectories, creates any missing ones, and triages loose files by type.
  </p>

  <div class="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-3">
    <!-- Path row -->
    <div class="flex items-center justify-between gap-3">
      <div class="truncate flex-1">
        <span class="text-[10px] uppercase font-bold text-slate-400 block mb-1"
          >Active Campaign Root Folder</span
        >
        <input
          id="step2-manual-path"
          type="text"
          bind:value={manualPath}
          placeholder="Paste a path or click Browse…"
          class="w-full text-xs font-mono text-indigo-200 bg-slate-900 border border-slate-700/60 rounded px-2.5 py-1.5 focus:outline-none focus:border-indigo-500"
          onkeydown={(e) => {
            if (e.key === "Enter") runVerify(manualPath);
          }}
        />
      </div>
      <button
        type="button"
        onclick={handleBrowse}
        disabled={isSelectingFolder || isVerifying}
        id="step2-browse-btn"
        class="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-bold rounded-lg transition-colors flex items-center gap-1.5 self-end shrink-0 shadow"
      >
        <span>{isSelectingFolder ? "⏳" : "📁"}</span>
        <span>{isSelectingFolder ? "Selecting…" : "Browse…"}</span>
      </button>
    </div>

    <!-- SRD 5.1 Seeding Option -->
    <div
      class="flex items-start gap-2.5 p-3 rounded-lg bg-slate-900 border border-slate-800"
    >
      <input
        type="checkbox"
        id="seed-srd-checkbox"
        bind:checked={seedSrd}
        class="mt-0.5 rounded bg-slate-950 border-slate-700 text-indigo-600 focus:ring-indigo-500 w-4 h-4 cursor-pointer"
      />
      <label
        for="seed-srd-checkbox"
        class="text-xs text-slate-300 cursor-pointer select-none"
      >
        <span class="font-medium text-slate-200 block"
          >Seed 5e SRD 5.1 Core Rules Baseline</span
        >
        <span class="text-[10px] text-slate-400 block"
          >Populates 300+ SRD Spells, Subclasses, Monsters, and Facilities into
          the campaign database during setup.</span
        >
      </label>
    </div>

    <!-- Manual apply button (shown only before first verify) -->
    {#if manualPath && !report && !isVerifying}
      <button
        type="button"
        onclick={() => runVerify(manualPath)}
        id="step2-apply-path-btn"
        class="w-full py-1.5 text-xs font-bold bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg text-slate-300 transition-colors"
      >
        ↵ Verify &amp; Scaffold this path
      </button>
    {/if}

    <!-- Spinner -->
    {#if isVerifying}
      <div class="flex items-center gap-2 text-xs text-slate-400">
        <span class="animate-spin inline-block">⏳</span>
        <span>Verifying filesystem structure &amp; seeding compendium…</span>
      </div>
    {/if}

    <!-- Error -->
    {#if verifyError}
      <div
        class="p-2.5 rounded-lg bg-rose-950/60 border border-rose-800/60 text-rose-300 text-[11px] flex items-center gap-2"
      >
        <span>⚠️</span><span>{verifyError}</span>
      </div>
    {/if}

    <!-- Subdirectory status grid -->
    <div>
      <span class="text-[10px] uppercase font-bold text-slate-400 block mb-1.5">
        {report
          ? "Filesystem Verification Result"
          : "Required Campaign Subdirectories"}
      </span>
      <div class="grid grid-cols-2 gap-1.5 font-mono text-[10px]">
        {#each displaySubdirs as sub (sub.path)}
          <div
            class="flex items-center gap-1.5 px-2 py-1 bg-slate-900/80 rounded border
            {report
              ? sub.existed || sub.created
                ? 'border-slate-700'
                : 'border-rose-800/50'
              : 'border-slate-800'} text-slate-300 transition-colors"
          >
            <span
              class="font-bold shrink-0 {report
                ? subdirColor(sub)
                : 'text-slate-600'}"
            >
              {report ? subdirIcon(sub) : "○"}
            </span>
            <span class="truncate">{sub.path}/</span>
            {#if report && sub.created}
              <span class="ml-auto text-sky-500/80 text-[9px] shrink-0"
                >new</span
              >
            {/if}
          </div>
        {/each}
      </div>
    </div>

    <!-- Triage summary -->
    {#if report && report.triaged.length > 0}
      <div class="pt-1 border-t border-slate-800">
        <span
          class="text-[10px] uppercase font-bold text-slate-400 block mb-1.5"
        >
          Loose Files Triaged ({report.triaged.length})
        </span>
        <div class="space-y-0.5 max-h-24 overflow-y-auto pr-1">
          {#each report.triaged as f (f.filename)}
            <div
              class="flex items-center gap-1.5 font-mono text-[10px] text-slate-300"
            >
              <span class="text-sky-400 shrink-0">→</span>
              <span class="truncate flex-1">{f.filename}</span>
              <span class="text-slate-500 shrink-0">{f.destination}/</span>
            </div>
          {/each}
        </div>
      </div>
    {/if}

    <!-- Triage errors -->
    {#if report && report.triage_errors.length > 0}
      <div class="text-[10px] text-amber-400 font-mono space-y-0.5">
        {#each report.triage_errors as err}<div>⚠ {err}</div>{/each}
      </div>
    {/if}

    <!-- Success banner -->
    {#if report && !verifyError}
      <div
        class="p-2 rounded-lg bg-emerald-950/40 border border-emerald-700/40 text-emerald-300 text-[11px] flex items-center gap-2"
      >
        <span>✓</span><span>All directories verified &amp; campaign ready.</span
        >
      </div>
    {/if}
  </div>
</div>
