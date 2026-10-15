/**
 * Runner demand of the Test workflow. Every job waits for a runner under the
 * account-wide cap, so a job that repeats another's work, or a run that is
 * thrown away half done, delays every other pull request too.
 */
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import yaml from "js-yaml";
import { describe, expect, it } from "vitest";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const read = (path) => readFileSync(resolve(ROOT, path), "utf8");

/**
 * Run quality-checks.yml's "Select legs from the plan" step for one plan and
 * return the static and built legs it selects, by check name.
 */
function selectLegs(plan, { skipTests = false } = {}) {
  const workflow = yaml.load(read(".github/workflows/quality-checks.yml"));
  const step = workflow.jobs.changes.steps.find((s) => s.id === "legs");
  const dir = mkdtempSync(join(tmpdir(), "ci-legs-"));
  try {
    const output = join(dir, "output");
    const result = spawnSync("bash", ["-c", step.run], {
      env: { ...process.env, PLAN: JSON.stringify(plan), SKIP_TESTS: String(skipTests), GITHUB_EVENT_NAME: "pull_request", GITHUB_OUTPUT: output },
      encoding: "utf8"
    });
    expect(result.status, result.stderr).toBe(0);
    const lines = readFileSync(output, "utf8").split("\n");
    const legs = (key) =>
      new Map(JSON.parse(lines.find((l) => l.startsWith(`${key}=`)).slice(key.length + 1)).include.map((leg) => [leg.check, leg]));
    return { static: legs("static"), built: legs("built"), step };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const FULL_PLAN = {
  full: true, web: "full", electron: true, mobile: true, packages_websocket: true, packages_agents: true,
  packages_nodes: true, packages_core: true, packages_game: true, integration: true, workflow_runner_e2e: true,
  tsc6: true, docker: true, blender: true, node_catalog: true, turbo_affected: false
};

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
    for (const output of ["integration", "workflow-runner-e2e"]) {
      expect(quality).toContain(`needs.changes.outputs.${output} == 'true'`);
    }
  });

  it("runs the dependency guards in the lint leg instead of a runner of their own", () => {
    const { static: legs } = selectLegs(FULL_PLAN);
    expect([...legs.keys()]).toEqual(["lint", "typescript-6-fallback"]);
    const steps = legs.get("lint").command.split(" && ");
    for (const check of [
      "npm run lint",
      "npm run lint:anti-slop:check",
      "node scripts/check-workspace-deps.mjs",
      "node scripts/check-circular-deps.mjs",
      "node scripts/check-key-boundaries.mjs",
      "node scripts/check-coupled-deps.mjs",
      "node scripts/check-lockfile-sync.mjs",
      "node scripts/check-execution-boundary.mjs",
      "npm run check:lockfile-libc",
      "npm run check:document-sync",
      "npm run check:agents-docs"
    ]) {
      expect(steps).toContain(check);
    }
  });

  it("runs the backend bundle smoke and the electron and mobile tests in the typecheck leg", () => {
    const { built } = selectLegs(FULL_PLAN);
    expect(built.has("bundle")).toBe(false);
    expect(built.has("test-electron-mobile")).toBe(false);
    const steps = built.get("typecheck").command.split(" && ");
    expect(steps).toContain("npm run backend:smoke");
    expect(steps.at(-1)).toBe('node scripts/ci-plan.mjs run electron mobile ${CI_BASE_SHA:+--base "$CI_BASE_SHA"}');
    expect(built.get("typecheck")["mobile-deps"]).toBe("true");
  });

  it("adds the electron and mobile tests only when the plan selects one and tests are on", () => {
    const appTests = (plan, options) =>
      selectLegs(plan, options).built.get("typecheck").command.includes("scripts/ci-plan.mjs run electron mobile");
    expect(appTests({ ...FULL_PLAN, electron: false, mobile: false })).toBe(false);
    expect(appTests({ ...FULL_PLAN, electron: true, mobile: false })).toBe(true);
    expect(appTests({ ...FULL_PLAN, electron: false, mobile: true })).toBe(true);
    expect(appTests(FULL_PLAN, { skipTests: true })).toBe(false);
    expect(selectLegs(FULL_PLAN).step.env.SKIP_TESTS).toBe("${{ inputs.skip-tests }}");
  });

  it("runs the shipped-workflow integration tests and the workflow-runner browser E2E on one runner", () => {
    const workflow = yaml.load(read(".github/workflows/quality-checks.yml"));
    expect(workflow.jobs["workflow-runner-e2e"]).toBeUndefined();
    const job = workflow.jobs.integration;
    expect(job.if).toBe(
      "${{ !inputs.skip-tests && (needs.changes.outputs.integration == 'true' || needs.changes.outputs.workflow-runner-e2e == 'true') }}"
    );
    const byName = new Map(job.steps.map((step) => [step.name, step]));
    expect(byName.get("Run shipped-workflow execution tests").if).toBe(
      "${{ !cancelled() && needs.changes.outputs.integration == 'true' }}"
    );
    for (const name of [
      "Install Playwright Chromium browser",
      "Type-check workflow-runner browser suite",
      "Run workflow-runner browser E2E tests"
    ]) {
      expect(byName.get(name).if, name).toBe("${{ !cancelled() && needs.changes.outputs.workflow-runner-e2e == 'true' }}");
    }
    expect(workflow.jobs.quality.needs).not.toContain("workflow-runner-e2e");
    expect(workflow.jobs.quality.needs).toContain("integration");
  });
});
