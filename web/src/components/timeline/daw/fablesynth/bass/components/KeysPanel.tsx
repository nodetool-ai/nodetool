// Two-octave audition keyboard. Click/touch plays when the sequencer is
// stopped; overlapping presses are legato = slide. While playing it just
// mirrors the sequenced note.

import type * as React from 'react';
import { KEY_COUNT } from '../params';
import { useBassStore } from '../store';

const IS_BLACK: Record<number, number> = { 1: 1, 3: 1, 6: 1, 8: 1, 10: 1 };
const BLACK_OFF: Record<number, number> = { 1: 0.68, 3: 1.72, 6: 3.68, 8: 4.7, 10: 5.72 };
const WHITE_COUNT = 15;

export function KeysPanel() {
  const playing = useBassStore((s) => s.playing);
  const arpInput = useBassStore(s => s.arpMode && !s.hosted && s.arp.input === 'keys');
  const arpMode = useBassStore(s => s.arpMode && !s.hosted);
  const heldSemis = useBassStore(s => s.heldSemis);
  const curSemi = useBassStore((s) => s.curSemi);
  const noteOn = useBassStore((s) => s.noteOn);
  const noteOff = useBassStore((s) => s.noteOff);

  let hot = -100;
  if (curSemi > -100) {
    // sequencer semis are root-relative (-12..23): show them an octave up so
    // the lane octave lands mid-keyboard; audition semis are already key ids.
    hot = playing && !arpMode ? curSemi + 12 : curSemi;
    while (hot > KEY_COUNT - 1) hot -= 12;
    while (hot < 0) hot += 12;
  }

  const press = (semi: number) => (e: React.PointerEvent) => {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    e.preventDefault();
    // Key the release to this pointer so overlapping touches stay legato:
    // lifting one finger must only release its own note.
    const pointerId = e.pointerId;
    noteOn(semi, 0.85);
    const up = (ev: PointerEvent) => {
      if (ev.pointerId !== pointerId) return;
      noteOff(semi);
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
    const isHot = arpInput ? heldSemis.includes(semi) : semi === hot;
    if (IS_BLACK[pc]) {
      blacks.push(
        <button
          key={semi}
          type="button"
          className={`bl-key-black${isHot ? ' hot' : ''}`}
          style={{ left: `${((oct * 7 + BLACK_OFF[pc]) * (100 / WHITE_COUNT)).toFixed(2)}%` }}
          aria-label={`key ${semi}`}
          onPointerDown={press(semi)}
        />,
      );
    } else {
      whites.push(
        <button
          key={semi}
          type="button"
          className={`bl-key-white${isHot ? ' hot' : ''}`}
          aria-label={`key ${semi}`}
          onPointerDown={press(semi)}
        />,
      );
    }
  }

  return (
    <section className="panel bl-keys-section">
      <div className="panel-head">
        <h2>KEYS</h2>
        <span className="bl-head-note">{arpInput ? 'PLAY NOTES INTO ARP · LATCH HOLDS THE CHORD' : 'AUDITION WHEN STOPPED · LEGATO = SLIDE'}</span>
      </div>
      <div className="bl-keys">
        <div className="bl-keys-white">{whites}</div>
        {blacks}
      </div>
    </section>
  );
}
