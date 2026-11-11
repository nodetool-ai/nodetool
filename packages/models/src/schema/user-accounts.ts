import { sqliteTable, text, index } from "drizzle-orm/sqlite-core";
import { jsonText } from "./helpers.js";

/**
 * The server's user directory: one row per person who has signed in.
 *
 * An SSO session is a signed token, not a row, so without this table the
 * server cannot list its users or refuse one before their token expires. The
 * SSO callback upserts the row at every sign-in, which keeps email, name and
 * identity-provider groups current. `user_id` is the id the rest of the
 * database already uses, so nothing moves when the row appears.
 *
 * `role` is the role an admin set by hand. Admin through an identity-provider
 * group (`OIDC_ADMIN_GROUPS`) is derived from `groups` when checked, so
 * removing someone from the group takes effect at their next sign-in.
 */
export const userAccounts = sqliteTable(
  "nodetool_user_accounts",
  {
    user_id: text("user_id").primaryKey(),
    email: text("email"),
    display_name: text("display_name"),
    /** "oidc" for SSO sign-ins. */
    auth_source: text("auth_source").notNull(),
    /** Groups from the identity provider at the last sign-in. */
    idp_groups: jsonText<string[]>()("idp_groups").notNull(),
    /** "admin" | "member" */
    role: text("role").notNull().default("member"),
    /** "active" | "disabled" */
    status: text("status").notNull().default("active"),
    created_at: text("created_at").notNull(),
    updated_at: text("updated_at").notNull(),
    last_sign_in_at: text("last_sign_in_at"),
    last_seen_at: text("last_seen_at")
  },
  (table) => [index("idx_user_accounts_email").on(table.email)]
);
