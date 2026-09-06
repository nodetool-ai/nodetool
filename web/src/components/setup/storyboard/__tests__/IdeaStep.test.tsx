/**
 * Step 1: the brief reaches the document as it is typed, the inspiration chips
 * come from the shipped boards, and both import paths write what the file
 * holds — or nothing at all (criteria 16, 17).
 */
import React from "react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";

jest.mock("../../../../hooks/useResolvedMediaUri");

const examples = [
  {
    slug: "first-light",
    name: "First Light",
    description: "A finished board to open and read.",
    logline: "A ten-second teaser for a desert trip.",
    tags: [],
    shotCount: 3,
    clipCount: 3,
    aspectRatio: "16:9",
    thumbnailUrl: null
  },
  {
    slug: "lighthouse-keeper",
    name: "Lighthouse Keeper",
    description: "Every shot already rendered.",
    logline: "Open a short film about the last keeper of a coastal light.",
    tags: [],
    shotCount: 4,
    clipCount: 4,
    aspectRatio: "16:9",
    thumbnailUrl: null
  },
  {
    slug: "sneaker-drop",
    name: "Sneaker Drop",
    description: "A working example the moment it installs.",
    logline: "Fifteen seconds for a running-shoe launch.",
    tags: [],
    shotCount: 3,
    clipCount: 3,
    aspectRatio: "9:16",
    thumbnailUrl: null
  },
  {
    slug: "fourth-board",
    name: "Fourth",
    description: "One more than the step offers.",
    logline: "A fourth idea nobody sees.",
    tags: [],
    shotCount: 1,
    clipCount: 0,
    aspectRatio: "16:9",
    thumbnailUrl: null
  }
];

jest.mock("../../../../hooks/storyboard/useStoryboards", () => ({
  useExampleStoryboards: () => ({ data: examples, isLoading: false })
}));

// The skill list is what `/` completion reads. Nothing in the flow may ask
// for it — see the `/` test below.
const useSkills = jest.fn(() => ({ data: [] }));
jest.mock("../../../../hooks/skills/useSkills", () => ({
  useSkills: () => useSkills()
}));

// The extraction route (D16): PDF and DOCX are read on the server, so the
// test drives its answers rather than a parser.
const restFetch = jest.fn();
jest.mock("../../../../lib/rest-fetch", () => ({
  restFetch: (input: RequestInfo | URL, init?: RequestInit) =>
    restFetch(input, init)
}));

const routeAnswer = (status: number, body: unknown): Response =>
  ({
    ok: status < 400,
    status,
    json: async () => body
  }) as Response;

import mockTheme from "../../../../__mocks__/themeMock";
import { IdeaStep } from "../IdeaStep";
import { useStoryboardStore } from "../../../../stores/storyboard/StoryboardStore";
import {
  clearImport,
  getImportSource
} from "../../../../lib/storyboard/importSource";

const BOARD = "board-idea";

const fixture = (name: string): string =>
  readFileSync(
    join(__dirname, "..", "..", "..", "..", "lib", "storyboard", "__fixtures__", name),
    "utf8"
  );

/** jsdom's File has no `text()`, and the import paths read the bytes. */
const upload = (name: string, type: string, content: string): File => {
  const file = new File([content], name, { type });
  Object.defineProperty(file, "text", {
    value: () => Promise.resolve(content)
  });
  return file;
};

const renderStep = () => {
  const onStartBlank = jest.fn();
  const onOpenTutorial = jest.fn();
  render(
    <ThemeProvider theme={mockTheme}>
      <IdeaStep
        boardId={BOARD}
        onStartBlank={onStartBlank}
        onOpenTutorial={onOpenTutorial}
      />
    </ThemeProvider>
  );
  return { onStartBlank, onOpenTutorial };
};

const board = () => useStoryboardStore.getState().getBoard(BOARD);

beforeEach(() => {
  useSkills.mockClear();
  restFetch.mockReset();
  clearImport(BOARD);
  useStoryboardStore.setState({ boards: {} } as never);
  useStoryboardStore.getState().ensureBoard(BOARD);
});

describe("IdeaStep", () => {
  it("asks the question and shows the placeholder from Appendix A", () => {
    renderStep();

    expect(
      screen.getByRole("heading", { name: "What's your story?" })
    ).toBeInTheDocument();
    expect(
      screen.getByText("We'll turn it into a screenplay and storyboard.")
    ).toBeInTheDocument();
    expect(
      screen.getByPlaceholderText(
        "One sentence is enough, or paste a full script."
      )
    ).toBeInTheDocument();
  });

  it("writes what is typed onto the board", async () => {
    const user = userEvent.setup();
    renderStep();

    await user.type(screen.getByRole("textbox"), "A keeper loses the light.");

    expect(board()?.brief).toBe("A keeper loses the light.");
    expect(board()?.setupStage).toBe("done");
  });

  it("offers three example loglines and pastes the one picked", async () => {
    const user = userEvent.setup();
    renderStep();

    const chips = screen.getByRole("group", { name: "Inspiration" });
    expect(chips.textContent).toContain(
      "A ten-second teaser for a desert trip."
    );
    expect(chips.textContent).not.toContain("A fourth idea nobody sees.");

    await user.click(
      screen.getByText("Fifteen seconds for a running-shoe launch.")
    );

    expect(board()?.brief).toBe(
      "Fifteen seconds for a running-shoe launch."
    );
  });

  // `/` starts a skill on the New Project surface. Inside the flow the text is
  // a brief for the Director, so the trigger is off (PRD § 7.1).
  it("does not complete a skill on /", async () => {
    const user = userEvent.setup();
    renderStep();

    const textarea = screen.getByRole("textbox");
    await user.click(textarea);
    await user.keyboard("/");

    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(useSkills).not.toHaveBeenCalled();
    expect(board()?.brief).toBe("/");
  });

  it("offers blank and the tutorial", async () => {
    const user = userEvent.setup();
    const { onStartBlank, onOpenTutorial } = renderStep();

    await user.click(
      screen.getByRole("button", { name: /Start with a blank storyboard/ })
    );
    await user.click(screen.getByRole("button", { name: /Take the tutorial/ }));

    expect(onStartBlank).toHaveBeenCalledTimes(1);
    expect(onOpenTutorial).toHaveBeenCalledTimes(1);
  });

  it("serves the shotlist template from the public folder", () => {
    renderStep();

    expect(
      screen.getByRole("link", { name: "Download template" })
    ).toHaveAttribute("href", "/storyboard-shotlist-template.csv");
  });
});

