/**
 * TimelineVersionHistoryPanel tests.
 *
 * Covers what the panel owns: the list rendering, the restore confirm →
 * mutation → store reload path (the one that keeps autosave from writing the
 * pre-restore document back), and the destructive delete confirm.
 */

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";

import mockTheme from "../../../__mocks__/themeMock";
import TimelineVersionHistoryPanel from "../TimelineVersionHistoryPanel";
import { TimelineProvider } from "../../../stores/timeline/TimelineInstance";
import { useTimelineStore } from "../../../stores/timeline/TimelineStore";

const createVersion = jest.fn();
const restoreVersion = jest.fn();
const deleteVersion = jest.fn();

let hookState: Record<string, unknown> = {};

jest.mock("../../../serverState/useTimelineVersions", () => ({
  __esModule: true,
  useTimelineVersions: () => hookState
}));

const version = (over: Record<string, unknown> = {}) => ({
  id: "v-1",
  timelineId: "t-1",
  version: 1,
  name: null,
  saveType: "autosave",
  fps: 30,
  width: 1920,
  height: 1080,
  durationMs: 4000,
  createdAt: new Date().toISOString(),
  ...over
});

const restoredSequence = {
  id: "t-1",
  projectId: "p-1",
  name: "seq",
  fps: 24,
  width: 1280,
  height: 720,
  durationMs: 2000,
  tracks: [
    {
      id: "track-restored",
      name: "Video",
      type: "video",
      index: 0,
      visible: true,
      locked: false
    }
  ],
  clips: [],
  markers: [],
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-02-02T00:00:00.000Z"
};

const renderPanel = () =>
  render(
    <ThemeProvider theme={mockTheme}>
      <TimelineProvider>
        <TimelineVersionHistoryPanel sequenceId="t-1" />
      </TimelineProvider>
    </ThemeProvider>
  );

beforeEach(() => {
  jest.clearAllMocks();
  restoreVersion.mockResolvedValue(restoredSequence);
  createVersion.mockResolvedValue(version());
  deleteVersion.mockResolvedValue({ ok: true });
  hookState = {
    versions: [
      version({ id: "v-2", version: 2, saveType: "manual", name: "before cut" }),
      version({ id: "v-1", version: 1, saveType: "autosave" })
    ],
    isLoading: false,
    error: null,
    createVersion,
    restoreVersion,
    deleteVersion,
    isCreatingVersion: false,
    isRestoringVersion: false,
    isDeletingVersion: false
  };
});

describe("TimelineVersionHistoryPanel", () => {
  it("lists versions newest first with save type and name", () => {
    renderPanel();
    expect(screen.getByText("v2")).toBeInTheDocument();
    expect(screen.getByText("v1")).toBeInTheDocument();
    expect(screen.getByText("Manual")).toBeInTheDocument();
    expect(screen.getByText("Auto")).toBeInTheDocument();
    expect(screen.getByText("before cut")).toBeInTheDocument();

    const restoreButtons = screen.getAllByRole("button", {
      name: /Restore version/
    });
    expect(restoreButtons[0]).toHaveAccessibleName("Restore version 2");
  });

  it("shows an empty state when there is no history", () => {
    hookState = { ...hookState, versions: [] };
    renderPanel();
    expect(screen.getByText("No versions yet")).toBeInTheDocument();
  });

  it("saves a named manual snapshot", async () => {
    const user = userEvent.setup();
    renderPanel();

    await user.click(screen.getByRole("button", { name: "Save version" }));
    await user.type(screen.getByLabelText("Name (optional)"), "keeper");
    await user.click(screen.getByRole("button", { name: "Save version" }));

    await waitFor(() => expect(createVersion).toHaveBeenCalledWith("keeper"));
  });

  it("restores after confirming and reloads the store from the response", async () => {
    const user = userEvent.setup();
    renderPanel();

    await user.click(
      screen.getByRole("button", { name: "Restore version 2" })
    );
    expect(screen.getByText("Restore v2?")).toBeInTheDocument();
    expect(restoreVersion).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Restore" }));

    await waitFor(() => expect(restoreVersion).toHaveBeenCalledWith(2));
    await waitFor(() => {
      const state = useTimelineStore.getState();
      expect(state.sequenceId).toBe("t-1");
      expect(state.tracks.map((t) => t.id)).toEqual(["track-restored"]);
      // Rolled to the restore response's token, so the next autosave PATCH
      // cannot 409 — and cannot carry the pre-restore document.
      expect(state.baseUpdatedAt).toBe("2026-02-02T00:00:00.000Z");
      expect(state.fps).toBe(24);
    });
  });

  it("does not restore when the confirm dialog is cancelled", async () => {
    const user = userEvent.setup();
    renderPanel();

    await user.click(
      screen.getByRole("button", { name: "Restore version 1" })
    );
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(restoreVersion).not.toHaveBeenCalled();
  });

  it("deletes only after the destructive confirm", async () => {
    const user = userEvent.setup();
    renderPanel();

    await user.click(screen.getByRole("button", { name: "Delete version 1" }));
    expect(screen.getByText("Delete v1?")).toBeInTheDocument();
    expect(deleteVersion).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(deleteVersion).toHaveBeenCalledWith(1));
  });
});
