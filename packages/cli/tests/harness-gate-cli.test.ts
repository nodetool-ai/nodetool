import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { describe, it, expect, vi, afterEach } from "vitest";
import {
  collectChangedFiles,
  readChangedFiles,
  isGateRelevantCodeFile
} from "../src/harness/changed-files.js";
import {
  executeChecks,
  printGatePlan,
  selectChecks,
  type ExecuteChecksOptions
} from "../src/commands/harness.js";
import type { GateCheck, GatePlan } from "../src/harness/registry.js";

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
});

describe("executeChecks", () => {
  afterEach(() => vi.restoreAllMocks());

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