describe("IdeaStep — upload your file", () => {
  it("parses an FDX in the browser, keeping its dialogue verbatim", async () => {
    const user = userEvent.setup();
    renderStep();

    await user.upload(
      screen.getByLabelText("Upload your file"),
      upload("script.fdx", "text/xml", fixture("two-scenes.fdx"))
    );

    await waitFor(() => expect(board()?.shots).toHaveLength(4));
    expect(board()?.shots[1].dialogue).toBe(
      "SOPHIA\n(under her breath)\nNot today. Not again."
    );
    expect(board()?.screenplay?.scenes?.map((scene) => scene.slugline)).toEqual([
      "INT. SOPHIA'S FLAT - HALLWAY - EARLY MORNING",
      "EXT. CANAL PATH - MINUTES LATER"
    ]);
    // The Director is asked for camera only, so the parse is kept for the
    // post-check the review step reads (D10).
    expect(getImportSource(BOARD)?.kind).toBe("fdx");
    expect(restFetch).not.toHaveBeenCalled();
  });

  it("sends a PDF to the extraction route and lands its text", async () => {
    const user = userEvent.setup();
    restFetch.mockResolvedValue(
      routeAnswer(200, { text: "FADE IN. A door opens.", pages: 1 })
    );
    renderStep();

    await user.upload(
      screen.getByLabelText("Upload your file"),
      upload("script.pdf", "application/pdf", "%PDF-1.7")
    );

    await waitFor(() =>
      expect(board()?.brief).toBe("FADE IN. A door opens.")
    );
    expect(restFetch.mock.calls[0][0]).toBe("/api/documents/extract-text");
    expect(getImportSource(BOARD)?.kind).toBe("text");
  });

  it("writes nothing and shows the route's notice for a scanned PDF", async () => {
    const user = userEvent.setup();
    const scanned =
      "No text found in this PDF. Paste the script, or upload a DOCX or FDX.";
    restFetch.mockResolvedValue(
      routeAnswer(422, { code: "INVALID_INPUT", detail: scanned })
    );
    renderStep();

    await user.upload(
      screen.getByLabelText("Upload your file"),
      upload("scan.pdf", "application/pdf", "%PDF-1.7")
    );

    expect(await screen.findByText(scanned)).toBeInTheDocument();
    expect(board()?.brief).toBe("");
    expect(getImportSource(BOARD)).toBeUndefined();
  });

  it("writes nothing when the file is not a screenplay", async () => {
    const user = userEvent.setup();
    renderStep();

    await user.upload(
      screen.getByLabelText("Upload your file"),
      upload("notes.fdx", "text/xml", "just some notes")
    );

    expect(
      await screen.findByText(/could not be read/)
    ).toBeInTheDocument();
    expect(board()?.shots).toEqual([]);
    expect(board()?.brief).toBe("");
  });
});

describe("IdeaStep — import your shotlist", () => {
  it("creates the scenes and shots and reports what it discarded", async () => {
    const user = userEvent.setup();
    renderStep();

    await user.upload(
      screen.getByLabelText("Import your shotlist"),
      upload("shotlist.csv", "text/csv", fixture("shotlist.csv"))
    );

    await waitFor(() => expect(board()?.shots).toHaveLength(3));
    expect(board()?.screenplay?.scenes).toHaveLength(2);

    const report = await screen.findByRole("dialog");
    expect(report).toHaveTextContent("3 shots imported");
    expect(report).toHaveTextContent("mega-wide");
    expect(report).toHaveTextContent("not-a-number");
  });

  // Step 1 unmounts when the stage changes, so the report is read first and
  // the stage moves on the way out of it.
  it("advances to step 3 when the report is dismissed", async () => {
    const user = userEvent.setup();
    renderStep();

    await user.upload(
      screen.getByLabelText("Import your shotlist"),
      upload("shotlist.csv", "text/csv", fixture("shotlist.csv"))
    );
    await screen.findByRole("dialog");
    expect(board()?.setupStage).not.toBe("look");

    await user.click(screen.getByRole("button", { name: "Continue" }));

    expect(board()?.setupStage).toBe("look");
  });

  it("refuses a CSV missing a required header, naming it", async () => {
    const user = userEvent.setup();
    renderStep();

    await user.upload(
      screen.getByLabelText("Import your shotlist"),
      upload("bad.csv", "text/csv", "scene,shot\nINT. HALL,1\n")
    );

    expect(await screen.findByText(/description/)).toBeInTheDocument();
    expect(board()?.shots).toEqual([]);
    expect(board()?.setupStage).toBe("done");
  });
});
