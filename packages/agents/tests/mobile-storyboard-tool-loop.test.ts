/**
 * Keyless harness for the mobile document surface (harness id
 * `mobile-document-tools`).
 *
 * The mobile chat agent edits a storyboard through client-side `ui_storyboard_*`
 * tools (mobile/ARCHITECTURE.md § Documents). This suite drives that contract
 * the way the tool-loop evals drive the web surfaces, with a scripted agent and
 * no model, against mobile's own code: the tool registry and manifest, the
 * `tool_call` → `tool_result` round trip, the agent bridge, the storyboard
 * handler, the per-document store, and the `resources.*` backend. Only the
 * tRPC client is replaced, by an in-memory server that applies the same
 * revision check and conflict message as `packages/websocket`'s resources
 * router. The document each session leaves on that server is validated with
 * the protocol's `storyboardDocument` schema, the shape web and the storyboards
 * router read.
 *
 * `mobile/` is not a root workspace and its dependency tree is separate, so the
 * suite lives here and imports mobile sources by path. Those sources import
 * only `zustand` at runtime, which the root tree provides.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { storyboards } from "@nodetool-ai/protocol/api-schemas";

// ── In-memory resources server ──────────────────────────────────────────────

interface ServerRow {
  name: string;
  document: unknown;
  revision: number;
  updatedAt: string;
}

const server = {
  rows: new Map<string, ServerRow>(),
  writes: 0
};

/** The server's resources.update outcome on a stale ref, verbatim. */
const conflictMessage = (kind: string): string =>
  `${kind} resource was modified since it was read (optimistic concurrency conflict)`;

const detail = (kind: string, id: string, row: ServerRow) => ({
  ref: { kind, id, revision: row.revision },
  name: row.name,
  projectId: "default",
  contentType: null,
  updatedAt: row.updatedAt,
  // A round trip through JSON, as the row's TEXT column does.
  document: JSON.parse(JSON.stringify(row.document)) as unknown
});

const fakeClient = {
  resources: {
    read: {
      query: async ({ ref }: { ref: { kind: string; id: string } }) => {
        const row = server.rows.get(ref.id);
        if (!row) throw new Error(`${ref.kind} resource not found`);
        return detail(ref.kind, ref.id, row);
      }
    },
    update: {
      mutate: async (input: {
        ref: { kind: string; id: string; revision?: number };
        name?: string;
        document?: unknown;
      }) => {
        const row = server.rows.get(input.ref.id);
        if (!row) throw new Error(`${input.ref.kind} resource not found`);
        if (input.ref.revision !== undefined && input.ref.revision !== row.revision) {
          throw new Error(conflictMessage(input.ref.kind));
        }
        server.writes += 1;
        const next: ServerRow = {
          name: input.name ?? row.name,
          document: input.document === undefined ? row.document : JSON.parse(JSON.stringify(input.document)),
          revision: row.revision + 1,
          updatedAt: new Date(Date.parse(row.updatedAt) + 1000).toISOString()
        };
        server.rows.set(input.ref.id, next);
        return detail(input.ref.kind, input.ref.id, next);
      }
    }
  }
};

vi.mock("../../../mobile/src/trpc/client", () => ({
  createMobileTRPCClient: () => fakeClient
}));

const { documentStore, resetDocumentStores } = await import(
  "../../../mobile/src/documents/documentStore"
);
const { registerDocumentHandler, resetDocumentHandlers } = await import(
  "../../../mobile/src/documents/agentBridge"
);
const { createStoryboardAgentHandler } = await import(
  "../../../mobile/src/documents/storyboardAgentHandler"
);
const { MobileToolRegistry, executeToolCall } = await import(
  "../../../mobile/src/documents/tools"
);
type StoryboardDocument = import("../../../mobile/src/documents/storyboardTypes").StoryboardDocument;

// ── Fixtures ────────────────────────────────────────────────────────────────

const BOARD_ID = "0123456789abcdef0123456789abcdef";

function seedBoard(id: string): void {
  const document = storyboards.storyboardDocument.parse({
    screenplay: null,
    shots: [
      {
        type: "shot",
        id: "shot-seed",
        index: 0,
        action: "A lighthouse on a cliff at dusk",
        status: "planned"
      }
    ],
    brief: "",
    style: "",
    aspectRatio: "16:9",
    directorModel: null,
    imageModel: null,
    videoModel: null
  });
  server.rows.set(id, {
    name: "Lighthouse",
    document,
    revision: 1,
    updatedAt: "2026-01-01T00:00:00.000Z"
  });
}

/**
 * Open a board the way StoryboardEditorScreen does: load the store, then
 * register the handler on the bridge under the board's id.
 */
