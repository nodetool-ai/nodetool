import { test } from "vitest";
import assert from "node:assert/strict";
import { runnerConstructions } from "../check-execution-boundary.mjs";

test("finds unauthorized constructions across syntax and ignores comments and types", () => {
  assert.equal(
    runnerConstructions(
      `
    import { WorkflowRunner as Runner } from "@nodetool-ai/kernel";
    import * as kernel from "@nodetool-ai/kernel";
    new Runner("job", {});
    new kernel.WorkflowRunner("job", {});
    new WorkflowRunner\n      ("job", {});
    // new WorkflowRunner("comment", {});
    const text = "new WorkflowRunner()";
    let type: WorkflowRunner;
  `,
      "new-server.ts"
    ),
    3
  );
  assert.equal(runnerConstructions("const empty = 1", "empty.ts"), 0);
});
