'use client';

import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react';
import type { WarRoomRole } from '@/lib/kvk-map-types';
import { ADMIN_PASSWORD, OFFICER_PASSWORD } from '@/lib/auth-passwords';

const PASSWORDS: Record<Exclude<WarRoomRole, 'viewer'>, string> = {
  officer: OFFICER_PASSWORD,
  admin: ADMIN_PASSWORD,
};

const ROLE_RANK: Record<WarRoomRole, number> = { viewer: 0, officer: 1, admin: 2 };

const OFFICER_NAME_KEY = 'warroom-officer-name';

interface WarRoomAuthContextType {
  role: WarRoomRole;
  officerName: string | null;
  setOfficerName: (name: string | null) => void;
  isAtLeast: (minimumRole: WarRoomRole) => boolean;
  login: (password: string) => boolean;
  logout: () => void;
  showLoginPrompt: boolean;
  setShowLoginPrompt: (show: boolean) => void;
}

const WarRoomAuthContext = createContext<WarRoomAuthContextType | undefined>(undefined);

export function WarRoomAuthProvider({ children }: { children: ReactNode }) {
  const [role, setRole] = useState<WarRoomRole>('viewer');
  const [officerName, setOfficerNameState] = useState<string | null>(null);
  const [showLoginPrompt, setShowLoginPrompt] = useState(false);

  // Restore officer name from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem(OFFICER_NAME_KEY);
    if (saved) setOfficerNameState(saved);
  }, []);

  const setOfficerName = useCallback((name: string | null) => {
    setOfficerNameState(name);
    if (name) {
      localStorage.setItem(OFFICER_NAME_KEY, name);
    } else {
      localStorage.removeItem(OFFICER_NAME_KEY);
    }
  }, []);

  const isAtLeast = useCallback(
    (minimumRole: WarRoomRole) => ROLE_RANK[role] >= ROLE_RANK[minimumRole],
    [role]
  );

  const login = useCallback((password: string): boolean => {
    if (password === PASSWORDS.admin) {
      setRole('admin');
      setShowLoginPrompt(false);
      return true;
    }
    if (password === PASSWORDS.officer) {
      setRole('officer');
      setShowLoginPrompt(false);
      return true;
    }
    return false;
  }, []);

  const logout = useCallback(() => {
    setRole('viewer');
  }, []);

  return (
    <WarRoomAuthContext.Provider value={{ role, officerName, setOfficerName, isAtLeast, login, logout, showLoginPrompt, setShowLoginPrompt }}>
      {children}
    </WarRoomAuthContext.Provider>
  );
}

export function useWarRoomAuth() {
  const ctx = useContext(WarRoomAuthContext);
  if (!ctx) throw new Error('useWarRoomAuth must be used within WarRoomAuthProvider');
  return ctx;
}
