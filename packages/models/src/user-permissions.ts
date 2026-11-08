/**
 * Permission flags for the users of a self-hosted server.
 *
 * Every flag is allowed unless an admin turns it off. The row for
 * {@link DEFAULT_PERMISSION_SUBJECT} sets the default, and a user's own row
 * overrides single flags on top of it.
 */
import { eq } from "drizzle-orm";

import { getPortableDb } from "./db.js";
import { userPermissions } from "./schema/user-permissions.js";

/** The `user_id` of the row that holds the default flags. */
export const DEFAULT_PERMISSION_SUBJECT = "*";

export const PERMISSION_FLAGS = [
  "use_llm",
  "generate_media",
  "use_server_keys",
  "manage_own_keys",
  "share_links",
  "share_public",
  "publish_apps",
  "install_packs"
] as const;
export type PermissionFlag = (typeof PERMISSION_FLAGS)[number];

/** Flag name to allowed, for the flags a row sets. */
export type PermissionOverrides = Partial<Record<PermissionFlag, boolean>>;
/** Every flag with its value in force. */
export type Permissions = Record<PermissionFlag, boolean>;

export const isPermissionFlag = (value: unknown): value is PermissionFlag =>
  typeof value === "string" &&
  (PERMISSION_FLAGS as readonly string[]).includes(value);

export interface EffectivePermissions {
  flags: Permissions;
  /** The flags the user's own row sets. Empty when they follow the default. */
  overrides: PermissionOverrides;
}

/** Keep known flags with boolean values. Anything else in stored JSON is dropped. */
function parseOverrides(raw: string | null | undefined): PermissionOverrides {
  if (!raw) return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return {};
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return {};
  }
  const overrides: PermissionOverrides = {};
  for (const [key, value] of Object.entries(parsed)) {
    if (isPermissionFlag(key) && typeof value === "boolean") {
      overrides[key] = value;
    }
  }
  return overrides;
}

/** The flags one row sets, or an empty object when it has no row. */
export async function getPermissionOverrides(
  subject: string
): Promise<PermissionOverrides> {
  const rows = await getPortableDb()
    .select({ flags: userPermissions.flags })
    .from(userPermissions)
    .where(eq(userPermissions.user_id, subject))
    .limit(1);
  return parseOverrides(rows[0]?.flags);
}

/** Allowed unless set to false, applying the default and then `overrides`. */
export function resolvePermissions(
  defaults: PermissionOverrides,
  overrides: PermissionOverrides = {}
): Permissions {
  const flags = {} as Permissions;
  for (const flag of PERMISSION_FLAGS) {
    flags[flag] = overrides[flag] ?? defaults[flag] ?? true;
  }
  return flags;
}

export async function getEffectivePermissions(
  userId: string
): Promise<EffectivePermissions> {
  const [defaults, overrides] = await Promise.all([
    getPermissionOverrides(DEFAULT_PERMISSION_SUBJECT),
    getPermissionOverrides(userId)
  ]);
  return { flags: resolvePermissions(defaults, overrides), overrides };
}

/**
 * Replace the flags a row sets. Flags left out follow the default again (for
 * a user) or are allowed (for the default). An empty object removes the row.
 */
export async function setPermissionOverrides(
  subject: string,
  overrides: PermissionOverrides,
  updatedBy: string | null
): Promise<PermissionOverrides> {
  const clean = parseOverrides(JSON.stringify(overrides));
  const db = getPortableDb();
  if (Object.keys(clean).length === 0) {
    await db
      .delete(userPermissions)
      .where(eq(userPermissions.user_id, subject));
    return {};
  }
  const now = new Date().toISOString();
  const flags = JSON.stringify(clean);
  const updated = await db
    .update(userPermissions)
    .set({ flags, updated_at: now, updated_by: updatedBy })
    .where(eq(userPermissions.user_id, subject))
    .returning({ user_id: userPermissions.user_id });
  if (updated.length === 0) {
    await db.insert(userPermissions).values({
      user_id: subject,
      flags,
      created_at: now,
      updated_at: now,
      updated_by: updatedBy
    });
  }
  return clean;
}
