import { act, renderHook, waitFor } from "@testing-library/react";
import { stub } from "../../../../test-utils/doubles";
import type { Workflow } from "../../../../stores/ApiTypes";
import { runInlineGraphJob } from "../../../../lib/workflow/runInlineGraphJob";
import { useTransformRun } from "../useTransformRun";
import type { TransformInput, TransformSource } from "../../transformWorkflow";

jest.mock("../../../../lib/workflow/runInlineGraphJob", () => ({ runInlineGraphJob: jest.fn() }));

const run = jest.mocked(runInlineGraphJob);
const workflow = stub<Workflow>({ id: "wf", name: "test", graph: { nodes: [], edges: [] } });
const source = stub<TransformSource>({ kind: "image", uri: "asset://a" });
const target = stub<TransformInput>({ input: { name: "image" }, list: false });

describe("useTransformRun", () => {
  beforeEach(() => { run.mockReset(); });

  it("reports a rejected startup", async () => {
    run.mockRejectedValueOnce(new Error("Connection failed"));
    const { result } = renderHook(() => useTransformRun());
    act(() => result.current.start(workflow, source, target));
    await waitFor(() => expect(result.current.state.status).toBe("failed"));
    expect(result.current.state.error).toBe("Connection failed");
  });

  it("ignores a rejected startup after reset or replacement", async () => {
    let reject!: (error: Error) => void;
    run.mockReturnValueOnce(new Promise((_resolve, rejectPromise) => { reject = rejectPromise; }));
    run.mockReturnValueOnce(new Promise(() => {}));
    const { result } = renderHook(() => useTransformRun());
    act(() => result.current.start(workflow, source, target));
    act(() => result.current.start(workflow, source, target));
    await act(async () => { reject(new Error("old failure")); });
    expect(result.current.state.status).toBe("running");
    act(() => result.current.reset());
    expect(result.current.state.status).toBe("idle");
  });
  it.each(["cancel", "reset", "unmount"] as const)("ignores rejection after %s", async (action) => {
    let reject!: (error: Error) => void;
    run.mockReturnValueOnce(new Promise((_resolve, rejectPromise) => { reject = rejectPromise; }));
    const { result, unmount } = renderHook(() => useTransformRun());
    act(() => result.current.start(workflow, source, target));
    act(() => {
      if (action === "unmount") { unmount(); }
      else { result.current[action](); }
    });
    await act(async () => { reject(new Error("late failure")); });
    if (action !== "unmount") { expect(result.current.state.status).not.toBe("failed"); }
  });

});
