import React from 'react';
import { resolveColor } from './colors';

export interface RokNode {
  type: 'text' | 'bold' | 'italic' | 'color';
  content?: string;
  children?: RokNode[];
  color?: string;
}

export function parseRokMarkup(input: string): RokNode[] {
  let pos = 0;
  const nodes: RokNode[] = [];

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

  nodes.push(...parseNodes());
  return nodes;
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
  // Match <color="..."> or <color='...'>
  const regex = /^<color=["']([^"']+)["']>/i;
  const slice = input.slice(pos);
  const match = regex.exec(slice);
  if (match) {
    return { end: pos + match[0].length, color: match[1] };
  }
  return null;
}

let keyCounter = 0;

export function renderRokNodes(nodes: RokNode[]): React.ReactNode[] {
  return nodes.map((node) => {
    const key = `rok-${keyCounter++}`;
    switch (node.type) {
      case 'text':
        // Split by newlines and insert <br /> elements
        if (!node.content) return null;
        const parts = node.content.split('\n');
        if (parts.length === 1) return React.createElement(React.Fragment, { key }, node.content);
        return React.createElement(
          React.Fragment,
          { key },
          ...parts.flatMap((part, i) =>
            i === 0
              ? [part]
              : [React.createElement('br', { key: `${key}-br-${i}` }), part]
          )
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
    .replace(/<color=["'][^"']*["']>/gi, '')
    .replace(/<\/color>/gi, '');
}
