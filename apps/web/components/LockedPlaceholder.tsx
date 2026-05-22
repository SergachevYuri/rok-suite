'use client';

import { Lock } from 'lucide-react';
import { SignInButton } from './SignInButton';

/** Shared "this section is locked" panel used by AuthGate and any other
 *  in-page lock (e.g. the Upload tab). Keeps the sign-in entry point single:
 *  the inline SignInButton opens the same modal as the one in the header /
 *  sidebar footer, so there's never an in-page password form to maintain. */
export function LockedPlaceholder({
  title = 'Restricted',
  description = 'Sign in to access this section.',
  className,
}: {
  title?: string;
  description?: string;
  className?: string;
}) {
  return (
    <div className={className ?? 'min-h-[50vh] flex items-center justify-center p-4 lg:p-8'}>
      <div className="w-full max-w-md rounded-xl border border-[var(--border)] bg-[var(--background-card)] p-6 space-y-4 text-center">
        <div className="flex justify-center">
          <div className="p-2.5 rounded-lg bg-amber-500/10">
            <Lock className="w-5 h-5 text-amber-400" />
          </div>
        </div>
        <div>
          <h3 className="text-sm font-semibold text-[var(--foreground)]">{title}</h3>
          <p className="text-xs text-[var(--text-muted)] mt-1">{description}</p>
        </div>
        <div className="flex justify-center">
          <SignInButton />
        </div>
        <p className="text-[10px] text-[var(--text-muted)]/70">
          Or use the Sign in button in the top bar / sidebar.
        </p>
      </div>
    </div>
  );
}
