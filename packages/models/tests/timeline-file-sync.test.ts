/**
 * The hook that keeps a timeline's file in step with its row. Every write of
 * a timeline row calls the installed sync: create, save, the two conditional
 * updates, the document mutation, a move to another project, a finished
 * storyboard and delete. Folders are reached by the sync, so these cases
 * install a recording one.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  ModelObserver,
  Storyboard,
  TimelineSequence,
  commitFinishedStoryboard,
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

  it("marks the row newer than its file when no sync is installed", async () => {
    const timeline = await makeTimeline();
    expect(timeline.file_hash).not.toBeNull();
    setTimelineFileSync(null);

    const updated = await TimelineSequence.updateFieldsIfUnchanged(
      timeline.id,
      timeline.updated_at,
      { fps: 25 }
    );
    expect(updated?.file_hash).toBeNull();
    expect((await reload(timeline.id)).file_path).toBe(
      "Timelines/Cut.timeline.json"
    );

    recordingSync();
    const again = await reload(timeline.id);
    await again.save();
    expect(again.file_hash).not.toBeNull();
    setTimelineFileSync(null);
    const replaced = await TimelineSequence.updateDocumentIfUnchanged(
      again.id,
      again.updated_at,
      EMPTY
    );
    expect(replaced?.file_hash).toBeNull();

    recordingSync();
    await (await reload(timeline.id)).save();
    setTimelineFileSync(null);
    await (await reload(timeline.id)).save();
    expect((await reload(timeline.id)).file_hash).toBeNull();

    recordingSync();
    await (await reload(timeline.id)).save();
    setTimelineFileSync(null);
    await moveDocumentToProject(USER, "timeline", timeline.id, "project-b");
    expect((await reload(timeline.id)).file_hash).toBeNull();
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
    // The replaced row does not keep the hash of the file it had before.
    expect(second.timeline.revision).toBe(first.timeline.revision + 1);
    expect(second.timeline.file_hash).toBe(
      `hash of Board at revision ${second.timeline.revision}`
    );
    expect((await reload(first.timeline.id)).file_hash).toBe(
      second.timeline.file_hash
    );
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
      (await TimelineSequence.listForProjects(USER, ["project-a", "project-c"]))
        .length
    ).toBe(3);
    expect(await TimelineSequence.listForProjects(USER, [])).toEqual([]);
    expect(await TimelineSequence.existsExactly(filed.id)).toBe(true);
    // A 12-character prefix is not an ID.
    expect(await TimelineSequence.existsExactly(filed.id.slice(0, 12))).toBe(false);
  });
});
