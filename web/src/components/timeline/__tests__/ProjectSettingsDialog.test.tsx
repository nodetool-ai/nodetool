/**
 * ProjectSettingsDialog tests.
 *
 * The dialog edits the sequence-level canvas size, frame rate and tempo. It
 * seeds its draft from the store on open, lets a resolution preset fill
 * width/height, and persists via useTimelineProjectSettings — except the
 * tempo, which is document state the autosave already carries, so it goes
 * straight to the store's `setTempo`. Apply is gated on valid + changed values.
 */

import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../__mocks__/themeMock";
import { ProjectSettingsDialog } from "../ProjectSettingsDialog";

// ── Store + persistence hook mocks ───────────────────────────────────────────

const mockSetTempo = jest.fn();

interface MockClip {
  mediaType: string;
}

let storeState: {
  fps: number;
  width: number;
  height: number;
  tempo?: {
    bpm: number;
    offsetMs: number;
    timeSignature: { beatsPerBar: number; beatUnit: number };
  };
  clips: MockClip[];
  setTempo: typeof mockSetTempo;
};

const freshStore = () => ({
  fps: 30,
  width: 1920,
  height: 1080,
  clips: [] as MockClip[],
  setTempo: mockSetTempo
});

storeState = freshStore();

jest.mock("../../../stores/timeline/TimelineStore", () => ({
  useTimelineStore: <T,>(selector: (s: typeof storeState) => T) =>
    selector(storeState)
}));

const mockSave = jest.fn().mockResolvedValue(undefined);
jest.mock("../../../hooks/timeline/useTimelineProjectSettings", () => ({
  useTimelineProjectSettings: () => ({ save: mockSave, isSaving: false })
}));

const renderDialog = (onClose = jest.fn()) =>
  render(
    <ThemeProvider theme={mockTheme}>
      <ProjectSettingsDialog open onClose={onClose} />
    </ThemeProvider>
  );

const widthInput = () =>
  screen.getByRole("spinbutton", { name: /width/i }) as HTMLInputElement;
const heightInput = () =>
  screen.getByRole("spinbutton", { name: /height/i }) as HTMLInputElement;
const fpsInput = () =>
  screen.getByRole("spinbutton", { name: /fps/i }) as HTMLInputElement;
const bpmInput = () =>
  screen.getByRole("spinbutton", { name: /bpm/i }) as HTMLInputElement;
const beatsPerBarInput = () =>
  screen.getByRole("spinbutton", {
    name: /beats per bar/i
  }) as HTMLInputElement;

beforeEach(() => {
  jest.clearAllMocks();
  storeState = freshStore();
});

describe("ProjectSettingsDialog", () => {
  it("seeds the draft from the store", () => {
    renderDialog();
    expect(widthInput().value).toBe("1920");
    expect(heightInput().value).toBe("1080");
    expect(fpsInput().value).toBe("30");
  });

  it("disables Apply when nothing has changed", () => {
    renderDialog();
    expect(screen.getByRole("button", { name: "Apply" })).toBeDisabled();
  });

  it("persists edited width, height and fps on Apply", async () => {
    const onClose = jest.fn();
    renderDialog(onClose);

    fireEvent.change(widthInput(), { target: { value: "1080" } });
    fireEvent.change(heightInput(), { target: { value: "1920" } });
    fireEvent.change(fpsInput(), { target: { value: "60" } });

    const apply = screen.getByRole("button", { name: "Apply" });
    expect(apply).toBeEnabled();
    fireEvent.click(apply);

    await waitFor(() =>
      expect(mockSave).toHaveBeenCalledWith({
        width: 1080,
        height: 1920,
        fps: 60
      })
    );
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it("keeps Apply disabled for an out-of-range dimension", () => {
    renderDialog();
    fireEvent.change(widthInput(), { target: { value: "4" } }); // below MIN_DIM
    expect(screen.getByRole("button", { name: "Apply" })).toBeDisabled();
    expect(mockSave).not.toHaveBeenCalled();
  });

  it("seeds the tempo draft at the document default", () => {
    renderDialog();
    expect(bpmInput().value).toBe("120");
    expect(beatsPerBarInput().value).toBe("4");
  });

  it("sets the tempo on the store and leaves the canvas PATCH alone", async () => {
    const onClose = jest.fn();
    renderDialog(onClose);

    fireEvent.change(bpmInput(), { target: { value: "90" } });
    fireEvent.change(beatsPerBarInput(), { target: { value: "3" } });
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));

    await waitFor(() =>
      expect(mockSetTempo).toHaveBeenCalledWith({
        bpm: 90,
        offsetMs: 0,
        timeSignature: { beatsPerBar: 3, beatUnit: 4 }
      })
    );
    // Tempo rides in the document slice; only width/height/fps are PATCHed.
    expect(mockSave).not.toHaveBeenCalled();
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it("keeps Apply disabled for a BPM outside 20–300", () => {
    renderDialog();
    fireEvent.change(bpmInput(), { target: { value: "1000" } });
    expect(screen.getByRole("button", { name: "Apply" })).toBeDisabled();
    expect(mockSetTempo).not.toHaveBeenCalled();
  });

  it("says what a tempo change does to the parts already in the document", () => {
    storeState = { ...freshStore(), clips: [{ mediaType: "midi" }] };
    renderDialog();
    expect(screen.getByText(/play at the new speed/i)).toBeInTheDocument();
  });

  it("says nothing about parts when the document has none", () => {
    renderDialog();
    expect(screen.queryByText(/play at the new speed/i)).toBeNull();
  });
});
