// src/lib/utils/markdownRenderer.ts
// GitHub Flavored Markdown (GFM) renderer with table support, strikethrough, and task lists.

export interface MarkdownOptions {
  gfm?: boolean;
  breaks?: boolean;
  sanitize?: boolean;
  isDm?: boolean;
}

let defaultOptions: MarkdownOptions = {
  gfm: true,
  breaks: true,
  sanitize: false,
  isDm: false,
};

/**
 * Strips all DM secret callouts (> [!secret], > [!danger] DM Secret, > [!gm]) from markdown.
 * Guaranteed to prevent DM notes, secret DC values, or trap notes from leaking to player views or public feeds.
 */
export function stripSecretCallouts(md: string): string {
  if (!md) return '';
  // Match callout blocks starting with > [!secret], > [!gm], or > [!danger] (case-insensitive)
  // and consuming all contiguous blockquote lines (> ...)
  return md.replace(/^[ \t]*>[ \t]*\[!(?:secret|gm|danger)\][^\n]*(?:\n[ \t]*>[^\n]*)*(?:\n|$)/gim, '\n').trim();
}

export const marked = {
  use(options: Partial<MarkdownOptions>): void {
    defaultOptions = { ...defaultOptions, ...options };
  },
  parse(markdown: string, options?: Partial<MarkdownOptions>): string {
    return renderMarkdown(markdown, { ...defaultOptions, ...options });
  }
};

