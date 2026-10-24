import { execFileSync, spawn, spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync, readdirSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { Command } from "commander";
import { describe, it, expect, vi, afterEach } from "vitest";
import {
  collectChangedFiles,
  readChangedFiles,
  isGateRelevantCodeFile,
  isGlobalGateFile
} from "../src/harness/changed-files.js";
import {
  executeChecks,
  registerHarnessCommands,
  printGatePlan,
  selectChecks,
  type ExecuteChecksOptions
} from "../src/commands/harness.js";
import { HARNESSES, SURFACES, planGate, type GateCheck, type GatePlan } from "../src/harness/registry.js";
import { computeAffected, readWorkspacePackages } from "../src/affected/affected.js";

describe("collectChangedFiles", () => {
  it.each([" M", "M ", "A ", "D ", " D", "??", "UU"])(
    "reads status %s",
    (status) => {
      expect(
        collectChangedFiles({
          statusOutput: `${status} packages/cli/src/file.ts\0`
        })
      ).toEqual(["packages/cli/src/file.ts"]);
    }
  );

  it.each(["R ", "RM", " C", "C "])(
    "consumes the source record for status %s",
    (status) => {
      expect(
        collectChangedFiles({
          statusOutput: `${status} new.ts\0old.ts\0 M next.ts\0`
        })
      ).toEqual(["new.ts", "old.ts", "next.ts"]);
    }
  );

  it("deduplicates a large diff against the working tree", () => {
    const paths = Array.from(
      { length: 10_000 },
      (_, index) => `packages/agents/src/file-${index}.ts`
    );
    expect(
      collectChangedFiles({
        base: "main",
        diffOutput: paths.join("\0") + "\0",
        statusOutput: paths.map((path) => ` M ${path}\0`).join("")
      })
    ).toEqual(paths);
  });

  it("preserves both surfaces of a staged rename", () => {
    expect(
      collectChangedFiles({
        statusOutput: "R  packages/cli/src/new.ts\0packages/agents/src/old.ts\0"
      })
    ).toEqual(["packages/cli/src/new.ts", "packages/agents/src/old.ts"]);
  });

  it("preserves unusual filenames without interpreting arrows or escapes", () => {
    const paths = [
      "packages/agents/src/café.ts",
      "packages/cli/src/a -> b.ts",
      'packages/cli/src/a"b.ts',
      "packages/cli/src/a\nb.ts",
      "packages/cli/src/a\\t.ts"
    ];
    expect(
      collectChangedFiles({
        statusOutput: paths.map((path) => `?? ${path}\0`).join("")
      })
    ).toEqual(paths);
  });

  it("merges committed and working changes without duplicates", () => {
    expect(
      collectChangedFiles({
        base: "main",
        diffOutput: "packages/agents/src/café.ts\0packages/cli/src/a.ts\0",
        statusOutput: " M packages/cli/src/a.ts\0 D packages/cli/src/gone.ts\0"
      })
    ).toEqual([
      "packages/agents/src/café.ts",
      "packages/cli/src/a.ts",
      "packages/cli/src/gone.ts"
    ]);
  });

  it("handles empty output", () => {
    expect(
      collectChangedFiles({ statusOutput: "", base: "main", diffOutput: "" })
    ).toEqual([]);
  });
});

describe("isGateRelevantCodeFile", () => {
  it("accepts each recognized code extension", () => {
    for (const f of [
      "packages/cli/src/harness.ts",
      "web/src/App.tsx",
      "scripts/build.js",
      "scripts/build.mjs",
      "scripts/build.cjs",
      "packages/cli/src/x.mts"
    ]) {
      expect(isGateRelevantCodeFile(f)).toBe(true);
    }
  });

  it("rejects a test file by *.test.* / *.spec.*", () => {
    expect(isGateRelevantCodeFile("packages/cli/src/harness.test.ts")).toBe(
      false
    );
    expect(isGateRelevantCodeFile("web/src/App.spec.tsx")).toBe(false);
  });

  it("rejects a file under a __tests__ or tests directory", () => {
    expect(
      isGateRelevantCodeFile("packages/cli/src/__tests__/harness.ts")
    ).toBe(false);
    expect(isGateRelevantCodeFile("packages/cli/tests/harness.ts")).toBe(false);
  });

  it("rejects a file under docs/", () => {
    expect(isGateRelevantCodeFile("docs/example.ts")).toBe(false);
  });

  it("rejects markdown", () => {
    expect(isGateRelevantCodeFile("AGENTS.md")).toBe(false);
    expect(isGateRelevantCodeFile("docs/notes.markdown")).toBe(false);
  });

  it("rejects an extension outside the recognized code set", () => {
    expect(isGateRelevantCodeFile("packages/cli/README.txt")).toBe(false);
    expect(isGateRelevantCodeFile("packages/cli/package.json")).toBe(false);
  });
});

describe("Git file selection", () => {
  it("includes renamed source paths and files inside new directories", () => {
    const root = mkdtempSync(join(tmpdir(), "harness-git-"));
    const git = (...args: string[]): string =>
      execFileSync("git", args, { cwd: root, encoding: "utf8" });
    const write = (path: string): void => {
      mkdirSync(dirname(join(root, path)), { recursive: true });
      writeFileSync(join(root, path), "export const value = 1;\n");
    };
    try {
      git("init", "-q");
      git("config", "user.email", "test@example.invalid");
      git("config", "user.name", "Harness test");
      const oldPath = "packages/agents/src/old.ts";
      const newPath = "packages/cli/src/new.ts";
      write(oldPath);
      git("add", ".");
      git("commit", "-qm", "initial");
      const base = git("rev-parse", "HEAD").trim();
      mkdirSync(dirname(join(root, newPath)), { recursive: true });
      git("mv", oldPath, newPath);
      const untracked = "packages/new-surface/src/hidden.ts";
      write(untracked);
      expect(readChangedFiles(root)).toEqual(
        expect.arrayContaining([oldPath, newPath, untracked])
      );
      git("commit", "-qm", "rename");
      const unicode = "packages/agents/src/café.ts";
      write(unicode);
      git("add", unicode);
      git("commit", "-qm", "unicode");
      expect(readChangedFiles(root, base)).toEqual(
        expect.arrayContaining([oldPath, newPath, untracked, unicode])
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

const check = (
  harnessId: string,
  command: string,
  extra: Partial<GateCheck> = {}
): GateCheck => ({
  harnessId,
  command,
  cost: "cheap",
  suiteOnly: false,
  surfaces: [],
  ...extra
});

const node = (code: string): string => `node -e ${JSON.stringify(code)}`;

const runOpts = (
  extra: Partial<ExecuteChecksOptions> = {}
): ExecuteChecksOptions => ({
  repoRoot: process.cwd(),
  json: true,
  timeoutMs: 20_000,
  timeoutSeconds: 20,
  jobs: 1,
  ...extra
});

describe("selectChecks", () => {
  const workspaces = [
    { name: "@nodetool-ai/runtime", dir: "packages/runtime", internalDeps: [] },
    { name: "@nodetool-ai/models", dir: "packages/models", internalDeps: [] },
    { name: "nodetool", dir: "web", internalDeps: [] },
    { name: "demo", dir: "demo", internalDeps: [] }
  ];
  const checks = [
    check("plain", "true"),
    check("suite", "true", { suiteOnly: true }),
    check("big", "true", { cost: "expensive" })
  ];

  it("skips suite-only checks by default and names them", () => {
    const r = selectChecks(checks, {});
    expect(r.toRun.map((c) => c.harnessId)).toEqual(["plain"]);
    expect(r.skippedSuites.map((c) => c.harnessId)).toEqual(["suite"]);
    expect(r.skippedExpensive.map((c) => c.harnessId)).toEqual(["big"]);
  });

  it("runs suite-only checks with includeSuites", () => {
    const r = selectChecks(checks, { includeSuites: true, expensive: true });
    expect(r.toRun.map((c) => c.harnessId)).toEqual(["plain", "suite", "big"]);
    expect(r.skippedSuites).toEqual([]);
  });

  it("skips only known workspace test commands covered by a global full pass", () => {
    const cases = [
      check("single", "npm run test --workspace=packages/runtime -- tests/example.test.ts"),
      check("multiple", "npm run test --workspace=packages/runtime --workspace=@nodetool-ai/models -- example"),
      check("chain", "npm test --workspace=web -- --runInBand --testPathPattern='one|two' && npm run test --workspace=packages/models"),
      check("mixed", "npm run test --workspace=packages/runtime && npm run lint"),
      check("unknown", "npm run test --workspace=packages/missing"),
      check("demo", "npm run test --workspace=demo"),
      check("other-script", "npm run test:journeys --workspace=web"),
      check("substitution", "npm run test --workspace=web -- $(touch marker)"),
      check("config", "npm run test --workspace=web -- --config other.json"),
      check("project", "npm run test --workspace=web -- --project alternate"),
      check("broken-quote", "npm run test --workspace=web -- 'unterminated"),
      check("empty-segment", "npm run test --workspace=web &&"),
      check("env", "CI=1 npm run test --workspace=web"),
      check("redirect", "npm run test --workspace=web > marker"),
      check("cmd-env", "npm run test --workspace=web -- %FLAGS%"),
      check("cmd-delayed-env", "npm run test --workspace=web -- !FLAGS!"),
      check("cmd-escape", "npm run test --workspace=web -- ^--config alternate.json"),
      check("quoted-operator", "npm run test --workspace=web '--' '; echo done'"),
      check("operator", "npm run test --workspace=web; echo done")
    ];
    const opts = { globalFiles: ["package-lock.json"], workspaces };
    expect(selectChecks(cases, opts).skippedSuites.map(c => c.harnessId)).toEqual(["single", "multiple", "chain"]);
    expect(selectChecks(cases, opts).toRun.map(c => c.harnessId)).toEqual([
      "mixed", "unknown", "demo", "other-script", "substitution", "config", "project", "broken-quote", "empty-segment", "env", "redirect", "cmd-env", "cmd-delayed-env", "cmd-escape", "quoted-operator", "operator"
    ]);
    expect(selectChecks(cases, opts).toRun.find(c => c.harnessId === "mixed")?.command).toBe("npm run lint");
    expect(selectChecks(cases, opts).prunedSuites).toEqual([
      { harnessId: "mixed", commands: ["npm run test --workspace=packages/runtime"] }
    ]);
    expect(selectChecks(cases, { ...opts, globalFiles: [] }).toRun).toEqual(cases);
    expect(selectChecks(cases, { ...opts, globalFiles: ["README.md"] }).toRun).toEqual(cases);
    expect(selectChecks(cases, { ...opts, includeSuites: true }).toRun).toEqual(cases);
  });

  it("prunes the backend suite steps the diff's affected packages already run in full", () => {
    const graph = [
      { name: "@nodetool-ai/protocol", dir: "packages/protocol", internalDeps: [] },
      { name: "@nodetool-ai/runtime", dir: "packages/runtime", internalDeps: ["@nodetool-ai/protocol"] },
      { name: "@nodetool-ai/models", dir: "packages/models", internalDeps: [] },
      { name: "nodetool", dir: "web", internalDeps: ["@nodetool-ai/runtime"] }
    ];
    const flow = check(
      "flow",
      "npm run test --workspace=packages/protocol -- game && " +
        "npm run test --workspace=packages/runtime && " +
        "npm run test --workspace=packages/models -- durable && " +
        "npm run test --workspace=web -- src/stores/game"
    );
    const r = selectChecks([flow], { changedFiles: ["packages/protocol/src/game.ts"], workspaces: graph });
    expect(r.toRun.map(c => c.command)).toEqual([
      "npm run test --workspace=packages/models -- durable && npm run test --workspace=web -- src/stores/game"
    ]);
    expect(r.prunedSuites).toEqual([{
      harnessId: "flow",
      commands: ["npm run test --workspace=packages/protocol -- game", "npm run test --workspace=packages/runtime"]
    }]);
    expect(r.skippedSuites).toEqual([]);

    const own = selectChecks([check("own", "npm run test --workspace=packages/models -- durable")], {
      changedFiles: ["packages/models/src/a.ts"],
      workspaces: graph
    });
    expect(own.toRun).toEqual([]);
    expect(own.skippedSuites.map(c => c.harnessId)).toEqual(["own"]);

    // A web file makes web affected, but test:affected may run only its related tests.
    expect(selectChecks([flow], { changedFiles: ["web/src/stores/game.ts"], workspaces: graph }).toRun).toEqual([flow]);
    expect(selectChecks([flow], { changedFiles: ["docs/x.md"], workspaces: graph }).toRun).toEqual([flow]);
    expect(selectChecks([flow], { changedFiles: ["packages/protocol/src/game.ts"], workspaces: graph, includeSuites: true }).toRun).toEqual([flow]);
  });

  it("prunes a step only when test:affected and the CI shards run that package for every surface path", async () => {
    const root = fileURLToPath(new URL("../../../", import.meta.url));
    const { buildPlan } = await import(new URL("../../../scripts/test-affected.mjs", import.meta.url).href);
    const { buildCiPlan, shardOf } = await import(new URL("../../../scripts/ci-plan.mjs", import.meta.url).href);
    const packages = readWorkspacePackages(root);
    const dirOf = new Map(packages.map(p => [p.name, p.dir]));
    const nameOf = new Map(packages.flatMap(p => [[p.name, p.name], [p.dir, p.name]]));
    const legOf: Record<string, string> = {
      "test-packages-websocket": "packages_websocket",
      "test-packages-agents": "packages_agents",
      "test-packages-nodes": "packages_nodes",
      "test-packages-core": "packages_core",
      "test-packages-game": "packages_game"
    };
    const files = [...new Set(SURFACES.flatMap(s => s.paths))]
      .map(p => (p.endsWith("/") ? `${p}index.ts` : p));
    expect(files.length).toBeGreaterThan(100);
    let pruned = 0;
    for (const file of files) {
      const plan = planGate([file]);
      const r = selectChecks(plan.checks, { changedFiles: [file], globalFiles: plan.globalFiles, workspaces: packages });
      const steps = r.prunedSuites.flatMap(p => p.commands);
      if (steps.length === 0) continue;
      const testPlan = buildPlan([file], packages, computeAffected);
      const ciPlan = buildCiPlan([file], packages, computeAffected);
      const turboArgs: string[] = testPlan.steps
        .filter((s: { args: string[] }) => s.args.includes("test") && s.args.some(a => a.startsWith("--filter=")))
        .flatMap((s: { args: string[] }) => s.args);
      for (const step of steps) {
        for (const [, ws] of step.matchAll(/--workspace=(\S+)/g)) {
          const name = nameOf.get(ws!);
          expect(name, `${file}: ${step}`).toBeDefined();
          expect(turboArgs, `${file}: test:affected runs ${name}`).toContain(`--filter=${name}`);
          const leg = legOf[shardOf(name, dirOf.get(name!) ?? "")];
          expect(leg, `${file}: ${name} has a CI shard`).toBeDefined();
          expect(ciPlan[leg!], `${file}: CI starts the ${leg} shard`).toBe(true);
          pruned++;
        }
      }
    }
    expect(pruned).toBeGreaterThan(0);
  }, 120_000);

  it("keeps the web step of game-flow and drops the game package suites for a game-runtime diff", () => {
    const root = fileURLToPath(new URL("../../../", import.meta.url));
    const file = "packages/game-runtime/src/scripts.ts";
    const plan = planGate([file]);
    const r = selectChecks(plan.checks, { changedFiles: [file], globalFiles: plan.globalFiles, workspaces: readWorkspacePackages(root) });
    const flow = r.toRun.find(c => c.harnessId === "game-flow");
    expect(flow?.command).toContain("--workspace=web");
    expect(flow?.command).not.toContain("--workspace=packages/game-runtime");
    expect(flow?.command).not.toContain("--workspace=packages/game-renderer");
    expect(r.prunedSuites.find(p => p.harnessId === "game-flow")?.commands).toEqual(
      expect.arrayContaining([
        "npm run test --workspace=packages/game-runtime",
        "npm run test --workspace=packages/game-renderer"
      ])
    );
  });

  it("selects a large global plan without changing check order", () => {
    const checks = Array.from({ length: 10_000 }, (_, index) =>
      check(`suite-${index}`, "npm run test --workspace=packages/runtime")
    );
    const selected = selectChecks(checks, { globalFiles: ["package-lock.json"], workspaces });
    expect(selected.toRun).toEqual([]);
    expect(selected.skippedSuites).toEqual(checks);
  });

  it("infers full coverage only for gate global files that select the canonical full plan", async () => {
    const root = fileURLToPath(new URL("../../../", import.meta.url));
    const moduleUrl = new URL("../../../scripts/test-affected.mjs", import.meta.url).href;
    const { buildPlan, fullPlan } = await import(moduleUrl);
    const packages = readWorkspacePackages(root);
    expect(packages.length).toBeGreaterThan(0);
    expect(fullPlan()).toEqual([
      { label: "packages", command: "npm", args: ["run", "test:packages"] },
      { label: "web", command: "npm", args: ["test", "--workspace=web"] },
      { label: "electron", command: "npm", args: ["test", "--workspace=electron"] },
      { label: "mobile", command: "npm", args: ["--prefix", "mobile", "test"] }
    ]);
    const rootManifest = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
    expect(rootManifest.scripts["test:packages"]).toContain('--filter="./packages/*"');
    expect(rootManifest.scripts["test:packages"]).toContain('--filter="./reliability/*"');
    const globalFiles = [
      ...readdirSync(root),
      ...readdirSync(join(root, "scripts")).map(file => `scripts/${file}`)
    ].filter(isGlobalGateFile);
    expect(globalFiles.length).toBeGreaterThan(0);
    for (const file of globalFiles) {
      const plan = planGate([file]);
      expect(plan.globalFiles).toEqual([file]);
      expect(buildPlan([file], packages, computeAffected).steps).toEqual(fullPlan());
    }
  });

  it("does not infer a full test pass from --all and lets --include-suites override a global diff", async () => {
    const output = vi.spyOn(console, "log").mockImplementation(() => undefined);
    try {
      const program = new Command();
      registerHarnessCommands(program);
      await program.parseAsync(["node", "nodetool", "harness", "gate", "--all", "--dry-run", "--json"]);
      const all = JSON.parse(String(output.mock.calls.at(-1)?.[0]));
      expect(all.plan.globalFiles).toEqual([]);
      expect(all.skippedSuites).toEqual(HARNESSES.filter(h => h.selfcheck?.suiteOnly).map(h => h.id));
      const overrideProgram = new Command();
      registerHarnessCommands(overrideProgram);
      await overrideProgram.parseAsync(["node", "nodetool", "harness", "gate", "package-lock.json", "--include-suites", "--dry-run", "--json"]);
      const explicit = JSON.parse(String(output.mock.calls.at(-1)?.[0]));
      expect(explicit.plan.globalFiles).toEqual(["package-lock.json"]);
      expect(explicit.skippedSuites).toEqual([]);
    } finally {
      output.mockRestore();
    }
  });
});

describe("executeChecks", () => {
  afterEach(() => vi.restoreAllMocks());

  it.each([1, 2])("reports progress on stderr and durations without contaminating JSON output with jobs=%s", async (jobs) => {
    const stderr = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    const stdout = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    const results = await executeChecks([check("timed", node("process.exit(0)"))], runOpts({ jobs }));
    expect(results[0].durationMs).toBeGreaterThanOrEqual(0);
    expect(Number.isFinite(results[0].durationMs)).toBe(true);
    expect(stderr.mock.calls.map(([chunk]) => String(chunk)).join("")).toMatch(/START timed[\s\S]*PASS timed.*\d+ms/);
    expect(stderr.mock.calls.map(([chunk]) => String(chunk)).join("")).toContain(`PASS timed (${results[0].durationMs}ms)`);
    expect(stdout).not.toHaveBeenCalled();
    expect(JSON.parse(JSON.stringify({ results })).results[0].durationMs).toBe(results[0].durationMs);
  });

  it("runs serially in plan order by default", async () => {
    vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    const results = await executeChecks(
      [
        check("a", node("process.exit(0)")),
        check("b", node("process.exit(3)"))
      ],
      runOpts()
    );
    expect(results.map((r) => [r.harnessId, r.ok, r.exitCode])).toEqual([
      ["a", true, 0],
      ["b", false, 3]
    ]);
  });

  it("runs two checks concurrently and reports in plan order", async () => {
    const dir = mkdtempSync(join(tmpdir(), "gate-jobs-"));
    try {
      // Each check drops its own marker, then waits for the other's. Serial
      // execution would never see the peer's marker and would time out.
      const rendezvous = (me: string, peer: string): string =>
        node(
          `const fs=require("fs"),p=require("path");` +
            `fs.writeFileSync(p.join(${JSON.stringify(dir)},${JSON.stringify(me)}),"");` +
            `const end=Date.now()+10000;` +
            `while(!fs.existsSync(p.join(${JSON.stringify(dir)},${JSON.stringify(peer)}))){` +
            `if(Date.now()>end)process.exit(2);}` +
            `process.exit(0)`
        );
      const slowFirst = rendezvous("a", "b");
      const results = await executeChecks(
        [check("a", slowFirst), check("b", rendezvous("b", "a"))],
        runOpts({ jobs: 2 })
      );
      expect(results.map((r) => [r.harnessId, r.ok])).toEqual([
        ["a", true],
        ["b", true]
      ]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("reports plan order when a later check finishes first", async () => {
    const results = await executeChecks(
      [
        check("slow", node("setTimeout(()=>process.exit(0),400)")),
        check("fast", node("process.exit(0)"))
      ],
      runOpts({ jobs: 2 })
    );
    expect(results.map((r) => r.harnessId)).toEqual(["slow", "fast"]);
  });

  it("fails closed on a timeout in parallel mode", async () => {
    vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    const results = await executeChecks(
      [
        check("hang", node("setTimeout(()=>{},60000)")),
        check("fine", node("process.exit(0)"))
      ],
      runOpts({ jobs: 2, timeoutMs: 500, timeoutSeconds: 0.5 })
    );
    expect(results[0]).toMatchObject({
      harnessId: "hang",
      ok: false,
      exitCode: 124,
      timedOut: true,
      killed: true
    });
    expect(results[1]).toMatchObject({ harnessId: "fine", ok: true });
  });

  it("fails closed on a timeout in serial mode", async () => {
    vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    const [r] = await executeChecks(
      [check("hang", node("setTimeout(()=>{},60000)"))],
      runOpts({ timeoutMs: 500, timeoutSeconds: 0.5 })
    );
    expect(r).toMatchObject({ ok: false, exitCode: 124, timedOut: true });
  });

  it.each([
    { jobs: 1, json: true, cost: "cheap" as const },
    { jobs: 1, json: false, cost: "cheap" as const },
    { jobs: 2, json: true, cost: "expensive" as const },
    { jobs: 2, json: true, cost: "cheap" as const }
  ])("stops descendants before continuing after timeout ($jobs, $json, $cost)", async ({ jobs, json, cost }) => {
    vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    const dir = mkdtempSync(join(tmpdir(), "gate-descendant-"));
    const pidPath = join(dir, "pid");
    const parentPidPath = join(dir, "parent-pid");
    const releasePath = join(dir, "release");
    const escapedPath = join(dir, "escaped");
    const childCode =
      `const fs=require("node:fs");` +
      `fs.writeFileSync(${JSON.stringify(pidPath)},String(process.pid));` +
      `setInterval(()=>{if(fs.existsSync(${JSON.stringify(releasePath)})){` +
      `fs.writeFileSync(${JSON.stringify(escapedPath)},"still running");}},10);`;
    const parentCode =
      `require("node:fs").writeFileSync(${JSON.stringify(parentPidPath)},String(process.pid));` +
      `require("node:child_process").spawn(process.execPath,["-e",${JSON.stringify(childCode)}],{stdio:"ignore"});` +
      `setInterval(()=>{},1000);`;
    try {
      const parallel = jobs > 1 && cost === "cheap";
      const continueCode = parallel ? "process.exit(0)" : `require("node:fs").writeFileSync(${JSON.stringify(releasePath)},"continue");setTimeout(()=>{},150);`;
      const [result, next] = await executeChecks(
        [check("descendant", node(parentCode), { cost }), check("next", node(continueCode), { cost })],
        runOpts({ jobs, json, timeoutMs: 1000, timeoutSeconds: 1 })
      );
      expect(existsSync(pidPath)).toBe(true);
      expect(result).toMatchObject({ ok: false, exitCode: 124, timedOut: true, killed: true });
      expect(next.ok).toBe(true);
      if (parallel) {
        writeFileSync(releasePath, "continue");
        await new Promise((resolve) => setTimeout(resolve, 150));
      }
      expect(existsSync(releasePath)).toBe(true);
      expect(existsSync(escapedPath)).toBe(false);
    } finally {
      for (const ownedPidPath of [pidPath, parentPidPath]) {
        if (!existsSync(ownedPidPath)) {
          continue;
        }
        const pid = Number(readFileSync(ownedPidPath, "utf8"));
        try { process.kill(pid, "SIGKILL"); } catch (error) {
          if (!(error instanceof Error) || !("code" in error) || error.code !== "ESRCH") {
            throw error;
          }
        }
      }
      rmSync(dir, { recursive: true, force: true });
    }
  });

  // jobs=2 runs the interrupted check in the cheap pool and holds `next` back
  // as an expensive check, which only starts once the pool has drained.
  it.each([
    { signal: "SIGINT" as const, exitCode: 130, jobs: 1 },
    { signal: "SIGTERM" as const, exitCode: 143, jobs: 1 },
    { signal: "SIGINT" as const, exitCode: 130, jobs: 2 },
    { signal: "SIGTERM" as const, exitCode: 143, jobs: 2 }
  ])("cleans up a gate on $signal with jobs=$jobs and does not start its next check", async ({ signal, exitCode, jobs }) => {
    const dir = mkdtempSync(join(tmpdir(), "gate-interrupt-"));
    const pidPath = join(dir, "pid");
    const parentPidPath = join(dir, "parent-pid");
    const releasePath = join(dir, "release");
    const escapedPath = join(dir, "escaped");
    const nextPath = join(dir, "next");
    const entry = join(dir, "check.mts");
    const childCode = `const fs=require("node:fs");fs.writeFileSync(${JSON.stringify(pidPath)},String(process.pid));setInterval(()=>{if(fs.existsSync(${JSON.stringify(releasePath)}))fs.writeFileSync(${JSON.stringify(escapedPath)},"escaped");},10);`;
    const parentCode = `require("node:fs").writeFileSync(${JSON.stringify(parentPidPath)},String(process.pid));require("node:child_process").spawn(process.execPath,["-e",${JSON.stringify(childCode)}],{stdio:"ignore"});setInterval(()=>{},1000);`;
    const harnessUrl = new URL("../src/commands/harness.ts", import.meta.url).href;
    writeFileSync(entry, `import { executeChecks } from ${JSON.stringify(harnessUrl)};
await executeChecks(${JSON.stringify([
      check("interrupted", node(parentCode)),
      check("next", node(`require("node:fs").writeFileSync(${JSON.stringify(nextPath)},"started")`), { cost: "expensive" })
    ])}, ${JSON.stringify(runOpts({ jobs }))});`);
    const gate = spawn(process.execPath, ["--import", import.meta.resolve("tsx"), entry], { stdio: "ignore" });
    const closed = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((resolve, reject) => {
      gate.once("error", reject);
      gate.once("close", (code, signal) => resolve({ code, signal }));
    });
    try {
      const deadline = Date.now() + 5000;
      while (!existsSync(pidPath) && Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
      expect(existsSync(pidPath)).toBe(true);
      gate.kill(signal);
      expect(await closed).toEqual({ code: exitCode, signal: null });
      writeFileSync(releasePath, "continue");
      await new Promise((resolve) => setTimeout(resolve, 150));
      expect(existsSync(escapedPath)).toBe(false);
      expect(existsSync(nextPath)).toBe(false);
    } finally {
      gate.kill("SIGKILL");
      for (const ownedPidPath of [pidPath, parentPidPath]) {
        if (!existsSync(ownedPidPath)) {
          continue;
        }
        try { process.kill(Number(readFileSync(ownedPidPath, "utf8")), "SIGKILL"); } catch (error) {
          if (!(error instanceof Error) || !("code" in error) || error.code !== "ESRCH") {
            throw error;
          }
        }
      }
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("enforces the serial JSON byte limit and cleans up descendants on overflow", async () => {
    vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    const dir = mkdtempSync(join(tmpdir(), "gate-overflow-"));
    const pidPath = join(dir, "pid");
    const parentPidPath = join(dir, "parent-pid");
    const releasePath = join(dir, "release");
    const escapedPath = join(dir, "escaped");
    const childCode = `const fs=require("node:fs");fs.writeFileSync(${JSON.stringify(pidPath)},String(process.pid));setInterval(()=>{if(fs.existsSync(${JSON.stringify(releasePath)}))fs.writeFileSync(${JSON.stringify(escapedPath)},"escaped");},10);`;
    const parentCode = `const fs=require("node:fs");fs.writeFileSync(${JSON.stringify(parentPidPath)},String(process.pid));require("node:child_process").spawn(process.execPath,["-e",${JSON.stringify(childCode)}],{stdio:"ignore"});const ready=setInterval(()=>{if(!fs.existsSync(${JSON.stringify(pidPath)}))return;clearInterval(ready);const chunk=Buffer.alloc(65536,"é");for(let n=0;n<4097;n++)fs.writeSync(1,chunk);setInterval(()=>{},1000);},10);`;
    try {
      const [result] = await executeChecks([check("overflow", node(parentCode))], runOpts());
      expect(existsSync(pidPath)).toBe(true);
      expect(result).toMatchObject({ ok: false, exitCode: 1, timedOut: false, killed: true });
      writeFileSync(releasePath, "continue");
      await new Promise((resolve) => setTimeout(resolve, 150));
      expect(existsSync(escapedPath)).toBe(false);
    } finally {
      for (const ownedPidPath of [pidPath, parentPidPath]) {
        if (!existsSync(ownedPidPath)) {
          continue;
        }
        try { process.kill(Number(readFileSync(ownedPidPath, "utf8")), "SIGKILL"); } catch (error) {
          if (!(error instanceof Error) || !("code" in error) || error.code !== "ESRCH") {
            throw error;
          }
        }
      }
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("retains live stdout and stderr for serial checks", () => {
    const dir = mkdtempSync(join(tmpdir(), "gate-live-output-"));
    try {
      const entry = join(dir, "check.mts");
      const harnessUrl = new URL("../src/commands/harness.ts", import.meta.url).href;
      const command = node('process.stdout.write("child stdout");process.stderr.write("child stderr")');
      writeFileSync(entry, `import { executeChecks } from ${JSON.stringify(harnessUrl)};
const results = await executeChecks([${JSON.stringify(check("live", command))}], ${JSON.stringify(runOpts({ json: false }))});
process.stdout.write("RESULT " + JSON.stringify(results));`);
      const output = spawnSync(process.execPath, ["--import", import.meta.resolve("tsx"), entry], {
        encoding: "utf8", timeout: 10_000, stdio: ["ignore", "pipe", "pipe"]
      });
      expect(output.error).toBeUndefined();
      expect(output.status).toBe(0);
      expect(output.stdout).toContain("child stdout");
      expect(output.stderr).toContain("child stderr");
      expect(output.stdout).toContain('"ok":true');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("buffers a check's output into one block in parallel mode", async () => {
    const out: string[] = [];
    vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
      out.push(String(chunk));
      return true;
    });
    await executeChecks(
      [check("a", node('console.log("line-a1");console.log("line-a2")'))],
      runOpts({ jobs: 2, json: false })
    );
    const block = out.find((c) => c.includes("line-a1"));
    expect(block).toContain("── a:");
    expect(block).toContain("line-a1\nline-a2");
  });

  it("runs expensive checks after the cheap pool", async () => {
    const results = await executeChecks(
      [
        check("big", node("process.exit(0)"), { cost: "expensive" }),
        check("small", node("setTimeout(()=>process.exit(0),300)"))
      ],
      runOpts({ jobs: 2 })
    );
    expect(results.map((r) => r.harnessId)).toEqual(["big", "small"]);
    expect(results.every((r) => r.ok)).toBe(true);
  });
});

describe("printGatePlan", () => {
  afterEach(() => vi.restoreAllMocks());

  const capture = (fn: () => void): string => {
    const lines: string[] = [];
    vi.spyOn(console, "log").mockImplementation((...a) => {
      lines.push(a.join(" "));
    });
    fn();
    return lines.join("\n");
  };

  const plan = (extra: Partial<GatePlan> = {}): GatePlan => ({
    changedFiles: ["package-lock.json", "packages/kernel/src/a.ts"],
    globalFiles: ["package-lock.json"],
    surfaces: [
      { id: "workflow-execution", files: ["packages/kernel/src/a.ts"] },
      { id: "agents", files: [], viaDependency: true }
    ],
    checks: [],
    manual: [],
    uncoveredSurfaces: [],
    unmappedFiles: [],
    ...extra
  });

  it("prints global files, dependency surfaces and skipped suites", () => {
    const text = capture(() =>
      printGatePlan(plan(), 1, 0, [
        check("kernel-suite", "true", { suiteOnly: true })
      ])
    );
    expect(text).toContain("1 global file(s) force every selfcheck");
    expect(text).toContain("package-lock.json");
    expect(text).toMatch(/agents\s+\(0 file\(s\)\)\s+\(via dependency\)/);
    expect(text).not.toMatch(/workflow-execution.*via dependency/);
    expect(text).toContain("Covered by `npm run test:affected`");
    expect(text).toContain("kernel-suite");
  });
});
