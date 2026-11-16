/**
 * Timelines as files in the project folder (PRD T5):
 * `Timelines/<name>.timeline.json`.
 *
 * ```json
 * {
 *   "format": "nodetool.timeline",
 *   "version": 1,
 *   "id": "<timeline id>",
 *   "fps": 30,
 *   "width": 1920,
 *   "height": 1080,
 *   "duration_ms": 0,
 *   "document": { "tracks": [], "clips": [], "markers": [] }
 * }
 * ```
 *
 * The file name is the timeline's name and the file holds no `name` field.
 * Owner, the linked workflow, `revision` and timestamps stay in the database.
 * A clip names its media by asset ID, as the stored document does. The sync
 * itself is `document-file-sync.ts`. This module is the timeline kind: which
 * fields the file carries and how a file's content is checked.
 *
 * Loading this module installs the sync on the `TimelineSequence` model, so
 * every write of a timeline row writes the file: the editor's save, the tRPC
 * and REST routes and the agent tools all save through the model.
 *
 * An import stores the row through the model's conditional update, which
 * raises `revision` and `updated_at`. An editor that has the timeline open
 * reloads, and a save that still names the old state is refused.
 */
import { createLogger } from "@nodetool-ai/config";
import {
  TimelineSequence,
  TimelineSequenceVersion,
  setTimelineFileSync
} from "@nodetool-ai/models";
import {
  documentFileSync,
  writeMissingDocumentFiles,
  type DocumentFileAdapter,
  type DocumentFileContent,
  type DocumentFileOwner
} from "./document-file-sync.js";

const log = createLogger("nodetool.project-services.timeline-file");

/** The directory timeline files are written in. */
export const TIMELINE_FILE_DIRECTORY = "Timelines";
/** The end of every timeline file name. */
export const TIMELINE_FILE_SUFFIX = ".timeline.json";
/** The `format` value of a timeline file. */
export const TIMELINE_FILE_FORMAT = "nodetool.timeline";
/** The name of the version that keeps a timeline as it was before an import. */
export const TIMELINE_FILE_EDIT_VERSION_NAME = "Before file edit";
/** The name of the version that keeps a file edit a save in NodeTool replaced. */
export const TIMELINE_FILE_REPLACED_VERSION_NAME = "File edit replaced by a save";

/** The render settings a new timeline gets when its file names none. */
const DEFAULT_SETTINGS = { fps: 30, width: 1920, height: 1080 };

