import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createInstanceState, type AppInstanceState } from "@nodetool-ai/app-runtime";
import { WorkflowStepsWidget } from "../template/src/widgets/workflowSteps";

let state: AppInstanceState;
vi.mock("../template/src/runtime/context", () => ({
  useAppRuntimeContext: () => ({ scope: { defaultOperationId: "default" } }),
  useRuntimeSelector: (selector: (value: AppInstanceState) => unknown) => selector(state)
}));

const render = (props: Record<string, unknown>): string =>
  renderToStaticMarkup(createElement(WorkflowStepsWidget, { id: "steps", props }));

describe("exported WorkflowSteps", () => {
  beforeEach(() => { state = createInstanceState(); });

  it("shows configured steps before a run, including fallback titles", () => {
    const html = render({ label: "Make film", steps: [{ nodeId: "a", title: "Draft", description: "Write script" }, { nodeId: "b" }] });
    expect(html).toContain("Make film");
    expect(html).toContain("Draft");
    expect(html).toContain("Write script");
    expect(html).toContain(">b</span>");
    expect(html.match(/data-state="pending"/g)).toHaveLength(2);
  });

  it("reads node status and progress from the selected operation", () => {
    state.activeInvocation = { selected: "run", default: "other" };
    state.nodeRuns = { run: {
      a: { status: "completed" },
      b: { status: "running", progress: 0.4 },
      c: { status: "failed", error: "Provider failed" }
    } };
    const html = render({ operationId: "selected", steps: ["a", "b", "c", "d"].map((nodeId) => ({ nodeId })) });
    for (const status of ["done", "running", "failed", "pending"]) {
      expect(html).toContain(`data-state="${status}"`);
    }
    expect(html).toContain('aria-current="step"');
    expect(html).toContain('value="0.4"');
    expect(html).toContain("Provider failed");
  });

  it("uses the default operation and hides an unconfigured idle widget", () => {
    expect(render({})).toBe("");
    state.activeInvocation = { default: "run" };
    state.nodeRuns = { run: { a: { status: "completed" } } };
    expect(render({ steps: [{ nodeId: "a" }] })).toContain('data-state="done"');
  });
});
