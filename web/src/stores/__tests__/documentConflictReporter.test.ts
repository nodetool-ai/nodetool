import {
  reportDocumentConflicts,
  setDocumentConflictReporter
} from "../documentConflictReporter";
import type { MergeConflict } from "../documentMerge";

const handlers = { onAccept: jest.fn(), onDiscard: jest.fn() };
const conflicts = [{ unitId: "u1" }] as unknown as MergeConflict[];

describe("documentConflictReporter", () => {
  it("does nothing before a reporter is installed", () => {
    expect(() =>
      reportDocumentConflicts("doc", conflicts, handlers)
    ).not.toThrow();
  });

  it("forwards reports to the installed reporter", () => {
    const reporter = jest.fn();
    setDocumentConflictReporter(reporter);
    reportDocumentConflicts("doc", conflicts, handlers);
    expect(reporter).toHaveBeenCalledWith("doc", conflicts, handlers);
  });

  it("replaces the previous reporter", () => {
    const first = jest.fn();
    const second = jest.fn();
    setDocumentConflictReporter(first);
    setDocumentConflictReporter(second);
    reportDocumentConflicts("doc", conflicts, handlers);
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });
});
