const TAG_PATTERN = /(<\/?b>|<\/?i>|<color=["']?[^"'>]*["']?>|<\/color>|<size=["']?[^"'>]*["']?>|<\/size>)/gi;

interface TagSpan {
  start: number;
  end: number;
}

interface OpenTag {
  open: string;
  close: string;
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
      // Close tag — pop matching open tag from stack
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
    const absPos = start + idx + 2; // after the \n\n
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

/**
 * Split mail content into parts that each fit within the character limit.
 * Each part is valid self-contained markup with proper tag nesting.
 * Parts are prefixed with "(Part X/N)\n".
 */
export function splitMailContent(rawMarkup: string, maxChars = 2000): string[] {
  if (rawMarkup.length <= maxChars) return [rawMarkup];

  const tagSpans = findTagSpans(rawMarkup);

  // First pass: split without labels to determine part count
  const rawParts: { content: string; reopenPrefix: string }[] = [];
  let pos = 0;
  let reopenTags = '';

  // Reserve generous space for labels + tag re-opening
  const labelReserve = 20;

  while (pos < rawMarkup.length) {
    const openTags = getOpenTagsAt(rawMarkup, pos);
    const reopenOverhead = openTags.reduce((sum, t) => sum + t.open.length + t.close.length, 0);
    const effectiveMax = maxChars - labelReserve - reopenTags.length - reopenOverhead;

    const remaining = rawMarkup.length - pos;
    if (reopenTags.length + remaining + labelReserve <= maxChars) {
      // Everything fits in the last part
      rawParts.push({ content: rawMarkup.slice(pos), reopenPrefix: reopenTags });
      break;
    }

    const splitAt = findBestSplit(rawMarkup, pos, pos + Math.max(effectiveMax, 100), tagSpans);
    const chunk = rawMarkup.slice(pos, splitAt);

    // Close any open tags at the split point
    const openAtSplit = getOpenTagsAt(rawMarkup, splitAt);
    const closeSuffix = openAtSplit
      .slice()
      .reverse()
      .map((t) => t.close)
      .join('');
    const nextReopenPrefix = openAtSplit.map((t) => t.open).join('');

    rawParts.push({
      content: chunk + closeSuffix,
      reopenPrefix: reopenTags,
    });

    reopenTags = nextReopenPrefix;
    pos = splitAt;
  }

  // Second pass: add part labels
  const totalParts = rawParts.length;
  if (totalParts <= 1) return [rawMarkup];

  return rawParts.map((part, i) => {
    const label = `(Part ${i + 1}/${totalParts})\n`;
    return label + part.reopenPrefix + part.content;
  });
}
