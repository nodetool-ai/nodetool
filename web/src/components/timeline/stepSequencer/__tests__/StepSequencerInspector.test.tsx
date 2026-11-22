/**
 * SQ31 round 6: the inspector lists every Pattern, Row and Step control, shows
 * `*` for a value that differs across the selection scope, and applies an
 * edit to every selected row or step (relative on a mixed field).
 */

import React from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";

import { normalizePattern } from "@nodetool-ai/timeline";
import type { StepPattern, StepRow } from "@nodetool-ai/timeline";
import type { TimelineOp } from "@nodetool-ai/timeline/ops";

import mockTheme from "../../../../__mocks__/themeMock";
import "../../../../i18n/i18n";
import { StepSequencerInspector, type InspectorStepTarget } from "../StepSequencerInspector";

const CLIP = "c1";

function makePattern(rows: Array<Partial<StepRow> & Pick<StepRow, "id" | "assignment">>, extra: Partial<StepPattern> = {}): StepPattern {
  return normalizePattern({ lengthSteps: 16, rows: rows as StepRow[], ...extra });
}

function renderInspector(opts: {
  pattern: StepPattern;
  rowIds?: string[];
  steps?: Array<[string, number[]]>;
  onAssignRows?: jest.Mock;
}) {
  const runOps = jest.fn<void, [TimelineOp[]]>();
  const rows = (opts.rowIds ?? []).map((id) => opts.pattern.rows.find((r) => r.id === id)!);
  const stepTargets: InspectorStepTarget[] = (opts.steps ?? []).map(([id, steps]) => ({
    row: opts.pattern.rows.find((r) => r.id === id)!,
    steps
  }));
  render(
    <ThemeProvider theme={mockTheme}>
      <StepSequencerInspector
        clipId={CLIP}
        pattern={opts.pattern}
        rows={rows}
        stepTargets={stepTargets}
        assignmentGroups={[{ id: "notes", label: "Notes", choices: [{ id: "note:38", label: "D1", assignment: { type: "note", pitch: 38 } }] }] as never}
        onAssignRows={opts.onAssignRows}
        runOps={runOps}
      />
    </ThemeProvider>
  );
  return { runOps, inspector: screen.getByTestId("step-sequencer-inspector") };
}

const twoRows = () =>
  makePattern([
    { id: "kick", assignment: { type: "note", pitch: 36 }, lengthSteps: 16, steps: [{ on: true, velocity: 80, midiChannel: 2 }] },
    { id: "hat", assignment: { type: "note", pitch: 42 }, lengthSteps: 12, steps: [{ on: true, velocity: 100, midiChannel: 4 }] }
  ]);

async function commit(user: ReturnType<typeof userEvent.setup>, field: HTMLElement, text: string) {
  await user.clear(field);
  await user.type(field, `${text}{Enter}`);
}

describe("Pattern tab (SQ31 item 1)", () => {
  it("has loop, key, no transpose, scale, Q and re-seed controls", async () => {
    const user = userEvent.setup();
    const { runOps, inspector } = renderInspector({ pattern: twoRows() });
    const q = within(inspector);
    expect(q.getByLabelText("Loop Start")).toBeInTheDocument();
    expect(q.getByLabelText("Loop End")).toBeInTheDocument();
    expect(q.getByLabelText("No Transpose")).toBeInTheDocument();
    expect(q.getAllByText("Key").length).toBeGreaterThan(0);
    expect(q.getAllByText("Scale").length).toBeGreaterThan(0);

    const quantize = q.getByRole("button", { name: "Scale Quantize" });
    expect(quantize).toHaveAttribute("aria-pressed", "false");
    await user.click(quantize);
    expect(runOps).toHaveBeenLastCalledWith([{ op: "set_pattern", clipId: CLIP, scaleQuantize: true }]);

    await user.click(q.getByRole("button", { name: /Re-seed/ }));
    expect(runOps).toHaveBeenLastCalledWith([{ op: "set_pattern_seed", clipId: CLIP }]);

    await user.click(q.getByLabelText("No Transpose"));
    expect(runOps).toHaveBeenLastCalledWith([{ op: "set_pattern", clipId: CLIP, noTranspose: true }]);
  });

  it("shows a mixed pattern loop end as * and clamps the loop start to the loop end", async () => {
    const user = userEvent.setup();
    const { runOps, inspector } = renderInspector({ pattern: twoRows() });
    const end = within(inspector).getByLabelText("Loop End") as HTMLInputElement;
    expect(end.value).toBe("*");
    const start = within(inspector).getByLabelText("Loop Start") as HTMLInputElement;
    expect(start.value).toBe("1");
    await commit(user, start, "40");
    expect(runOps).toHaveBeenLastCalledWith([{ op: "set_pattern", clipId: CLIP, loopStart: 12 }]);
  });
});

