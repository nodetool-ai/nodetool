/**
 * The VST device view: plug-in choice, the plug-in window, and the state the
 * window sends back, against a stand-in for the desktop bridge.
 */
import React from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import userEvent from "@testing-library/user-event";
import type { VstMidiInstrument } from "@nodetool-ai/timeline";

import mockTheme from "../../../../../__mocks__/themeMock";
import { useTimelineStore } from "../../../../../stores/timeline/TimelineStore";
import VstDeviceView from "../VstDeviceView";
import type { VstBridge, VstHostEvent } from "../vstBridge";

const plugin = {
  uid: "VST3-Pad",
  name: "Pad",
  vendor: "Acme",
  version: "1.0",
  path: "/plugins/Pad.vst3",
  isInstrument: true
};

function makeBridge(): VstBridge & { emit: (event: VstHostEvent) => void } {
  let listener: ((event: VstHostEvent) => void) | null = null;
  return {
    status: jest.fn(async () => ({ available: true, path: "/bin/NodeToolVstHost" })),
    scan: jest.fn(async () => [plugin]),
    render: jest.fn(),
    openEditor: jest.fn(async () => undefined),
    closeEditor: jest.fn(async () => undefined),
    onEvent: jest.fn((callback) => {
      listener = callback;
      return () => {
        listener = null;
      };
    }),
    emit: (event) => listener?.(event)
  };
}

function midiTrackWithVst(instrument: Partial<VstMidiInstrument> = {}): string {
  act(() => {
    useTimelineStore.getState().addTrack("midi", "Keys");
  });
  const track = useTimelineStore.getState().tracks.filter((t) => t.type === "midi").at(-1)!;
  act(() =>
    useTimelineStore.getState().setTrackInstrument(track.id, {
      type: "vst",
      plugin: null,
      state: null,
      gainDb: 0,
      ...instrument
    })
  );
  return track.id;
}

const instrumentOf = (trackId: string) =>
  useTimelineStore.getState().tracks.find((t) => t.id === trackId)?.instrument as VstMidiInstrument;

function renderView(trackId: string) {
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <ThemeProvider theme={mockTheme}>
        <VstDeviceView trackId={trackId} />
      </ThemeProvider>
    </QueryClientProvider>
  );
}

describe("VstDeviceView", () => {
  const api = window.api;
  afterEach(() => {
    window.api = api;
  });

  it("says the browser build cannot host plug-ins", () => {
    window.api = { ...api, vst: undefined } as typeof window.api;
    renderView(midiTrackWithVst());
    expect(screen.getByTestId("vst-desktop-only")).toHaveTextContent("desktop app");
  });

  it("shows why the host is unavailable", async () => {
    const bridge = makeBridge();
    (bridge.status as jest.Mock).mockResolvedValue({ available: false, reason: "Build NodeToolVstHost first." });
    window.api = { ...api, vst: bridge } as typeof window.api;
    renderView(midiTrackWithVst());
    expect(await screen.findByTestId("vst-host-missing")).toHaveTextContent("Build NodeToolVstHost first.");
    expect(bridge.scan).not.toHaveBeenCalled();
  });

  it("stores the chosen plug-in on the track", async () => {
    const bridge = makeBridge();
    window.api = { ...api, vst: bridge } as typeof window.api;
    const trackId = midiTrackWithVst();
    renderView(trackId);
    const picker = await screen.findByRole("combobox", { name: "VST instrument" });
    await waitFor(() => expect(picker).not.toHaveAttribute("aria-disabled", "true"));
    await userEvent.click(picker);
    await userEvent.click(await screen.findByRole("option", { name: "Pad · Acme" }));
    await waitFor(() =>
      expect(instrumentOf(trackId).plugin).toEqual({
        uid: "VST3-Pad",
        name: "Pad",
        vendor: "Acme",
        path: "/plugins/Pad.vst3"
      })
    );
  });

  it("opens the plug-in window and keeps the sound changes made there", async () => {
    const bridge = makeBridge();
    window.api = { ...api, vst: bridge } as typeof window.api;
    const trackId = midiTrackWithVst({ plugin: { uid: plugin.uid, name: "Pad", vendor: "Acme", path: plugin.path }, state: "S1" });
    const view = renderView(trackId);

    fireEvent.click(await screen.findByRole("button", { name: "Open plug-in window" }));
    await waitFor(() =>
      expect(bridge.openEditor).toHaveBeenCalledWith({
        instance: `track:${trackId}`,
        plugin: { path: plugin.path, uid: plugin.uid },
        state: "S1",
        title: "Pad · Keys"
      })
    );
    expect(await screen.findByRole("button", { name: "Close plug-in window" })).toBeInTheDocument();

    act(() => bridge.emit({ event: "state", instance: `track:${trackId}`, state: "S2" }));
    expect(instrumentOf(trackId).state).toBe("S2");
    // Another track's window does not touch this one.
    act(() => bridge.emit({ event: "state", instance: "track:other", state: "S3" }));
    expect(instrumentOf(trackId).state).toBe("S2");

    act(() => bridge.emit({ event: "editorClosed", instance: `track:${trackId}`, state: "S4" }));
    expect(instrumentOf(trackId).state).toBe("S4");
    expect(await screen.findByRole("button", { name: "Open plug-in window" })).toBeInTheDocument();

    view.unmount();
    expect(bridge.closeEditor).toHaveBeenCalledWith(`track:${trackId}`);
  });

  it("names a saved plug-in this computer does not have", async () => {
    const bridge = makeBridge();
    window.api = { ...api, vst: bridge } as typeof window.api;
    renderView(midiTrackWithVst({ plugin: { uid: "VST3-Gone", name: "Gone", vendor: "Old", path: "/plugins/Gone.vst3" } }));
    expect(await screen.findByText("Gone · Old (not installed here)")).toBeInTheDocument();
  });
});
