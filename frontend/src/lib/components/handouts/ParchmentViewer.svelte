<script lang="ts">
  // ParchmentViewer.svelte — In-engine Watercolor Parchment Document Renderer
  // Renders Markdown to fantasy parchment with SVG watercolor stain masks, ragged deckled edges,
  // authentic fantasy typography, drop-caps, two-column covenants, and wax seal stamps.

  import type { HandoutTheme, WaxSealType } from '../../network/broadcastBridge';
  import { renderMarkdown, stripSecretCallouts } from '../../utils/markdownRenderer';

  let {
    title = 'Official Document',
    subtitle = '',
    contentMarkdown = '',
    theme = 'classic',
    sealType = 'wax_red',
    sealText = 'SEALED & WITNESSED',
    compact = false,
    isDm = false,
  }: {
    title?: string;
    subtitle?: string;
    contentMarkdown?: string;
    theme?: HandoutTheme;
    sealType?: WaxSealType;
    sealText?: string;
    compact?: boolean;
    isDm?: boolean;
  } = $props();

  // ── Markdown Parser to Styled Parchment HTML ──────────────────────────────
  function parseMarkdownToParchment(md: string): string {
    if (!md) return '';

    let html = md;

    // Filter secret callouts if not DM workstation
    if (!isDm) {
      html = stripSecretCallouts(html);
    }

    // Normalize newlines
    html = html.replace(/\r\n/g, '\n');

    // Handle standard Obsidian/ITS callout syntax within Parchment documents
    html = html.replace(/^[ \t]*>[ \t]*\[!([a-zA-Z0-9_-]+)\][ \t]*([^\n]*)(?:\n([ \t]*>[^\n]*))*/gim, (fullMatch) => {
      const lines = fullMatch.split('\n').map(l => l.replace(/^[ \t]*>[ \t]?/, ''));
      if (lines.length === 0) return fullMatch;
      const firstLineMatch = lines[0].match(/^\[!([a-zA-Z0-9_-]+)\][ \t]*(.*)$/i);
      if (!firstLineMatch) return fullMatch;

      const calloutType = firstLineMatch[1].toLowerCase();
      const customTitle = firstLineMatch[2].trim();
      const bodyLines = lines.slice(1).join('\n').trim();

      if (calloutType === 'secret' || calloutType === 'gm' || calloutType === 'danger') {
        if (!isDm) return '';
        const t = customTitle || (calloutType === 'danger' ? 'DM Hazard / Secret' : 'DM Confidential Note');
        return `<div class="my-3 p-3 rounded border-2 border-amber-800 bg-amber-950/20 text-amber-950 shadow">
          <div class="flex items-center gap-1.5 font-bold text-xs uppercase tracking-wider text-amber-900 border-b border-amber-800/40 pb-1 mb-2">
            <span>🔒</span>
            <span>${escapeHtml(t)}</span>
            <span class="ml-auto text-[9px] px-1 py-0.5 rounded bg-amber-900 text-amber-100 font-mono">DM ONLY</span>
          </div>
          <div class="text-xs leading-relaxed italic text-amber-950/90">${parseMarkdownToParchment(bodyLines)}</div>
        </div>`;
      }

      if (calloutType === 'parchment') {
        const t = customTitle || 'Archival Fragment';
        return `<div class="my-3 p-3 rounded border border-amber-950/40 bg-amber-900/10 font-serif">
          <div class="font-bold text-xs uppercase text-amber-950 border-b border-amber-950/30 pb-0.5 mb-1.5 flex items-center gap-1">
            <span>📜</span>
            <span>${escapeHtml(t)}</span>
          </div>
          <div class="text-xs leading-relaxed text-amber-950/95">${parseMarkdownToParchment(bodyLines)}</div>
        </div>`;
      }

      if (calloutType === 'letter') {
        const t = customTitle || 'Sealed Missive';
        return `<div class="my-3 p-4 rounded border border-amber-950/50 bg-[#fffdfa] shadow-sm font-serif">
          <div class="flex items-center justify-between border-b border-amber-950/30 pb-1 mb-2 text-xs font-bold text-amber-950">
            <span>✉️ ${escapeHtml(t)}</span>
            <span class="text-[10px] text-amber-800 font-serif italic">Wax Affixed</span>
          </div>
          <div class="text-xs leading-relaxed italic text-amber-950/90">${parseMarkdownToParchment(bodyLines)}</div>
        </div>`;
      }

      if (calloutType === 'statblock') {
        const t = customTitle || 'Creature Statblock';
        return `<div class="my-4 p-3 rounded border-2 border-red-950/80 bg-red-950/10 text-amber-950 font-serif">
          <div class="text-xs font-black uppercase tracking-wide text-red-950 border-b-2 border-red-950/40 pb-1 mb-2">
            ⚔️ ${escapeHtml(t)}
          </div>
          <div class="parchment-columns text-xs text-amber-950">${parseMarkdownToParchment(bodyLines)}</div>
        </div>`;
      }

      return `<div class="my-3 pl-3 border-l-4 border-amber-900 bg-amber-950/10 py-1.5 pr-2 font-serif text-xs text-amber-950">
        <strong class="block uppercase text-[10px] text-amber-900 mb-0.5">${escapeHtml(customTitle || calloutType)}</strong>
        <div>${parseMarkdownToParchment(bodyLines)}</div>
      </div>`;
    });

    // 1. Two-column blocks :::columns ... :::
    html = html.replace(/:::columns([\s\S]*?):::/g, (_match, body) => {
      return `<div class="parchment-columns my-4">${parseMarkdownToParchment(body.trim())}</div>`;
    });

    // 2. Custom Callout Badges
    html = html.replace(/\[!REWARD:\s*([^\]]+)\]/gi, (_match, amount) => {
      return `<div class="my-4 text-center p-3 border-2 border-amber-900/60 bg-amber-900/10 rounded-lg font-serif">
        <span class="text-xs uppercase tracking-widest font-bold text-amber-950 block mb-0.5">Bounty Upon Apprehension</span>
        <span class="text-2xl font-black tracking-tight text-amber-950">${escapeHtml(amount.trim())}</span>
      </div>`;
    });

    html = html.replace(/\[!DEAD_OR_ALIVE\]/gi, () => {
      return `<div class="text-center font-serif tracking-[0.25em] font-black text-sm uppercase py-1 border-y-2 border-amber-950 text-amber-950 my-2">
        ★ DEAD OR ALIVE ★
      </div>`;
    });

    html = html.replace(/\[!SIGNATURE:\s*([^\]]+)\]/gi, (_match, signer) => {
      return `<div class="inline-block min-w-[180px] text-center border-t border-amber-950/70 pt-1 mt-6 mr-6 font-serif italic text-xs text-amber-950">
        <span class="font-bold text-sm block not-italic">${escapeHtml(signer.trim())}</span>
        <span class="text-[10px] text-amber-900/80">Sworn Signatory</span>
      </div>`;
    });

    // 3. Tables
    html = html.replace(/((?:\|[^\n]+\|\n?)+)/g, (tableBlock) => {
      const rows = tableBlock.trim().split('\n');
      if (rows.length < 2) return tableBlock;

      const headerCells = rows[0].split('|').filter((_, i, arr) => i > 0 && i < arr.length - 1);
      // Skip row 1 if it's the divider |---|---|
      const startIndex = rows[1].includes('---') ? 2 : 1;
      const bodyRows = rows.slice(startIndex);

      let tableHtml = '<div class="overflow-x-auto my-4"><table class="w-full border-collapse font-serif text-xs text-amber-950 border-t border-b border-amber-950/50">';
      tableHtml += '<thead class="border-b border-amber-950/40 bg-amber-950/5"><tr>';
      for (const h of headerCells) {
        tableHtml += `<th class="p-2 text-left font-bold uppercase tracking-wider text-[11px]">${parseInlineMarkdown(h.trim())}</th>`;
      }
      tableHtml += '</tr></thead><tbody>';

      for (const r of bodyRows) {
        const cells = r.split('|').filter((_, i, arr) => i > 0 && i < arr.length - 1);
        tableHtml += '<tr class="border-b border-amber-950/20 hover:bg-amber-950/5 transition-colors">';
        for (const c of cells) {
          tableHtml += `<td class="p-2">${parseInlineMarkdown(c.trim())}</td>`;
        }
        tableHtml += '</tr>';
      }
      tableHtml += '</tbody></table></div>';
      return tableHtml;
    });

    // 4. Headers
    html = html.replace(/^#### (.*$)/gim, '<h4 class="text-sm font-bold uppercase tracking-wider text-amber-950 font-serif mt-3 mb-1">$1</h4>');
    html = html.replace(/^### (.*$)/gim, '<h3 class="text-base font-bold text-amber-950 font-serif mt-4 mb-1.5 border-b border-amber-950/20 pb-0.5">$1</h3>');
    html = html.replace(/^## (.*$)/gim, '<h2 class="text-lg font-black text-amber-950 font-serif mt-5 mb-2 border-b border-amber-950/40 pb-1">$1</h2>');
    html = html.replace(/^# (.*$)/gim, '<h1 class="text-xl font-black text-center text-amber-950 font-serif mt-6 mb-3 tracking-wide uppercase">$1</h1>');

    // 5. Blockquotes (> text)
    html = html.replace(/^\> (.*$)/gim, '<blockquote class="my-3 pl-4 border-l-2 border-amber-900/60 italic text-amber-950/90 font-serif text-xs leading-relaxed bg-amber-950/5 py-1.5 rounded-r">$1</blockquote>');

    // 6. Ornamental Horizontal Rules (--- or ***)
    html = html.replace(/^(?:---|\*\*\*)$/gim, '<div class="my-4 flex items-center justify-center text-amber-950/50 text-xs font-serif select-none"><span class="flex-1 h-px bg-amber-950/30"></span><span class="px-3">⚜ ❖ ⚜</span><span class="flex-1 h-px bg-amber-950/30"></span></div>');

    // 7. Unordered Lists (- item, * item)
    html = html.replace(/^[*-] (.*$)/gim, '<li class="ml-4 list-disc font-serif text-xs text-amber-950/90 leading-relaxed">$1</li>');
    html = html.replace(/((?:<li class="ml-4 list-disc[^"]*">.*<\/li>\n?)+)/g, '<ul class="my-2 space-y-1">$1</ul>');

    // 8. Ordered Lists (1. item)
    html = html.replace(/^\d+\. (.*$)/gim, '<li class="ml-4 list-decimal font-serif text-xs text-amber-950/90 leading-relaxed">$1</li>');
    html = html.replace(/((?:<li class="ml-4 list-decimal[^"]*">.*<\/li>\n?)+)/g, '<ol class="my-2 space-y-1">$1</ol>');

    // 9. Paragraphs and Inline formatting
    const lines = html.split('\n');
    let inBlock = false;
    const finalLines: string[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) {
        finalLines.push('');
        continue;
      }
      if (
        line.startsWith('<h') ||
        line.startsWith('<div') ||
        line.startsWith('<ul') ||
        line.startsWith('<ol') ||
        line.startsWith('<blockquote') ||
        line.startsWith('<table') ||
        line.startsWith('</')
      ) {
        finalLines.push(line);
      } else {
        // Regular text paragraph with drop-cap on the very first paragraph if classic/proclamation
        const isFirstParagraph = !inBlock && i < 3;
        inBlock = true;
        const parsedLine = parseInlineMarkdown(line);
        if (isFirstParagraph && (theme === 'classic' || theme === 'proclamation')) {
          finalLines.push(`<p class="parchment-drop-cap my-2 leading-relaxed text-xs font-serif text-amber-950/95">${parsedLine}</p>`);
        } else {
          finalLines.push(`<p class="my-2 leading-relaxed text-xs font-serif text-amber-950/90">${parsedLine}</p>`);
        }
      }
    }

    return finalLines.join('\n');
  }

  function parseInlineMarkdown(text: string): string {
    return text
      .replace(/\*\*\*(.*?)\*\*\*/g, '<strong><em>$1</em></strong>')
      .replace(/\*\*(.*?)\*\*/g, '<strong class="font-bold text-amber-950">$1</strong>')
      .replace(/\*(.*?)\*/g, '<em class="italic">$1</em>')
      .replace(/~~(.*?)~~/g, '<del class="line-through text-amber-900/60">$1</del>')
      .replace(/`(.*?)`/g, '<code class="px-1 py-0.5 bg-amber-950/10 rounded font-mono text-[10px] text-amber-950">$1</code>');
  }

  function escapeHtml(str: string): string {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  const renderedContentHtml = $derived(parseMarkdownToParchment(contentMarkdown));
</script>

<!-- ── EMBEDDED SVG FILTERS (Watercolor Blobs & Ragged Deckled Edges) ────────── -->
<svg class="absolute w-0 h-0 pointer-events-none" aria-hidden="true">
  <defs>
    <!-- Ragged Paper Deckled Edge Filter -->
    <filter id="parchment-ragged-edge" x="-10%" y="-10%" width="120%" height="120%">
      <feTurbulence type="fractalNoise" baseFrequency="0.04" numOctaves="4" result="noise" />
      <feDisplacementMap in="SourceGraphic" in2="noise" scale="5" xChannelSelector="R" yChannelSelector="G" />
    </filter>

    <!-- Watercolor Bloom Wash Filter -->
    <filter id="parchment-watercolor-wash" x="0%" y="0%" width="100%" height="100%">
      <feTurbulence type="turbulence" baseFrequency="0.02" numOctaves="3" result="turb" />
      <feColorMatrix type="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 0.15 0" in="turb" result="stain" />
      <feBlend in="SourceGraphic" in2="stain" mode="multiply" />
    </filter>
  </defs>
</svg>

<!-- ── PARCHMENT CONTAINER ────────────────────────────────────────────────── -->
<div
  class="relative mx-auto transition-all select-text shadow-2xl rounded-sm text-amber-950 font-serif
    {compact ? 'p-5 max-w-lg' : 'p-8 sm:p-12 max-w-2xl'}
    {theme === 'bounty' ? 'parchment-bounty' :
     theme === 'proclamation' ? 'parchment-proclamation' :
     theme === 'journal' ? 'parchment-journal' :
     theme === 'contract' ? 'parchment-contract' : 'parchment-classic'}"
  style="filter: url(#parchment-ragged-edge);"
>
  <!-- Background Watercolor Texture Layers -->
  <div class="absolute inset-0 pointer-events-none overflow-hidden rounded-sm -z-10 bg-[#f4ecd8]">
    <!-- Tea stain blooms -->
    <div class="absolute -top-12 -left-12 w-48 h-48 rounded-full bg-amber-800/10 blur-2xl"></div>
    <div class="absolute top-1/2 -right-16 w-56 h-56 rounded-full bg-amber-900/15 blur-3xl"></div>
    <div class="absolute -bottom-10 left-1/4 w-64 h-40 rounded-full bg-yellow-900/10 blur-2xl"></div>
    <!-- Burned aged border vignette -->
    <div class="absolute inset-0 shadow-[inset_0_0_50px_rgba(120,70,20,0.35)] pointer-events-none"></div>
  </div>

  <!-- ── THEME DECORATIVE HEADER ───────────────────────────────────────────── -->
  {#if theme === 'bounty'}
    <div class="text-center mb-6 border-b-4 border-amber-950/80 pb-4">
      <div class="flex items-center justify-center gap-3 text-amber-950 mb-1">
        <span class="text-xl font-bold">☠</span>
        <span class="text-xs uppercase tracking-[0.3em] font-black">Imperial Marshal Proclamation</span>
        <span class="text-xl font-bold">☠</span>
      </div>
      <h1 class="text-3xl sm:text-4xl font-black uppercase tracking-tight text-amber-950 font-serif">
        {title}
      </h1>
      {#if subtitle}
        <p class="text-xs italic font-serif text-amber-900/90 mt-1 uppercase tracking-widest">{subtitle}</p>
      {/if}
    </div>
  {:else if theme === 'proclamation'}
    <div class="text-center mb-6 border-b-2 border-double border-amber-950/60 pb-5">
      <div class="w-10 h-10 mx-auto mb-2 text-amber-900 flex items-center justify-center text-2xl font-serif">
        👑
      </div>
      <span class="text-[10px] uppercase font-bold tracking-[0.3em] text-amber-900/80 block mb-1">
        By Sovereign Edict &amp; Royal Mandate
      </span>
      <h1 class="text-2xl sm:text-3xl font-black uppercase tracking-wide text-amber-950 font-serif">
        {title}
      </h1>
      {#if subtitle}
        <p class="text-xs font-serif text-amber-900/80 mt-1 italic">{subtitle}</p>
      {/if}
      <div class="flex items-center justify-center gap-2 mt-3 text-amber-950/40 text-xs">
        <span>──────</span>
        <span>⚜ ❖ ⚜</span>
        <span>──────</span>
      </div>
    </div>
  {:else if theme === 'contract'}
    <div class="text-center mb-6 border-b border-amber-950/40 pb-4">
      <div class="flex items-center justify-between text-[9px] uppercase tracking-widest text-amber-900/70 font-mono mb-2">
        <span>IN NOMINE SOVEREIGNTIS</span>
        <span>ARTICLE OF INDENTURE</span>
      </div>
      <h1 class="text-2xl sm:text-3xl font-bold tracking-tight text-amber-950 font-serif uppercase">
        {title}
      </h1>
      {#if subtitle}
        <p class="text-xs font-serif text-amber-900/90 mt-1 italic">{subtitle}</p>
      {/if}
    </div>
  {:else if theme === 'journal'}
    <div class="mb-5 border-b border-amber-950/20 pb-2 flex items-baseline justify-between flex-wrap gap-2">
      <h1 class="text-xl sm:text-2xl font-bold text-amber-950 font-serif italic">
        {title}
      </h1>
      {#if subtitle}
        <span class="text-[11px] font-mono text-amber-900/80 italic">{subtitle}</span>
      {/if}
    </div>
  {:else}
    <!-- Classic Vellum -->
    <div class="text-center mb-6 border-b border-amber-950/30 pb-4">
      <h1 class="text-2xl sm:text-3xl font-bold tracking-wide text-amber-950 font-serif">
        {title}
      </h1>
      {#if subtitle}
        <p class="text-xs font-serif italic text-amber-900/80 mt-1">{subtitle}</p>
      {/if}
    </div>
  {/if}

  <!-- ── RENDERED MARKDOWN BODY ────────────────────────────────────────────── -->
  <div class="parchment-content leading-relaxed text-amber-950 font-serif text-xs space-y-3">
    {@html renderedContentHtml}
  </div>

  <!-- ── BOTTOM AUTHENTICATION: WAX SEAL STAMP ─────────────────────────────── -->
  {#if sealType && sealType !== 'none'}
    <div class="mt-8 pt-4 border-t border-amber-950/30 flex items-center justify-between flex-wrap gap-4 select-none">
      <!-- Legal verification notice -->
      <div class="text-[10px] text-amber-900/70 font-serif italic max-w-xs leading-tight">
        Given under our hand and verified seal. All violations subject to provincial tribunal.
      </div>

      <!-- Wax Seal Stamp -->
      <div class="relative flex items-center justify-center shrink-0">
        <div
          class="w-16 h-16 rounded-full flex flex-col items-center justify-center text-center p-1.5 shadow-lg border-2
            {sealType === 'wax_red' ? 'bg-gradient-to-br from-red-700 via-red-800 to-rose-950 border-red-900 text-rose-100' :
             sealType === 'wax_gold' ? 'bg-gradient-to-br from-amber-600 via-amber-700 to-yellow-900 border-amber-900 text-amber-100' :
             'bg-gradient-to-br from-slate-800 via-slate-900 to-black border-slate-950 text-slate-200'}"
          style="box-shadow: 0 4px 10px rgba(40,15,5,0.4), inset 0 2px 4px rgba(255,255,255,0.25);"
        >
          <span class="text-xs leading-none mb-0.5">⚜</span>
          <span class="text-[7px] font-black uppercase tracking-tighter leading-tight line-clamp-2">
            {sealText}
          </span>
        </div>
      </div>
    </div>
  {/if}
</div>

<style>
  /* ── Decorative Drop-Cap Styling ────────────────────────────────────────── */
  :global(.parchment-drop-cap::first-letter) {
    font-size: 2.75rem;
    line-height: 2.25rem;
    font-weight: 900;
    float: left;
    margin-right: 0.5rem;
    margin-top: 0.15rem;
    color: #451a03;
    font-family: Georgia, Cambria, 'Times New Roman', Times, serif;
    text-shadow: 1px 1px 0 rgba(255, 255, 255, 0.4);
  }

  /* ── Two-Column Layout ─────────────────────────────────────────────────── */
  :global(.parchment-columns) {
    column-count: 2;
    column-gap: 1.5rem;
    column-rule: 1px dashed rgba(69, 26, 3, 0.25);
  }

  /* ── Theme Specific Borders ────────────────────────────────────────────── */
  .parchment-bounty {
    border: 6px solid #291206;
    outline: 2px dashed #78350f;
    outline-offset: -8px;
  }

  .parchment-proclamation {
    border: 4px double #451a03;
    outline: 1px solid #78350f;
    outline-offset: -6px;
  }

  .parchment-contract {
    border: 1px solid #78350f;
    outline: 1px solid rgba(120, 53, 15, 0.3);
    outline-offset: 4px;
  }

  .parchment-journal {
    border-left: 8px solid #3b1d09;
    border-right: 1px solid #78350f;
    border-top: 1px solid #78350f;
    border-bottom: 1px solid #78350f;
  }

  .parchment-classic {
    border: 2px solid #572609;
    outline: 1px solid rgba(87, 38, 9, 0.4);
    outline-offset: -5px;
  }
</style>
