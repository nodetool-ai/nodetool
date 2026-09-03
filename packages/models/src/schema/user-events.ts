import { sqliteTable, text, index } from "drizzle-orm/sqlite-core";
import { jsonText } from "./helpers.js";

/**
 * A narrow, privacy-scoped audit log keyed by user.
 *
 * Only three classes of action land here: authentication and credential
 * changes (GDPR Art. 6(1)(f), legitimate interest in account security),
 * irreversible or outward-facing actions (deletes, shares, deploys — the
 * audit trail that answers "who removed this"), and consent, policy and
 * data-subject-rights events (Art. 7(1) requires being able to *demonstrate*
 * consent; the DSR rows are the record that an export or erasure was asked
 * for and carried out).
 *
 * Behavioral analytics is deliberately not in scope. Clicks, node drags,
 * panel opens, page views, session duration and feature funnels stay
 * aggregate in Plausible and are never keyed to a user id.
 *
 * Columns that are deliberately absent:
 *   - **No `ip_address`.** An IP is personal data under GDPR and would drag
 *     this table into a far wider retention and disclosure obligation than
 *     the audit trail needs. The events recorded here are already attributed
 *     to an authenticated user id, so the IP adds no audit value.
 *   - **No `user_agent`.** Same reasoning, plus it is a passive
 *     fingerprinting surface.
 *   - **No free-text column.** Anything shaped like `note`, `description` or
 *     `message` becomes the path of least resistance for prompt text, file
 *     contents or third-party PII to end up in an audit log that outlives the
 *     data it describes. Structured facts go in `metadata`, and only keys on
 *     the per-event-type allowlist in `user-event.ts` survive the write.
 *
 * The `(user_id, created_at)` index serves the erasure and export range
 * scans; `(event_type, created_at)` serves the retention sweep, which walks
 * by type because consent/policy/DSR events are never pruned.
 */
export const userEvents = sqliteTable(
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
    index("idx_user_event_user_created").on(table.user_id, table.created_at),
    index("idx_user_event_type_created").on(table.event_type, table.created_at)
  ]
);
