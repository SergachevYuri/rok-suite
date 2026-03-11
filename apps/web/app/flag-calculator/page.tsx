'use client';

import { useState, useMemo, useEffect } from 'react';
import { Flag, Wheat, Mountain, Coins, TrendingUp, Gem, Medal, CalendarClock, ChevronsUp } from 'lucide-react';
import { AppSidebar } from '@/components/AppSidebar';

function LogIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <ellipse cx="18" cy="12" rx="2" ry="5" />
      <path d="M18 7H8a4 5 0 0 0 0 10h10" />
      <circle cx="8" cy="12" r="1.5" />
    </svg>
  );
}

// Per-flag BASE costs (no tech discount) for LK crusader flags.
// The rok.guide table shows costs at max tech (-25%), so base = table / 0.75.
//
// Architecture I discount: [0, 1, 2.5, 4, 6, 10]% (levels 0-5)
// Architecture II discount: [0, 1, 2, 3, 4, 5, 6, 7.5, 9, 11, 15]% (levels 0-10)
// Total discount is additive. Max = 10% + 15% = 25%.

const ARCH1_DISCOUNT = [0, 0.01, 0.025, 0.04, 0.06, 0.10];
const ARCH2_DISCOUNT = [0, 0.01, 0.02, 0.03, 0.04, 0.05, 0.06, 0.075, 0.09, 0.11, 0.15];

interface FlagCost {
  food: number; wood: number; stone: number; gold: number;
  crystals: number; credits: number;
}

function getFlagCost(flagNumber: number, discount: number): FlagCost {
  const mult = 1 - discount;
  const tier20 = Math.floor((flagNumber - 1) / 20);
  // Base costs (before any tech discount)
  const baseFood = 100_000 + 25_000 * tier20;
  const food = Math.round(baseFood * mult);
  return {
    food,
    wood: food,
    stone: Math.round(baseFood * 0.75 * mult),
    gold: Math.round(baseFood * 0.5 * mult),
    crystals: flagNumber <= 20 ? 0 : Math.round(5_000 * Math.floor((flagNumber - 1) / 10) * mult),
    credits: flagNumber <= 10 ? Math.round(100_000 * mult) : flagNumber <= 20 ? Math.round(200_000 * mult) : 0,
  };
}

function totalCostForFlags(fromFlag: number, count: number, discount: number): FlagCost {
  const total: FlagCost = { food: 0, wood: 0, stone: 0, gold: 0, crystals: 0, credits: 0 };
  for (let i = 0; i < count; i++) {
    const cost = getFlagCost(fromFlag + i, discount);
    for (const k of RSS_KEYS) total[k] += cost[k];
  }
  return total;
}

