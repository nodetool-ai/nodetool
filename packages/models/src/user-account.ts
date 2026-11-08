/**
 * The user directory of a self-hosted server.
 *
 * An SSO session is a signed token, so the server has no record of who its
 * users are until something writes one. `recordSignIn` does that at every SSO
 * sign-in, and admins manage `role` and `status` from there. A sign-in never
 * changes `role` or `status`: those belong to the admin.
 */
import { and, desc, eq, inArray, or, sql, type SQL } from "drizzle-orm";

import { getPortableDb } from "./db.js";
import { userAccounts } from "./schema/user-accounts.js";

export const USER_ROLES = ["admin", "member"] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const USER_STATUSES = ["active", "disabled"] as const;
export type UserStatus = (typeof USER_STATUSES)[number];

export interface UserAccount {
  userId: string;
  email: string | null;
  displayName: string | null;
  authSource: string;
  groups: string[];
  role: UserRole;
  status: UserStatus;
  createdAt: string;
  updatedAt: string;
  lastSignInAt: string | null;
  lastSeenAt: string | null;
}

export interface SignInRecord {
  userId: string;
  email?: string | null;
  displayName?: string | null;
  authSource: string;
  groups?: readonly string[];
}

type Row = typeof userAccounts.$inferSelect;

export const isUserRole = (value: unknown): value is UserRole =>
  typeof value === "string" && (USER_ROLES as readonly string[]).includes(value);

export const isUserStatus = (value: unknown): value is UserStatus =>
  typeof value === "string" &&
  (USER_STATUSES as readonly string[]).includes(value);

function toAccount(row: Row): UserAccount {
  return {
    userId: row.user_id,
    email: row.email ?? null,
    displayName: row.display_name ?? null,
    authSource: row.auth_source,
    groups: Array.isArray(row.idp_groups) ? row.idp_groups : [],
    // A value written by hand outside these sets reads as the safe one.
    role: isUserRole(row.role) ? row.role : "member",
    status: isUserStatus(row.status) ? row.status : "disabled",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastSignInAt: row.last_sign_in_at ?? null,
    lastSeenAt: row.last_seen_at ?? null
  };
}

export async function getUserAccount(
  userId: string
): Promise<UserAccount | null> {
  const rows = await getPortableDb()
    .select()
    .from(userAccounts)
    .where(eq(userAccounts.user_id, userId))
    .limit(1);
  return rows[0] ? toAccount(rows[0]) : null;
}

/** The directory rows for `userIds`, keyed by id. Ids with no row are left out. */
export async function getUserAccounts(
  userIds: readonly string[]
): Promise<Map<string, UserAccount>> {
  const unique = [...new Set(userIds)];
  const accounts = new Map<string, UserAccount>();
  if (unique.length === 0) return accounts;
  const rows = await getPortableDb()
    .select()
    .from(userAccounts)
    .where(inArray(userAccounts.user_id, unique));
  for (const row of rows) accounts.set(row.user_id, toAccount(row));
  return accounts;
}

/**
 * Create or refresh the directory row for a sign-in. Email, name and groups
 * come from the identity provider each time; role and status are left alone.
 */
export async function recordSignIn(
  record: SignInRecord,
  now: Date = new Date()
): Promise<UserAccount> {
  const at = now.toISOString();
  const profile = {
    email: record.email ?? null,
    display_name: record.displayName ?? null,
    auth_source: record.authSource,
    idp_groups: [...(record.groups ?? [])],
    updated_at: at,
    last_sign_in_at: at,
    last_seen_at: at
  };
  await getPortableDb()
    .insert(userAccounts)
    .values({
      user_id: record.userId,
      ...profile,
      role: "member",
      status: "active",
      created_at: at
    })
    .onConflictDoUpdate({ target: userAccounts.user_id, set: profile });
  const account = await getUserAccount(record.userId);
  if (!account) {
    throw new Error(`User account ${record.userId} was not written`);
  }
  return account;
}

export interface UserAccountChanges {
  role?: UserRole;
  status?: UserStatus;
}

/** Apply an admin's change. Returns null when there is no such account. */
export async function updateUserAccount(
  userId: string,
  changes: UserAccountChanges,
  now: Date = new Date()
): Promise<UserAccount | null> {
  const set: Partial<Row> = { updated_at: now.toISOString() };
  if (changes.role !== undefined) set.role = changes.role;
  if (changes.status !== undefined) set.status = changes.status;
  await getPortableDb()
    .update(userAccounts)
    .set(set)
    .where(eq(userAccounts.user_id, userId));
  return getUserAccount(userId);
}

/** Record activity for an existing account. Does nothing for an unknown id. */
export async function touchUserLastSeen(
  userId: string,
  now: Date = new Date()
): Promise<void> {
  await getPortableDb()
    .update(userAccounts)
    .set({ last_seen_at: now.toISOString() })
    .where(eq(userAccounts.user_id, userId));
}

export interface UserAccountListOptions {
  /** Case-insensitive substring of email, display name or user id. */
  query?: string;
  status?: UserStatus;
  role?: UserRole;
  limit?: number;
  offset?: number;
}

export interface UserAccountPage {
  accounts: UserAccount[];
  total: number;
}

const MAX_PAGE = 200;

/** Escape LIKE wildcards; the pattern below declares `\` as the escape. */
const likeEscape = (value: string): string =>
  value.replace(/[%_\\]/g, (c) => `\\${c}`);

/** Most recently seen first, then most recently created. */
export async function listUserAccounts(
  options: UserAccountListOptions = {}
): Promise<UserAccountPage> {
  const conditions: SQL[] = [];
  const query = options.query?.trim().toLowerCase();
  if (query) {
    const pattern = `%${likeEscape(query)}%`;
    const matches = (column: SQL): SQL =>
      sql`lower(coalesce(${column}, '')) like ${pattern} escape '\\'`;
    const match = or(
      matches(sql`${userAccounts.user_id}`),
      matches(sql`${userAccounts.email}`),
      matches(sql`${userAccounts.display_name}`)
    );
    if (match) conditions.push(match);
  }
  if (options.status) conditions.push(eq(userAccounts.status, options.status));
  if (options.role) conditions.push(eq(userAccounts.role, options.role));
  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const limit = Math.min(Math.max(1, Math.trunc(options.limit ?? 50)), MAX_PAGE);
  const offset = Math.max(0, Math.trunc(options.offset ?? 0));
  const db = getPortableDb();
  const rows = await db
    .select()
    .from(userAccounts)
    .where(where)
    .orderBy(
      desc(sql`coalesce(${userAccounts.last_seen_at}, ${userAccounts.created_at})`),
      desc(userAccounts.created_at)
    )
    .limit(limit)
    .offset(offset);
  const counted = await db
    .select({ total: sql<number>`count(*)` })
    .from(userAccounts)
    .where(where);
  return {
    accounts: rows.map(toAccount),
    total: Number(counted[0]?.total ?? 0)
  };
}
