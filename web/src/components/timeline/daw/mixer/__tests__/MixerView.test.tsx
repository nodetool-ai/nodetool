/**
 * The mixer view against a real timeline store: a strip per audio and midi
 * track in track order plus the master, and every control reaching the
 * document as one undo entry.
 */

import React from "react";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";
import { makeTrack } from "@nodetool-ai/timeline";

import mockTheme from "../../../../../__mocks__/themeMock";
import {
  TimelineProvider,
  createTimelineInstance,
  type TimelineInstance
} from "../../../../../stores/timeline/TimelineInstance";
import { timelineTemporalOf } from "../../../../../stores/timeline/TimelineStore";
import { MixerView } from "../MixerView";

class FakePointerEvent extends MouseEvent {
  pointerId: number;
  constructor(type: string, props: PointerEventInit = {}) {
    super(type, props);
    this.pointerId = props.pointerId ?? 1;
  }
}
Object.defineProperty(window, "PointerEvent", { configurable: true, value: FakePointerEvent });

jest.mock("../EffectDevicePopover", () => ({
  EffectDevicePopover: ({ open }: { open: { effectId: string } | null }) =>
    open ? <div data-testid="effect-popover">{open.effectId}</div> : null
}));

function setup(onOpenDevice?: (trackId: string) => void): TimelineInstance {
  const instance = createTimelineInstance();
  instance.doc.setState({
    tracks: [
      makeTrack({ type: "video", name: "Picture", index: 0 }),
      { ...makeTrack({ type: "midi", name: "Keys", index: 1 }), instrument: { type: "wavetable" } as never },
      { ...makeTrack({ type: "audio", name: "Vox", index: 2 }), volumeDb: -6, pan: -0.5 }
    ],
    clips: []
  });
  render(
    <ThemeProvider theme={mockTheme}>
      <TimelineProvider instance={instance}>
        <MixerView onOpenDevice={onOpenDevice} />
      </TimelineProvider>
    </ThemeProvider>
  );
  return instance;
}

const doc = (instance: TimelineInstance) => instance.doc.getState();

