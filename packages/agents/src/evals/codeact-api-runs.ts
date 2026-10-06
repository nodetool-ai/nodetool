import { RecordingTool, type CodeActEvalCase } from "./codeact-cases.js";
import { isRecord } from "../utils/type-guards.js";

const FAILED_SPAN = "a1b2c3d4e5f6a7b8";

export const CODEACT_RUNS_EVAL_CASES: readonly CodeActEvalCase[] = [{
  id: "api-run-failure-drill-down",
  description: "Read a failed run summary, then inspect its named failed span",
  objective: "Diagnose recorded run run-1. Start with its summary, inspect the first failed span's recorded content, and finish with {run_id, failed_span_id, cause}. Preserve the full failed span id.",
  outputSchema: {
    type: "object",
    properties: { run_id: { type: "string" }, failed_span_id: { type: "string" }, cause: { type: "string" } },
    required: ["run_id", "failed_span_id", "cause"]
  },
  createTools: (recorder) => [
    new RecordingTool("get_run", "Read a run summary first.", {
      type: "object", properties: { run_id: { type: "string" } }, required: ["run_id"]
    }, recorder, (params) => params["run_id"] === "run-1"
      ? { run: { id: "run-1", status: "failed" }, summary: { first_failed_span_id: FAILED_SPAN } }
      : { error: "Run not found" }),
    new RecordingTool("get_run_trace", "Inspect the named failed span.", {
      type: "object", properties: { run_id: { type: "string" }, focus_span_id: { type: "string" }, include_content: { type: "boolean" } }, required: ["run_id"]
    }, recorder, (params) => params["run_id"] === "run-1" && params["focus_span_id"] === FAILED_SPAN && params["include_content"] === true
      ? { nodes: [{ record: { span_id: FAILED_SPAN, name: "capability.call", attributes: { "tool.result": "Missing storyboard shot binding" } } }] }
      : { error: "Name the summary's failed span and request content" })
  ],
  namespaces: ["runs"],
  expect: {
    requiredTools: ["get_run", "get_run_trace"],
    maxActions: 3,
    resultCheck: (result) => isRecord(result) && result["run_id"] === "run-1" && result["failed_span_id"] === FAILED_SPAN && result["cause"] === "Missing storyboard shot binding",
    resultCheckLabel: "run-1 and its full failed span id, with the recorded binding failure"
  }
}];
