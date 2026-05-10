import { createNodetoolClient } from "@nodetool-ai/sdk";

/**
 * Singleton client. Vite proxies `/trpc`, `/api`, and `/ws` to the NodeTool
 * server (default `http://localhost:7777`, override via `PROXY_API_TARGET`
 * env var when running `npm run dev`).
 *
 * Using empty `baseUrl` keeps requests same-origin so the dev proxy can
 * forward them; for production deployments, set `VITE_NODETOOL_API` and
 * pass it here.
 */
const apiBase = (import.meta.env.VITE_NODETOOL_API as string | undefined) ?? "";

export const nodetool = createNodetoolClient({
  baseUrl: apiBase || (typeof window !== "undefined" ? window.location.origin : "")
});
