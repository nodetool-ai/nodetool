/**
 * A refused *Voice all* or Retry says why. Both used to drop the rejection
 * (try/finally with no catch, and a bare `.finally`), so the click did nothing
 * visible and the reason went to an unhandled rejection.
 */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../__mocks__/themeMock";

const REFUSAL = "This script is being voiced in another tab.";

jest.mock("../../../stores/script/scriptVoicing", () => {
  const actual = jest.requireActual("../../../stores/script/scriptVoicing");
  return {
    ...actual,
    voiceAll: jest.fn(async () => {
      throw new Error(REFUSAL);
    }),
    retryVoicing: jest.fn(async () => {
      throw new Error(REFUSAL);
    })
  };
});

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

import { useScriptStore } from "../../../stores/script/ScriptStore";
import { voicingPatch } from "../../../stores/script/scriptVoicing";
import ScriptDocumentPane from "../ScriptDocumentPane";

const SCRIPT_ID = "script-refused";

const seed = (): void => {
  useScriptStore.setState({ scripts: {}, history: {}, saveStatus: {} });
  useScriptStore.getState().loadScript(SCRIPT_ID, {
    title: "My script",
    cast: [
      {
        id: "sp-1",
        name: "Mara",
        voice: { provider: "elevenlabs", model: "eleven_v3", voice: "alloy" }
      }
    ],
    sections: [
      {
        id: "s1",
        lines: [
          { id: "line-a", speakerId: "sp-1", text: "Hello there.", takes: [] }
        ]
      }
    ],
    timelineId: null,
    storyboardId: null
  });
  useScriptStore.getState().setSetup(SCRIPT_ID, { stage: "done", brief: "" });
};

const renderPane = () =>
  render(
    <ThemeProvider theme={mockTheme}>
      <ScriptDocumentPane scriptId={SCRIPT_ID} readOnly={false} />
    </ThemeProvider>
  );

describe("ScriptDocumentPane refused voicing", () => {
  it("shows why Voice all was refused", async () => {
    seed();
    const user = userEvent.setup();
    renderPane();
    await user.click(screen.getByRole("button", { name: /Voice all/ }));
    expect(await screen.findByText(REFUSAL)).toBeInTheDocument();
  });

  it("shows why a retry was refused", async () => {
    seed();
    useScriptStore.getState().setSetup(
      SCRIPT_ID,
      voicingPatch({
        status: "completed",
        total: 1,
        voiced: 0,
        failed: [{ lineId: "line-a", error: "that voice is offline" }],
        updatedAt: "2026-01-01T00:00:00.000Z"
      })
    );
    const user = userEvent.setup();
    renderPane();
    await user.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByText(REFUSAL)).toBeInTheDocument();
  });
});
