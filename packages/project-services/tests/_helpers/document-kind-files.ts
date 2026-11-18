/**
 * The file cases every document kind of the shared file sync must pass:
 * save, rename, delete, a valid and an invalid file edit, a new file and a
 * move to another project. Each kind's test file calls
 * {@link describeDocumentFiles} with how to make and read its rows. The full
 * reconcile table is covered once, by the workflow and timeline suites.
 */
import { createHash } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  ModelObserver,
  initTestDb,
  moveDocumentToProject,
  type ProjectMemberType
} from "@nodetool-ai/models";
import {
  createLocalWorkspace,
  setProjectFolderResolver,
  type ProjectFolderResolution,
  type Workspace
} from "@nodetool-ai/runtime";
import {
  documentFileSync,
  reconcileDocumentFiles,
  type DocumentFileAdapter,
  type DocumentRow
} from "../../src/document-file-sync.js";

export const USER = "owner";
export const PROJECT = "project-a";
export const OTHER_PROJECT = "project-b";

export interface DocumentKindSpec<Row extends DocumentRow> {
  /** The project member type `moveDocumentToProject` takes. */
  memberType: ProjectMemberType;
  directory: string;
  suffix: string;
  format: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- each kind has its own fields
  adapter: DocumentFileAdapter<Row, any>;
  /** Install `sync`, or remove the installed one with null. */
  install(sync: unknown): void;
  /** Create a row through the model, carrying `marker` in its content. */
  make(name: string, marker: string): Promise<Row>;
  reload(id: string): Promise<Row | null>;
  rename(row: Row, name: string): Promise<void>;
  /** The marker the row's content carries. */
  markerOf(row: Row): string;
  /** Change the marker in a file's JSON, as a text editor would. */
  setMarker(file: Record<string, unknown>, marker: string): void;
  /** Make a file's JSON fail the kind's validation. */
  breakFile(file: Record<string, unknown>): void;
  /** A valid file body, after `format`, `version` and `id`. */
  newBody(marker: string): Record<string, unknown>;
  /** How many versions the row keeps, or undefined for a kind that keeps none. */
  versionCount?(id: string): Promise<number>;
}

