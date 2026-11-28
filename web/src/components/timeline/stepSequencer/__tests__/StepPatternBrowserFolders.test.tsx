/**
 * SQ43 round 7: the Pattern Browser shows the user folder tree and edits it
 * with New Folder, Rename and Delete; dragging a user pattern onto a folder
 * moves it. Runs the real library ops against an in-memory library.
 */

import React from "react";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";

import { normalizePattern } from "@nodetool-ai/timeline";
import { applyTimelineOp, createMemoryStepPatternLibrary, type TimelineOp, type TimelineOpResult } from "@nodetool-ai/timeline/ops";

import mockTheme from "../../../../__mocks__/themeMock";
import "../../../../i18n/i18n";
import { StepPatternBrowser, STEP_PATTERN_DRAG_TYPE } from "../StepPatternBrowser";

const ROOT = "Step Patterns/Patterns";
const PATTERN_ID = "0000000aa0a000000000000000000000";

function setup() {
  const library = createMemoryStepPatternLibrary({
    entries: [
      {
        id: PATTERN_ID,
        name: "My Groove",
        kind: "pattern",
        category: "user",
        tags: [],
        folder: `${ROOT}/Drums`,
        pattern: normalizePattern({ name: "My Groove", lengthSteps: 16, rows: [] })
      }
    ],
    folders: [
      { id: "0000000af01d00000000000000000000", kind: "pattern", folder: `${ROOT}/Drums` },
      { id: "0000000bf01d00000000000000000000", kind: "pattern", folder: `${ROOT}/Fills` }
    ]
  });
  const state = { fps: 30, width: 1920, height: 1080, tracks: [], clips: [], markers: [], playheadMs: 0, selectedClipIds: [] };
  const run = jest.fn(async (ops: TimelineOp[]): Promise<TimelineOpResult[]> => {
    const out: TimelineOpResult[] = [];
    for (const op of ops) {
      const r = await applyTimelineOp(state as never, op, { newId: () => "x", stepPatternLibrary: library } as never);
      if (r.error) throw new Error(r.error);
      out.push(r.result);
    }
    return out;
  });
  const onError = jest.fn();
  render(
    <ThemeProvider theme={mockTheme}>
      <StepPatternBrowser clipId="c" patternName="Beat" run={run} onError={onError} />
    </ThemeProvider>
  );
  return { library, run, onError };
}

const browser = () => within(screen.getByTestId("step-pattern-browser"));
describe("Pattern Browser folders (SQ43)", () => {
  it("shows a user folder with its pattern inside", async () => {
    setup();
    const folder = await browser().findByTestId(`browser-folder-${ROOT}/Drums`);
    expect(folder).toHaveTextContent("Drums");
    expect(within(screen.getByTestId(`browser-folder-children-${ROOT}/Drums`)).getByText("My Groove")).toBeInTheDocument();
  });

  it("New Folder creates a folder and opens its name for editing", async () => {
    const user = userEvent.setup();
    const { library } = setup();
    await browser().findByTestId(`browser-folder-${ROOT}/Drums`);
    await user.click(browser().getByRole("button", { name: "Pattern actions" }));
    await user.click(await screen.findByRole("menuitem", { name: "New Folder" }));
    const input = await screen.findByRole("textbox", { name: "Folder name" });
    await user.clear(input);
    await user.type(input, "Bass{Enter}");
    await waitFor(async () => expect((await library.listFolders()).map((f) => f.folder)).toContain(`${ROOT}/Bass`));
    expect(await browser().findByTestId(`browser-folder-${ROOT}/Bass`)).toBeInTheDocument();
  });

  it("Rename renames a folder from its context menu", async () => {
    const user = userEvent.setup();
    const { library } = setup();
    fireEvent.contextMenu(await browser().findByTestId(`browser-folder-${ROOT}/Drums`));
    await user.click(await screen.findByRole("menuitem", { name: "Rename Folder" }));
    const input = await screen.findByRole("textbox", { name: "Folder name" });
    await user.clear(input);
    await user.type(input, "Beats{Enter}");
    await waitFor(async () => expect((await library.list())[0]!.folder).toBe(`${ROOT}/Beats`));
    expect(await browser().findByTestId(`browser-folder-${ROOT}/Beats`)).toBeInTheDocument();
  });

  it("F63: a failed rename shows the error and reloads the library", async () => {
    const user = userEvent.setup();
    const { library, run, onError } = setup();
    fireEvent.contextMenu(await browser().findByTestId(`browser-folder-${ROOT}/Drums`));
    await user.click(await screen.findByRole("menuitem", { name: "Rename Folder" }));
    const input = await screen.findByRole("textbox", { name: "Folder name" });
    library.renameFolder = async () => {
      throw new Error("HTTP 500");
    };
    const lists = () => run.mock.calls.filter(([ops]) => ops[0]?.op === "list_step_patterns").length;
    const before = lists();
    await user.clear(input);
    await user.type(input, "Beats{Enter}");
    await waitFor(() => expect(onError).toHaveBeenCalledWith(expect.stringContaining("HTTP 500")));
    await waitFor(() => expect(lists()).toBeGreaterThan(before));
  });

  it("Delete removes the folder and moves its patterns to the parent", async () => {
    const user = userEvent.setup();
    const { library } = setup();
    fireEvent.contextMenu(await browser().findByTestId(`browser-folder-${ROOT}/Drums`));
    await user.click(await screen.findByRole("menuitem", { name: "Delete Folder" }));
    await waitFor(async () => expect((await library.list())[0]!.folder).toBe(ROOT));
    await waitFor(() => expect(browser().queryByTestId(`browser-folder-${ROOT}/Drums`)).toBeNull());
    expect(browser().getByText("My Groove")).toBeInTheDocument();
  });

  it("dragging a user pattern onto a folder moves it there", async () => {
    const { library } = setup();
    const entry = await browser().findByTestId(`browser-entry-${PATTERN_ID}`);
    const data: Record<string, string> = {};
    const dataTransfer = {
      setData: (k: string, v: string) => (data[k] = v),
      getData: (k: string) => data[k] ?? "",
      types: [STEP_PATTERN_DRAG_TYPE],
      effectAllowed: "",
      dropEffect: ""
    };
    fireEvent.dragStart(entry, { dataTransfer });
    const target = await browser().findByTestId(`browser-folder-${ROOT}/Fills`);
    fireEvent.dragOver(target, { dataTransfer });
    fireEvent.drop(target, { dataTransfer });
    await waitFor(async () => expect((await library.list())[0]!.folder).toBe(`${ROOT}/Fills`));
  });
});
