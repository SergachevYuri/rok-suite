'use client';

import { useState } from 'react';
import { Map, Lock, Unlock, X } from 'lucide-react';
import { useWarRoomAuth } from '@/lib/kvk-map/war-room-auth';
import StrategySelector from './StrategySelector';
import type { KvkStrategy, KvkAssignment, KvkAlliance } from '@/lib/kvk-map-types';

interface WarRoomHeaderProps {
  strategies: KvkStrategy[];
  activeStrategyId: string | null;
  onSelectStrategy: (id: string | null) => void;
  onSaveStrategy: (name: string) => void;
  onDeleteStrategy: (id: string) => void;
}

const ROLE_COLORS: Record<string, string> = {
  officer: '#3b82f6',
  admin: '#f59e0b',
};

const ROLE_LABELS: Record<string, string> = {
  officer: 'Officer',
  admin: 'Admin',
};

export default function WarRoomHeader({
  strategies,
  activeStrategyId,
  onSelectStrategy,
  onSaveStrategy,
  onDeleteStrategy,
}: WarRoomHeaderProps) {
  const { role, login, logout, showLoginPrompt, setShowLoginPrompt } = useWarRoomAuth();
  const [password, setPassword] = useState('');

  const handleLogin = () => {
    const success = login(password);
    if (!success) {
      alert('Invalid password');
    }
    setPassword('');
  };

  return (
    <div className="mb-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Map size={28} style={{ color: '#f59e0b' }} />
          <div>
            <h1
              className="text-2xl font-bold"
              style={{ color: 'var(--foreground)' }}
            >
              KvK War Room
            </h1>
            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
              Interactive KvK planning tool
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Strategy selector (officer+) */}
          {role !== 'viewer' && (
            <StrategySelector
              strategies={strategies}
              activeStrategyId={activeStrategyId}
              onSelect={onSelectStrategy}
              onSave={onSaveStrategy}
              onDelete={onDeleteStrategy}
            />
          )}

          {/* Auth button */}
          {role === 'viewer' ? (
            <button
              onClick={() => setShowLoginPrompt(!showLoginPrompt)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
              style={{
                backgroundColor: 'var(--background-card)',
                border: '1px solid var(--border)',
                color: 'var(--text-muted)',
              }}
            >
              <Lock size={14} />
              Login
            </button>
          ) : (
            <div className="flex items-center gap-1.5">
              <span
                className="text-xs font-semibold px-2 py-1 rounded"
                style={{
                  backgroundColor: `${ROLE_COLORS[role]}20`,
                  color: ROLE_COLORS[role],
                }}
              >
                {ROLE_LABELS[role]}
              </span>
              <button
                onClick={logout}
                className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs transition-all"
                style={{ color: 'var(--text-muted)' }}
                title="Logout"
              >
                <Unlock size={14} />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Password prompt */}
      {showLoginPrompt && (
        <div
          className="flex items-center gap-2 mt-3 p-3 rounded-lg border"
          style={{
            backgroundColor: 'var(--background-card)',
            borderColor: 'var(--border)',
          }}
        >
          <Lock size={14} style={{ color: 'var(--text-muted)' }} />
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
            placeholder="Enter password..."
            autoFocus
            className="flex-1 bg-transparent text-sm outline-none"
            style={{ color: 'var(--foreground)' }}
          />
          <button
            onClick={handleLogin}
            className="px-3 py-1 rounded-md text-xs font-medium"
            style={{ backgroundColor: '#4318ff', color: 'white' }}
          >
            Enter
          </button>
          <button
            onClick={() => { setShowLoginPrompt(false); setPassword(''); }}
            style={{ color: 'var(--text-muted)' }}
          >
            <X size={14} />
          </button>
        </div>
      )}
    </div>
  );
}
