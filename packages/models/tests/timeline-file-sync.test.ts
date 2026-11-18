/**
 * The hook that keeps a timeline's file in step with its row. Every write of
 * a timeline row calls the installed sync: create, save, the two conditional
 * updates, the document mutation, a move to another project, a finished
 * storyboard and delete. Folders are reached by the sync, so these cases
 * install a recording one.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  DocumentFileMoveError,
  ModelObserver,
  Storyboard,
  TimelineSequence,
  commitFinishedStoryboard,
  computeEtag,
  initTestDb,
  moveDocumentToProject,
  reassignProjectDocuments,
  setTimelineFileSync,
  type DocumentFileLocation
} from "../src/index.js";

const USER = "owner";
const EMPTY = { tracks: [], clips: [], markers: [] };

interface Call {
  kind: "saved" | "deleted";
  id: string;
  name: string;
  previous?: DocumentFileLocation | null;
}

let calls: Call[];
/** The project each row was in when the sync was asked whether it may leave. */
let asked: string[];
/** What the sync answers when it is asked. Null lets the row leave. */
let refusal: string | null;

/** A sync that records each call and files the row under its name. */
function recordingSync(): void {
  setTimelineFileSync({
    async saved(row, previous) {
      calls.push({ kind: "saved", id: row.id, name: row.name, previous });
      const state = {
        file_path: `Timelines/${row.name}.timeline.json`,
        file_hash: `hash of ${row.name} at revision ${row.revision}`
      };
      await TimelineSequence.setFileState(row.id, state);
      Object.assign(row, state);
    },
    async deleted(row) {
      calls.push({ kind: "deleted", id: row.id, name: row.name });
    },
    async deleting(row, remove) {
      const gone = await remove();
      if (gone) calls.push({ kind: "deleted", id: gone.id, name: gone.name });
      return gone;
    },
    async leaving(row) {
      asked.push(`${row.name} in ${row.project_id}, fps ${row.fps}`);
      return refusal;
    }
  });
}

function makeTimeline(
  fields: Record<string, unknown> = {}
): Promise<TimelineSequence> {
  return TimelineSequence.create<TimelineSequence>({
    user_id: USER,
    project_id: "project-a",
    name: "Cut",
    ...fields
  });
}

async function reload(id: string): Promise<TimelineSequence> {
  const found = await TimelineSequence.findById(id);
  if (!found) throw new Error(`timeline ${id} is gone`);
  return found;
}

beforeEach(() => {
  initTestDb();
  calls = [];
  asked = [];
  refusal = null;
  recordingSync();
});

afterEach(() => {
  setTimelineFileSync(null);
  ModelObserver.clear();
});

