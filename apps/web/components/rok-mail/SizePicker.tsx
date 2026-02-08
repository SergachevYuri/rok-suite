'use client';

const SIZES = [
  { label: 'S', value: '18px' },
  { label: 'M', value: '22px' },
  { label: 'L', value: '28px' },
  { label: 'XL', value: '34px' },
  { label: '2XL', value: '42px' },
  { label: '3XL', value: '50px' },
];

interface SizePickerProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectSize: (size: string) => void;
}

export function SizePicker({ isOpen, onClose, onSelectSize }: SizePickerProps) {
  if (!isOpen) return null;

  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div
        className="absolute top-full left-0 mt-1 z-50 rounded-lg p-3 shadow-xl border"
        style={{
          backgroundColor: 'var(--background-card)',
          borderColor: 'var(--border)',
        }}
      >
        <p className="text-xs mb-2 font-medium" style={{ color: 'var(--text-secondary)' }}>
          Font Size
        </p>
        <div className="flex gap-1.5">
          {SIZES.map((size) => (
            <button
              key={size.value}
              type="button"
              onClick={() => { onSelectSize(size.value); onClose(); }}
              className="flex flex-col items-center gap-0.5 px-2.5 py-1.5 rounded-md border transition-fast hover:bg-pink-500/10 hover:border-pink-500/30"
              style={{ borderColor: 'var(--border)' }}
            >
              <span
                className="font-bold leading-none"
                style={{ fontSize: size.value, color: 'var(--foreground)' }}
              >
                A
              </span>
              <span className="text-[9px]" style={{ color: 'var(--text-muted)' }}>
                {size.label}
              </span>
            </button>
          ))}
        </div>
      </div>
    </>
  );
}
