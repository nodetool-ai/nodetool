/** Retained reproduction: authoring must be possible through the installed CLI. */
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { expect, it } from "vitest";

const exec = promisify(execFile);
it("discovers shipped guides and schemas and creates valid timeline/game starting documents", async () => {
  const directory = await mkdtemp(join(tmpdir(), "nodetool-authoring-cli-"));
  const entry = resolve("src/nodetool.ts");
  const run = async (...args: string[]) => {
    const { stdout } = await exec(
      process.execPath,
      ["--import", import.meta.resolve("tsx"), entry, ...args],
      {
        cwd: directory,
        env: {
          PATH: process.env["PATH"] ?? "",
          ...(process.env["SystemRoot"]
            ? { SystemRoot: process.env["SystemRoot"] }
            : {}),
          ...(process.env["WINDIR"] ? { WINDIR: process.env["WINDIR"] } : {}),
          APPDATA: join(directory, "appdata"),
          LOCALAPPDATA: join(directory, "localappdata"),
          USERPROFILE: directory,
          TMP: directory,
          TEMP: directory,
          TMPDIR: directory,
          ASSET_FOLDER: join(directory, "assets"),
          NODETOOL_WORKSPACES_DIR: join(directory, "workspaces"),
          HOME: directory,
          XDG_CONFIG_HOME: join(directory, "config"),
          XDG_CACHE_HOME: join(directory, "cache"),
          DB_PATH: join(directory, "test.sqlite3"),
          XDG_DATA_HOME: directory,
          DATABASE_URL: "",
          SECRETS_MASTER_KEY: "0".repeat(64),
          NODETOOL_LOG_LEVEL: "error"
        },
        timeout: 120_000,
        maxBuffer: 4 * 1024 * 1024
      }
    );
    return JSON.parse(stdout);
  };
  try {
    const tools = await run("tools", "list", "timeline");
    expect(tools).toContainEqual(
      expect.objectContaining({ name: "create_timeline" })
    );
    await expect(
      run(
        "tools",
        "call",
        "get_node_info",
        "--args",
        JSON.stringify({ node_type: "nodetool.nonexistent.NoSuchNode" })
      )
    ).rejects.toMatchObject({
      code: 1,
      stdout: expect.stringContaining('"status": "error"')
    });
    const models = await run("tools", "list", "model");
    for (const name of ["find_model", "list_models"]) {
      expect(models).toContainEqual(expect.objectContaining({ name }));
    }
    const modelSchema = await run("tools", "info", "find_model");
    expect(modelSchema.inputSchema.properties.capability.enum).toContain("text_to_image");
    const model = await run("tools", "call", "find_model", "--args", JSON.stringify({
      capability: "text_to_image", provider_hint: "fake"
    }));
    expect(model.ref).toMatchObject({ provider: "fake", id: "fake-image" });
    const schema = await run("tools", "info", "create_native_game");
    expect(schema.inputSchema.required).toContain("project_id");
    const game = await run(
      "tools",
      "call",
      "create_native_game",
      "--args",
      JSON.stringify({ project_id: "personal:1", name: "CLI starting game" })
    );
    expect(game.error).toBeUndefined();
    expect(game.game.id).toMatch(/^[a-f0-9]{32}$/);
    expect(game.document.scenes[0].entities.length).toBeGreaterThan(0);
    const guide = await run("skills", "read", "native-game");
    expect(JSON.stringify(guide)).toContain("create_native_game");
    const timeline = await run(
      "tools",
      "call",
      "create_timeline",
      "--args",
      JSON.stringify({ name: "CLI starting timeline" })
    );
    expect(timeline.error).toBeUndefined();
    expect(JSON.stringify(timeline)).toContain("CLI starting timeline");
    await expect(
      run("tools", "call", "create_timeline", "--args", "{}")
    ).rejects.toMatchObject({
      code: 1,
      stdout: expect.stringContaining("error")
    });
    await expect(
      run("tools", "info", "no_such_authoring_tool")
    ).rejects.toMatchObject({ code: 1 });
    const video = await run(
      "tools",
      "call",
      "generate_video",
      "--args",
      JSON.stringify({
        provider: "fake",
        model: "fake-video",
        prompt: "CLI zero-cost fixture"
      })
    );
    expect(video.error).toBeUndefined();
    expect(JSON.stringify(video)).toContain("asset://");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}, 600_000);
