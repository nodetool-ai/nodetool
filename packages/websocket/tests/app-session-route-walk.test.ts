/**
 * The `nda_` route walk: what a deployed app's session token opens on the real
 * server.
 *
 * A visitor to a deployed mini app holds a token that authenticates as the
 * app's *owner*. The auth hook in `server.ts` is the only thing that keeps it
 * confined: it grants the token on `/ws` and refuses it everywhere else. A
 * unit test of the hook's branch cannot tell whether that holds for the routes
 * the server actually registers, so this test boots the real server
 * (`startServer`, NODETOOL_ENV=production), deploys an app, mints a session
 * through the public route, and walks every route the live Fastify instance
 * registered — collected from `onRoute`, not from a hand-kept list, so a route
 * added later is walked without anyone editing this file.
 *
 * Each walked request carries a probe header. A `preParsing` hook, installed
 * on the root instance before any route exists, answers a probed request
 * itself and records the identity the auth chain resolved, so no handler ever
 * runs and the walk has no side effects. A route the probe never reaches was
 * refused by an `onRequest` hook; a route it reaches tells us exactly which
 * user and app scope the token turned into.
 *
 * The loopback trust bypass is turned off, so the walk sees what a remote
 * visitor sees. An owner credential (SERVER_AUTH_TOKEN) walks the same routes
 * as a control: every refusal of the `nda_` token must be a refusal of *that*
 * token, not of everything.
 *
 * Harness: `public-app-deployments` in
 * packages/cli-harness/src/harness/registry.ts.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AddressInfo } from "node:net";
import type { FastifyInstance, RouteOptions } from "fastify";
import WebSocket from "ws";
import { createEmptyDocument } from "@nodetool-ai/app-runtime";
import {
  Application,
  Workflow,
  publishApplication,
  setApplicationBudget
} from "@nodetool-ai/models";
import { mintAppSessionToken } from "@nodetool-ai/auth";
import { deriveKey, getMasterKey } from "@nodetool-ai/security";

import { isPublicAuthExemptRoute } from "../src/lib/public-routes.js";
import { isSdkV1DiscoveryRequest } from "../src/sdk/sdk-route-policy.js";
import {
  packWebSocketMessage,
  unpackWebSocketMessage
} from "../src/messagepack.js";

const PROBE_HEADER = "x-nda-route-walk";
const PROBE_STATUS = 299;
const OWNER_TOKEN = "route-walk-owner-token-0123456789abcdef";
const OWNER_ID = "1";

interface ProbeIdentity {
  userId: string | null;
  appSession: { applicationId: string; version: number } | null;
}

/**
 * Every route the server registers, and the probe hook, both installed on the
 * instance `server.ts` creates. Hoisted so the `fastify` mock below can reach
 * them.
 */
const walk = vi.hoisted(() => ({
  routes: [] as Array<{ method: string; url: string }>,
  seen: new Map<string, unknown>()
}));

vi.mock("fastify", async (importOriginal) => {
  const actual = await importOriginal<typeof import("fastify")>();
  const create = actual.default as unknown as (
    ...args: unknown[]
  ) => FastifyInstance;
  const wrapped = (...args: unknown[]): FastifyInstance => {
    const instance = create(...args);
    instance.addHook("onRoute", (route: RouteOptions) => {
      const methods = Array.isArray(route.method)
        ? route.method
        : [route.method];
      for (const method of methods) {
        walk.routes.push({ method: String(method), url: route.url });
      }
    });
    // preParsing runs after every onRequest hook (the auth hook among them)
    // and before body parsing, validation, and the handler.
    instance.addHook("preParsing", async (request, reply) => {
      const probe = request.headers[PROBE_HEADER];
      if (typeof probe !== "string") return;
      walk.seen.set(probe, {
        userId: request.userId ?? null,
        appSession: request.appSession ?? null
      } satisfies ProbeIdentity);
      reply.code(PROBE_STATUS).send({ probe });
      return reply;
    });
    return instance;
  };
  return { ...actual, default: Object.assign(wrapped, actual.default) };
});

