/**
 * The script flow config: four stages in three stepper entries, resume at the
 * stage the document carries, and a last step that writes `done` before it
 * asks for a single take (PRD § 9.1–9.3, criteria 1 and 2).
 */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../../__mocks__/themeMock";

jest.mock("../../../../hooks/useResolvedMediaUri");

// The writer is the one model call in this flow, and whether the format step
// advances depends on its result, so the suite drives it directly. What it
// writes is pinned by `useWriteScript.test.tsx`.
const write = jest.fn(async () => true);
let writeError: string | null = null;
jest.mock("../../../../hooks/script/useWriteScript", () => ({
  useWriteScript: () => ({
    write,
    writing: false,
    get error() {
      return writeError;
    }
  })
}));

// The voices step reaches the TTS model list and the sample cache, neither of
// which this suite stands up; `VoicesStep.test.tsx` covers what it renders.
jest.mock("../VoicesStep", () => ({ VoicesStep: () => null }));

import {
  setScriptAgentHandler,
  type ScriptAgentHandler
} from "../../../../components/script/scriptAgentBridge";
import { useScriptStore } from "../../../../stores/script/ScriptStore";
import { SetupFlow } from "../../SetupFlow";
import { newScriptSetupDocument, useScriptSetupFlow } from "../useScriptSetupFlow";

const SCRIPT_ID = "s1";

const voiceAll = jest.fn(async () => ({ voiced: 3 }));

const Harness = ({ onFinish }: { onFinish?: () => void }) => {
  const config = useScriptSetupFlow({ scriptId: SCRIPT_ID, onFinish });
  return <SetupFlow config={config} />;
};

const renderFlow = (onFinish?: () => void) =>
  render(
    <ThemeProvider theme={mockTheme}>
      <Harness onFinish={onFinish} />
    </ThemeProvider>
  );

const stageOf = () => useScriptStore.getState().scripts[SCRIPT_ID].setup?.stage;

/** Everything the steps need to have written for their buttons to be live. */
const seedWrittenScript = (): void => {
  const store = useScriptStore.getState();
  store.setSetup(SCRIPT_ID, {
    brief: "How tide clocks work",
    format: "voiceover",
    length_seconds: 60
  });
  store.applyWrittenScript(SCRIPT_ID, {
    cast: [{ id: "spk_1", name: "Narrator" }],
    sections: [
      {
        id: "sec_1",
        title: "Open",
        lines: [
          { id: "line_1", speakerId: "spk_1", text: "A tide clock has one hand." }
        ]
      }
    ]
  });
  store.updateSpeaker(SCRIPT_ID, "spk_1", {
    voice: { provider: "elevenlabs", model: "eleven_v3", voice: "rachel" }
  });
};

beforeEach(() => {
  write.mockClear();
  write.mockResolvedValue(true);
  writeError = null;
  voiceAll.mockClear();
  useScriptStore.setState({ scripts: {}, history: {} } as never);
  useScriptStore.getState().ensureScript(SCRIPT_ID);
  setScriptAgentHandler(SCRIPT_ID, {
    voiceAll
  } as unknown as ScriptAgentHandler);
});

afterEach(() => {
  setScriptAgentHandler(SCRIPT_ID, null);
});

describe("useScriptSetupFlow", () => {
  it("collapses format and review into one stepper entry", () => {
    useScriptStore.getState().setSetup(SCRIPT_ID, { stage: "idea" });
    renderFlow();

    const steps = screen.getByRole("navigation", { name: "Setup steps" });
    expect(
      Array.from(steps.querySelectorAll("li")).map((item) => item.textContent)
    ).toEqual(["1. Idea", "2. Format", "3. Voices"]);
  });

  it("walks idea to voices, one stage per primary press", async () => {
    const user = userEvent.setup();
    seedWrittenScript();
    useScriptStore.getState().setSetup(SCRIPT_ID, { stage: "idea" });
    renderFlow();

    await user.click(screen.getByRole("button", { name: "Continue" }));
    expect(stageOf()).toBe("format");

    await user.click(screen.getByRole("button", { name: "Write the script" }));
    expect(write).toHaveBeenCalledWith(SCRIPT_ID, { rewrite: false });
    expect(stageOf()).toBe("review");

    await user.click(
      screen.getByRole("button", { name: "Continue to voices" })
    );
    expect(stageOf()).toBe("voices");
  });

  it("leaves the creator on format when the writer is refused", async () => {
    const user = userEvent.setup();
    seedWrittenScript();
    useScriptStore.getState().setSetup(SCRIPT_ID, { stage: "format" });
    write.mockResolvedValue(false);
    writeError = "No provider is connected.";
    renderFlow();

    await user.click(screen.getByRole("button", { name: "Write the script" }));

    expect(stageOf()).toBe("format");
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "No provider is connected."
    );
  });

  it("writes `done` and voices every line on the last step", async () => {
    const user = userEvent.setup();
    const onFinish = jest.fn();
    seedWrittenScript();
    useScriptStore.getState().setSetup(SCRIPT_ID, { stage: "voices" });
    renderFlow(onFinish);

    await user.click(screen.getByRole("button", { name: "Voice your script" }));

    expect(stageOf()).toBe("done");
    expect(onFinish).toHaveBeenCalledTimes(1);
    expect(voiceAll).toHaveBeenCalledTimes(1);
  });

  it("holds the last step until every speaker has a voice", () => {
    seedWrittenScript();
    useScriptStore.getState().updateSpeaker(SCRIPT_ID, "spk_1", { voice: null });
    useScriptStore.getState().setSetup(SCRIPT_ID, { stage: "voices" });
    renderFlow();

    expect(
      screen.getByRole("button", { name: "Voice your script" })
    ).toBeDisabled();
  });

  it("resumes at the stage the document carries", () => {
    seedWrittenScript();
    useScriptStore.getState().setSetup(SCRIPT_ID, { stage: "review" });
    renderFlow();

    expect(
      screen.getByRole("button", { name: "Continue to voices" })
    ).toBeInTheDocument();
  });

  it("renders no flow for a script written before it existed", () => {
    // No `setup` at all: the stage reads `done` and the script belongs to the
    // editor, exactly as it did before this flow shipped (criterion 2, D3).
    const { container } = renderFlow();
    expect(useScriptStore.getState().scripts[SCRIPT_ID].setup).toBeNull();
    expect(container).toBeEmptyDOMElement();
  });

  it("starts a card-created script at the idea stage with the typed brief", () => {
    expect(newScriptSetupDocument("a podcast intro")).toEqual({
      cast: [],
      sections: [],
      setup: { stage: "idea", brief: "a podcast intro" }
    });
  });
});
