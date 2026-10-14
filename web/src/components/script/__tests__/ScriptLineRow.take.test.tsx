import { render, screen } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../__mocks__/themeMock";
import ScriptLineRow from "../ScriptLineRow";
import {
  useScriptStore,
  type ScriptLine,
  type ScriptSpeaker,
  type ScriptTake
} from "../../../stores/script/ScriptStore";

jest.mock("../../timeline/Tracks/useAssetUrl", () => ({
  useAssetUrl: () => undefined
}));

const SCRIPT_ID = "script-1";
const VOICE = { provider: "elevenlabs", model: "turbo", voice: "Rachel" };
const SPEAKER: ScriptSpeaker = {
  id: "mia",
  name: "Mia",
  color: "#60a5fa",
  voice: VOICE
};

const take = (id: string, text: string): ScriptTake => ({
  id,
  assetId: `asset-${id}`,
  durationMs: 1800,
  words: [],
  textSnapshot: text,
  voiceSnapshot: VOICE,
  createdAt: new Date(0).toISOString()
});

const renderRow = (line: ScriptLine) => {
  useScriptStore.getState().loadScript(SCRIPT_ID, {
    title: "T",
    cast: [SPEAKER],
    sections: [{ id: "s1", lines: [line] }],
    timelineId: null,
    storyboardId: null
  });
  return render(
    <ThemeProvider theme={mockTheme}>
      <ScriptLineRow
        scriptId={SCRIPT_ID}
        line={line}
        cast={[SPEAKER]}
        highlighted={false}
        readOnly={false}
      />
    </ThemeProvider>
  );
};

describe("ScriptLineRow take column", () => {
  beforeEach(() => {
    useScriptStore.setState({ scripts: {}, history: {}, saveStatus: {} });
  });

  it("numbers the current take and shows its length", () => {
    const text = "Hello?";
    renderRow({
      id: "l1",
      speakerId: "mia",
      text,
      takes: [take("t1", text), take("t2", text)],
      currentTakeId: "t2"
    });

    expect(screen.getByText("Take 2")).toBeInTheDocument();
    expect(screen.getByText("1.8 s")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Play take" })
    ).toBeInTheDocument();
  });

  it("marks a take whose text changed as stale", () => {
    renderRow({
      id: "l1",
      speakerId: "mia",
      text: "Hello again?",
      takes: [take("t1", "Hello?")],
      currentTakeId: "t1"
    });

    expect(screen.getByText("Stale")).toBeInTheDocument();
    expect(screen.queryByText(/^Take/)).toBeNull();
  });

  it("shows an empty strip for a line not voiced yet", () => {
    renderRow({ id: "l1", speakerId: "mia", text: "Hi.", takes: [] });

    expect(screen.getByText("Draft")).toBeInTheDocument();
    expect(screen.getByText("Not voiced yet")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Voice line" })).toBeEnabled();
  });
});