const ENV_KEYS = [
  "DB_PATH",
  "NODETOOL_ENV",
  "PORT",
  "HOST",
  "NODETOOL_TRUST_LOCALHOST",
  "NODETOOL_RATE_LIMIT_DISABLED",
  "SERVER_AUTH_TOKEN"
] as const;
const savedEnv = Object.fromEntries(
  ENV_KEYS.map((key) => [key, process.env[key]])
);

let app: FastifyInstance;
let port: number;
let deploymentToken: string;
let session: { token: string; applicationId: string; version: number };

/** A concrete path the route's pattern matches. */
function concretePath(url: string): string {
  return url
    .replace(/:[A-Za-z0-9_]+\([^)]*\)/g, "1")
    .replace(/:[A-Za-z0-9_]+/g, "route-walk-param")
    .replace(/\*/g, "route-walk-rest");
}

let probeCounter = 0;

/**
 * Send one probed request. Returns the identity the auth chain resolved when
 * the request got past every `onRequest` hook, or the status it was refused
 * with when it did not.
 */
async function probe(
  method: string,
  path: string,
  headers: Record<string, string>
): Promise<{ reached: ProbeIdentity | null; status: number }> {
  const id = `probe-${++probeCounter}`;
  const response = await app.inject({
    method: method as "GET",
    url: path,
    headers: { ...headers, [PROBE_HEADER]: id }
  });
  const reached = (walk.seen.get(id) as ProbeIdentity | undefined) ?? null;
  return { reached, status: response.statusCode };
}

/** The routes worth walking: every method and pattern, once. */
function walkedRoutes(): Array<{ method: string; url: string; path: string }> {
  const unique = new Map<string, { method: string; url: string; path: string }>();
  for (const route of walk.routes) {
    unique.set(`${route.method} ${route.url}`, {
      ...route,
      path: concretePath(route.url)
    });
  }
  return [...unique.values()].sort((a, b) =>
    `${a.url} ${a.method}`.localeCompare(`${b.url} ${b.method}`)
  );
}

/** Open a socket and report whether the upgrade was accepted. */
function connect(
  path: string,
  headers: Record<string, string> = {}
): Promise<{ socket: WebSocket | null; status: number }> {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(`ws://127.0.0.1:${port}${path}`, { headers });
    socket.once("open", () => resolve({ socket, status: 101 }));
    socket.once("unexpected-response", (_req, res) => {
      res.resume();
      socket.terminate();
      resolve({ socket: null, status: res.statusCode ?? 0 });
    });
    socket.once("error", (error) => {
      // An unexpected-response already resolved; anything else is a failure.
      if (socket.readyState !== WebSocket.CLOSED) reject(error);
    });
  });
}

/**
 * Send one command and wait for its reply. Legacy replies carry no request id,
 * and the session answers commands in order, so the reply is the next frame
 * that is not a heartbeat.
 */
function command(
  socket: WebSocket,
  name: string,
  data: Record<string, unknown> = {}
): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`no reply to ${name}`)),
      10_000
    );
    const onMessage = (raw: WebSocket.RawData) => {
      const bytes = Array.isArray(raw)
        ? Buffer.concat(raw)
        : Buffer.from(raw as ArrayBuffer);
      const frame = unpackWebSocketMessage<Record<string, unknown>>(bytes);
      if (frame.type === "ping") return;
      clearTimeout(timer);
      socket.off("message", onMessage);
      resolve(frame);
    };
    socket.on("message", onMessage);
    socket.send(
      packWebSocketMessage({ command: name, data })
    );
  });
}

const appSessionKey = (): Buffer =>
  deriveKey(getMasterKey(), "nodetool-app-session");

