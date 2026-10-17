import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ModelObserver, Project, Workspace, initTestDb } from "@nodetool-ai/models";
import { anyGameDocument } from "@nodetool-ai/protocol";
import { InMemoryStorageAdapter } from "@nodetool-ai/storage";
import { workspaceFromRow } from "@nodetool-ai/execution/service";
import type { ProcessingContext } from "@nodetool-ai/runtime";
import { createCapabilityRun, UNGATED } from "../src/capabilities/invoke.js";

const USER = "game-assertion-owner";
const PROJECT = "game-assertion-project";
let directory: string;

function record(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("Expected capability result");
  }
  return Object.fromEntries(Object.entries(value));
}

async function fixture(dimension: "2d" | "3d") {
  const [row] = await Workspace.listByProject(USER, PROJECT);
  if (!row) {
    throw new Error("Expected test workspace");
  }
  // These capability fixtures supply only the context services exercised by game tools.
  const context = { userId: USER, workspace: workspaceFromRow(row), assetStorage: new InMemoryStorageAdapter() } as unknown as ProcessingContext;
  const run = createCapabilityRun({ context, gate: UNGATED });
  const created = record(await run.invoke("create_native_game", { project_id: PROJECT, name: "Assertions", dimension }));
  const document = anyGameDocument.parse(created.document);
  return { run, gameId: document.id };
}

