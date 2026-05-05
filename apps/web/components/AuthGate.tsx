'use client';

import { useState } from 'react';
import { Lock } from 'lucide-react';
import { meetsRole, useAuthRole, type AuthRole } from '@/lib/auth-role';

/** Reusable password gate. Once unlocked, the role persists in sessionStorage
 *  so navigating to another gated page doesn't re-prompt. */
export function AuthGate({
  require,
  children,
  className,
}: {
  require: AuthRole | AuthRole[];
  children: React.ReactNode;
  className?: string;
}) {
  const { role, unlockWith } = useAuthRole();
  const [pw, setPw] = useState('');
  const [error, setError] = useState('');

  if (meetsRole(role, require)) return <>{children}</>;

  const requiredList = Array.isArray(require) ? require : [require];
  const subtitle = requiredList
    .map((r) => r[0].toUpperCase() + r.slice(1))
    .join(' or ') + ' password required';

  const submit = () => {
    const r = unlockWith(pw);
    if (!r || !meetsRole(r, require)) {
      setError(r ? 'That role is not high enough for this page.' : 'Incorrect password');
      setPw('');
      return;
    }
    setError('');
    setPw('');
  };

  return (
    <div className={className ?? 'min-h-screen p-4 lg:p-8'}>
      <div className="max-w-md">
        <div className="rounded-xl border border-[var(--border)] bg-[var(--background-card)] p-6 space-y-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-lg bg-amber-500/10">
              <Lock className="w-5 h-5 text-amber-400" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-[var(--foreground)]">Restricted</h3>
              <p className="text-xs text-[var(--text-muted)]">{subtitle}</p>
            </div>
          </div>
          <div className="space-y-2">
            <input
              type="password"
              value={pw}
              onChange={(e) => { setPw(e.target.value); setError(''); }}
              onKeyDown={(e) => { if (e.key === 'Enter') submit(); }}
              placeholder="Enter password"
              className="w-full px-3 py-2 rounded-lg bg-[var(--background-secondary)] border border-[var(--border)] text-[var(--foreground)] text-sm placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--primary)]"
              autoFocus
            />
            {error && <div className="text-xs text-red-400">{error}</div>}
            <button
              onClick={submit}
              disabled={!pw}
              className="w-full px-4 py-2 rounded-lg bg-[var(--primary)] hover:bg-[var(--primary)]/90 text-white text-sm font-medium disabled:opacity-50"
            >
              Unlock
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
