/**
 * Provider → required/optional secret-key map and the resolver that turns a
 * deployment plus a per-user secret store into a `ctx.credentials` bag.
 *
 * Deployment credentials are ordinary per-user secrets (the `Secret` model),
 * keyed by the env-var name the tool expects. This module is the single source
 * of truth for *which* keys each provider needs, and a provider-aware validator
 * that understands one-of / XOR groups and localhost short-circuits (a flat
 * `required[]` would reject a perfectly valid localhost docker deploy and pass
 * an SSH config with no auth material).
 *
 * Resolution is least-privilege: only the declared keys for the deployment's
 * provider are ever read from the store.
 */

import type { AnyDeployment } from "./deployment-config.js";
import { isLocalhost } from "./self-hosted.js";

/**
 * Resolver signature: look up a single decrypted secret value for a user.
 * The DEFAULT (wired by the manager) is DB-only:
 *
 *   (key, userId) => Secret.find(userId, key).then(s => s ? s.getDecryptedValue() : null)
 *
 * It must NOT fall back to `process.env` — `getSecret` does, and caches the
 * host value in a shared module-level map, which re-leaks host env across users
 * on a multi-user server.
 */
export type SecretResolver = (
  key: string,
  userId: string
) => Promise<string | null>;

/**
 * Declarative credential spec for a provider.
 *
 * - `required`   — every key must resolve, else a clear apply-time error.
 * - `optional`   — resolved if present, skipped if absent.
 * - `oneOf`      — at least one group must be fully satisfiable; each inner
 *                  array is an alias set where ANY one key suffices (so
 *                  `[["HF_TOKEN", "HUGGING_FACE_HUB_TOKEN"]]` means "one of
 *                  these two"). Used for HF token aliasing.
 * - `authGroups` — XOR-ish auth choices (e.g. SSH key material XOR password).
 *                  Validation only fires when `requiresAuth` says so.
 */
export interface ProviderCredentialSpec {
  required: string[];
  optional: string[];
  /**
   * Alias groups where at least one key in each group must resolve. Each group
   * is a set of interchangeable names (first that resolves wins). Empty by
   * default.
   */
  oneOf?: string[][];
}

/**
 * Canonical key list per provider. Refined from each deployer's real needs:
 *
 *   runpod      — RUNPOD_API_KEY (in-process fetch Bearer). DOCKER_USERNAME /
 *                 DOCKER_PASSWORD only when an image is built+pushed; username
 *                 may also come from `deployment.docker.username` in config.
 *   huggingface — one of HF_TOKEN / HUGGING_FACE_HUB_TOKEN (git push header +
 *                 hf CLI env). Canonical is HF_TOKEN.
 *   docker      — auth is host-dependent: localhost needs nothing; a remote SSH
 *                 host needs SSH_PRIVATE_KEY *or* a password (handled by the
 *                 deployment.ssh config, validated dynamically); registry
 *                 push optionally needs DOCKER_USERNAME / DOCKER_PASSWORD.
 *   gcp         — GCP_SERVICE_ACCOUNT_KEY (written to a scratch SA-key file);
 *                 registry push optionally needs DOCKER_USERNAME /
 *                 DOCKER_PASSWORD.
 *   fly         — FLY_API_TOKEN (child env for flyctl).
 *   railway     — RAILWAY_API_TOKEN (account/team-scoped) preferred, with
 *                 RAILWAY_TOKEN (project-scoped) as an alias.
 */
export const PROVIDER_SECRET_KEYS: Record<string, ProviderCredentialSpec> = {
  runpod: {
    required: ["RUNPOD_API_KEY"],
    optional: ["DOCKER_USERNAME", "DOCKER_PASSWORD"]
  },
  huggingface: {
    required: [],
    optional: [],
    oneOf: [["HF_TOKEN", "HUGGING_FACE_HUB_TOKEN"]]
  },
  docker: {
    required: [],
    optional: ["SSH_PRIVATE_KEY", "DOCKER_USERNAME", "DOCKER_PASSWORD"]
  },
  gcp: {
    required: ["GCP_SERVICE_ACCOUNT_KEY"],
    optional: ["DOCKER_USERNAME", "DOCKER_PASSWORD"]
  },
  fly: {
    required: ["FLY_API_TOKEN"],
    optional: []
  },
  railway: {
    required: [],
    optional: [],
    oneOf: [["RAILWAY_API_TOKEN", "RAILWAY_TOKEN"]]
  }
};

