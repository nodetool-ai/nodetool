import React, { useEffect, useState } from "react";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";
import type { TraceRecord } from "@nodetool-ai/protocol";
import mockTheme from "../../../../__mocks__/themeMock";
import { makeTestRuntime, OUTPUT_KEY } from "../../__tests__/testRuntime";
import { useBindingRef, useBindingValue } from "../../runtime/AppRuntimeContext";
import { withConditions, type WrappedWidgetProps } from "../conditionalWidget";
import { BrowserRunTrace } from "../../../../lib/browserRunTrace";
import useTraceStore from "../../../../stores/TraceStore";
import { trpcClient } from "../../../../trpc/client";

jest.mock("../../../support/ReportBugButton", () => ({ __esModule: true, default: () => <button>Report a bug</button> }));

const RUN = "9".repeat(32);
const TRACE = "8".repeat(32);
const capture = trpcClient.errorTraces.capture.mutate as jest.Mock;
const OutputWidget = withConditions((props: WrappedWidgetProps) => {
  const value = useBindingValue(useBindingRef(typeof props.binding === "string" ? props.binding : undefined, "read"));
  if (value && typeof value === "object") { throw new TypeError("Output widget failed"); }
  return <span>{typeof value === "string" ? value : "Waiting for output"}</span>;
});

describe("conditionalWidget error recovery", () => {
  let consoleError: jest.SpyInstance;
  beforeEach(() => {
    capture.mockClear();
    useTraceStore.getState().clear();
    consoleError = jest.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => { consoleError.mockRestore(); });

  it("links a thrown widget to its producing run without copying output and recovers on the next invocation", async () => {
    const recorded: TraceRecord[] = [];
    const recorder = new BrowserRunTrace({ runId: RUN, traceId: TRACE, operationId: "main", instanceId: "instance-a",
      send: async (_id, records) => { recorded.push(...records); } });
    const runtime = makeTestRuntime({ outputs: { [OUTPUT_KEY]: { value: { private: "Private output never copied" }, invocationId: "first", status: "done", revision: 1 } } });
    runtime.value.reportWidgetError = jest.fn((error, component, binding) => {
      expect(binding).toBe("op:main/out:out1");
      expect(runtime.store.getState().outputs[OUTPUT_KEY]?.invocationId).toBe("first");
      return { trace_id: TRACE, app_run_id: RUN, span_id: recorder.recordWidgetError(error, component) };
    });
    try {
      await recorder.finish();
      render(<ThemeProvider theme={mockTheme}><runtime.wrapper><OutputWidget id="output-widget" binding="op:main/out:out1" /></runtime.wrapper></ThemeProvider>);
      expect(screen.getByText("Widget output-widget failed to render.")).toBeInTheDocument();
      await recorder.flush();
      const failedSpan = recorded.find((span) => span.name === "ui.widget_error");
      expect(failedSpan).toMatchObject({ trace_id: TRACE, parent_span_id: recorder.action.spanId, status: { code: "ERROR" }, attributes: { "ui.component": "output-widget" } });
      expect(capture).toHaveBeenCalledWith(expect.objectContaining({ context: {
        component: "Widget output-widget", runtime: "browser", trace_id: TRACE, app_run_id: RUN, span_id: failedSpan?.span_id
      } }));
      expect(JSON.stringify(recorded)).not.toContain("Private output never copied");
      await userEvent.click(screen.getByRole("button", { name: "View trace" }));
      expect(useTraceStore.getState()).toMatchObject({ selectedRunId: RUN, focusedSpanId: failedSpan?.span_id });
      act(() => {
        runtime.store.getState().dispatchEvent({ type: "runStarted", invocation: { id: "second", operationId: "main", status: "running", startedAt: 2 }, outputKeys: [OUTPUT_KEY] });
        runtime.store.getState().dispatchEvent({ type: "outputValue", key: OUTPUT_KEY, invocationId: "second", value: "Recovered output", disposition: "replace" });
      });
      expect(screen.getByText("Recovered output")).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "View trace" })).not.toBeInTheDocument();
    } finally { recorder.dispose(); }
  });

  it("keeps an input widget mounted with its local draft across output invocations", async () => {
    const mounted = jest.fn();
    const InputWidget = withConditions(() => {
      const [draft, setDraft] = useState("");
      useEffect(() => { mounted(); }, []);
      return <input aria-label="Draft" value={draft} onChange={(event) => setDraft(event.target.value)} />;
    });
    const runtime = makeTestRuntime();
    render(<runtime.wrapper><InputWidget id="input-widget" binding="op:main/in:in1" /></runtime.wrapper>);
    await userEvent.type(screen.getByRole("textbox", { name: "Draft" }), "Keep my draft");
    act(() => {
      for (const id of ["first", "second"]) {
        runtime.store.getState().dispatchEvent({ type: "runStarted", invocation: { id, operationId: "main", status: "running", startedAt: 1 }, outputKeys: [OUTPUT_KEY] });
      }
    });
    expect(screen.getByRole("textbox", { name: "Draft" })).toHaveValue("Keep my draft");
    expect(mounted).toHaveBeenCalledTimes(1);
  });
});
