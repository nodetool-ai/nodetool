/**
 * Permission flags an admin of a self-hosted server sets per user (see
 * `user-permissions.ts` in models). Every flag is allowed unless an admin
 * turned it off. Admins, including the Local-mode owner, hold every flag.
 *
 * Flags are cached per process for {@link PERMISSION_CACHE_TTL_MS}: a change
 * made on this process applies at once (`forgetPermissions`), and one made on
 * another replica applies within the TTL. Unlike the spend limits, a failed
 * lookup refuses: a permission is an access rule, not metering.
 */
import {
  PERMISSION_FLAGS,
  getEffectivePermissions,
  type PermissionFlag,
  type Permissions
} from "@nodetool-ai/models";

import { ApiErrorCode } from "../error-codes.js";
import { throwApiError } from "../trpc/error-formatter.js";
import { isAdmin } from "./admin.js";

export const PERMISSION_CACHE_TTL_MS = 30_000;

const allAllowed = (): Permissions =>
  Object.fromEntries(PERMISSION_FLAGS.map((flag) => [flag, true])) as Permissions;

const cache = new Map<string, { flags: Permissions; at: number }>();

/** Drop cached flags, after an admin changes them. */
export function forgetPermissions(userId?: string): void {
  if (userId === undefined) cache.clear();
  else cache.delete(userId);
}

/** The flags in force for `userId`. Throws when they cannot be read. */
export async function permissionsFor(
  userId: string,
  now: number = Date.now()
): Promise<Permissions> {
  const hit = cache.get(userId);
  if (hit && now - hit.at < PERMISSION_CACHE_TTL_MS) return hit.flags;
  const flags = (await isAdmin(userId))
    ? allAllowed()
    : (await getEffectivePermissions(userId)).flags;
  cache.set(userId, { flags, at: now });
  return flags;
}

/** What a refusal says, so the person knows whom to ask. */
export const PERMISSION_REFUSALS: Record<PermissionFlag, string> = {
  use_llm: "Your account is not allowed to use language models.",
  generate_media:
    "Your account is not allowed to generate images, video, audio or 3D.",
  use_server_keys:
    "Your account can only use provider keys you add yourself. Add your key in Settings.",
  manage_own_keys: "Your account is not allowed to change provider keys.",
  share_links: "Your account is not allowed to create share links.",
  share_public: "Your account is not allowed to share publicly.",
  publish_apps: "Your account is not allowed to publish apps.",
  install_packs: "Your account is not allowed to install or change node packs."
};

const ASK_ADMIN = " Ask an admin if you need it.";

/** The refusal for `flag`, as shown to the person. */
export function permissionRefusal(flag: PermissionFlag): string {
  return flag === "use_server_keys"
    ? PERMISSION_REFUSALS[flag]
    : PERMISSION_REFUSALS[flag] + ASK_ADMIN;
}

/** Throw FORBIDDEN unless `userId` holds `flag`. */
export async function requirePermission(
  userId: string,
  flag: PermissionFlag
): Promise<void> {
  if (!(await permissionsFor(userId))[flag]) {
    throwApiError(ApiErrorCode.FORBIDDEN, permissionRefusal(flag));
  }
}
