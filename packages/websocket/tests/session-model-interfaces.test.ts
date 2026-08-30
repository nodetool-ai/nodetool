/**
 * session/model-interfaces — the server's persistence as one object, against
 * a real in-memory database. Every closure is called both ways: the row it
 * should find and the row it must refuse (missing, or another user's).
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  Asset,
  ImageDocument,
  initTestDb,
  Message,
  ModelObserver,
  Script,
  TimelineSequence
} from "@nodetool-ai/models";
import type { ProcessingContextModelInterfaces } from "@nodetool-ai/runtime";
import {
  createRuntimeContext,
  serverModelInterfaces
} from "../src/session/model-interfaces.js";

const USER = "user-1";
const OTHER = "user-2";

/**
 * The port type narrows every answer to `{id}`; tests re-widen to read the
 * fields they assert, and fail loudly on an unexpected null.
 */
function fields(value: { id: string } | null | undefined): Record<string, unknown> {
  if (value == null) throw new Error("expected a record, got null");
  return Object.fromEntries(Object.entries(value));
}

let ifaces: ProcessingContextModelInterfaces;

beforeEach(() => {
  initTestDb();
  ifaces = serverModelInterfaces();
});
afterEach(() => ModelObserver.clear());

describe("createMessage / getMessages", () => {
  it("persists a message with every optional field defaulted to null", async () => {
    const row = fields(
      await ifaces.createMessage!({
        userId: USER,
        req: { thread_id: "t1", role: "user" }
      })
    );
    expect(row.thread_id).toBe("t1");
    expect(row.role).toBe("user");
    expect(row.name).toBeNull();
    expect(row.content).toBeNull();
    expect(row.tool_calls).toBeNull();
    expect(row.tool_call_id).toBeNull();
    expect(row.workflow_id).toBeNull();

    const stored = await Message.find(String(row.id));
    expect(stored?.user_id).toBe(USER);
  });

  it("stores content and tool_calls raw, not double-encoded", async () => {
    const row = fields(
      await ifaces.createMessage!({
        userId: USER,
        req: {
          thread_id: "t1",
          role: "assistant",
          name: "bot",
          content: [{ type: "text", text: "hi" }],
          tool_calls: [{ id: "c1", name: "tool", args: { x: 1 } }],
          tool_call_id: "c0",
          workflow_id: "wf-1"
        }
      })
    );
    const stored = await Message.find(String(row.id));
    expect(stored?.content).toEqual([{ type: "text", text: "hi" }]);
    expect(stored?.tool_calls).toEqual([{ id: "c1", name: "tool", args: { x: 1 } }]);
    expect(stored?.workflow_id).toBe("wf-1");
  });

  it("scopes a thread's messages to the requesting user", async () => {
    await seedThread();
    const result = await ifaces.getMessages!({ userId: USER, threadId: "t1" });
    expect(result.messages.map((m) => m.id)).toEqual(["m1", "m2", "m3"]);
    expect(result.next).toBeNull();
  });

  it("pages forward through the thread via the returned cursor", async () => {
    await seedThread();
    const first = await ifaces.getMessages!({
      userId: USER,
      threadId: "t1",
      limit: 2
    });
    expect(first.messages.map((m) => m.id)).toEqual(["m1", "m2"]);
    expect(first.next).toBe("m2");

    const second = await ifaces.getMessages!({
      userId: USER,
      threadId: "t1",
      limit: 2,
      startKey: first.next
    });
    // m4 belongs to the other user and is filtered after pagination.
    expect(second.messages.map((m) => m.id)).toEqual(["m3"]);
    expect(second.next).toBeNull();
  });

  it("reads newest-first when reverse is set", async () => {
    await seedThread();
    const page = await ifaces.getMessages!({
      userId: USER,
      threadId: "t1",
      limit: 2,
      reverse: true
    });
    // Desc order is m4 (other user, filtered), m3; the cursor is the last
    // paginated row, not the last owned one.
    expect(page.messages.map((m) => m.id)).toEqual(["m3"]);
    expect(page.next).toBe("m3");
  });

  async function seedThread(): Promise<void> {
    const at = (n: number) => `2026-01-01T00:00:0${n}.000Z`;
    await Message.create({ id: "m1", user_id: USER, thread_id: "t1", role: "user", created_at: at(1) });
    await Message.create({ id: "m2", user_id: USER, thread_id: "t1", role: "assistant", created_at: at(2) });
    await Message.create({ id: "m3", user_id: USER, thread_id: "t1", role: "user", created_at: at(3) });
    await Message.create({ id: "m4", user_id: OTHER, thread_id: "t1", role: "user", created_at: at(4) });
  }
});

