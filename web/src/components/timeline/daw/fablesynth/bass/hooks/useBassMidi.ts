// MIDI notes -> the mono voice. Notes map relative to ROOT_MIDI (C2); the
// worklet's held-note stack gives last-note priority + legato slides.

import { useEffect } from 'react';
import { ROOT_MIDI, KEY_COUNT } from '../params';
import { useBassStore } from '../store';

export function useBassMidi() {
  const noteOn = useBassStore((s) => s.noteOn);
  const noteOff = useBassStore((s) => s.noteOff);
  const setMidiActive = useBassStore((s) => s.setMidiActive);

  useEffect(() => {
    if (!navigator.requestMIDIAccess) return;
    let access: MIDIAccess | null = null;
    let cancelled = false;
    // Notes currently sounding, per input — so unplugging a device (or
    // unmounting) releases its notes instead of leaving the voice hanging.
    const held = new Map<MIDIInput, Set<number>>();

    const flush = (input: MIDIInput) => {
      const notes = held.get(input);
      if (!notes) return;
      for (const semi of notes) noteOff(semi);
      held.delete(input);
    };

    navigator.requestMIDIAccess().then((nextAccess) => {
      if (cancelled) return;
      access = nextAccess;
      const update = () => {
        const connected = new Set<MIDIInput>();
        let any = false;
        for (const input of nextAccess.inputs.values()) {
          if (input.state !== 'connected') continue;
          connected.add(input);
          any = true;
          input.onmidimessage = (e: MIDIMessageEvent) => {
            const data = e.data;
            if (!data) return;
            const [status, note, velocity] = data;
            const kind = status & 0xf0;
            const semi = note - ROOT_MIDI;
            if (semi < 0 || semi >= KEY_COUNT + 12) return;
            if (kind === 0x90 && velocity > 0) {
              let notes = held.get(input);
              if (!notes) held.set(input, notes = new Set());
              notes.add(semi);
              noteOn(semi, velocity / 127);
            } else if (kind === 0x80 || (kind === 0x90 && velocity === 0)) {
              held.get(input)?.delete(semi);
              noteOff(semi);
            }
          };
        }
        for (const input of [...held.keys()]) {
          if (!connected.has(input)) flush(input);
        }
        setMidiActive(any);
      };
      update();
      nextAccess.onstatechange = update;
    }).catch(() => {
      if (!cancelled) setMidiActive(false);
    });

    return () => {
      cancelled = true;
      for (const input of [...held.keys()]) flush(input);
      if (access) {
        for (const input of access.inputs.values()) input.onmidimessage = null;
        access.onstatechange = null;
      }
      setMidiActive(false);
    };
  }, [noteOn, noteOff, setMidiActive]);
}
