'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { Flag, ArrowLeft, Wheat, TreePine, Mountain, Coins, Clock, TrendingUp } from 'lucide-react';

// Flag cost formula (max tech):
// food_per_flag = wood_per_flag = 75,000 + 18,750 * floor((flag_number - 1) / 20)
// stone_per_flag = food_per_flag * 0.75
// gold_per_flag = food_per_flag * 0.50
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
    ) {
      break;
    }
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
  { key: 'food' as const, label: 'Food', icon: Wheat, color: 'text-yellow-400', bg: 'bg-yellow-400/10' },
  { key: 'wood' as const, label: 'Wood', icon: TreePine, color: 'text-green-400', bg: 'bg-green-400/10' },
  { key: 'stone' as const, label: 'Stone', icon: Mountain, color: 'text-stone-400', bg: 'bg-stone-400/10' },
  { key: 'gold' as const, label: 'Gold', icon: Coins, color: 'text-amber-300', bg: 'bg-amber-300/10' },
];

// Alliance storehouse capacities by level
const STOREHOUSE_CAPACITY: Record<number, { food: number; wood: number; stone: number; gold: number }> = {
  1: { food: 3_000_000, wood: 3_000_000, stone: 1_500_000, gold: 1_500_000 },
  2: { food: 4_500_000, wood: 4_500_000, stone: 2_250_000, gold: 2_250_000 },
  3: { food: 6_000_000, wood: 6_000_000, stone: 3_000_000, gold: 3_000_000 },
  4: { food: 9_000_000, wood: 9_000_000, stone: 4_500_000, gold: 4_500_000 },
  5: { food: 12_000_000, wood: 12_000_000, stone: 6_000_000, gold: 6_000_000 },
  6: { food: 15_000_000, wood: 15_000_000, stone: 7_500_000, gold: 7_500_000 },
  7: { food: 18_000_000, wood: 18_000_000, stone: 9_000_000, gold: 9_000_000 },
  8: { food: 21_000_000, wood: 21_000_000, stone: 10_500_000, gold: 10_500_000 },
  9: { food: 24_000_000, wood: 24_000_000, stone: 12_000_000, gold: 12_000_000 },
  10: { food: 27_000_000, wood: 27_000_000, stone: 13_500_000, gold: 13_500_000 },
  11: { food: 30_000_000, wood: 30_000_000, stone: 15_000_000, gold: 15_000_000 },
  12: { food: 33_000_000, wood: 33_000_000, stone: 16_500_000, gold: 16_500_000 },
  13: { food: 36_000_000, wood: 36_000_000, stone: 18_000_000, gold: 18_000_000 },
  14: { food: 39_000_000, wood: 39_000_000, stone: 19_500_000, gold: 19_500_000 },
  15: { food: 42_000_000, wood: 42_000_000, stone: 21_000_000, gold: 21_000_000 },
  16: { food: 45_000_000, wood: 45_000_000, stone: 22_500_000, gold: 22_500_000 },
  17: { food: 48_000_000, wood: 48_000_000, stone: 24_000_000, gold: 24_000_000 },
  18: { food: 51_000_000, wood: 51_000_000, stone: 25_500_000, gold: 25_500_000 },
  19: { food: 54_000_000, wood: 54_000_000, stone: 27_000_000, gold: 27_000_000 },
  20: { food: 60_000_000, wood: 60_000_000, stone: 30_000_000, gold: 30_000_000 },
  21: { food: 66_000_000, wood: 66_000_000, stone: 33_000_000, gold: 33_000_000 },
  22: { food: 72_000_000, wood: 72_000_000, stone: 36_000_000, gold: 36_000_000 },
  23: { food: 78_000_000, wood: 78_000_000, stone: 39_000_000, gold: 39_000_000 },
  24: { food: 84_000_000, wood: 84_000_000, stone: 42_000_000, gold: 42_000_000 },
  25: { food: 90_000_000, wood: 90_000_000, stone: 45_000_000, gold: 45_000_000 },
};

