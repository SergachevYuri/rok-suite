'use client';

import { ChevronLeft } from 'lucide-react';
import type { ReactNode } from 'react';

// ─── Overlay wrapper with "Back" button ──────────────────────────────

function OverlayPanel({
  backLabel,
  onBack,
  children,
}: {
  backLabel: string;
  onBack: () => void;
  children: ReactNode;
}) {
  return (
    <div>
      <button
        onClick={onBack}
        className="flex items-center gap-1 px-2 py-1.5 mb-1 rounded-lg text-[11px] font-medium transition-all hover:bg-white/5 w-full"
        style={{ color: 'var(--text-muted)' }}
      >
        <ChevronLeft size={12} />
        Back to {backLabel}
      </button>
      {children}
    </div>
  );
}

// ─── Main Right Sidebar ──────────────────────────────────────────────

interface RightSidebarProps {
  // Base panel content (rendered by parent)
  basePanel: ReactNode;
  basePanelLabel: string;
  // Overlay panel content (feature/zone detail, rendered by parent)
  overlayPanel: ReactNode | null;
  // Callback to clear the overlay (close feature/zone selection)
  onClearOverlay: () => void;
  // Whether to show at all
  visible: boolean;
}

export default function RightSidebar({
  basePanel,
  basePanelLabel,
  overlayPanel,
  onClearOverlay,
  visible,
}: RightSidebarProps) {
  if (!visible) return null;

  return (
    <div className="lg:w-72 shrink-0 overflow-y-auto">
      {overlayPanel ? (
        <OverlayPanel backLabel={basePanelLabel} onBack={onClearOverlay}>
          {overlayPanel}
        </OverlayPanel>
      ) : (
        basePanel
      )}
    </div>
  );
}
