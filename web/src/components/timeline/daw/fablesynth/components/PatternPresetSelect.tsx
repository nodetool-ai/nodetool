import { useState } from 'react';
import './patternPresetSelect.css';

// Catalog dropdown in a sequencer panel head. It loads a line into the
// sequencer without changing the sound; the prompt returns after a load
// so the same entry can be picked again.
export function PatternPresetSelect({ names, onLoad }: { names: string[]; onLoad: (index: number) => boolean }) {
  const [value, setValue] = useState('');
  return (
    <select
      className="pattern-preset-select"
      aria-label="Load pattern preset"
      title="Load a pattern preset without changing the sound"
      value={value}
      onChange={(e) => {
        const next = e.target.value;
        if (next && onLoad(Number(next))) setValue(next);
        // Release focus so the computer keyboard plays notes again.
        e.currentTarget.blur();
      }}
    >
      <option value="">PATTERN PRESET</option>
      {names.map((name, index) => <option key={name} value={index}>{name}</option>)}
    </select>
  );
}
