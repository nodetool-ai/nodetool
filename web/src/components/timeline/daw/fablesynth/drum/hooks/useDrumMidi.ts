import { useEffect } from 'react';
import { MIDI_BASE } from '../params';
import { useDrumStore } from '../store';

export function useDrumMidi() {
  const triggerPad = useDrumStore((s) => s.triggerPad);
  const setMidiActive = useDrumStore((s) => s.setMidiActive);

  useEffect(() => {
    if (!navigator.requestMIDIAccess) return;
    let access: MIDIAccess | null = null;
    let cancelled = false;

    navigator.requestMIDIAccess().then((nextAccess) => {
      if (cancelled) return;
      access = nextAccess;
      const update = () => {
        let any = false;
        for (const input of nextAccess.inputs.values()) {
          any = true;
          input.onmidimessage = (e: MIDIMessageEvent) => {
            const data = e.data;
            if (!data) return;
            const [status, note, velocity] = data;
            if ((status & 0xf0) !== 0x90 || velocity === 0) return;
            if (note < MIDI_BASE || note >= MIDI_BASE + 16) return;
            triggerPad(note - MIDI_BASE, velocity / 127);
          };
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
      if (access) {
        for (const input of access.inputs.values()) input.onmidimessage = null;
        access.onstatechange = null;
      }
      setMidiActive(false);
    };
  }, [setMidiActive, triggerPad]);
}