describe("Row tab (SQ31 items 1 and 2)", () => {
  it("has Row Assignment, Row Name and Automation Mode, applied to every selected row", async () => {
    const user = userEvent.setup();
    const onAssignRows = jest.fn();
    const { runOps, inspector } = renderInspector({ pattern: twoRows(), rowIds: ["kick", "hat"], onAssignRows });
    await user.click(within(inspector).getByRole("tab", { name: "Row" }));
    const q = within(inspector);

    await user.click(q.getByRole("button", { name: /Row Assignment/ }));
    await user.click(await screen.findByText("Notes"));
    await user.click(await screen.findByText("D1"));
    expect(onAssignRows).toHaveBeenCalledWith(["kick", "hat"], expect.objectContaining({ id: "note:38" }));

    await commit(user, q.getByLabelText("Row Name"), "Perc");
    expect(runOps).toHaveBeenLastCalledWith([
      { op: "set_pattern_row", clipId: CLIP, row: "kick", name: "Perc" },
      { op: "set_pattern_row", clipId: CLIP, row: "hat", name: "Perc" }
    ]);

    expect(q.getAllByText("Automation").length).toBeGreaterThan(0);
  });

  it("labels a mixed Row Assignment \"Mixed\" on a full-width button", async () => {
    const user = userEvent.setup();
    const { inspector } = renderInspector({ pattern: twoRows(), rowIds: ["kick", "hat"], onAssignRows: jest.fn() });
    await user.click(within(inspector).getByRole("tab", { name: "Row" }));
    const button = within(inspector).getByRole("button", { name: /Row Assignment/ });
    expect(button).toHaveTextContent(/^Mixed$/);
    expect(button).toHaveAccessibleName("Row Assignment: Mixed");
    expect(button).toHaveStyle({ minWidth: "96px" });
  });

  it("shows * for a mixed row length and applies a relative change to each row", async () => {
    const user = userEvent.setup();
    const { runOps, inspector } = renderInspector({ pattern: twoRows(), rowIds: ["kick", "hat"] });
    await user.click(within(inspector).getByRole("tab", { name: "Row" }));
    const length = within(inspector).getByLabelText("Length") as HTMLInputElement;
    expect(length.value).toBe("*");
    await commit(user, length, "-2");
    expect(runOps).toHaveBeenLastCalledWith([
      { op: "set_pattern_row", clipId: CLIP, row: "kick", lengthSteps: 14 },
      { op: "set_pattern_row", clipId: CLIP, row: "hat", lengthSteps: 10 }
    ]);
    const channel = within(inspector).getByLabelText("MIDI Channel") as HTMLInputElement;
    expect(channel.value).toBe("1");
    await commit(user, channel, "5");
    expect(runOps).toHaveBeenLastCalledWith([
      { op: "set_pattern_row", clipId: CLIP, row: "kick", midiChannel: 5 },
      { op: "set_pattern_row", clipId: CLIP, row: "hat", midiChannel: 5 }
    ]);
  });

  it("clamps a row loop end to the row length", async () => {
    const user = userEvent.setup();
    const { runOps, inspector } = renderInspector({ pattern: twoRows(), rowIds: ["hat"] });
    await user.click(within(inspector).getByRole("tab", { name: "Row" }));
    await commit(user, within(inspector).getByLabelText("Loop End"), "40");
    expect(runOps).toHaveBeenLastCalledWith([{ op: "set_pattern_row", clipId: CLIP, row: "hat", loopEnd: 12 }]);
  });
});

