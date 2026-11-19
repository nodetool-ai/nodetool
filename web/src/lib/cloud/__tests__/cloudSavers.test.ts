/**
 * @jest-environment node
 *
 * The scenarios of the native saver tests (native/account/tests/cloud.cpp,
 * workflowSaverSendsTheGraph through saverSignedOutAndOffline), run against
 * the TypeScript savers with a fake server.
 */
import { createHash } from "node:crypto";

import { CloudRequestError } from "../cloudFetch";
import {
  TIMELINE_KIND,
  TrpcCloudSaver,
  WORKFLOW_KIND,
  WORKFLOW_SCHEMA_VERSION,
  TIMELINE_SCHEMA_VERSION,
  type CloudDocumentKind
} from "../cloudSavers";
import type { CloudDocumentKey } from "../CloudDocumentSaver";

const SERVER = "https://nt.example";
const SERVER_KEY = "k-nt";
const INSTANCE = "0123456789abcdef0123456789abcdef";
const BASE = { updatedAt: "r0", contentHash: "h0" };
const CAPABILITIES = {
  protocol_version: 1,
  min_client_protocol_version: 1,
  kinds: {
    workflow: { read: [1], write: [1], modes: ["whole"] },
    timeline: { read: [1], write: [1], modes: ["whole"] }
  }
};
const WORKFLOW_KEY: CloudDocumentKey = { serverKey: SERVER_KEY, accountId: "u1", kind: "workflow", documentId: "w1" };
const TIMELINE_KEY: CloudDocumentKey = { serverKey: SERVER_KEY, accountId: "u1", kind: "timeline", documentId: "t1" };

interface Sent {
  url: string;
  method: string;
  body: Record<string, unknown> | null;
}

type Reply = Response | (() => Response);

function json(status: number, body: unknown): Response {
  return new Response(typeof body === "string" ? body : JSON.stringify(body), { status });
}

/** A server that answers POSTs with `reply`, reads with `latest` and capabilities with `capabilities`. */
function server(kind: CloudDocumentKind) {
  const state = {
    reply: (_body: Record<string, unknown>): Reply => json(200, { result: { data: { updated_at: "r1", updatedAt: "r1" } } }),
    latest: (_url: string): Reply => json(404, {}),
    capabilities: (): Reply => json(200, CAPABILITIES),
    sent: [] as Sent[]
  };
  const fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = String(input);
    const method = init?.method ?? "GET";
    const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : null;
    state.sent.push({ url, method, body });
    const answer = url.endsWith("/api/sync/capabilities")
      ? state.capabilities()
      : method === "POST"
        ? state.reply(body ?? {})
        : state.latest(url);
    return typeof answer === "function" ? answer() : answer;
  };
  const saver = new TrpcCloudSaver({ serverOrigin: SERVER, serverKey: SERVER_KEY, accountId: "u1", fetch }, kind);
  return { state, saver, saves: () => state.sent.filter((s) => s.method === "POST") };
}

const sha = (text: string): string => createHash("sha256").update(text).digest("hex");

