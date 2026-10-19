// Source: fablesynth src/bass/components/KeysPanel.tsx. Two-octave keyboard
// that plays the track's live device; overlapping presses are legato = slide.
// It lights the note the device is sounding, so it mirrors the clips too.

import type * as React from 'react';
import { useTranslation } from 'react-i18next';
import { KEY_COUNT, ROOT_MIDI } from '../params';
import { useBassStore } from '../bassStoreContext';

const IS_BLACK: Record<number, number> = { 1: 1, 3: 1, 6: 1, 8: 1, 10: 1 };
const BLACK_OFF: Record<number, number> = { 1: 0.68, 3: 1.72, 6: 3.68, 8: 4.7, 10: 5.72 };
const WHITE_COUNT = 15;

export function KeysPanel() {
  const { t } = useTranslation();
  const heldPitches = useBassStore((s) => s.heldPitches);
  const vizPitch = useBassStore((s) => s.vizPitch);
  const vizGate = useBassStore((s) => s.vizGate);
  const powered = useBassStore((s) => s.powered);
  const noteOn = useBassStore((s) => s.noteOn);
  const noteOff = useBassStore((s) => s.noteOff);

  // The sounding note, folded into the keyboard's two octaves.
  let hot = -100;
  const sounding = heldPitches.length ? heldPitches[heldPitches.length - 1] : vizGate ? vizPitch : -1;
  if (sounding >= 0) {
    hot = sounding - ROOT_MIDI;
    while (hot > KEY_COUNT - 1) hot -= 12;
    while (hot < 0) hot += 12;
  }

  const press = (semi: number) => (e: React.PointerEvent) => {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    e.preventDefault();
    // Key the release to this pointer so overlapping touches stay legato:
    // lifting one finger must only release its own note.
    const pointerId = e.pointerId;
    // Shift plays an accent.
    noteOn(ROOT_MIDI + semi, e.shiftKey ? 120 : 96);
    const up = (ev: PointerEvent) => {
      if (ev.pointerId !== pointerId) return;
      noteOff(ROOT_MIDI + semi);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
    };
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  };

  const whites: React.ReactElement[] = [];
  const blacks: React.ReactElement[] = [];
  for (let semi = 0; semi < KEY_COUNT; semi++) {
    const pc = semi % 12;
    const oct = Math.floor(semi / 12);
    const isHot = semi === hot;
    if (IS_BLACK[pc]) {
      blacks.push(
        <button
          key={semi}
          type="button"
          className={`bl-key-black${isHot ? ' hot' : ''}`}
          style={{ left: `${((oct * 7 + BLACK_OFF[pc]) * (100 / WHITE_COUNT)).toFixed(2)}%` }}
          aria-label={t('i18n-next48.keys.key', { number: semi })}
          onPointerDown={press(semi)}
        />,
      );
    } else {
      whites.push(
        <button
          key={semi}
          type="button"
          className={`bl-key-white${isHot ? ' hot' : ''}`}
          aria-label={t('i18n-next48.keys.key', { number: semi })}
          onPointerDown={press(semi)}
        />,
      );
    }
  }

  return (
    <section className="panel bl-keys-section">
      <div className="panel-head">
        <h2>{t('i18n-next48.keys.title')}</h2>
        <span className="bl-head-note">{powered ? t('i18n-next48.keys.playingHint') : t('i18n-next48.keys.startHint')}</span>
      </div>
      <div className="bl-keys">
        <div className="bl-keys-white">{whites}</div>
        {blacks}
      </div>
    </section>
  );
}