export default function FlagCalculatorPage() {
  const [storehouseLevel, setStorehouseLevel] = useState(25);
  const [currentFlags, setCurrentFlags] = useState(0);
  const [productionPerHour, setProductionPerHour] = useState({
    food: 500_000,
    wood: 500_000,
    stone: 250_000,
    gold: 250_000,
  });
  const [customResources, setCustomResources] = useState<{
    food: string; wood: string; stone: string; gold: string;
  } | null>(null);

  const capacity = STOREHOUSE_CAPACITY[storehouseLevel] ?? STOREHOUSE_CAPACITY[25];

  const availableResources = useMemo(() => {
    if (customResources) {
      return {
        food: parseFloat(customResources.food) * 1_000_000 || 0,
        wood: parseFloat(customResources.wood) * 1_000_000 || 0,
        stone: parseFloat(customResources.stone) * 1_000_000 || 0,
        gold: parseFloat(customResources.gold) * 1_000_000 || 0,
      };
    }
    return capacity;
  }, [customResources, capacity]);

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

  // Breakdown of upcoming flags
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

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      <div className="max-w-4xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center gap-3 mb-8">
          <Link
            href="/kvk-map"
            className="p-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Flag className="w-6 h-6 text-red-400" />
              Flag Cost Calculator
            </h1>
            <p className="text-zinc-400 text-sm">Lost Kingdom &middot; Max Tech</p>
          </div>
        </div>

        {/* Inputs */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          {/* Storehouse Level */}
          <div className="bg-zinc-900 rounded-xl p-5 border border-zinc-800">
            <h2 className="text-sm font-medium text-zinc-400 mb-3">Alliance Storehouse</h2>
            <div className="flex items-center gap-3">
              <label className="text-sm text-zinc-400">Level</label>
              <select
                value={storehouseLevel}
                onChange={e => {
                  setStorehouseLevel(Number(e.target.value));
                  setCustomResources(null);
                }}
                className="flex-1 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white"
              >
                {Object.keys(STOREHOUSE_CAPACITY).map(lvl => (
                  <option key={lvl} value={lvl}>
                    Level {lvl}
                  </option>
                ))}
              </select>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
              {RSS_CONFIG.map(rss => {
                const Icon = rss.icon;
                return (
                  <div key={rss.key} className={`flex items-center gap-1.5 ${rss.color}`}>
                    <Icon className="w-3.5 h-3.5" />
                    <span className="text-zinc-400">{formatNum(capacity[rss.key])}</span>
                  </div>
                );
              })}
            </div>
            <button
              onClick={() =>
                setCustomResources(
                  customResources
                    ? null
                    : {
                        food: (capacity.food / 1_000_000).toString(),
                        wood: (capacity.wood / 1_000_000).toString(),
                        stone: (capacity.stone / 1_000_000).toString(),
                        gold: (capacity.gold / 1_000_000).toString(),
                      },
                )
              }
              className="mt-3 text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
            >
              {customResources ? 'Use storehouse capacity' : 'Enter custom amounts'}
            </button>
            {customResources && (
              <div className="mt-3 grid grid-cols-2 gap-2">
                {RSS_CONFIG.map(rss => {
                  const Icon = rss.icon;
                  return (
                    <div key={rss.key} className="flex items-center gap-1.5">
                      <Icon className={`w-3.5 h-3.5 ${rss.color}`} />
                      <input
                        type="number"
                        step="0.1"
                        value={customResources[rss.key]}
                        onChange={e =>
                          setCustomResources(prev => prev ? { ...prev, [rss.key]: e.target.value } : null)
                        }
                        className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-sm text-white"
                      />
                      <span className="text-xs text-zinc-500">M</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Current Flags & Production */}
          <div className="bg-zinc-900 rounded-xl p-5 border border-zinc-800">
            <h2 className="text-sm font-medium text-zinc-400 mb-3">Current State</h2>
            <div className="flex items-center gap-3 mb-4">
              <label className="text-sm text-zinc-400">Flags built</label>
              <input
                type="number"
                min={0}
                value={currentFlags}
                onChange={e => setCurrentFlags(Math.max(0, parseInt(e.target.value) || 0))}
                className="w-24 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white"
              />
            </div>
            <h2 className="text-sm font-medium text-zinc-400 mb-2">
              Production rate <span className="text-zinc-500">(per hour)</span>
            </h2>
            <div className="grid grid-cols-2 gap-2">
              {RSS_CONFIG.map(rss => {
                const Icon = rss.icon;
                return (
                  <div key={rss.key} className="flex items-center gap-1.5">
                    <Icon className={`w-3.5 h-3.5 ${rss.color}`} />
                    <input
                      type="number"
                      step="10000"
                      value={productionPerHour[rss.key]}
                      onChange={e =>
                        setProductionPerHour(prev => ({
                          ...prev,
                          [rss.key]: Math.max(0, parseInt(e.target.value) || 0),
                        }))
                      }
                      className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-sm text-white"
                    />
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Results */}
        <div className="bg-zinc-900 rounded-xl p-6 border border-zinc-800 mb-6">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
            {/* Flags affordable */}
            <div className="text-center">
              <div className="text-4xl font-bold text-red-400">{result.count}</div>
              <div className="text-sm text-zinc-400 mt-1">flags you can build</div>
              <div className="text-xs text-zinc-500 mt-0.5">
                Flag {currentFlags + 1} &rarr; {currentFlags + result.count}
              </div>
            </div>

            {/* Total cost */}
            <div>
              <div className="text-xs text-zinc-500 mb-2 text-center">Total cost for {result.count} flags</div>
              <div className="space-y-1">
                {RSS_CONFIG.map(rss => {
                  const Icon = rss.icon;
                  return (
                    <div key={rss.key} className="flex items-center justify-between text-sm">
                      <span className={`flex items-center gap-1.5 ${rss.color}`}>
                        <Icon className="w-3.5 h-3.5" />
                        {rss.label}
                      </span>
                      <span className="text-zinc-300 font-mono text-xs">
                        {formatNumFull(totalCost[rss.key])}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Time to next */}
            <div className="text-center">
              <div className="flex items-center justify-center gap-1.5 text-zinc-400 mb-2">
                <Clock className="w-4 h-4" />
                <span className="text-xs">Time to flag #{currentFlags + result.count + 1}</span>
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
                    <div key={rss.key} className="flex items-center justify-center gap-1 text-xs text-zinc-500">
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
          <div className="bg-zinc-900/50 rounded-xl p-4 border border-zinc-800/50 mb-6">
            <h3 className="text-xs text-zinc-500 mb-2">Resources remaining after {result.count} flags</h3>
            <div className="flex gap-4 flex-wrap">
              {RSS_CONFIG.map(rss => {
                const Icon = rss.icon;
                const pct = availableResources[rss.key] > 0
                  ? (result.remaining[rss.key] / availableResources[rss.key]) * 100
                  : 0;
                return (
                  <div key={rss.key} className="flex items-center gap-2 text-sm">
                    <Icon className={`w-3.5 h-3.5 ${rss.color}`} />
                    <span className="text-zinc-300 font-mono text-xs">
                      {formatNum(result.remaining[rss.key])}
                    </span>
                    <span className="text-zinc-600 text-xs">({pct.toFixed(0)}%)</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Upcoming flags breakdown */}
        <div className="bg-zinc-900 rounded-xl border border-zinc-800 overflow-hidden">
          <div className="px-5 py-3 border-b border-zinc-800 flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-zinc-400" />
            <h3 className="text-sm font-medium text-zinc-300">Upcoming flag costs</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-zinc-500 text-xs border-b border-zinc-800">
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
                    className={`border-b border-zinc-800/50 ${
                      flag.affordable ? 'bg-green-400/5' : ''
                    }`}
                  >
                    <td className="px-4 py-1.5 font-mono text-zinc-300">#{flag.number}</td>
                    {RSS_CONFIG.map(rss => (
                      <td key={rss.key} className="px-4 py-1.5 text-right font-mono text-xs text-zinc-400">
                        {formatNum(flag.cost[rss.key])}
                      </td>
                    ))}
                    <td className="px-4 py-1.5 text-right">
                      {flag.affordable ? (
                        <span className="text-green-400 text-xs">Can build</span>
                      ) : (
                        <span className="text-zinc-600 text-xs">-</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <p className="text-xs text-zinc-600 mt-6 text-center">
          Costs based on max tech. Storehouse capacities are approximate &mdash; use custom amounts for exact values.
        </p>
      </div>
    </div>
  );
}
