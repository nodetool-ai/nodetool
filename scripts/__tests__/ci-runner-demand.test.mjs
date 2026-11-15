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
    const builtLegs = JSON.parse(lines.find((l) => l.startsWith("built=")).slice("built=".length)).include;
    return { static: legs("static"), built: legs("built"), builtLegs, step };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const FULL_PLAN = {
  full: true, web: "full", electron: true, mobile: true, packages_websocket: true, packages_agents: true,
  packages_nodes: true, packages_core: true, packages_cli: true, packages_engine: true, packages_game: true,
  integration: true, workflow_runner_e2e: true,
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

describe("Test workflow runner demand", { timeout: 30_000 }, () => {
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

  it("lets a cancel reach the gate's legs, and still runs the gate when `changes` fails", () => {
    // GitHub evaluates a running job's `if` again on a cancel and keeps the
    // job while it is true. `always()` is true in a cancelled run, so with it
    // every leg of the called workflow outlived the cancel and the next run
    // waited for the last of them.
    const workflow = yaml.load(read(".github/workflows/test.yml"));
    expect(workflow.jobs.quality.uses).toBe("./.github/workflows/quality-checks.yml");
    expect(workflow.jobs.quality.if).toBe("${{ !cancelled() }}");
    // The aggregate job must report after a failed leg, so it stays `always()`.
    // It needs no runner time of its own to speak of.
    expect(yaml.load(read(".github/workflows/quality-checks.yml")).jobs.quality.if).toBe("always()");
  });

  it("runs the gate for every pull request, whatever its base branch", () => {
    const workflow = yaml.load(read(".github/workflows/test.yml"));
    const triggers = workflow.on ?? workflow.true;
    // No `branches`: a stacked pull request gets the same gate. No `paths`:
    // the required check reports on every pull request. No `types`: the
    // defaults leave out `edited`, so a title edit or a retarget starts no
    // run that could replace the gate's result on the head commit.
    expect(triggers.pull_request).toBeNull();
    expect(triggers.push.branches).toEqual(["main"]);
  });

  it("gives every leg a timeout of its own, at most an hour", () => {
    const { static: staticLegs, builtLegs } = selectLegs(FULL_PLAN);
    const legs = [...staticLegs.values(), ...builtLegs];
    expect(legs.length).toBeGreaterThan(10);
    for (const leg of legs) {
      expect(Number.isInteger(leg.timeout), leg.check).toBe(true);
      expect(leg.timeout, leg.check).toBeGreaterThanOrEqual(20);
      expect(leg.timeout, leg.check).toBeLessThanOrEqual(leg.check === "harness-gate" ? 60 : 35);
    }
    const workflow = yaml.load(read(".github/workflows/quality-checks.yml"));
    expect(workflow.jobs.static["timeout-minutes"]).toBe("${{ matrix.timeout }}");
    expect(workflow.jobs.built["timeout-minutes"]).toBe("${{ matrix.timeout }}");
    for (const job of ["build", "docker", "integration", "node-catalog"]) {
      expect(workflow.jobs[job]["timeout-minutes"], job).toBeLessThanOrEqual(25);
    }
  });

  it("runs the former core shard on three runners with its settings unchanged", () => {
    const { built } = selectLegs(FULL_PLAN);
    for (const check of ["test-packages-core", "test-packages-cli", "test-packages-engine"]) {
      expect(built.get(check).command, check).toContain("--concurrency=2 $TURBO_AFFECTED");
    }
    expect(built.get("test-packages-core").command.startsWith("npm run test:oxlint-rules && npm run test:scripts && ")).toBe(true);
    const source = read(".github/workflows/quality-checks.yml");
    const workers = source.match(/NODETOOL_TEST_WORKERS: \$\{\{ \((.+)\) && '1' \|\| '' \}\}/);
    expect(workers).not.toBeNull();
    for (const check of ["test-packages-core", "test-packages-cli", "test-packages-engine"]) {
      expect(workers[1], check).toContain(`matrix.check == '${check}'`);
      expect(source.split(`matrix.check == '${check}'`).length - 1, check).toBe(3);
    }
    const only = (plan) => [...selectLegs(plan).built.keys()].filter((check) => /^test-packages-(core|cli|engine)$/.test(check));
    expect(only({ ...FULL_PLAN, packages_cli: false, packages_engine: false })).toEqual(["test-packages-core"]);
    expect(only({ ...FULL_PLAN, packages_core: false, packages_engine: false })).toEqual(["test-packages-cli"]);
    expect(only({ ...FULL_PLAN, packages_core: false, packages_cli: false })).toEqual(["test-packages-engine"]);
  });

  it("runs at most one node package per runner core", () => {
    expect(selectLegs(FULL_PLAN).built.get("test-packages-nodes").command).toContain("--concurrency=4 $TURBO_AFFECTED");
  });

  it("splits the related web tests across three runners", () => {
    const related = selectLegs({ ...FULL_PLAN, web: "related" }).builtLegs.filter((leg) => leg.check.startsWith("test-web"));
    expect(related.map((leg) => [leg.check, leg.shard, leg.shards, leg["jest-cache"]])).toEqual([
      ["test-web", "1", "3", "web-1"],
      ["test-web", "2", "3", "web-2"],
      ["test-web", "3", "3", "web-3"]
    ]);
    expect(related.map((leg) => leg.command)).toEqual(
      [1, 2, 3].map(
        (i) => `node scripts/ci-plan.mjs run web --base "$CI_BASE_SHA" -- --shard=${i}/3 --cacheDirectory="$GITHUB_WORKSPACE/.jest-cache"`
      )
    );
    const full = selectLegs(FULL_PLAN).builtLegs.filter((leg) => leg.check.startsWith("test-web"));
    expect(full.map((leg) => leg.check)).toEqual(["test-web-1", "test-web-2", "test-web-3"]);
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

  it("splits the serial agents suite across three runners with vitest shards", () => {
    const agents = selectLegs(FULL_PLAN).builtLegs.filter((leg) => leg.check === "test-packages-agents");
    expect(agents.map((leg) => [leg.shard, leg.shards])).toEqual([["1", "3"], ["2", "3"], ["3", "3"]]);
    expect(agents.map((leg) => leg.command)).toEqual([
      "npx turbo run test --filter=@nodetool-ai/agents $TURBO_AFFECTED -- --shard=1/3",
      "npx turbo run test --filter=@nodetool-ai/agents $TURBO_AFFECTED -- --shard=2/3",
      "npx turbo run test --filter=@nodetool-ai/agents $TURBO_AFFECTED -- --shard=3/3"
    ]);
    // The shards are balanced by recorded duration, not by file count.
    expect(read("packages/agents/vitest.config.ts")).toContain("sequence: { sequencer: WeightedShardSequencer }");
    expect(selectLegs({ ...FULL_PLAN, packages_agents: false }).builtLegs.some((leg) => leg.check === "test-packages-agents")).toBe(false);
    // Each shard names its job and keeps its own test-results cache.
    const job = read(".github/workflows/quality-checks.yml");
    expect(job).toContain(
      "name: ${{ matrix.shard && format('{0} ({1}/{2})', matrix.check, matrix.shard, matrix.shards) || matrix.check }}"
    );
    expect(job.match(/test-results-v3-\$\{\{ matrix\.check \}\}\$\{\{ matrix\.shard && format\('-\{0\}', matrix\.shard\) \|\| '' \}\}-/g)).toHaveLength(3);
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