/** Every key (required + optional + oneOf members) a provider might use. */
function declaredKeysFor(provider: string): string[] {
  const spec = PROVIDER_SECRET_KEYS[provider];
  if (!spec) return [];
  const keys = new Set<string>([...spec.required, ...spec.optional]);
  for (const group of spec.oneOf ?? []) {
    for (const k of group) keys.add(k);
  }
  return [...keys];
}

/** Result of resolving a deployment's credentials. */
export interface ResolvedProviderCredentials {
  /** env-name → plaintext value, for the keys that resolved. */
  credentials: Record<string, string>;
  /** Human-readable descriptions of unmet REQUIRED keys / groups. */
  missingRequired: string[];
}

/**
 * Resolve the credentials a deployment needs from the per-user secret store.
 *
 * Least-privilege: only the provider's declared keys are read. The returned
 * `credentials` bag is what goes into `ctx.credentials`. `missingRequired`
 * lists unmet required keys/groups so the caller can throw a clear apply-time
 * error naming the key(s).
 *
 * Auth choices that depend on the deployment shape (docker SSH host vs
 * localhost, password vs key) are NOT resolved here as required — registry/SSH
 * material is optional at this layer and validated against the concrete
 * deployment via {@link validateDeploymentCredentials}.
 */
export async function resolveProviderCredentials(
  deployment: AnyDeployment,
  userId: string,
  secretResolver: SecretResolver
): Promise<ResolvedProviderCredentials> {
  const provider = deployment.type;
  const spec = PROVIDER_SECRET_KEYS[provider];
  if (!spec) {
    return { credentials: {}, missingRequired: [] };
  }

  const credentials: Record<string, string> = {};
  const missingRequired: string[] = [];

  // Resolve every declared key once (least-privilege; no other keys touched).
  const resolved = new Map<string, string | null>();
  for (const key of declaredKeysFor(provider)) {
    resolved.set(key, await secretResolver(key, userId));
  }

  // Hard-required keys.
  for (const key of spec.required) {
    const value = resolved.get(key) ?? null;
    if (value === null) {
      missingRequired.push(key);
    } else {
      credentials[key] = value;
    }
  }

  // Optional keys — include if present.
  for (const key of spec.optional) {
    const value = resolved.get(key) ?? null;
    if (value !== null) {
      credentials[key] = value;
    }
  }

  // oneOf groups — first member that resolves satisfies the group and is
  // copied under the FIRST (canonical) name as well so downstream code can
  // read a single name.
  for (const group of spec.oneOf ?? []) {
    let satisfied = false;
    for (const key of group) {
      const value = resolved.get(key) ?? null;
      if (value !== null) {
        credentials[key] = value;
        const canonical = group[0];
        if (canonical && credentials[canonical] === undefined) {
          credentials[canonical] = value;
        }
        satisfied = true;
        break;
      }
    }
    if (!satisfied) {
      missingRequired.push(`one of [${group.join(", ")}]`);
    }
  }

  return { credentials, missingRequired };
}

/**
 * Validate the resolved credentials against the concrete deployment shape and
 * return any blocking problems (empty array = OK). This is where provider-aware
 * rules live:
 *
 *   - docker on localhost short-circuits: no SSH/registry creds required.
 *   - docker on a remote host requires SSH auth material — either an
 *     `SSH_PRIVATE_KEY` secret OR a password configured in `deployment.ssh`
 *     (XOR; both is allowed but at least one is required).
 *
 * `missingRequired` from {@link resolveProviderCredentials} should be merged
 * with this output by the caller.
 */
export function validateDeploymentCredentials(
  deployment: AnyDeployment,
  credentials: Record<string, string>
): string[] {
  const problems: string[] = [];

  if (deployment.type === "docker") {
    const host = deployment.host;
    if (!isLocalhost(host)) {
      const hasKey = credentials["SSH_PRIVATE_KEY"] !== undefined;
      const hasPassword = Boolean(deployment.ssh?.password);
      const hasKeyPath = Boolean(deployment.ssh?.key_path);
      if (!hasKey && !hasPassword && !hasKeyPath) {
        problems.push(
          `docker deployment to remote host ${host} requires SSH auth: ` +
            `set an SSH_PRIVATE_KEY secret or a password in the ssh config`
        );
      }
    }
  }

  return problems;
}
