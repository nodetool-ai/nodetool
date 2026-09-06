/**
 * The voicing strip (F8).
 *
 * The guided flow writes stage `done` and opens this editor before the takes
 * arrive (PRD § 9.3), so the outcome of *Voice all* has to be visible here:
 * which state the run is in, which lines produced no audio and why, and a way
 * to voice those again. A script nobody has voiced carries no record and must
 * look exactly as it did before the strip existed.
 */
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../__mocks__/themeMock";

const rpcRequest = jest.fn();
jest.mock("../../../lib/websocket/rpcRequest", () => ({
  rpcRequest: (...args: unknown[]) => rpcRequest(...(args as [])),
  randomRequestId: () => "req-test"
}));

jest.mock("../../../trpc/client", () => ({
  trpc: {
    storyboards: { get: { useQuery: jest.fn(() => ({ data: undefined })) } }
  },
  trpcClient: {}
}));

jest.mock("../StoryboardLinkControl", () => ({
  __esModule: true,
  default: () => null
}));

import {
  useScriptStore,
  type VoiceBinding
} from "../../../stores/script/ScriptStore";
import {
  readVoicingRun,
  voicingPatch,
  type VoicingRun
} from "../../../stores/script/scriptVoicing";
import ScriptDocumentPane from "../ScriptDocumentPane";

const SCRIPT_ID = "script-voicing";
const VOICE: VoiceBinding = {
  provider: "elevenlabs",
  model: "eleven_v3",
  voice: "alloy"
};

const seed = (run?: VoicingRun): void => {
  useScriptStore.setState({ scripts: {}, history: {}, saveStatus: {} });
  useScriptStore.getState().loadScript(SCRIPT_ID, {
    title: "My script",
    cast: [{ id: "sp-1", name: "Mara", voice: VOICE }],
    sections: [
      {
        id: "s1",
        lines: [
          { id: "line-a", speakerId: "sp-1", text: "Hello there.", takes: [] },
          { id: "line-b", speakerId: "sp-1", text: "And again.", takes: [] }
        ]
      }
    ],
    timelineId: null,
    storyboardId: null
  });
  // The flow's own field: a script that never went through setup has none, and
  // the record is written onto it.
  useScriptStore.getState().setSetup(SCRIPT_ID, { stage: "done", brief: "" });
  if (run) {
    useScriptStore.getState().setSetup(SCRIPT_ID, voicingPatch(run));
  }
};

const completedWithFailures = (): VoicingRun => ({
  status: "completed",
  total: 2,
  voiced: 1,
  failed: [{ lineId: "line-b", error: "that voice is offline" }],
  updatedAt: "2026-01-01T00:00:00.000Z"
});

const renderPane = () =>
  render(
    <ThemeProvider theme={mockTheme}>
      <ScriptDocumentPane scriptId={SCRIPT_ID} readOnly={false} />
    </ThemeProvider>
  );

beforeEach(() => {
  rpcRequest.mockReset();
});

describe("ScriptDocumentPane voicing strip", () => {
  it("renders nothing for a script nobody has voiced", () => {
    seed();
    renderPane();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.queryByText(/Voiced/)).not.toBeInTheDocument();
  });

  it("distinguishes queued from running", () => {
    seed({
      status: "queued",
      total: 2,
      voiced: 0,
      failed: [],
      updatedAt: "2026-01-01T00:00:00.000Z"
    });
    const queued = renderPane();
    expect(screen.getByText("Voicing queued for 2 lines.")).toBeInTheDocument();
    queued.unmount();

    seed({
      status: "running",
      total: 2,
      voiced: 1,
      failed: [],
      updatedAt: "2026-01-01T00:00:00.000Z"
    });
    renderPane();
    expect(screen.getByText(/Voicing 1 of 2 lines/)).toBeInTheDocument();
  });

  it("names each failed line with the reason it gave", () => {
    seed(completedWithFailures());
    renderPane();

    expect(
      screen.getByText("Voiced 1 of 2 lines. 1 line could not be voiced.")
    ).toBeInTheDocument();
    expect(
      screen.getByText(/“And again\.” — that voice is offline/)
    ).toBeInTheDocument();
  });

  it("retries a failed line through the same voicing path", async () => {
    const user = userEvent.setup();
    seed(completedWithFailures());
    rpcRequest.mockImplementation(async (command: string) =>
      command === "generate_media" ? { asset_ids: ["asset-b"] } : { words: [] }
    );
    renderPane();

    await user.click(screen.getByRole("button", { name: "Retry" }));

    await waitFor(() => {
      const run = readVoicingRun(
        useScriptStore.getState().scripts[SCRIPT_ID].setup
      );
      expect(run?.failed).toHaveLength(0);
      // The retry belongs to the run that failed, so the line it voiced is
      // added to that run rather than starting a count of its own.
      expect(run?.voiced).toBe(2);
      expect(run?.total).toBe(2);
    });
    expect(
      useScriptStore
        .getState()
        .scripts[SCRIPT_ID].sections[0].lines[1].takes
    ).toHaveLength(1);
  });

  it("keeps a failure nobody retried, and says why the retry failed again", async () => {
    const user = userEvent.setup();
    seed({
      status: "completed",
      total: 2,
      voiced: 0,
      failed: [
        { lineId: "line-a", error: "no provider key" },
        { lineId: "line-b", error: "that voice is offline" }
      ],
      updatedAt: "2026-01-01T00:00:00.000Z"
    });
    rpcRequest.mockRejectedValue(new Error("still offline"));
    renderPane();

    // The second line's own Retry, not the batch.
    await user.click(screen.getAllByRole("button", { name: "Retry" })[1]);

    await waitFor(() => {
      const run = readVoicingRun(
        useScriptStore.getState().scripts[SCRIPT_ID].setup
      );
      expect(run?.failed).toEqual([
        { lineId: "line-a", error: "no provider key" },
        { lineId: "line-b", error: "still offline" }
      ]);
    });
  });
});
