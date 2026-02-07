export const ROK_SYMBOLS = {
  dividers: ['━', '═', '─', '—', '▬', '●', '◆', '◇', '•', '·'],
  arrows: ['▸', '▹', '►', '→', '➤', '➜', '↗', '⟹', '»', '›'],
  stars: ['★', '☆', '✦', '✧', '✪', '✯', '⭐', '⍟', '✫', '✬'],
  military: ['⚔', '🛡', '🏹', '⚜', '♛', '♚', '♜', '🗡', '🏰', '⚔️'],
  decorative: ['♦', '♣', '♠', '♥', '◈', '◉', '◎', '▪', '▫', '❖'],
  brackets: ['【', '】', '『', '』', '〖', '〗', '「', '」', '꧁', '꧂'],
  numbers: ['①', '②', '③', '④', '⑤', '⑥', '⑦', '⑧', '⑨', '⑩'],
  misc: ['⚡', '🔥', '💀', '👑', '🏆', '📢', '⚠', '✅', '❌', '🚨'],
} as const;

export type SymbolCategory = keyof typeof ROK_SYMBOLS;

export const SYMBOL_CATEGORY_LABELS: Record<SymbolCategory, string> = {
  dividers: 'Dividers',
  arrows: 'Arrows',
  stars: 'Stars',
  military: 'Military',
  decorative: 'Decorative',
  brackets: 'Brackets',
  numbers: 'Numbers',
  misc: 'Misc',
};

const RECENT_SYMBOLS_KEY = 'rok-mail-recent-symbols';
const MAX_RECENT = 10;

export function getRecentSymbols(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const stored = localStorage.getItem(RECENT_SYMBOLS_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

export function addRecentSymbol(symbol: string): void {
  if (typeof window === 'undefined') return;
  try {
    const recent = getRecentSymbols().filter((s) => s !== symbol);
    recent.unshift(symbol);
    localStorage.setItem(
      RECENT_SYMBOLS_KEY,
      JSON.stringify(recent.slice(0, MAX_RECENT))
    );
  } catch {
    // ignore
  }
}
