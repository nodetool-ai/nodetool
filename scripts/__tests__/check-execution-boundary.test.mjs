import { test } from "vitest";
import assert from "node:assert/strict";
import {
  runnerConstructions,
  unauthorizedRunnerConstruction,
  isGeneratedExecutionDirectory
} from "../check-execution-boundary.mjs";

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

test("guards execution-core imports and keeps the lean lifecycle allowance exact", () => {
  const sources = [
    'import { WorkflowRunner } from "@nodetool-ai/execution-core"; new WorkflowRunner("job", {});',
    'import { WorkflowRunner as Runner } from "@nodetool-ai/execution-core"; new Runner("job", {});',
    'import * as core from "@nodetool-ai/execution-core"; new core.WorkflowRunner("job", {});',
    'import { WorkflowRunner as Runner } from "@nodetool-ai/execution-core/runner"; new Runner("job", {});'
  ];
  for (const source of sources) {
    assert.equal(runnerConstructions(source, "rogue.ts"), 1);
    assert.equal(unauthorizedRunnerConstruction(source, "packages/nodes-core/src/index.ts"), null);
    assert.equal(unauthorizedRunnerConstruction(source, "packages/nodes-core/src/rogue.ts"), "packages/nodes-core/src/rogue.ts");
    assert.equal(unauthorizedRunnerConstruction(source, "packages/new-server/src/index.ts"), "packages/new-server/src/index.ts");
  }
  assert.match(
    unauthorizedRunnerConstruction(sources[0] + 'new WorkflowRunner("other", {});', "packages/nodes-core/src/index.ts"),
    /2 constructions/
  );
});

test("excludes only the generated Electron bundle directory", () => {
  assert.equal(isGeneratedExecutionDirectory("electron/backend-bundle"), true);
  assert.equal(isGeneratedExecutionDirectory("electron\\backend-bundle"), true);
  for (const path of ["electron/src/backend-bundle", "packages/backend-bundle"]) {
    assert.equal(isGeneratedExecutionDirectory(path), false);
    assert.equal(
      unauthorizedRunnerConstruction('new WorkflowRunner("job", {})', `${path}/server.ts`),
      `${path}/server.ts`
    );
  }
});
