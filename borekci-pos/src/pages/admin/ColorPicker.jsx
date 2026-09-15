import React from 'react';
import { COLOR_PALETTE, isLightColor } from '../../utils/colors';

/** Renk paleti + özel renk seçici */
const ColorPicker = ({ value, onChange, allowWhite = true }) => {
  const palette = allowWhite ? COLOR_PALETTE : COLOR_PALETTE.filter((c) => c !== '#FFFFFF');
  const selected = String(value || '').toUpperCase();
  return (
    <div>
      <div className="grid gap-1.5" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(2.25rem, 1fr))' }}>
        {palette.map((color) => {
          const isSelected = selected === color;
          return (
            <button
              key={color}
              type="button"
              onClick={() => onChange(color)}
              className={`aspect-square rounded-lg border transition-transform hover:scale-110 flex items-center justify-center ${
                isSelected ? 'ring-2 ring-offset-2 ring-blue-500 dark:ring-offset-gray-800 scale-110' : ''
              } ${color === '#FFFFFF' ? 'border-gray-300' : 'border-black/10'}`}
              style={{ backgroundColor: color }}
              title={color === '#FFFFFF' ? 'Kategori rengini kullan' : color}
            >
              {isSelected && <span className={`text-sm font-bold ${isLightColor(color) ? 'text-gray-900' : 'text-white'}`}>✓</span>}
            </button>
          );
        })}
      </div>
      <label className="mt-2 inline-flex items-center gap-2 text-xs text-gray-500 cursor-pointer">
        <input type="color" value={/^#[0-9a-f]{6}$/i.test(value || '') ? value : '#3B82F6'} onChange={(e) => onChange(e.target.value.toUpperCase())} className="h-7 w-9 rounded cursor-pointer bg-transparent" />
        Özel renk seç
        <span className="font-mono">{selected}</span>
      </label>
    </div>
  );
};

export default ColorPicker;
