import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { contentTypeFor, createProgram, declaredInputNames, displayEndpoint, hoistGlobalOptions, isNodeToolNotFound, parsePageSize, rejectedBaseUrlMessage, transportReason, unusedParamsWarning } from "../src/lean/program.js";

const TOKEN = "fixture-token";

describe("server client commands", () => {
  it("moves --api-url and --token after the subcommand to the front", () => {
    expect(hoistGlobalOptions(["node", "nodetool", "workflows", "list", "--api-url", "http://h:1", "--token=t"]))
      .toEqual(["node", "nodetool", "--api-url", "http://h:1", "--token=t", "workflows", "list"]);
    expect(hoistGlobalOptions(["node", "nodetool", "run", "--", "--token", "x"])).toEqual(["node", "nodetool", "run", "--", "--token", "x"]);
  });

  it("shows the wrong-server hint only for a 404 that no NodeTool route sent", async () => {
    expect(isNodeToolNotFound({ error: "Workflow not found" })).toBe(true);
    expect(isNodeToolNotFound({ message: "Route GET:/api/x not found", error: "Not Found", statusCode: 404 })).toBe(false);
    const run = (body: unknown) => createProgram({ env: { NODETOOL_API_TOKEN: TOKEN }, stdout: () => {}, fetch: async () => Response.json(body, { status: 404 }) })
      .parseAsync(["node", "nodetool", "workflows", "get", "abc"]);
    await expect(run({ error: "Workflow not found" })).rejects.toThrow(/^Server returned 404: /);
    await expect(run({ message: "Route GET:/x not found", error: "Not Found", statusCode: 404 })).rejects.toThrow(/no NodeTool route/);
  });

  it("uploads an asset with its file name and content type", async () => {
    const directory = await mkdtemp(join(tmpdir(), "nodetool-upload-"));
    try {
      const file = join(directory, "photo.png");
      await writeFile(file, "png-bytes");
      let sent: FormData | undefined;
      await createProgram({ env: { NODETOOL_API_TOKEN: TOKEN }, stdout: () => {}, fetch: async (_input, init) => {
        if (init?.body instanceof FormData) { sent = init.body; }
        return Response.json({ id: "a" });
      } }).parseAsync(["node", "nodetool", "assets", "upload", file]);
      const part = sent?.get("file");
      expect(part).toBeInstanceOf(File);
      expect((part as File).name).toBe("photo.png");
      expect((part as File).type).toBe("image/png");
      expect(contentTypeFor("x.unknown")).toBe("application/octet-stream");
    } finally { await rm(directory, { recursive: true, force: true }); }
  });

  it("gives CLI steps, not the embedding API text, for a missing server feature", async () => {
    const failure = { code: "FEATURE_NOT_INSTALLED", featureIds: ["fal"], recovery: [{ featureId: "fal", packId: "fal", packageName: "@nodetool-ai/fal-nodes", installCommand: "nodetool packs add fal --yes", configuration: "Explicitly configure feature fal in the server features option.", restart: "Restart the server.", authorizationRequired: true }] };
    const error = await createProgram({ env: { NODETOOL_API_TOKEN: TOKEN }, stdout: () => {}, fetch: async () => Response.json(failure, { status: 400 }) })
      .parseAsync(["node", "nodetool", "workflows", "run", "abc"]).catch((caught: unknown) => caught);
    expect(error).toMatchObject({ code: "FEATURE_NOT_INSTALLED", recovery: [{ configuration: expect.stringContaining("nodetool server serve") }] });
  });

  it("reports every missing serve variable at once", async () => {
    await expect(createProgram({ env: {}, stdout: () => {} }).parseAsync(["node", "nodetool", "serve"]))
      .rejects.toThrow(/SECRETS_MASTER_KEY[\s\S]*\n[\s\S]*NODETOOL_API_TOKEN/);
  });
});

