/**
 * Shared test setup: spins up a real HTTP server backed by an in-memory DB
 * so every integration test exercises the full HTTP stack (routing, headers,
 * status codes, JSON serialisation) exactly as the frontend sees it.
 */
import { type Server } from "node:http";
import { type AddressInfo } from "node:net";
import { initTestDb } from "@nodetool/models";
import { createHttpApiServer } from "../../src/http-api.js";

let server: Server;
let baseUrl: string;

export function getBaseUrl(): string {
  return baseUrl;
}

/** Start the HTTP server on a random port with a fresh in-memory DB. */
export async function startServer(): Promise<void> {
  initTestDb();
  server = createHttpApiServer();
  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address() as AddressInfo;
      baseUrl = `http://127.0.0.1:${addr.port}`;
      resolve();
    });
  });
}

/** Shut the server down. */
export async function stopServer(): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.close((err) => (err ? reject(err) : resolve()));
  });
}

// ── Request helpers ─────────────────────────────────────────────────

const DEFAULT_HEADERS: Record<string, string> = {
  "content-type": "application/json",
  "x-user-id": "test-user",
};

function headers(extra: Record<string, string> = {}): Record<string, string> {
  return { ...DEFAULT_HEADERS, ...extra };
}

export function api(path: string): string {
  return `${baseUrl}/api${path}`;
}

export async function get(
  path: string,
  opts: { userId?: string } = {}
): Promise<Response> {
  return fetch(api(path), {
    headers: headers(opts.userId ? { "x-user-id": opts.userId } : {}),
  });
}

export async function post(
  path: string,
  body: unknown,
  opts: { userId?: string } = {}
): Promise<Response> {
  return fetch(api(path), {
    method: "POST",
    headers: headers(opts.userId ? { "x-user-id": opts.userId } : {}),
    body: JSON.stringify(body),
  });
}

export async function put(
  path: string,
  body: unknown,
  opts: { userId?: string } = {}
): Promise<Response> {
  return fetch(api(path), {
    method: "PUT",
    headers: headers(opts.userId ? { "x-user-id": opts.userId } : {}),
    body: JSON.stringify(body),
  });
}

export async function del(
  path: string,
  opts: { userId?: string } = {}
): Promise<Response> {
  return fetch(api(path), {
    method: "DELETE",
    headers: headers(opts.userId ? { "x-user-id": opts.userId } : {}),
  });
}
