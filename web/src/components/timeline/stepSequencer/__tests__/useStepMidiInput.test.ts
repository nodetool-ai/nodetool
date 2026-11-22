/** F22: Web MIDI failures reach the caller, hot-plug works, and listeners do not clobber others. */

import { act, renderHook, waitFor } from "@testing-library/react";

import { useStepMidiInput } from "../useStepMidiInput";

class FakeInput extends EventTarget {
  onmidimessage: ((e: unknown) => void) | null = null;
  state: "connected" | "disconnected" = "connected";
  constructor(public id: string) {
    super();
  }
  send(data: number[]): void {
    const e = Object.assign(new Event("midimessage"), { data: new Uint8Array(data) });
    this.dispatchEvent(e);
  }
}

class FakeAccess extends EventTarget {
  inputs = new Map<string, FakeInput>();
  plug(input: FakeInput): void {
    this.inputs.set(input.id, input);
    this.dispatchEvent(Object.assign(new Event("statechange"), { port: input }));
  }
  unplug(input: FakeInput): void {
    input.state = "disconnected";
    this.inputs.delete(input.id);
    this.dispatchEvent(Object.assign(new Event("statechange"), { port: input }));
  }
}

const handlers = () => ({
  enabled: true,
  onNote: jest.fn(),
  onChordReleased: jest.fn(),
  onController: jest.fn(),
  onUnavailable: jest.fn()
});

afterEach(() => {
  delete (navigator as { requestMIDIAccess?: unknown }).requestMIDIAccess;
});

it("reports a denied permission (F22)", async () => {
  Object.defineProperty(navigator, "requestMIDIAccess", { configurable: true, value: () => Promise.reject(new Error("denied")) });
  const h = handlers();
  renderHook(() => useStepMidiInput(h));
  await waitFor(() => expect(h.onUnavailable).toHaveBeenCalled());
});

it("listens to a device plugged in later, keeps other listeners, and releases on unplug (F22)", async () => {
  const access = new FakeAccess();
  const first = new FakeInput("a");
  const other = jest.fn();
  first.onmidimessage = other;
  access.inputs.set("a", first);
  Object.defineProperty(navigator, "requestMIDIAccess", { configurable: true, value: () => Promise.resolve(access) });
  const h = handlers();
  const { unmount } = renderHook(() => useStepMidiInput(h));
  await act(async () => undefined);
  const late = new FakeInput("b");
  act(() => access.plug(late));
  act(() => late.send([0x90, 60, 100]));
  expect(h.onNote).toHaveBeenCalledWith(60, 100);
  act(() => access.unplug(late));
  expect(h.onChordReleased).toHaveBeenCalledTimes(1);
  unmount();
  expect(first.onmidimessage).toBe(other);
});
