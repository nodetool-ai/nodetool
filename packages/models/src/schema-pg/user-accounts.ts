import { pgTable, text, index } from "drizzle-orm/pg-core";
import { jsonText } from "./helpers.js";

/** PostgreSQL twin of `schema/user-accounts.ts`. */
export const userAccounts = pgTable(
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
