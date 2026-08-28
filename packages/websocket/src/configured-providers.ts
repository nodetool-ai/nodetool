/**
 * The set of providers a user holds credentials for, cached per user for the
 * chat agent's toolbelt (`find_model`, media generation).
 *
 * Building it costs one credential resolution per registered provider, so a
 * cache is worth having — but a cache that never expires is worse than none:
 * a provider connected after the first chat turn stays invisible until the
 * process restarts, which on a dev machine is every file save and on the
 * production server is never. That is how a Codex sign-in could complete and
 * leave the agent with no Codex.
 *
 * So an entry is good for {@link DEFAULT_TTL_MS} and no longer, and
 * {@link clearProviderCache} from `@nodetool-ai/runtime` drops it immediately —
 * credential writes call that, so a sign-in takes effect on the next turn
 * rather than a minute later.
 *
 * The TTL is not belt-and-braces on top of that signal. A cached provider is
 * built around the bearer it was handed, and the Codex bearer is a
 * short-lived OAuth access token: the credential row is refreshed in place
 * with no write this process sees, so only expiry rebuilds the instance.
 */

import { getProviderCacheVersion } from "@nodetool-ai/runtime";
import type { BaseProvider } from "@nodetool-ai/runtime";

/** How long a built provider set is reused. Bounds a stale OAuth bearer. */
export const DEFAULT_TTL_MS = 60_000;

export type ProviderSet = Record<string, BaseProvider>;

interface CacheEntry {
  providers: ProviderSet;
  /** Registry credential version the entry was built against. */
  version: number;
  builtAt: number;
}

export interface ConfiguredProviderCacheOptions {
  /** Builds the provider set for a user. Injected so tests need no registry. */
  load: (userId: string) => Promise<ProviderSet>;
  ttlMs?: number;
  now?: () => number;
  /** Credential-version reader. Injected only by tests. */
  version?: () => number;
}

export class ConfiguredProviderCache {
  private readonly entries = new Map<string, CacheEntry>();
  private readonly load: (userId: string) => Promise<ProviderSet>;
  private readonly ttlMs: number;
  private readonly now: () => number;
  private readonly version: () => number;

  constructor(options: ConfiguredProviderCacheOptions) {
    this.load = options.load;
    this.ttlMs = options.ttlMs ?? DEFAULT_TTL_MS;
    this.now = options.now ?? Date.now;
    this.version = options.version ?? getProviderCacheVersion;
  }

  async get(userId: string): Promise<ProviderSet> {
    const cached = this.entries.get(userId);
    if (cached && this.isFresh(cached)) {
      return cached.providers;
    }
    const providers = await this.load(userId);
    this.entries.set(userId, {
      providers,
      version: this.version(),
      builtAt: this.now()
    });
    return providers;
  }

  private isFresh(entry: CacheEntry): boolean {
    if (entry.version !== this.version()) return false;
    return this.now() - entry.builtAt < this.ttlMs;
  }
}