describe("listFolderAssets / getAssetInfo", () => {
  it("answers null for a missing folder and for a non-folder id", async () => {
    expect(
      await ifaces.listFolderAssets!({ userId: USER, folderId: "nope" })
    ).toBeNull();
    await Asset.create({ id: "f1", user_id: USER, name: "a.png", content_type: "image/png" });
    expect(
      await ifaces.listFolderAssets!({ userId: USER, folderId: "f1" })
    ).toBeNull();
  });

  it("lists files recursively, sorted by name, surviving a parent cycle", async () => {
    // Distinct created_at, newest-first traversal order (zebra before the
    // subfolder holding apple) — so the sorted output proves the sort ran.
    const at = (n: number) => `2026-01-01T00:00:0${n}.000Z`;
    await Asset.create({ id: "dirA", user_id: USER, name: "A", content_type: "folder", parent_id: "dirB", created_at: at(1) });
    await Asset.create({ id: "dirB", user_id: USER, name: "B", content_type: "folder", parent_id: "dirA", created_at: at(2) });
    await Asset.create({ id: "z", user_id: USER, name: "zebra.txt", content_type: "text/plain", parent_id: "dirA", created_at: at(3) });
    await Asset.create({ id: "a", user_id: USER, name: "apple.txt", content_type: "text/plain", parent_id: "dirB", created_at: at(4) });

    const out = await ifaces.listFolderAssets!({ userId: USER, folderId: "dirA" });
    expect(out).toEqual([
      { id: "a", content_type: "text/plain", name: "apple.txt" },
      { id: "z", content_type: "text/plain", name: "zebra.txt" }
    ]);
  });

  it("reads one asset's identity, defaulting missing metadata to null", async () => {
    await Asset.create({ id: "a1", user_id: USER, name: "pic.png", content_type: "image/png" });
    await Asset.create({
      id: "a2",
      user_id: USER,
      name: "tagged.png",
      content_type: "image/png",
      metadata: { alt: "hi" }
    });

    expect(await ifaces.getAssetInfo!({ userId: USER, assetId: "a1" })).toEqual({
      id: "a1",
      content_type: "image/png",
      name: "pic.png",
      metadata: null
    });
    expect(
      (await ifaces.getAssetInfo!({ userId: USER, assetId: "a2" }))?.metadata
    ).toEqual({ alt: "hi" });
    expect(await ifaces.getAssetInfo!({ userId: USER, assetId: "missing" })).toBeNull();
    expect(await ifaces.getAssetInfo!({ userId: OTHER, assetId: "a1" })).toBeNull();
  });
});

describe("image documents", () => {
  const doc = { sketch: { version: 3 }, layerBindings: [] };

  it("creates a document, defaulting the project", async () => {
    const created = fields(
      await ifaces.createImageDocument!({
        userId: USER,
        name: "Sketch",
        width: 640,
        height: 480,
        document: doc
      })
    );
    expect(created.projectId).toBe("default");
    expect(created.width).toBe(640);
    expect(created.document).toEqual(doc);

    const explicit = fields(
      await ifaces.createImageDocument!({
        userId: USER,
        name: "Sketch 2",
        projectId: "p9",
        width: 10,
        height: 10,
        document: doc
      })
    );
    expect(explicit.projectId).toBe("p9");
  });

  it("reads only the owner's document", async () => {
    const created = await ifaces.createImageDocument!({
      userId: USER,
      name: "Mine",
      width: 8,
      height: 8,
      document: doc
    });
    const id = created.id;
    expect(fields(await ifaces.getImageDocument!({ userId: USER, id })).name).toBe(
      "Mine"
    );
    expect(await ifaces.getImageDocument!({ userId: OTHER, id })).toBeNull();
    expect(await ifaces.getImageDocument!({ userId: USER, id: "missing" })).toBeNull();
    expect(await ImageDocument.findById(id)).not.toBeNull();
  });
});

describe("timeline sequences", () => {
  function seq(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return {
      projectId: "p1",
      name: "Cut",
      fps: 30,
      width: 1920,
      height: 1080,
      durationMs: 1000,
      tracks: [],
      clips: [],
      markers: [],
      ...overrides
    };
  }

  it("creates and reads back a sequence, owner-scoped", async () => {
    const created = fields(
      await ifaces.createTimelineSequence!({ userId: USER, sequence: seq() })
    );
    expect(created.name).toBe("Cut");
    const id = String(created.id);
    expect(
      fields(await ifaces.getTimelineSequence!({ userId: USER, id })).fps
    ).toBe(30);
    expect(await ifaces.getTimelineSequence!({ userId: OTHER, id })).toBeNull();
    expect(await ifaces.getTimelineSequence!({ userId: USER, id: "missing" })).toBeNull();
  });

  it("updates via CAS on the sequence's updatedAt, refusing stale writes", async () => {
    const created = fields(
      await ifaces.createTimelineSequence!({ userId: USER, sequence: seq() })
    );
    const id = String(created.id);

    const updated = fields(
      await ifaces.updateTimelineSequence!({
        userId: USER,
        id,
        sequence: seq({ name: "Recut", durationMs: 2000, updatedAt: created.updatedAt })
      })
    );
    expect(updated.name).toBe("Recut");
    expect(updated.durationMs).toBe(2000);

    const stale = await ifaces.updateTimelineSequence!({
      userId: USER,
      id,
      sequence: seq({ name: "Clobber", updatedAt: created.updatedAt })
    });
    expect(stale).toBeNull();
    expect((await TimelineSequence.findById(id))?.name).toBe("Recut");
  });

  it("refuses updates on missing sequences and other users' sequences", async () => {
    expect(
      await ifaces.updateTimelineSequence!({ userId: USER, id: "missing", sequence: seq() })
    ).toBeNull();
    const created = fields(
      await ifaces.createTimelineSequence!({ userId: USER, sequence: seq() })
    );
    expect(
      await ifaces.updateTimelineSequence!({
        userId: OTHER,
        id: String(created.id),
        sequence: seq({ updatedAt: created.updatedAt })
      })
    ).toBeNull();
  });
});