describe("the timeline file sync hook", () => {
  it("is called after create, save, both conditional updates, a document mutation and delete", async () => {
    const timeline = await makeTimeline();
    timeline.fps = 24;
    await timeline.save();
    const renamed = await TimelineSequence.updateFieldsIfUnchanged(
      timeline.id,
      timeline.updated_at,
      { name: "Final cut" }
    );
    const replaced = await TimelineSequence.updateDocumentIfUnchanged(
      timeline.id,
      renamed?.updated_at ?? "",
      EMPTY
    );
    const mutated = await TimelineSequence.mutateDocument(timeline.id, (doc) => {
      doc.scriptEnabled = true;
    });
    await mutated?.sequence.delete();

    const saved = { kind: "saved", id: timeline.id, previous: null };
    expect(calls).toEqual([
      { ...saved, name: "Cut" },
      { ...saved, name: "Cut" },
      { ...saved, name: "Final cut" },
      { ...saved, name: "Final cut" },
      { ...saved, name: "Final cut" },
      { kind: "deleted", id: timeline.id, name: "Final cut" }
    ]);
    // Each returned row carries what the sync recorded for that write.
    expect(renamed?.file_path).toBe("Timelines/Final cut.timeline.json");
    expect(replaced?.file_hash).toBe(
      `hash of Final cut at revision ${replaced?.revision}`
    );
    expect(mutated?.sequence.file_hash).toBe(
      `hash of Final cut at revision ${mutated?.sequence.revision}`
    );
  });

  it("is not called when a conditional update finds the row changed", async () => {
    const timeline = await makeTimeline();
    calls = [];

    const stale = await TimelineSequence.updateFieldsIfUnchanged(
      timeline.id,
      "1999-01-01T00:00:00.000Z",
      { name: "Never" }
    );
    const staleDocument = await TimelineSequence.updateDocumentIfUnchanged(
      timeline.id,
      "1999-01-01T00:00:00.000Z",
      EMPTY
    );

    expect(stale).toBeNull();
    expect(staleDocument).toBeNull();
    expect(calls).toEqual([]);
  });

  it("names the file a timeline had in the project it left", async () => {
    const timeline = await makeTimeline();
    calls = [];

    // Through the project router's move of one document.
    expect(
      await moveDocumentToProject(USER, "timeline", timeline.id, "project-b")
    ).toBe(true);
    // Through an instance loaded from the database.
    const loaded = await reload(timeline.id);
    loaded.project_id = "project-c";
    await loaded.save();
    // A save that keeps the project names no previous file.
    await loaded.save();
    // Through the move of every document of a project.
    expect(await reassignProjectDocuments(USER, "project-c", "default")).toBe(1);

    const location = { file_path: "Timelines/Cut.timeline.json" };
    expect(calls.map((call) => call.previous)).toEqual([
      { project_id: "project-a", ...location },
      { project_id: "project-b", ...location },
      null,
      { project_id: "project-c", ...location }
    ]);
    expect((await reload(timeline.id)).project_id).toBe("default");
  });

  it("asks the sync before a move, with the stored row, and moves nothing when it refuses", async () => {
    const timeline = await makeTimeline();
    calls = [];
    refusal = "The file was edited and is not valid.";

    // The project router's move of one document.
    await expect(
      moveDocumentToProject(USER, "timeline", timeline.id, "project-b")
    ).rejects.toThrow(DocumentFileMoveError);
    await expect(
      moveDocumentToProject(USER, "timeline", timeline.id, "project-b")
    ).rejects.toThrow("The file was edited and is not valid.");
    // A save of a loaded instance that changes the project and more.
    const loaded = await reload(timeline.id);
    loaded.project_id = "project-c";
    loaded.fps = 12;
    await expect(loaded.save()).rejects.toThrow(DocumentFileMoveError);
    // The move of every document of a project.
    await expect(
      reassignProjectDocuments(USER, "project-a", "default")
    ).rejects.toThrow(DocumentFileMoveError);

    // Each time the sync saw the row as it is stored, in the project it is in.
    expect(asked).toEqual(Array(4).fill("Cut in project-a, fps 30"));
    // Nothing was written and no file was touched.
    expect(calls).toEqual([]);
    expect(await reload(timeline.id)).toMatchObject({
      project_id: "project-a",
      fps: 30,
      revision: timeline.revision,
      updated_at: timeline.updated_at,
      file_path: "Timelines/Cut.timeline.json"
    });

    // A move within the project, and a save that keeps it, ask nothing.
    asked = [];
    await moveDocumentToProject(USER, "timeline", timeline.id, "project-a");
    await (await reload(timeline.id)).save();
    expect(asked).toEqual([]);

    // Once the sync lets the row leave, the move goes through.
    refusal = null;
    expect(
      await moveDocumentToProject(USER, "timeline", timeline.id, "project-b")
    ).toBe(true);
    expect(asked).toEqual(["Cut in project-a, fps 30"]);
    expect((await reload(timeline.id)).project_id).toBe("project-b");
  });

  it("moves a timeline without raising revision or updated_at", async () => {
    const timeline = await makeTimeline();

    await moveDocumentToProject(USER, "timeline", timeline.id, "project-b");

    const moved = await reload(timeline.id);
    expect(moved.project_id).toBe("project-b");
    expect(moved.revision).toBe(timeline.revision);
    expect(moved.updated_at).toBe(timeline.updated_at);
    expect(
      await moveDocumentToProject(USER, "timeline", "no-such-id", "project-b")
    ).toBe(false);
    expect(
      await moveDocumentToProject("someone-else", "timeline", timeline.id, "x")
    ).toBe(false);
  });

  it("records the file without changing revision or updated_at or announcing a change", async () => {
    const timeline = await makeTimeline();
    const events: string[] = [];
    ModelObserver.subscribe(
      (_instance, event) => events.push(event),
      "TimelineSequence"
    );

    await TimelineSequence.setFileState(timeline.id, {
      file_path: "Timelines/Cut.timeline.json",
      file_hash: "a".repeat(64),
      file_error: "File missing"
    });

    const stored = await reload(timeline.id);
    expect(stored).toMatchObject({
      file_path: "Timelines/Cut.timeline.json",
      file_hash: "a".repeat(64),
      file_error: "File missing"
    });
    expect(stored.updated_at).toBe(timeline.updated_at);
    expect(stored.revision).toBe(timeline.revision);
    expect(events).toEqual([]);
  });

  it("keeps the recorded file state when no sync is installed", async () => {
    const timeline = await makeTimeline();
    const state = {
      file_path: "Timelines/Cut.timeline.json",
      file_hash: timeline.file_hash
    };
    expect(state.file_hash).not.toBeNull();
    setTimelineFileSync(null);

    // The hash still names the file as it was last synced. A reconcile on a
    // host that has the sync compares the file with it and never takes an
    // edited file for an untouched one.
    const updated = await TimelineSequence.updateFieldsIfUnchanged(
      timeline.id,
      timeline.updated_at,
      { fps: 25 }
    );
    expect(updated).toMatchObject(state);
    const replaced = await TimelineSequence.updateDocumentIfUnchanged(
      timeline.id,
      updated?.updated_at ?? "",
      EMPTY
    );
    expect(replaced).toMatchObject(state);
    const again = await reload(timeline.id);
    again.fps = 24;
    await again.save();
    expect(await reload(timeline.id)).toMatchObject({ fps: 24, ...state });
  });

  it("forgets the file of a timeline that a host without the sync moved", async () => {
    const timeline = await makeTimeline();
    setTimelineFileSync(null);

    // A move within the project keeps the file state.
    await moveDocumentToProject(USER, "timeline", timeline.id, "project-a");
    expect((await reload(timeline.id)).file_path).toBe(
      "Timelines/Cut.timeline.json"
    );

    // The path and the hash name a file of the folder the timeline left.
    await moveDocumentToProject(USER, "timeline", timeline.id, "project-b");
    expect(await reload(timeline.id)).toMatchObject({
      project_id: "project-b",
      file_path: null,
      file_hash: null,
      file_error: null
    });
  });

  it("leaves the file state out of the etag", async () => {
    setTimelineFileSync(null);
    const timeline = await makeTimeline();
    const etag = timeline.getEtag();
    // The etag a timeline had before it had a file: the row without the
    // three columns that describe the file, and the two that describe the
    // save.
    const {
      file_path: _path,
      file_hash: _hash,
      file_error: _error,
      last_writer_instance: _writer,
      schema_version: _schema,
      ...content
    } = timeline.toRow();
    expect(etag).toBe(computeEtag(content));

    // Writing, importing and losing the file change the row, not the etag.
    await TimelineSequence.setFileState(timeline.id, {
      file_path: "Timelines/Cut.timeline.json",
      file_hash: "a".repeat(64)
    });
    expect((await reload(timeline.id)).getEtag()).toBe(etag);
    await TimelineSequence.setFileState(timeline.id, { file_error: "File missing" });
    expect((await reload(timeline.id)).getEtag()).toBe(etag);

    // The sync records the file on the instance after the save was announced.
    recordingSync();
    const announced: string[] = [];
    ModelObserver.subscribe(
      (instance) => announced.push(instance.getEtag()),
      "TimelineSequence"
    );
    const created = await makeTimeline({ name: "Owl" });
    expect(created.file_path).toBe("Timelines/Owl.timeline.json");
    expect(announced).toEqual([created.getEtag()]);
    expect((await reload(created.id)).getEtag()).toBe(created.getEtag());

    // Content still changes it.
    const changed = await TimelineSequence.updateFieldsIfUnchanged(
      timeline.id,
      timeline.updated_at,
      { fps: 25 }
    );
    expect(changed?.getEtag()).not.toBe(etag);
  });

  it("writes the file of the timeline a finished storyboard produced and replaced", async () => {
    const board = await Storyboard.create<Storyboard>({
      user_id: USER,
      project_id: "project-a",
      name: "Board"
    });
    calls = [];

    const first = await commitFinishedStoryboard({
      board,
      document: EMPTY,
      width: 1280,
      height: 720,
      durationMs: 0
    });
    const second = await commitFinishedStoryboard({
      board: first.board,
      timeline: first.timeline,
      document: { ...EMPTY, scriptEnabled: true },
      width: 1280,
      height: 720,
      durationMs: 0
    });

    const saved = { kind: "saved", id: first.timeline.id, name: "Board", previous: null };
    expect(calls).toEqual([saved, saved]);
    // The replaced row records the file written for it.
    expect(second.timeline.revision).toBe(first.timeline.revision + 1);
    expect(second.timeline.file_hash).toBe(
      `hash of Board at revision ${second.timeline.revision}`
    );
    expect((await reload(first.timeline.id)).file_hash).toBe(
      second.timeline.file_hash
    );
  });

  it("inserts a new timeline only when no row has its ID", async () => {
    const theirs = await TimelineSequence.create<TimelineSequence>({
      user_id: "someone-else",
      project_id: "project-z",
      name: "Theirs",
      fps: 24
    });
    const events: string[] = [];
    ModelObserver.subscribe(
      (instance, event) => events.push(`${event} ${String(instance.name)}`),
      "TimelineSequence"
    );
    calls = [];

    // A taken ID is refused and the row that has it is left as it is.
    const refused = await TimelineSequence.insertNew({
      id: theirs.id,
      user_id: USER,
      project_id: "project-a",
      name: "Mine",
      fps: 60
    });
    expect(refused).toBeNull();
    expect((await reload(theirs.id)).toRow()).toEqual(theirs.toRow());
    expect(calls).toEqual([]);
    expect(events).toEqual([]);

    // A free ID is inserted, filed and announced, as create() does.
    const mine = await TimelineSequence.insertNew({
      id: "0123456789abcdef0123456789abcdef",
      user_id: USER,
      project_id: "project-a",
      name: "Mine",
      fps: 60
    });
    expect(mine).toMatchObject({
      id: "0123456789abcdef0123456789abcdef",
      user_id: USER,
      fps: 60,
      revision: 1,
      file_path: "Timelines/Mine.timeline.json"
    });
    expect(calls).toEqual([
      { kind: "saved", id: mine?.id, name: "Mine", previous: null }
    ]);
    expect(events).toEqual(["created Mine"]);
    expect((await reload(mine?.id ?? "")).toRow()).toEqual(mine?.toRow());
    // A document the model refuses is refused here too.
    await expect(
      TimelineSequence.insertNew({
        user_id: USER,
        project_id: "project-a",
        name: "Broken",
        document: JSON.stringify({ tracks: [] })
      })
    ).rejects.toThrow("document must contain tracks, clips, and markers arrays");
  });

  it("lists the projects that hold a timeline with no file", async () => {
    setTimelineFileSync(null);
    await makeTimeline({ project_id: "project-a" });
    await makeTimeline({ project_id: "project-a" });
    await makeTimeline({ project_id: "project-b" });
    recordingSync();
    const filed = await makeTimeline({ project_id: "project-c" });

    const projects = await TimelineSequence.projectsWithUnwrittenFiles();

    expect(
      projects.map((project) => project.project_id).sort()
    ).toEqual(["project-a", "project-b"]);
    expect(projects.every((project) => project.user_id === USER)).toBe(true);
    expect(
      projects.map((project) => [project.project_id, Number(project.count)]).sort()
    ).toEqual([
      ["project-a", 2],
      ["project-b", 1]
    ]);
    expect(await TimelineSequence.projectsWithUnwrittenFiles("someone-else")).toEqual([]);
    expect(await TimelineSequence.projectsWithUnwrittenFiles(USER)).toHaveLength(2);
    expect(
      (await TimelineSequence.listForProjects(USER, ["project-a", "project-c"]))
        .length
    ).toBe(3);
    expect(await TimelineSequence.listForProjects(USER, [])).toEqual([]);
    expect(await TimelineSequence.existsExactly(filed.id)).toBe(true);
    // A 12-character prefix is not an ID.
    expect(await TimelineSequence.existsExactly(filed.id.slice(0, 12))).toBe(false);
  });
});
