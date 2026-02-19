'use client';

import { useState } from 'react';

interface MgeSkillInputProps {
  level: number;
  skills: number[];
  stars: number;
  onLevelChange: (level: number) => void;
  onSkillsChange: (skills: number[]) => void;
  onStarsChange: (stars: number) => void;
  compact?: boolean;
}

const LEVEL_OPTIONS = [60, 50, 40, 37, 30, 27, 20, 10, 1];

export function MgeSkillInput({
  level,
  skills,
  stars,
  onLevelChange,
  onSkillsChange,
  onStarsChange,
  compact = false,
}: MgeSkillInputProps) {
  const updateSkill = (index: number) => {
    const newSkills = [...skills];
    newSkills[index] = newSkills[index] >= 5 ? 0 : newSkills[index] + 1;
    onSkillsChange(newSkills);
  };

  return (
    <div className={compact ? 'space-y-2' : 'space-y-3'}>
      {/* Level and Stars side by side */}
      <div className="flex gap-3">
        <div className="w-28">
          <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>
            Level
          </label>
          <select
            value={level}
            onChange={(e) => onLevelChange(parseInt(e.target.value))}
            className="w-full px-3 py-2 rounded-md border text-sm focus:outline-none focus:ring-1 focus:ring-blue-500/50 appearance-none cursor-pointer"
            style={{
              backgroundColor: 'var(--background-secondary)',
              borderColor: 'var(--border)',
              color: 'var(--foreground)',
              backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%2378716c'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M19 9l-7 7-7-7'%3E%3C/path%3E%3C/svg%3E")`,
              backgroundRepeat: 'no-repeat',
              backgroundPosition: 'right 8px center',
              backgroundSize: '16px',
            }}
          >
            {LEVEL_OPTIONS.map((lvl) => (
              <option key={lvl} value={lvl}>Lv. {lvl}</option>
            ))}
          </select>
        </div>
        <div className="flex-1">
          <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>
            Stars
          </label>
          <div className="flex gap-1">
            {[1, 2, 3, 4, 5, 6].map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => onStarsChange(s)}
                className={`flex-1 h-[34px] rounded-md text-sm transition-all active:scale-95 ${
                  s <= stars
                    ? 'bg-yellow-500/30 text-yellow-500'
                    : 'text-stone-600 hover:bg-[var(--background-secondary)]'
                }`}
                style={s > stars ? { backgroundColor: 'var(--background-secondary)' } : undefined}
              >
                ★
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Skills - tap to cycle */}
      <div>
        <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>
          Skills <span style={{ color: 'var(--text-muted)', fontWeight: 'normal' }}>(tap to change)</span>
        </label>
        <div className="grid grid-cols-4 gap-2">
          {skills.map((skill, i) => (
            <button
              key={i}
              type="button"
              onClick={() => updateSkill(i)}
              className={`relative flex flex-col items-center py-2.5 rounded-lg border-2 transition-all active:scale-95 ${
                skill === 5
                  ? 'bg-yellow-500/20 border-yellow-500/50 text-yellow-500'
                  : skill === 0
                  ? 'border-transparent text-stone-500'
                  : 'border-transparent hover:border-stone-600'
              }`}
              style={
                skill === 0
                  ? { backgroundColor: 'var(--background-secondary)' }
                  : skill < 5
                  ? { backgroundColor: 'var(--background-secondary)', color: 'var(--foreground)' }
                  : undefined
              }
            >
              <span className="text-xl font-bold">{skill}</span>
              <span className="text-[10px] mt-0.5" style={{ color: 'var(--text-muted)' }}>
                Skill {i + 1}
              </span>
              <div className="flex gap-0.5 mt-1">
                {[1, 2, 3, 4, 5].map((dot) => (
                  <div
                    key={dot}
                    className={`w-1 h-1 rounded-full transition-all ${
                      dot <= skill ? 'bg-current' : ''
                    }`}
                    style={dot > skill ? { backgroundColor: 'var(--border)' } : undefined}
                  />
                ))}
              </div>
            </button>
          ))}
        </div>
        {/* Quick presets */}
        <div className="flex flex-wrap gap-1.5 mt-2 justify-center">
          <button
            type="button"
            onClick={() => onSkillsChange([5, 5, 5, 5])}
            className="px-2.5 py-1 text-xs rounded-md bg-yellow-500/20 text-yellow-500 hover:bg-yellow-500/30 active:scale-95 transition-all"
          >
            Max
          </button>
          <button
            type="button"
            onClick={() => onSkillsChange([5, 5, 1, 1])}
            className="px-2.5 py-1 text-xs rounded-md hover:opacity-80 active:scale-95 transition-all"
            style={{ backgroundColor: 'var(--background-secondary)', color: 'var(--text-secondary)' }}
          >
            5511
          </button>
          <button
            type="button"
            onClick={() => onSkillsChange([5, 1, 1, 1])}
            className="px-2.5 py-1 text-xs rounded-md hover:opacity-80 active:scale-95 transition-all"
            style={{ backgroundColor: 'var(--background-secondary)', color: 'var(--text-secondary)' }}
          >
            5111
          </button>
          <button
            type="button"
            onClick={() => onSkillsChange([1, 0, 0, 0])}
            className="px-2.5 py-1 text-xs rounded-md hover:opacity-80 active:scale-95 transition-all"
            style={{ backgroundColor: 'var(--background-secondary)', color: 'var(--text-secondary)' }}
          >
            New
          </button>
        </div>
      </div>
    </div>
  );
}
