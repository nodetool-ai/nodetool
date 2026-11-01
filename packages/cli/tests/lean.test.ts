import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it, vi } from "vitest";
import { createSqliteRepository } from "@nodetool-ai/database-sqlite";
import { encrypt } from "@nodetool-ai/security-core";
import { loadInstalledCommandFeature } from "@nodetool-ai/pack-manager";
import { DEFAULT_TEXT_MODEL, createProgram, exampleWorkflow, runCli } from "../src/lean/program.js";

vi.mock("@nodetool-ai/pack-manager", async importOriginal => ({
  ...await importOriginal<typeof import("@nodetool-ai/pack-manager")>(),
  loadInstalledCommandFeature: vi.fn()
}));

describe("lean execution CLI", () => {
  it("routes the legacy workflow code migration to its administrator feature", async () => {
    const run = vi.fn(async (_argv: readonly string[]) => {});
    vi.mocked(loadInstalledCommandFeature).mockResolvedValueOnce({ run });
    const argv = ["node", "nodetool", "workflows", "migrate-code-inputs", "--dry-run", "--json"];
    await runCli(argv);
    expect(loadInstalledCommandFeature).toHaveBeenLastCalledWith(expect.any(String), "cli-admin");
    expect(run).toHaveBeenCalledWith(argv.slice(2));
  });
  it.each([["--trace-file", "trace.json"], ["--trace-stdout", "json"], ["--no-trace-stdout"]])("routes workflow tracing flags %s to its explicit command feature", async (...flags) => {
    const run = vi.fn(async (_argv: readonly string[]) => {});
    vi.mocked(loadInstalledCommandFeature).mockResolvedValueOnce({ run });
    const argv = ["node", "nodetool", ...flags, "run", "workflow.json", "--json"];
    await runCli(argv);
    expect(loadInstalledCommandFeature).toHaveBeenLastCalledWith(expect.any(String), "cli-workflow");
    expect(run).toHaveBeenCalledWith(argv.slice(2));
  });
  it("reports system info and credential presence without exposing values", async () => {
    const output: string[] = [];
    await createProgram({ env: { OPENAI_API_KEY: "private-fixture", PORT: "8000" }, stdout: value => output.push(value) }).parseAsync(["node", "nodetool", "info", "--json"]);
    expect(JSON.parse(output.join(""))).toMatchObject({ node_version: process.version, platform: process.platform, arch: process.arch, api_keys: { OPENAI_API_KEY: "configured", ANTHROPIC_API_KEY: "not set" }, environment: { PORT: "8000" } });
    expect(output.join("")).not.toContain("private-fixture");
  });
  it("reports each provider's credential state by name, including FAL and the claude CLI", async () => {
    const bin = await mkdtemp(join(tmpdir(), "nodetool-claude-bin-"));
    try {
      await writeFile(join(bin, "claude"), "#!/bin/sh\n", { mode: 0o755 });
      const output: string[] = [];
      await createProgram({ env: { FAL_KEY: "private-fal", PATH: bin }, stdout: value => output.push(value) }).parseAsync(["node", "nodetool", "info", "--json"]);
      const providers = JSON.parse(output.join("")).providers;
      expect(providers).toEqual(expect.arrayContaining([
        { id: "fal_ai", requires: "FAL_API_KEY", status: "set (env)" },
        { id: "openai", requires: "OPENAI_API_KEY", status: "not set" },
        { id: "claude_agent_sdk", requires: "claude CLI", status: "found" }
      ]));
      expect(output.join("")).not.toContain("private-fal");
    } finally { await rm(bin, { recursive: true, force: true }); }
  });
  it("selects one admitted feature for overlapping optional command flags", async () => {
    const run = vi.fn(async (_argv: readonly string[]) => {});
    vi.mocked(loadInstalledCommandFeature).mockResolvedValueOnce({ run });
    await runCli(["node", "nodetool", "feature", "cli-workflow", "workflows", "run", "workflow.json", "--json"]);
    expect(loadInstalledCommandFeature).toHaveBeenLastCalledWith(expect.any(String), "cli-workflow");
    expect(run).toHaveBeenCalledWith(["workflows", "run", "workflow.json", "--json"]);
  });
  it("dispatches only the selected server command feature", async () => {
    const run = vi.fn(async (_argv: readonly string[]) => {});
    vi.mocked(loadInstalledCommandFeature).mockResolvedValueOnce({ run });
    await runCli(["node", "nodetool", "server", "serve", "--port", "0"]);
    expect(loadInstalledCommandFeature).toHaveBeenLastCalledWith(expect.any(String), "cli-server");
    expect(run).toHaveBeenCalledWith(["serve", "--port", "0"]);
  });
  it("does not use an aggregate feature as a fallback for unknown commands", async () => {
    const calls = vi.mocked(loadInstalledCommandFeature).mock.calls.length;
    const exit = vi.spyOn(process, "exit").mockImplementation(() => { throw new Error("Unknown command rejected"); });
    try { await expect(runCli(["node", "nodetool", "full", "serve"])).rejects.toThrow("Unknown command rejected"); }
    finally { exit.mockRestore(); }
    expect(loadInstalledCommandFeature).toHaveBeenCalledTimes(calls);
  });
  it.each(["eval", "jsscript"])("admits feature-specific %s commands with original flags before parsing", async command => {
    const run = vi.fn(async (_argv: readonly string[]) => {});
    vi.mocked(loadInstalledCommandFeature).mockResolvedValueOnce({ run });
    const argv = ["node", "nodetool", command, "test", "--json", "fixture"];
    await runCli(argv);
    expect(loadInstalledCommandFeature).toHaveBeenLastCalledWith(expect.any(String), command === "eval" ? "cli-harness" : "cli-script");
    expect(run).toHaveBeenCalledWith(argv.slice(2));
  });
  it("reports missing authored-source feature before parsing its feature-specific flags", async () => {
    vi.mocked(loadInstalledCommandFeature).mockRejectedValueOnce(Object.assign(new Error("Install cli-workflow"), { code: "FEATURE_NOT_INSTALLED", featureIds: ["cli-workflow"] }));
    await expect(runCli(["node", "nodetool", "--api-url", "http://localhost:7777", "run", "not-present.mts", "--json"])).rejects.toMatchObject({ code: "FEATURE_NOT_INSTALLED", featureIds: ["cli-workflow"] });
  });
  it.each([["run", "--json"], ["validate", "--warnings-as-errors"]])("routes authored %s before parsing feature-specific flag %s", async (command, flag) => {
    const run = vi.fn(async (_argv: readonly string[]) => {});
    vi.mocked(loadInstalledCommandFeature).mockResolvedValueOnce({ run });
    const argv = ["node", "nodetool", command, "workflow.ts", flag];
    const exit = vi.spyOn(process, "exit").mockImplementation(() => { throw new Error("Parser rejected authored-source flags"); });
    try { await runCli(argv); } finally { exit.mockRestore(); }
    expect(run).toHaveBeenCalledWith(argv.slice(2));
  });
  it("reports the workflow feature requirement for authored source without reading or executing it", async () => {
    vi.mocked(loadInstalledCommandFeature).mockRejectedValueOnce(Object.assign(new Error("Install cli-workflow"), { code: "FEATURE_NOT_INSTALLED", featureIds: ["cli-workflow"] }));
    await expect(createProgram({ env: {}, fetch: async () => { throw new Error("No automatic network work"); } }).parseAsync(["node", "nodetool", "validate", "not-present.mjs"])).rejects.toMatchObject({ code: "FEATURE_NOT_INSTALLED", featureIds: ["cli-workflow"] });
  });
  it.each(["run", "validate"])("delegates %s of code-authored workflows before reading JSON", async command => {
    const run = vi.fn(async (_argv: readonly string[]) => {});
    for (const extension of ["ts", "js", "mts", "mjs", "cts", "cjs"]) {
      vi.mocked(loadInstalledCommandFeature).mockResolvedValueOnce({ run });
      const argv = ["node", "nodetool", command, `workflow.${extension}`];
      await createProgram({ env: {}, argv }).parseAsync(argv);
      expect(run).toHaveBeenLastCalledWith(argv.slice(2));
    }
    expect(run).toHaveBeenCalledTimes(6);
  });
  it("delegates unsupported providers and original JSON flags to the admitted provider command runner", async () => {
    const run = vi.fn(async (_argv: readonly string[]) => {});
    vi.mocked(loadInstalledCommandFeature).mockResolvedValueOnce({ run });
    const argv = ["node", "nodetool", "models", "list", "--provider", "fal", "--json"];
    await createProgram({ env: {}, argv }).parseAsync(argv);
    expect(loadInstalledCommandFeature).toHaveBeenLastCalledWith(expect.any(String), "cli-models");
    expect(run).toHaveBeenCalledWith(argv.slice(2));
  });
  it.each([["providers", "list"], ["models", "providers"]])("lists every usable provider with %s %s, without secrets or network access", async (...command) => {
    const bin = await mkdtemp(join(tmpdir(), "nodetool-claude-bin-"));
    try {
      await writeFile(join(bin, "claude"), "#!/bin/sh\n", { mode: 0o755 });
      const stdout: string[] = [];
      await createProgram({ env: { OPENAI_API_KEY: "private-openai", FAL_API_KEY: "private-fal", PATH: bin }, stdout: text => stdout.push(text), fetch: async () => { throw new Error("Metadata must be local"); } }).parseAsync(["node", "nodetool", ...command]);
      const listed: { id: string; source: string }[] = JSON.parse(stdout.join(""));
      // A source checkout admits every pack, so pack-enabled providers are listed too.
      expect(listed.filter(state => state.source !== "pack").map(state => state.id)).toEqual(["openai", "fal_ai", "claude_agent_sdk"]);
      expect(stdout.join("")).not.toContain("private-");
    } finally { await rm(bin, { recursive: true, force: true }); }
  });
  it("omits claude_agent_sdk when the claude CLI is not found", async () => {
    const stdout: string[] = [];
    await createProgram({ env: { PATH: "" }, stdout: text => stdout.push(text) }).parseAsync(["node", "nodetool", "providers", "list"]);
    expect(JSON.parse(stdout.join("")).filter((state: { source: string }) => state.source !== "pack")).toEqual([]);
  });
  it("reports an unavailable provider with its explicit installation feature", async () => {
    vi.mocked(loadInstalledCommandFeature).mockRejectedValueOnce(Object.assign(new Error("Install cli-models"), { code: "FEATURE_NOT_INSTALLED", featureIds: ["cli-models"] }));
    await expect(createProgram({ env: {} }).parseAsync(["node", "nodetool", "models", "list", "--provider", "anthropic"])).rejects.toMatchObject({ code: "FEATURE_NOT_INSTALLED", featureIds: ["cli-models"] });
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
  it("streams text from the environment API key with the default model and no other setup", async () => {
    const directory = await mkdtemp(join(tmpdir(), "nodetool-lean-text-"));
    try {
      const calls: Array<{ authorization: string | null; body: { model: string; messages: unknown } }> = [];
      const stdout: string[] = [];
      const sse = [
        `data: ${JSON.stringify({ id: "c", object: "chat.completion.chunk", created: 1, model: "m", choices: [{ index: 0, delta: { content: "hel" }, finish_reason: null }] })}`,
        `data: ${JSON.stringify({ id: "c", object: "chat.completion.chunk", created: 1, model: "m", choices: [{ index: 0, delta: { content: "lo" }, finish_reason: "stop" }] })}`,
        `data: ${JSON.stringify({ id: "c", object: "chat.completion.chunk", created: 1, model: "m", choices: [], usage: { prompt_tokens: 3, completion_tokens: 2, total_tokens: 5 } })}`,
        "data: [DONE]", ""
      ].join("\n\n");
      await createProgram({ env: { OPENAI_API_KEY: "env-key", NODETOOL_DATA_DIR: directory }, stdout: text => stdout.push(text), fetch: async (_input, init) => {
        calls.push({ authorization: new Headers(init?.headers).get("authorization"), body: JSON.parse(String(init?.body)) });
        return new Response(sse, { headers: { "content-type": "text/event-stream" } });
      } }).parseAsync(["node", "nodetool", "text", "hi", "--system", "be brief", "--json"]);
      expect(calls).toHaveLength(1);
      expect(calls[0]?.authorization).toBe("Bearer env-key");
      expect(calls[0]?.body).toMatchObject({ model: DEFAULT_TEXT_MODEL, messages: [{ role: "system", content: "be brief" }, { role: "user", content: "hi" }] });
      expect(JSON.parse(stdout.join(""))).toEqual({ model: DEFAULT_TEXT_MODEL, text: "hello", usage: { inputTokens: 3, outputTokens: 2 } });
    } finally { await rm(directory, { recursive: true, force: true }); }
  });
  it("explains how to supply an API key when none is configured", async () => {
    const directory = await mkdtemp(join(tmpdir(), "nodetool-lean-nokey-"));
    try {
      await expect(createProgram({ env: { NODETOOL_DATA_DIR: directory } }).parseAsync(["node", "nodetool", "text", "hi"])).rejects.toThrow("export OPENAI_API_KEY");
    } finally { await rm(directory, { recursive: true, force: true }); }
  });
  it("prefers the stored tenant secret over the environment key", async () => {
    const directory = await mkdtemp(join(tmpdir(), "nodetool-lean-stored-"));
    const masterKey = "0123456789abcdef0123456789abcdef";
    try {
      const repository = createSqliteRepository(join(directory, "nodetool.db"));
      await repository.put("secrets", "1", { key: "OPENAI_API_KEY", description: "", encrypted_value: encrypt(masterKey, "1", "stored-key") });
      await repository.close();
      const seen: Array<string | null> = [];
      await createProgram({ env: { OPENAI_API_KEY: "env-key", SECRETS_MASTER_KEY: masterKey, NODETOOL_DATA_DIR: directory }, stdout: () => {}, fetch: async (_input, init) => {
        seen.push(new Headers(init?.headers).get("authorization"));
        return Response.json({ object: "list", data: [] });
      } }).parseAsync(["node", "nodetool", "models", "list"]);
      expect(seen).toEqual(["Bearer stored-key"]);
    } finally { await rm(directory, { recursive: true, force: true }); }
  });
  it("prints built-in node descriptions and an example workflow that validates", async () => {
    const stdout: string[] = [];
    await createProgram({ env: {}, stdout: text => stdout.push(text) }).parseAsync(["node", "nodetool", "nodes"]);
    const listed = JSON.parse(stdout.join("")) as { nodes: Array<{ nodeType: string }> };
    expect(listed.nodes.map(node => node.nodeType)).toEqual(expect.arrayContaining(["nodetool.text.Template", "openai.text.ChatComplete", "nodetool.output.Output"]));
    const directory = await mkdtemp(join(tmpdir(), "nodetool-lean-example-"));
    try {
      const path = join(directory, "flow.json");
      await writeFile(path, JSON.stringify(exampleWorkflow("fixture-model")));
      const validated: string[] = [];
      await createProgram({ env: {}, stdout: text => validated.push(text) }).parseAsync(["node", "nodetool", "validate", path]);
      expect(JSON.parse(validated.join(""))).toEqual({ valid: true, issues: [] });
    } finally { await rm(directory, { recursive: true, force: true }); }
  });
  it("explains missing server credentials instead of a schema error", async () => {
    const masterKey = "0123456789abcdef0123456789abcdef";
    await expect(createProgram({ env: { SECRETS_MASTER_KEY: masterKey } }).parseAsync(["node", "nodetool", "serve"])).rejects.toThrow("Set NODETOOL_API_TOKEN");
    await expect(createProgram({ env: { SECRETS_MASTER_KEY: masterKey, NODETOOL_TOKENS: "null" } }).parseAsync(["node", "nodetool", "serve"])).rejects.toThrow("NODETOOL_TOKENS must be a JSON object");
    await expect(createProgram({ env: { NODETOOL_API_TOKEN: "x".repeat(40) } }).parseAsync(["node", "nodetool", "serve"])).rejects.toThrow("Set SECRETS_MASTER_KEY");
  });
  it("points 404 responses at the server URL", async () => {
    const program = createProgram({ env: { NODETOOL_API_TOKEN: "fixture-token" }, fetch: async () => new Response("Not Found", { status: 404 }) });
    await expect(program.parseAsync(["node", "nodetool", "secrets", "list"])).rejects.toThrow("nodetool serve");
  });
  it("rejects missing credentials before sending requests", async () => {
    let requested = false;
    const program = createProgram({ env: {}, fetch: async () => { requested = true; return Response.json({}); } });
    await expect(program.parseAsync(["node", "nodetool", "jobs", "list"])).rejects.toThrow("NODETOOL_API_TOKEN");
    expect(requested).toBe(false);
  });
});
