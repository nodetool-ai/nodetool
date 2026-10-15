import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mkdtempSync, rmSync, writeFileSync, readdirSync, readFileSync } from "node:fs";
import { test } from "node:test";
import { parse } from "yaml";

import { summarize, discoverRoutinePrs } from "../scripts/agent-preflight.mjs";
import { tally, toMarkdown } from "../scripts/agent-pr-report.mjs";

const dir = new URL("../workflows/", import.meta.url);
const read = (file) => parse(readFileSync(new URL(file, dir), "utf8"));

// Scheduled routines that run the Claude action and open PRs on their own.
const routines = readdirSync(dir)
  .filter((file) => /\.ya?ml$/.test(file))
  .map((file) => ({ file, wf: read(file) }))
  .filter(({ wf }) => wf.on?.schedule && JSON.stringify(wf.jobs).includes("anthropics/claude-code-action"))
  .filter(({ file }) => file !== "genspend-pricing.yml");

test("the routine scan finds the scheduled agent workflows", () => {
  assert.ok(routines.length >= 15, `found only ${routines.length}`);
});

for (const { file, wf } of routines) {
  const name = file.replace(/\.ya?ml$/, "");

  test(`${file}: preflight gates the agent job and tags its PRs`, () => {
    const pre = wf.jobs.preflight;
    assert.ok(pre, "no preflight job");
    const run = pre.steps.map((s) => s.run ?? "").join("\n");
    assert.match(run, new RegExp(`agent-preflight\\.mjs --name ${name} `));

    const main = wf.jobs[name];
    assert.ok(main, `no job named ${name}`);
    assert.equal(main.needs, "preflight");
    assert.match(main.if, /workflow_dispatch/);
    assert.match(main.if, /needs\.preflight\.outputs\.skip != 'true'/);

    const claude = main.steps.find((s) => s.uses?.startsWith("anthropics/claude-code-action"));
    assert.ok(claude.with.claude_args.includes(`--label agent:${name}`));
    assert.ok(claude.with.claude_args.includes(".claude/skills/code-review/SKILL.md"));
  });

  test(`${file}: no full-suite runs around the agent and shared setup`, () => {
    const steps = wf.jobs[name].steps;
    const names = steps.map((s) => s.name);
    assert.ok(!names.includes("Run quality checks baseline"));
    assert.ok(!names.includes("Post-change verification"));
    // A model-driven job can run anything, so it may read the shared caches but
    // never write one a deploy or another job would restore.
    const setup = steps.find((s) => s.uses === "./.github/actions/setup-build");
    assert.ok(setup, "no setup-build step");
    assert.equal(setup.with?.cache, "read-only");
    assert.equal(wf.jobs[name]["cache-mode"], "read");
    assert.ok(!steps.some((s) => s.uses?.startsWith("actions/setup-node")));
  });

  test(`${file}: the recent-files list exists before the agent reads it`, () => {
    const steps = wf.jobs[name].steps;
    const claudeAt = steps.findIndex((s) => s.uses?.startsWith("anthropics/claude-code-action"));
    if (!steps[claudeAt].with.claude_args.includes("agent-recent-files.txt")) {
      return;
    }
    const writeAt = steps.findIndex((s) => (s.run ?? "").includes("agent-recent-files.txt"));
    assert.ok(writeAt >= 0 && writeAt < claudeAt);
  });
}

test("quality-assurance tests npm's exit status, not tee's", () => {
  const steps = read("quality-assurance.yaml").jobs["quality-assurance"].steps;
  const check = steps.find((s) => s.name === "Run quality checks");
  assert.match(check.run, /\| tee/);
  assert.equal(check.shell, "bash");
});

test("logic-simplifier drops files it simplified recently from the scan", () => {
  const steps = read("logic-simplifier.yaml").jobs["logic-simplifier"].steps;
  const scan = steps.find((s) => s.name === "Rank complexity hotspots");
  assert.match(scan.run, /agent-recent-files\.txt/);
  assert.match(scan.run, /if \(recent\.has\(file\)\) continue;/);
});

const pr = (over) => ({ number: 1, title: "", state: "OPEN", author: { login: "app/claude" }, labels: [], mergedAt: null, files: [], ...over });

test("preflight skips on an open labeled PR or an open legacy PR with a matching title", () => {
  const since = new Date("2026-10-01");
  const opts = { label: "agent:logic-simplifier", titleRegex: /^refactor: simplify/, since };
  assert.equal(summarize([pr({ labels: [{ name: "agent:logic-simplifier" }] })], opts).open.length, 1);
  assert.equal(summarize([pr({ title: "refactor: simplify foo" })], opts).open.length, 1);
  assert.equal(summarize([pr({ title: "refactor: simplify foo", author: { login: "georgi" } })], opts).open.length, 0);
  assert.equal(summarize([pr({ title: "refactor: unify foo" })], opts).open.length, 0);
});

test("preflight lists files from this routine's PRs merged inside the window", () => {
  const since = new Date("2026-10-01");
  const opts = { label: "agent:logic-simplifier", titleRegex: /^refactor: simplify/, since };
  const prs = [
    pr({ state: "MERGED", title: "refactor: simplify a", mergedAt: "2026-10-05T00:00:00Z", files: [{ path: "b.ts" }, { path: "a.ts" }] }),
    pr({ state: "MERGED", title: "refactor: simplify c", mergedAt: "2026-09-01T00:00:00Z", files: [{ path: "old.ts" }] }),
    pr({ state: "MERGED", title: "perf: d", mergedAt: "2026-10-05T00:00:00Z", files: [{ path: "other.ts" }] }),
  ];
  assert.deepEqual(summarize(prs, opts).recentFiles, ["a.ts", "b.ts"]);
});

