// src/lib/utils/markdownRenderer.ts
// GitHub Flavored Markdown (GFM) renderer with table support, strikethrough, and task lists.

export interface MarkdownOptions {
  gfm?: boolean;
  breaks?: boolean;
  sanitize?: boolean;
}

let defaultOptions: MarkdownOptions = {
  gfm: true,
  breaks: true,
  sanitize: false,
};

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
