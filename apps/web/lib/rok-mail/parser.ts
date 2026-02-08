import React from 'react';
import { resolveColor } from './colors';

export interface RokNode {
  type: 'text' | 'bold' | 'italic' | 'color' | 'size';
  content?: string;
  children?: RokNode[];
  color?: string;
  size?: string;
}

export function parseRokMarkup(input: string): RokNode[] {
  let pos = 0;

  function parseNodes(stopTag?: string): RokNode[] {
    const result: RokNode[] = [];
    let textBuf = '';

    function flushText() {
      if (textBuf) {
        result.push({ type: 'text', content: textBuf });
        textBuf = '';
      }
    }

    while (pos < input.length) {
      // Check for closing tag
      if (stopTag && input.startsWith(stopTag, pos)) {
        flushText();
        pos += stopTag.length;
        return result;
      }

      if (input[pos] === '<') {
        // Try to match opening tags
        const boldOpen = matchTag(input, pos, 'b');
        const italicOpen = matchTag(input, pos, 'i');
        const colorOpen = matchColorTag(input, pos);
        const sizeOpen = matchSizeTag(input, pos);

        if (boldOpen) {
          flushText();
          pos = boldOpen.end;
          const children = parseNodes('</b>');
          result.push({ type: 'bold', children });
        } else if (italicOpen) {
          flushText();
          pos = italicOpen.end;
          const children = parseNodes('</i>');
          result.push({ type: 'italic', children });
        } else if (colorOpen) {
          flushText();
          pos = colorOpen.end;
          const children = parseNodes('</color>');
          result.push({ type: 'color', color: colorOpen.color, children });
        } else if (sizeOpen) {
          flushText();
          pos = sizeOpen.end;
          const children = parseNodes('</size>');
          result.push({ type: 'size', size: sizeOpen.size, children });
        } else {
          // Not a recognized tag, treat as literal text
          textBuf += input[pos];
          pos++;
        }
      } else {
        textBuf += input[pos];
        pos++;
      }
    }

    flushText();
    return result;
  }

  return parseNodes();
}

function matchTag(
  input: string,
  pos: number,
  tag: string
): { end: number } | null {
  const pattern = `<${tag}>`;
  if (input.startsWith(pattern, pos)) {
    return { end: pos + pattern.length };
  }
  return null;
}

function matchColorTag(
  input: string,
  pos: number
): { end: number; color: string } | null {
  // Match <color="...">, <color='...'>, or <color=#hex>
  const regex = /^<color=["']?([^"'>]+)["']?>/i;
  const slice = input.slice(pos);
  const match = regex.exec(slice);
  if (match) {
    return { end: pos + match[0].length, color: match[1] };
  }
  return null;
}

function matchSizeTag(
  input: string,
  pos: number
): { end: number; size: string } | null {
  // Match <size=30px> or <size="30px">
  const regex = /^<size=["']?([^"'>]+)["']?>/i;
  const slice = input.slice(pos);
  const match = regex.exec(slice);
  if (match) {
    return { end: pos + match[0].length, size: match[1] };
  }
  return null;
}

let keyCounter = 0;

function createBreakDivider(key: string): React.ReactNode {
  return React.createElement(
    'span',
    {
      key,
      style: {
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
        margin: '6px 0',
        fontSize: '10px',
        color: '#a08a6c',
        opacity: 0.5,
      },
    },
    React.createElement('span', { style: { flex: 1, borderTop: '1px dashed currentColor' } }),
    '\u2702',
    React.createElement('span', { style: { flex: 1, borderTop: '1px dashed currentColor' } })
  );
}

export function renderRokNodes(nodes: RokNode[]): React.ReactNode[] {
  return nodes.map((node) => {
    const key = `rok-${keyCounter++}`;
    switch (node.type) {
      case 'text':
        // Split by newlines and insert <br /> elements
        if (!node.content) return null;
        const parts = node.content.split('\n');
        if (parts.length === 1) {
          if (parts[0].trim() === '---') return createBreakDivider(key);
          return React.createElement(React.Fragment, { key }, node.content);
        }
        return React.createElement(
          React.Fragment,
          { key },
          ...parts.flatMap((part, i) => {
            if (part.trim() === '---') {
              return [createBreakDivider(`${key}-break-${i}`)];
            }
            return i === 0
              ? [part]
              : [React.createElement('br', { key: `${key}-br-${i}` }), part];
          })
        );
      case 'bold':
        return React.createElement(
          'span',
          { key, className: 'font-bold' },
          ...renderRokNodes(node.children || [])
        );
      case 'italic':
        return React.createElement(
          'span',
          { key, className: 'italic' },
          ...renderRokNodes(node.children || [])
        );
      case 'color':
        return React.createElement(
          'span',
          { key, style: { color: resolveColor(node.color || 'white') } },
          ...renderRokNodes(node.children || [])
        );
      case 'size':
        return React.createElement(
          'span',
          { key, style: { fontSize: node.size } },
          ...renderRokNodes(node.children || [])
        );
      default:
        return null;
    }
  });
}

