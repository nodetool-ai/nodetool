/**
 * Seed runner — packages/models/src/seeds/index.ts
 *
 * Calls all registered seed functions once.  Intended to be called once
 * during server startup, after the database is initialized.  All seed
 * functions must be idempotent (upsert, not insert-only).
 */

import { seedTimelineTemplates } from "./timeline_templates.js";

/**
 * Run all registered seeds against the active database.
 *
 * Seeds are idempotent — safe to call on a fresh database or an existing one.
 */
export async function runSeeds(): Promise<void> {
  await seedTimelineTemplates();
}

export { seedTimelineTemplates, SEED_IDS, SYSTEM_USER_ID, TIMELINE_TEMPLATE_TAG, TIMELINE_TEMPLATE_WORKFLOWS } from "./timeline_templates.js";
