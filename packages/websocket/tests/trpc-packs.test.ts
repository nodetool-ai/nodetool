import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { packsRouter } from "../src/trpc/routers/packs.js";
import { createCallerFactory } from "../src/trpc/index.js";
import type { Context } from "../src/trpc/context.js";
import { setPackSnapshot } from "../src/pack-snapshot.js";
import {
  NodeRegistry,
  type LoadedPackResult
} from "@nodetool-ai/node-sdk";

const createCaller = createCallerFactory(packsRouter);

function makeCtx(overrides: Partial<Context> = {}): Context {
  return {
    userId: "user-1",
    registry: new NodeRegistry(),
    apiOptions: {} as never,
    pythonBridge: {} as never,
    getPythonBridgeReady: () => false,
    ...overrides
  };
}

let tmpRoot: string;
let configPath: string;
const savedEnv: Record<string, string | undefined> = {};

beforeEach(() => {
  tmpRoot = mkdtempSync(join(tmpdir(), "trpc-packs-"));
  configPath = join(tmpRoot, "packs.json");
  for (const key of [
    "NODETOOL_ENV",
    "NODETOOL_PACKS_ALLOWLIST",
    "NODETOOL_PACKS_CONFIG"
  ]) {
    savedEnv[key] = process.env[key];
    delete process.env[key];
  }
  process.env["NODETOOL_PACKS_CONFIG"] = configPath;
  setPackSnapshot([]);
});

afterEach(() => {
  rmSync(tmpRoot, { recursive: true, force: true });
  setPackSnapshot([]);
  for (const [key, value] of Object.entries(savedEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

function fakePack(name: string, overrides: Partial<LoadedPackResult> = {}): LoadedPackResult {
  return {
    pack: {
      name,
      version: "1.2.3",
      dir: "/tmp/" + name,
      entry: "/tmp/" + name + "/index.js",
      registerExport: "register",
      manifest: {}
    },
    status: "loaded",
    registered: [`${name}.text.Demo`],
    skippedNodes: [],
    ...overrides
  };
}

describe("packs router", () => {
  it("list returns the current snapshot mapped to DTO shape", async () => {
    setPackSnapshot([fakePack("@acme/cool")]);
    const caller = createCaller(makeCtx());
    const result = await caller.list();
    expect(result.packs).toEqual([
      {
        name: "@acme/cool",
        version: "1.2.3",
        status: "loaded",
        registered: ["@acme/cool.text.Demo"],
        skippedNodes: []
      }
    ]);
  });

  it("list maps errors to a plain message string", async () => {
    setPackSnapshot([
      fakePack("@acme/broken", {
        status: "error",
        registered: [],
        error: new Error("boom")
      })
    ]);
    const caller = createCaller(makeCtx());
    const result = await caller.list();
    expect(result.packs[0]).toMatchObject({
      name: "@acme/broken",
      status: "error",
      error: "boom"
    });
  });

  it("getTrust reads the resolved trust config", async () => {
    process.env["NODETOOL_PACKS_ALLOWLIST"] = "@acme/a, @acme/b";
    process.env["NODETOOL_ENV"] = "production";
    const caller = createCaller(makeCtx());
    const trust = await caller.getTrust();
    expect(trust.allowlist).toEqual(["@acme/a", "@acme/b"]);
    expect(trust.allowUnlisted).toBe(false);
  });

  it("setTrust persists changes to the config file", async () => {
    const caller = createCaller(makeCtx());
    const next = await caller.setTrust({
      allowlist: ["@acme/cool"],
      allowUnlisted: true
    });
    expect(next).toEqual({
      allowlist: ["@acme/cool"],
      allowUnlisted: true
    });
    const parsed = JSON.parse(readFileSync(configPath, "utf8"));
    expect(parsed).toEqual({
      allow: ["@acme/cool"],
      allowUnlisted: true
    });
  });

  it("setTrust accepts a partial update and merges with current trust", async () => {
    const caller = createCaller(makeCtx());
    await caller.setTrust({ allowlist: ["@acme/a"] });
    const next = await caller.setTrust({ allowUnlisted: false });
    expect(next).toEqual({ allowlist: ["@acme/a"], allowUnlisted: false });
  });

  it("setTrust rejects a fully-empty update", async () => {
    const caller = createCaller(makeCtx());
    // @ts-expect-error — exercising the runtime refine guard
    await expect(caller.setTrust({})).rejects.toThrow();
  });

  it("listBuiltins enables only required and default-enabled packs out of the box", async () => {
    const caller = createCaller(makeCtx());
    const result = await caller.listBuiltins();
    const byId = new Map(result.packs.map((p) => [p.id, p]));
    expect(byId.get("base")).toMatchObject({ enabled: true, required: true });
    expect(byId.get("fal")?.enabled).toBe(true);
    expect(byId.get("kie")?.enabled).toBe(true);
    // Opt-in packs start disabled.
    expect(byId.get("elevenlabs")?.enabled).toBe(false);
    expect(byId.get("minimax")?.enabled).toBe(false);
  });

  it("setBuiltinEnabled persists overrides and applies them to the live registry", async () => {
    const ctx = makeCtx();
    const caller = createCaller(ctx);

    const enabled = await caller.setBuiltinEnabled({
      id: "minimax",
      enabled: true
    });
    expect(enabled.packs.find((p) => p.id === "minimax")?.enabled).toBe(true);
    // Applied live: the pack's nodes are registered without a restart.
    expect(
      ctx.registry.list().some((t) => t.startsWith("minimax."))
    ).toBe(true);

    const disabled = await caller.setBuiltinEnabled({
      id: "minimax",
      enabled: false
    });
    expect(disabled.packs.find((p) => p.id === "minimax")?.enabled).toBe(false);
    expect(
      ctx.registry.list().some((t) => t.startsWith("minimax."))
    ).toBe(false);

    const config = JSON.parse(readFileSync(configPath, "utf8"));
    expect(config.enabledBuiltins).toEqual([]);
    expect(config.disabledBuiltins).toEqual(["minimax"]);
  });

  it("setBuiltinEnabled rejects unknown ids and required packs", async () => {
    const caller = createCaller(makeCtx());
    await expect(
      caller.setBuiltinEnabled({ id: "nope", enabled: false })
    ).rejects.toThrow(/Unknown built-in pack/);
    await expect(
      caller.setBuiltinEnabled({ id: "base", enabled: false })
    ).rejects.toThrow(/cannot be disabled/);
  });

  it("reload re-runs the loader against the registry and refreshes the snapshot", async () => {
    // Empty searchPaths → loader finds nothing, snapshot becomes [].
    setPackSnapshot([fakePack("@acme/cool")]);
    const caller = createCaller(makeCtx());
    const result = await caller.reload();
    expect(result.packs).toEqual([]);
  });
});
