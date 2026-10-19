// A draggable handle for one modulation source. Drag it onto any knob (or the
// wavetable POS slider) to create a route, Serum-style. The chip carries the
// source index in the drag payload and flags the global drag state so valid
// drop targets can light up.

import type * as React from 'react';
import { useTranslation } from 'react-i18next';
import { MOD_SOURCES, SOURCE_COLORS } from '../params';
import { useStore, useStoreApi } from '../store';

interface ModSourceChipProps {
  src: number; // MOD_SOURCES index (1..)
  compact?: boolean; // grip-only, for tight panel headers
}

export function ModSourceChip({ src, compact }: ModSourceChipProps) {
  const { t } = useTranslation();
  const api = useStoreApi();
  const setModDrag = useStore((s) => s.setModDrag);
  const setModFocus = useStore((s) => s.setModFocus);
  const color = SOURCE_COLORS[src];

  const onDragStart = (e: React.DragEvent) => {
    e.dataTransfer.setData('mod-src', String(src));
    e.dataTransfer.effectAllowed = 'copy';
    setModDrag(src);
  };

  return (
    <span
      className={`mod-chip${compact ? ' mod-chip-compact' : ''}`}
      draggable
      style={{ ['--src' as string]: color }}
      onDragStart={onDragStart}
      onDragEnd={() => setModDrag(0)}
      onPointerEnter={() => setModFocus(src)}
      onPointerLeave={() => { if (api.getState().modFocus === src) setModFocus(0); }}
      title={t('i18n-next44-fablesynth-controls.modSourceChip.dragToControl', { source: MOD_SOURCES[src] })}
    >
      <span className="mod-grip" aria-hidden="true">⠿</span>
      {!compact && MOD_SOURCES[src]}
    </span>
  );
}
