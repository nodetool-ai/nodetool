/**
 * Step 1 of the script flow (PRD § 9.1): the brief writes straight to the
 * document, and each of the three other ways in lands the creator's own words
 * in the import registry — which is what makes the writer split and attribute
 * them instead of rewriting them (criterion 4).
 */
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../../__mocks__/themeMock";

const restFetch = jest.fn();
jest.mock("../../../../lib/rest-fetch", () => ({
  restFetch: (...args: unknown[]) => restFetch(...(args as []))
}));

import { getScriptImport, clearScriptImport } from "../../../../lib/script/importedScript";
import { useScriptStore } from "../../../../stores/script/ScriptStore";
import { IdeaStep } from "../IdeaStep";

const SCRIPT_ID = "s-idea";

const renderStep = (onStartBlank = jest.fn()) => {
  render(
    <ThemeProvider theme={mockTheme}>
      <IdeaStep scriptId={SCRIPT_ID} onStartBlank={onStartBlank} />
    </ThemeProvider>
  );
  return onStartBlank;
};

const setupNow = () => useScriptStore.getState().scripts[SCRIPT_ID].setup;

/** jsdom's File has no `text()`, and the import paths read the bytes. */
const upload = (name: string, type: string, content: string): File => {
  const file = new File([content], name, { type });
  Object.defineProperty(file, "text", {
    value: () => Promise.resolve(content)
  });
  return file;
};

beforeEach(() => {
  restFetch.mockReset();
  clearScriptImport(SCRIPT_ID);
  useScriptStore.setState({ scripts: {}, history: {} } as never);
  useScriptStore.getState().ensureScript(SCRIPT_ID);
  useScriptStore.getState().setSetup(SCRIPT_ID, { stage: "idea" });
});

describe("script IdeaStep", () => {
  it("writes what is typed to the document as it is typed", async () => {
    const user = userEvent.setup();
    renderStep();

    await user.type(screen.getByRole("textbox", { name: "Your script" }), "tide clocks");

    expect(setupNow()?.brief).toBe("tide clocks");
  });

  it("fills the brief from an inspiration chip", async () => {
    const user = userEvent.setup();
    renderStep();

    await user.click(
      screen.getByRole("button", { name: /60-second explainer/ })
    );

    expect(setupNow()?.brief).toMatch(/tide clocks/);
  });

  it("keeps pasted words as an import, split into lines", async () => {
    const user = userEvent.setup();
    renderStep();

    await user.click(screen.getByRole("button", { name: /Paste your script/ }));
    // The dialog hides the step behind it from the accessibility tree, so the
    // only textbox on screen is the one in the dialog.
    await user.type(
      screen.getByRole("textbox", { name: "Your script" }),
      "First line.{Enter}Second line."
    );
    await user.click(screen.getByRole("button", { name: "Use this text" }));

    expect(getScriptImport(SCRIPT_ID)?.lines.map((line) => line.text)).toEqual([
      "First line.",
      "Second line."
    ]);
    expect(getScriptImport(SCRIPT_ID)?.attributed).toBe(false);
    expect(setupNow()?.brief).toBe("First line.\nSecond line.");
  });

  it("turns an uploaded subtitle file into timed lines under one Narrator", async () => {
    const user = userEvent.setup();
    renderStep();

    await user.upload(
      screen.getByLabelText("Import subtitles") as HTMLInputElement,
      upload(
        "clip.srt",
        "text/plain",
        "1\n00:00:00,500 --> 00:00:03,250\nA tide clock has one hand.\n"
      )
    );

    await waitFor(() =>
      expect(getScriptImport(SCRIPT_ID)?.lines).toEqual([
        {
          text: "A tide clock has one hand.",
          speakerName: "Narrator",
          targetDurationMs: 2750
        }
      ])
    );
    expect(getScriptImport(SCRIPT_ID)?.attributed).toBe(true);
    expect(restFetch).not.toHaveBeenCalled();
  });

  it("sends a PDF to the extraction route and keeps what comes back", async () => {
    const user = userEvent.setup();
    restFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ text: "One sentence.\nAnother sentence." })
    });
    renderStep();

    await user.upload(
      screen.getByLabelText("Upload a file") as HTMLInputElement,
      new File(["%PDF-1.7"], "notes.pdf", { type: "application/pdf" })
    );

    await waitFor(() =>
      expect(restFetch).toHaveBeenCalledWith(
        "/api/documents/extract-text",
        expect.objectContaining({ method: "POST" })
      )
    );
    expect(getScriptImport(SCRIPT_ID)?.lines.map((line) => line.text)).toEqual([
      "One sentence.",
      "Another sentence."
    ]);
  });

  it("says why a file was refused and writes nothing", async () => {
    const user = userEvent.setup();
    restFetch.mockResolvedValue({
      ok: false,
      json: async () => ({ detail: "This PDF holds no selectable text." })
    });
    renderStep();

    await user.upload(
      screen.getByLabelText("Upload a file") as HTMLInputElement,
      new File(["%PDF-1.7"], "scan.pdf", { type: "application/pdf" })
    );

    expect(await screen.findByText("This PDF holds no selectable text.")).toBeInTheDocument();
    expect(getScriptImport(SCRIPT_ID)).toBeUndefined();
    expect(setupNow()?.brief).toBe("");
  });

  it("offers the blank escape hatch", async () => {
    const user = userEvent.setup();
    const onStartBlank = renderStep();

    await user.click(
      screen.getByRole("button", { name: /Start with a blank script/ })
    );

    expect(onStartBlank).toHaveBeenCalledTimes(1);
  });
});
