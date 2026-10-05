import { afterEach, describe, expect, it } from "vitest";
import { createEmptyDocument } from "@nodetool-ai/app-runtime";
import { emptyJsScriptDocument } from "@nodetool-ai/protocol/api-schemas/js-scripts.js";
import { closeDb, executeRaw, initTestDb, pingDb } from "../src/db.js";
import { ModelChangeEvent, ModelObserver } from "../src/base-model.js";
import { Asset } from "../src/asset.js";
import {
  Application,
  listApplicationVersions,
  publishApplication
} from "../src/application.js";
import { GenerationAttachment, GenerationAttempt, GenerationOutput } from "../src/durable-generation.js";
import { commitFinishedStoryboard } from "../src/finish-storyboard.js";
import { ImageDocument } from "../src/image-document.js";
import { ImageDocumentVersion } from "../src/image-document-version.js";
import { JsScript } from "../src/js-script.js";
import { JsScriptVersion } from "../src/js-script-version.js";
import { Message } from "../src/message.js";
import { Prediction } from "../src/prediction.js";
import { Project } from "../src/project.js";
import { Script, emptyScriptDocument } from "../src/script.js";
import { Storyboard, emptyStoryboardDocument } from "../src/storyboard.js";
import { TimelineSequence, type TimelineDocument } from "../src/timeline-sequence.js";
import { TimelineSequenceVersion } from "../src/timeline-sequence-version.js";
import { Workflow } from "../src/workflow.js";
import { Workspace } from "../src/workspace.js";
import { initPgliteTestDb } from "./helpers/pglite-test-db.js";

const OWNER = "dialect-owner";
const TIMELINE_DOCUMENT: TimelineDocument = { tracks: [], clips: [], markers: [] };
// Each fixture starts a fresh PGlite engine and runs the production migrations.
const DIALECT_TEST_TIMEOUT_MS = 60_000;

/** Every behavior fixture executes unchanged on both database engines. */
async function onBothDialects<T>(fixture: () => Promise<T>): Promise<T> {
  const results: T[] = [];
  for (const dialect of ["sqlite", "postgres"] as const) {
    await closeDb();
    ModelObserver.clear();
    if (dialect === "sqlite") {
      initTestDb({ strictProjects: true });
    } else {
      await initPgliteTestDb();
    }
    results.push(await fixture());
  }
  expect(results[1]).toEqual(results[0]);
  return results[0]!;
}

afterEach(async () => {
  ModelObserver.clear();
  await closeDb();
});

