// Theme configuration using CSS variables for light/dark mode support

export function getTheme() {
  return {
    bg: 'bg-[var(--background)]',
    bgSecondary: 'bg-[var(--background-secondary)]',
    card: 'bg-[var(--background-card)] border-[var(--border)]',
    cardHover: 'hover:bg-[var(--background-hover)]',
    text: 'text-[var(--foreground)]',
    textMuted: 'text-[var(--text-secondary)]',
    textAccent: 'text-emerald-500',
    border: 'border-[var(--border)]',
    borderAccent: 'border-emerald-500',
    button: 'bg-[var(--background-secondary)] hover:bg-[var(--background-hover)] text-[var(--foreground)] border border-[var(--border)]',
    buttonPrimary: 'bg-emerald-500 hover:bg-emerald-600 text-white',
    buttonDanger: 'bg-red-500 hover:bg-red-600 text-white',
    input: 'bg-[var(--background-secondary)] border-[var(--border)] text-[var(--foreground)] placeholder-[var(--text-muted)]',
    sidebar: 'bg-[var(--background-card)]',
    sidebarActive: 'bg-emerald-500/10 text-emerald-500 border-emerald-500',
    sidebarHover: 'hover:bg-[var(--background-hover)]',
    badge: {
      solo: 'bg-sky-500/20 text-sky-500',
      alliance: 'bg-violet-500/20 text-violet-500',
      'coop-pve': 'bg-emerald-500/20 text-emerald-500',
      pvp: 'bg-red-500/20 text-red-500',
      continuous: 'bg-amber-500/20 text-amber-500',
    } as Record<string, string>,
    checkbox: {
      unchecked: 'border-[var(--border)] bg-[var(--background-secondary)]',
      checked: 'border-emerald-500 bg-emerald-500',
    },
  };
}

export type Theme = ReturnType<typeof getTheme>;
