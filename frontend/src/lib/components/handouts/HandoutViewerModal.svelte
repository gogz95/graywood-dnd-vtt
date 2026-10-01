<!-- frontend/src/lib/components/handouts/HandoutViewerModal.svelte -->
<!-- Selective Markdown Block Handout Viewer with Public & Secret DC Block Reveals -->

<script lang="ts">
  import { projectorStore } from '$lib/stores/projectorStore.svelte';
  import { systemBus } from '$lib/services/systemBus';

  export interface HandoutBlock {
    id: string;
    type: 'public' | 'secret' | 'standard';
    content: string;
    dc?: number;
    skill?: string;
    isRevealed: boolean;
  }

  let {
    title = 'Ancient Inscription',
    content = '',
    imageUrl = null as string | null,
    isDm = true,
    onClose,
  }: {
    title?: string;
    content?: string;
    imageUrl?: string | null;
    isDm?: boolean;
    onClose: () => void;
  } = $props();

  let isCasting = $derived(
    projectorStore.castSource === 'handout' && projectorStore.activeHandout?.title === title
  );

  let parsedBlocks = $state<HandoutBlock[]>([]);

  // Parse custom markdown blocks: ::public ... :: and ::secret[dc=14, skill="Investigation"] ... ::
  export function parseSelectiveBlocks(markdown: string): HandoutBlock[] {
    const blocks: HandoutBlock[] = [];
    const blockRegex = /::(public|secret)(?:\[(.*?)\])?\s*([\s\S]*?)::/g;
    let lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = blockRegex.exec(markdown)) !== null) {
      // Any text prior to this block is standard markdown
      if (match.index > lastIndex) {
        const text = markdown.slice(lastIndex, match.index).trim();
        if (text) {
          blocks.push({
            id: `block_std_${blocks.length}`,
            type: 'standard',
            content: text,
            isRevealed: true,
          });
        }
      }

      const blockType = match[1] as 'public' | 'secret';
      const meta = match[2] || '';
      const blockContent = match[3].trim();

      let dc: number | undefined;
      let skill: string | undefined;

      if (meta) {
        const dcMatch = meta.match(/dc\s*=\s*(\d+)/i);
        if (dcMatch) dc = parseInt(dcMatch[1], 10);

        const skillMatch = meta.match(/skill\s*=\s*["']?([^"',\]]+)["']?/i);
        if (skillMatch) skill = skillMatch[1].trim();
      }

      blocks.push({
        id: `block_${blockType}_${blocks.length}`,
        type: blockType,
        content: blockContent,
        dc,
        skill: skill || 'Investigation',
        isRevealed: blockType === 'public',
      });

      lastIndex = blockRegex.lastIndex;
    }

    if (lastIndex < markdown.length) {
      const remaining = markdown.slice(lastIndex).trim();
      if (remaining) {
        blocks.push({
          id: `block_std_${blocks.length}`,
          type: 'standard',
          content: remaining,
          isRevealed: true,
        });
      }
    }

    // Fallback if no custom blocks are found
    if (blocks.length === 0 && markdown.trim()) {
      blocks.push({
        id: 'block_std_0',
        type: 'standard',
        content: markdown.trim(),
        isRevealed: true,
      });
    }

    return blocks;
  }

  $effect(() => {
    parsedBlocks = parseSelectiveBlocks(content);
  });

  function toggleBlockReveal(blockId: string): void {
    parsedBlocks = parsedBlocks.map((b) =>
      b.id === blockId ? { ...b, isRevealed: !b.isRevealed } : b
    );
  }

  function compileRevealedMarkdown(): string {
    return parsedBlocks
      .filter((b) => b.isRevealed)
      .map((b) => b.content)
      .join('\n\n');
  }

  function handleBroadcastToProjector(): void {
    const revealedText = compileRevealedMarkdown();

    projectorStore.setHandout({
      id: `handout_${Date.now()}`,
      title,
      playerContent: revealedText,
      imageUrl: imageUrl ?? undefined,
    });

    systemBus.emit('HANDOUT_SHARED', {
      id: `handout_${Date.now()}`,
      title,
      playerContent: revealedText,
      imageUrl: imageUrl ?? undefined,
    });
  }

  function handleHideFromProjector(): void {
    projectorStore.returnToMap();
  }
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  class="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-4 animate-in fade-in duration-150"
  onclick={onClose}
  role="dialog"
  aria-modal="true"
  tabindex="-1"
