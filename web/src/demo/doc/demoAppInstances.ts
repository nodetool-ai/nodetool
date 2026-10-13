/**
 * In-memory answers for the app-instance REST routes the mini-app runtime
 * calls on mount.
 *
 * `AppRuntimeView` loads or creates a server-side instance before it renders
 * any widget (`useAppInstance`). The replay has no backend, so without this
 * the surface stops at the instance error banner and the app never appears.
 * Only the two routes a replay reaches are answered: the default-instance
 * create and the variable save. Every other request goes to the real fetch.
 */
import type { AppInstanceRecord } from "@nodetool-ai/protocol/api-schemas/app-runs.js";

const DEFAULT_ROUTE = /\/api\/app-instances\/default$/;
const SAVE_ROUTE = /\/api\/app-instances\/([^/?]+)$/;
const EPOCH = new Date(0).toISOString();

let installed = false;
const instances = new Map<string, AppInstanceRecord>();

const json = (body: unknown): Response =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" }
  });

const requestPath = (input: RequestInfo | URL): string => {
  const raw =
    typeof input === "string"
      ? input
      : input instanceof URL
        ? input.href
        : input.url;
  return new URL(raw, "http://demo.local").pathname;
};

const parseBody = (init?: RequestInit): Record<string, unknown> => {
  if (typeof init?.body !== "string") {
    return {};
  }
  const parsed: unknown = JSON.parse(init.body);
  return parsed !== null && typeof parsed === "object"
    ? (parsed as Record<string, unknown>)
    : {};
};

const createDefault = (body: Record<string, unknown>): AppInstanceRecord => {
  const sourceId = String(body.source_id ?? "demo");
  const existing = instances.get(sourceId);
  if (existing) {
    return existing;
  }
  const record: AppInstanceRecord = {
    id: `demo-instance-${instances.size + 1}`,
    user_id: "demo",
    application_id: null,
    source_id: sourceId,
    name: "Demo",
    version: null,
    snapshot: body.snapshot as AppInstanceRecord["snapshot"],
    variables: (body.variables as Record<string, unknown>) ?? {},
    revision: 1,
    is_default: 1,
    created_at: EPOCH,
    updated_at: EPOCH
  };
  instances.set(sourceId, record);
  return record;
};

const save = (
  id: string,
  body: Record<string, unknown>
): AppInstanceRecord | undefined => {
  const entry = [...instances.entries()].find(([, record]) => record.id === id);
  if (!entry) {
    return undefined;
  }
  const [sourceId, record] = entry;
  const next: AppInstanceRecord = {
    ...record,
    variables: (body.variables as Record<string, unknown>) ?? record.variables,
    revision: record.revision + 1
  };
  instances.set(sourceId, next);
  return next;
};

/** Answer the app-instance routes from memory. Idempotent. */
export function installDemoAppInstances(): void {
  if (installed || typeof window === "undefined") {
    return;
  }
  installed = true;
  const realFetch = window.fetch.bind(window);
  window.fetch = async (input, init) => {
    const path = requestPath(input);
    const method = (init?.method ?? "GET").toUpperCase();
    if (method === "POST" && DEFAULT_ROUTE.test(path)) {
      return json(createDefault(parseBody(init)));
    }
    const saveMatch = method === "PATCH" ? SAVE_ROUTE.exec(path) : null;
    if (saveMatch) {
      const saved = save(decodeURIComponent(saveMatch[1]), parseBody(init));
      if (saved) {
        return json(saved);
      }
    }
    return realFetch(input, init);
  };
}
