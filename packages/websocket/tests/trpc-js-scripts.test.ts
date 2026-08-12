/**
 * jsScripts router — CRUD, CAS, and the document-version sub-router.
 *
 * Real DB, real models: this exercises the network-reachable endpoints, their
 * user scoping, and the conflict path a concurrent editor hits.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  emptyJsScriptDocument,
  type JsScriptDocument
} from "@nodetool-ai/protocol/api-schemas/js-scripts.js";
import { initTestDb, JsScript, ModelObserver } from "@nodetool-ai/models";
import { appRouter } from "../src/trpc/router.js";
import { createCallerFactory } from "../src/trpc/index.js";
import type { Context } from "../src/trpc/context.js";

const createCaller = createCallerFactory(appRouter);

function makeCtx(userId: string): Context {
  return {
    userId,
    registry: {} as never,
    apiOptions: { metadataRoots: [], registry: {} as never } as never,
    pythonBridge: {} as never,
    getPythonBridgeReady: () => false
  } as Context;
}

function makeDocument(
  overrides: Partial<JsScriptDocument> = {}
): JsScriptDocument {
  return { ...emptyJsScriptDocument(), ...overrides };
}

const caller = () => createCaller(makeCtx("user-1"));

async function createScript(name = "Greeter") {
  return caller().jsScripts.create({
    name,
    projectId: "p1",
    document: makeDocument({
      description: "greets",
      code: "await output('greeting', `hi ${inputs.who}`);",
      inputs: [{ name: "who", type: "str" }],
      outputs: [{ name: "greeting", type: "str" }]
    })
  });
}

describe("jsScripts router", () => {
  beforeEach(() => initTestDb());
  afterEach(() => ModelObserver.clear());

  it("creates, reads, lists, updates and deletes", async () => {
    const created = await createScript();
    expect(created.document.description).toBe("greets");

    const fetched = await caller().jsScripts.get({ id: created.id });
    expect(fetched.id).toBe(created.id);

    const listed = await caller().jsScripts.list({});
    expect(listed).toHaveLength(1);
    expect(listed[0]!.description).toBe("greets");
    expect(listed[0]!.inputs).toEqual([{ name: "who", type: "str" }]);

    const renamed = await caller().jsScripts.update({
      id: created.id,
      name: "Greeter v2"
    });
    expect(renamed.name).toBe("Greeter v2");

    await caller().jsScripts.delete({ id: created.id });
    await expect(caller().jsScripts.get({ id: created.id })).rejects.toThrow(
      /not found/i
    );
  });

  it("returns the existing row for a repeated client-minted id", async () => {
    const first = await caller().jsScripts.create({
      id: "js-1",
      name: "One",
      projectId: "p1"
    });
    const second = await caller().jsScripts.create({
      id: "js-1",
      name: "Two",
      projectId: "p1"
    });
    expect(second.id).toBe(first.id);
    expect(second.name).toBe("One");
  });

  it("hides another user's script", async () => {
    const created = await createScript();
    const other = createCaller(makeCtx("user-2"));
    await expect(other.jsScripts.get({ id: created.id })).rejects.toThrow(
      /not found/i
    );
    expect(await other.jsScripts.list({})).toEqual([]);
  });

  it("refuses an update whose baseUpdatedAt is stale", async () => {
    const created = await createScript();
    await caller().jsScripts.update({
      id: created.id,
      name: "moved on"
    });

    await expect(
      caller().jsScripts.update({
        id: created.id,
        baseUpdatedAt: created.updatedAt,
        name: "clobber"
      })
    ).rejects.toThrow(/optimistic concurrency conflict/);

    const loaded = await JsScript.findById(created.id);
    expect(loaded!.name).toBe("moved on");
  });

  it("refuses a document that fails the document check", async () => {
    const created = await createScript();
    await expect(
      caller().jsScripts.update({
        id: created.id,
        document: makeDocument({
          inputs: [{ name: "a", type: "str" }],
          tests: [{ name: "c", inputs: { undeclared: 1 } }]
        })
      })
    ).rejects.toThrow(/undeclared input "undeclared"/);
  });

  describe("documentVersions", () => {
    it("snapshots, reads and deletes a version", async () => {
      const created = await createScript();
      const snapshot = await caller().jsScripts.documentVersions.create({
        id: created.id,
        name: "v1"
      });
      expect(snapshot.version).toBe(1);
      expect(snapshot.saveType).toBe("manual");

      const listed = await caller().jsScripts.documentVersions.list({
        id: created.id
      });
      expect(listed).toHaveLength(1);

      const full = await caller().jsScripts.documentVersions.get({
        id: created.id,
        version: 1
      });
      expect((full.document as JsScriptDocument).description).toBe("greets");

      await caller().jsScripts.documentVersions.delete({
        id: created.id,
        version: 1
      });
      expect(
        await caller().jsScripts.documentVersions.list({ id: created.id })
      ).toEqual([]);
    });

    it("snapshots the pre-restore state before overwriting", async () => {
      const created = await createScript();
      await caller().jsScripts.documentVersions.create({
        id: created.id,
        name: "original"
      });

      await caller().jsScripts.update({
        id: created.id,
        document: makeDocument({ description: "edited" })
      });

      const restored = await caller().jsScripts.documentVersions.restore({
        id: created.id,
        version: 1
      });
      expect(restored.script.document.description).toBe("greets");

      const versions = await caller().jsScripts.documentVersions.list({
        id: created.id
      });
      // v1 manual (the original) plus v2, the snapshot of what the restore
      // overwrote — the edit is recoverable.
      expect(versions.map((v) => [v.version, v.saveType])).toEqual([
        [2, "restore"],
        [1, "manual"]
      ]);
      const undo = await caller().jsScripts.documentVersions.get({
        id: created.id,
        version: 2
      });
      expect((undo.document as JsScriptDocument).description).toBe("edited");
    });

    it("reports the re-validation of the document it restored", async () => {
      const created = await createScript();
      await caller().jsScripts.documentVersions.create({ id: created.id });
      const restored = await caller().jsScripts.documentVersions.restore({
        id: created.id,
        version: 1
      });
      // The shipped fixture declares no test cases, which is the one warning
      // a valid document can carry.
      expect(restored.issues).toEqual([
        {
          severity: "warning",
          code: "js_script_no_tests",
          message: "the script has no saved test cases"
        }
      ]);
    });

    it("404s on a version that does not exist", async () => {
      const created = await createScript();
      await expect(
        caller().jsScripts.documentVersions.get({ id: created.id, version: 9 })
      ).rejects.toThrow(/not found/i);
    });
  });
});
