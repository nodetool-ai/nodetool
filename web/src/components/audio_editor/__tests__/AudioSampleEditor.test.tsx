import {
  fireEvent,
  render,
  screen,
  waitFor,
  within
} from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../__mocks__/themeMock";
import AudioSampleEditor from "../AudioSampleEditor";
import { DocumentBar } from "../../ui_primitives";
import type { AudioSample } from "../audioSample";
import type { Asset } from "../../../stores/ApiTypes";
import { useDocumentDraftStore } from "../../../stores/DocumentDraftStore";

const mockSuspend = jest.fn().mockResolvedValue(undefined);
const mockClose = jest.fn().mockResolvedValue(undefined);
const mockSave = jest.fn().mockResolvedValue(true);
jest.mock("../../../hooks/audio/useSaveAudioToAsset", () => ({
  useSaveAudioToAsset: () => ({ save: mockSave, saving: false })
}));
jest.mock("../WaveformView", () => ({
  __esModule: true,
  default: ({
    sample,
    selection
  }: {
    sample: AudioSample;
    selection: { start: number; end: number } | null;
  }) => (
    <>
      <div data-testid="sample">{Array.from(sample.channels[0]).join(",")}</div>
      <div data-testid="selection">
        {selection ? `${selection.start}-${selection.end}` : "none"}
      </div>
    </>
  )
}));
jest.mock("../AudioEditorToolbar", () => ({
  __esModule: true,
  default: ({
    onReverse,
    onEffect,
    onUndo,
    onSave,
    canUndo
  }: {
    onReverse: () => void;
    onEffect: (id: string) => void;
    onUndo: () => void;
    onSave: () => void;
    canUndo: boolean;
  }) => (
    <>
      <button onClick={onReverse}>Reverse</button>
      <button onClick={() => onEffect("invert")}>Invert</button>
      <button onClick={onUndo} disabled={!canUndo}>
        Undo
      </button>
      <button onClick={onSave}>Save</button>
    </>
  )
}));

it("retains PCM and undo while inactive, suspends audio, and clears dirty only after saving", async () => {
  const originalContext = window.AudioContext;
  const originalFetch = global.fetch;
  const mockDecode = jest.fn().mockResolvedValue({
    sampleRate: 1,
    numberOfChannels: 1,
    length: 3,
    getChannelData: () => new Float32Array([0, 0.5, 1])
  });
  window.AudioContext = jest.fn(() => ({
    decodeAudioData: mockDecode,
    suspend: mockSuspend,
    close: mockClose
  })) as unknown as typeof AudioContext;
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    arrayBuffer: async () => new ArrayBuffer(0)
  });
  const asset = {
    id: "audio-test",
    get_url: "https://example.test/audio.wav"
  } as Asset;
  try {
    const result = render(
      <AudioSampleEditor asset={asset} active onClose={() => undefined} />,
      {
        wrapper: ({ children }) => (
          <ThemeProvider theme={mockTheme}>{children}</ThemeProvider>
        )
      }
    );
    expect(await screen.findByTestId("sample")).toHaveTextContent("0,0.5,1");
    fireEvent.click(screen.getByText("Reverse"));
    expect(screen.getByTestId("sample")).toHaveTextContent("1,0.5,0");
    expect(useDocumentDraftStore.getState().dirtyTabs["audio:audio-test"]).toBe(
      true
    );
    result.rerender(
      <AudioSampleEditor
        asset={asset}
        active={false}
        onClose={() => undefined}
      />
    );
    expect(mockSuspend).toHaveBeenCalled();
    expect(screen.getByTestId("sample")).toHaveTextContent("1,0.5,0");
    result.rerender(
      <AudioSampleEditor asset={asset} active onClose={() => undefined} />
    );
    fireEvent.click(screen.getByText("Undo"));
    expect(screen.getByTestId("sample")).toHaveTextContent("0,0.5,1");
    fireEvent.click(screen.getByText("Invert"));
    expect(await screen.findByText("0,-0.5,-1")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Undo"));
    expect(screen.getByTestId("sample")).toHaveTextContent("0,0.5,1");
    expect(mockDecode).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByText("Reverse"));
    mockSave.mockResolvedValueOnce(false);
    fireEvent.click(screen.getByText("Save"));
    await waitFor(() => expect(mockSave).toHaveBeenCalledTimes(1));
    expect(useDocumentDraftStore.getState().dirtyTabs["audio:audio-test"]).toBe(
      true
    );
    fireEvent.click(screen.getByText("Save"));
    await waitFor(() =>
      expect(
        useDocumentDraftStore.getState().dirtyTabs["audio:audio-test"]
      ).toBe(false)
    );
    result.unmount();
    expect(mockClose).toHaveBeenCalled();
  } finally {
    window.AudioContext = originalContext;
    global.fetch = originalFetch;
  }
});