// Simulate building flags over time: resources accumulate via production,
// and flags are built greedily as soon as affordable (each flag is instant).
// Returns { count, remaining, timeline } where timeline shows when each flag becomes affordable.
function simulateFlagBuilding(
  currentFlags: number,
  startResources: FlagCost,
  productionPerHour: FlagCost,
  maxHours: number,
  resourceCaps: FlagCost,
  discount: number,
) {
  const resources = { ...startResources };
  const timeline: { flagNumber: number; hoursIn: number }[] = [];
  let flagsBuilt = 0;

  // We simulate in small steps. To be efficient, jump to the next time a flag becomes affordable.
  const MAX_FLAGS = 1000; // safety limit
  let hoursElapsed = 0;

  while (hoursElapsed <= maxHours && flagsBuilt < MAX_FLAGS) {
    const nextFlag = currentFlags + flagsBuilt + 1;
    const cost = getFlagCost(nextFlag, discount);

    // Can we afford it right now?
    if (RSS_KEYS.every(k => resources[k] >= cost[k])) {
      for (const k of RSS_KEYS) resources[k] -= cost[k];
      timeline.push({ flagNumber: nextFlag, hoursIn: hoursElapsed });
      flagsBuilt++;
      continue;
    }

    // Find hours until we can afford this flag (considering caps)
    let hoursNeeded = 0;
    let impossible = false;
    for (const k of RSS_KEYS) {
      const deficit = cost[k] - resources[k];
      if (deficit <= 0) continue;
      const prod = productionPerHour[k];
      if (prod <= 0) {
        // Check if cap is high enough
        if (resources[k] < cost[k]) { impossible = true; break; }
        continue;
      }
      // Account for resource cap: production stops when cap is hit
      const cap = resourceCaps[k];
      if (cap > 0 && cap < cost[k]) { impossible = true; break; }
      hoursNeeded = Math.max(hoursNeeded, deficit / prod);
    }

    if (impossible || hoursNeeded === 0) break;
    if (hoursElapsed + hoursNeeded > maxHours) {
      // Add remaining production until deadline
      const remaining = maxHours - hoursElapsed;
      for (const k of RSS_KEYS) {
        resources[k] += productionPerHour[k] * remaining;
        if (resourceCaps[k] > 0) resources[k] = Math.min(resources[k], resourceCaps[k]);
      }
      hoursElapsed = maxHours;
      // Check if we can squeeze one more flag
      const lastCost = getFlagCost(nextFlag, discount);
      if (RSS_KEYS.every(k => resources[k] >= lastCost[k])) {
        for (const k of RSS_KEYS) resources[k] -= lastCost[k];
        timeline.push({ flagNumber: nextFlag, hoursIn: hoursElapsed });
        flagsBuilt++;
      }
      break;
    }

    // Jump forward
    hoursElapsed += hoursNeeded;
    for (const k of RSS_KEYS) {
      resources[k] += productionPerHour[k] * hoursNeeded;
      if (resourceCaps[k] > 0) resources[k] = Math.min(resources[k], resourceCaps[k]);
    }
  }

  return { count: flagsBuilt, remaining: resources, timeline };
}

function maxFlagsAffordable(currentFlags: number, resources: FlagCost, discount: number) {
  let count = 0;
  const remaining = { ...resources };
  while (true) {
    const cost = getFlagCost(currentFlags + count + 1, discount);
    if (RSS_KEYS.some(k => remaining[k] < cost[k])) break;
    for (const k of RSS_KEYS) remaining[k] -= cost[k];
    count++;
  }
  return { count, remaining };
}

function formatNum(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(2).replace(/\.?0+$/, '') + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1).replace(/\.?0+$/, '') + 'K';
  return n.toLocaleString();
}

function formatNumFull(n: number): string {
  return n.toLocaleString();
}

function formatHours(hours: number): string {
  if (hours < 1) return `${Math.ceil(hours * 60)}m`;
  if (hours < 24) return `${hours.toFixed(1)}h`;
  const days = Math.floor(hours / 24);
  const h = Math.round(hours % 24);
  return h > 0 ? `${days}d ${h}h` : `${days}d`;
}

function toUTCDatetimeLocal(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  const h = String(date.getUTCHours()).padStart(2, '0');
  const min = String(date.getUTCMinutes()).padStart(2, '0');
  return `${y}-${m}-${d}T${h}:${min}`;
}

function parseUTCDatetimeLocal(s: string): Date {
  const [datePart, timePart] = s.split('T');
  const [y, m, d] = datePart.split('-').map(Number);
  const [h, min] = timePart.split(':').map(Number);
  return new Date(Date.UTC(y, m - 1, d, h, min));
}

const RSS_KEYS: (keyof FlagCost)[] = ['food', 'wood', 'stone', 'gold', 'crystals', 'credits'];

const RSS_CONFIG = [
  { key: 'credits' as const, label: 'Credits', icon: Medal, color: 'text-yellow-500', hasProduction: false },
  { key: 'food' as const, label: 'Food', icon: Wheat, color: 'text-lime-400', hasProduction: true },
  { key: 'wood' as const, label: 'Wood', icon: LogIcon, color: 'text-amber-600', hasProduction: true },
  { key: 'stone' as const, label: 'Stone', icon: Mountain, color: 'text-stone-400', hasProduction: true },
  { key: 'gold' as const, label: 'Gold', icon: Coins, color: 'text-yellow-400', hasProduction: true },
  { key: 'crystals' as const, label: 'Crystals', icon: Gem, color: 'text-blue-400', hasProduction: true },
];