async function openBoard(id: string) {
  const store = documentStore<StoryboardDocument>("storyboard", id);
  await store.getState().load();
  let selected: string | null = null;
  const handler = createStoryboardAgentHandler({
    boardId: id,
    store,
    fallbackTitle: "Storyboard",
    getSelectedShotId: () => selected,
    selectShot: (next: string | null) => {
      selected = next;
    }
  });
  registerDocumentHandler("storyboard", id, store.getState().name, handler);
  return store;
}

// ── Scripted agent ──────────────────────────────────────────────────────────

interface ToolResultMessage {
  type: string;
  tool_call_id: string;
  thread_id: string;
  ok: boolean;
  result?: unknown;
  error?: string;
}

/**
 * Plays the server's half of the wire: each call is checked against the
 * parameter schema the client advertised in its manifest (a provider holds the
 * model to that schema), sent as a `tool_call`, and answered by mobile's own
 * `executeToolCall`.
 */
function createScriptedAgent() {
  const manifest = new Map(
    MobileToolRegistry.getManifest().map((entry) => [entry.name, entry])
  );
  const called = new Set<string>();
  let seq = 0;

  async function call(name: string, args: Record<string, unknown>): Promise<ToolResultMessage> {
    const entry = manifest.get(name);
    if (entry) {
      const parsed = z.fromJSONSchema(entry.parameters).safeParse(args);
      if (!parsed.success) {
        throw new Error(`Scripted call to ${name} violates the manifest schema: ${parsed.error.message}`);
      }
    }
    called.add(name);
    const sent: ToolResultMessage[] = [];
    const id = `call_${++seq}`;
    await executeToolCall(
      { type: "tool_call", tool_call_id: id, name, args, thread_id: "thread-1" },
      { send: (message) => sent.push(message as unknown as ToolResultMessage) }
    );
    expect(sent, `${name} answered exactly once`).toHaveLength(1);
    expect(sent[0]).toMatchObject({ type: "tool_result", tool_call_id: id, thread_id: "thread-1" });
    return sent[0];
  }

  return { call, called, manifest };
}

function expectOk(message: ToolResultMessage): Record<string, unknown> {
  expect(message.error, message.error).toBeUndefined();
  expect(message.ok).toBe(true);
  return message.result as Record<string, unknown>;
}

function savedDocument(id: string) {
  const row = server.rows.get(id);
  if (!row) throw new Error(`no server row ${id}`);
  const parsed = storyboards.storyboardDocument.safeParse(row.document);
  if (!parsed.success) {
    throw new Error(`Saved storyboard fails the protocol schema: ${parsed.error.message}`);
  }
  return { row, document: parsed.data };
}

beforeEach(() => {
  server.rows.clear();
  server.writes = 0;
  resetDocumentStores();
  resetDocumentHandlers();
});

// ── Cases ───────────────────────────────────────────────────────────────────

describe("mobile storyboard tool manifest", () => {
  it("advertises object schemas that convert to a validator", () => {
    const entries = MobileToolRegistry.getManifest();
    expect(entries.length).toBeGreaterThan(0);
    for (const entry of entries) {
      expect(entry.name).toMatch(/^ui_storyboard_/);
      expect(entry.parameters.type).toBe("object");
      expect(entry.parameters.required).toContain("storyboard_id");
      const schema = z.fromJSONSchema(entry.parameters);
      expect(schema.safeParse({}).success, `${entry.name} must reject a call with no storyboard_id`).toBe(false);
    }
  });
});

