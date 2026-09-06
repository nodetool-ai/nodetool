/**
 * Client helpers for the shipped example apps:
 *   GET  /api/applications/examples                → ExampleAppSummary[]
 *   POST /api/applications/examples/:slug/install  → the created app
 *
 * An example app is a curated bundle on disk; installing one creates the app
 * and the workflows it binds in the user's library, through the same import
 * path an uploaded bundle takes (`applicationBundle.ts`).
 */
import {
  applicationResponse,
  exampleAppSummary,
  type ExampleAppSummary
} from "@nodetool-ai/protocol/api-schemas/applications.js";
import { restFetch } from "../lib/rest-fetch";
import { isObjectLike } from "./typePredicates";

export type { ExampleAppSummary };

const installedApp = applicationResponse.pick({ id: true, name: true });
export type InstalledExampleApp = ReturnType<typeof installedApp.parse>;

async function failureDetail(res: Response, fallback: string): Promise<string> {
  const data: unknown = await res.json().catch(() => null);
  return data && isObjectLike(data) && "detail" in data
    ? String(data.detail)
    : fallback;
}

/** Every shipped example app, in the order the server lists them. */
export async function listExampleApps(): Promise<ExampleAppSummary[]> {
  const res = await restFetch("/api/applications/examples", { method: "GET" });
  if (!res.ok) {
    throw new Error(
      await failureDetail(res, `Loading example apps failed (${res.status})`)
    );
  }
  return exampleAppSummary.array().parse(await res.json());
}

/** Install one example: the server creates its workflows, then the app. */
export async function installExampleApp(
  slug: string,
  projectId = "default"
): Promise<InstalledExampleApp> {
  const res = await restFetch(
    `/api/applications/examples/${encodeURIComponent(slug)}/install`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ projectId })
    }
  );
  if (!res.ok) {
    throw new Error(await failureDetail(res, `Install failed (${res.status})`));
  }
  return installedApp.parse(await res.json());
}
