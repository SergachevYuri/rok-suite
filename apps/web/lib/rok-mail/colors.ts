export interface RokColor {
  name: string;
  hex: string;
  display: string; // Tailwind-friendly color for preview
}

export const ROK_COLORS: RokColor[] = [
  { name: 'red', hex: '#ff0000', display: '#ef4444' },
  { name: 'blue', hex: '#0000ff', display: '#3b82f6' },
  { name: 'green', hex: '#00ff00', display: '#15803d' },
  { name: 'yellow', hex: '#ffff00', display: '#a16207' },
  { name: 'orange', hex: '#ff8000', display: '#ea580c' },
  { name: 'purple', hex: '#800080', display: '#a855f7' },
  { name: 'cyan', hex: '#00ffff', display: '#0891b2' },
  { name: 'magenta', hex: '#ff00ff', display: '#d946ef' },
  { name: 'pink', hex: '#ffc0cb', display: '#ec4899' },
  { name: 'gold', hex: '#ffd700', display: '#b45309' },
  { name: 'white', hex: '#ffffff', display: '#6b7280' },
];

export function resolveColor(colorValue: string): string {
  if (colorValue.startsWith('#')) return colorValue;
  const preset = ROK_COLORS.find(
    (c) => c.name.toLowerCase() === colorValue.toLowerCase()
  );
  return preset ? preset.display : colorValue;
}
