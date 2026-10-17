// Computer keyboard -> notes. Two rows: AWSEDFTGYHUJKOLP;'

import { useEffect } from 'react';
import { useStore } from '../store';

const KEYMAP: Record<string, number> = {
  KeyA: 0, KeyW: 1, KeyS: 2, KeyE: 3, KeyD: 4, KeyF: 5, KeyT: 6, KeyG: 7,
  KeyY: 8, KeyH: 9, KeyU: 10, KeyJ: 11, KeyK: 12, KeyO: 13, KeyL: 14,
  KeyP: 15, Semicolon: 16, Quote: 17,
};

export function useComputerKeys() {
  const playNote = useStore((s) => s.playNote);
  const panic = useStore((s) => s.panic);

  useEffect(() => {
    // Keyed by physical key (e.code), not note number: the octave can change
    // while a key is held, and the note-off must match the note that sounded.
    const held = new Map<string, number>();

    const keydown = (e: KeyboardEvent) => {
      if (e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
      const tag = document.activeElement && document.activeElement.tagName;
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
      const { octave, setOctave } = useStore.getState();
      if (e.code === 'KeyZ') { setOctave(Math.max(-3, octave - 1)); return; }
      if (e.code === 'KeyX') { setOctave(Math.min(3, octave + 1)); return; }
      if (e.code === 'Escape') { panic(); return; }
      const off = KEYMAP[e.code];
      if (off === undefined) return;
      const note = 60 + octave * 12 + off;
      if (held.has(e.code)) return;
      held.set(e.code, note);
      playNote(note, 0.85);
    };

    const keyup = (e: KeyboardEvent) => {
      const note = held.get(e.code);
      if (note === undefined) return;
      held.delete(e.code);
      playNote(note, 0);
    };

    const blur = () => {
      for (const n of held.values()) playNote(n, 0);
      held.clear();
    };

    window.addEventListener('keydown', keydown);
    window.addEventListener('keyup', keyup);
    window.addEventListener('blur', blur);
    return () => {
      window.removeEventListener('keydown', keydown);
      window.removeEventListener('keyup', keyup);
      window.removeEventListener('blur', blur);
    };
  }, [playNote, panic]);
}
