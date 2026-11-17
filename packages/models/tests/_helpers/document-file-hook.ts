/**
 * The hook cases for a document kind whose rows are files in their project
 * folder: every write calls the installed sync, a move to another project
 * names the file left behind, an ID from a file is not inserted over a row,
 * and the etag leaves the file state out. Folders are reached by the sync,
 * so these cases install a recording one.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  ModelObserver,
  initTestDb,
  moveDocumentToProject,
  type DBModel,
  type DocumentFileLocation,
  type DocumentFileSync,
  type ProjectMemberType
} from "../../src/index.js";

export const USER = "owner";

interface HookRow extends DBModel {
  id: string;
  user_id: string;
  project_id: string;
  name: string;
  updated_at: string;
  file_path: string | null;
  file_hash: string | null;
  file_error: string | null;
  delete(): Promise<void>;
  save(): Promise<this>;
  getEtag(): string;
}

export interface HookSpec<Row extends HookRow> {
  memberType: ProjectMemberType;
  install(sync: DocumentFileSync<Row> | null): void;
  make(fields?: Record<string, unknown>): Promise<Row>;
  reload(id: string): Promise<Row | null>;
  rename(id: string, updatedAt: string, name: string): Promise<Row | null>;
  insertNew(data: Record<string, unknown>): Promise<Row | null>;
  setFileState(
    id: string,
    state: { file_path?: string; file_hash?: string; file_error?: string | null }
  ): Promise<void>;
}

interface Call {
  kind: "saved" | "deleted";
  id: string;
  name: string;
  previous?: DocumentFileLocation | null;
}

export function describeDocumentFileHook<Row extends HookRow>(
  title: string,
  spec: HookSpec<Row>
): void {
  let calls: Call[];

  describe(title, () => {
    beforeEach(() => {
      initTestDb();
      calls = [];
      spec.install({
        async saved(row, previous) {
          calls.push({ kind: "saved", id: row.id, name: row.name, previous });
          const state = { file_path: `Files/${row.name}.json`, file_hash: "hash" };
          await spec.setFileState(row.id, state);
          Object.assign(row, state);
        },
        async deleted(row) {
          calls.push({ kind: "deleted", id: row.id, name: row.name });
        },
        leaving: async () => null
      });
    });

    afterEach(() => {
      spec.install(null);
      ModelObserver.clear();
    });

    it("is called after create, save, a conditional update and delete", async () => {
      const row = await spec.make({ name: "First" });
      await row.save();
      const renamed = await spec.rename(row.id, row.updated_at, "Second");
      await renamed?.delete();

      const saved = { kind: "saved", id: row.id, previous: null };
      expect(calls).toEqual([
        { ...saved, name: "First" },
        { ...saved, name: "First" },
        { ...saved, name: "Second" },
        { kind: "deleted", id: row.id, name: "Second" }
      ]);
      expect(renamed?.file_path).toBe("Files/Second.json");
    });

    it("is not called when a conditional update finds the row changed", async () => {
      const row = await spec.make();
      calls = [];
      expect(
        await spec.rename(row.id, "1999-01-01T00:00:00.000Z", "Never")
      ).toBeNull();
      expect(calls).toEqual([]);
    });

    it("names the file left behind when the row moves to another project", async () => {
      const row = await spec.make({ name: "Moved" });
      calls = [];

      expect(
        await moveDocumentToProject(USER, spec.memberType, row.id, "project-b")
      ).toBe(true);

      expect(calls).toEqual([
        {
          kind: "saved",
          id: row.id,
          name: "Moved",
          previous: { project_id: "project-a", file_path: "Files/Moved.json" }
        }
      ]);
      expect((await spec.reload(row.id))?.project_id).toBe("project-b");
    });

    it("inserts a row from a file only when no row has its ID", async () => {
      const existing = await spec.make({ name: "Mine" });
      calls = [];

      const refused = await spec.insertNew({
        id: existing.id,
        user_id: "someone-else",
        project_id: "project-a",
        name: "Theirs"
      });
      const created = await spec.insertNew({
        id: "0123456789abcdef0123456789abcdef",
        user_id: USER,
        project_id: "project-a",
        name: "New"
      });

      expect(refused).toBeNull();
      expect((await spec.reload(existing.id))?.name).toBe("Mine");
      expect(created?.file_path).toBe("Files/New.json");
      expect(calls.map((call) => call.name)).toEqual(["New"]);
    });

    it("leaves the file state out of the etag", async () => {
      const row = await spec.make();
      const etag = row.getEtag();
      await spec.setFileState(row.id, {
        file_path: "Elsewhere/x.json",
        file_hash: "other",
        file_error: "File missing"
      });
      expect((await spec.reload(row.id))?.getEtag()).toBe(etag);
    });
  });
}
