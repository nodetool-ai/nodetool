/**
 * The script flow config: four stages in three stepper entries, resume at the
 * stage the document carries, and a last step that writes `done` before it
 * asks for a single take (PRD § 9.1–9.3, criteria 1 and 2).
 */
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import mockTheme from "../../../../__mocks__/themeMock";

jest.mock("../../../../hooks/useResolvedMediaUri");

// A PDF goes to the extraction route; the import test holds its answer.
const restFetch = jest.fn();
jest.mock("../../../../lib/rest-fetch", () => ({
  restFetch: (...args: unknown[]) => restFetch(...(args as []))
}));

// The writer is the one model call in this flow, and whether the format step
// advances depends on its result, so the suite drives it directly. What it
// writes is pinned by `useWriteScript.test.tsx`.
const write = jest.fn(async () => true);
// `error` is state in the real hook and reaches the flow a render after
// `write` resolves. `errorRef` is set before it resolves. The mock keeps the
// two apart so a test can model that order.
let writeError: string | null = null;
const writeErrorRef: { current: string | null } = { current: null };
const clearError = jest.fn(() => {
  writeError = null;
  writeErrorRef.current = null;
});
jest.mock("../../../../hooks/script/useWriteScript", () => ({
  useWriteScript: () => ({
    write,
    writing: false,
    get error() {
      return writeError;
    },
    errorRef: writeErrorRef,
    clearError
  })
}));

