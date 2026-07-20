/**
 * Tests for the Script model.
 *
 * Covers: create with defaults, JSON round-trip, list-by-user/project,
 * countScriptLines, and the compare-and-swap update (applies on a matching
 * token, returns null on a stale one).
 */

import { describe, it, expect, beforeEach } from "vitest";
import { initTestDb } from "../src/db.js";
import {
  Script,
  emptyScriptDocument,
  countScriptLines,
  type ScriptDocument
} from "../src/script.js";

function setup() {
  initTestDb();
}

function makeDocument(overrides: Partial<ScriptDocument> = {}): ScriptDocument {
  return { ...emptyScriptDocument(), ...overrides };
}

async function createScript(
  userId = "u1",
  projectId = "p1",
  name = "My Script",
  doc: ScriptDocument = makeDocument()
): Promise<Script> {
  const script = new Script({
    user_id: userId,
    project_id: projectId,
    name,
    document: JSON.stringify(doc)
  });
  await script.save();
  return script;
}

describe("Script model", () => {
  beforeEach(setup);

  it("creates with defaults and round-trips the document", async () => {
    const doc = makeDocument({
      cast: [{ id: "s1", name: "Narrator", voice: null }],
      sections: [
        {
          id: "sec1",
          title: "Intro",
          lines: [{ id: "l1", text: "Hello", takes: [] }]
        }
      ]
    });
    const created = await createScript("u1", "p1", "Doc", doc);
    const loaded = await Script.findById(created.id);
    expect(loaded).not.toBeNull();
    const response = loaded!.toResponse();
    expect(response.name).toBe("Doc");
    expect(response.document.cast).toHaveLength(1);
    expect(response.document.sections[0].lines[0].text).toBe("Hello");
  });

  it("counts lines across sections", () => {
    const doc = makeDocument({
      sections: [
        { id: "a", lines: [{ id: "1", text: "x", takes: [] }] },
        {
          id: "b",
          lines: [
            { id: "2", text: "y", takes: [] },
            { id: "3", text: "z", takes: [] }
          ]
        }
      ]
    });
    expect(countScriptLines(doc)).toBe(3);
  });

  it("lists by user and by project", async () => {
    await createScript("u1", "p1", "A");
    await createScript("u1", "p2", "B");
    await createScript("u2", "p1", "C");

    const byUser = await Script.listByUser("u1");
    expect(byUser).toHaveLength(2);

    const byProject = await Script.listByProject("p1", "u1");
    expect(byProject).toHaveLength(1);
    expect(byProject[0].name).toBe("A");
  });

  it("applies a CAS update on a matching token", async () => {
    const created = await createScript("u1", "p1", "Old");
    const updated = await Script.updateFieldsIfUnchanged(
      created.id,
      created.updated_at,
      { name: "New" }
    );
    expect(updated).not.toBeNull();
    expect(updated!.name).toBe("New");
    expect(updated!.updated_at).not.toBe(created.updated_at);
  });

  it("rejects a CAS update on a stale token", async () => {
    const created = await createScript("u1", "p1", "Old");
    // First write advances the token.
    await Script.updateFieldsIfUnchanged(created.id, created.updated_at, {
      name: "First"
    });
    // Second write with the original (now stale) token must fail.
    const conflict = await Script.updateFieldsIfUnchanged(
      created.id,
      created.updated_at,
      { name: "Second" }
    );
    expect(conflict).toBeNull();
  });
});
