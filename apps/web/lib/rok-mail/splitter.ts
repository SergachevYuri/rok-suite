const TAG_PATTERN = /(<\/?b>|<\/?i>|<color=["']?[^"'>]*["']?>|<\/color>|<size=["']?[^"'>]*["']?>|<\/size>)/gi;

interface TagSpan {
  start: number;
  end: number;
}

interface OpenTag {
  open: string;
  close: string;
}

/** Check if content contains manual --- break markers */
export function hasManualBreaks(content: string): boolean {
  return /(?:^|\n)---(?:\n|$)/.test(content);
}

/** Find all tag spans (positions occupied by markup tags) */
function findTagSpans(markup: string): TagSpan[] {
  const spans: TagSpan[] = [];
  let match;
  const re = new RegExp(TAG_PATTERN.source, 'gi');
  while ((match = re.exec(markup)) !== null) {
    spans.push({ start: match.index, end: match.index + match[0].length });
  }
  return spans;
}

/** Check if a position falls inside a markup tag */
function isInsideTag(pos: number, spans: TagSpan[]): boolean {
  return spans.some((s) => pos > s.start && pos < s.end);
}

/** Get the close tag string for an opening tag */
function closeTagFor(openTag: string): string {
  if (/^<b>$/i.test(openTag)) return '</b>';
  if (/^<i>$/i.test(openTag)) return '</i>';
  if (/^<color=/i.test(openTag)) return '</color>';
  if (/^<size=/i.test(openTag)) return '</size>';
  return '';
}

/** Walk markup up to `endPos` and return stack of open tags at that point */
function getOpenTagsAt(markup: string, endPos: number): OpenTag[] {
  const stack: OpenTag[] = [];
  const re = new RegExp(TAG_PATTERN.source, 'gi');
  let match;
  while ((match = re.exec(markup)) !== null) {
    if (match.index >= endPos) break;
    const tag = match[0];
    if (tag.startsWith('</')) {
      for (let i = stack.length - 1; i >= 0; i--) {
        if (stack[i].close.toLowerCase() === tag.toLowerCase()) {
          stack.splice(i, 1);
          break;
        }
      }
    } else {
      stack.push({ open: tag, close: closeTagFor(tag) });
    }
  }
  return stack;
}

/**
 * Find the best split point at or before `maxEnd`, starting from `start`.
 * Prefers paragraph breaks > line breaks > word boundaries.
 * Never splits inside a markup tag.
 */
function findBestSplit(
  markup: string,
  start: number,
  maxEnd: number,
  tagSpans: TagSpan[]
): number {
  const region = markup.slice(start, maxEnd);

  // Priority 1: paragraph break (split after \n\n)
  let best = -1;
  let idx = region.lastIndexOf('\n\n');
  while (idx >= 0) {
    const absPos = start + idx + 2;
    if (!isInsideTag(absPos, tagSpans)) {
      best = absPos;
      break;
    }
    idx = region.lastIndexOf('\n\n', idx - 1);
  }
  if (best > start) return best;

  // Priority 2: line break
  idx = region.lastIndexOf('\n');
  while (idx >= 0) {
    const absPos = start + idx + 1;
    if (!isInsideTag(absPos, tagSpans)) {
      best = absPos;
      break;
    }
    idx = region.lastIndexOf('\n', idx - 1);
  }
  if (best > start) return best;

  // Priority 3: word boundary (space)
  idx = region.lastIndexOf(' ');
  while (idx >= 0) {
    const absPos = start + idx + 1;
    if (!isInsideTag(absPos, tagSpans)) {
      best = absPos;
      break;
    }
    idx = region.lastIndexOf(' ', idx - 1);
  }
  if (best > start) return best;

  // Fallback: split at maxEnd, but not inside a tag
  let fallback = maxEnd;
  while (fallback > start && isInsideTag(fallback, tagSpans)) {
    fallback--;
  }
  return fallback > start ? fallback : maxEnd;
}

/** Extract header (first paragraph before \n\n) and body */
function extractHeader(markup: string): { header: string; body: string } {
  const idx = markup.indexOf('\n\n');
  if (idx < 0) return { header: '', body: markup };
  return { header: markup.slice(0, idx + 2), body: markup.slice(idx + 2) };
}

