import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildStandaloneProject } from "@nodetool-ai/app-export";
import { buildApp } from "@nodetool-ai/agents";
import { createAppServerRunner } from "@nodetool-ai/execution/service";
import { initTestDb } from "@nodetool-ai/models";
import {
  FakeProvider,
  ProcessingContext,
  headlessGate,
  PERMISSION_GATE_CONTEXT_KEY
} from "@nodetool-ai/runtime";
import { FileStorageAdapter } from "@nodetool-ai/storage";
import { buildFullRegistry } from "../src/node-registry.js";
import { listProviderModels } from "../src/providers.js";

const scratch = mkdtempSync(join(tmpdir(), "fake-app-build-"));
beforeAll(() => {
  initTestDb();
});
afterAll(() => {
  rmSync(scratch, { recursive: true, force: true });
});

describe("explicit fake greeting fixture", () => {
  it("is discoverable without enabling automatic fake model selection", async () => {
    const rows = await listProviderModels("fake", "llm");
    expect(rows).toContainEqual(
      expect.objectContaining({ id: "fake-app-greeting", supports_tools: true })
    );
  });

  it("builds through real structured completion and verifies two real greeting interactions", async () => {
    const registry = await buildFullRegistry();
    const provider = new FakeProvider();
    const context = new ProcessingContext({
      jobId: "fake-app-build",
      workflowId: null,
      userId: "1",
      storage: new FileStorageAdapter(join(scratch, "assets"))
    });
    context.set(PERMISSION_GATE_CONTEXT_KEY, headlessGate("fake fixture test"));
    const runOnServer = createAppServerRunner("1", registry);
    const options = {
      prompt: "Build the deterministic greeting fixture",
      provider,
      model: "fake-app-greeting",
      context,
      registry,
      runOnServer,
      judge: { enabled: false },
      maxRepairs: 0,
      costCapUsd: 0.01
    };
    const report = await buildApp(options);
    expect(report.verdict.ok, JSON.stringify(report.stages)).toBe(true);
    expect(report.bundle).not.toBeNull();
    expect(report.stages.map((stage) => stage.stage)).toEqual([
      "spec",
      "plan",
      "author",
      "check",
      "run",
      "judge"
    ]);
    expect(report.stages.at(-1)?.status).toBe("skipped");
    expect(report.appDebug?.verdict.ok).toBe(true);
    expect(report.interactions).toHaveLength(2);
    expect(provider.callCount).toBeGreaterThan(2);
    expect(report.cost.usd).toBe(0);
    if (!report.bundle) {
      throw new Error("Expected a verified bundle");
    }
    const project = buildStandaloneProject(report.bundle);
    expect(project.files.some((file) => file.path === "app.bundle.json")).toBe(
      true
    );
    expect(project.warnings).toEqual([]);

    // An incorrect runtime result must still fail the normal interaction oracle.
    const failed = await buildApp({
      ...options,
      runOnServer: (input) =>
        runOnServer({
          ...input,
          params: { ...input.params, name: "Unexpected" }
        })
    });
    expect(failed.verdict.ok).toBe(false);
    expect(failed.bundle).toBeNull();
  }, 60000);

  it("builds and exports from a cold CLI outside the checkout", () => {
    const directory = mkdtempSync(join(scratch, "cold-"));
    const env: Record<string, string> = {
      PATH: process.env["PATH"] ?? "",
      HOME: directory,
      XDG_DATA_HOME: join(directory, "data"),
      XDG_CONFIG_HOME: join(directory, "config"),
      XDG_CACHE_HOME: join(directory, "cache"),
      ASSET_FOLDER: join(directory, "assets"),
      NODETOOL_LOG_LEVEL: "error",
      SECRETS_MASTER_KEY: "a".repeat(64)
    };
    const run = (...args: string[]) => spawnSync(process.execPath, [
      "--import", import.meta.resolve("tsx"), resolve(import.meta.dirname, "../src/nodetool.ts"), ...args
    ], { cwd: directory, env, encoding: "utf8", timeout: 60000 });
    const output = join(directory, "build");
    const build = run("app", "build", "Build the fixed greeting fixture", "--provider", "fake",
      "--model", "fake-app-greeting", "--no-judge", "--max-repairs", "0", "--cost-cap", "0.01", "--out", output, "--json");
    expect(build.status, build.stderr + build.stdout).toBe(0);
    const report = JSON.parse(build.stdout);
    expect(report.verdict.ok).toBe(true);
    expect(report.cost.usd).toBe(0);
    expect(report.interactions).toHaveLength(2);
    const exported = join(directory, "exported");
    const result = run("apps", "export-project", join(output, "app.bundle.json"), "--output", exported);
    expect(result.status, result.stderr + result.stdout).toBe(0);
    expect(JSON.parse(readFileSync(join(exported, "app.bundle.json"), "utf8")).name).toBe("Deterministic Greeting");
  }, 120000);

});