describe("model execution on SQLite and PostgreSQL", () => {
  it("executes raw queries and Personal migration on the active engine", async () => {
    await onBothDialects(async () => {
      const asset = await Asset.create<Asset>({ id: "raw-query-asset", user_id: OWNER });
      expect(await executeRaw("SELECT id FROM nodetool_assets WHERE id = 'raw-query-asset'"))
        .toEqual({ rows: [{ id: "raw-query-asset" }] });
      await pingDb();
      const migration = await Project.migrateToPersonal(OWNER);
      const repeated = await Project.migrateToPersonal(OWNER);
      const projectId = (await Asset.get<Asset>(asset.id))?.project_id;
      expect(projectId).toBe(`personal:${OWNER}`);
      expect(migration.migrated).toBe(1);
      expect(migration.dangling).toBe(0);
      expect(repeated.migrated).toBe(0);
      await closeDb();
      await expect(pingDb()).rejects.toThrow("Database not initialized");
      await expect(executeRaw("SELECT 1")).rejects.toThrow("database not initialized");
      initTestDb({ strictProjects: true });
      await pingDb();
      expect(await executeRaw("SELECT id FROM nodetool_assets")).toEqual({ rows: [] });
      return { projectId, migrated: migration.migrated, dangling: migration.dangling, repeated: repeated.migrated };
    });
  }, DIALECT_TEST_TIMEOUT_MS);

  it("round-trips every document table and application capabilities without double encoding", async () => {
    await onBothDialects(async () => {
      const documentBytes: Record<string, string | undefined> = {};
      const expected: Record<string, string> = {};
      const timelineText = JSON.stringify(TIMELINE_DOCUMENT);
      const timeline = await TimelineSequence.create<TimelineSequence>({
        user_id: OWNER, project_id: "default", name: "Timeline", document: timelineText
      });
      documentBytes["timeline_sequences.document"] = (await TimelineSequence.get<TimelineSequence>(timeline.id))?.document;
      expected["timeline_sequences.document"] = timelineText;
      const timelineVersion = await TimelineSequenceVersion.create<TimelineSequenceVersion>({
        timeline_id: timeline.id, user_id: OWNER, document: timelineText
      });
      documentBytes["timeline_sequence_versions.document"] = (await TimelineSequenceVersion.get<TimelineSequenceVersion>(timelineVersion.id))?.document;
      expected["timeline_sequence_versions.document"] = timelineText;

      const sketchText = JSON.stringify({ sketch: { version: 3, layers: [] }, layerBindings: [] });
      const sketch = await ImageDocument.create<ImageDocument>({
        user_id: OWNER, project_id: "default", name: "Sketch", document: sketchText
      });
      documentBytes["image_documents.document"] = (await ImageDocument.get<ImageDocument>(sketch.id))?.document;
      expected["image_documents.document"] = sketchText;
      const sketchVersion = await ImageDocumentVersion.create<ImageDocumentVersion>({
        image_document_id: sketch.id, user_id: OWNER, document: sketchText
      });
      documentBytes["image_document_versions.document"] = (await ImageDocumentVersion.get<ImageDocumentVersion>(sketchVersion.id))?.document;
      expected["image_document_versions.document"] = sketchText;

      const boardText = JSON.stringify(emptyStoryboardDocument());
      const board = await Storyboard.create<Storyboard>({ user_id: OWNER, document: boardText });
      documentBytes["storyboards.document"] = (await Storyboard.get<Storyboard>(board.id))?.document;
      expected["storyboards.document"] = boardText;

      const appDocument = createEmptyDocument("Dialect app");
      const appText = JSON.stringify(appDocument);
      const app = await Application.create<Application>({ user_id: OWNER, document: appText });
      documentBytes["applications.document"] = (await Application.get<Application>(app.id))?.document;
      expected["applications.document"] = appText;
      // Application versions have public functions rather than a DBModel class.
      await publishApplication(app);
      const [release] = await listApplicationVersions(app.id, 100, OWNER);
      documentBytes["application_versions.document"] = JSON.stringify(release?.document);
      documentBytes["application_versions.capabilities"] = JSON.stringify(release?.capabilities);
      expected["application_versions.document"] = appText;
      expected["application_versions.capabilities"] = JSON.stringify({ workflows: [], resources: [] });

      const scriptText = JSON.stringify(emptyScriptDocument());
      const script = await Script.create<Script>({ user_id: OWNER, document: scriptText });
      documentBytes["scripts.document"] = (await Script.get<Script>(script.id))?.document;
      expected["scripts.document"] = scriptText;
      const jsText = JSON.stringify(emptyJsScriptDocument());
      const js = await JsScript.create<JsScript>({ user_id: OWNER, document: jsText });
      documentBytes["js_scripts.document"] = (await JsScript.get<JsScript>(js.id))?.document;
      expected["js_scripts.document"] = jsText;
      const jsVersion = await JsScriptVersion.create<JsScriptVersion>({
        js_script_id: js.id, user_id: OWNER, document: jsText
      });
      documentBytes["js_script_versions.document"] = (await JsScriptVersion.get<JsScriptVersion>(jsVersion.id))?.document;
      expected["js_script_versions.document"] = jsText;
      expect(Object.keys(documentBytes)).toHaveLength(11);
      expect(documentBytes).toEqual(expected);
      return documentBytes;
    });
  }, DIALECT_TEST_TIMEOUT_MS);

  it("round-trips true and false through each integer boolean column", async () => {
    await onBothDialects(async () => {
      const results: Array<Record<string, boolean | null | undefined>> = [];
      const prediction = await Prediction.create<Prediction>({ user_id: OWNER });
      const attempt = await GenerationAttempt.create<GenerationAttempt>({ generation_id: prediction.id, provider: "test" });
      const output = await GenerationOutput.create<GenerationOutput>({
        generation_id: prediction.id, attempt_id: attempt.id, output_key: "image"
      });
      for (const value of [true, false]) {
        const workflow = await Workflow.create<Workflow>({ user_id: OWNER, receive_clipboard: value });
        const message = await Message.create<Message>({
          user_id: OWNER, thread_id: "test-thread", content: "Message string", agent_mode: value, help_mode: value
        });
        const workspace = await Workspace.create<Workspace>({
          user_id: OWNER, name: "Workspace", path: "workspaces/test", is_default: value
        });
        const attachment = await GenerationAttachment.create<GenerationAttachment>({
          generation_id: prediction.id, output_id: output.id, target_type: "asset",
          target_id: value ? "selected-asset" : "unselected-asset", selected: value
        });
        const loadedMessage = await Message.get<Message>(message.id);
        expect(loadedMessage?.content).toBe("Message string");
        const row = {
          receive_clipboard: (await Workflow.get<Workflow>(workflow.id))?.receive_clipboard,
          agent_mode: loadedMessage?.agent_mode,
          help_mode: loadedMessage?.help_mode,
          is_default: (await Workspace.get<Workspace>(workspace.id))?.is_default,
          selected: (await GenerationAttachment.get<GenerationAttachment>(attachment.id))?.selected
        };
        expect(row).toEqual({ receive_clipboard: value, agent_mode: value, help_mode: value, is_default: value, selected: value });
        results.push(row);
      }
      return results;
    });
  }, DIALECT_TEST_TIMEOUT_MS);

  it("upserts an existing row through save and notifies once per successful write", async () => {
    await onBothDialects(async () => {
      const events: ModelChangeEvent[] = [];
      ModelObserver.subscribe((_, event) => events.push(event), "Asset");
      const asset = await Asset.create<Asset>({ user_id: OWNER, name: "Before", metadata: { value: 1 } });
      asset.name = "After";
      asset.metadata = { value: 2 };
      await asset.save();
      const loaded = await Asset.get<Asset>(asset.id);
      expect(events).toEqual([ModelChangeEvent.CREATED, ModelChangeEvent.UPDATED]);
      expect((await Asset.findMany(OWNER, [asset.id]))).toHaveLength(1);
      return { name: loaded?.name, metadata: loaded?.metadata, events };
    });
  }, DIALECT_TEST_TIMEOUT_MS);

  it("rejects missing, foreign and deleted projects without inserting or notifying", async () => {
    await onBothDialects(async () => {
      await Project.create<Project>({ id: "foreign-project", user_id: "another-owner" });
      await Project.create<Project>({ id: "deleted-project", user_id: OWNER, deleted_at: "2026-01-01T00:00:00.000Z" });
      const events: ModelChangeEvent[] = [];
      ModelObserver.subscribe((_, event) => events.push(event));
      const errors: string[] = [];
      for (const [projectId, error] of [
        ["missing-project", "Project not found"],
        ["foreign-project", "Project not found"],
        ["deleted-project", "Project has been deleted"]
      ]) {
        await expect(Asset.create<Asset>({ id: projectId, user_id: OWNER, project_id: projectId })).rejects.toThrow(error);
        expect(await Asset.get<Asset>(projectId)).toBeNull();
        errors.push(error);
      }
      expect(events).toEqual([]);
      return { errors, events };
    });
  }, DIALECT_TEST_TIMEOUT_MS);

  it("resolves one short id match and rejects two matches", async () => {
    await onBothDialects(async () => {
      const prefix = "012345abcdef";
      const firstId = `${prefix}${"0".repeat(20)}`;
      const secondId = `${prefix}${"1".repeat(20)}`;
      await Asset.create<Asset>({ id: firstId, user_id: OWNER });
      const single = await Asset.get<Asset>(prefix);
      expect(single?.id).toBe(firstId);
      await Asset.create<Asset>({ id: secondId, user_id: OWNER });
      await expect(Asset.get<Asset>(prefix)).rejects.toThrow(`short id "${prefix}" matches more than one row; use the full id`);
      expect(await Asset.get<Asset>("012345abcde")).toBeNull();
      return { single: single?.id, full: (await Asset.get<Asset>(secondId))?.id };
    });
  }, DIALECT_TEST_TIMEOUT_MS);

  it("uses returning for metadata CAS and notifies only after the matching update", async () => {
    await onBothDialects(async () => {
      const asset = await Asset.create<Asset>({ user_id: OWNER, metadata: { version: 1 } });
      const events: ModelChangeEvent[] = [];
      ModelObserver.subscribe((_, event) => events.push(event), "Asset");
      asset.metadata = { version: 2 };
      expect(await asset.saveIfMetadataMatches({ version: 0 })).toBe(false);
      expect((await Asset.get<Asset>(asset.id))?.metadata).toEqual({ version: 1 });
      expect(events).toEqual([]);
      expect(await asset.saveIfMetadataMatches({ version: 1 })).toBe(true);
      expect(await asset.saveIfMetadataMatches({ version: 1 })).toBe(false);
      const metadata = (await Asset.get<Asset>(asset.id))?.metadata;
      expect(metadata).toEqual({ version: 2 });
      expect(events).toEqual([ModelChangeEvent.UPDATED]);
      return { metadata, events };
    });
  }, DIALECT_TEST_TIMEOUT_MS);

  it("finishes a storyboard and updates its timeline using serialized document text", async () => {
    await onBothDialects(async () => {
      const board = await Storyboard.create<Storyboard>({ user_id: OWNER });
      const events: Array<[string, ModelChangeEvent]> = [];
      ModelObserver.subscribe((model, event) => events.push([model.constructor.name, event]));
      const firstDocument = { ...TIMELINE_DOCUMENT, scriptEnabled: false };
      const first = await commitFinishedStoryboard({ board, document: firstDocument, width: 1280, height: 720, durationMs: 0 });
      expect(first.timeline.document).toBe(JSON.stringify(firstDocument));
      const secondDocument = { ...TIMELINE_DOCUMENT, scriptEnabled: true };
      const second = await commitFinishedStoryboard({
        board: first.board, timeline: first.timeline, document: secondDocument, width: 1280, height: 720, durationMs: 0
      });
      expect(second.timeline.document).toBe(JSON.stringify(secondDocument));
      expect(second.timeline.toDocument()).toEqual(secondDocument);
      expect(second.board.timeline_id).toBe(second.timeline.id);
      expect(events).toEqual([
        ["Storyboard", ModelChangeEvent.UPDATED], ["TimelineSequence", ModelChangeEvent.CREATED],
        ["Storyboard", ModelChangeEvent.UPDATED], ["TimelineSequence", ModelChangeEvent.UPDATED]
      ]);
      return { document: second.timeline.document, width: second.timeline.width, height: second.timeline.height, events };
    });
  }, DIALECT_TEST_TIMEOUT_MS);
});
