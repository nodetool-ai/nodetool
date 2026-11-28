import type { StepPattern } from "@nodetool-ai/timeline";
import type { TimelineOp } from "@nodetool-ai/timeline/ops";
import { withKeptSort } from "../stepRowAssignments";

const sorted = { rowSort: "typeAndNoteAsc" } as unknown as StepPattern;

describe("withKeptSort (F29)", () => {
  it("re-applies the kept sort after Paste Row as New", () => {
    const list = [
      { op: "copy_pattern_row", clipId: "src", row: "r1", toClipId: "dst", asNew: true }
    ] as unknown as TimelineOp[];
    expect(withKeptSort(list, sorted)).toEqual([
      ...list,
      { op: "set_pattern_row_sort", clipId: "dst", rowSort: "typeAndNoteAsc" }
    ]);
  });

  it("re-applies the kept sort after a row copy into the same clip", () => {
    const list = [{ op: "copy_pattern_row", clipId: "c", row: "r1", nextAssignment: true }] as unknown as TimelineOp[];
    expect(withKeptSort(list, sorted).at(-1)).toEqual({ op: "set_pattern_row_sort", clipId: "c", rowSort: "typeAndNoteAsc" });
  });

  it("leaves a run without a kept sort alone", () => {
    const list = [{ op: "copy_pattern_row", clipId: "c", row: "r1", asNew: true }] as unknown as TimelineOp[];
    expect(withKeptSort(list, {} as StepPattern)).toBe(list);
  });
});