export function describeDocumentFiles<Row extends DocumentRow>(
  title: string,
  spec: DocumentKindSpec<Row>
): void {
  let root: string;
  let folders: Map<string, Workspace>;

  const folder = (projectId = PROJECT): Workspace => {
    let workspace = folders.get(projectId);
    if (!workspace) {
      workspace = createLocalWorkspace(join(root, projectId));
      folders.set(projectId, workspace);
    }
    return workspace;
  };
  const pathOf = (name: string): string =>
    `${spec.directory}/${name}${spec.suffix}`;
  // A binary kind's file is read and written through its codec.
  const codec = spec.adapter.codec;
  const textOf = async (path: string, projectId = PROJECT): Promise<string | null> => {
    if (!codec) return folder(projectId).readText(path);
    const bytes = await folder(projectId).read(path);
    return bytes === null ? null : codec.decode(bytes);
  };
  const jsonOf = async (
    path: string,
    projectId = PROJECT
  ): Promise<Record<string, unknown>> => {
    const text = await textOf(path, projectId);
    if (text === null) throw new Error(`no file at ${path}`);
    return JSON.parse(text) as Record<string, unknown>;
  };
  const write = async (path: string, file: Record<string, unknown>): Promise<void> => {
    const text = `${JSON.stringify(file, null, 2)}\n`;
    await folder().write(path, codec ? await codec.encode(text) : text);
  };
  const reload = async (id: string): Promise<Row> => {
    const row = await spec.reload(id);
    if (!row) throw new Error(`row ${id} is gone`);
    return row;
  };
  const reconcile = () =>
    reconcileDocumentFiles([spec.adapter], PROJECT, USER);

  describe(title, () => {
    beforeEach(async () => {
      initTestDb();
      root = await mkdtemp(join(tmpdir(), "nodetool-document-files-"));
      folders = new Map();
      spec.install(documentFileSync(spec.adapter));
      setProjectFolderResolver(
        async (projectId): Promise<ProjectFolderResolution> => {
          const id = projectId ?? "personal";
          return { ok: true, projectId: id, workspace: folder(id) };
        }
      );
    });

    afterEach(async () => {
      spec.install(null);
      ModelObserver.clear();
      setProjectFolderResolver(null);
      await rm(root, { recursive: true, force: true });
    });

    it(`writes ${spec.directory}/<name>${spec.suffix} on save`, async () => {
      const row = await spec.make("Fox", "first");
      const text = await textOf(pathOf("Fox"));
      expect(text).not.toBeNull();
      // The hash is of the bytes on disk.
      const bytes = await folder().read(pathOf("Fox"));
      const file = JSON.parse(text ?? "") as Record<string, unknown>;
      expect(file["format"]).toBe(spec.format);
      expect(file["version"]).toBe(1);
      expect(file["id"]).toBe(row.id);
      expect(file["name"]).toBeUndefined();
      const stored = await reload(row.id);
      expect(stored.file_path).toBe(pathOf("Fox"));
      expect(stored.file_hash).toBe(
        createHash("sha256").update(bytes ?? "").digest("hex")
      );
      expect(stored.file_error).toBeNull();
    });

    it("renames the file when the document is renamed", async () => {
      const row = await spec.make("Fox", "first");
      await spec.rename(row, "Wolf");
      expect(await folder().exists(pathOf("Fox"))).toBe(false);
      expect((await jsonOf(pathOf("Wolf")))["id"]).toBe(row.id);
      expect((await reload(row.id)).file_path).toBe(pathOf("Wolf"));
    });

    it("deletes the file when the document is deleted", async () => {
      const row = await spec.make("Fox", "first");
      await row.delete();
      expect(await folder().exists(pathOf("Fox"))).toBe(false);
    });

    it("imports a valid file edit", async () => {
      const row = await spec.make("Fox", "first");
      const before = await spec.versionCount?.(row.id);
      const file = await jsonOf(pathOf("Fox"));
      spec.setMarker(file, "edited");
      await write(pathOf("Fox"), file);

      const report = await reconcile();

      expect(report.imported).toEqual([row.id]);
      const stored = await reload(row.id);
      expect(spec.markerOf(stored)).toBe("edited");
      expect(stored.file_error).toBeNull();
      if (before !== undefined) {
        // The row as it was before the import is kept as a version.
        expect(await spec.versionCount?.(row.id)).toBe(before + 1);
      }
    });

    it("keeps the row and records the error of an invalid file edit", async () => {
      const row = await spec.make("Fox", "first");
      const file = await jsonOf(pathOf("Fox"));
      spec.breakFile(file);
      await write(pathOf("Fox"), file);

      const report = await reconcile();

      expect(report.invalid).toEqual([row.id]);
      const stored = await reload(row.id);
      expect(spec.markerOf(stored)).toBe("first");
      expect(stored.file_error).toEqual(expect.any(String));
      expect(stored.file_error).not.toBe("");
    });

    it("creates a document from a new file", async () => {
      const id = "0123456789abcdef0123456789abcdef";
      await write(pathOf("Hare"), {
        format: spec.format,
        version: 1,
        id,
        ...spec.newBody("new")
      });

      const report = await reconcile();

      expect(report.created).toEqual([id]);
      const created = await reload(id);
      expect(created.name).toBe("Hare");
      expect(created.project_id).toBe(PROJECT);
      expect(spec.markerOf(created)).toBe("new");
      expect(created.file_path).toBe(pathOf("Hare"));
    });

    it("moves the file with the document to another project", async () => {
      const row = await spec.make("Fox", "first");

      expect(
        await moveDocumentToProject(USER, spec.memberType, row.id, OTHER_PROJECT)
      ).toBe(true);

      expect(await folder().exists(pathOf("Fox"))).toBe(false);
      expect((await jsonOf(pathOf("Fox"), OTHER_PROJECT))["id"]).toBe(row.id);
      const stored = await reload(row.id);
      expect(stored.project_id).toBe(OTHER_PROJECT);
      expect(stored.file_path).toBe(pathOf("Fox"));
    });
  });
}
