/**
 * Factory + process-wide default for VectorProvider instances.
 *
 * Selection order:
 *   1. Explicit `setDefaultVectorProvider(...)` call.
 *   2. Env var `NODETOOL_VECTOR_PROVIDER` ∈ { "sqlite-vec", "pinecone", "supabase" }.
 *   3. Fallback: `SqliteVecProvider` with default db path.
 */

import { PineconeProvider } from "./pinecone-provider.js";
import {
  SqliteVecProvider,
  type SqliteVecProviderOptions
} from "./sqlite-vec-provider.js";
import { SupabaseProvider } from "./supabase-provider.js";
import {
  ProviderConfigError,
  type VectorProvider
} from "./provider.js";

export type VectorProviderKind = "sqlite-vec" | "pinecone" | "supabase";

let _default: VectorProvider | null = null;

export function getDefaultVectorProvider(): VectorProvider {
  if (_default) return _default;
  _default = createVectorProviderFromEnv();
  return _default;
}

export function setDefaultVectorProvider(provider: VectorProvider): void {
  if (_default && _default !== provider) {
    try {
      _default.close();
    } catch {
      // ignore close errors when swapping
    }
  }
  _default = provider;
}

export function resetDefaultVectorProvider(): void {
  if (_default) {
    try {
      _default.close();
    } catch {
      // ignore
    }
    _default = null;
  }
}

export function createVectorProviderFromEnv(
  env: Record<string, string | undefined> = process.env
): VectorProvider {
  const kind = (env.NODETOOL_VECTOR_PROVIDER ?? "sqlite-vec") as
    | VectorProviderKind
    | string;

  switch (kind) {
    case "sqlite-vec":
      return new SqliteVecProvider({ dbPath: env.NODETOOL_VECTORSTORE_PATH });

    case "pinecone": {
      const apiKey = env.PINECONE_API_KEY;
      if (!apiKey) {
        throw new ProviderConfigError(
          "NODETOOL_VECTOR_PROVIDER=pinecone but PINECONE_API_KEY is not set"
        );
      }
      return new PineconeProvider({
        apiKey,
        environment: env.PINECONE_ENVIRONMENT,
        controllerHostUrl: env.PINECONE_CONTROLLER_HOST
      });
    }

    case "supabase": {
      const url = env.SUPABASE_URL;
      const key = env.SUPABASE_SERVICE_ROLE_KEY;
      if (!url || !key) {
        throw new ProviderConfigError(
          "NODETOOL_VECTOR_PROVIDER=supabase but SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is not set"
        );
      }
      return new SupabaseProvider({ url, serviceRoleKey: key });
    }

    default:
      throw new ProviderConfigError(
        `Unknown NODETOOL_VECTOR_PROVIDER: '${kind}'. Expected one of: sqlite-vec, pinecone, supabase.`
      );
  }
}

/** Convenience for tests / one-off scripts. */
export function createSqliteVecProvider(
  opts: SqliteVecProviderOptions = {}
): SqliteVecProvider {
  return new SqliteVecProvider(opts);
}
