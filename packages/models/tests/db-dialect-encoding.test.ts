import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  DBModel,
  ModelObserver,
  createTimeOrderedUuid,
} from "../src/base-model.js";
import { closeDb, initPostgresDb } from "../src/db.js";
import { Workflow } from "../src/workflow.js";
import { Message } from "../src/message.js";
import { Workspace } from "../src/workspace.js";
import { GenerationAttachment } from "../src/durable-generation.js";
import { TimelineSequence } from "../src/timeline-sequence.js";
import { TimelineSequenceVersion } from "../src/timeline-sequence-version.js";
import { ImageDocument } from "../src/image-document.js";
import { ImageDocumentVersion } from "../src/image-document-version.js";
import { Storyboard } from "../src/storyboard.js";
import { Application } from "../src/application.js";
import { Script } from "../src/script.js";
import { JsScript } from "../src/js-script.js";
import { JsScriptVersion } from "../src/js-script-version.js";
import { applicationVersions } from "../src/schema/applications.js";

const driver = vi.hoisted(() => {
  const state = { queries: [] as Array<{ sql: string; params: unknown[] }> };
  const client = {
    options: { parsers: {}, serializers: {} },
    unsafe(sql: string, params: unknown[] = []) {
      state.queries.push({ sql, params });
      return Object.assign(Promise.resolve([]), { values: async () => [] });
    },
    async begin<T>(
      callback: (transaction: typeof client) => Promise<T>,
    ): Promise<T> {
      return callback(client);
    },
    async end() {},
  };
  return { client, state };
});
vi.mock("postgres", () => ({ default: () => driver.client }));

// Application releases have no DBModel class. This fixture isolates their
// two serialized columns at the same persistence boundary as the models.
class ApplicationVersionFixture extends DBModel {
  static override table = applicationVersions;
  declare document: string;
  declare capabilities: string;
}

function insertParameter(table: string, column: string): unknown {
  const queries = driver.state.queries.filter((query) =>
    query.sql.startsWith(`insert into "${table}" `),
  );
  expect(queries, `${table} insert`).toHaveLength(1);
  const query = queries[0];
  const match = query.sql.match(
    /^insert into "[^"]+" \(([^)]+)\) values \(([^)]+)\)/,
  );
  if (!match) {
    throw new Error(`Cannot inspect insert parameters: ${query.sql}`);
  }
  const columns = Array.from(
    match[1].matchAll(/"([^"]+)"/g),
    (entry) => entry[1],
  );
  const index = columns.indexOf(column);
  expect(index, `${table}.${column} column`).toBeGreaterThanOrEqual(0);
  const values = match[2].split(",").map((value) => value.trim());
  const placeholder = values[index]?.match(/^\$(\d+)$/);
  if (!placeholder) {
    throw new Error(
      `Expected a parameter for ${table}.${column}: ${values[index]}`,
    );
  }
  return query.params[Number(placeholder[1]) - 1];
}

beforeEach(async () => {
  await closeDb();
  ModelObserver.clear();
  driver.state.queries = [];
  await initPostgresDb("postgres://unused/encoding-driver");
});

afterEach(async () => {
  await closeDb();
  ModelObserver.clear();
});

describe("PostgreSQL model parameter encoding", () => {
  it("sends 0 and 1 for each integer-backed boolean column", async () => {
    for (const value of [false, true]) {
      driver.state.queries = [];
      await Workflow.create<Workflow>({
        user_id: "owner",
        receive_clipboard: value,
      });
      await Message.create<Message>({
        user_id: "owner",
        thread_id: "thread",
        agent_mode: value,
        help_mode: value,
      });
      await Workspace.create<Workspace>({
        user_id: "owner",
        name: "Workspace",
        path: "workspaces/owner",
        is_default: value,
      });
      await GenerationAttachment.create<GenerationAttachment>({
        generation_id: "generation",
        output_id: "output",
        target_type: "asset",
        target_id: "asset",
        selected: value,
      });
      const expected = value ? 1 : 0;
      expect(insertParameter("nodetool_workflows", "receive_clipboard")).toBe(
        expected,
      );
      expect(insertParameter("nodetool_messages", "agent_mode")).toBe(expected);
      expect(insertParameter("nodetool_messages", "help_mode")).toBe(expected);
      expect(insertParameter("nodetool_workspaces", "is_default")).toBe(
        expected,
      );
      expect(
        insertParameter("nodetool_generation_attachments", "selected"),
      ).toBe(expected);
    }
  });

  it("sends every document and capability string verbatim", async () => {
    const owner = { user_id: "owner", project_id: "default", name: "Document" };
    const timeline = new TimelineSequence(owner);
    const image = new ImageDocument(owner);
    const storyboard = new Storyboard(owner);
    const application = new Application(owner);
    const script = new Script(owner);
    const jsScript = new JsScript(owner);
    const capabilities = JSON.stringify(
      { workflows: [], resources: [] },
      null,
      2,
    );
    const applicationVersion = new ApplicationVersionFixture({
      id: createTimeOrderedUuid(),
      application_id: application.id,
      user_id: "owner",
      version: 1,
      document: application.document,
      capabilities,
      workflow_graphs: null,
      released: 1,
      created_at: "2026-01-01T00:00:00.000Z",
    });
    const fixtures: Array<{
      model: DBModel & { document: string };
      table: string;
      extraColumns?: Record<string, string>;
    }> = [
      { model: timeline, table: "timeline_sequences" },
      {
        model: new TimelineSequenceVersion({
          user_id: "owner",
          timeline_id: timeline.id,
          document: timeline.document,
        }),
        table: "timeline_sequence_versions",
      },
      { model: image, table: "image_documents" },
      {
        model: new ImageDocumentVersion({
          user_id: "owner",
          image_document_id: image.id,
          document: image.document,
        }),
        table: "image_document_versions",
      },
      { model: storyboard, table: "storyboards" },
      { model: application, table: "applications" },
      {
        model: applicationVersion,
        table: "application_versions",
        extraColumns: { capabilities },
      },
      { model: script, table: "scripts" },
      { model: jsScript, table: "js_scripts" },
      {
        model: new JsScriptVersion({
          user_id: "owner",
          js_script_id: jsScript.id,
          document: jsScript.document,
        }),
        table: "js_script_versions",
      },
    ];
    for (const fixture of fixtures) {
      driver.state.queries = [];
      const document = JSON.stringify(
        JSON.parse(fixture.model.document),
        null,
        2,
      );
      fixture.model.document = document;
      await fixture.model.save();
      for (const [column, expected] of Object.entries({
        document,
        ...fixture.extraColumns,
      })) {
        expect(
          insertParameter(fixture.table, column),
          `${fixture.table}.${column}`,
        ).toBe(expected);
        expect(driver.state.queries[0].params).not.toContain(
          JSON.stringify(expected),
        );
      }
    }
  });
});