describe("the cloud savers", () => {
  it("sends the workflow graph on the revision it edits", async () => {
    const { state, saver, saves } = server(WORKFLOW_KIND);
    state.reply = () => json(200, { result: { data: { id: "w1", updated_at: "2026-11-16T10:00:00Z" } } });
    saver.setAccess("w1", { role: "viewer", options: { allowHistory: false, allowDownload: false, allowDuplicate: false } });
    const draft = '{"nodes":[],"edges":[]}';
    const result = await saver.save(WORKFLOW_KEY, INSTANCE, { updatedAt: "2026-11-16T09:00:00Z", contentHash: "h0" }, draft);
    expect(result.status).toBe("ok");
    expect(result.base).toEqual({ updatedAt: "2026-11-16T10:00:00Z", contentHash: sha(draft) });
    expect(result.role).toBe("viewer");
    expect(saves()).toHaveLength(1);
    expect(saves()[0].url).toBe(`${SERVER}/trpc/workflows.autosave`);
    expect(saves()[0].body).toMatchObject({
      id: "w1",
      graph: { nodes: [], edges: [] },
      expected_updated_at: "2026-11-16T09:00:00Z",
      editing_instance: INSTANCE,
      schema_version: WORKFLOW_SCHEMA_VERSION,
      force: true
    });
  });

  it("sends the workflow's name beside the graph, and none for a graph-only or empty name", async () => {
    const { state, saver, saves } = server(WORKFLOW_KIND);
    state.reply = () => json(200, { result: { data: { id: "w1", updated_at: "r2" } } });
    expect((await saver.save(WORKFLOW_KEY, INSTANCE, BASE, '{"graph":{"nodes":[],"edges":[]},"name":"Renamed"}')).status).toBe("ok");
    expect((await saver.save(WORKFLOW_KEY, INSTANCE, BASE, '{"graph":{"nodes":[],"edges":[]},"name":""}')).status).toBe("ok");
    expect((await saver.save(WORKFLOW_KEY, INSTANCE, BASE, '{"graph":{"nodes":{}},"name":"Bad"}')).status).toBe("refused");
    expect(saves()).toHaveLength(2);
    expect(saves()[0].body).toMatchObject({ name: "Renamed" });
    expect(saves()[0].body?.graph).not.toHaveProperty("name");
    expect(saves()[1].body).not.toHaveProperty("name");
  });

  it("sends the timeline document, with the frame rate and size as columns", async () => {
    const { state, saver, saves } = server(TIMELINE_KIND);
    state.reply = () => json(200, { result: { data: { json: { id: "t1", updatedAt: "r2" } } } });
    const result = await saver.save(TIMELINE_KEY, INSTANCE, { updatedAt: "r1", contentHash: "h1" }, '{"tracks":[],"fps":24,"width":1920,"height":"tall"}');
    expect(result.status).toBe("ok");
    expect(result.base.updatedAt).toBe("r2");
    expect(result.role).toBe("editor");
    expect(saves()[0].url).toBe(`${SERVER}/trpc/timeline.update`);
    expect(saves()[0].body).toEqual({
      id: "t1",
      editingInstance: INSTANCE,
      schemaVersion: TIMELINE_SCHEMA_VERSION,
      fps: 24,
      width: 1920,
      document: { tracks: [] },
      baseUpdatedAt: "r1"
    });
  });

  it("refuses a save without a base, and a draft of another account or server, without a request", async () => {
    const { state, saver } = server(TIMELINE_KIND);
    expect(await saver.save(TIMELINE_KEY, INSTANCE, { updatedAt: "", contentHash: "" }, "{}")).toMatchObject({
      status: "refused",
      reason: "NO_BASE"
    });
    for (const key of [
      { ...TIMELINE_KEY, accountId: "u2" },
      { ...TIMELINE_KEY, serverKey: "k-other" }
    ]) {
      expect(await saver.save(key, INSTANCE, BASE, "{}")).toMatchObject({ status: "signedOut", reason: "OTHER_ACCOUNT" });
      expect((await saver.open(key)).status).toBe("signedOut");
    }
    expect(state.sent).toEqual([]);
  });

  it("sends a conflicting draft again on the latest revision", async () => {
    const { state, saver, saves } = server(WORKFLOW_KIND);
    state.reply = (body) =>
      body.expected_updated_at !== "r9"
        ? json(409, { error: { json: { data: { apiCode: "ALREADY_EXISTS" } } } })
        : json(200, { result: { data: { updated_at: "r10" } } });
    state.latest = (url) => {
      expect(url).toContain("/trpc/workflows.get?input=");
      return json(200, { result: { data: { id: "w1", updated_at: "r9", schema_version: 1, graph: {} } } });
    };
    const draft = '{"nodes":[1],"edges":[]}';
    const result = await saver.save(WORKFLOW_KEY, INSTANCE, BASE, draft);
    expect(result.status).toBe("ok");
    expect(result.base.updatedAt).toBe("r10");
    expect(saves().map((s) => s.body?.expected_updated_at)).toEqual(["r0", "r9"]);
    expect(saves()[1].body).toMatchObject({ graph: { nodes: [1] }, editing_instance: INSTANCE });

    // A latest revision in a newer schema is never replaced.
    state.latest = () => json(200, { result: { data: { updated_at: "r9b", schema_version: 2 } } });
    expect(await saver.save(WORKFLOW_KEY, INSTANCE, BASE, draft)).toMatchObject({ status: "refused", reason: "SCHEMA_DOWNGRADE" });
    // When the latest revision cannot be read, the save waits.
    state.latest = () => json(503, "");
    expect((await saver.save(WORKFLOW_KEY, INSTANCE, BASE, draft)).status).toBe("offline");
    // A document that keeps changing is tried again later, not refused.
    state.latest = () => json(200, { result: { data: { updated_at: "r8" } } });
    expect((await saver.save(WORKFLOW_KEY, INSTANCE, BASE, draft)).status).toBe("offline");
  });

  it("sorts retryable failures apart from refusals", async () => {
    const { state, saver } = server(TIMELINE_KIND);
    for (const status of [408, 429, 500, 503]) {
      state.reply = () => json(status, {});
      expect((await saver.save(TIMELINE_KEY, INSTANCE, BASE, "{}")).status).toBe("offline");
    }
    state.reply = () => json(404, {});
    expect(await saver.save(TIMELINE_KEY, INSTANCE, BASE, "{}")).toMatchObject({ status: "refused", reason: "HTTP_404" });
  });

  it("writes only to a server that takes this client's saves, and reads the capabilities once", async () => {
    const draft = '{"nodes":[],"edges":[]}';
    for (const [capabilities, status, reason] of [
      [json(404, "not found"), "refused", "SERVER_UNSUPPORTED"],
      [json(200, { min_client_protocol_version: 2, kinds: {} }), "refused", "CLIENT_TOO_OLD"],
      [json(200, { min_client_protocol_version: 1, kinds: { workflow: { write: [2], modes: ["whole"] } } }), "refused", "SERVER_UNSUPPORTED"],
      [json(200, { min_client_protocol_version: 1, kinds: { workflow: { write: [1], modes: [] } } }), "refused", "SERVER_UNSUPPORTED"],
      [json(503, ""), "offline", ""]
    ] as const) {
      const { state, saver, saves } = server(WORKFLOW_KIND);
      state.capabilities = () => capabilities;
      expect(await saver.save(WORKFLOW_KEY, INSTANCE, BASE, draft)).toMatchObject({ status, reason });
      expect(saves()).toEqual([]);
    }
    const { state, saver } = server(WORKFLOW_KIND);
    expect((await saver.save(WORKFLOW_KEY, INSTANCE, BASE, draft)).status).toBe("ok");
    expect((await saver.save(WORKFLOW_KEY, INSTANCE, BASE, draft)).status).toBe("ok");
    expect(state.sent).toHaveLength(3);
  });

  it("opens a document stored in a newer schema read-only, and never sends its save", async () => {
    const { state, saver, saves } = server(TIMELINE_KIND);
    let stored = 1;
    state.latest = () => json(200, { result: { data: { id: "t1", updatedAt: "r1", schemaVersion: stored } } });
    const opened = await saver.open(TIMELINE_KEY);
    expect(opened).toMatchObject({ status: "ok", writable: true, schemaVersion: 1, base: { updatedAt: "r1" } });

    stored = 2;
    const newer = await saver.open(TIMELINE_KEY);
    expect(newer).toMatchObject({ status: "ok", writable: false, reason: "SCHEMA_DOWNGRADE" });
    expect(await saver.save(TIMELINE_KEY, INSTANCE, newer.base, "{}")).toMatchObject({ status: "refused", reason: "SCHEMA_DOWNGRADE" });
    expect(saves()).toEqual([]);
  });

  it("reports the server's code, and an answer without the new revision as invalid", async () => {
    const { state, saver } = server(WORKFLOW_KIND);
    const draft = '{"nodes":[],"edges":[]}';
    state.reply = () =>
      json(409, { error: { json: { message: "x", data: { code: "CONFLICT", httpStatus: 409, apiCode: "SCHEMA_DOWNGRADE" } } } });
    expect(await saver.save(WORKFLOW_KEY, INSTANCE, BASE, draft)).toMatchObject({ status: "refused", reason: "SCHEMA_DOWNGRADE" });
    state.reply = () => json(403, "not json");
    expect(await saver.save(WORKFLOW_KEY, INSTANCE, BASE, draft)).toMatchObject({ status: "refused", reason: "HTTP_403" });
    state.reply = () => json(503, "");
    expect((await saver.save(WORKFLOW_KEY, INSTANCE, BASE, draft)).status).toBe("offline");
    state.reply = () => json(200, { result: { data: {} } });
    expect(await saver.save(WORKFLOW_KEY, INSTANCE, BASE, draft)).toMatchObject({ status: "refused", reason: "INVALID_RESPONSE" });
  });

  it("keeps an unreadable workflow draft as unsent instead of sending it", async () => {
    const { saver, saves } = server(WORKFLOW_KIND);
    for (const draft of ["not json", "[]", '{"nodes":[]}', '{"nodes":{},"edges":[]}']) {
      expect(await saver.save(WORKFLOW_KEY, INSTANCE, BASE, draft)).toMatchObject({ status: "refused", reason: "INVALID_DRAFT" });
    }
    expect(saves()).toEqual([]);
  });

  it("waits while signed out and while the server cannot be reached", async () => {
    const signedOut = server(TIMELINE_KIND);
    const signedOutSaver = new TrpcCloudSaver(
      {
        serverOrigin: SERVER,
        serverKey: SERVER_KEY,
        accountId: "u1",
        fetch: async () => {
          throw new CloudRequestError("SIGNED_OUT");
        }
      },
      TIMELINE_KIND
    );
    expect((await signedOutSaver.save(TIMELINE_KEY, INSTANCE, BASE, "{}")).status).toBe("signedOut");
    expect(signedOut.state.sent).toEqual([]);

    const offlineSaver = new TrpcCloudSaver(
      {
        serverOrigin: SERVER,
        serverKey: SERVER_KEY,
        accountId: "u1",
        fetch: async () => {
          throw new TypeError("network");
        }
      },
      TIMELINE_KIND
    );
    expect((await offlineSaver.save(TIMELINE_KEY, INSTANCE, BASE, "{}")).status).toBe("offline");
  });
});
