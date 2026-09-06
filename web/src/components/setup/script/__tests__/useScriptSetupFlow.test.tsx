/**
 * The script flow config: four stages in three stepper entries, resume at the
 * stage the document carries, and a last step that writes `done` before it
 * asks for a single take (PRD § 9.1–9.3, criteria 1 and 2).
 */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
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

// The review step's writer-model picker reads the model catalog. This suite is
// about the stage walk, so the catalog answers empty and never opens a query.
jest.mock("../../../../hooks/useModelsByProvider", () => ({
  __esModule: true,
  useLanguageModelsByProvider: () => ({ models: [], isLoading: false })
}));
import {
  importedFromFdx,
  importedFromFile,
  readScriptSource,
  scriptSourcePatch
} from "../../../../lib/script/importedScript";
import { readScriptSetupContext } from "../scriptSetupContext";
import {
  writerSignature,
  writerSignaturePatch
} from "../../../../hooks/script/scriptWriteSignature";
import { readVoicingRun } from "../../../../stores/script/scriptVoicing";
import {
  newScriptSetupDocument,
  useScriptSetupFlow
} from "../useScriptSetupFlow";

const SCRIPT_ID = "s1";

const voiceAll = jest.fn(async () => ({ voiced: 3 }));

const Harness = ({ onFinish }: { onFinish?: () => void }) => {
  const config = useScriptSetupFlow({ scriptId: SCRIPT_ID, onFinish });
  return <SetupFlow config={config} />;
};

const renderFlow = (onFinish?: () => void) =>
  render(
    // The review step's model picker reads the model catalog through Query.
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <ThemeProvider theme={mockTheme}>
        <Harness onFinish={onFinish} />
      </ThemeProvider>
    </QueryClientProvider>
  );

const stageOf = () => useScriptStore.getState().scripts[SCRIPT_ID].setup?.stage;

const setupOf = () => useScriptStore.getState().scripts[SCRIPT_ID].setup;

/** Say that the script on the document is the answer to the inputs it carries. */
const markWritten = (): void => {
  const setup = setupOf();
  useScriptStore
    .getState()
    .setSetup(
      SCRIPT_ID,
      writerSignaturePatch(writerSignature(setup, readScriptSource(setup)))
    );
};

