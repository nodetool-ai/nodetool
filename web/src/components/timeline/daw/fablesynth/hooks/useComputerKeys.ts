// Computer keyboard -> notes. Two rows: AWSEDFTGYHUJKOLP;'
// Listens on the editor's root, not the window, so the timeline's own
// shortcuts keep working and two open editors never both play.

import { useEffect, type RefObject } from 'react';
import { useStore, useStoreApi } from '../store';

const KEYMAP: Record<string, number> = {
  KeyA: 0, KeyW: 1, KeyS: 2, KeyE: 3, KeyD: 4, KeyF: 5, KeyT: 6, KeyG: 7,
  KeyY: 8, KeyH: 9, KeyU: 10, KeyJ: 11, KeyK: 12, KeyO: 13, KeyL: 14,
  KeyP: 15, Semicolon: 16, Quote: 17,
};

export function useComputerKeys(root: RefObject<HTMLElement | null>): void {
  const api = useStoreApi();
  const playNote = useStore((s) => s.playNote);
  const panic = useStore((s) => s.panic);

  useEffect(() => {
    // Keyed by physical key (e.code), not note number: the octave can change
    // while a key is held, and the note-off must match the note that sounded.
    const held = new Map<string, number>();

    const keydown = (e: KeyboardEvent) => {
      if (e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
      const { octave, setOctave } = api.getState();
      if (e.code === 'KeyZ') { setOctave(Math.max(-3, octave - 1)); return; }
      if (e.code === 'KeyX') { setOctave(Math.min(3, octave + 1)); return; }
      if (e.code === 'Escape') { panic(); return; }
      const off = KEYMAP[e.code];
      if (off === undefined) return;
      e.preventDefault();
      e.stopPropagation();
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

    const el = root.current;
    if (!el) return;
    const focusout = (e: FocusEvent) => {
      if (!el.contains(e.relatedTarget as Node | null)) blur();
    };
    el.addEventListener('keydown', keydown);
    el.addEventListener('keyup', keyup);
    el.addEventListener('focusout', focusout);
    window.addEventListener('blur', blur);
    return () => {
      el.removeEventListener('keydown', keydown);
      el.removeEventListener('keyup', keyup);
      el.removeEventListener('focusout', focusout);
      window.removeEventListener('blur', blur);
      blur();
    };
  }, [root, api, playNote, panic]);
}