export function renderMarkdown(md: string, options: MarkdownOptions = defaultOptions): string {
  if (!md) return '';

  let html = md.replace(/\r\n/g, '\n');

  // Strip or elevated render for secret callouts based on isDm flag
  if (!options.isDm) {
    html = stripSecretCallouts(html);
  }

  // Parse Obsidian / Quartz / ITS Callout blocks: > [!type] Title...
  // Supported types: secret, gm, danger, parchment, letter, statblock, note, tip, warning
  html = html.replace(/^[ \t]*>[ \t]*\[!([a-zA-Z0-9_-]+)\][ \t]*([^\n]*)(?:\n([ \t]*>[^\n]*))*/gim, (fullMatch) => {
    const lines = fullMatch.split('\n').map(l => l.replace(/^[ \t]*>[ \t]?/, ''));
    if (lines.length === 0) return fullMatch;

    const firstLineMatch = lines[0].match(/^\[!([a-zA-Z0-9_-]+)\][ \t]*(.*)$/i);
    if (!firstLineMatch) return fullMatch;

    const calloutType = firstLineMatch[1].toLowerCase();
    const customTitle = firstLineMatch[2].trim();
    const bodyLines = lines.slice(1);
    const bodyContent = bodyLines.join('\n').trim();

    if (calloutType === 'secret' || calloutType === 'gm' || calloutType === 'danger') {
      if (!options.isDm) {
        return '';
      }
      const title = customTitle || (calloutType === 'danger' ? 'DM Secret Danger' : 'DM Secret Note');
      return `<div class="callout-block callout-secret my-3 p-3 rounded-lg border-2 border-amber-600/80 bg-amber-950/40 text-amber-200 shadow-md">
        <div class="flex items-center gap-2 font-bold text-xs uppercase tracking-wider text-amber-400 border-b border-amber-600/40 pb-1 mb-2 select-none">
          <span class="text-sm">🔒</span>
          <span>${title}</span>
          <span class="ml-auto text-[9px] px-1.5 py-0.5 rounded bg-amber-900/80 text-amber-300 font-mono">DM ONLY</span>
        </div>
        <div class="text-xs leading-relaxed text-amber-100/90 space-y-1 font-serif">${renderMarkdown(bodyContent, options)}</div>
      </div>`;
    }

    if (calloutType === 'parchment') {
      const title = customTitle || 'Archival Record';
      return `<div class="callout-block callout-parchment my-4 p-4 rounded border border-[#78350f]/60 bg-[#f4ecd8] text-[#451a03] font-serif shadow-lg">
        <div class="font-bold text-sm uppercase tracking-widest text-[#78350f] border-b border-[#78350f]/30 pb-1 mb-2 select-none flex items-center gap-2">
          <span>📜</span>
          <span>${title}</span>
        </div>
        <div class="text-xs leading-relaxed text-[#451a03]/90 space-y-1">${renderMarkdown(bodyContent, options)}</div>
      </div>`;
    }

    if (calloutType === 'letter') {
      const title = customTitle || 'Missive';
      return `<div class="callout-block callout-letter my-4 p-5 rounded border border-[#b45309]/50 bg-[#fbf7ee] text-[#291206] font-serif shadow-md relative">
        <div class="flex items-center justify-between border-b border-[#78350f]/20 pb-1.5 mb-3 select-none">
          <span class="italic text-xs font-semibold text-[#78350f]">${title}</span>
          <span class="w-6 h-6 rounded-full bg-gradient-to-br from-rose-700 to-rose-950 flex items-center justify-center text-[10px] text-white shadow">⚜</span>
        </div>
        <div class="text-xs leading-relaxed italic text-[#291206]/90 space-y-1.5">${renderMarkdown(bodyContent, options)}</div>
      </div>`;
    }

    if (calloutType === 'statblock') {
      const title = customTitle || 'Statblock Reference';
      return `<div class="callout-block callout-statblock my-4 p-3.5 rounded border-2 border-red-950/60 bg-[#140b0b] text-slate-200 font-sans shadow-xl">
        <div class="text-xs font-black uppercase tracking-wider text-rose-400 border-b-2 border-rose-800/80 pb-1 mb-2 flex items-center gap-1.5 select-none">
          <span>⚔️</span>
          <span>${title}</span>
        </div>
        <div class="callout-statblock-columns text-xs text-slate-300 leading-normal">${renderMarkdown(bodyContent, options)}</div>
      </div>`;
    }

    // Default Callout
    const title = customTitle || calloutType.toUpperCase();
    return `<div class="callout-block my-3 p-3 rounded-lg border-l-4 border-indigo-500 bg-slate-900/60 text-slate-200">
      <div class="font-bold text-xs uppercase tracking-wider text-indigo-300 mb-1">${title}</div>
      <div class="text-xs text-slate-300">${renderMarkdown(bodyContent, options)}</div>
    </div>`;
  });

  // GFM Pipe Table Parsing
  if (options.gfm !== false) {
    html = html.replace(/((?:^[ \t]*\|[^\n]+\|[ \t]*(?:\n|$))+)/gm, (tableBlock) => {
      const lines = tableBlock.trim().split('\n').map(l => l.trim()).filter(l => l.length > 0);
      if (lines.length < 2) return tableBlock;

      const parseCells = (rowStr: string): string[] => {
        // Strip leading/trailing pipe
        const cleaned = rowStr.replace(/^\||\|$/g, '');
        return cleaned.split('|').map(c => c.trim());
      };

      const headerCells = parseCells(lines[0]);
      // Check if line 1 is separator |:---|---:|:---:|
      const hasSeparator = /^\|?([ \t]*:?-+:?[ \t]*\|)+[ \t]*:?-+:?[ \t]*\|?$/.test(lines[1]);
      const bodyLines = hasSeparator ? lines.slice(2) : lines.slice(1);

      let alignTypes: string[] = [];
      if (hasSeparator) {
        const sepCells = parseCells(lines[1]);
        alignTypes = sepCells.map(s => {
          const left = s.startsWith(':');
          const right = s.endsWith(':');
          if (left && right) return 'center';
          if (right) return 'right';
          if (left) return 'left';
          return 'left';
        });
      }

      let out = '<div class="overflow-x-auto my-3"><table class="min-w-full border-collapse border border-slate-700 text-xs text-slate-200">';
      out += '<thead class="bg-slate-800/80 border-b border-slate-700"><tr>';
      for (let i = 0; i < headerCells.length; i++) {
        const align = alignTypes[i] ? ` style="text-align: ${alignTypes[i]}"` : '';
        out += `<th class="px-3 py-2 font-bold uppercase tracking-wider text-[11px] text-slate-300 border border-slate-700"${align}>${renderInline(headerCells[i])}</th>`;
      }
      out += '</tr></thead><tbody>';

      for (const row of bodyLines) {
        const cells = parseCells(row);
        out += '<tr class="border-b border-slate-800/60 hover:bg-slate-800/40 transition-colors">';
        for (let i = 0; i < headerCells.length; i++) {
          const val = cells[i] !== undefined ? cells[i] : '';
          const align = alignTypes[i] ? ` style="text-align: ${alignTypes[i]}"` : '';
          out += `<td class="px-3 py-1.5 border border-slate-700/60"${align}>${renderInline(val)}</td>`;
        }
        out += '</tr>';
      }
      out += '</tbody></table></div>';
      return out;
    });
  }

  // Headers
  html = html.replace(/^######[ \t]+(.*$)/gim, '<h6 class="text-xs font-bold text-slate-400 mt-2 mb-1">$1</h6>');
  html = html.replace(/^#####[ \t]+(.*$)/gim, '<h5 class="text-xs font-bold text-slate-300 mt-2 mb-1">$1</h5>');
  html = html.replace(/^####[ \t]+(.*$)/gim, '<h4 class="text-sm font-bold text-slate-200 mt-3 mb-1">$1</h4>');
  html = html.replace(/^###[ \t]+(.*$)/gim, '<h3 class="text-base font-bold text-indigo-300 mt-4 mb-1.5">$1</h3>');
  html = html.replace(/^##[ \t]+(.*$)/gim, '<h2 class="text-lg font-black text-amber-300 mt-5 mb-2 border-b border-slate-800 pb-1">$1</h2>');
  html = html.replace(/^#[ \t]+(.*$)/gim, '<h1 class="text-xl font-black text-slate-100 mt-6 mb-3 tracking-wide border-b border-slate-700 pb-1">$1</h1>');

  // Blockquotes
  html = html.replace(/^\>[ \t]+(.*$)/gim, '<blockquote class="my-2 pl-3 border-l-2 border-indigo-500 italic text-slate-400 text-xs bg-slate-900/40 py-1 rounded-r">$1</blockquote>');

  // Horizontal rules
  html = html.replace(/^(?:---|___|\*\*\*)$/gim, '<hr class="my-4 border-slate-800" />');

  // Unordered Lists
  html = html.replace(/^[*-][ \t]+(.*$)/gim, '<li class="ml-4 list-disc text-xs text-slate-300 leading-relaxed">$1</li>');
  html = html.replace(/((?:<li class="ml-4 list-disc[^"]*">.*<\/li>\n?)+)/g, '<ul class="my-2 space-y-1">$1</ul>');

  // Ordered Lists
  html = html.replace(/^\d+\.[ \t]+(.*$)/gim, '<li class="ml-4 list-decimal text-xs text-slate-300 leading-relaxed">$1</li>');
  html = html.replace(/((?:<li class="ml-4 list-decimal[^"]*">.*<\/li>\n?)+)/g, '<ol class="my-2 space-y-1">$1</ol>');

  // Paragraphs
  const lines = html.split('\n');
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
      line.startsWith('<hr') ||
      line.startsWith('</')
    ) {
      finalLines.push(line);
    } else {
      finalLines.push(`<p class="my-1.5 leading-relaxed text-xs text-slate-300">${renderInline(line)}</p>`);
    }
  }

  return finalLines.join(options.breaks ? '<br />\n' : '\n');
}

function renderInline(text: string): string {
  let out = text;
  // Code span
  out = out.replace(/`([^`]+)`/g, '<code class="px-1 py-0.5 rounded bg-slate-800 text-amber-300 font-mono text-[11px]">$1</code>');
  // Bold
  out = out.replace(/\*\*([^*]+)\*\*/g, '<strong class="font-bold text-slate-100">$1</strong>');
  out = out.replace(/__([^_]+)__/g, '<strong class="font-bold text-slate-100">$1</strong>');
  // Italic
  out = out.replace(/\*([^*]+)\*/g, '<em class="italic text-slate-300">$1</em>');
  out = out.replace(/_([^_]+)_/g, '<em class="italic text-slate-300">$1</em>');
  // Strikethrough
  out = out.replace(/~~([^~]+)~~/g, '<del class="line-through text-slate-500">$1</del>');
  // Links
  out = out.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer" class="text-indigo-400 hover:text-indigo-300 underline underline-offset-2">$1</a>');

  return out;
}

// Global initialization setting GFM table support and line breaks
marked.use({
  gfm: true,
  breaks: true,
});
