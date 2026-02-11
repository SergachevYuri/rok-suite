'use client';

import { renderRokMarkup } from '@/lib/rok-mail/parser';

interface RokMailPreviewProps {
  content: string;
  variant?: 'mail' | 'alliance';
}

const VARIANT_STYLES = {
  mail: {
    label: 'In-Game Mail Preview',
    bg: '#f0e2c8',
    bgImage: 'linear-gradient(135deg, #f0e2c8 0%, #e8d5b0 50%, #f0e2c8 100%)',
    text: '#2d1f0e',
    placeholder: '#a08a6c',
  },
  alliance: {
    label: 'Alliance Description Preview',
    bg: '#4a90b8',
    bgImage: 'linear-gradient(135deg, #4a90b8 0%, #3d7fa8 50%, #4a90b8 100%)',
    text: '#1a1a1a',
    placeholder: '#6db3d4',
  },
};

export function RokMailPreview({ content, variant = 'mail' }: RokMailPreviewProps) {
  const rendered = content ? renderRokMarkup(content) : null;
  const style = VARIANT_STYLES[variant];

  return (
    <div className="flex flex-col h-full">
      <div
        className="px-3 py-2 text-xs font-medium border-b"
        style={{ color: 'var(--text-secondary)', borderColor: 'var(--border)' }}
      >
        {style.label}
      </div>
      <div
        className="flex-1 p-6 overflow-y-auto rounded-b-lg"
        style={{
          backgroundColor: style.bg,
          backgroundImage: style.bgImage,
          minHeight: '300px',
        }}
      >
        {rendered ? (
          <div className="text-sm leading-relaxed break-words whitespace-pre-wrap" style={{ color: style.text }}>
            {rendered}
          </div>
        ) : (
          <p className="text-sm italic" style={{ color: style.placeholder }}>
            {variant === 'alliance' ? 'Your alliance description will appear here...' : 'Your formatted mail will appear here...'}
          </p>
        )}
      </div>
    </div>
  );
}
