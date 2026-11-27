/**
 * Whether a provider credential set in the server's environment may be used
 * on a user's behalf.
 *
 * A desktop or self-hosted install has one owner, so a key in its environment
 * is that owner's key and every lookup may fall back to it. The commercial
 * cloud serves strangers: a provider key left in its environment would pay
 * for every signed-in user who saved none of their own. There, user-facing
 * provider credentials come only from the user's own saved secrets, and the
 * operator funds managed models through the `nodetool` provider's
 * `NODETOOL_PLATFORM_*` keys, which are metered against the user's credits.
 *
 * The provider registry names the credentials (`registerUserCredentialKey`),
 * so a provider added later is covered without editing a list here. Keys
 * nothing registered, such as `SUPABASE_URL` or the platform keys, keep the
 * environment fallback.
 */

const userCredentialKeys = new Set<string>();

/** Mark `key` as a credential a user supplies for a provider. */
export function registerUserCredentialKey(key: string): void {
  userCredentialKeys.add(key);
}

/** True when `key` was registered as a user-supplied provider credential. */
export function isUserCredentialKey(key: string): boolean {
  return userCredentialKeys.has(key);
}

/** Every registered user credential key, sorted. */
export function userCredentialKeyList(): string[] {
  return [...userCredentialKeys].sort();
}

/**
 * True on the commercial cloud profile: `NODETOOL_NODE_PROFILE=cloud`, or
 * `NODETOOL_ENV=production` with the profile unset. Mirrors
 * `isCloudProfileActive` in `@nodetool-ai/protocol`, which this package
 * cannot import. A parity test in `packages/models` keeps the two in step.
 */
export function isCloudProfileEnv(
  env: Record<string, string | undefined> = process.env
): boolean {
  const profile = env.NODETOOL_NODE_PROFILE;
  if (profile != null && profile.trim() !== "") {
    return profile === "cloud";
  }
  return env.NODETOOL_ENV === "production";
}

/**
 * Whether a lookup of `key` may fall back to the server's environment.
 * False only for a registered user credential on the cloud profile.
 */
export function mayUseServerCredential(
  key: string,
  env: Record<string, string | undefined> = process.env
): boolean {
  return !(isUserCredentialKey(key) && isCloudProfileEnv(env));
}

/**
 * Registered user credentials that are set in the environment but withheld
 * from users because the server runs the cloud profile. Empty off the cloud
 * profile. The server logs these at startup so a stray key is visible.
 */
export function withheldServerCredentials(
  env: Record<string, string | undefined> = process.env
): string[] {
  if (!isCloudProfileEnv(env)) return [];
  return userCredentialKeyList().filter((key) => {
    const value = env[key];
    return value !== undefined && value !== "";
  });
}
