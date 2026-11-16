/**
 * Editing instances (WP1.6, TC8) and capability negotiation (WP1.7, TC14),
 * against a real database through the tRPC routers.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TRPCError } from "@trpc/server";
import {
  ModelObserver,
  TimelineSequence,
  TimelineSequenceVersion,
  Workflow,
  WorkflowCollaborator,
  WorkflowVersion,
  initTestDb
} from "@nodetool-ai/models";
import * as sync from "@nodetool-ai/protocol/api-schemas/sync.js";
import { appRouter } from "../src/trpc/router.js";
import { createCallerFactory } from "../src/trpc/index.js";
import type { Context } from "../src/trpc/context.js";
import { KEPT_REVISION_LABEL } from "../src/lib/document-save-rules.js";

const createCaller = createCallerFactory(appRouter);

const ALICE = "a".repeat(32);
const BOB = "b".repeat(32);

/** Instance ids of three open documents: two apps of Alice, one of Bob. */
const EDITOR_APP = "1".repeat(32);
const TIMELINE_APP = "2".repeat(32);
const BOB_APP = "3".repeat(32);

function callerFor(
  userId: string,
  clientProtocol: number | null = null,
  nativeSessionId: string | null = null
) {
  return createCaller({
    userId,
    clientProtocol,
    nativeSessionId,
    registry: {} as never,
    apiOptions: { metadataRoots: [], registry: {} as never } as never,
    pythonBridge: {} as never,
    getPythonBridgeReady: () => false
  } as Context);
}

function graphOf(label: string) {
  return {
    nodes: [{ id: "n1", type: "nodetool.constant.String", data: { value: label } }],
    edges: []
  };
}

function labelOf(graph: unknown): unknown {
  const nodes = (graph as { nodes: Array<{ data: { value: unknown } }> }).nodes;
  return nodes[0]?.data.value;
}

async function keptVersions(workflowId: string): Promise<unknown[]> {
  const versions = await WorkflowVersion.listForWorkflow(workflowId);
  return versions
    .filter((v) => v.description === KEPT_REVISION_LABEL)
    .map((v) => labelOf(v.graph));
}

async function apiCodeOf(run: Promise<unknown>): Promise<unknown> {
  const error = await run.then(
    () => null,
    (e: unknown) => e
  );
  expect(error).toBeInstanceOf(TRPCError);
  return ((error as TRPCError).cause as { apiCode?: unknown } | undefined)
    ?.apiCode;
}

