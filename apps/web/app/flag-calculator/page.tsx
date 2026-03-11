'use client';

import { useState, useMemo } from 'react';
import { Flag, Wheat, TreePine, Mountain, Coins, Clock, TrendingUp } from 'lucide-react';
import { AppSidebar } from '@/components/AppSidebar';

// Flag cost per flag from the rok.guide table (max tech).
// Costs step up every 20 flags. Within a 20-flag band the per-flag cost is constant.
//   food = wood = 75,000 + 18,750 * tier   (tier = floor((flagNumber-1) / 20))
//   stone = food * 0.75
//   gold  = food * 0.50
function getFlagCost(flagNumber: number) {
  const tier = Math.floor((flagNumber - 1) / 20);
  const food = 75_000 + 18_750 * tier;
  const wood = food;
  const stone = Math.round(food * 0.75);
  const gold = Math.round(food * 0.5);
  return { food, wood, stone, gold };
}

function totalCostForFlags(fromFlag: number, count: number) {
  const total = { food: 0, wood: 0, stone: 0, gold: 0 };
  for (let i = 0; i < count; i++) {
    const cost = getFlagCost(fromFlag + i);
    total.food += cost.food;
    total.wood += cost.wood;
    total.stone += cost.stone;
    total.gold += cost.gold;
  }
  return total;
}