describe("scripts", () => {
  const doc = { cast: [], sections: [] };

  it("creates with defaults for name and project", async () => {
    const bare = fields(await ifaces.createScript!({ userId: USER, document: doc }));
    expect(bare.name).toBe("Untitled script");
    expect(bare.projectId).toBe("default");

    const named = fields(
      await ifaces.createScript!({
        userId: USER,
        name: "Trailer",
        projectId: "p2",
        document: doc
      })
    );
    expect(named.name).toBe("Trailer");
    expect(named.projectId).toBe("p2");
  });

  it("reads only the owner's script", async () => {
    const created = await ifaces.createScript!({ userId: USER, document: doc });
    const id = created.id;
    expect(fields(await ifaces.getScript!({ userId: USER, id })).id).toBe(id);
    expect(await ifaces.getScript!({ userId: OTHER, id })).toBeNull();
    expect(await ifaces.getScript!({ userId: USER, id: "missing" })).toBeNull();
  });

  it("patches document and timeline link independently", async () => {
    const created = await ifaces.createScript!({ userId: USER, document: doc });
    const id = created.id;

    const withDoc = fields(
      await ifaces.updateScript!({
        userId: USER,
        id,
        document: { cast: [], sections: [{ id: "s1" }] }
      })
    );
    expect(withDoc.document).toEqual({ cast: [], sections: [{ id: "s1" }] });

    const withTimeline = fields(
      await ifaces.updateScript!({ userId: USER, id, timelineId: "tl-1" })
    );
    expect(withTimeline.timelineId).toBe("tl-1");
    // The document-only patch above must have left the doc alone here.
    expect(withTimeline.document).toEqual({ cast: [], sections: [{ id: "s1" }] });

    expect((await Script.findById(id))?.timeline_id).toBe("tl-1");
  });

  it("refuses a stale baseUpdatedAt, a missing id, and another user's script", async () => {
    const created = await ifaces.createScript!({ userId: USER, document: doc });
    const id = created.id;

    expect(
      await ifaces.updateScript!({
        userId: USER,
        id,
        document: doc,
        baseUpdatedAt: "2000-01-01T00:00:00.000Z"
      })
    ).toBeNull();
    expect(
      await ifaces.updateScript!({ userId: USER, id: "missing", document: doc })
    ).toBeNull();
    expect(
      await ifaces.updateScript!({ userId: OTHER, id, document: doc })
    ).toBeNull();
  });
});

describe("createRuntimeContext", () => {
  it("builds a context with the server persistence installed", () => {
    const ctx = createRuntimeContext({
      jobId: "job-1",
      userId: USER,
      workspace: null
    });
    expect(ctx.jobId).toBe("job-1");
    expect(ctx.userId).toBe(USER);
    expect(ctx.workflowId).toBeNull();
    expect(ctx.threadId).toBeNull();
    expect(ctx.workspace).toBeNull();
    expect(ctx.workspaceDir).toBeNull();
    expect(ctx.assetOutputMode).toBe("native");
    // The interfaces under test, wired via setModelInterfaces.
    expect(ctx.hasModelInterface("createMessage")).toBe(true);
    expect(ctx.hasModelInterface("createAsset")).toBe(true);
    expect(ctx.hasModelInterface("updateScript")).toBe(true);
    expect(ctx.hasModelInterface("getJob")).toBe(false);
  });

  it("passes through workflow, thread, auth and output-mode options", () => {
    const ctx = createRuntimeContext({
      jobId: "job-2",
      workflowId: "wf-1",
      threadId: "t-1",
      userId: USER,
      workspace: null,
      authToken: "tok",
      assetOutputMode: "data_uri",
      persistOutputAssets: false
    });
    expect(ctx.workflowId).toBe("wf-1");
    expect(ctx.threadId).toBe("t-1");
    expect(ctx.authToken).toBe("tok");
    expect(ctx.assetOutputMode).toBe("data_uri");
    expect(ctx.persistOutputAssets).toBe(false);
  });
});