describe("server client argument and transport diagnostics", () => {
  const program = (fetchImpl: typeof fetch, apiUrl?: string) => createProgram({
    env: { NODETOOL_API_TOKEN: TOKEN, ...(apiUrl ? { NODETOOL_API_URL: apiUrl } : {}) }, stdout: () => {}, fetch: fetchImpl
  });

  it("names the method, endpoint and transport reason when the connection is refused", async () => {
    const server = createServer();
    await new Promise<void>(done => server.listen(0, "127.0.0.1", done));
    const { port } = server.address() as AddressInfo;
    await new Promise<void>(done => server.close(() => done()));
    const error = await createProgram({ env: { NODETOOL_API_TOKEN: TOKEN }, stdout: () => {} })
      .parseAsync(["node", "nodetool", "--api-url", `http://user:pass@127.0.0.1:${port}`, "workflows", "list", "--cursor", "c1"])
      .catch((caught: unknown) => caught);
    expect(String(error)).toContain("Server URL must use HTTP(S) without credentials");
    const refused = await createProgram({ env: { NODETOOL_API_TOKEN: TOKEN }, stdout: () => {} })
      .parseAsync(["node", "nodetool", "--api-url", `http://127.0.0.1:${port}`, "workflows", "list", "--cursor", "c1"])
      .catch((caught: unknown) => caught as Error);
    expect(refused).toBeInstanceOf(Error);
    expect((refused as Error).message).toMatch(new RegExp(`^GET http://127\\.0\\.0\\.1:${port}/api/workflows failed: .*ECONNREFUSED`));
    expect((refused as Error).message).not.toContain(TOKEN);
    expect((refused as Error).message).not.toContain("cursor");
  });

  it("keeps the status and body for a non-2xx response", async () => {
    await expect(program(async () => new Response("maintenance", { status: 503 })).parseAsync(["node", "nodetool", "jobs", "list"]))
      .rejects.toThrow("Server returned 503: maintenance");
  });

  it("reduces a fetch failure to its causes and an endpoint to origin and path", () => {
    const cause = Object.assign(new Error("connect ECONNREFUSED 127.0.0.1:9"), { code: "ECONNREFUSED" });
    expect(transportReason(new TypeError("fetch failed", { cause }))).toBe("connect ECONNREFUSED 127.0.0.1:9");
    expect(transportReason(new TypeError("fetch failed"))).toBe("the request failed before the server answered");
    expect(displayEndpoint(new URL("https://u:p@example.com:8443/api/x?token=1#f"))).toBe("https://example.com:8443/api/x");
  });

  it("sends a valid --limit and rejects non-numeric, negative, fractional and oversized values before any request", async () => {
    const urls: string[] = [];
    await program(async input => { urls.push(String(input)); return Response.json({ workflows: [] }); })
      .parseAsync(["node", "nodetool", "workflows", "list", "--limit", "5"]);
    expect(new URL(urls[0] ?? "").searchParams.get("limit")).toBe("5");
    for (const value of ["banana", "-2", "1.5", "0", "501", ""]) {
      const quiet = createProgram({ env: { NODETOOL_API_TOKEN: TOKEN }, stdout: () => {}, fetch: async input => { urls.push(String(input)); return Response.json({}); } });
      quiet.exitOverride().configureOutput({ writeErr: () => {} });
      for (const command of quiet.commands) { command.exitOverride().configureOutput({ writeErr: () => {} }); for (const sub of command.commands) sub.exitOverride().configureOutput({ writeErr: () => {} }); }
      await expect(quiet.parseAsync(["node", "nodetool", "workflows", "list", "--limit", value])).rejects.toThrow(/--limit/);
    }
    expect(urls).toHaveLength(1);
    expect(() => parsePageSize("12")).not.toThrow();
  });

  it("downloads to a fresh file, keeps an existing one, and replaces it with --force", async () => {
    const directory = await mkdtemp(join(tmpdir(), "nodetool-download-"));
    try {
      const fresh = join(directory, "fresh.txt");
      const existing = join(directory, "asset.txt");
      await writeFile(existing, "original");
      let requests = 0;
      const serve = async (): Promise<Response> => { requests += 1; return new Response("example asset"); };
      await program(serve).parseAsync(["node", "nodetool", "assets", "download", "a", fresh]);
      expect(await readFile(fresh, "utf8")).toBe("example asset");
      await expect(program(serve).parseAsync(["node", "nodetool", "assets", "download", "a", existing])).rejects.toThrow(/already exists.*--force/);
      expect(await readFile(existing, "utf8")).toBe("original");
      expect(requests).toBe(1);
      await program(serve).parseAsync(["node", "nodetool", "assets", "download", "a", existing, "--force"]);
      expect(await readFile(existing, "utf8")).toBe("example asset");
    } finally { await rm(directory, { recursive: true, force: true }); }
  });

  it("refuses a policy-rejected OPENAI_BASE_URL with a clear message and no request", async () => {
    let requests = 0;
    const error = await createProgram({
      env: { OPENAI_API_KEY: "dummy", OPENAI_BASE_URL: "http://user:secret@127.0.0.1:45597/v1?key=k" }, stdout: () => {},
      fetch: async () => { requests += 1; return Response.json({}); }
    }).parseAsync(["node", "nodetool", "text", "--json", "hello"]).catch((caught: unknown) => caught as Error);
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toContain("OPENAI_BASE_URL (http://127.0.0.1:45597/v1) is refused by the outbound URL policy");
    expect((error as Error).message).not.toMatch(/secret|key=k/);
    expect(requests).toBe(0);
    expect(rejectedBaseUrlMessage("not a url")).toContain("(the configured value)");
  });
});