describe("native game assertion contracts", () => {
  beforeEach(async () => {
    initTestDb();
    directory = await mkdtemp(join(tmpdir(), "nodetool-game-assertions-"));
    await Project.insertNew({ id: PROJECT, user_id: USER, name: "Assertions", kind: "game" });
    await Workspace.create({ user_id: USER, project_id: PROJECT, name: "Game files", path: directory, is_default: false });
  });
  afterEach(async () => {
    ModelObserver.clear();
    await rm(directory, { recursive: true, force: true });
  });

  it.each(["2d", "3d"] as const)("rejects a partially evaluated combined assertion in %s", async (dimension) => {
    const { run, gameId } = await fixture(dimension);
    const result = record(await run.invoke("playtest_native_game", {
      game_id: gameId,
      inputs: [{ pressed: [], ticks: 1 }],
      assertions: [{ no_script_errors: true, event: "THIS_EVENT_IS_NEVER_EMITTED" }]
    }));
    expect(result.error).toBe(`Invalid ${dimension.toUpperCase()} assertions`);
    expect(result).toHaveProperty("diagnostics");
    expect(result).not.toHaveProperty("assertion_results");
  });

  for (const dimension of ["2d", "3d"] as const) {
    it.each([
      { label: "null", assertions: null },
      { label: "non-array", assertions: { no_script_errors: true } }
    ])(`rejects $label assertions in ${dimension}`, async ({ assertions }) => {
      const { run, gameId } = await fixture(dimension);
      const result = record(await run.invoke("playtest_native_game", {
        game_id: gameId, inputs: [{ pressed: [], ticks: 1 }], assertions
      }));
      expect(result.error).toBe(`Invalid ${dimension.toUpperCase()} assertions`);
      expect(result).not.toHaveProperty("assertion_results");
    });
  }

  it("rejects a near predicate combined with a grounded predicate", async () => {
    const { run, gameId } = await fixture("3d");
    const result = record(await run.invoke("playtest_native_game", {
      game_id: gameId,
      inputs: [{ pressed: [], ticks: 1 }],
      assertions: [{ entity_id: "player", near: { x: 0, y: 0, z: 0, tolerance: 1000 }, grounded: true }]
    }));
    expect(result.error).toBe("Invalid 3D assertions");
    expect(result).not.toHaveProperty("assertion_results");
  });

  for (const dimension of ["2d", "3d"] as const) {
    const near = dimension === "3d" ? { x: 0, y: 0, z: 0, tolerance: 0 } : { x: 0, y: 0, tolerance: 0 };
    it.each([
      { label: "empty form", assertion: {} },
      { label: "false sentinel", assertion: { no_script_errors: false } },
      { label: "event with an entity tick", assertion: { event: "missing", at_tick: 1 } },
      { label: "near with an event deadline", assertion: { entity_id: "player", near, before_tick: 1 } },
      { label: "unknown nested predicate", assertion: { entity_id: "player", near: { ...near, grounded: true } } }
    ])(`rejects $label in ${dimension}`, async ({ assertion }) => {
      const { run, gameId } = await fixture(dimension);
      const result = record(await run.invoke("playtest_native_game", {
        game_id: gameId, inputs: [{ pressed: [], ticks: 1 }], assertions: [assertion]
      }));
      expect(result.error).toBe(`Invalid ${dimension.toUpperCase()} assertions`);
      expect(result).not.toHaveProperty("assertion_results");
    });
  }

  it("rejects a 3D coordinate in a 2D near assertion", async () => {
    const { run, gameId } = await fixture("2d");
    const result = record(await run.invoke("playtest_native_game", {
      game_id: gameId, assertions: [{ entity_id: "player", near: { x: 0, y: 0, z: 0 } }]
    }));
    expect(result.error).toBe("Invalid 2D assertions");
  });

  it("keeps the required third coordinate in 3D near assertions", async () => {
    const { run, gameId } = await fixture("3d");
    const result = record(await run.invoke("playtest_native_game", {
      game_id: gameId, assertions: [{ entity_id: "player", near: { x: 0, y: 0, tolerance: 0 } }]
    }));
    expect(result.error).toBe("Invalid 3D assertions");
  });

  it.each([
    { label: "false replay sentinel", assertion: { replay_matches: false } },
    { label: "replay combined with an event", assertion: { replay_matches: true, event: "missing" } }
  ])("rejects $label", async ({ assertion }) => {
    const { run, gameId } = await fixture("3d");
    const result = record(await run.invoke("playtest_native_game", {
      game_id: gameId, inputs: [{ pressed: [], ticks: 1 }], restore_at_tick: 0, assertions: [assertion]
    }));
    expect(result.error).toBe("Invalid 3D assertions");
  });

  for (const dimension of ["2d", "3d"] as const) {
    it.each(["omitted", "empty"] as const)(`keeps %s assertion lists valid in ${dimension}`, async (kind) => {
      const { run, gameId } = await fixture(dimension);
      const args: Record<string, unknown> = { game_id: gameId, inputs: [{ pressed: [], ticks: 1 }] };
      if (kind === "empty") {
        args.assertions = [];
      }
      const result = record(await run.invoke("playtest_native_game", args));
      expect(result).not.toHaveProperty("error");
      expect(result.assertion_results).toEqual([]);
    });
  }

  it.each(["2d", "3d"] as const)("handles a large valid assertion array before rejecting inputs in %s", async (dimension) => {
    const { run, gameId } = await fixture(dimension);
    const assertions = Array.from({ length: 200_000 }, () => ({ no_script_errors: true }));
    const result = record(await run.invoke("playtest_native_game", {
      game_id: gameId, inputs: "invalid", assertions
    }));
    expect(result).toEqual({ error: "inputs must be an array" });
  });

  it("keeps omitted 2D tolerance and tick-zero inspection", async () => {
    const { run, gameId } = await fixture("2d");
    const assertion = { entity_id: "player", near: { x: 0, y: 0 }, at_tick: 0 };
    const result = record(await run.invoke("playtest_native_game", {
      game_id: gameId, inputs: [{ pressed: ["right"], ticks: 1 }], assertions: [assertion]
    }));
    expect(result.assertion_results).toEqual([
      expect.objectContaining({ assertion, passed: true, observed: expect.objectContaining({ x: 0, y: 0 }) })
    ]);
  });

  it("keeps false grounded, XYZ/region and replay assertions as separate forms", async () => {
    const { run, gameId } = await fixture("3d");
    const result = record(await run.invoke("playtest_native_game", {
      game_id: gameId, inputs: [{ pressed: [], ticks: 1 }], restore_at_tick: 0,
      assertions: [
        { entity_id: "player", grounded: false, at_tick: 0 },
        { entity_id: "player", near: { x: 0, y: 1, z: 3, tolerance: 0 }, at_tick: 0 },
        { entity_id: "player", region: { min: { x: 0, y: 1, z: 3 }, max: { x: 0, y: 1, z: 3 } }, at_tick: 0 },
        { replay_matches: true }
      ]
    }));
    expect(result.assertion_results).toEqual(Array.from({ length: 4 }, () => expect.objectContaining({ passed: true })));
  });

  it.each(["2d", "3d"] as const)("keeps the inclusive event deadline in %s", async (dimension) => {
    const { run, gameId } = await fixture(dimension);
    const edited = record(await run.invoke("edit_native_game", {
      game_id: gameId,
      ops: [{ op: "add_behavior", entity_id: "player", behavior: { kind: "script", source: 'input => ({ state: null, commands: [{ kind: "emit", event: "boundary" }] })' } }]
    }));
    expect(edited).not.toHaveProperty("error");
    const result = record(await run.invoke("playtest_native_game", {
      game_id: gameId, inputs: [{ pressed: [], ticks: 1 }],
      assertions: [{ event: "boundary", before_tick: 1 }, { event: "boundary", before_tick: 0 }]
    }));
    expect(result.script_error).toBeNull();
    expect(result.events).toEqual(expect.arrayContaining([expect.objectContaining({ kind: "trigger", event: "boundary", tick: 1 })]));
    expect(result.assertion_results).toEqual([
      expect.objectContaining({ passed: true }), expect.objectContaining({ passed: false })
    ]);
  });

  it.each(["2d", "3d"] as const)("continues to evaluate separate single-form assertions in %s", async (dimension) => {
    const { run, gameId } = await fixture(dimension);
    const result = record(await run.invoke("playtest_native_game", {
      game_id: gameId,
      inputs: [{ pressed: [], ticks: 1 }],
      assertions: [{ no_script_errors: true }, { event: "THIS_EVENT_IS_NEVER_EMITTED" }]
    }));
    expect(result).not.toHaveProperty("error");
    expect(result.assertion_results).toEqual([
      expect.objectContaining({ passed: true }),
      expect.objectContaining({ passed: false })
    ]);
  });
});
