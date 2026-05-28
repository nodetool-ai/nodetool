/**
 * Test-only helpers that wire a {@link ProcessingContext} to in-memory fakes
 * for every external dependency a workflow might touch.
 *
 * The goal is to let workflow examples *execute* end-to-end inside a unit
 * test without making any provider call, opening any socket, or touching
 * the user's file system. Imports are kept lean so the module stays cheap
 * to load from any package's tests.
 */
import { importNodeBuiltin } from "@nodetool-ai/config";

const os = (await importNodeBuiltin<typeof import("node:os")>(
  "node:os"
)) as typeof import("node:os");
const path = (await importNodeBuiltin<typeof import("node:path")>(
  "node:path"
)) as typeof import("node:path");
const fs = (await importNodeBuiltin<typeof import("node:fs")>(
  "node:fs"
)) as typeof import("node:fs");
import { ProcessingContext, InMemoryStorageAdapter, MemoryCache } from "./context.js";
import { FakeProvider } from "./providers/fake-provider.js";
import type { BaseProvider } from "./providers/base-provider.js";

export interface FakeContextOptions {
  /**
   * Override the fake provider returned for any providerId. Useful when a
   * test wants to assert call shape (e.g. last messages) or inject a
   * scripted-response provider for one specific id.
   */
  providers?: Record<string, BaseProvider>;
  /**
   * Default provider used when `providers[providerId]` is not set. When
   * omitted, a fresh `FakeProvider` is created on first request and cached.
   */
  defaultProvider?: BaseProvider;
  /**
   * Override `fetch`. Defaults to a stub that returns an empty `200 OK`
   * `text/plain` response for any URL so HTTP nodes don't hang or hit
   * the network.
   */
  fetchFn?: (input: string, init?: RequestInit) => Promise<Response>;
  /**
   * Override secret resolution. By default the fake context returns
   * empty string for every secret — provider calls go through the
   * fake-provider resolver and never consult secrets, while nodes that
   * use real API keys (e.g. SerpAPI-backed search) fail fast with
   * "<KEY> is required" rather than reaching the real network with a
   * junk credential.
   *
   * Return `null` from this callback to fall back to the empty default;
   * return any string to override.
   */
  secretResolver?: (key: string) => string | null;
  /**
   * Variables exposed to nodes via `context.getVariable()`. Defaults to
   * an empty object.
   */
  variables?: Record<string, unknown>;
  /**
   * Workspace directory. When omitted, a fresh temp dir is created under
   * `os.tmpdir()` for the duration of the context.
   */
  workspaceDir?: string;
  /**
   * Job id reported to message consumers. Defaults to "fake-job".
   */
  jobId?: string;
}

export interface FakeContextHandle {
  context: ProcessingContext;
  /** Temp workspace directory created for this context (always present). */
  workspaceDir: string;
  /** All providers handed out by `getProvider`, keyed by providerId. */
  providers: Map<string, BaseProvider>;
  /**
   * Convenience cleanup — removes the temp workspace dir. Safe to call
   * multiple times; safe to skip (Node's tmpdir self-cleans eventually).
   */
  cleanup(): void;
}

/**
 * Default `fetch` stub. Returns an empty `200 OK` `text/plain` response
 * for every URL. Real workflows expecting JSON will get `{}` back.
 */
function defaultFakeFetch(): (
  input: string,
  init?: RequestInit
) => Promise<Response> {
  return async (input: string, _init?: RequestInit) => {
    const url = typeof input === "string" ? input : String(input);
    const body = url.endsWith(".json") || url.includes("/api/") ? "{}" : "";
    return new Response(body, {
      status: 200,
      headers: { "content-type": "text/plain" }
    });
  };
}

/**
 * Build a ProcessingContext wired to in-memory storage, an in-memory cache,
 * a fake-provider resolver, and a stubbed `fetch`. The returned handle owns
 * the temp workspace dir; call `cleanup()` when done.
 */
export function createFakeContext(
  options: FakeContextOptions = {}
): FakeContextHandle {
  const ownsWorkspaceDir = options.workspaceDir == null;
  const workspaceDir =
    options.workspaceDir ??
    fs.mkdtempSync(path.join(os.tmpdir(), "nodetool-fake-ws-"));

  const providers = new Map<string, BaseProvider>();
  for (const [id, prov] of Object.entries(options.providers ?? {})) {
    providers.set(id, prov);
  }

  const context = new ProcessingContext({
    jobId: options.jobId ?? "fake-job",
    userId: "fake-user",
    workspaceDir,
    cache: new MemoryCache(),
    storage: new InMemoryStorageAdapter(),
    workspaceStorage: new InMemoryStorageAdapter(),
    variables: options.variables ?? {},
    fetchFn: options.fetchFn ?? defaultFakeFetch(),
    secretResolver: (key: string) => {
      if (options.secretResolver) {
        const v = options.secretResolver(key);
        if (v !== null) return v;
      }
      // Default to empty so nodes that bypass the provider abstraction
      // (e.g. SerpAPI search nodes calling `fetch` directly) error out on
      // a missing key instead of hitting the real network with a junk
      // credential. Providers don't consult this resolver because the
      // provider-resolver short-circuits the secret lookup.
      return "";
    }
  });

  context.setProviderResolver((providerId: string) => {
    const existing = providers.get(providerId);
    if (existing) return existing;
    const fresh = options.defaultProvider ?? new FakeProvider();
    providers.set(providerId, fresh);
    return fresh;
  });

  return {
    context,
    workspaceDir,
    providers,
    cleanup: () => {
      // Only remove the workspace dir if we created it. When the caller
      // supplied their own path, leave the directory alone — a stray
      // `rm -rf` on a caller-owned path would be dangerous.
      if (!ownsWorkspaceDir) return;
      try {
        fs.rmSync(workspaceDir, { recursive: true, force: true });
      } catch {
        // Best effort — tests that already cleaned up shouldn't fail here.
      }
    }
  };
}

/**
 * Replace `globalThis.fetch` with a stub that returns a `200 OK` empty
 * response. Returns a restore function that puts the original `fetch`
 * back. Useful for tests that touch nodes which bypass
 * {@link ProcessingContext}'s fetch indirection (e.g. SerpAPI-backed
 * search nodes that call `fetch` directly) and would otherwise reach
 * the real network with stub credentials.
 *
 * Pass a `responder` to return per-URL responses instead of the empty
 * default — handy when a test wants to assert behaviour on a specific
 * endpoint.
 */
export function stubGlobalFetch(
  responder?: (url: string, init?: RequestInit) => Response | Promise<Response>
): () => void {
  const original = globalThis.fetch;
  const stub = async (
    input: RequestInfo | URL,
    init?: RequestInit
  ): Promise<Response> => {
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.toString()
          : (input as Request).url;
    if (responder) {
      return responder(url, init);
    }
    const body = url.endsWith(".json") || url.includes("/api/") ? "{}" : "";
    return new Response(body, {
      status: 200,
      headers: { "content-type": "text/plain" }
    });
  };
  (globalThis as unknown as { fetch: typeof fetch }).fetch =
    stub as typeof fetch;
  return () => {
    (globalThis as unknown as { fetch: typeof fetch }).fetch = original;
  };
}