describe("run --params", () => {
  const graph = {
    nodes: [
      { id: "topic", type: "nodetool.input.StringInput", properties: { name: "topic", value: "autumn" } },
      { id: "prompt", type: "nodetool.text.Template", properties: { string: "Write a haiku about {{ topic }}." } },
      { id: "result", type: "nodetool.output.Output", properties: { name: "haiku" } }
    ],
    edges: [
      { source: "topic", sourceHandle: "output", target: "prompt", targetHandle: "topic" },
      { source: "prompt", sourceHandle: "output", target: "result", targetHandle: "value" }
    ]
  };
  async function run(params: string): Promise<{ stdout: string; stderr: string }> {
    const directory = await mkdtemp(join(tmpdir(), "nodetool-params-"));
    try {
      const file = join(directory, "local.json");
      await writeFile(file, JSON.stringify({ graph }));
      let stdout = ""; let stderr = "";
      await createProgram({ env: {}, stdout: value => { stdout += value; }, stderr: value => { stderr += value; } })
        .parseAsync(["node", "nodetool", "run", file, "--params", params]);
      return { stdout, stderr };
    } finally { await rm(directory, { recursive: true, force: true }); }
  }

  it("applies a declared input without a warning", async () => {
    const { stdout, stderr } = await run('{"topic":"spring"}');
    expect(stdout).toContain("spring");
    expect(stderr).toBe("");
  });

  it("warns on stderr about a misspelled input and keeps stdout valid JSON", async () => {
    const { stdout, stderr } = await run('{"topci":"spring"}');
    expect(stderr).toBe("Warning: --params key topci matches no workflow input and was ignored. Declared inputs: topic.\n");
    expect(JSON.stringify(JSON.parse(stdout))).toContain("autumn");
  });

  it("reads input names the way the runner does", () => {
    expect(declaredInputNames({ nodes: [{ id: "a", type: "nodetool.input.IntegerInput", properties: { name: " count " } }, { id: "b", type: "nodetool.input.StringInput", name: "label" }, { id: "c", type: "nodetool.text.Template" }] })).toEqual(["count", "label"]);
    expect(unusedParamsWarning(["x", "y"], [])).toBe("Warning: --params keys x, y match no workflow input and were ignored. The workflow declares no inputs.");
    expect(unusedParamsWarning(["count"], ["count"])).toBeUndefined();
  });
});
