import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../__mocks__/themeMock";
import AudioSampleEditor from "../AudioSampleEditor";
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
  default: ({ sample }: { sample: AudioSample }) => (
    <div data-testid="sample">{Array.from(sample.channels[0]).join(",")}</div>
  )
}));
jest.mock("../AudioEditorToolbar", () => ({
  __esModule: true,
  default: ({
    onReverse,
    onUndo,
    onSave,
    canUndo
  }: {
    onReverse: () => void;
    onUndo: () => void;
    onSave: () => void;
    canUndo: boolean;
  }) => (
    <>
      <button onClick={onReverse}>Reverse</button>
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
