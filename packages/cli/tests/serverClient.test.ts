import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { contentTypeFor, createProgram, hoistGlobalOptions, isNodeToolNotFound } from "../src/lean/program.js";

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