// No caps by default (set very high)
const NO_CAP: FlagCost = { food: 1e15, wood: 1e15, stone: 1e15, gold: 1e15, crystals: 1e15, credits: 1e15 };

export default function FlagCalculatorPage() {
  const [currentFlagsInput, setCurrentFlagsInput] = useState('0');
  const currentFlags = parseInt(currentFlagsInput) || 0;
  const [resourceInputs, setResourceInputs] = useState({
    food: '9.7', wood: '7.6', stone: '5.3', gold: '2.6', crystals: '0.72', credits: '128.2',
  });
  const [capInputs, setCapInputs] = useState({
    food: '11', wood: '11', stone: '8.2', gold: '5.5', crystals: '5.5', credits: '',
  });
  const [productionInputs, setProductionInputs] = useState({
    food: '102000', wood: '102000', stone: '85500', gold: '70000', crystals: '13500', credits: '0',
  });
  const [arch1Level, setArch1Level] = useState(5);
  const [arch2Level, setArch2Level] = useState(10);
  const [targetDateStr, setTargetDateStr] = useState('');
  const [now, setNow] = useState(() => new Date());

  // Initialize target date on client only
  useEffect(() => {
    const d = new Date(Date.now() + 24 * 60 * 60 * 1000);
    setTargetDateStr(toUTCDatetimeLocal(d));
    setNow(new Date());
  }, []);

  // Update "now" every minute
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);

  const availableResources = useMemo(() => {
    const r: FlagCost = { food: 0, wood: 0, stone: 0, gold: 0, crystals: 0, credits: 0 };
    for (const k of RSS_KEYS) r[k] = (parseFloat(resourceInputs[k]) || 0) * 1_000_000;
    return r;
  }, [resourceInputs]);

  const resourceCaps = useMemo(() => {
    const c: FlagCost = { ...NO_CAP };
    for (const k of RSS_KEYS) {
      const v = parseFloat(capInputs[k]);
      if (v > 0) c[k] = v * 1_000_000;
    }
    return c;
  }, [capInputs]);

  const productionPerHour = useMemo(() => {
    const p: FlagCost = { food: 0, wood: 0, stone: 0, gold: 0, crystals: 0, credits: 0 };
    for (const k of RSS_KEYS) p[k] = parseInt(productionInputs[k]) || 0;
    return p;
  }, [productionInputs]);

  const techDiscount = useMemo(
    () => ARCH1_DISCOUNT[arch1Level] + ARCH2_DISCOUNT[arch2Level],
    [arch1Level, arch2Level],
  );

  const hoursUntilTarget = useMemo(() => {
    if (!targetDateStr) return 0;
    const target = parseUTCDatetimeLocal(targetDateStr);
    return Math.max(0, (target.getTime() - now.getTime()) / 3_600_000);
  }, [targetDateStr, now]);

  // Instant result (no production)
  const instantResult = useMemo(
    () => maxFlagsAffordable(currentFlags, availableResources, techDiscount),
    [currentFlags, availableResources, techDiscount],
  );

  // Forward simulation with production over time
  const forwardResult = useMemo(
    () => simulateFlagBuilding(currentFlags, availableResources, productionPerHour, hoursUntilTarget, resourceCaps, techDiscount),
    [currentFlags, availableResources, productionPerHour, hoursUntilTarget, resourceCaps, techDiscount],
  );

  const nextFlagCost = useMemo(
    () => getFlagCost(currentFlags + instantResult.count + 1, techDiscount),
    [currentFlags, instantResult.count, techDiscount],
  );

  const totalCost = useMemo(() => {
    if (instantResult.count === 0) return { food: 0, wood: 0, stone: 0, gold: 0, crystals: 0, credits: 0 } as FlagCost;
    return totalCostForFlags(currentFlags + 1, instantResult.count, techDiscount);
  }, [currentFlags, instantResult.count, techDiscount]);

  const bottleneck = useMemo(() => {
    if (instantResult.count > 0) return null;
    const cost = nextFlagCost;
    let worst: keyof FlagCost = 'food';
    let worstRatio = Infinity;
    for (const k of RSS_KEYS) {
      if (cost[k] === 0) continue;
      const ratio = availableResources[k] / cost[k];
      if (ratio < worstRatio) { worstRatio = ratio; worst = k; }
    }
    return worst;
  }, [instantResult.count, nextFlagCost, availableResources]);

  const forwardTotalCost = useMemo(() => {
    if (forwardResult.count === 0) return { food: 0, wood: 0, stone: 0, gold: 0, crystals: 0, credits: 0 } as FlagCost;
    return totalCostForFlags(currentFlags + 1, forwardResult.count, techDiscount);
  }, [currentFlags, forwardResult.count, techDiscount]);

  return (
    <AppSidebar>
      <div className="min-h-screen">
        <div className="max-w-5xl mx-auto px-4 py-8">
          {/* Header */}
          <div className="mb-8">
            <h1 className="text-2xl font-bold flex items-center gap-2 text-[var(--foreground)]">
              <Flag className="w-6 h-6 text-red-400" />
              Flag Cost Calculator
            </h1>
            <p className="text-[var(--text-muted)] text-sm mt-1">
              Lost Kingdom &middot; {Math.round(techDiscount * 100)}% tech discount
            </p>
          </div>

          {/* Inputs */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            {/* Current flags + tech */}
            <div className="bg-[var(--background-card)] rounded-xl p-5 border border-[var(--border)]">
              <h2 className="text-sm font-medium text-[var(--text-muted)] mb-3">Current Flags</h2>
              <input
                type="number"
                min={0}
                value={currentFlagsInput}
                onChange={e => setCurrentFlagsInput(e.target.value)}
                className="w-full bg-[var(--background-secondary)] border border-[var(--border)] rounded-lg px-3 py-2.5 text-lg font-mono text-[var(--foreground)] mb-4"
              />
              <h2 className="text-sm font-medium text-[var(--text-muted)] mb-2">Architecture Tech</h2>
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs text-[var(--text-secondary)]">Arch I</span>
                  <select
                    value={arch1Level}
                    onChange={e => setArch1Level(Number(e.target.value))}
                    className="bg-[var(--background-secondary)] border border-[var(--border)] rounded px-2 py-1 text-sm font-mono text-[var(--foreground)]"
                  >
                    {ARCH1_DISCOUNT.map((d, i) => (
                      <option key={i} value={i}>Lv {i}{i > 0 ? ` (−${d * 100}%)` : ''}</option>
                    ))}
                  </select>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs text-[var(--text-secondary)]">Arch II</span>
                  <select
                    value={arch2Level}
                    onChange={e => setArch2Level(Number(e.target.value))}
                    className="bg-[var(--background-secondary)] border border-[var(--border)] rounded px-2 py-1 text-sm font-mono text-[var(--foreground)]"
                  >
                    {ARCH2_DISCOUNT.map((d, i) => (
                      <option key={i} value={i}>Lv {i}{i > 0 ? ` (−${d * 100}%)` : ''}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {/* Alliance resources (current / cap) */}
            <div className="bg-[var(--background-card)] rounded-xl p-5 border border-[var(--border)]">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-medium text-[var(--text-muted)]">Alliance Resources</h2>
                <button
                  onClick={() => setResourceInputs(prev => {
                    const next = { ...prev };
                    for (const rss of RSS_CONFIG) {
                      const cap = capInputs[rss.key];
                      if (cap && parseFloat(cap) > 0) next[rss.key] = cap;
                    }
                    return next;
                  })}
                  className="flex items-center gap-1 px-2 py-0.5 text-xs rounded bg-[var(--background-secondary)] border border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--foreground)] hover:border-[var(--foreground)]/20 transition-colors"
                >
                  <ChevronsUp className="w-3 h-3" />
                  Fill Max
                </button>
              </div>
              <div className="space-y-2">
                {RSS_CONFIG.map(rss => {
                  const Icon = rss.icon;
                  return (
                    <div key={rss.key} className="flex items-center gap-1.5">
                      <Icon className={`w-4 h-4 flex-shrink-0 ${rss.color}`} />
                      <input
                        type="number"
                        step="0.1"
                        value={resourceInputs[rss.key]}
                        onChange={e => setResourceInputs(prev => ({ ...prev, [rss.key]: e.target.value }))}
                        className="w-full bg-[var(--background-secondary)] border border-[var(--border)] rounded px-2 py-1 text-sm font-mono text-[var(--foreground)]"
                        placeholder="0"
                      />
                      <span className="text-[var(--text-muted)] text-xs">/</span>
                      <input
                        type="number"
                        step="0.1"
                        value={capInputs[rss.key]}
                        onChange={e => setCapInputs(prev => ({ ...prev, [rss.key]: e.target.value }))}
                        className="w-16 bg-[var(--background-secondary)] border border-[var(--border)] rounded px-2 py-1 text-sm font-mono text-[var(--text-muted)]"
                        placeholder="cap"
                      />
                      <span className="text-xs text-[var(--text-muted)]">M</span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Production rates */}
            <div className="bg-[var(--background-card)] rounded-xl p-5 border border-[var(--border)]">
              <h2 className="text-sm font-medium text-[var(--text-muted)] mb-3">Production /h</h2>
              <div className="space-y-2">
                {RSS_CONFIG.map(rss => {
                  const Icon = rss.icon;
                  return (
                    <div key={rss.key} className="flex items-center gap-1.5">
                      <Icon className={`w-4 h-4 flex-shrink-0 ${rss.color}`} />
                      <input
                        type="number"
                        step="1000"
                        value={productionInputs[rss.key]}
                        onChange={e => setProductionInputs(prev => ({ ...prev, [rss.key]: e.target.value }))}
                        className="w-full bg-[var(--background-secondary)] border border-[var(--border)] rounded px-2 py-1 text-sm font-mono text-[var(--foreground)]"
                        disabled={!rss.hasProduction}
                      />
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Target time */}
            <div className="bg-[var(--background-card)] rounded-xl p-5 border border-[var(--border)]">
              <h2 className="text-sm font-medium text-[var(--text-muted)] mb-3 flex items-center gap-1.5">
                <CalendarClock className="w-4 h-4" /> Target Time (UTC)
              </h2>
              <input
                type="datetime-local"
                value={targetDateStr}
                onChange={e => setTargetDateStr(e.target.value)}
                className="w-full bg-[var(--background-secondary)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm font-mono text-[var(--foreground)] [color-scheme:dark]"
              />
              {hoursUntilTarget > 0 && (
                <p className="text-xs text-[var(--text-muted)] mt-2">
                  {formatHours(hoursUntilTarget)} from now
                </p>
              )}
              <div className="mt-3 flex gap-2">
                {[6, 12, 24, 48].map(h => (
                  <button
                    key={h}
                    onClick={() => setTargetDateStr(toUTCDatetimeLocal(new Date(Date.now() + h * 3_600_000)))}
                    className="px-2 py-1 text-xs rounded bg-[var(--background-secondary)] border border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--foreground)] hover:border-[var(--foreground)]/20 transition-colors"
                  >
                    +{h}h
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Results */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
            {/* Right now */}
            <div className="bg-[var(--background-card)] rounded-xl p-6 border border-[var(--border)]">
              <h3 className="text-xs font-medium text-[var(--text-muted)] uppercase tracking-wider mb-4">Right Now</h3>
              <div className="flex items-baseline gap-3 mb-3">
                <span className="text-4xl font-bold text-red-400">{instantResult.count}</span>
                <span className="text-sm text-[var(--text-muted)]">flags</span>
                {instantResult.count > 0 && (
                  <span className="text-xs text-[var(--text-muted)]">#{currentFlags + 1} &rarr; #{currentFlags + instantResult.count}</span>
                )}
              </div>
              {instantResult.count === 0 && bottleneck && (
                <div className="text-xs text-red-400/70 mb-3">
                  Bottleneck: {RSS_CONFIG.find(r => r.key === bottleneck)?.label}
                </div>
              )}
              <div className="space-y-1">
                {RSS_CONFIG.map(rss => {
                  const Icon = rss.icon;
                  const cost = instantResult.count > 0 ? totalCost[rss.key] : nextFlagCost[rss.key];
                  if (cost === 0) return null;
                  return (
                    <div key={rss.key} className="flex items-center justify-between text-sm">
                      <span className={`flex items-center gap-1.5 ${rss.color}`}>
                        <Icon className="w-3.5 h-3.5" />
                        {rss.label}
                      </span>
                      <span className="text-[var(--text-secondary)] font-mono text-xs">
                        {formatNumFull(cost)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* By target time */}
            <div className="bg-[var(--background-card)] rounded-xl p-6 border border-blue-500/30">
              <h3 className="text-xs font-medium text-blue-400 uppercase tracking-wider mb-4 flex items-center gap-1.5">
                <CalendarClock className="w-3.5 h-3.5" />
                By Target Time
                {hoursUntilTarget > 0 && <span className="text-[var(--text-muted)] normal-case">({formatHours(hoursUntilTarget)})</span>}
              </h3>
              <div className="flex items-baseline gap-3 mb-3">
                <span className="text-4xl font-bold text-blue-400">{forwardResult.count}</span>
                <span className="text-sm text-[var(--text-muted)]">flags</span>
                {forwardResult.count > 0 && (
                  <span className="text-xs text-[var(--text-muted)]">#{currentFlags + 1} &rarr; #{currentFlags + forwardResult.count}</span>
                )}
                {forwardResult.count > instantResult.count && (
                  <span className="text-xs text-green-400">+{forwardResult.count - instantResult.count} from production</span>
                )}
              </div>
              {forwardResult.count > 0 && (
                <div className="space-y-1 mb-4">
                  {RSS_CONFIG.map(rss => {
                    const cost = forwardTotalCost[rss.key];
                    if (cost === 0) return null;
                    const Icon = rss.icon;
                    return (
                      <div key={rss.key} className="flex items-center justify-between text-sm">
                        <span className={`flex items-center gap-1.5 ${rss.color}`}>
                          <Icon className="w-3.5 h-3.5" />
                          {rss.label}
                        </span>
                        <span className="text-[var(--text-secondary)] font-mono text-xs">
                          {formatNumFull(cost)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Upcoming flags breakdown */}
          <div className="bg-[var(--background-card)] rounded-xl border border-[var(--border)] overflow-hidden">
            <div className="px-5 py-3 border-b border-[var(--border)] flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-[var(--text-muted)]" />
              <h3 className="text-sm font-medium text-[var(--text-secondary)]">Upcoming flag costs</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-[var(--text-muted)] text-xs border-b border-[var(--border)]">
                    <th className="px-3 py-2 text-left">Flag #</th>
                    {RSS_CONFIG.map(rss => {
                      const Icon = rss.icon;
                      return (
                        <th key={rss.key} className="px-3 py-2 text-right">
                          <Icon className={`w-3.5 h-3.5 inline ${rss.color}`} />
                        </th>
                      );
                    })}
                    <th className="px-3 py-2 text-right">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {Array.from({ length: 20 }, (_, i) => {
                    const flagNum = currentFlags + i + 1;
                    const cost = getFlagCost(flagNum, techDiscount);
                    const inInstant = flagNum <= currentFlags + instantResult.count;
                    const inForward = flagNum <= currentFlags + forwardResult.count;
                    return (
                      <tr
                        key={flagNum}
                        className={`border-b border-[var(--border)] ${
                          inInstant ? 'bg-green-400/5' : inForward ? 'bg-blue-400/5' : ''
                        }`}
                      >
                        <td className="px-3 py-1.5 font-mono text-[var(--text-secondary)]">#{flagNum}</td>
                        {RSS_CONFIG.map(rss => (
                          <td key={rss.key} className="px-3 py-1.5 text-right font-mono text-xs text-[var(--text-muted)]">
                            {cost[rss.key] > 0 ? formatNum(cost[rss.key]) : '-'}
                          </td>
                        ))}
                        <td className="px-3 py-1.5 text-right">
                          {inInstant ? (
                            <span className="text-green-400 text-xs">Now</span>
                          ) : inForward ? (
                            <span className="text-blue-400 text-xs">By target</span>
                          ) : (
                            <span className="text-[var(--text-muted)] text-xs">-</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <p className="text-xs text-[var(--text-muted)] mt-6 text-center">
            Base flag costs from rok.guide / Abused Panda #0936
          </p>
        </div>
      </div>
    </AppSidebar>
  );
}