// Pass-through, so a test can read what the estimate priced.
jest.mock("../../generationEstimate", () => {
  const actual = jest.requireActual("../../generationEstimate");
  return {
    ...actual,
    generationEstimate: jest.fn(actual.generationEstimate)
  };
});

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
  formatCost,
  newScriptSetupDocument,
  useScriptSetupFlow
} from "../useScriptSetupFlow";
import { generationEstimate } from "../../generationEstimate";

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
  restFetch.mockReset();
  write.mockReset();
  write.mockResolvedValue(true);
  writeError = null;
  writeErrorRef.current = null;
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
  it.each(["Control", "Meta"])(
    "commits custom seconds before %s+Enter starts the writer",
    async (modifier) => {
      seedWrittenScript();
      markWritten();
      useScriptStore.getState().setSetup(SCRIPT_ID, { stage: "format" });
      let writtenSeconds: number | undefined;
      write.mockImplementationOnce(async () => {
        writtenSeconds = setupOf()?.length_seconds;
        return true;
      });
      renderFlow();
      const user = userEvent.setup();
      await user.click(screen.getByRole("radio", { name: "Custom" }));
      const duration = screen.getByRole("spinbutton", {
        name: "Custom seconds"
      });
      await user.clear(duration);
      await user.type(duration, "90");
      await user.keyboard(`{${modifier}>}{Enter}{/${modifier}}`);
      await waitFor(() => expect(write).toHaveBeenCalledTimes(1));
      expect(writtenSeconds).toBe(90);
      expect(stageOf()).toBe("review");
    }
  );

  it("blocks invalid custom seconds until corrected or a preset is selected", async () => {
    seedWrittenScript();
    useScriptStore.getState().setSetup(SCRIPT_ID, { stage: "format" });
    renderFlow();
    const user = userEvent.setup();
    await user.click(screen.getByRole("radio", { name: "Custom" }));
    const duration = screen.getByRole("spinbutton", { name: "Custom seconds" });
    await user.clear(duration);
    expect(screen.getByRole("button", { name: "Rewrite" })).toBeDisabled();
    await user.keyboard("{Control>}{Enter}{/Control}");
    expect(write).not.toHaveBeenCalled();
    expect(stageOf()).toBe("format");
    await user.type(duration, "3601");
    expect(screen.getByRole("button", { name: "Rewrite" })).toBeDisabled();
    await user.click(screen.getByRole("radio", { name: "30s" }));
    await user.click(screen.getByRole("button", { name: "Rewrite" }));
    await waitFor(() => expect(write).toHaveBeenCalledTimes(1));
    expect(setupOf()?.length_seconds).toBe(30);
  });

  it("names the writer, text-only result and separate audio step before spending", async () => {
    seedWrittenScript();
    useScriptStore.getState().setSetup(SCRIPT_ID, { stage: "format" });
    renderFlow();
    const summary = await screen.findByRole("group", {
      name: "Before you generate"
    });
    expect(
      screen.getByRole("group", { name: "Generation settings" })
    ).toHaveTextContent("gpt-5-mini");
    // Lines on the script and no import: the button rewrites them (F13).
    expect(summary).toHaveAttribute(
      "title",
      expect.stringContaining(
        "Rewrite your 1 line for about 60 seconds of speech, keeping your edits as context"
      )
    );
    expect(summary).toHaveTextContent("30–60s");
    expect(write).not.toHaveBeenCalled();
  });

  it("says it writes a new script when there are no lines yet (F13)", async () => {
    useScriptStore.getState().setSetup(SCRIPT_ID, {
      stage: "format",
      brief: "How tide clocks work",
      format: "voiceover",
      writer_model: { id: "gpt-5-mini", provider: "openai" },
      length_seconds: 60
    });
    renderFlow();
    const summary = await screen.findByRole("group", {
      name: "Before you generate"
    });
    expect(summary).toHaveAttribute(
      "title",
      expect.stringContaining("Write a text script for about 60 seconds")
    );
  });

  it("prices the lines a rewrite sends along with the brief (F7)", async () => {
    seedWrittenScript();
    useScriptStore.getState().setSetup(SCRIPT_ID, { stage: "format" });
    (generationEstimate as jest.Mock).mockClear();
    renderFlow();
    await screen.findByRole("group", { name: "Before you generate" });
    const briefs = (generationEstimate as jest.Mock).mock.calls.map(
      (call) => call[1] as string
    );
    expect(briefs.length).toBeGreaterThan(0);
    expect(briefs.every((brief) => brief.includes("A tide clock has one hand."))).toBe(true);
    expect(briefs.every((brief) => brief.includes("How tide clocks work"))).toBe(true);
  });

  it("prices the imported words the attribution call sends (F7)", async () => {
    const store = useScriptStore.getState();
    store.setSetup(SCRIPT_ID, {
      stage: "format",
      brief: "",
      format: "voiceover",
      writer_model: { id: "gpt-5-mini", provider: "openai" }
    });
    store.setSetup(
      SCRIPT_ID,
      scriptSourcePatch(
        importedFromFile("notes.txt", "The tide came in at noon.\nIt left by six.")
      )
    );
    (generationEstimate as jest.Mock).mockClear();
    renderFlow();
    await screen.findByRole("group", { name: "Before you generate" });
    const briefs = (generationEstimate as jest.Mock).mock.calls.map(
      (call) => call[1] as string
    );
    expect(briefs.length).toBeGreaterThan(0);
    expect(briefs.every((brief) => brief.includes("It left by six."))).toBe(true);
  });

  it("says how many lines a partial voice estimate covers (F6)", () => {
    expect(formatCost(0.42, 5, 3)).toBe(
      "About $0.42 for 3 of 5 lines, the rest unpriced. Word timing transcription is extra."
    );
    expect(formatCost(0.42, 5, 5)).toBe(
      "About $0.42 to voice 5 lines. Word timing transcription is extra."
    );
    expect(formatCost(0.1, 1, 1)).toBe(
      "About $0.10 to voice 1 line. Word timing transcription is extra."
    );
    expect(formatCost(0, 1, 0)).toBe("1 line to voice");
    expect(formatCost(0, 0, 0)).toBeUndefined();
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
    // The lines on the script are handed to the writer as they stand, so the
    // edits made in the review are rewritten rather than thrown away.
    await user.click(screen.getByRole("button", { name: "Rewrite" }));
    expect(write).toHaveBeenCalledWith(SCRIPT_ID, {
      rewrite: true,
      signal: expect.any(AbortSignal)
    });
    expect(stageOf()).toBe("review");

    await user.click(
      screen.getByRole("button", { name: "Continue to voices" })
    );
    expect(stageOf()).toBe("voices");
  });

  it("writes a first script fresh, with nothing to rewrite", async () => {
    const user = userEvent.setup();
    useScriptStore.getState().setSetup(SCRIPT_ID, {
      stage: "format",
      brief: "How tide clocks work",
      format: "voiceover",
      writer_model: { id: "gpt-5-mini", provider: "openai" }
    });
    renderFlow();

    await user.click(screen.getByRole("button", { name: "Write the script" }));
    expect(write).toHaveBeenCalledWith(SCRIPT_ID, {
      rewrite: false,
      signal: expect.any(AbortSignal)
    });
  });

  it("holds Continue while a file is still being read", async () => {
    const user = userEvent.setup();
    let answer: (value: unknown) => void = () => undefined;
    restFetch.mockReturnValue(
      new Promise((resolve) => {
        answer = resolve;
      })
    );
    useScriptStore
      .getState()
      .setSetup(SCRIPT_ID, { stage: "idea", brief: "Tide clocks" });
    renderFlow();
    expect(screen.getByRole("button", { name: "Continue" })).toBeEnabled();

    await user.upload(
      screen.getByLabelText("Upload a file") as HTMLInputElement,
      new File(["%PDF-1.7"], "notes.pdf", { type: "application/pdf" })
    );
    expect(screen.getByRole("button", { name: "Continue" })).toBeDisabled();
    expect(screen.getByText("Reading your file")).toBeInTheDocument();

    answer({ ok: true, json: async () => ({ text: "One sentence." }) });
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Continue" })).toBeEnabled()
    );
    expect(readScriptSource(setupOf())?.text).toBe("One sentence.");
  });

  it("leaves the creator on format when the writer is refused", async () => {
    const user = userEvent.setup();
    seedWrittenScript();
    useScriptStore.getState().setSetup(SCRIPT_ID, { stage: "format" });
    // The reason exists only on the ref when `write` resolves: the state
    // copy has not rendered yet, so the flow must not read it (F5).
    write.mockImplementation(async () => {
      writeErrorRef.current = "No provider is connected.";
      return false;
    });
    renderFlow();

    await user.click(screen.getByRole("button", { name: "Rewrite" }));

    expect(stageOf()).toBe("format");
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "No provider is connected."
    );
    expect(screen.queryByText(/did not return a script/)).toBeNull();
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
      screen.queryByRole("group", { name: "Before you generate" })
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

    expect(
      screen.getByRole("button", { name: "Write the script" })
    ).toBeEnabled();
    expect(
      screen.getByRole("group", { name: "Before you generate" })
    ).toHaveTextContent("No model call");
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

  it("shows a refused Rewrite on the review (F6)", () => {
    seedWrittenScript();
    useScriptStore.getState().setSetup(SCRIPT_ID, { stage: "review" });
    writeError = "The writer timed out.";
    renderFlow();

    expect(screen.getByRole("alert")).toHaveTextContent(
      "The writer timed out."
    );
  });

  it("does not show a failed Rewrite again after leaving the review", async () => {
    const user = userEvent.setup();
    seedWrittenScript();
    markWritten();
    useScriptStore.getState().setSetup(SCRIPT_ID, { stage: "review" });
    writeError = "The writer timed out.";
    renderFlow();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "The writer timed out."
    );

    await user.click(screen.getByRole("button", { name: "Continue to voices" }));
    expect(stageOf()).toBe("voices");
    await user.click(screen.getByRole("button", { name: "Back" }));
    expect(stageOf()).toBe("review");

    expect(screen.queryByText("The writer timed out.")).not.toBeInTheDocument();
  });

  it("holds voicing while a line with words has no speaker (F7)", () => {
    seedWrittenScript();
    useScriptStore.getState().addLine(SCRIPT_ID);
    const [, added] = useScriptStore.getState().scripts[SCRIPT_ID].sections[0]
      .lines;
    useScriptStore
      .getState()
      .patchLine(SCRIPT_ID, added.id, { text: "And it turns." });
    useScriptStore.getState().setSetup(SCRIPT_ID, { stage: "review" });
    const { unmount } = renderFlow();

    expect(
      screen.getByRole("button", { name: "Continue to voices" })
    ).toBeDisabled();
    expect(
      screen.getByText(/Pick a speaker for 1 line\. A line with no speaker/)
    ).toBeInTheDocument();
    unmount();

    useScriptStore.getState().setSetup(SCRIPT_ID, { stage: "voices" });
    renderFlow();
    expect(
      screen.getByRole("button", { name: "Voice your script" })
    ).toBeDisabled();
  });

  it("keeps the script current when only the pace changes (O4)", () => {
    seedWrittenScript();
    markWritten();
    useScriptStore
      .getState()
      .setSetup(SCRIPT_ID, { stage: "format", pace: "fast" });
    renderFlow();

    expect(
      screen.getByRole("button", { name: "Continue to review" })
    ).toBeEnabled();
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

  it("carries creative context without making a second script owner", () => {
    const document = newScriptSetupDocument("a product launch", {
      creativeContext: {
        schema_version: 1,
        product_name: "Tide Clock",
        objective: "Explain the product"
      }
    });

    expect(document.creative_context).toEqual({
      schema_version: 1,
      product_name: "Tide Clock",
      objective: "Explain the product"
    });
    expect(document.setup).toEqual({
      stage: "idea",
      brief: "a product launch"
    });
  });
});