function maxFlagsAffordable(
  currentFlags: number,
  resources: { food: number; wood: number; stone: number; gold: number },
) {
  let count = 0;
  const remaining = { ...resources };
  while (true) {
    const cost = getFlagCost(currentFlags + count + 1);
    if (
      remaining.food < cost.food ||
      remaining.wood < cost.wood ||
      remaining.stone < cost.stone ||
      remaining.gold < cost.gold
    ) break;
    remaining.food -= cost.food;
    remaining.wood -= cost.wood;
    remaining.stone -= cost.stone;
    remaining.gold -= cost.gold;
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

const RSS_CONFIG = [
  { key: 'food' as const, label: 'Food', icon: Wheat, color: 'text-yellow-400' },
  { key: 'wood' as const, label: 'Wood', icon: TreePine, color: 'text-green-400' },
  { key: 'stone' as const, label: 'Stone', icon: Mountain, color: 'text-stone-400' },
  { key: 'gold' as const, label: 'Gold', icon: Coins, color: 'text-amber-300' },
];

type RssKey = 'food' | 'wood' | 'stone' | 'gold';

export default function FlagCalculatorPage() {
  const [currentFlags, setCurrentFlags] = useState(0);
  // Resource inputs in raw values (what the user types, e.g. "5.2")
  const [resourceInputs, setResourceInputs] = useState({ food: '5.2', wood: '5.2', stone: '3.9', gold: '1.9' });
  const [productionInputs, setProductionInputs] = useState({ food: '22000', wood: '22000', stone: '21000', gold: '16000' });

  const availableResources = useMemo(() => ({
    food: (parseFloat(resourceInputs.food) || 0) * 1_000_000,
    wood: (parseFloat(resourceInputs.wood) || 0) * 1_000_000,
    stone: (parseFloat(resourceInputs.stone) || 0) * 1_000_000,
    gold: (parseFloat(resourceInputs.gold) || 0) * 1_000_000,
  }), [resourceInputs]);

  const productionPerHour = useMemo(() => ({
    food: parseInt(productionInputs.food) || 0,
    wood: parseInt(productionInputs.wood) || 0,
    stone: parseInt(productionInputs.stone) || 0,
    gold: parseInt(productionInputs.gold) || 0,
  }), [productionInputs]);

  const result = useMemo(() => {
    return maxFlagsAffordable(currentFlags, availableResources);
  }, [currentFlags, availableResources]);

  const nextFlagCost = useMemo(() => {
    return getFlagCost(currentFlags + result.count + 1);
  }, [currentFlags, result.count]);

  const totalCost = useMemo(() => {
    if (result.count === 0) return { food: 0, wood: 0, stone: 0, gold: 0 };
    return totalCostForFlags(currentFlags + 1, result.count);
  }, [currentFlags, result.count]);

  const timeToNextFlag = useMemo(() => {
    const deficit = {
      food: Math.max(0, nextFlagCost.food - result.remaining.food),
      wood: Math.max(0, nextFlagCost.wood - result.remaining.wood),
      stone: Math.max(0, nextFlagCost.stone - result.remaining.stone),
      gold: Math.max(0, nextFlagCost.gold - result.remaining.gold),
    };
    const hours = Math.max(
      productionPerHour.food > 0 ? deficit.food / productionPerHour.food : deficit.food > 0 ? Infinity : 0,
      productionPerHour.wood > 0 ? deficit.wood / productionPerHour.wood : deficit.wood > 0 ? Infinity : 0,
      productionPerHour.stone > 0 ? deficit.stone / productionPerHour.stone : deficit.stone > 0 ? Infinity : 0,
      productionPerHour.gold > 0 ? deficit.gold / productionPerHour.gold : deficit.gold > 0 ? Infinity : 0,
    );
    return { deficit, hours };
  }, [nextFlagCost, result.remaining, productionPerHour]);

  const upcomingFlags = useMemo(() => {
    const flags: { number: number; cost: ReturnType<typeof getFlagCost>; affordable: boolean }[] = [];
    const tempResources = { ...availableResources };
    for (let i = 0; i < 20; i++) {
      const flagNum = currentFlags + i + 1;
      const cost = getFlagCost(flagNum);
      const affordable =
        tempResources.food >= cost.food &&
        tempResources.wood >= cost.wood &&
        tempResources.stone >= cost.stone &&
        tempResources.gold >= cost.gold;
      flags.push({ number: flagNum, cost, affordable });
      if (affordable) {
        tempResources.food -= cost.food;
        tempResources.wood -= cost.wood;
        tempResources.stone -= cost.stone;
        tempResources.gold -= cost.gold;
      }
    }
    return flags;
  }, [currentFlags, availableResources]);

  // Find the bottleneck resource
  const bottleneck = useMemo(() => {
    if (result.count > 0) return null;
    const cost = nextFlagCost;
    let worst: RssKey = 'food';
    let worstRatio = availableResources.food / cost.food;
    for (const key of ['wood', 'stone', 'gold'] as RssKey[]) {
      const ratio = availableResources[key] / cost[key];
      if (ratio < worstRatio) { worstRatio = ratio; worst = key; }
    }
    return worst;
  }, [result.count, nextFlagCost, availableResources]);

  return (
    <AppSidebar>
      <div className="min-h-screen">
        <div className="max-w-4xl mx-auto px-4 py-8">
          {/* Header */}
          <div className="mb-8">
            <h1 className="text-2xl font-bold flex items-center gap-2 text-[var(--foreground)]">
              <Flag className="w-6 h-6 text-red-400" />
              Flag Cost Calculator
            </h1>
            <p className="text-[var(--text-muted)] text-sm mt-1">Lost Kingdom &middot; Max Tech</p>
          </div>

          {/* Inputs */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
            {/* Current flags */}
            <div className="bg-[var(--background-card)] rounded-xl p-5 border border-[var(--border)]">
              <h2 className="text-sm font-medium text-[var(--text-muted)] mb-3">Current Flags</h2>
              <input
                type="number"
                min={0}
                value={currentFlags}
                onChange={e => setCurrentFlags(Math.max(0, parseInt(e.target.value) || 0))}
                className="w-full bg-[var(--background-secondary)] border border-[var(--border)] rounded-lg px-3 py-2.5 text-lg font-mono text-[var(--foreground)]"
              />
            </div>

            {/* Alliance resources */}
            <div className="bg-[var(--background-card)] rounded-xl p-5 border border-[var(--border)]">
              <h2 className="text-sm font-medium text-[var(--text-muted)] mb-3">Alliance Resources</h2>
              <div className="space-y-2">
                {RSS_CONFIG.map(rss => {
                  const Icon = rss.icon;
                  return (
                    <div key={rss.key} className="flex items-center gap-2">
                      <Icon className={`w-4 h-4 flex-shrink-0 ${rss.color}`} />
                      <input
                        type="number"
                        step="0.1"
                        value={resourceInputs[rss.key]}
                        onChange={e => setResourceInputs(prev => ({ ...prev, [rss.key]: e.target.value }))}
                        className="w-full bg-[var(--background-secondary)] border border-[var(--border)] rounded px-2 py-1.5 text-sm font-mono text-[var(--foreground)]"
                      />
                      <span className="text-xs text-[var(--text-muted)] w-4">M</span>
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
                    <div key={rss.key} className="flex items-center gap-2">
                      <Icon className={`w-4 h-4 flex-shrink-0 ${rss.color}`} />
                      <input
                        type="number"
                        step="1000"
                        value={productionInputs[rss.key]}
                        onChange={e => setProductionInputs(prev => ({ ...prev, [rss.key]: e.target.value }))}
                        className="w-full bg-[var(--background-secondary)] border border-[var(--border)] rounded px-2 py-1.5 text-sm font-mono text-[var(--foreground)]"
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Results */}
          <div className="bg-[var(--background-card)] rounded-xl p-6 border border-[var(--border)] mb-6">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
              {/* Flags affordable */}
              <div className="text-center">
                <div className="text-4xl font-bold text-red-400">{result.count}</div>
                <div className="text-sm text-[var(--text-muted)] mt-1">flags you can build</div>
                {result.count > 0 && (
                  <div className="text-xs text-[var(--text-muted)] mt-0.5">
                    #{currentFlags + 1} &rarr; #{currentFlags + result.count}
                  </div>
                )}
                {result.count === 0 && bottleneck && (
                  <div className="text-xs text-red-400/70 mt-1">
                    Bottleneck: {RSS_CONFIG.find(r => r.key === bottleneck)?.label}
                  </div>
                )}
              </div>

              {/* Total cost */}
              <div>
                <div className="text-xs text-[var(--text-muted)] mb-2 text-center">
                  {result.count > 0 ? `Total cost for ${result.count} flags` : `Next flag (#${currentFlags + 1}) costs`}
                </div>
                <div className="space-y-1">
                  {RSS_CONFIG.map(rss => {
                    const Icon = rss.icon;
                    const cost = result.count > 0 ? totalCost[rss.key] : nextFlagCost[rss.key];
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

              {/* Time to next */}
              <div className="text-center">
                <div className="flex items-center justify-center gap-1.5 text-[var(--text-muted)] mb-2">
                  <Clock className="w-4 h-4" />
                  <span className="text-xs">Time to next flag</span>
                </div>
                {timeToNextFlag.hours === 0 ? (
                  <div className="text-green-400 font-medium">Ready now!</div>
                ) : timeToNextFlag.hours === Infinity ? (
                  <div className="text-red-400 font-medium">No production</div>
                ) : (
                  <div className="text-xl font-bold text-blue-400">
                    {formatHours(timeToNextFlag.hours)}
                  </div>
                )}
                <div className="mt-2 space-y-0.5">
                  {RSS_CONFIG.map(rss => {
                    const deficit = timeToNextFlag.deficit[rss.key];
                    if (deficit <= 0) return null;
                    const Icon = rss.icon;
                    return (
                      <div key={rss.key} className="flex items-center justify-center gap-1 text-xs text-[var(--text-muted)]">
                        <Icon className="w-3 h-3" />
                        <span>need {formatNum(deficit)}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>

          {/* Remaining resources after building */}
          {result.count > 0 && (
            <div className="bg-[var(--background-card)]/50 rounded-xl p-4 border border-[var(--border)]/50 mb-6">
              <h3 className="text-xs text-[var(--text-muted)] mb-2">Resources remaining after {result.count} flags</h3>
              <div className="flex gap-4 flex-wrap">
                {RSS_CONFIG.map(rss => {
                  const Icon = rss.icon;
                  return (
                    <div key={rss.key} className="flex items-center gap-2 text-sm">
                      <Icon className={`w-3.5 h-3.5 ${rss.color}`} />
                      <span className="text-[var(--text-secondary)] font-mono text-xs">
                        {formatNum(result.remaining[rss.key])}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

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
                    <th className="px-4 py-2 text-left">Flag #</th>
                    {RSS_CONFIG.map(rss => {
                      const Icon = rss.icon;
                      return (
                        <th key={rss.key} className="px-4 py-2 text-right">
                          <Icon className={`w-3.5 h-3.5 inline ${rss.color}`} />
                        </th>
                      );
                    })}
                    <th className="px-4 py-2 text-right">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {upcomingFlags.map(flag => (
                    <tr
                      key={flag.number}
                      className={`border-b border-[var(--border)]/50 ${
                        flag.affordable ? 'bg-green-400/5' : ''
                      }`}
                    >
                      <td className="px-4 py-1.5 font-mono text-[var(--text-secondary)]">#{flag.number}</td>
                      {RSS_CONFIG.map(rss => (
                        <td key={rss.key} className="px-4 py-1.5 text-right font-mono text-xs text-[var(--text-muted)]">
                          {formatNum(flag.cost[rss.key])}
                        </td>
                      ))}
                      <td className="px-4 py-1.5 text-right">
                        {flag.affordable ? (
                          <span className="text-green-400 text-xs">Can build</span>
                        ) : (
                          <span className="text-[var(--text-muted)] text-xs">-</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <p className="text-xs text-[var(--text-muted)] mt-6 text-center">
            Flag costs based on max tech (rok.guide / Abused Panda #0936)
          </p>
        </div>
      </div>
    </AppSidebar>
  );
}