export function renderRokMarkup(input: string): React.ReactNode[] {
  keyCounter = 0;
  const nodes = parseRokMarkup(input);
  return renderRokNodes(nodes);
}

export function stripRokMarkup(input: string): string {
  return input
    .replace(/<\/?b>/gi, '')
    .replace(/<\/?i>/gi, '')
    .replace(/<color=["']?[^"'>]*["']?>/gi, '')
    .replace(/<\/color>/gi, '')
    .replace(/<size=["']?[^"'>]*["']?>/gi, '')
    .replace(/<\/size>/gi, '');
}

/**
 * Strip markup but also return a position map:
 * positions[i] = index in the original markup where stripped character i lives.
 */
export function stripWithPositions(markup: string): { stripped: string; positions: number[] } {
  const tagPattern = /(<\/?b>|<\/?i>|<color=["']?[^"'>]*["']?>|<\/color>|<size=["']?[^"'>]*["']?>|<\/size>)/gi;

  let stripped = '';
  const positions: number[] = [];
  let lastIndex = 0;
  let match;

  while ((match = tagPattern.exec(markup)) !== null) {
    for (let i = lastIndex; i < match.index; i++) {
      positions.push(i);
      stripped += markup[i];
    }
    lastIndex = match.index + match[0].length;
  }

  for (let i = lastIndex; i < markup.length; i++) {
    positions.push(i);
    stripped += markup[i];
  }

  return { stripped, positions };
}

/**
 * Apply a plain-text edit back to the markup, preserving surrounding tags.
 * Finds the changed region via common prefix/suffix, maps it to markup
 * positions, and replaces only the text characters while keeping tags intact.
 * Falls back to plain text if the mapping produces inconsistent results.
 */
export function applyTextEdit(originalMarkup: string, newStripped: string): string {
  const { stripped: oldStripped, positions } = stripWithPositions(originalMarkup);

  if (oldStripped === newStripped) return originalMarkup;
  if (positions.length === 0) return newStripped;

  // Find common prefix
  let prefix = 0;
  const minLen = Math.min(oldStripped.length, newStripped.length);
  while (prefix < minLen && oldStripped[prefix] === newStripped[prefix]) {
    prefix++;
  }

  // Find common suffix (don't overlap with prefix)
  let suffix = 0;
  const maxSuffix = Math.min(oldStripped.length - prefix, newStripped.length - prefix);
  while (
    suffix < maxSuffix &&
    oldStripped[oldStripped.length - 1 - suffix] === newStripped[newStripped.length - 1 - suffix]
  ) {
    suffix++;
  }

  const insertText = newStripped.slice(prefix, newStripped.length - suffix);
  const oldEnd = oldStripped.length - suffix;

  if (oldEnd <= prefix) {
    // Pure insertion — insert right after the previous text character so
    // new text stays inside the same formatting tags (e.g. <b><color>t|</color></b>
    // rather than <b><color>t</color></b>| )
    let insertPos: number;
    if (prefix > 0) {
      const prevIdx = Math.min(prefix - 1, positions.length - 1);
      insertPos = positions[prevIdx] + 1;
    } else if (prefix < positions.length) {
      insertPos = positions[0];
    } else {
      insertPos = originalMarkup.length;
    }
    const result = originalMarkup.slice(0, insertPos) + insertText + originalMarkup.slice(insertPos);
    const { stripped: verify } = stripWithPositions(result);
    if (verify !== newStripped) return newStripped;
    return result;
  }

  // Remove individual text characters while preserving all tags between them.
  // Insert the new text at the position of the first removed character.
  const removedPositions = positions.slice(prefix, oldEnd);

  let result = '';
  let lastCopied = 0;
  let inserted = false;

  for (const pos of removedPositions) {
    // Copy everything from lastCopied up to this char (preserves tags)
    result += originalMarkup.slice(lastCopied, pos);
    if (!inserted) {
      result += insertText;
      inserted = true;
    }
    lastCopied = pos + 1; // skip the removed text char
  }

  // Copy the rest of the markup (preserves trailing tags)
  result += originalMarkup.slice(lastCopied);

  // Safety check: verify the result strips to what the user typed
  const { stripped: verify } = stripWithPositions(result);
  if (verify !== newStripped) {
    return newStripped; // fallback to plain text
  }

  return result;
}
