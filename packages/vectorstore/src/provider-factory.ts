/**
 * Factory + process-wide default for VectorProvider instances.
 *
 * Selection order:
 *   1. Explicit `setDefaultVectorProvider(...)` call.
 *   2. Env var `NODETOOL_VECTOR_PROVIDER` ∈ { "sqlite-vec", "pinecone", "supabase" }.
 *   3. Fallback: `SqliteVecProvider` with default db path.
 *
 * Path resolution for sqlite-vec follows `@nodetool-ai/config` conventions —
 * `VECTORSTORE_DB_PATH` overrides the default location. The sqlite-vec
 * adapter shares the process-wide `getDefaultStore()` instance so that
 * callers using the lower-level API and the provider see one connection.
 */

import { PineconeProvider } from "./pinecone-provider.js";
import {
  SqliteVecProvider,
  type SqliteVecProviderOptions
} from "./sqlite-vec-provider.js";
import { getDefaultStore } from "./sqlite-vec-store.js";
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
      // Re-use the shared default SqliteVecStore so the provider and any
      // direct `getDefaultStore()` callers share one connection. The store's
      // own constructor reads VECTORSTORE_DB_PATH via @nodetool-ai/config.
      return new SqliteVecProvider({ store: getDefaultStore() });

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
      // Same env vars the @nodetool-ai/storage Supabase backend uses, so a
      // single Supabase project can back both file storage and vectors.
      const url = env.SUPABASE_URL;
      const apiKey =
        env.SUPABASE_SERVICE_ROLE_KEY ?? env.SUPABASE_KEY;
      if (!url || !apiKey) {
        throw new ProviderConfigError(
          "NODETOOL_VECTOR_PROVIDER=supabase but SUPABASE_URL and " +
            "SUPABASE_KEY (or SUPABASE_SERVICE_ROLE_KEY) are not set. " +
            "The provider also needs the migration in " +
            "packages/vectorstore/sql/supabase-migration.sql installed " +
            "on the project."
        );
      }
      return new SupabaseProvider({
        url,
        apiKey,
        schema: env.NODETOOL_VECTOR_SCHEMA
      });
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
