'use client';

import { renderRokMarkup } from '@/lib/rok-mail/parser';

interface RokMailPreviewProps {
  content: string;
}

export function RokMailPreview({ content }: RokMailPreviewProps) {
  const rendered = content ? renderRokMarkup(content) : null;

  return (
    <div className="flex flex-col h-full">
      <div
        className="px-3 py-2 text-xs font-medium border-b"
        style={{ color: 'var(--text-secondary)', borderColor: 'var(--border)' }}
      >
        In-Game Mail Preview
      </div>
      <div
        className="flex-1 p-6 overflow-y-auto rounded-b-lg"
        style={{
          backgroundColor: '#f0e2c8',
          backgroundImage: 'linear-gradient(135deg, #f0e2c8 0%, #e8d5b0 50%, #f0e2c8 100%)',
          minHeight: '300px',
        }}
      >
        {rendered ? (
          <div className="text-sm leading-relaxed break-words whitespace-pre-wrap" style={{ color: '#2d1f0e' }}>
            {rendered}
          </div>
        ) : (
          <p className="text-sm italic" style={{ color: '#a08a6c' }}>
            Your formatted mail will appear here...
          </p>
        )}
      </div>
    </div>
  );
}