describe("mobile storyboard tool loop", () => {
  it("edits a board through every tool and saves a schema-valid document", async () => {
    seedBoard(BOARD_ID);
    const store = await openBoard(BOARD_ID);
    const agent = createScriptedAgent();
    const sb = { storyboard_id: BOARD_ID };

    const initial = expectOk(await agent.call("ui_storyboard_get_state", sb));
    expect(initial).toMatchObject({ boardId: BOARD_ID, title: "Lighthouse" });

    expectOk(await agent.call("ui_storyboard_set_brief", { ...sb, brief: "A keeper's last night." }));
    expectOk(await agent.call("ui_storyboard_set_style", { ...sb, style: "grainy 16mm, muted teal" }));
    expectOk(await agent.call("ui_storyboard_set_aspect_ratio", { ...sb, aspect_ratio: "9:16" }));

    const opening = expectOk(
      await agent.call("ui_storyboard_add_shot", {
        ...sb,
        action: "Waves break below the cliff",
        camera: { framing: "wide", movement: "slow push in" },
        durationSeconds: 4,
        index: 0
      })
    ).shot as { id: string; index: number };
    expect(opening.index).toBe(0);
    const closing = expectOk(
      await agent.call("ui_storyboard_add_shot", { ...sb, action: "The lamp goes dark", motion: "light fades" })
    ).shot as { id: string; index: number };
    expect(closing.index).toBe(2);

    expectOk(
      await agent.call("ui_storyboard_update_shot", {
        ...sb,
        target: "1",
        slug: "Lighthouse at dusk",
        camera: { lens: "35mm" }
      })
    );
    expectOk(await agent.call("ui_storyboard_reorder_shot", { ...sb, target: closing.id, to_index: 0 }));
    expectOk(await agent.call("ui_storyboard_select_shot", { ...sb, target: opening.id }));
    const removed = expectOk(await agent.call("ui_storyboard_remove_shot", { ...sb, target: "selected" }))
      .shot as { id: string };
    expect(removed.id).toBe(opening.id);
    expectOk(await agent.call("ui_storyboard_select_shot", { ...sb, target: null }));

    expect(store.getState().dirty).toBe(true);
    expect(server.writes).toBe(0);
    const saved = expectOk(await agent.call("ui_storyboard_save", sb));
    expect(saved).toMatchObject({ ok: true });

    // Every advertised tool was driven, so a new tool without a case fails here.
    expect([...agent.called].sort()).toEqual([...agent.manifest.keys()].sort());

    const { row, document } = savedDocument(BOARD_ID);
    expect(server.writes).toBe(1);
    expect(row.revision).toBe(2);
    expect(store.getState()).toMatchObject({ dirty: false, status: "idle", token: 2 });
    expect(document).toMatchObject({
      brief: "A keeper's last night.",
      style: "grainy 16mm, muted teal",
      aspectRatio: "9:16"
    });
    expect(document.shots.map((shot) => shot.index)).toEqual([0, 1]);
    expect(document.shots.map((shot) => shot.id)).toEqual([closing.id, "shot-seed"]);
    expect(document.shots[1]).toMatchObject({
      slug: "Lighthouse at dusk",
      camera: { lens: "35mm" },
      status: "planned"
    });

    const reread = expectOk(await agent.call("ui_storyboard_get_state", sb));
    expect(reread.shots).toHaveLength(2);
  });

  it("answers every bad call with an error the agent can recover from", async () => {
    seedBoard(BOARD_ID);
    await openBoard(BOARD_ID);
    const agent = createScriptedAgent();

    const wrongBoard = await agent.call("ui_storyboard_get_state", { storyboard_id: "not-open" });
    expect(wrongBoard.ok).toBe(false);
    expect(wrongBoard.error).toContain(`Open storyboard ids: ${BOARD_ID}`);

    const wrongShot = await agent.call("ui_storyboard_update_shot", {
      storyboard_id: BOARD_ID,
      target: "7",
      action: "x"
    });
    expect(wrongShot.ok).toBe(false);
    expect(wrongShot.error).toContain("Shot ids: shot-seed");

    const noSelection = await agent.call("ui_storyboard_remove_shot", {
      storyboard_id: BOARD_ID,
      target: "selected"
    });
    expect(noSelection.ok).toBe(false);
    expect(noSelection.error).toContain("No shot is selected");

    const unknown = await agent.call("ui_storyboard_generate_clip", { storyboard_id: BOARD_ID });
    expect(unknown).toMatchObject({ ok: false, error: "Unsupported tool: ui_storyboard_generate_clip" });

    // Nothing above changed the board, so nothing reached the server.
    expect(server.writes).toBe(0);
    savedDocument(BOARD_ID);
  });

  it("refuses a save over a newer server revision and leaves the row intact", async () => {
    seedBoard(BOARD_ID);
    const store = await openBoard(BOARD_ID);
    const agent = createScriptedAgent();

    expectOk(await agent.call("ui_storyboard_set_brief", { storyboard_id: BOARD_ID, brief: "mine" }));

    // Someone else saves the board from the desktop app first.
    const before = server.rows.get(BOARD_ID)!;
    server.rows.set(BOARD_ID, {
      ...before,
      document: { ...(before.document as object), brief: "theirs" },
      revision: before.revision + 1
    });

    const save = await agent.call("ui_storyboard_save", { storyboard_id: BOARD_ID });
    expect(save.ok).toBe(false);
    expect(save.error).toContain("optimistic concurrency conflict");
    expect(store.getState()).toMatchObject({ status: "conflict", dirty: true });

    const { document } = savedDocument(BOARD_ID);
    expect(document.brief).toBe("theirs");
  });
});
