'use client';

import { useState, useRef, useEffect } from 'react';
import { LogIn, LogOut, ShieldCheck, Lock, X } from 'lucide-react';
import { useAuthRole, meetsRole, type AuthRole } from '@/lib/auth-role';

interface SignInButtonProps {
  collapsed?: boolean;
  /** Where to anchor the role-chip dropdown menu. Defaults to `'down'` so it
   *  doesn't get clipped when the button sits in a page header at the top of
   *  the viewport. The sidebar footer passes `'up'` because its button is at
   *  the bottom of the side panel. */
  menuPlacement?: 'up' | 'down';
}

const ROLE_STYLE: Record<AuthRole, { label: string; classes: string }> = {
  admin: { label: 'Admin', classes: 'bg-rose-500/15 text-rose-400 border-rose-500/30' },
  officer: { label: 'Officer', classes: 'bg-amber-500/15 text-amber-400 border-amber-500/30' },
  power: { label: 'Power', classes: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' },
};

export function SignInButton({ collapsed = false, menuPlacement = 'down' }: SignInButtonProps) {
  const { role, unlockWith, signOut } = useAuthRole();
  const [modalOpen, setModalOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [pw, setPw] = useState('');
  const [error, setError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (modalOpen) {
      setPw('');
      setError('');
      // Focus next tick so the modal is mounted
      const id = setTimeout(() => inputRef.current?.focus(), 30);
      return () => clearTimeout(id);
    }
  }, [modalOpen]);

  useEffect(() => {
    if (!menuOpen) return;
    const onClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [menuOpen]);

  const handleSubmit = () => {
    const r = unlockWith(pw);
    if (!r) {
      setError('Incorrect password');
      setPw('');
      inputRef.current?.focus();
      return;
    }
    setModalOpen(false);
  };

  // Signed in state — show role chip with menu
  if (role) {
    const style = ROLE_STYLE[role];
    return (
      <div className="relative" ref={menuRef}>
        <button
          type="button"
          onClick={() => setMenuOpen((v) => !v)}
          className={`flex items-center gap-2 rounded-lg border transition-colors ${style.classes} ${
            collapsed ? 'p-2' : 'px-2.5 py-1.5'
          }`}
          title={style.label}
        >
          <ShieldCheck className="w-4 h-4" />
          {!collapsed && <span className="text-xs font-medium">{style.label}</span>}
        </button>

        {menuOpen && (
          <div
            className={`absolute ${
              collapsed
                ? 'left-full ml-2 bottom-0'
                : menuPlacement === 'up'
                  ? 'right-0 bottom-full mb-2'
                  : 'right-0 top-full mt-2'
            } w-44 rounded-xl bg-[var(--background-card)] border border-[var(--border)] shadow-lg overflow-hidden z-[60]`}
          >
            <div className="px-3 py-2 border-b border-[var(--border)]">
              <p className="text-[10px] uppercase tracking-wider text-[var(--text-muted)]">
                Signed in as
              </p>
              <p className="text-sm font-medium text-[var(--foreground)]">{style.label}</p>
            </div>
            {!meetsRole(role, 'admin') && (
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false);
                  setModalOpen(true);
                }}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-[var(--text-secondary)] hover:bg-[var(--background-secondary)] hover:text-[var(--foreground)] transition-colors"
              >
                <LogIn className="w-3.5 h-3.5" />
                Switch role
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                signOut();
                setMenuOpen(false);
              }}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-400 hover:bg-red-500/10 transition-colors"
            >
              <LogOut className="w-3.5 h-3.5" />
              Sign out
            </button>
          </div>
        )}

        {modalOpen && (
          <SignInModal
            inputRef={inputRef}
            pw={pw}
            error={error}
            onChange={(v) => {
              setPw(v);
              setError('');
            }}
            onSubmit={handleSubmit}
            onClose={() => setModalOpen(false)}
          />
        )}
      </div>
    );
  }

  // Signed out — show Sign in button
  return (
    <>
      <button
        type="button"
        onClick={() => setModalOpen(true)}
        className={`flex items-center gap-2 rounded-lg text-[var(--text-muted)] hover:text-[var(--foreground)] hover:bg-[var(--background-secondary)] transition-colors ${
          collapsed ? 'p-2' : 'px-2.5 py-1.5'
        }`}
        title="Sign in"
      >
        <LogIn className="w-4 h-4" />
        {!collapsed && <span className="text-xs font-medium">Sign in</span>}
      </button>

      {modalOpen && (
        <SignInModal
          inputRef={inputRef}
          pw={pw}
          error={error}
          onChange={(v) => {
            setPw(v);
            setError('');
          }}
          onSubmit={handleSubmit}
          onClose={() => setModalOpen(false)}
        />
      )}
    </>
  );
}

interface SignInModalProps {
  inputRef: React.RefObject<HTMLInputElement | null>;
  pw: string;
  error: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  onClose: () => void;
}

function SignInModal({ inputRef, pw, error, onChange, onSubmit, onClose }: SignInModalProps) {
  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-2xl bg-[var(--background-card)] border border-[var(--border)] p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-lg bg-amber-500/10">
              <Lock className="w-5 h-5 text-amber-400" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-[var(--foreground)]">Sign in</h3>
              <p className="text-xs text-[var(--text-muted)]">
                Enter the admin, officer or power password
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-md text-[var(--text-muted)] hover:text-[var(--foreground)] hover:bg-[var(--background-secondary)] transition-colors"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="space-y-3">
          <input
            ref={inputRef}
            type="password"
            value={pw}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') onSubmit();
              if (e.key === 'Escape') onClose();
            }}
            placeholder="Password"
            className="w-full px-3 py-2.5 rounded-lg bg-[var(--background-secondary)] border border-[var(--border)] text-[var(--foreground)] text-sm placeholder:text-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-[#4318ff]/40"
            autoComplete="current-password"
          />
          {error && <p className="text-xs text-red-400">{error}</p>}
          <button
            type="button"
            onClick={onSubmit}
            disabled={!pw}
            className="w-full px-4 py-2.5 rounded-lg bg-gradient-to-r from-[#4318ff] to-[#7c3aed] text-white text-sm font-medium shadow-lg shadow-[#4318ff]/20 hover:shadow-[#4318ff]/40 transition-shadow disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Sign in
          </button>
        </div>
      </div>
    </div>
  );
}
