import assert from "node:assert/strict";
import test from "node:test";
import { requireCapabilities } from "./check-ci-prerequisites.mjs";

test("missing drawtext is rejected before the native compile", () => {
  const result = { status: 0, stdout: " T.. scale V->V\n T.. drawtext_extra V->V\n", stderr: "" };
  assert.throws(() => requireCapabilities(result, ["scale", "drawtext"], "filters"), /missing required filters: drawtext/);
  requireCapabilities({ ...result, stdout: result.stdout + " T.C drawtext V->V\n" }, ["scale", "drawtext"], "filters");
});

test("a failed capability query cannot pass from partial stdout", () => {
  assert.throws(() => requireCapabilities({ status: 1, stdout: " T.C drawtext V->V\n", stderr: "broken binary" }, ["drawtext"], "filters"), /query failed/);
});