test("report tallies outcomes and net lines per agent label", () => {
  const rows = tally([
    { state: "MERGED", labels: [{ name: "agent:dead-code-cleanup" }], additions: 1, deletions: 50 },
    { state: "CLOSED", labels: [{ name: "agent:dead-code-cleanup" }], additions: 9, deletions: 9 },
    { state: "OPEN", labels: [{ name: "agent:perf" }, { name: "automated" }], additions: 5, deletions: 0 },
    { state: "MERGED", labels: [{ name: "dependencies" }], additions: 5, deletions: 0 },
  ]);
  assert.deepEqual(rows, [
    { label: "agent:dead-code-cleanup", opened: 2, merged: 1, closed: 1, open: 0, net: -49 },
    { label: "agent:perf", opened: 1, merged: 0, closed: 0, open: 1, net: 0 },
  ]);
  assert.match(toMarkdown(rows, 30), /\| dead-code-cleanup \| 2 \| 1 \| 1 \| 0 \| -49 \|/);
});

test("jobs that publish or deploy never restore a shared cache", () => {
  const steps = (file) => Object.values(read(file).jobs).flatMap((job) => job.steps ?? []);
  for (const file of ["release.yaml", "publish.yaml", "eas-build.yml", "web-deploy.yml"]) {
    for (const step of steps(file)) {
      assert.ok(!step.uses?.startsWith("actions/cache"), `${file}: ${step.name ?? step.uses}`);
      if (step.uses?.startsWith("actions/setup-node")) {
        assert.equal(step.with?.cache, undefined, `${file}: setup-node cache`);
        assert.equal(step.with?.["package-manager-cache"], false, `${file}: setup-node package-manager-cache`);
      }
      if (step.uses === "./.github/actions/setup-build") {
        assert.equal(step.with?.cache, "off", `${file}: setup-build cache`);
      }
    }
  }
});

 test("preflight discovers labeled human PRs and paginates merged files", () => {
   const calls = [];
   const found = discoverRoutinePrs({ label: "agent:logic-simplifier", titleRegex: /^refactor: simplify/, since: new Date("2026-10-01") }, (args) => {
     calls.push(args);
     if (args[0] === "api") return JSON.stringify(Array.from({ length: 101 }, (_, i) => ({ filename: `file${i}.ts` })));
     if (args.includes("--label") && args.includes("open")) return JSON.stringify([pr({ number: 2, author: { login: "human" }, labels: [{ name: "agent:logic-simplifier" }] })]);
     if (args.includes("--label") && args.includes("merged")) return JSON.stringify([pr({ number: 3, state: "MERGED", mergedAt: "2026-10-05", labels: [{ name: "agent:logic-simplifier" }] })]);
     return "[]";
   });
   assert.equal(summarize(found, { label: "agent:logic-simplifier", titleRegex: null, since: new Date("2026-10-01") }).open[0].number, 2);
   assert.equal(found.find((p) => p.number === 3).files.length, 101);
   assert.ok(calls.some((args) => args.includes("--paginate")));
 });

 test("preflight fails closed at the PR discovery cap", () => {
   assert.throws(() => discoverRoutinePrs({ label: "agent:x", titleRegex: null, since: new Date() }, () => JSON.stringify(Array.from({ length: 1000 }, () => pr({})))), /incomplete/);
 });

 test("shared setup disables implicit npm cache writers", () => {
   const action = parse(readFileSync(new URL("../actions/setup-build/action.yml", import.meta.url), "utf8"));
   const setup = action.runs.steps.find((step) => step.uses?.startsWith("actions/setup-node"));
   assert.equal(setup.with["package-manager-cache"], false);
   assert.match(setup.with.cache, /inputs.cache == 'read-write'/);
   const audit = read("dependency-audit.yml");
   assert.equal(audit.jobs.audit["cache-mode"], "none");
   assert.equal(audit.jobs.audit.steps.find((step) => step.uses?.startsWith("actions/setup-node")).with["package-manager-cache"], false);
   assert.ok(audit.on.pull_request.paths.includes("**/npm-shrinkwrap.json"));
 });

 test("QA collects build failure and continues to the repair decision", () => {
   const steps = read("quality-assurance.yaml").jobs["quality-assurance"].steps;
   assert.equal(steps.find((s) => s.uses === "./.github/actions/setup-build").with["build-packages"], "false");
   const check = steps.find((s) => s.name === "Run quality checks");
   const root = mkdtempSync(join(tmpdir(), "qa-build-fixture-"));
   try {
     writeFileSync(join(root, "npm"), '#!/bin/bash\necho "$*" >> "$QA_CALLS"\nif [ "$2" = build:packages ]; then echo "compilation failed"; exit 1; fi\n', { mode: 0o755 });
     execFileSync("bash", ["-eo", "pipefail", "-c", check.run], { cwd: root, env: { ...process.env, PATH: `${root}:${process.env.PATH}`, QA_CALLS: join(root, "calls"), GITHUB_ENV: join(root, "env"), GITHUB_STEP_SUMMARY: join(root, "summary") } });
     assert.match(readFileSync(join(root, "env"), "utf8"), /QUALITY_FAILED=1/);
     assert.match(readFileSync(join(root, "build.log"), "utf8"), /compilation failed/);
     assert.match(readFileSync(join(root, "calls"), "utf8"), /run test/);
   } finally { rmSync(root, { recursive: true, force: true }); }
 });

 test("PR lint checks generated anti-slop ratchet drift", () => {
   assert.match(readFileSync(new URL("../workflows/quality-checks.yml", import.meta.url), "utf8"), /npm run lint && npm run lint:anti-slop:check/);
 });
