/**
 * Test-only helpers that wire a {@link ProcessingContext} to in-memory fakes
 * for every external dependency a workflow might touch.
 *
 * The goal is to let workflow examples *execute* end-to-end inside a unit
 * test without making any provider call, opening any socket, or touching
 * the user's file system. Imports are kept lean so the module stays cheap
 * to load from any package's tests.
 */
import { getNodeBuiltinSync } from "@nodetool-ai/config";

const os = getNodeBuiltinSync<typeof import("node:os")>(
  "node:os"
) as typeof import("node:os");
const path = getNodeBuiltinSync<typeof import("node:path")>(
  "node:path"
) as typeof import("node:path");
const fs = getNodeBuiltinSync<typeof import("node:fs")>(
  "node:fs"
) as typeof import("node:fs");
import { InMemoryStorageAdapter } from "@nodetool-ai/storage";
import { ProcessingContext, MemoryCache } from "./context.js";
import { FakeProvider } from "./providers/fake-provider.js";
import type { BaseProvider } from "./providers/base-provider.js";
import { isString } from "@nodetool-ai/protocol";

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
  /** Whether workflow outputs should be persisted as assets. Defaults to true. */
  persistOutputAssets?: boolean;
}

export interface FakeContextHandle {
  context: ProcessingContext;
  /** Temp workspace directory created for this context (always present). */
  workspaceDir: string;
  /** All providers handed out by `getProvider`, keyed by providerId. */
  providers: Map<string, BaseProvider>;
  /**
   * Removes the temp workspace dir. Safe to call multiple times; callers
   * should run it in `afterEach` or `finally`.
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
    const url = isString(input) ? input : String(input);
    const body = url.endsWith(".json") || url.includes("/api/") ? "{}" : "";
    return new Response(body, {
      status: 200,
      headers: { "content-type": "text/plain" }
    });
  };
}

/** File extensions for the media types fake providers emit. */
const FAKE_ASSET_EXT: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "video/mp4": "mp4",
  "audio/wav": "wav",
  "audio/x-wav": "wav",
  "audio/mpeg": "mp3",
  "model/gltf-binary": "glb"
};

/**
 * Build a ProcessingContext wired to in-memory storage, an in-memory cache,
 * in-memory asset creation, a fake-provider resolver, and a stubbed `fetch`. The returned handle owns
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

  const userId = "fake-user";
  const storage = new InMemoryStorageAdapter();
  let assetCounter = 0;
  let sequenceCounter = 0;
  const sequences = new Map<string, { id: string }>();

  const context = new ProcessingContext({
    jobId: options.jobId ?? "fake-job",
    userId,
    workspaceDir,
    cache: new MemoryCache(),
    storage,
    workspaceStorage: new InMemoryStorageAdapter(),
    variables: options.variables ?? {},
    persistOutputAssets: options.persistOutputAssets ?? true,
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
    },
    modelInterfaces: {
      // Generated media is saved as an asset and handed downstream as
      // `asset://<id>.<ext>`. Store the bytes in the in-memory storage under
      // every key that ref can resolve to, so the next node reads them back.
      createAsset: async (args) => {
        assetCounter += 1;
        const id = `fakeasset${String(assetCounter).padStart(23, "0")}`;
        const exts = new Set<string>([
          path.extname(args.name).slice(1),
          FAKE_ASSET_EXT[args.contentType] ?? ""
        ]);
        await storage.store(`${userId}/${id}`, args.content, args.contentType);
        for (const ext of exts) {
          if (ext) {
            await storage.store(
              `${userId}/${id}.${ext}`,
              args.content,
              args.contentType
            );
          }
        }
        return { id, name: args.name, content_type: args.contentType };
      },
      // Timeline nodes save a sequence document and read it back by id.
      createTimelineSequence: async ({ sequence }) => {
        sequenceCounter += 1;
        const id = `fake-sequence-${sequenceCounter}`;
        const saved = { ...(sequence as Record<string, unknown>), id };
        sequences.set(id, saved);
        return saved;
      },
      getTimelineSequence: async ({ id }) => sequences.get(id) ?? null,
      updateTimelineSequence: async ({ id, sequence }) => {
        if (!sequences.has(id)) return null;
        const saved = { ...(sequence as Record<string, unknown>), id };
        sequences.set(id, saved);
        return saved;
      }
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
      isString(input)
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url;
    if (responder) {
      return responder(url, init);
    }
    const body = url.endsWith(".json") || url.includes("/api/") ? "{}" : "";
    return new Response(body, {
      status: 200,
      headers: { "content-type": "text/plain" }
    });
  };
  globalThis.fetch = stub;
  return () => {
    globalThis.fetch = original;
  };
}