it("saves through onSaveSample and opens on the initial selection", async () => {
  const originalContext = window.AudioContext;
  const originalFetch = global.fetch;
  window.AudioContext = jest.fn(() => ({
    decodeAudioData: jest.fn().mockResolvedValue({
      sampleRate: 1,
      numberOfChannels: 1,
      length: 4,
      getChannelData: () => new Float32Array([0, 0.25, 0.5, 1])
    }),
    suspend: mockSuspend,
    close: mockClose
  })) as unknown as typeof AudioContext;
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    arrayBuffer: async () => new ArrayBuffer(0)
  });
  mockSave.mockClear();
  const onSaveSample = jest.fn().mockResolvedValue(true);
  try {
    render(
      <ThemeProvider theme={mockTheme}>
        <AudioSampleEditor
          asset={{ id: "clip-audio", get_url: "https://example.test/a.wav" } as Asset}
          onClose={() => undefined}
          onSaveSample={onSaveSample}
          initialSelection={{ start: 1, end: 9 }}
        />
      </ThemeProvider>
    );
    // The window is clamped to the 4-second sample.
    expect(await screen.findByTestId("selection")).toHaveTextContent("1-4");
    fireEvent.click(screen.getByText("Reverse"));
    fireEvent.click(screen.getByText("Save"));
    await waitFor(() => expect(onSaveSample).toHaveBeenCalledTimes(1));
    expect(Array.from(onSaveSample.mock.calls[0][0].channels[0])).toEqual([
      0, 1, 0.5, 0.25
    ]);
    expect(mockSave).not.toHaveBeenCalled();
  } finally {
    window.AudioContext = originalContext;
    global.fetch = originalFetch;
  }
});

it("puts the save status, history and Save in the document bar", async () => {
  const originalContext = window.AudioContext;
  const originalFetch = global.fetch;
  window.AudioContext = jest.fn(() => ({
    decodeAudioData: jest.fn().mockResolvedValue({
      sampleRate: 1,
      numberOfChannels: 1,
      length: 3,
      getChannelData: () => new Float32Array([0, 0.5, 1])
    }),
    suspend: mockSuspend,
    close: mockClose
  })) as unknown as typeof AudioContext;
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    arrayBuffer: async () => new ArrayBuffer(0)
  });
  mockSave.mockReset();
  const asset = {
    id: "audio-bar",
    get_url: "https://example.test/audio.wav"
  } as Asset;
  try {
    render(
      <AudioSampleEditor
        asset={asset}
        active
        documentBar={(slots) => <DocumentBar title="take.wav" {...slots} />}
      />,
      {
        wrapper: ({ children }) => (
          <ThemeProvider theme={mockTheme}>{children}</ThemeProvider>
        )
      }
    );
    await screen.findByTestId("sample");
    const bar = screen.getByRole("toolbar", { name: "take.wav document" });
    expect(bar).toHaveTextContent("Saved");
    expect(within(bar).getByRole("button", { name: /save/i })).toBeDisabled();

    fireEvent.click(screen.getByText("Reverse"));
    expect(bar).toHaveTextContent("Unsaved changes");

    mockSave.mockResolvedValueOnce(false);
    fireEvent.click(within(bar).getByRole("button", { name: /^save$/i }));
    await waitFor(() => expect(bar).toHaveTextContent("Not saved"));

    mockSave.mockResolvedValueOnce(true);
    fireEvent.click(within(bar).getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(bar).toHaveTextContent("Saved"));
    expect(within(bar).getByRole("button", { name: /undo/i })).toBeEnabled();
  } finally {
    window.AudioContext = originalContext;
    global.fetch = originalFetch;
  }
});
