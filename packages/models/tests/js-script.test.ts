/**
 * Tests for the JsScript and JsScriptVersion models.
 *
 * Covers: defaults and JSON round-trip, list-by-user/project, the
 * compare-and-swap update (applies on a matching token, returns null on a
 * stale one), the document check `beforeSave` runs, and version snapshot /
 * lookup / prune / bulk delete.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  emptyJsScriptDocument,
  type JsScriptDocument
} from "@nodetool-ai/protocol/api-schemas/js-scripts.js";
import { ModelObserver } from "../src/base-model.js";
import { initTestDb } from "../src/db.js";
import { JsScript } from "../src/js-script.js";
import { JsScriptVersion } from "../src/js-script-version.js";

function makeDocument(overrides: Partial<JsScriptDocument> = {}): JsScriptDocument {
  return { ...emptyJsScriptDocument(), ...overrides };
}

async function createScript(
  overrides: Record<string, unknown> = {},
  document: JsScriptDocument = makeDocument()
): Promise<JsScript> {
  const script = new JsScript({
    user_id: "u1",
    project_id: "p1",
    name: "My script",
    document: JSON.stringify(document),
    ...overrides
  });
  await script.save();
  return script;
}

describe("JsScript model", () => {
  beforeEach(() => initTestDb());
  afterEach(() => ModelObserver.clear());

  it("creates with defaults and round-trips the document", async () => {
    const document = makeDocument({
      description: "reshapes a bag",
      code: "await output('out', inputs.a);",
      inputs: [{ name: "a", type: "str" }],
      outputs: [{ name: "out", type: "str" }],
      tests: [{ name: "echo", inputs: { a: "x" }, expect: { out: "x" } }]
    });
    const created = await createScript({}, document);
    const loaded = await JsScript.findById(created.id);

    expect(loaded).not.toBeNull();
    const response = loaded!.toResponse();
    expect(response.name).toBe("My script");
    expect(response.projectId).toBe("p1");
    expect(response.document).toEqual(document);
  });

  it("defaults an empty document when none is given", async () => {
    const script = new JsScript({ user_id: "u1" });
    await script.save();
    expect(script.toDocument()).toEqual(emptyJsScriptDocument());
    expect(script.project_id).toBe("default");
  });

  it("lists by user and by project, newest first", async () => {
    const first = await createScript({ name: "one" });
    const second = await createScript({ name: "two" });
    await createScript({ user_id: "u2", name: "other user" });
    await createScript({ project_id: "p2", name: "other project" });

    const byUser = await JsScript.listByUser("u1");
    expect(byUser.map((s) => s.name)).toContain("one");
    expect(byUser.map((s) => s.name)).not.toContain("other user");
    expect(byUser[0]!.updated_at >= byUser[1]!.updated_at).toBe(true);

    const byProject = await JsScript.listByProject("p1", "u1");
    expect(byProject.map((s) => s.id).sort()).toEqual(
      [first.id, second.id].sort()
    );
  });

  it("refuses to save a document whose ports collide", async () => {
    const script = new JsScript({
      user_id: "u1",
      document: JSON.stringify(
        makeDocument({
          inputs: [
            { name: "a", type: "str" },
            { name: "a", type: "int" }
          ]
        })
      )
    });
    await expect(script.save()).rejects.toThrow(/duplicate input port/);
  });

  it("refuses a CAS write whose document names an undeclared test input", async () => {
    const script = await createScript();
    await expect(
      JsScript.updateFieldsIfUnchanged(script.id, script.updated_at, {
        document: JSON.stringify(
          makeDocument({ tests: [{ name: "c", inputs: { nope: 1 } }] })
        )
      })
    ).rejects.toThrow(/undeclared input "nope"/);
  });

  describe("updateFieldsIfUnchanged", () => {
    it("applies on a matching token and moves updated_at forward", async () => {
      const script = await createScript();
      const updated = await JsScript.updateFieldsIfUnchanged(
        script.id,
        script.updated_at,
        { name: "renamed" }
      );
      expect(updated).not.toBeNull();
      expect(updated!.name).toBe("renamed");
      expect(updated!.updated_at > script.updated_at).toBe(true);
    });

    it("returns null for the loser of two concurrent writes", async () => {
      const script = await createScript();
      const staleToken = script.updated_at;

      const first = await JsScript.updateFieldsIfUnchanged(
        script.id,
        staleToken,
        { name: "first writer" }
      );
      expect(first).not.toBeNull();

      const second = await JsScript.updateFieldsIfUnchanged(
        script.id,
        staleToken,
        { name: "second writer" }
      );
      expect(second).toBeNull();

      const loaded = await JsScript.findById(script.id);
      expect(loaded!.name).toBe("first writer");
    });
  });
});

describe("JsScriptVersion model", () => {
  beforeEach(() => initTestDb());
  afterEach(() => ModelObserver.clear());

  it("snapshots a script and numbers versions monotonically", async () => {
    const script = await createScript();
    const v1 = await JsScriptVersion.snapshot(script, { saveType: "manual" });
    const v2 = await JsScriptVersion.snapshot(script, {
      saveType: "restore",
      name: "before restore"
    });

    expect(v1.version).toBe(1);
    expect(v2.version).toBe(2);
    expect(v2.name).toBe("before restore");
    expect(v2.user_id).toBe(script.user_id);
    expect(v2.document).toBe(script.document);

    const listed = await JsScriptVersion.listForScript(script.id);
    expect(listed.map((v) => v.version)).toEqual([2, 1]);

    const filtered = await JsScriptVersion.listForScript(script.id, {
      saveType: "manual"
    });
    expect(filtered.map((v) => v.version)).toEqual([1]);

    const found = await JsScriptVersion.findByVersion(script.id, 1);
    expect(found!.id).toBe(v1.id);
  });

  it("prunes the oldest autosaves and keeps manual snapshots", async () => {
    const script = await createScript();
    await JsScriptVersion.snapshot(script, { saveType: "manual" });
    for (let i = 0; i < 3; i++) {
      await JsScriptVersion.snapshot(script, { saveType: "autosave" });
    }

    await JsScriptVersion.pruneAutosaves(script.id, 1);
    const remaining = await JsScriptVersion.listForScript(script.id);
    expect(remaining.map((v) => v.save_type).sort()).toEqual([
      "autosave",
      "manual"
    ]);
  });

  it("deletes every version of a script", async () => {
    const script = await createScript();
    await JsScriptVersion.snapshot(script, { saveType: "manual" });
    await JsScriptVersion.deleteForScript(script.id);
    expect(await JsScriptVersion.listForScript(script.id)).toEqual([]);
  });
});
