import { pgTable, text, index } from "drizzle-orm/pg-core";
import { jsonText } from "./helpers.js";

/**
 * PostgreSQL twin of `schema/user-events.ts`.
 *
 * A narrow, privacy-scoped audit log keyed by user: authentication and
 * credential changes, irreversible or outward-facing actions, and
 * consent/policy/data-subject-rights events. Behavioral analytics stays
 * aggregate in Plausible and is never keyed to a user id.
 *
 * Deliberately absent, in both dialects: `ip_address` and `user_agent` (both
 * personal data that widen the retention and disclosure obligation without
 * adding audit value on rows already attributed to an authenticated user),
 * and any free-text column (the path by which prompt text, file contents or
 * third-party PII would reach a log that outlives the data it describes).
 * Structured facts go in `metadata`, filtered by the per-event-type
 * allowlist in `user-event.ts`.
 */
export const userEvents = pgTable(
  "nodetool_user_events",
  {
    id: text("id").primaryKey(),
    user_id: text("user_id").notNull(),
    event_type: text("event_type").notNull(),
    /** Kind of thing acted on: "workflow", "asset", "secret", "application". */
    subject_type: text("subject_type"),
    /** Id of the thing acted on. Null for events with no subject (sign-in). */
    subject_id: text("subject_id"),
    /** Allowlisted scalar facts only — see `sanitizeUserEventMetadata`. */
    metadata: jsonText<Record<string, string | number | boolean>>()("metadata"),
    created_at: text("created_at").notNull()
  },
  (table) => [
    // Serves the erasure and export range scans.
    index("idx_user_event_user_created").on(table.user_id, table.created_at),
    // Serves the retention sweep, which walks by type because the
    // consent/policy/DSR types are never pruned.
    index("idx_user_event_type_created").on(table.event_type, table.created_at)
  ]
);
