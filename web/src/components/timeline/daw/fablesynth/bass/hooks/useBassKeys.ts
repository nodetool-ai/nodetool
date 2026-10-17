// Computer keyboard -> notes (audition when stopped, legato = slide).
// Two rows AWSEDFTGYHUJKOLP;' cover 18 semis; Z/X shift the octave window
// within the BL-1 keyboard's two-octave range. Esc clears a step selection,
// else stops/panics. Cmd/Ctrl-combos run the sequencer's editing verb table
// (copy/cut/paste/duplicate/select-all/undo/redo); Delete/Backspace (no
// note bound to them) clear the selection.

import { useEffect } from 'react';
import { KEY_COUNT } from '../params';
import { useBassStore } from '../store';

const KEYMAP: Record<string, number> = {
  KeyA: 0, KeyW: 1, KeyS: 2, KeyE: 3, KeyD: 4, KeyF: 5, KeyT: 6, KeyG: 7,
  KeyY: 8, KeyH: 9, KeyU: 10, KeyJ: 11, KeyK: 12, KeyO: 13, KeyL: 14,
  KeyP: 15, Semicolon: 16, Quote: 17,
};

// Ignore keys targeting form controls / rich-text / slider handles — plain
// keys stay free for note-playing everywhere else.
const isEditableTarget = (el: Element | null): boolean => {
  if (!el) return false;
  const tag = el.tagName;
  if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return true;
  if (el.getAttribute('contenteditable') != null) return true;
  if (el.getAttribute('role') === 'slider') return true;
  return false;
};

export function useBassKeys() {
  const noteOn = useBassStore((s) => s.noteOn);
  const noteOff = useBassStore((s) => s.noteOff);
  const stop = useBassStore((s) => s.stop);

  useEffect(() => {
    // Keyed by physical key (e.code): the octave can change while a key is
    // held, and the note-off must match the note that sounded.
    const held = new Map<string, number>();
    let octave = 0;

    const keydown = (e: KeyboardEvent) => {
      if (isEditableTarget(document.activeElement)) return;

      if (e.metaKey || e.ctrlKey) {
        if (useBassStore.getState().arpMode && !useBassStore.getState().hosted) return;
        if (e.repeat) return;
        const {
          copySelection, cutSelection, pasteSelection, duplicateSelection,
          selectAllSteps, clearStepSelection, undo, redo,
        } = useBassStore.getState();
        switch (e.code) {
          case 'KeyC': e.preventDefault(); copySelection(); return;
          case 'KeyX': e.preventDefault(); cutSelection(); return;
          case 'KeyV': e.preventDefault(); pasteSelection(); return;
          case 'KeyD': e.preventDefault(); duplicateSelection(); return;
          case 'KeyA': e.preventDefault(); selectAllSteps(); return;
          case 'KeyZ': e.preventDefault(); e.shiftKey ? redo() : undo(); return;
          case 'Escape': clearStepSelection(); return;
          default: return;
        }
      }
      if (e.altKey) return;
      if (e.repeat) return;

      if (e.code === 'KeyZ') { octave = Math.max(0, octave - 1); return; }
      if (e.code === 'KeyX') { octave = Math.min(1, octave + 1); return; }
      if (e.code === 'Escape') {
        const { rectSel, clearStepSelection } = useBassStore.getState();
        if (rectSel) { clearStepSelection(); return; }
        stop();
        return;
      }
      if (e.code === 'Delete' || e.code === 'Backspace') {
        if (useBassStore.getState().arpMode && !useBassStore.getState().hosted) return;
        useBassStore.getState().deleteSelection();
        return;
      }
      const off = KEYMAP[e.code];
      if (off === undefined) return;
      const semi = octave * 12 + off;
      // The upper part of the shifted keyboard row lies above BL-1's C2..C4
      // range. Ignore it; clamping makes distinct physical keys share C4,
      // so releasing either key cuts a note the other still holds.
      if (semi >= KEY_COUNT) return;
      if (held.has(e.code)) return;
      held.set(e.code, semi);
      noteOn(semi, 0.85);
    };

    const keyup = (e: KeyboardEvent) => {
      const semi = held.get(e.code);
      if (semi === undefined) return;
      held.delete(e.code);
      noteOff(semi);
    };

    const blur = () => {
      for (const semi of held.values()) noteOff(semi);
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
  }, [noteOn, noteOff, stop]);
}