describe("Step tab (SQ31 items 1 and 2)", () => {
  it("has Note, Octave and the recurrence Iteration and Cycles fields", async () => {
    const user = userEvent.setup();
    const pattern = makePattern([
      { id: "lead", assignment: { type: "melodic", pitch: 60 }, steps: [{ on: true, condition: { type: "recurrence", iteration: 3, cycles: 7 } }] }
    ]);
    const { runOps, inspector } = renderInspector({ pattern, rowIds: [], steps: [["lead", [0]]] });
    const q = within(inspector);
    expect(q.getByLabelText("Note")).toBeInTheDocument();
    expect((q.getByLabelText("Octave") as HTMLInputElement).value).toBe("3");
    expect((q.getByLabelText("Iteration") as HTMLInputElement).value).toBe("3");
    expect((q.getByLabelText("Cycles") as HTMLInputElement).value).toBe("7");
    await commit(user, q.getByLabelText("Cycles"), "16");
    expect(runOps).toHaveBeenLastCalledWith([
      { op: "set_steps", clipId: CLIP, row: "lead", steps: [1], values: { condition: { type: "recurrence", iteration: 3, cycles: 16 } } }
    ]);
    await commit(user, q.getByLabelText("Note"), "4");
    expect(runOps).toHaveBeenLastCalledWith([{ op: "set_steps", clipId: CLIP, row: "lead", steps: [1], values: { note: 4 } }]);
  });

  it("applies a relative velocity change across steps in two rows", async () => {
    const user = userEvent.setup();
    const { runOps, inspector } = renderInspector({ pattern: twoRows(), steps: [["kick", [0]], ["hat", [0]]] });
    const velocity = within(inspector).getByLabelText("Velocity") as HTMLInputElement;
    expect(velocity.value).toBe("*");
    await commit(user, velocity, "10");
    expect(runOps).toHaveBeenLastCalledWith([
      { op: "set_steps", clipId: CLIP, row: "kick", steps: [1], values: { velocity: 90 } },
      { op: "set_steps", clipId: CLIP, row: "hat", steps: [1], values: { velocity: 110 } }
    ]);
  });

  it("edits a mixed MIDI channel relatively and shows mixed selects as *", async () => {
    const user = userEvent.setup();
    const { runOps, inspector } = renderInspector({ pattern: twoRows(), steps: [["kick", [0]], ["hat", [0]]] });
    const channel = within(inspector).getByLabelText("MIDI Channel") as HTMLInputElement;
    expect(channel.value).toBe("*");
    await commit(user, channel, "+1");
    expect(runOps).toHaveBeenLastCalledWith([
      { op: "set_steps", clipId: CLIP, row: "kick", steps: [1], values: { midiChannel: 3 } },
      { op: "set_steps", clipId: CLIP, row: "hat", steps: [1], values: { midiChannel: 5 } }
    ]);
  });

  it("shows a mixed condition as *", () => {
    const pattern = makePattern([
      { id: "kick", assignment: { type: "note", pitch: 36 }, steps: [{ on: true }, { on: true, condition: { type: "first" } }] }
    ]);
    const { inspector } = renderInspector({ pattern, steps: [["kick", [0, 1]]] });
    const condition = within(inspector).getByTestId("step-inspector-condition");
    expect(condition).toHaveTextContent("*");
    fireEvent.blur(condition);
  });
});
