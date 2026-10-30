import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  ImageDocument,
  Script,
  Storyboard,
  TimelineSequence,
  initTestDb,
  ModelObserver
} from "@nodetool-ai/models";
import { localModelInterfaces } from "../src/local-model-interfaces.js";

beforeEach(() => initTestDb());
afterEach(() => ModelObserver.clear());

describe("local workflow document persistence", () => {
  it("creates a sketch through the local workflow interfaces", async () => {
    const interfaces = await localModelInterfaces();
    const created = await interfaces.createImageDocument!({
      userId: "owner",
      projectId: "project-1",
      name: "Poster concepts",
      width: 1504,
      height: 752,
      document: { sketch: { version: 3 }, layerBindings: [] }
    });
    const row = await ImageDocument.findById(created.id);
    expect(row?.project_id).toBe("project-1");
    expect(row?.name).toBe("Poster concepts");
    expect(
      (await interfaces.getImageDocument!({ userId: "owner", id: created.id }))
        ?.id
    ).toBe(created.id);
    expect(
      await interfaces.getImageDocument!({ userId: "other", id: created.id })
    ).toBeNull();
  });

  it("creates storyboards, scripts and timelines through the local workflow interfaces", async () => {
    const interfaces = await localModelInterfaces();
    const board = await interfaces.createStoryboard!({
      userId: "owner",
      projectId: "project-1",
      name: "Board",
      document: { shots: [], brief: "Testing" }
    });
    const script = await interfaces.createScript!({
      userId: "owner",
      projectId: "project-1",
      name: "Script",
      document: { cast: [], sections: [] }
    });
    const timeline = await interfaces.createTimelineSequence!({
      userId: "owner",
      sequence: {
        projectId: "project-1",
        name: "Timeline",
        fps: 30,
        width: 640,
        height: 480,
        durationMs: 0,
        tracks: [],
        clips: [],
        markers: []
      }
    });
    expect((await Storyboard.findById(board.id))?.project_id).toBe("project-1");
    expect((await Script.findById(script.id))?.project_id).toBe("project-1");
    expect((await TimelineSequence.findById(timeline.id))?.project_id).toBe(
      "project-1"
    );
    expect(
      await interfaces.getStoryboard!({ userId: "other", id: board.id })
    ).toBeNull();
    expect(
      await interfaces.getScript!({ userId: "other", id: script.id })
    ).toBeNull();
    expect(
      await interfaces.getTimelineSequence!({
        userId: "other",
        id: timeline.id
      })
    ).toBeNull();
  });
});