beforeAll(async () => {
  const dir = mkdtempSync(join(tmpdir(), "nodetool-nda-route-walk-"));
  process.env["DB_PATH"] = join(dir, "nodetool.sqlite3");
  process.env["NODETOOL_ENV"] = "production";
  process.env["PORT"] = "0";
  process.env["HOST"] = "127.0.0.1";
  process.env["NODETOOL_TRUST_LOCALHOST"] = "false";
  process.env["NODETOOL_RATE_LIMIT_DISABLED"] = "1";
  process.env["SERVER_AUTH_TOKEN"] = OWNER_TOKEN;

  const { startServer } = await import("../src/server.js");
  // No node packs: the walk is about the HTTP surface, and a pack-free
  // registry keeps the boot keyless and fast.
  app = await startServer({
    packSource: {
      register: () => undefined,
      setEnabled: () => undefined,
      unavailableReason: () => undefined,
      registerProviders: () => undefined
    }
  });
  port = (app.server.address() as AddressInfo).port;

  // The owner publishes an app with one workflow operation and a finite
  // budget, then deploys it — the same preconditions the product enforces.
  // The workflow belongs to another author and is public. Publishing over
  // the owner's own workflow writes a version row with save_type "publish",
  // which the migrated SQLite schema's CHECK constraint still refuses.
  await Workflow.create<Workflow>({
    id: "route-walk-wf",
    user_id: "route-walk-author",
    access: "public",
    name: "Graph",
    graph: { nodes: [{ id: "n1", type: "nodetool.text.Concat" }], edges: [] }
  });
  const document = createEmptyDocument("Route walk");
  document.operations = [
    {
      id: "main",
      name: "Run",
      workflowId: "route-walk-wf",
      inputs: {},
      outputs: {},
      policy: "replace"
    }
  ];
  const application = await Application.create<Application>({
    user_id: OWNER_ID,
    project_id: "default",
    name: "Route walk app",
    description: "",
    document: JSON.stringify(document)
  });
  await setApplicationBudget(application.id, { maxInvocations: 10 });
  await publishApplication(application);
  const { deployApplication } = await import(
    "../src/lib/app-deployment-service.js"
  );
  deploymentToken = (await deployApplication(OWNER_ID, application.id)).token;

  // The visitor's path: no credential, just the hidden link.
  const minted = await app.inject({
    method: "POST",
    url: `/api/apps/${deploymentToken}/session`
  });
  expect(minted.statusCode).toBe(200);
  session = minted.json();
  expect(session.token.startsWith("nda_")).toBe(true);
}, 240_000);

afterAll(async () => {
  await app?.close();
  for (const key of ENV_KEYS) {
    if (savedEnv[key] === undefined) delete process.env[key];
    else process.env[key] = savedEnv[key];
  }
});

