'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import { AppSidebar } from '@/components/AppSidebar';
import { Map, Lock, Unlock, X } from 'lucide-react';

const ADMIN_PASSWORD = 'carn-dum';

const AdminMapView = dynamic(
  () => import('@/components/kvk-map/admin/AdminMapView'),
  {
    ssr: false,
    loading: () => (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="w-5 h-5 border border-[#4318ff] border-t-transparent rounded-full animate-spin" />
      </div>
    ),
  }
);

export default function KvkMapAdminPage() {
  const [isAdmin, setIsAdmin] = useState(false);
  const [showPasswordPrompt, setShowPasswordPrompt] = useState(false);
  const [password, setPassword] = useState('');

  const handleLogin = () => {
    if (password === ADMIN_PASSWORD) {
      setIsAdmin(true);
      setShowPasswordPrompt(false);
      setPassword('');
    } else {
      alert('Incorrect password');
      setPassword('');
    }
  };

  return (
    <AppSidebar>
      <div className="max-w-[1800px] mx-auto p-4 md:p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <Map size={28} className="text-orange-500" />
            <h1
              className="text-2xl font-bold"
              style={{ color: 'var(--foreground)' }}
            >
              KvK Map Builder
            </h1>
          </div>
          <div className="flex items-center gap-2">
            {isAdmin ? (
              <button
                onClick={() => setIsAdmin(false)}
                className="p-2 rounded-md hover:bg-blue-500/10 transition-all"
                title="Lock admin"
              >
                <Unlock size={18} className="text-blue-400" />
              </button>
            ) : (
              <button
                onClick={() => setShowPasswordPrompt(true)}
                className="p-2 rounded-md hover:bg-[var(--background-secondary)] transition-all"
                style={{ color: 'var(--text-muted)' }}
                title="Admin login"
              >
                <Lock size={18} />
              </button>
            )}
          </div>
        </div>

        {/* Password prompt */}
        {showPasswordPrompt && (
          <div
            className="mb-4 p-4 rounded-lg border flex items-center gap-3"
            style={{
              backgroundColor: 'var(--background-card)',
              borderColor: 'var(--border)',
            }}
          >
            <Lock size={16} style={{ color: 'var(--text-muted)' }} />
            <input
              type="password"
              placeholder="Admin password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
              className="flex-1 rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500/50"
              style={{
                backgroundColor: 'var(--background-secondary)',
                borderColor: 'var(--border)',
                color: 'var(--foreground)',
              }}
              autoFocus
            />
            <button
              onClick={handleLogin}
              className="px-4 py-2 rounded-md text-sm font-medium bg-blue-500/20 text-blue-400 hover:bg-blue-500/30 transition-all"
            >
              Enter
            </button>
            <button
              onClick={() => {
                setShowPasswordPrompt(false);
                setPassword('');
              }}
              className="p-2 rounded-md hover:bg-[var(--background-secondary)]"
              style={{ color: 'var(--text-muted)' }}
            >
              <X size={16} />
            </button>
          </div>
        )}

        {/* Auth gate */}
        {isAdmin ? (
          <AdminMapView />
        ) : (
          <div
            className="text-center py-20 rounded-xl border"
            style={{
              backgroundColor: 'var(--background-card)',
              borderColor: 'var(--border)',
              color: 'var(--text-muted)',
            }}
          >
            <Map size={48} className="mx-auto mb-4 opacity-30" />
            <p
              className="text-lg font-medium mb-2"
              style={{ color: 'var(--text-secondary)' }}
            >
              KvK Map Builder
            </p>
            <p className="text-sm">
              Admin access required. Click the lock icon to enter.
            </p>
          </div>
        )}
      </div>
    </AppSidebar>
  );
}
