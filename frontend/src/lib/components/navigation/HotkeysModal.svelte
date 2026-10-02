<!-- frontend/src/lib/components/navigation/HotkeysModal.svelte -->
<!-- Tactical Keybindings Cheat Sheet (? / F1) with Categories: Navigation & View, Combat & Tokens, Tools & Layers -->

<script lang="ts">
  import { hotkeyManager } from '$lib/services/hotkeyManager';

  interface Props {
    isOpen?: boolean;
    onClose?: () => void;
  }

  let { isOpen = $bindable(false), onClose }: Props = $props();

  export function open() {
    isOpen = true;
  }

  export function close() {
    isOpen = false;
    onClose?.();
  }

  function handleKeyDown(e: KeyboardEvent) {
    if (!isOpen) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      close();
    }
  }

  interface ShortcutItem {
    key: string;
    action: string;
    desc: string;
  }

  const navigationShortcuts: ShortcutItem[] = [
    { key: 'Space + Drag', action: 'Pan Viewport', desc: 'Smooth drag pan across battle map or world atlas' },
    { key: 'Scroll Wheel', action: 'Camera Zoom', desc: 'Zoom in and out centered directly at cursor coordinates' },
    { key: 'F', action: 'Fit Map to View', desc: 'Resets zoom and centers current battle mat in view' },
    { key: 'F9', action: 'Projector Curtain', desc: 'Toggle cinematic privacy blackout mode on /projector' },
  ];

  const combatShortcuts: ShortcutItem[] = [
    { key: 'Tab', action: 'Next Turn', desc: 'Advance initiative to next active combatant in tracker' },
    { key: 'Shift + Tab', action: 'Previous Turn', desc: 'Step initiative backwards to prior combatant' },
    { key: 'Alt + Scroll', action: 'Step Elevation', desc: 'Rapidly adjust token altitude by ±5 ft (-100ft to +500ft)' },
    { key: 'Delete / Backspace', action: 'Remove Token', desc: 'Delete currently selected or hovered token from canvas' },
  ];

  const toolsShortcuts: ShortcutItem[] = [
    { key: 'R', action: 'Vector Ruler', desc: 'Measure tactical distances with 5e 5-10-5 Euclidean snapping' },
    { key: 'D', action: 'Door Toggle Mode', desc: 'Inspect, open, or close portcullises and dungeon doors' },
    { key: 'T', action: 'Target AoE / Token', desc: 'Toggle combat targeting reticle or spawn spell blast templates' },
    { key: 'Ctrl + K', action: 'Command Palette', desc: 'Instant search across 5e compendium spells, items & monsters' },
  ];
</script>

<svelte:window onkeydown={handleKeyDown} />

{#if isOpen}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <div
    class="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4 select-none animate-in fade-in duration-150"
    role="dialog"
    tabindex="-1"
    aria-modal="true"
    aria-label="Tactical Keybindings Cheat Sheet"
    onclick={close}
  >
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
    <div
      class="w-full max-w-2xl bg-slate-900 border border-slate-700/80 rounded-3xl p-6 shadow-2xl flex flex-col text-slate-100 cursor-default animate-in zoom-in-95 duration-200"
      onclick={(e) => e.stopPropagation()}
      role="document"
    >
      <!-- Header -->
      <div class="flex items-center justify-between pb-4 border-b border-slate-800">
        <div class="flex items-center gap-3">
          <div class="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-xl">
            ⌨️
          </div>
          <div>
            <h2 class="text-base font-bold text-white tracking-wide">Tactical Keybindings & Hotkeys</h2>
            <p class="text-xs text-slate-400 font-mono">DM Tabletop Ergonomics Cheat Sheet (Press ? or F1)</p>
          </div>
        </div>
        <button
          type="button"
          onclick={close}
          class="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          aria-label="Close Cheat Sheet"
        >
          ✕
        </button>
      </div>

      <!-- Categories Grid -->
      <div class="mt-4 space-y-5 overflow-y-auto max-h-[70vh] pr-1">
        <!-- 1. Navigation & View -->
        <div>
          <h3 class="text-xs uppercase font-mono font-bold text-cyan-400 tracking-wider flex items-center gap-2 mb-2">
            <span>🗺️</span>
            <span>Navigation & View</span>
          </h3>
          <div class="grid grid-cols-1 md:grid-cols-2 gap-2">
            {#each navigationShortcuts as s}
              <div class="flex items-center justify-between p-2.5 rounded-xl bg-slate-950/80 border border-slate-800">
                <div class="min-w-0 pr-2">
                  <span class="text-xs font-bold text-white block">{s.action}</span>
                  <span class="text-[10px] text-slate-400 block truncate">{s.desc}</span>
                </div>
                <kbd class="px-2 py-1 rounded-lg bg-slate-800 border border-slate-700 text-xs font-mono font-bold text-amber-300 shadow-sm flex-shrink-0">
                  {s.key}
                </kbd>
              </div>
            {/each}
          </div>
        </div>

        <!-- 2. Combat & Tokens -->
        <div>
          <h3 class="text-xs uppercase font-mono font-bold text-amber-400 tracking-wider flex items-center gap-2 mb-2">
            <span>⚔️</span>
            <span>Combat & Tokens</span>
          </h3>
          <div class="grid grid-cols-1 md:grid-cols-2 gap-2">
            {#each combatShortcuts as s}
              <div class="flex items-center justify-between p-2.5 rounded-xl bg-slate-950/80 border border-slate-800">
                <div class="min-w-0 pr-2">
                  <span class="text-xs font-bold text-white block">{s.action}</span>
                  <span class="text-[10px] text-slate-400 block truncate">{s.desc}</span>
                </div>
                <kbd class="px-2 py-1 rounded-lg bg-slate-800 border border-slate-700 text-xs font-mono font-bold text-amber-300 shadow-sm flex-shrink-0">
                  {s.key}
                </kbd>
              </div>
            {/each}
          </div>
        </div>

        <!-- 3. Tools & Layers -->
        <div>
          <h3 class="text-xs uppercase font-mono font-bold text-indigo-400 tracking-wider flex items-center gap-2 mb-2">
            <span>🛠️</span>
            <span>Tools & Layers</span>
          </h3>
          <div class="grid grid-cols-1 md:grid-cols-2 gap-2">
            {#each toolsShortcuts as s}
              <div class="flex items-center justify-between p-2.5 rounded-xl bg-slate-950/80 border border-slate-800">
                <div class="min-w-0 pr-2">
                  <span class="text-xs font-bold text-white block">{s.action}</span>
                  <span class="text-[10px] text-slate-400 block truncate">{s.desc}</span>
                </div>
                <kbd class="px-2 py-1 rounded-lg bg-slate-800 border border-slate-700 text-xs font-mono font-bold text-amber-300 shadow-sm flex-shrink-0">
                  {s.key}
                </kbd>
              </div>
            {/each}
          </div>
        </div>
      </div>

      <!-- Footer Note -->
      <div class="mt-5 pt-3 border-t border-slate-800 flex items-center justify-between text-[11px] font-mono text-slate-400">
        <span>Press <kbd class="px-1.5 py-0.5 rounded bg-slate-800 text-slate-300">Esc</kbd> to dismiss</span>
        <button
          type="button"
          onclick={close}
          class="px-4 py-1.5 bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs rounded-xl transition-colors"
        >
          Got it
        </button>
      </div>
    </div>
  </div>
{/if}