describe("editing instances keep a replaced revision (TC8)", () => {
  beforeEach(() => {
    initTestDb();
  });

  afterEach(() => {
    ModelObserver.clear();
  });

  it("keeps A's revision when B saves over it after a refused save", async () => {
    const alice = callerFor(ALICE);
    const bob = callerFor(BOB);
    const created = await alice.workflows.create({
      name: "Shared",
      access: "private",
      graph: graphOf("start")
    });
    await WorkflowCollaborator.upsert({
      workflowId: created.id,
      userId: BOB,
      role: "editor",
      invitedBy: ALICE
    });
    const bobBase = (await bob.workflows.get({ id: created.id })).updated_at;

    const aSaved = await alice.workflows.autosave({
      id: created.id,
      graph: graphOf("A"),
      force: true,
      editing_instance: EDITOR_APP,
      expected_updated_at: created.updated_at ?? undefined
    });
    // Bob's offline draft is refused against A's revision.
    expect(
      await apiCodeOf(
        bob.workflows.autosave({
          id: created.id,
          graph: graphOf("B"),
          force: true,
          editing_instance: BOB_APP,
          expected_updated_at: bobBase ?? undefined
        })
      )
    ).toBe("ALREADY_EXISTS");
    // He merges onto A's revision, and his draft wins.
    await bob.workflows.autosave({
      id: created.id,
      graph: graphOf("B"),
      force: true,
      editing_instance: BOB_APP,
      expected_updated_at: aSaved.updated_at ?? undefined
    });

    expect(labelOf((await Workflow.get(created.id))?.graph)).toBe("B");
    expect(await keptVersions(created.id)).toContain("A");

    const kept = (await WorkflowVersion.listForWorkflow(created.id)).find(
      (v) => v.description === KEPT_REVISION_LABEL && labelOf(v.graph) === "A"
    );
    await alice.workflows.versions.restore({
      id: created.id,
      version: kept?.version ?? -1
    });
    expect(labelOf((await Workflow.get(created.id))?.graph)).toBe("A");
  });

  it("keeps a version between the two apps of one person on one device session", async () => {
    const alice = callerFor(ALICE);
    const created = await alice.workflows.create({
      name: "Two apps",
      access: "private",
      graph: graphOf("start")
    });
    const fromEditor = await alice.workflows.update({
      id: created.id,
      name: "Two apps",
      graph: graphOf("editor"),
      editing_instance: EDITOR_APP,
      expected_updated_at: created.updated_at ?? undefined
    });
    // The same open document saving again continues its own save.
    const again = await alice.workflows.update({
      id: created.id,
      name: "Two apps",
      graph: graphOf("editor 2"),
      editing_instance: EDITOR_APP,
      expected_updated_at: fromEditor.updated_at ?? undefined
    });
    expect(await keptVersions(created.id)).toEqual(["start"]);

    await alice.workflows.update({
      id: created.id,
      name: "Two apps",
      graph: graphOf("timeline app"),
      editing_instance: TIMELINE_APP,
      expected_updated_at: again.updated_at ?? undefined
    });
    expect(await keptVersions(created.id)).toEqual(
      expect.arrayContaining(["start", "editor 2"])
    );
    expect(await keptVersions(created.id)).toHaveLength(2);
  });

  it("counts a save without an instance id as a new instance", async () => {
    const alice = callerFor(ALICE);
    const created = await alice.workflows.create({
      name: "Anonymous",
      access: "private",
      graph: graphOf("start")
    });
    const first = await alice.workflows.update({
      id: created.id,
      name: "Anonymous",
      graph: graphOf("one")
    });
    await alice.workflows.update({
      id: created.id,
      name: "Anonymous",
      graph: graphOf("two"),
      expected_updated_at: first.updated_at ?? undefined
    });
    expect(await keptVersions(created.id)).toEqual(
      expect.arrayContaining(["start", "one"])
    );
  });

  it("keeps no version for a save the compare-and-swap refuses", async () => {
    const alice = callerFor(ALICE);
    const created = await alice.workflows.create({
      name: "Stale",
      access: "private",
      graph: graphOf("start")
    });
    await alice.workflows.update({
      id: created.id,
      name: "Stale",
      graph: graphOf("fresh"),
      editing_instance: EDITOR_APP
    });
    const before = await keptVersions(created.id);
    expect(
      await apiCodeOf(
        alice.workflows.update({
          id: created.id,
          name: "Stale",
          graph: graphOf("late"),
          editing_instance: TIMELINE_APP,
          expected_updated_at: created.updated_at ?? undefined
        })
      )
    ).toBe("ALREADY_EXISTS");
    expect(await keptVersions(created.id)).toEqual(before);
  });

  it("keeps a timeline's revision when another app saves it", async () => {
    const alice = callerFor(ALICE);
    const seq = await alice.timeline.create({ name: "Cut", projectId: "default" });
    const marker = (label: string) => ({
      tracks: [],
      clips: [],
      markers: [{ id: "m", timeMs: 0, label }]
    });
    const first = await alice.timeline.update({
      id: seq.id,
      document: marker("editor"),
      editingInstance: EDITOR_APP
    });
    const second = await alice.timeline.update({
      id: seq.id,
      baseUpdatedAt: first.updatedAt,
      document: marker("editor 2"),
      editingInstance: EDITOR_APP
    });
    await alice.timeline.update({
      id: seq.id,
      baseUpdatedAt: second.updatedAt,
      document: marker("timeline app"),
      editingInstance: TIMELINE_APP
    });

    const kept = (await TimelineSequenceVersion.listForTimeline(seq.id)).filter(
      (v) => v.name === KEPT_REVISION_LABEL
    );
    const labels = kept.map(
      (v) => (JSON.parse(v.document) as { markers: Array<{ label: string }> }).markers[0]?.label
    );
    // The first save replaced the empty document from another (no) instance.
    expect(labels).toEqual(expect.arrayContaining([undefined, "editor 2"]));
    expect(labels).not.toContain("editor");
    expect((await TimelineSequence.get(seq.id))?.last_writer_instance).toBe(
      `${ALICE}:${TIMELINE_APP}`
    );
  });

  it("keeps one version when two writers save on the same base at once", async () => {
    const alice = callerFor(ALICE);
    const bob = callerFor(BOB);
    const created = await alice.workflows.create({
      name: "Race",
      access: "private",
      graph: graphOf("start")
    });
    await WorkflowCollaborator.upsert({
      workflowId: created.id,
      userId: BOB,
      role: "editor",
      invitedBy: ALICE
    });
    const base = created.updated_at ?? undefined;
    const results = await Promise.allSettled([
      alice.workflows.update({
        id: created.id,
        name: "Race",
        graph: graphOf("A"),
        editing_instance: EDITOR_APP,
        expected_updated_at: base
      }),
      bob.workflows.update({
        id: created.id,
        name: "Race",
        graph: graphOf("B"),
        editing_instance: BOB_APP,
        expected_updated_at: base
      })
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    // Only the save that won kept the revision it replaced.
    expect(await keptVersions(created.id)).toEqual(["start"]);
  });

  it("keeps no timeline version when the compare-and-set loses", async () => {
    const alice = callerFor(ALICE);
    const seq = await alice.timeline.create({ name: "Cut", projectId: "default" });
    const before = await TimelineSequenceVersion.listForTimeline(seq.id);
    const insert = vi
      .spyOn(TimelineSequence, "updateFieldsIfUnchanged")
      .mockImplementationOnce(async () => null);
    await expect(
      alice.timeline.update({
        id: seq.id,
        document: { tracks: [], clips: [], markers: [] },
        editingInstance: TIMELINE_APP
      })
    ).rejects.toBeInstanceOf(TRPCError);
    insert.mockRestore();
    expect(await TimelineSequenceVersion.listForTimeline(seq.id)).toEqual(before);
  });

  it("binds the writer to the account, so another account's same id keeps a version", async () => {
    const alice = callerFor(ALICE);
    const bob = callerFor(BOB);
    const created = await alice.workflows.create({
      name: "Bound",
      access: "private",
      graph: graphOf("start")
    });
    await WorkflowCollaborator.upsert({
      workflowId: created.id,
      userId: BOB,
      role: "editor",
      invitedBy: ALICE
    });
    const fromAlice = await alice.workflows.update({
      id: created.id,
      name: "Bound",
      graph: graphOf("alice"),
      editing_instance: EDITOR_APP
    });
    const kept = (await keptVersions(created.id)).length;
    await bob.workflows.update({
      id: created.id,
      name: "Bound",
      graph: graphOf("bob"),
      editing_instance: EDITOR_APP,
      expected_updated_at: fromAlice.updated_at ?? undefined
    });
    expect(await keptVersions(created.id)).toHaveLength(kept + 1);
    expect(await keptVersions(created.id)).toContain("alice");
  });

  it("keeps the current graph on a workflow restore, and records the restorer", async () => {
    const alice = callerFor(ALICE);
    const created = await alice.workflows.create({
      name: "Restore",
      access: "private",
      graph: graphOf("old")
    });
    const v1 = await alice.workflows.versions.create({ id: created.id, name: "v1" });
    const current = await alice.workflows.update({
      id: created.id,
      name: "Restore",
      graph: graphOf("current"),
      editing_instance: EDITOR_APP
    });

    await alice.workflows.versions.restore({
      id: created.id,
      version: v1.version,
      editing_instance: TIMELINE_APP
    });

    const versions = await WorkflowVersion.listForWorkflow(created.id);
    const before = versions.find(
      (v) => v.description === `Before restore to v${v1.version}`
    );
    expect(labelOf(before?.graph)).toBe("current");
    const restored = await Workflow.get(created.id);
    expect(labelOf(restored?.graph)).toBe("old");
    expect(restored?.last_writer_instance).toBe(`${ALICE}:${TIMELINE_APP}`);
    expect(restored?.updated_at).not.toBe(current.updated_at);

    // The editor app saving next replaces the restorer's revision.
    const keptBefore = (await keptVersions(created.id)).length;
    await alice.workflows.update({
      id: created.id,
      name: "Restore",
      graph: graphOf("after"),
      editing_instance: EDITOR_APP,
      expected_updated_at: restored?.updated_at
    });
    expect(await keptVersions(created.id)).toHaveLength(keptBefore + 1);
  });

  it("restores a timeline with the restorer as writer, keeping what it replaced", async () => {
    const alice = callerFor(ALICE);
    const seq = await alice.timeline.create({ name: "Cut", projectId: "default" });
    const v1 = await alice.timeline.versions.create({ id: seq.id, name: "v1" });
    await alice.timeline.update({
      id: seq.id,
      document: { tracks: [], clips: [], markers: [{ id: "m", timeMs: 0, label: "now" }] },
      editingInstance: TIMELINE_APP
    });

    await alice.timeline.versions.restore({
      id: seq.id,
      version: v1.version,
      editingInstance: EDITOR_APP
    });

    const row = await TimelineSequence.get(seq.id);
    expect(row?.last_writer_instance).toBe(`${ALICE}:${EDITOR_APP}`);
    const versions = await TimelineSequenceVersion.listForTimeline(seq.id);
    const before = versions.find((v) => v.name === `Before restore to v${v1.version}`);
    expect(before?.document).toContain('"label":"now"');
  });

  it("refuses an editing instance id that is not 32 hex characters", async () => {
    const alice = callerFor(ALICE);
    const created = await alice.workflows.create({
      name: "Bad id",
      access: "private",
      graph: graphOf("start")
    });
    await expect(
      alice.workflows.update({
        id: created.id,
        name: "Bad id",
        graph: graphOf("x"),
        editing_instance: "not-an-id"
      })
    ).rejects.toThrow();
  });
});

describe("capability negotiation (TC14)", () => {
  beforeEach(() => {
    initTestDb();
  });

  afterEach(() => {
    ModelObserver.clear();
  });

  it("reports the protocol and the schema versions per kind", async () => {
    const caps = await callerFor(ALICE).sync.capabilities();
    expect(caps).toEqual({
      protocol_version: sync.SYNC_PROTOCOL_VERSION,
      min_client_protocol_version: sync.MIN_CLIENT_PROTOCOL_VERSION,
      kinds: {
        workflow: { read: [1], write: [1], modes: ["whole"] },
        timeline: { read: [1], write: [1], modes: ["whole"] }
      }
    });
  });

  it("refuses a save in a lower schema version and changes nothing", async () => {
    const alice = callerFor(ALICE);
    const created = await alice.workflows.create({
      name: "Newer",
      access: "private",
      graph: graphOf("v2 content")
    });
    // A newer server wrote this document in schema version 2.
    const row = await Workflow.get(created.id);
    if (!row) throw new Error("workflow missing");
    row.schema_version = 2;
    await row.save();
    const before = await Workflow.get(created.id);

    expect(
      await apiCodeOf(
        alice.workflows.autosave({
          id: created.id,
          graph: graphOf("reduced"),
          force: true,
          schema_version: 1
        })
      )
    ).toBe("SCHEMA_DOWNGRADE");
    expect(
      await apiCodeOf(
        alice.workflows.update({ id: created.id, name: "Newer", graph: graphOf("reduced") })
      )
    ).toBe("SCHEMA_DOWNGRADE");

    const after = await Workflow.get(created.id);
    expect(labelOf(after?.graph)).toBe("v2 content");
    expect(after?.updated_at).toBe(before?.updated_at);
    expect(await keptVersions(created.id)).toEqual([]);
  });

  it("refuses a timeline save in a lower schema version", async () => {
    const alice = callerFor(ALICE);
    const seq = await alice.timeline.create({ name: "Cut", projectId: "default" });
    const row = await TimelineSequence.get(seq.id);
    if (!row) throw new Error("timeline missing");
    row.schema_version = 2;
    await row.save();

    expect(
      await apiCodeOf(
        alice.timeline.update({
          id: seq.id,
          document: { tracks: [], clips: [], markers: [] },
          schemaVersion: 1
        })
      )
    ).toBe("SCHEMA_DOWNGRADE");
    // A rename does not write the document and is not a downgrade.
    await alice.timeline.update({ id: seq.id, name: "Renamed" });
    expect((await TimelineSequence.get(seq.id))?.name).toBe("Renamed");
  });

  it("refuses a schema version this server does not write", async () => {
    const alice = callerFor(ALICE);
    const created = await alice.workflows.create({
      name: "Future",
      access: "private",
      graph: graphOf("start")
    });
    expect(
      await apiCodeOf(
        alice.workflows.update({
          id: created.id,
          name: "Future",
          graph: graphOf("x"),
          schema_version: 2
        })
      )
    ).toBe("INVALID_INPUT");
  });

  it("lets a too-old client read but refuses its writes", async () => {
    const alice = callerFor(ALICE);
    const created = await alice.workflows.create({
      name: "Old client",
      access: "private",
      graph: graphOf("start")
    });
    const old = callerFor(ALICE, sync.MIN_CLIENT_PROTOCOL_VERSION - 1);

    expect((await old.workflows.get({ id: created.id })).name).toBe("Old client");
    expect((await old.workflows.list({})).workflows.map((w) => w.id)).toContain(created.id);
    expect(
      await apiCodeOf(
        old.workflows.update({ id: created.id, name: "Old client", graph: graphOf("x") })
      )
    ).toBe("CLIENT_TOO_OLD");

    const current = callerFor(ALICE, sync.SYNC_PROTOCOL_VERSION);
    await current.workflows.update({ id: created.id, name: "Old client", graph: graphOf("y") });
    expect(labelOf((await Workflow.get(created.id))?.graph)).toBe("y");
  });

  it("refuses writes from a native session that names no protocol version", async () => {
    const alice = callerFor(ALICE);
    const created = await alice.workflows.create({
      name: "Native",
      access: "private",
      graph: graphOf("start")
    });
    const native = callerFor(ALICE, null, "f".repeat(32));
    expect((await native.workflows.get({ id: created.id })).name).toBe("Native");
    expect(
      await apiCodeOf(
        native.workflows.update({ id: created.id, name: "Native", graph: graphOf("x") })
      )
    ).toBe("CLIENT_TOO_OLD");
    const versioned = callerFor(ALICE, sync.SYNC_PROTOCOL_VERSION, "f".repeat(32));
    await versioned.workflows.update({ id: created.id, name: "Native", graph: graphOf("y") });
    expect(labelOf((await Workflow.get(created.id))?.graph)).toBe("y");
  });

  it("reads a save without a version from a client without the header as the legacy schema", async () => {
    const versions = sync.DOCUMENT_SCHEMA_VERSIONS as Record<string, number>;
    const shipped = versions.workflow;
    versions.workflow = 2;
    try {
      const current = callerFor(ALICE, sync.SYNC_PROTOCOL_VERSION);
      const created = await current.workflows.create({
        name: "Fence",
        access: "private",
        graph: graphOf("start")
      });
      // A client shipped with this server writes the current schema.
      await current.workflows.update({ id: created.id, name: "Fence", graph: graphOf("v2") });
      expect((await Workflow.get(created.id))?.schema_version).toBe(2);
      expect((await current.workflows.get({ id: created.id })).schema_version).toBe(2);

      const legacy = callerFor(ALICE);
      expect(
        await apiCodeOf(
          legacy.workflows.update({ id: created.id, name: "Fence", graph: graphOf("v1") })
        )
      ).toBe("SCHEMA_DOWNGRADE");
      expect(labelOf((await Workflow.get(created.id))?.graph)).toBe("v2");
    } finally {
      versions.workflow = shipped;
    }
  });

  it("returns the stored schema version on a timeline read", async () => {
    const alice = callerFor(ALICE);
    const seq = await alice.timeline.create({ name: "Cut", projectId: "default" });
    expect((await alice.timeline.get({ id: seq.id })).schemaVersion).toBe(1);
  });

  it("reads the protocol version from the request header", () => {
    expect(sync.clientProtocolVersion(undefined)).toBeNull();
    expect(sync.clientProtocolVersion("3")).toBe(3);
    expect(sync.clientProtocolVersion(["2", "5"])).toBe(2);
    expect(sync.clientProtocolVersion("abc")).toBe(0);
    expect(sync.clientProtocolVersion("0")).toBe(0);
  });
});