/** Split body text at manual --- break markers, fixing tag nesting at each split */
function splitBodyAtBreaks(body: string): string[] {
  const regex = /(?:^|\n)---(?:\n|$)/g;
  const breaks: { start: number; end: number }[] = [];
  let m;
  while ((m = regex.exec(body)) !== null) {
    breaks.push({ start: m.index, end: m.index + m[0].length });
  }

  if (breaks.length === 0) return [body];

  const sections: string[] = [];
  let prevEnd = 0;

  for (const bp of breaks) {
    const raw = body.slice(prevEnd, bp.start);

    // Reopen tags from previous break point
    const reopenPrefix = prevEnd > 0
      ? getOpenTagsAt(body, prevEnd).map((t) => t.open).join('')
      : '';

    // Close tags that are open at this break point
    const openTags = getOpenTagsAt(body, bp.start);
    const closeSuffix = openTags.slice().reverse().map((t) => t.close).join('');

    sections.push(reopenPrefix + raw + closeSuffix);
    prevEnd = bp.end;
  }

  // Last section after final break
  const lastRaw = body.slice(prevEnd);
  const reopenPrefix = getOpenTagsAt(body, prevEnd).map((t) => t.open).join('');
  sections.push(reopenPrefix + lastRaw);

  // Filter out sections that have no visible text
  return sections.filter((s) => s.replace(/<[^>]*>/g, '').trim().length > 0);
}

/** Auto-split a section into chunks that fit within the character budget */
function autoSplitSection(section: string, budget: number): string[] {
  if (section.length <= budget) return [section];

  const tagSpans = findTagSpans(section);
  const chunks: string[] = [];
  let pos = 0;
  let reopenTags = '';

  while (pos < section.length) {
    const remaining = section.length - pos;
    if (reopenTags.length + remaining <= budget) {
      chunks.push(reopenTags + section.slice(pos));
      break;
    }

    // Reserve space for close tags at split point
    const currentOpenTags = getOpenTagsAt(section, pos);
    const closeOverhead = currentOpenTags.reduce((sum, t) => sum + t.close.length, 0);
    const effectiveBudget = Math.max(budget - reopenTags.length - closeOverhead, 100);

    const splitAt = findBestSplit(section, pos, pos + effectiveBudget, tagSpans);
    const chunk = section.slice(pos, splitAt);

    const openAtSplit = getOpenTagsAt(section, splitAt);
    const closeSuffix = openAtSplit.slice().reverse().map((t) => t.close).join('');
    const nextReopenPrefix = openAtSplit.map((t) => t.open).join('');

    chunks.push(reopenTags + chunk + closeSuffix);
    reopenTags = nextReopenPrefix;
    pos = splitAt;
  }

  return chunks;
}

/**
 * Split mail content into parts that each fit within the character limit.
 * Supports manual --- break markers and preserves the header in each part.
 * Each part is valid self-contained markup with proper tag nesting.
 * Parts are prefixed with "(Part X/N)\n".
 */
export function splitMailContent(rawMarkup: string, maxChars = 2000): string[] {
  const { header, body } = extractHeader(rawMarkup);
  const manualBreaks = hasManualBreaks(body);

  // Split body at manual breaks (returns [body] if no breaks)
  const bodySections = splitBodyAtBreaks(body);

  // If no breaks and content fits, return as-is
  if (!manualBreaks && rawMarkup.length <= maxChars) return [rawMarkup];

  // Character budget per part: max minus label, header, and continuation note
  const labelReserve = 20;
  const continuationReserve = 45; // "\n\n<i>(Continued in Part NN...)</i>"
  const budget = maxChars - labelReserve - header.length - continuationReserve;

  // If header is too large to repeat, fall back to no-header splitting
  if (budget <= 100) {
    const fallbackBudget = maxChars - labelReserve - continuationReserve;
    const chunks = autoSplitSection(rawMarkup, fallbackBudget);
    if (chunks.length <= 1) return [rawMarkup];
    return chunks.map((chunk, i) => {
      const label = `(Part ${i + 1}/${chunks.length})\n`;
      const cont = i < chunks.length - 1
        ? `\n\n<i>(Continued in Part ${i + 2}...)</i>`
        : '';
      return label + chunk + cont;
    });
  }

  // Auto-split any oversized body sections
  const allChunks: string[] = [];
  for (const section of bodySections) {
    if (section.length <= budget) {
      allChunks.push(section);
    } else {
      allChunks.push(...autoSplitSection(section, budget));
    }
  }

  // If still just 1 chunk and no manual breaks, return original
  if (allChunks.length <= 1 && !manualBreaks) return [rawMarkup];

  // Assemble: label + header + body chunk + continuation note
  const total = allChunks.length;
  return allChunks.map((chunk, i) => {
    const label = `(Part ${i + 1}/${total})\n`;
    const cont = i < total - 1
      ? `\n\n<i>(Continued in Part ${i + 2}...)</i>`
      : '';
    return label + header + chunk + cont;
  });
}
