import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it, vi } from "vitest";
import { createSqliteRepository } from "@nodetool-ai/database-sqlite";
import { encrypt } from "@nodetool-ai/security-core";
import { loadInstalledCliFeature } from "@nodetool-ai/pack-manager";
import { createProgram, runCli } from "../src/lean/program.js";

vi.mock("@nodetool-ai/pack-manager", async importOriginal => ({
  ...await importOriginal<typeof import("@nodetool-ai/pack-manager")>(),
  loadInstalledCliFeature: vi.fn()
}));

describe("lean execution CLI", () => {
  it("dispatches explicitly selected full commands without requiring a globally linked full binary", async () => {
    const run = vi.fn(async (_argv: readonly string[]) => {});
    vi.mocked(loadInstalledCliFeature).mockResolvedValueOnce({ run });
    await runCli(["node", "nodetool", "full", "serve", "--port", "0"]);
    expect(run).toHaveBeenCalledWith(["node", "nodetool", "serve", "--port", "0"]);
  });
  it.each(["eval", "jsscript"])("admits full-only %s commands with original flags before parsing", async command => {
    const run = vi.fn(async (_argv: readonly string[]) => {});
    vi.mocked(loadInstalledCliFeature).mockResolvedValueOnce({ run });
    const argv = ["node", "nodetool", command, "test", "--json", "fixture"];
    await runCli(argv);
    expect(run).toHaveBeenCalledWith(argv);
  });
  it("reports missing authored-source feature before parsing its full-only flags", async () => {
    vi.mocked(loadInstalledCliFeature).mockRejectedValueOnce(Object.assign(new Error("Install cli-full"), { code: "FEATURE_NOT_INSTALLED", featureIds: ["cli-full"] }));
    await expect(runCli(["node", "nodetool", "--api-url", "http://localhost:7777", "run", "not-present.mts", "--json"])).rejects.toMatchObject({ code: "FEATURE_NOT_INSTALLED", featureIds: ["cli-full"] });
  });
  it.each([["run", "--json"], ["validate", "--warnings-as-errors"]])("routes authored %s before parsing full-only flag %s", async (command, flag) => {
    const run = vi.fn(async (_argv: readonly string[]) => {});
    vi.mocked(loadInstalledCliFeature).mockResolvedValueOnce({ run });
    const argv = ["node", "nodetool", command, "workflow.ts", flag];
    const exit = vi.spyOn(process, "exit").mockImplementation(() => { throw new Error("Parser rejected authored-source flags"); });
    try { await runCli(argv); } finally { exit.mockRestore(); }
    expect(run).toHaveBeenCalledWith(argv);
  });
  it("reports the full feature requirement for authored source without reading or executing it", async () => {
    vi.mocked(loadInstalledCliFeature).mockRejectedValueOnce(Object.assign(new Error("Install cli-full"), { code: "FEATURE_NOT_INSTALLED", featureIds: ["cli-full"] }));
    await expect(createProgram({ env: {}, fetch: async () => { throw new Error("No automatic network work"); } }).parseAsync(["node", "nodetool", "validate", "not-present.mjs"])).rejects.toMatchObject({ code: "FEATURE_NOT_INSTALLED", featureIds: ["cli-full"] });
  });
  it.each(["run", "validate"])("delegates %s of code-authored workflows before reading JSON", async command => {
    const run = vi.fn(async (_argv: readonly string[]) => {});
    for (const extension of ["ts", "js", "mts", "mjs", "cts", "cjs"]) {
      vi.mocked(loadInstalledCliFeature).mockResolvedValueOnce({ run });
      const argv = ["node", "nodetool", command, `workflow.${extension}`];
      await createProgram({ env: {}, argv }).parseAsync(argv);
      expect(run).toHaveBeenLastCalledWith(argv);
    }
    expect(run).toHaveBeenCalledTimes(6);
  });
  it("delegates unsupported providers and original JSON flags to the admitted full runner", async () => {
    const run = vi.fn(async (_argv: readonly string[]) => {});
    vi.mocked(loadInstalledCliFeature).mockResolvedValueOnce({ run });
    const argv = ["node", "nodetool", "models", "list", "--provider", "fal", "--json"];
    await createProgram({ env: {}, argv }).parseAsync(argv);
    expect(run).toHaveBeenCalledWith(argv);
  });
  it("lists builtin provider metadata without secrets or network access", async () => {
    const stdout: string[] = [];
    await createProgram({ env: {}, stdout: text => stdout.push(text), fetch: async () => { throw new Error("Metadata must be local"); } }).parseAsync(["node", "nodetool", "providers", "list"]);
    expect(JSON.parse(stdout.join(""))).toEqual([{ id: "openai", name: "OpenAI-compatible", capabilities: ["text", "models"], installed: true }]);
  });
  it("reports an unavailable provider with its explicit installation feature", async () => {
    vi.mocked(loadInstalledCliFeature).mockRejectedValueOnce(Object.assign(new Error("Install cli-full"), { code: "FEATURE_NOT_INSTALLED", featureIds: ["cli-full"] }));
    await expect(createProgram({ env: {} }).parseAsync(["node", "nodetool", "models", "list", "--provider", "anthropic"])).rejects.toMatchObject({ code: "FEATURE_NOT_INSTALLED", featureIds: ["cli-full"] });
  });
  it("lists remote models through the SDK using only the selected tenant secret", async () => {
    const directory = await mkdtemp(join(tmpdir(), "nodetool-lean-models-"));
    const masterKey = "fixture-key".repeat(8);
    const repository = createSqliteRepository(join(directory, "nodetool.db"));
    try {
      await repository.put("secrets", "bob", { key: "OPENAI_API_KEY", encrypted_value: encrypt(masterKey, "bob", "unrelated") });
      await repository.put("secrets", "alice", { key: "OPENAI_API_KEY", encrypted_value: encrypt(masterKey, "alice", "fixture-private-key") });
      await repository.close();
      const stdout: string[] = [];
      const calls: Array<{ url: string; authorization: string | null }> = [];
      await createProgram({ env: { NODETOOL_USER_ID: "alice", NODETOOL_DATA_DIR: directory, SECRETS_MASTER_KEY: masterKey }, stdout: text => stdout.push(text), fetch: async (input, init) => {
        calls.push({ url: String(input), authorization: new Headers(init?.headers).get("authorization") });
        return Response.json({ object: "list", data: [{ id: "fixture-model", object: "model", created: 123, owned_by: "fixture-owner" }] });
      } }).parseAsync(["node", "nodetool", "models", "list", "--provider", "openai"]);
      expect(calls).toEqual([{ url: "https://api.openai.com/v1/models", authorization: "Bearer fixture-private-key" }]);
      expect(JSON.parse(stdout.join(""))).toEqual({ provider: "openai", models: [{ id: "fixture-model", created: 123, ownedBy: "fixture-owner" }] });
      expect(stdout.join("")).not.toContain("fixture-private-key");
    } finally { await rm(directory, { recursive: true, force: true }); }
  });
  it("renders plain help and version without credentials or remote requests", async () => {
    const output: string[] = [];
    let requested = false;
    const program = createProgram({ env: {}, stdout: text => output.push(text), fetch: async () => { requested = true; return Response.json({}); } }).exitOverride();
    expect(program.helpInformation()).toContain("workflows");
    await expect(program.parseAsync(["node", "nodetool", "--version"])).rejects.toMatchObject({ code: "commander.version" });
    expect(output.join("")).toMatch(/^0\.8\.4\n$/);
    expect(requested).toBe(false);
  });
  it("sends native workflow commands with authenticated HTTP and preserved IDs", async () => {
    const calls: Array<{ url: string; auth: string | null; body: unknown }> = [];
    const stdout: string[] = [];
    const program = createProgram({ env: { NODETOOL_API_TOKEN: "fixture-token", NODETOOL_API_URL: "http://127.0.0.1:7777" }, stdout: text => stdout.push(text), fetch: async (input, init) => {
      calls.push({ url: String(input), auth: new Headers(init?.headers).get("authorization"), body: init?.body });
      return Response.json({ job_id: "0123456789abcdef0123456789abcdef" });
    } });
    await program.parseAsync(["node", "nodetool", "workflows", "run", "0123456789ab", "--params", '{"message":"hello"}']);
    expect(calls).toEqual([{ url: "http://127.0.0.1:7777/api/workflows/0123456789ab/run", auth: "Bearer fixture-token", body: '{"params":{"message":"hello"}}' }]);
    expect(JSON.parse(stdout.join(""))).toEqual({ job_id: "0123456789abcdef0123456789abcdef" });
  });
  it("executes a native JSON workflow using the existing actor engine", async () => {
    const directory = await mkdtemp(join(tmpdir(), "nodetool-lean-cli-"));
    try {
      const path = join(directory, "workflow.json");
      await writeFile(path, JSON.stringify({ nodes: [{ id: "value", type: "nodetool.constant.String", properties: { value: "kept" } }, { id: "output", type: "nodetool.output.Output", properties: { name: "result" } }], edges: [{ source: "value", target: "output", sourceHandle: "output", targetHandle: "value" }] }));
      const stdout: string[] = [];
      await createProgram({ env: { NODETOOL_USER_ID: "alice" }, stdout: text => stdout.push(text) }).parseAsync(["node", "nodetool", "run", path]);
      expect(JSON.parse(stdout.join(""))).toEqual({ result: ["kept"] });
    } finally { await rm(directory, { recursive: true, force: true }); }
  });
  it("rejects missing credentials before sending requests", async () => {
    let requested = false;
    const program = createProgram({ env: {}, fetch: async () => { requested = true; return Response.json({}); } });
    await expect(program.parseAsync(["node", "nodetool", "jobs", "list"])).rejects.toThrow("NODETOOL_API_TOKEN");
    expect(requested).toBe(false);
  });
});
