// Web MIDI input — notes + pitch bend (Chrome/Edge).

import { useEffect } from 'react';
import { useStore } from '../store';

export function useMidi() {
  const playNote = useStore((s) => s.playNote);
  const bend = useStore((s) => s.bend);
  const setParam = useStore((s) => s.setParam);
  const setMidiActive = useStore((s) => s.setMidiActive);

  useEffect(() => {
    if (!navigator.requestMIDIAccess) return;
    let access: MIDIAccess | null = null;
    let cancelled = false;
    // Count notes by input. A global note-off is sent only after every input
    // that owns the pitch has released it.
    const held = new Map<MIDIInput, Map<number, number>>();

    const isHeld = (note: number) => {
      for (const notes of held.values()) if ((notes.get(note) ?? 0) > 0) return true;
      return false;
    };

    const flush = (input: MIDIInput) => {
      const notes = held.get(input);
      if (!notes) return;
      held.delete(input);
      for (const note of notes.keys()) if (!isHeld(note)) playNote(note, 0);
    };

    navigator.requestMIDIAccess().then((acc) => {
      if (cancelled) return;
      access = acc;
      const update = () => {
        const connected = new Set<MIDIInput>();
        let any = false;
        for (const input of acc.inputs.values()) {
          if (input.state !== 'connected') continue;
          connected.add(input);
          any = true;
          input.onmidimessage = (e: MIDIMessageEvent) => {
            const data = e.data;
            if (!data) return;
            const [st, d1, d2] = data;
            const cmd = st & 0xf0;
            if (cmd === 0x90 && d2 > 0) {
              let notes = held.get(input);
              if (!notes) held.set(input, notes = new Map());
              notes.set(d1, (notes.get(d1) ?? 0) + 1);
              playNote(d1, d2 / 127);
            } else if (cmd === 0x80 || (cmd === 0x90 && d2 === 0)) {
              const notes = held.get(input);
              const count = notes?.get(d1) ?? 0;
              if (count <= 1) notes?.delete(d1); else notes!.set(d1, count - 1);
              if (!isHeld(d1)) playNote(d1, 0);
            }
            else if (cmd === 0xe0) { bend((((d2 << 7) | d1) - 8192) / 8192 * 2); }
            // MOD WHL / AFTERTCH mod sources are parameters, as in Serum.
            else if (cmd === 0xb0 && d1 === 1) setParam('perf.modwheel', d2 / 127);
            else if (cmd === 0xd0) setParam('perf.aftertouch', d1 / 127);
          };
        }
        for (const input of [...held.keys()]) if (!connected.has(input)) flush(input);
        setMidiActive(any);
      };
      update();
      acc.onstatechange = update;
    }).catch(() => { if (!cancelled) setMidiActive(false); });

    return () => {
      cancelled = true;
      for (const input of [...held.keys()]) flush(input);
      if (access) {
        for (const input of access.inputs.values()) input.onmidimessage = null;
        access.onstatechange = null;
      }
      setMidiActive(false);
    };
  }, [playNote, bend, setParam, setMidiActive]);
}