/** The timeline fields a timeline file carries. */
export interface TimelineFileFields {
  fps: number;
  width: number;
  height: number;
  duration_ms: number;
  /** The document as an object. The row keeps it as JSON text. */
  document: Record<string, unknown>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Check the body of a timeline file. The document passes the checks
 * `set_timeline_document` runs and is stored in the shape that tool stores,
 * so a file edit cannot store a document the tool would refuse.
 *
 * `duration_ms` is the end of the last clip, as that tool computes it. The
 * number in the file is not read, so an edit to the clips need not update it.
 */
async function parseTimelineFile(
  body: Record<string, unknown>,
  row: TimelineSequence | null,
  owner: DocumentFileOwner
): Promise<DocumentFileContent<TimelineFileFields>> {
  const document = body["document"];
  if (!isRecord(document)) {
    return { ok: false, error: '"document" must be an object' };
  }
  // Loaded on the first import of a file, so that loading this module does
  // not load the agent package.
  const { prepareTimelineDocumentForSave } = await import(
    "@nodetool-ai/agents/timeline-document-save"
  );
  const prepared = await prepareTimelineDocumentForSave(document, {
    userId: owner.userId,
    current: row ?? DEFAULT_SETTINGS,
    settings: {
      fps: body["fps"],
      width: body["width"],
      height: body["height"]
    }
  });
  if (!prepared.ok) {
    // The error, then one line per issue, as the tool's result lists them.
    const lines = [prepared.error];
    for (const issue of prepared.validation?.errors ?? []) {
      lines.push(issue.message);
    }
    return { ok: false, error: lines.join("\n") };
  }
  for (const list of ["tracks", "clips", "markers"]) {
    if (!Array.isArray(prepared.document[list])) {
      return {
        ok: false,
        error: '"document" must contain "tracks", "clips" and "markers" lists'
      };
    }
  }
  return {
    ok: true,
    fields: {
      fps: prepared.fps,
      width: prepared.width,
      height: prepared.height,
      duration_ms: prepared.durationMs,
      document: prepared.document
    }
  };
}

/** The timeline kind of {@link DocumentFileAdapter}. */
export const timelineFileAdapter: DocumentFileAdapter<
  TimelineSequence,
  TimelineFileFields
> = {
  kind: "timeline",
  directory: TIMELINE_FILE_DIRECTORY,
  suffix: TIMELINE_FILE_SUFFIX,
  format: TIMELINE_FILE_FORMAT,
  untitled: "Untitled timeline",

  fieldsOf: (row) => ({
    fps: row.fps,
    width: row.width,
    height: row.height,
    duration_ms: row.duration_ms,
    // SAFETY: the model refuses to store a document that is not an object
    // with its three lists.
    document: JSON.parse(row.document) as Record<string, unknown>
  }),

  body: (fields) => ({
    fps: fields.fps,
    width: fields.width,
    height: fields.height,
    duration_ms: fields.duration_ms,
    document: fields.document
  }),

  parse: parseTimelineFile,

  list: (userId, projectIds) =>
    TimelineSequence.listForProjects(userId, projectIds),

  // `TimelineSequence.findById` also answers for a 12-character prefix. This
  // asks for the exact ID only.
  exists: (id) => TimelineSequence.existsExactly(id),

  async snapshot(row, reason = "before-import") {
    // For a replaced file the row is a copy that carries the file's fields,
    // so its document is the object the file holds and not the stored text.
    const document: unknown = row.document;
    await TimelineSequenceVersion.snapshot(
      {
        id: row.id,
        user_id: row.user_id,
        fps: row.fps,
        width: row.width,
        height: row.height,
        duration_ms: row.duration_ms,
        document:
          typeof document === "string" ? document : JSON.stringify(document)
      },
      {
        saveType: "manual",
        name:
          reason === "replaced-file"
            ? TIMELINE_FILE_REPLACED_VERSION_NAME
            : TIMELINE_FILE_EDIT_VERSION_NAME
      }
    );
  },

  update(row, fields, name) {
    const { document, ...settings } = fields;
    const changes: Parameters<
      typeof TimelineSequence.updateFieldsIfUnchanged
    >[2] = { ...settings };
    if (document !== undefined) changes.document = JSON.stringify(document);
    if (name !== undefined) changes.name = name;
    return TimelineSequence.updateFieldsIfUnchanged(
      row.id,
      row.updated_at,
      changes
    );
  },

  // An insert that refuses a taken ID: the ID comes from a file, and a row
  // with it can be another user's.
  create: ({ id, userId, projectId, name, fields }) =>
    TimelineSequence.insertNew({
      id,
      user_id: userId,
      project_id: projectId,
      name,
      ...fields,
      document: JSON.stringify(fields.document)
    }),

  setFileState: (id, state) => TimelineSequence.setFileState(id, state)
};

setTimelineFileSync(documentFileSync(timelineFileAdapter));

/**
 * Write a file for every timeline that has none yet, of every user or of
 * `userId`: the timelines from before project folders (PRD T9 step 3). Safe to
 * interrupt and to run again, and a second run writes nothing. A project
 * whose folder cannot be reached is skipped and tried again by the next run.
 * Returns how many files were written.
 */
export async function migrateTimelineFiles(userId?: string): Promise<number> {
  let written = 0;
  for (const {
    user_id,
    project_id
  } of await TimelineSequence.projectsWithUnwrittenFiles(userId)) {
    try {
      written += await writeMissingDocumentFiles(
        [timelineFileAdapter],
        project_id,
        user_id
      );
    } catch (error) {
      log.debug("Skipped writing the timeline files of a project", {
        projectId: project_id,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }
  return written;
}
