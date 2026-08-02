/**
 * `nodetool app build`: the command's surface and the bundle it leaves behind.
 *
 * Registration is testable without the agents package (the action imports it
 * lazily), and the bundle writer is pure, so what a build produces on disk is
 * asserted here against a report rather than against a live model run — the
 * loop itself is covered in `packages/agents/tests/app-build-build.test.ts`.
 */
import { describe, expect, it } from "vitest";
import { Command } from "commander";
import { mkdtemp, readFile, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { BuildReport } from "@nodetool-ai/agents";
import { registerAppCommands } from "../src/commands/app.js";
import {
  defaultBuildOutDir,
  writeBuildBundle,
  writeRunMessages
} from "../src/app-build/bundle.js";

function appBuildCommand() {
  const program = new Command();
  registerAppCommands(program);
  const app = program.commands.find((c) => c.name() === "app");
  if (!app) throw new Error("app command not registered");
  const cmd = app.commands.find((c) => c.name() === "build");
  if (!cmd) throw new Error("app build command not registered");
  return cmd;
}

const report = (): BuildReport => ({
  target: { prompt: "", specPath: "spec.json" },
  spec: {
    title: "Drafter",
    operations: [
      {
        id: "draft",
        objective: "",
        workflowId: "wf1",
        inputs: [{ name: "prompt", type: "string", example: "a haiku" }],
        outputs: [{ name: "text", type: "string" }],
        streaming: false
      }
    ],
    variables: [],
    widgets: [
      {
        role: "draft-output",
        type: "Markdown",
        binding: "op:draft/out:text",
        label: "Draft"
      }
    ],
    interactions: []
  },
  interactions: [
    {
      name: "draft-once",
      steps: [{ run: "draft" }],
      expect: [{ widget: "draft-output", check: "nonEmpty" }],
      derived: true,
      operationId: "draft",
      addedSteps: ["run draft"]
    }
  ],
  stages: [
    {
      stage: "spec",
      round: 0,
      status: "ok",
      startedAt: new Date(0).toISOString(),
      durationMs: 1,
      issues: [],
      costUsd: 0,
      detail: "1 operation(s)"
    }
  ],
  repairs: [],
  appDebug: null,
  judge: null,
  supervision: null,
  verdict: { ok: true, reason: "green on the first pass", notSimulated: [] },
  cost: { usd: 0.02, byStage: { spec: 0.02 } },
  bundle: {
    schemaVersion: 1,
    name: "Drafter",
    description: "a drafting app",
    app: {
      schemaVersion: 3,
      ui: { root: { props: { title: "Drafter" } }, content: [], zones: {} },
      operations: [],
      resources: [],
      variables: []
    },
    workflows: [
      { key: "wf-draft", name: "draft", graph: { nodes: [], edges: [] } }
    ]
  }
});

describe("registerAppCommands — build", () => {
  it("registers app build with an agent-friendly description", () => {
    expect(appBuildCommand().description()).toMatch(/mini app/i);
    expect(appBuildCommand().description()).toMatch(/ApplicationBundle/);
  });

  it("exposes the flags from the design's CLI surface", () => {
    const flags = appBuildCommand()
      .options.map((o) => o.long)
      .filter(Boolean);
    expect(flags).toEqual(
      expect.arrayContaining([
        "--provider",
        "--model",
        "--judge-model",
        "--workflow",
        "--max-repairs",
        "--cost-cap",
        "--timeout",
        "--out",
        "--json",
        "--no-judge",
        "--supervise",
        "--max-decisions",
        "--max-retries",
        "--supervisor-cost-cap",
        "--supervisor-model"
      ])
    );
  });

  it("collects repeated --workflow pins in order", () => {
    const cmd = appBuildCommand();
    cmd.parseOptions(["--workflow", "a", "--workflow", "b"]);
    expect(cmd.opts<{ workflow?: string[] }>().workflow).toEqual(["a", "b"]);
  });

  it("takes the prompt-or-spec argument", () => {
    expect(appBuildCommand().registeredArguments.map((a) => a.name())).toEqual([
      "prompt_or_spec_file"
    ]);
  });

  it("names the bundle directory after the target", () => {
    expect(defaultBuildOutDir("./my spec.json")).toMatch(
      /nodetool-debug\/app-build-my-spec-json-/
    );
  });
});

describe("app build bundle", () => {
  it("writes a parseable report next to the spec, deliverable and run streams", async () => {
    const outDir = await mkdtemp(join(tmpdir(), "app-build-"));
    const built = report();

    const messagesPath = await writeRunMessages(outDir, "draft-once", 0, [
      { type: "job_update", status: "completed" }
    ] as never);
    await writeBuildBundle(outDir, built, "# Drafter\n");

    expect((await readdir(outDir)).sort()).toEqual([
      "app.bundle.json",
      "interactions",
      "report.json",
      "report.md",
      "spec.json"
    ]);
    expect(messagesPath).toBe(
      "interactions/draft-once/run-1.messages.jsonl"
    );
    expect(await readdir(join(outDir, "interactions", "draft-once"))).toEqual([
      "run-1.messages.jsonl"
    ]);

    const parsed = JSON.parse(
      await readFile(join(outDir, "report.json"), "utf8")
    ) as BuildReport;
    expect(parsed.verdict.ok).toBe(true);
    expect(parsed.spec.title).toBe("Drafter");
    expect(parsed.bundle?.workflows[0]?.key).toBe("wf-draft");

    const spec = JSON.parse(await readFile(join(outDir, "spec.json"), "utf8"));
    expect(spec.operations[0].id).toBe("draft");
  });

  it("writes no deliverable for a failed build", async () => {
    const outDir = await mkdtemp(join(tmpdir(), "app-build-"));
    const failed = report();
    failed.verdict = {
      ok: false,
      reason: "repair budget exhausted (3 repair round(s))",
      notSimulated: []
    };
    failed.bundle = null;

    await writeBuildBundle(outDir, failed, "# failed\n");
    expect((await readdir(outDir)).sort()).toEqual([
      "report.json",
      "report.md",
      "spec.json"
    ]);
  });
});
