/**
 * The project navigator's one read.
 *
 * Each document table's bulk is a JSON column — a board's every shot, a
 * sketch's every layer, a workflow's whole graph — and the panel draws a name.
 * So these tests pin that the index carries identity and nothing else, that the
 * entity read filters on the marker in the database rather than handing back
 * every asset in the project, and that a kind which hits its cap says so.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { eq } from "drizzle-orm";
import { getDb, getRawDb, initTestDb } from "../src/db.js";
import { scripts as scriptsTable } from "../src/schema/scripts.js";
import { storyboards as storyboardsTable } from "../src/schema/storyboards.js";
import { Application } from "../src/application.js";
import { Asset } from "../src/asset.js";
import { listDocumentIndex } from "../src/document-index.js";
import { ImageDocument } from "../src/image-document.js";
import { JsScript } from "../src/js-script.js";
import { Script } from "../src/script.js";
import { Storyboard } from "../src/storyboard.js";
import { TimelineSequence } from "../src/timeline-sequence.js";
import { Workflow } from "../src/workflow.js";

const OWNER = "u1";
const OTHER = "u2";
const PROJECT = "p1";

const marker = (name: string) => ({
  nodetool_entity: {
    kind: "character",
    name,
    descriptor: "a lighthouse keeper, weathered coat"
  }
});

async function seedOneOfEach(): Promise<void> {
  await Workflow.create<Workflow>({
    user_id: OWNER,
    project_id: PROJECT,
    name: "Pipeline",
    graph: {
      nodes: [{ id: "n1", type: "nodetool.text.Concat" }],
      edges: []
    }
  });
  await Application.create<Application>({
    user_id: OWNER,
    project_id: PROJECT,
    name: "Mini app"
  });
  await ImageDocument.create<ImageDocument>({
    user_id: OWNER,
    project_id: PROJECT,
    name: "Sketch"
  });
  await Script.create<Script>({
    user_id: OWNER,
    project_id: PROJECT,
    name: "Voiceover"
  });
  await Storyboard.create<Storyboard>({
    user_id: OWNER,
    project_id: PROJECT,
    name: "Board"
  });
  await TimelineSequence.create<TimelineSequence>({
    user_id: OWNER,
    project_id: PROJECT,
    name: "Cut"
  });
  await JsScript.create<JsScript>({
    user_id: OWNER,
    project_id: PROJECT,
    name: "Normalize brief"
  });
  await Asset.create<Asset>({
    user_id: OWNER,
    project_id: PROJECT,
    name: "keeper.png",
    content_type: "image/png",
    metadata: marker("Keeper")
  });
}

describe("listDocumentIndex", () => {
  beforeEach(async () => {
    await initTestDb();
  });

  it("returns every kind of document in the project", async () => {
    await seedOneOfEach();

    const { documents, partial } = await listDocumentIndex(OWNER, PROJECT);

    expect(partial).toBe(false);
    expect(
      Object.fromEntries(documents.map((d) => [d.type, d.name]))
    ).toEqual({
      workflow: "Pipeline",
      application: "Mini app",
      sketch: "Sketch",
      script: "Voiceover",
      storyboard: "Board",
      timeline: "Cut",
      jsscript: "Normalize brief",
      entity: "Keeper"
    });
  });

  it("carries identity only — never a stored document or graph", async () => {
    await Storyboard.create<Storyboard>({
      user_id: OWNER,
      project_id: PROJECT,
      name: "Board",
      document: JSON.stringify({
        version: 1,
        shots: [],
        brief: "a brief no navigator should carry"
      })
    });
    await Workflow.create<Workflow>({
      user_id: OWNER,
      project_id: PROJECT,
      name: "Pipeline",
      graph: {
        nodes: [{ id: "a-node-no-navigator-should-carry", type: "x" }],
        edges: []
      }
    });

    const { documents } = await listDocumentIndex(OWNER, PROJECT);

    expect(documents.map((d) => d.type).sort()).toEqual([
      "storyboard",
      "workflow"
    ]);
    const serialized = JSON.stringify(documents);
    expect(serialized).not.toContain("a brief no navigator should carry");
    expect(serialized).not.toContain("a-node-no-navigator-should-carry");
    for (const document of documents) {
      expect(Object.keys(document).sort()).toEqual([
        "id",
        "name",
        "type",
        "updatedAt"
      ]);
    }
  });

  it("returns documents newest first, across kinds", async () => {
    // Two rows written in the same millisecond order by whichever kind the
    // gather happened to read first, which is not an ordering. The stamps are
    // set apart so the assertion is about recency rather than that accident.
    const older = await Storyboard.create<Storyboard>({
      user_id: OWNER,
      project_id: PROJECT,
      name: "Older board"
    });
    const newer = await Script.create<Script>({
      user_id: OWNER,
      project_id: PROJECT,
      name: "Newer script"
    });
    await getDb()
      .update(storyboardsTable)
      .set({ updated_at: "2024-01-01T00:00:00.000Z" })
      .where(eq(storyboardsTable.id, older.id));
    await getDb()
      .update(scriptsTable)
      .set({ updated_at: "2024-06-01T00:00:00.000Z" })
      .where(eq(scriptsTable.id, newer.id));

    const { documents } = await listDocumentIndex(OWNER, PROJECT);

    expect(documents.map((d) => d.name)).toEqual([
      "Newer script",
      "Older board"
    ]);
  });

  it("reads only the caller's own documents, in the named project", async () => {
    await Script.create<Script>({
      user_id: OWNER,
      project_id: PROJECT,
      name: "Mine"
    });
    await Script.create<Script>({
      user_id: OWNER,
      project_id: "p2",
      name: "Other project"
    });
    await Script.create<Script>({
      user_id: OTHER,
      project_id: PROJECT,
      name: "Theirs"
    });

    const { documents } = await listDocumentIndex(OWNER, PROJECT);

    expect(documents.map((d) => d.name)).toEqual(["Mine"]);
  });

  it("leaves out workflows a listing does not show", async () => {
    await Workflow.create<Workflow>({
      user_id: OWNER,
      project_id: PROJECT,
      name: "Listed",
      run_mode: "workflow"
    });
    await Workflow.create<Workflow>({
      user_id: OWNER,
      project_id: PROJECT,
      name: "Hidden",
      run_mode: "app"
    });

    const { documents } = await listDocumentIndex(OWNER, PROJECT);

    expect(documents.map((d) => d.name)).toEqual(["Listed"]);
  });

  it("returns only assets carrying the entity marker, with the entity itself", async () => {
    await Asset.create<Asset>({
      user_id: OWNER,
      project_id: PROJECT,
      name: "keeper.png",
      content_type: "image/png",
      metadata: marker("Keeper")
    });
    await Asset.create<Asset>({
      user_id: OWNER,
      project_id: PROJECT,
      name: "render.png",
      content_type: "image/png",
      metadata: { width: 512 }
    });
    // The marker key appears in the metadata but carries no valid marker: the
    // database predicate matches it, the marker read drops it.
    await Asset.create<Asset>({
      user_id: OWNER,
      project_id: PROJECT,
      name: "note.png",
      content_type: "image/png",
      metadata: { note: "nodetool_entity was never written here" }
    });

    const { documents } = await listDocumentIndex(OWNER, PROJECT);

    expect(documents).toHaveLength(1);
    expect(documents[0]?.entity).toMatchObject({
      type: "entity",
      kind: "character",
      name: "Keeper",
      descriptor: "a lighthouse keeper, weathered coat",
      project_id: PROJECT
    });
    expect(documents[0]?.entity?.reference_images?.[0]?.asset_id).toBe(
      documents[0]?.id
    );
  });

  it("keeps the kinds that answered when one kind's read fails", async () => {
    await seedOneOfEach();
    // What a deployment whose schema lags the shipped code does to one kind.
    getRawDb().exec("DROP TABLE js_scripts");

    const { documents, partial } = await listDocumentIndex(OWNER, PROJECT);

    expect(partial).toBe(true);
    expect(documents.map((d) => d.type).sort()).toEqual([
      "application",
      "entity",
      "script",
      "sketch",
      "storyboard",
      "timeline",
      "workflow"
    ]);
  });

  it("fails with the database's own reason when no kind can be read", async () => {
    await seedOneOfEach();
    for (const table of [
      "nodetool_workflows",
      "applications",
      "image_documents",
      "scripts",
      "storyboards",
      "timeline_sequences",
      "js_scripts",
      "nodetool_assets"
    ]) {
      getRawDb().exec(`DROP TABLE ${table}`);
    }

    // The reason the database gave, not just the SQL that carried it: a
    // driver error arrives wrapped, with the reason on `cause`.
    await expect(listDocumentIndex(OWNER, PROJECT)).rejects.toThrow(
      /The document index could not be read: .*no such table/
    );
  });

  it("reports partial when a kind fills its cap", async () => {
    await Script.create<Script>({
      user_id: OWNER,
      project_id: PROJECT,
      name: "One"
    });
    await Script.create<Script>({
      user_id: OWNER,
      project_id: PROJECT,
      name: "Two"
    });

    const capped = await listDocumentIndex(OWNER, PROJECT, 1);

    expect(capped.partial).toBe(true);
    expect(capped.documents).toHaveLength(1);
    expect((await listDocumentIndex(OWNER, PROJECT, 2)).partial).toBe(false);
  });
});
