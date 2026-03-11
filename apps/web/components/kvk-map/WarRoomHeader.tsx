'use client';

import { useState, useEffect, useMemo } from 'react';
import { Map, Lock, Unlock, X, User, ChevronDown, HelpCircle, Swords } from 'lucide-react';
import { useWarRoomAuth } from '@/lib/kvk-map/war-room-auth';
import { supabase } from '@/lib/supabase';
import SearchableSelect, { type SearchableOption } from '@/components/ui/SearchableSelect';
import StrategySelector from './StrategySelector';
import type { KvkStrategy } from '@/lib/kvk-map-types';

interface WarRoomHeaderProps {
  strategies: KvkStrategy[];
  activeStrategyId: string | null;
  onSelectStrategy: (id: string | null) => void;
  onSaveStrategy: (name: string) => void;
  onDeleteStrategy: (id: string) => void;
  warPlanActive?: boolean;
  onToggleWarPlan?: () => void;
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
  warPlanActive,
  onToggleWarPlan,
}: WarRoomHeaderProps) {
  const { role, officerName, setOfficerName, login, logout, showLoginPrompt, setShowLoginPrompt } = useWarRoomAuth();
  const [password, setPassword] = useState('');
  const [officerNames, setOfficerNames] = useState<{ name: string; role: string }[]>([]);
  const [showNamePicker, setShowNamePicker] = useState(false);
  const [showHelp, setShowHelp] = useState(false);

  // Fetch R4/R5 names from roster when logged in as officer+
  useEffect(() => {
    if (role === 'viewer') return;
    supabase
      .from('alliance_roster')
      .select('name, role')
      .eq('is_active', true)
      .in('role', ['R4', 'R5'])
      .order('name', { ascending: true })
      .then(({ data }) => {
        if (data) setOfficerNames(data.map((r) => ({ name: r.name, role: r.role })));
      });
  }, [role]);

  const officerOptions = useMemo<SearchableOption[]>(
    () => officerNames.map((o) => ({ value: o.name, label: o.name, secondary: o.role })),
    [officerNames],
  );

  // Show name picker after login if no name is set
  useEffect(() => {
    if (role !== 'viewer' && !officerName && officerNames.length > 0) {
      setShowNamePicker(true);
    }
  }, [role, officerName, officerNames]);

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

          {/* War Plan toggle (officer+) */}
          {role !== 'viewer' && onToggleWarPlan && (
            <button
              onClick={onToggleWarPlan}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
              style={{
                backgroundColor: warPlanActive ? 'rgba(239,68,68,0.15)' : 'var(--background-card)',
                border: `1px solid ${warPlanActive ? 'rgba(239,68,68,0.3)' : 'var(--border)'}`,
                color: warPlanActive ? '#ef4444' : 'var(--text-muted)',
              }}
            >
              <Swords size={14} />
              War Plan
            </button>
          )}

          {/* Help button */}
          <button
            onClick={() => setShowHelp(!showHelp)}
            className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-xs font-medium transition-all"
            style={{
              backgroundColor: showHelp ? 'rgba(59,130,246,0.15)' : 'var(--background-card)',
              border: `1px solid ${showHelp ? 'rgba(59,130,246,0.3)' : 'var(--border)'}`,
              color: showHelp ? '#3b82f6' : 'var(--text-muted)',
            }}
            title="Help & shortcuts"
          >
            <HelpCircle size={14} />
          </button>

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
              {officerName && (
                <button
                  onClick={() => setShowNamePicker(true)}
                  className="flex items-center gap-1 text-xs px-2 py-1 rounded transition-all hover:bg-white/5"
                  style={{ color: 'var(--foreground)' }}
                  title="Change identity"
                >
                  <User size={12} />
                  {officerName}
                  <ChevronDown size={10} style={{ color: 'var(--text-muted)' }} />
                </button>
              )}
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

      {/* Help panel */}
      {showHelp && (
        <div
          className="mt-3 p-4 rounded-lg border text-xs space-y-4"
          style={{
            backgroundColor: 'var(--background-card)',
            borderColor: 'var(--border)',
            color: 'var(--text-secondary)',
          }}
        >
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold" style={{ color: 'var(--foreground)' }}>
              How to Use the War Room
            </h3>
            <button onClick={() => setShowHelp(false)} style={{ color: 'var(--text-muted)' }}>
              <X size={14} />
            </button>
          </div>

          <div>
            <h4 className="font-semibold mb-1" style={{ color: 'var(--foreground)' }}>Overview</h4>
            <p>The KvK War Room is an interactive map for planning kingdom vs kingdom strategy. Click on any building (pass, circle, hieron, etc.) to see its buffs, honor rates, and first-occupation rewards. Officers can assign buildings to alliances, place flags &amp; fortresses, and create strategies.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <h4 className="font-semibold mb-1.5" style={{ color: 'var(--foreground)' }}>Navigation</h4>
              <ul className="space-y-1">
                <li><strong>Pan</strong> — Click and drag the map</li>
                <li><strong>Zoom</strong> — Scroll wheel or pinch</li>
                <li><strong>Select</strong> — Click any building or flag</li>
                <li><strong>Deselect</strong> — Press <kbd className="px-1 py-0.5 rounded text-[10px]" style={{ backgroundColor: 'var(--background-secondary)', border: '1px solid var(--border)' }}>Esc</kbd> or click empty space</li>
              </ul>
            </div>

            <div>
              <h4 className="font-semibold mb-1.5" style={{ color: 'var(--foreground)' }}>Keyboard Shortcuts</h4>
              <ul className="space-y-1">
                <li><kbd className="px-1 py-0.5 rounded text-[10px]" style={{ backgroundColor: 'var(--background-secondary)', border: '1px solid var(--border)' }}>Arrow keys</kbd> — Nudge selected feature by 1 tile</li>
                <li><kbd className="px-1 py-0.5 rounded text-[10px]" style={{ backgroundColor: 'var(--background-secondary)', border: '1px solid var(--border)' }}>Shift + Arrows</kbd> — Nudge by 5 tiles</li>
                <li><kbd className="px-1 py-0.5 rounded text-[10px]" style={{ backgroundColor: 'var(--background-secondary)', border: '1px solid var(--border)' }}>Ctrl/Cmd + Z</kbd> — Undo last move</li>
                <li><kbd className="px-1 py-0.5 rounded text-[10px]" style={{ backgroundColor: 'var(--background-secondary)', border: '1px solid var(--border)' }}>Esc</kbd> — Cancel placement / clear selection</li>
              </ul>
            </div>

            <div>
              <h4 className="font-semibold mb-1.5" style={{ color: 'var(--foreground)' }}>Placing Flags &amp; Fortresses</h4>
              <ul className="space-y-1">
                <li>Click the <strong>Flag</strong> or <strong>Fortress</strong> button in the sidebar</li>
                <li>Click on the map to place it</li>
                <li>Placement auto-cancels after placing one</li>
                <li>Drag a placed flag/fortress to reposition it</li>
                <li>Use arrow keys for precise positioning</li>
              </ul>
            </div>

            <div>
              <h4 className="font-semibold mb-1.5" style={{ color: 'var(--foreground)' }}>Buildings &amp; Assignments</h4>
              <ul className="space-y-1">
                <li>Click any building to view its <strong>buffs</strong>, <strong>honor rates</strong>, and <strong>first-occupation rewards</strong></li>
                <li>Officers can assign buildings to alliances</li>
                <li>Use the <strong>layer toggles</strong> in the sidebar to show/hide feature types</li>
                <li>Click a <strong>zone</strong> to focus on buildings within it</li>
              </ul>
            </div>
          </div>

          <div style={{ borderTop: '1px solid var(--border)', paddingTop: '8px', color: 'var(--text-muted)' }}>
            <strong>Tip:</strong> Coordinates are shown at the bottom-left of the map. Use them to match in-game locations.
          </div>
        </div>
      )}

      {/* Officer name picker */}
      {showNamePicker && role !== 'viewer' && (
        <div
          className="flex items-center gap-2 mt-3 p-3 rounded-lg border"
          style={{
            backgroundColor: 'var(--background-card)',
            borderColor: 'var(--border)',
          }}
        >
          <User size={14} style={{ color: '#3b82f6' }} />
          <span className="text-xs font-medium shrink-0" style={{ color: 'var(--text-secondary)' }}>
            Who are you?
          </span>
          <SearchableSelect
            options={officerOptions}
            value={officerName}
            onChange={(val) => {
              if (val) {
                setOfficerName(val);
                setShowNamePicker(false);
              }
            }}
            placeholder="Search your name..."
            compact
            autoFocus
          />
          {officerName && (
            <button
              onClick={() => setShowNamePicker(false)}
              style={{ color: 'var(--text-muted)' }}
            >
              <X size={14} />
            </button>
          )}
        </div>
      )}
    </div>
  );
}