describe("MixerView", () => {
  beforeAll(() => {
    jest.spyOn(window, "requestAnimationFrame").mockImplementation((cb) => {
      return setTimeout(() => cb(performance.now()), 0) as unknown as number;
    });
    jest.spyOn(window, "cancelAnimationFrame").mockImplementation((id) => clearTimeout(id));
  });
  afterAll(() => jest.restoreAllMocks());

  it("shows a strip per audio and midi track in order, then the master", () => {
    setup();
    const channels = screen.getByRole("group", { name: "Channels" });
    const strips = within(channels).getAllByRole("region");
    expect(strips.map((s) => s.getAttribute("aria-label"))).toEqual([
      "Keys channel",
      "Vox channel"
    ]);
    expect(screen.getByRole("region", { name: "Master channel" })).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Picture channel" })).toBeNull();
  });

  it("speaks the fader and pan in dB and direction", () => {
    setup();
    const fader = screen.getByRole("slider", { name: "Vox volume" });
    expect(fader).toHaveAttribute("aria-valuetext", "-6.0 dB");
    expect(fader).toHaveAttribute("aria-orientation", "vertical");
    expect(screen.getByRole("slider", { name: "Vox pan" })).toHaveAttribute(
      "aria-valuetext",
      "50% left"
    );
  });

  it("moves the fader from the keyboard, one undo entry per press", () => {
    const instance = setup();
    const trackId = doc(instance).tracks[2].id;
    const depth = timelineTemporalOf(instance.doc).pastStates.length;
    const fader = screen.getByRole("slider", { name: "Vox volume" });
    fireEvent.keyDown(fader, { key: "PageUp" });
    const after = doc(instance).tracks.find((t) => t.id === trackId)!.volumeDb!;
    expect(after).toBeGreaterThan(-6);
    expect(timelineTemporalOf(instance.doc).pastStates).toHaveLength(depth + 1);
    fireEvent.keyDown(fader, { key: "Delete" });
    expect(doc(instance).tracks.find((t) => t.id === trackId)!.volumeDb).toBe(0);
    expect(timelineTemporalOf(instance.doc).pastStates).toHaveLength(depth + 2);
  });

  it("records a fader drag as one undo entry", () => {
    const instance = setup();
    const depth = timelineTemporalOf(instance.doc).pastStates.length;
    const fader = screen.getByRole("slider", { name: "Keys volume" });
    jest.spyOn(fader, "getBoundingClientRect").mockReturnValue({
      top: 0, bottom: 200, height: 200, left: 0, right: 28, width: 28, x: 0, y: 0, toJSON: () => ({})
    });
    fader.setPointerCapture = jest.fn();
    act(() => {
      fireEvent.pointerDown(fader, { button: 0, clientY: 100, pointerId: 1 });
      fireEvent.pointerMove(fader, { clientY: 80, pointerId: 1 });
      fireEvent.pointerMove(fader, { clientY: 60, pointerId: 1 });
      fireEvent.pointerUp(fader, { clientY: 60, pointerId: 1 });
    });
    expect(doc(instance).tracks[1].volumeDb).toBeDefined();
    expect(timelineTemporalOf(instance.doc).pastStates).toHaveLength(depth + 1);
  });

  it("takes a typed level in the readout", async () => {
    const instance = setup();
    await userEvent.click(screen.getByRole("button", { name: /Vox level -6.0 dB, edit/ }));
    const input = screen.getByRole("textbox", { name: "Vox level in dB" });
    await userEvent.clear(input);
    await userEvent.type(input, "-12.5{Enter}");
    expect(doc(instance).tracks[2].volumeDb).toBe(-12.5);
    await userEvent.click(screen.getByRole("button", { name: /Master level 0.0 dB, edit/ }));
    const masterInput = screen.getByRole("textbox", { name: "Master level in dB" });
    await userEvent.clear(masterInput);
    await userEvent.type(masterInput, "-inf{Enter}");
    expect(doc(instance).master?.volumeDb).toBe(-120);
  });

  it("mutes and solos like the track header", async () => {
    const instance = setup();
    await userEvent.click(screen.getByRole("button", { name: "Mute Vox" }));
    await userEvent.click(screen.getByRole("button", { name: "Solo Keys" }));
    expect(doc(instance).tracks[2].muted).toBe(true);
    expect(doc(instance).tracks[1].solo).toBe(true);
    expect(screen.getByRole("button", { name: "Unmute Vox" })).toHaveAttribute("aria-pressed", "true");
  });

  it("adds, bypasses and opens an insert on a track and on the master", async () => {
    const instance = setup();
    await userEvent.click(screen.getByRole("button", { name: "Add an effect to Vox" }));
    // The FableSynth EQ and compressor replace the built-in ones, unprefixed.
    expect((await screen.findAllByRole("menuitem")).map((item) => item.textContent)).toEqual([
      "Gain",
      "Filter",
      "EQ",
      "OTT",
      "Compressor",
      "Drive",
      "Lab",
      "Chorus",
      "Tape Echo",
      "Reverb",
      "Limiter"
    ]);
    await userEvent.click(screen.getByRole("menuitem", { name: "Compressor" }));
    const effect = doc(instance).tracks[2].effects![0];
    expect(effect).toMatchObject({ type: "fable", kind: "comp" });
    await userEvent.click(screen.getByRole("button", { name: "Bypass Compressor" }));
    expect(doc(instance).tracks[2].effects![0].enabled).toBe(false);
    await userEvent.click(screen.getByRole("button", { name: "Open Compressor" }));
    expect(screen.getByTestId("effect-popover")).toHaveTextContent(effect.id);

    await userEvent.click(screen.getByRole("button", { name: "Add an effect to Master" }));
    await userEvent.click(await screen.findByRole("menuitem", { name: "Limiter" }));
    expect(doc(instance).master?.effects?.[0]).toMatchObject({ type: "fable", kind: "limiter" });
  });

  it("removes an insert with its button or the Delete key, one undo entry each", async () => {
    const instance = setup();
    await userEvent.click(screen.getByRole("button", { name: "Add an effect to Vox" }));
    await userEvent.click(await screen.findByRole("menuitem", { name: "Reverb" }));
    await userEvent.click(screen.getByRole("button", { name: "Add an effect to Master" }));
    await userEvent.click(await screen.findByRole("menuitem", { name: "Limiter" }));

    const undoBefore = timelineTemporalOf(instance.doc).pastStates.length;
    await userEvent.click(screen.getByRole("button", { name: "Remove Reverb" }));
    expect(doc(instance).tracks[2].effects).toEqual([]);
    expect(timelineTemporalOf(instance.doc).pastStates.length).toBe(undoBefore + 1);

    screen.getByRole("button", { name: "Open Limiter" }).focus();
    await userEvent.keyboard("{Delete}");
    expect(doc(instance).master?.effects).toEqual([]);
  });

  it("opens a midi track's instrument", async () => {
    const onOpenDevice = jest.fn();
    const instance = setup(onOpenDevice);
    await userEvent.click(screen.getByRole("button", { name: /Open Keys instrument, WT-1/ }));
    expect(onOpenDevice).toHaveBeenCalledWith(doc(instance).tracks[1].id);
  });
});
