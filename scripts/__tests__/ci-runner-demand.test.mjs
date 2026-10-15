/**
 * Runner demand of the Test workflow. Every job waits for a runner under the
 * account-wide cap, so a job that repeats another's work, or a run that is
 * thrown away half done, delays every other pull request too.
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const read = (path) => readFileSync(resolve(ROOT, path), "utf8");

/** Evaluate the `cancel-in-progress` expression for one event name. */
function cancelsInProgress(source, eventName) {
  const expression = source.match(/^concurrency:\n(?:  .*\n)*?  cancel-in-progress: \$\{\{ (.+) \}\}$/m);
  expect(expression, "test.yml concurrency.cancel-in-progress").not.toBeNull();
  const terms = expression[1].split(" || ").map((term) => term.match(/^github\.event_name == '([a-z_]+)'$/));
  expect(terms.every(Boolean), expression[1]).toBe(true);
  return terms.some((term) => term[1] === eventName);
}

describe("Test workflow runner demand", () => {
  it("cancels a superseded pull request run but lets a running main run finish", () => {
    const source = read(".github/workflows/test.yml");
    expect(source).toContain(
      "group: ${{ github.workflow }}-${{ (github.event_name == 'pull_request' || github.event_name == 'push') && github.ref || github.run_id }}"
    );
    expect(cancelsInProgress(source, "pull_request")).toBe(true);
    for (const event of ["push", "merge_group", "schedule", "workflow_dispatch"]) {
      expect(cancelsInProgress(source, event), event).toBe(false);
    }
  });

  it("runs the Linux node catalog check once, in the typecheck leg", () => {
    const source = read(".github/workflows/quality-checks.yml");
    const typecheck = source.match(/"check": "typecheck",\n\s+"command": "(.+)",$/m);
    expect(typecheck).not.toBeNull();
    expect(typecheck[1].split(" && ")).toContain("npm run check:node-catalog");
    const built = source.slice(source.indexOf("\n  built:"), source.indexOf("\n  docker:"));
    expect(built).toContain("runs-on: ubuntu-latest");

    const job = source.slice(source.indexOf("\n  node-catalog:"), source.indexOf("\n  quality:"));
    const rows = [...job.matchAll(/- os: (\S+)\n\s+platform: (\S+)/g)].map(([, os, platform]) => `${os} ${platform}`);
    expect(rows).toEqual(["macos-15 darwin-arm64"]);
    expect(job).toContain("npm run check:node-catalog");
  });

  it("defers queue-only legs only on pull requests, and only once the merge queue is on", () => {
    const source = read(".github/workflows/test.yml");
    expect(source).toMatch(/^  merge_group:$/m);
    expect(source).toContain(
      "DEFER_TO_QUEUE: ${{ github.event_name == 'pull_request' && vars.MERGE_QUEUE == 'true' }}"
    );
    expect(source).toContain('[[ "$DEFER_TO_QUEUE" == true ]] && DEFER="--defer-to-queue"');
    expect(source).toContain('node scripts/ci-plan.mjs plan ${BASE:+--base "$BASE"} $DEFER');

    const quality = read(".github/workflows/quality-checks.yml");
    expect(quality).toContain(`echo "node-catalog=$(jq -r '.node_catalog != false' <<<"$PLAN")"`);
    expect(quality).toContain(
      "if: ${{ !inputs.docs-only && inputs.shared && needs.changes.outputs.node-catalog == 'true' }}"
    );
    for (const [leg, output] of [["integration", "integration"], ["workflow-runner-e2e", "workflow-runner-e2e"]]) {
      expect(quality).toContain(`needs.changes.outputs.${output} == 'true'`);
      expect(quality).toContain(`\n  ${leg}:\n`);
    }
  });
});