>
  <div
    class="relative w-full max-w-3xl max-h-[85vh] flex flex-col bg-stone-900 border-2 border-amber-800/80 rounded-2xl shadow-2xl overflow-hidden text-stone-200"
    onclick={(e) => e.stopPropagation()}
  >
    <!-- Modal Header -->
    <div class="flex items-center justify-between border-b border-stone-800 px-6 py-4 bg-stone-950/80">
      <div class="flex items-center gap-3">
        <span class="text-2xl">📜</span>
        <div>
          <h2 class="text-lg font-bold font-serif text-amber-200">{title}</h2>
          <span class="text-[10px] uppercase font-mono tracking-wider text-stone-400">
            {isDm ? 'DM Selective Broadcast View' : 'Player Handout'}
          </span>
        </div>
      </div>

      <div class="flex items-center gap-2">
        {#if isDm}
          {#if isCasting}
            <button
              type="button"
              onclick={handleHideFromProjector}
              class="px-3 py-1.5 rounded-lg bg-rose-900/60 hover:bg-rose-800 border border-rose-700 text-rose-200 text-xs font-semibold transition-colors flex items-center gap-1.5"
            >
              <span>⏹</span>
              <span>Stop Cast</span>
            </button>
          {:else}
            <button
              type="button"
              onclick={handleBroadcastToProjector}
              class="px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold transition-colors shadow flex items-center gap-1.5"
            >
              <span>📡</span>
              <span>Broadcast Revealed</span>
            </button>
          {/if}
        {/if}
        <button
          type="button"
          onclick={onClose}
          class="text-stone-400 hover:text-white p-1 rounded-lg text-lg transition-colors ml-2"
          aria-label="Close"
        >
          ✕
        </button>
      </div>
    </div>

    <!-- Handout Content Body -->
    <div class="flex-1 overflow-y-auto p-6 space-y-4 text-xs font-serif leading-relaxed">
      {#if imageUrl}
        <div class="rounded-xl overflow-hidden border border-stone-800 max-h-64 flex justify-center bg-black/40">
          <img src={imageUrl} alt={title} class="max-h-64 object-contain" />
        </div>
      {/if}

      {#each parsedBlocks as block}
        {#if block.type === 'public' || block.type === 'standard'}
          <div class="bg-stone-950/40 border border-stone-800/80 rounded-xl p-4 text-stone-300">
            {#if isDm && block.type === 'public'}
              <div class="text-[9px] font-mono uppercase tracking-wider text-emerald-400 mb-1 flex items-center gap-1">
                <span>🌐 Public Block</span>
              </div>
            {/if}
            <p class="whitespace-pre-wrap">{block.content}</p>
          </div>
        {:else if block.type === 'secret'}
          {#if isDm}
            <!-- DM Secret Block Container with Reveal Toggle -->
            <div
              class="rounded-xl p-4 border transition-all {block.isRevealed
                ? 'bg-amber-950/30 border-amber-600/60 text-amber-100 shadow-md'
                : 'bg-stone-950/70 border-stone-800 text-stone-400 border-dashed'}"
            >
              <div class="flex items-center justify-between border-b border-stone-800/80 pb-2 mb-2">
                <span class="font-mono text-[10px] font-bold flex items-center gap-1.5 text-amber-400">
                  <span>🔒 Secret Block</span>
                  {#if block.dc}
                    <span class="bg-amber-900/60 px-1.5 py-0.5 rounded text-[9px] text-amber-200">
                      DC {block.dc} {block.skill}
                    </span>
                  {/if}
                </span>

                <button
                  type="button"
                  onclick={() => toggleBlockReveal(block.id)}
                  class="px-2.5 py-1 rounded text-[10px] font-bold transition-colors {block.isRevealed
                    ? 'bg-amber-500 text-stone-950 hover:bg-amber-400'
                    : 'bg-stone-800 text-stone-300 hover:bg-stone-700'}"
                >
                  {block.isRevealed ? '👁 Revealed to Players' : '🙈 Hidden from Players'}
                </button>
              </div>

              <p class="whitespace-pre-wrap {block.isRevealed ? '' : 'italic opacity-80'}">
                {block.content}
              </p>
            </div>
          {:else if block.isRevealed}
            <!-- Player View: Only renders if DM revealed it -->
            <div class="bg-amber-950/20 border border-amber-600/40 rounded-xl p-4 text-amber-100 animate-in fade-in duration-200">
              <div class="text-[9px] font-mono uppercase tracking-wider text-amber-400 mb-1">
                🔍 Deciphered Text ({block.skill})
              </div>
              <p class="whitespace-pre-wrap">{block.content}</p>
            </div>
          {/if}
        {/if}
      {/each}
    </div>
  </div>
</div>