describe("an nda_ session token on the live server", () => {
  it("walks a route table collected from the server itself", () => {
    const routes = walkedRoutes();
    // A server that registered nothing would make every assertion below
    // vacuous. The real one registers hundreds.
    expect(routes.length).toBeGreaterThan(50);
    expect(routes.some((r) => r.method === "GET" && r.url === "/ws")).toBe(
      true
    );
    expect(routes.some((r) => r.url.startsWith("/trpc"))).toBe(true);
  });

  it("reaches no route other than /ws as the owner", async () => {
    const visitor = { authorization: `Bearer ${session.token}` };
    const opened: string[] = [];
    const notRefused: string[] = [];

    for (const route of walkedRoutes()) {
      // The hook grants the token on the path `/ws` whatever the method; the
      // tests below pin what that path does with it.
      if (route.path === "/ws") continue;
      // Preflight never runs the auth hook (the CORS plugin answers it), so it
      // is checked only for the identity it carries, below.
      const anonymous = await probe(route.method, route.path, {});
      const { reached, status } = await probe(route.method, route.path, visitor);
      const label = `${route.method} ${route.url} → ${status}`;
      if (reached && (reached.userId !== null || reached.appSession !== null)) {
        opened.push(`${label} as ${JSON.stringify(reached)}`);
      }
      // A route a caller with no credential reaches is public, and the token
      // adds nothing there. Every other route must refuse it at the door.
      if (!anonymous.reached && route.method !== "OPTIONS" && status !== 401) {
        notRefused.push(label);
      }
    }

    expect(opened).toEqual([]);
    expect(notRefused).toEqual([]);
  });

  it("names every public route it let through as a deliberate exemption", async () => {
    // A route reachable with no credential must be one the auth hook exempts
    // on purpose. Otherwise the walk above would read "public" off a route
    // that is merely broken open.
    const unexplained: string[] = [];
    for (const route of walkedRoutes()) {
      if (route.method === "OPTIONS") continue;
      const { reached } = await probe(route.method, route.path, {});
      if (!reached) continue;
      if (
        isPublicAuthExemptRoute(route.path, route.method) ||
        isSdkV1DiscoveryRequest(route.path, route.method)
      ) {
        continue;
      }
      unexplained.push(`${route.method} ${route.url}`);
    }
    expect(unexplained).toEqual([]);
  });

  it("is refused only as itself: an owner credential reaches every non-public route", async () => {
    const owner = { authorization: `Bearer ${OWNER_TOKEN}` };
    const refused: string[] = [];
    let walked = 0;
    for (const route of walkedRoutes()) {
      if (route.method === "OPTIONS") continue;
      const anonymous = await probe(route.method, route.path, {});
      if (anonymous.reached) continue;
      walked += 1;
      const { reached, status } = await probe(route.method, route.path, owner);
      if (reached?.userId !== OWNER_ID) {
        refused.push(`${route.method} ${route.url} → ${status}`);
      }
    }
    expect(walked).toBeGreaterThan(50);
    expect(refused).toEqual([]);
  });

  it("serves nothing over plain HTTP on /ws", async () => {
    for (const method of ["GET", "HEAD"] as const) {
      const response = await app.inject({
        method,
        url: "/ws",
        headers: { authorization: `Bearer ${session.token}` }
      });
      expect(response.statusCode).toBeGreaterThanOrEqual(400);
    }
  });

  it("opens /ws scoped to the one app it was minted for", async () => {
    const { reached } = await probe("GET", "/ws", {
      authorization: `Bearer ${session.token}`,
      upgrade: "websocket",
      connection: "Upgrade",
      "sec-websocket-key": "dGhlIHNhbXBsZSBub25jZQ==",
      "sec-websocket-version": "13"
    });
    expect(reached).toEqual({
      userId: OWNER_ID,
      appSession: {
        applicationId: session.applicationId,
        version: session.version
      }
    });
  });

  it("upgrades /ws with the token in the query string or the header", async () => {
    for (const attempt of [
      connect(`/ws?api_key=${encodeURIComponent(session.token)}`),
      connect("/ws", { authorization: `Bearer ${session.token}` })
    ]) {
      const { socket, status } = await attempt;
      expect(status).toBe(101);
      socket?.close();
    }
  });

  it("refuses every other socket path, including /ws/download", async () => {
    for (const path of ["/ws/download", "/ws/", "/ws/anything"]) {
      const { status } = await connect(
        `${path}?api_key=${encodeURIComponent(session.token)}`
      );
      expect({ path, status }).toEqual({ path, status: 401 });
    }
  });

  it("refuses an expired, tampered or foreign-key token on /ws", async () => {
    const scope = {
      userId: OWNER_ID,
      applicationId: session.applicationId,
      version: session.version
    };
    const expired = mintAppSessionToken(appSessionKey(), scope, -60).token;
    const foreign = mintAppSessionToken("not-the-server-key", scope, 600).token;
    const tampered = `${session.token.slice(0, -2)}${
      session.token.endsWith("AA") ? "BB" : "AA"
    }`;
    for (const token of [expired, foreign, tampered]) {
      const { status } = await connect(
        `/ws?api_key=${encodeURIComponent(token)}`
      );
      expect(status).toBe(401);
    }
  });

  it("answers only the app session commands over the socket", async () => {
    const { socket } = await connect(
      `/ws?api_key=${encodeURIComponent(session.token)}`
    );
    expect(socket).not.toBeNull();
    try {
      const refused = await command(socket!, "get_assets", {});
      expect(refused.error).toBe(
        "This command is not available for a published app"
      );
      const status = await command(socket!, "get_status", {});
      expect(status.error).not.toBe(
        "This command is not available for a published app"
      );
    } finally {
      socket!.close();
    }
  });

  it("stops working outside production, at the door and at the mint", async () => {
    process.env["NODETOOL_ENV"] = "development";
    try {
      const { status } = await connect(
        `/ws?api_key=${encodeURIComponent(session.token)}`
      );
      expect(status).toBe(401);
      const minted = await app.inject({
        method: "POST",
        url: `/api/apps/${deploymentToken}/session`
      });
      expect(minted.statusCode).toBe(404);
    } finally {
      process.env["NODETOOL_ENV"] = "production";
    }
  });
});
