import React from 'react';
import { Minus, Plus } from 'lucide-react';

interface BloomCounterProps {
  value: number;
  onChange: (val: number) => void;
  min?: number;
  max?: number;
  level: 'nb' | 'th' | 'vd';
}

export const BloomCounter: React.FC<BloomCounterProps> = ({
  value,
  onChange,
  min = 0,
  max = 999,
  level,
}) => {
  const handleDecrement = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (value > min) {
      onChange(value - 1);
    }
  };

  const handleIncrement = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (value < max) {
      onChange(value + 1);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.trim();
    if (raw === '') {
      onChange(0);
      return;
    }
    const parsed = parseInt(raw, 10);
    if (!isNaN(parsed)) {
      const clamped = Math.max(min, Math.min(max, parsed));
      onChange(clamped);
    }
  };

  return (
    <div className="inline-flex items-center rounded-lg border border-slate-200 bg-white shadow-2xs hover:border-slate-300 transition-colors focus-within:ring-1 focus-within:border-[var(--primary)] focus-within:ring-[var(--primary)]">
      <button
        type="button"
        onClick={handleDecrement}
        disabled={value <= min}
        className="w-6 h-7 flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-50 disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-slate-400 rounded-l-lg transition-colors cursor-pointer disabled:cursor-not-allowed"
        title="Giảm 1 câu"
      >
        <Minus className="w-3 h-3" />
      </button>

      <input
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        value={value === 0 ? '0' : value}
        onChange={handleInputChange}
        className="w-9 h-7 text-center font-bold text-xs text-slate-900 bg-transparent border-x border-slate-100 focus:outline-none focus:bg-slate-50 selection:bg-slate-200"
      />

      <button
        type="button"
        onClick={handleIncrement}
        disabled={value >= max}
        className="w-6 h-7 flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-50 disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-slate-400 rounded-r-lg transition-colors cursor-pointer disabled:cursor-not-allowed"
        title="Tăng 1 câu"
      >
        <Plus className="w-3 h-3" />
      </button>
    </div>
  );
};