/** Everything the steps need to have written for their buttons to be live. */
const seedWrittenScript = (): void => {
  const store = useScriptStore.getState();
  store.setSetup(SCRIPT_ID, {
    brief: "How tide clocks work",
    format: "voiceover",
    writer_model: { id: "gpt-5-mini", provider: "openai" },
    length_seconds: 60
  });
  store.applyWrittenScript(SCRIPT_ID, {
    cast: [{ id: "spk_1", name: "Narrator" }],
    sections: [
      {
        id: "sec_1",
        title: "Open",
        lines: [
          {
            id: "line_1",
            speakerId: "spk_1",
            text: "A tide clock has one hand."
          }
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
  it("names the writer, text-only result and separate audio step before spending", async () => {
    seedWrittenScript();
    useScriptStore.getState().setSetup(SCRIPT_ID, { stage: "format" });
    renderFlow();
    const summary = await screen.findByRole("region", {
      name: "Before you generate"
    });
    expect(summary).toHaveTextContent("gpt-5-mini");
    expect(summary).toHaveTextContent(
      "Write a text script for about 60 seconds"
    );
    expect(summary).toHaveTextContent("generate audio separately in Voices");
    expect(summary).toHaveTextContent("Rough wait");
    expect(write).not.toHaveBeenCalled();
  });

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

    // The lines were seeded without a record of what wrote them, so the inputs
    // read as changed and the button offers the rewrite.
    await user.click(screen.getByRole("button", { name: "Rewrite" }));
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

    await user.click(screen.getByRole("button", { name: "Rewrite" }));

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

  it("continues to the script it already wrote when nothing changed (F15)", async () => {
    const user = userEvent.setup();
    seedWrittenScript();
    markWritten();
    useScriptStore.getState().setSetup(SCRIPT_ID, { stage: "format" });
    renderFlow();

    // No model call is offered, and none is made.
    expect(
      screen.queryByRole("region", { name: "Before you generate" })
    ).not.toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: "Continue to review" })
    );

    expect(write).not.toHaveBeenCalled();
    expect(stageOf()).toBe("review");
  });

  it("offers the rewrite once an input moves", () => {
    seedWrittenScript();
    markWritten();
    useScriptStore
      .getState()
      .setSetup(SCRIPT_ID, { stage: "format", length_seconds: 120 });
    renderFlow();

    expect(screen.getByRole("button", { name: "Rewrite" })).toBeEnabled();
  });

  it("writes an attributed import with no writer model picked (F16)", () => {
    const store = useScriptStore.getState();
    store.setSetup(SCRIPT_ID, {
      stage: "format",
      brief: "",
      format: "dialogue",
      writer_model: undefined
    });
    store.setSetup(
      SCRIPT_ID,
      scriptSourcePatch(
        importedFromFdx({
          shots: [{ dialogue: "SOPHIA\nAre you coming or not?" }]
        } as never)
      )
    );
    renderFlow();

    expect(screen.getByRole("button", { name: "Write the script" })).toBeEnabled();
    expect(
      screen.getByRole("region", { name: "Before you generate" })
    ).toHaveTextContent("no model call");
  });

  it("finishes on the text alone from the review (F16)", async () => {
    const user = userEvent.setup();
    const onFinish = jest.fn();
    seedWrittenScript();
    useScriptStore.getState().setSetup(SCRIPT_ID, { stage: "review" });
    renderFlow(onFinish);

    await user.click(
      screen.getByRole("button", { name: "Open the editor without voicing" })
    );

    expect(stageOf()).toBe("done");
    expect(onFinish).toHaveBeenCalledTimes(1);
    expect(voiceAll).not.toHaveBeenCalled();
  });

  it("asks for no voice for a speaker with nothing to say (F16)", () => {
    seedWrittenScript();
    useScriptStore
      .getState()
      .addSpeaker(SCRIPT_ID, { id: "spk_2", name: "Guest", voice: null });
    useScriptStore.getState().setSetup(SCRIPT_ID, { stage: "voices" });
    renderFlow();

    expect(
      screen.getByRole("button", { name: "Voice your script" })
    ).toBeEnabled();
  });

  it("records the voicing run it queued (F8)", async () => {
    const user = userEvent.setup();
    seedWrittenScript();
    useScriptStore.getState().setSetup(SCRIPT_ID, { stage: "voices" });
    renderFlow();

    await user.click(screen.getByRole("button", { name: "Voice your script" }));

    const run = readVoicingRun(setupOf());
    expect(run?.status).toBe("queued");
    expect(run?.total).toBe(1);
  });

  it("holds the last step until every speaker has a voice", () => {
    seedWrittenScript();
    useScriptStore
      .getState()
      .updateSpeaker(SCRIPT_ID, "spk_1", { voice: null });
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

  it("carries the composer's context and a handed-over script file (F4)", () => {
    const source = importedFromFile(
      "clip.srt",
      "1\n00:00:00,500 --> 00:00:03,250\nA tide clock has one hand.\n"
    );
    const document = newScriptSetupDocument("a podcast intro", {
      attachments: [{ uri: "asset://ref-1", name: "kitchen.png" }],
      entityIds: ["ent-1"],
      source
    });

    expect(readScriptSetupContext(document.setup ?? null)).toEqual({
      attachments: [{ uri: "asset://ref-1", name: "kitchen.png" }],
      entityIds: ["ent-1"]
    });
    // The file arrives as a source, not as flattened text: its cue timing and
    // its attribution are intact (F3).
    const carried = readScriptSource(document.setup ?? null);
    expect(carried?.kind).toBe("subtitles");
    expect(carried?.attributed).toBe(true);
    expect(carried?.lines[0].targetDurationMs).toBe(2750);
  });
});
