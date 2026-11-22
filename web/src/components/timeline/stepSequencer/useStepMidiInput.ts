/**
 * Hardware MIDI input for Learn and step recording (SQ38, SQ40), through Web
 * MIDI. A note-on reports `onNote`. Controllers, pitch bend and channel
 * pressure report their own handlers. When the last held key is released,
 * `onChordReleased` fires once, so a chord advances the step once.
 */

import { useEffect, useRef } from "react";

interface Handlers {
  enabled: boolean;
  onNote: (pitch: number, velocity: number) => void;
  onChordReleased: () => void;
  onController: (cc: number, value: number) => void;
  /** Pitch bend, 0..16383 with 8192 at center. */
  onPitchBend?: (value: number) => void;
  /** Channel pressure (aftertouch), 0..127. */
  onPressure?: (value: number) => void;
  /** Web MIDI is missing or the permission was denied. */
  onUnavailable?: (reason: string) => void;
}

/** Route one raw MIDI message. Exported for tests. */
export function routeMidiMessage(data: ArrayLike<number>, held: Set<number>, h: Omit<Handlers, "enabled">): void {
  const status = (data[0] ?? 0) & 0xf0;
  const a = data[1] ?? 0;
  const b = data[2] ?? 0;
  if (status === 0x90 && b > 0) {
    held.add(a);
    h.onNote(a, b);
  } else if (status === 0x80 || (status === 0x90 && b === 0)) {
    if (held.delete(a) && held.size === 0) h.onChordReleased();
  } else if (status === 0xb0) {
    h.onController(a, b);
  } else if (status === 0xe0) {
    h.onPitchBend?.((b << 7) | a);
  } else if (status === 0xd0) {
    h.onPressure?.(a);
  }
}

/**
 * Listens with `addEventListener`, so other Web MIDI users of the same input
 * keep their handlers. Inputs plugged in later are picked up through
 * `statechange`. Unplugging an input releases the keys it held.
 */
export function useStepMidiInput(handlers: Handlers): void {
  const ref = useRef(handlers);
  ref.current = handlers;
  const { enabled } = handlers;
  useEffect(() => {
    if (!enabled) return;
    if (typeof navigator === "undefined" || typeof navigator.requestMIDIAccess !== "function") {
      ref.current.onUnavailable?.("Web MIDI is not available in this browser.");
      return;
    }
    let cancelled = false;
    const heldBy = new Map<MIDIInput, Set<number>>();
    const held = () => new Set([...heldBy.values()].flatMap((s) => [...s]));
    const listeners = new Map<MIDIInput, (e: Event) => void>();
    const attach = (input: MIDIInput) => {
      if (listeners.has(input)) return;
      const keys = new Set<number>();
      heldBy.set(input, keys);
      const listener = (e: Event) => {
        const data = (e as MIDIMessageEvent).data;
        if (!data) return;
        routeMidiMessage(data, keys, {
          ...ref.current,
          // A chord ends when no input holds a key.
          onChordReleased: () => {
            if (held().size === 0) ref.current.onChordReleased();
          }
        });
      };
      input.addEventListener("midimessage", listener);
      listeners.set(input, listener);
    };
    const detach = (input: MIDIInput) => {
      const listener = listeners.get(input);
      if (listener) input.removeEventListener("midimessage", listener);
      listeners.delete(input);
      const keys = heldBy.get(input);
      heldBy.delete(input);
      if (keys && keys.size > 0 && held().size === 0) ref.current.onChordReleased();
    };
    let access: MIDIAccess | null = null;
    const onState = (e: Event) => {
      const port = (e as MIDIConnectionEvent).port;
      if (!port || port.type === "output") return;
      if (port.state === "connected") attach(port as MIDIInput);
      else detach(port as MIDIInput);
    };
    navigator.requestMIDIAccess().then(
      (a) => {
        if (cancelled) return;
        access = a;
        a.inputs.forEach(attach);
        a.addEventListener("statechange", onState);
      },
      (err: unknown) => {
        if (!cancelled) ref.current.onUnavailable?.(err instanceof Error ? err.message : String(err));
      }
    );
    return () => {
      cancelled = true;
      access?.removeEventListener("statechange", onState);
      for (const [input, listener] of listeners) input.removeEventListener("midimessage", listener);
      listeners.clear();
    };
  }, [enabled]);
}
