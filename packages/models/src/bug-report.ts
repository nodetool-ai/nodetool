/**
 * BugReport — reports submitted from the hosted web app.
 *
 * See `schema/bug-reports.ts` for the columns and for where the attached
 * bundle is stored.
 */

import { createTimeOrderedUuid } from "./base-model.js";
import { getPortableDb } from "./db.js";
import { bugReports } from "./schema/bug-reports.js";

export type BugReportRow = typeof bugReports.$inferSelect;

export interface CreateBugReportInput {
  /** Defaults to a new id. Pass one when the bundle key was derived from it. */
  id?: string;
  userId: string;
  source: string;
  title: string;
  description: string;
  steps?: string | null;
  expected?: string | null;
  body: string;
  bundleKey?: string | null;
  bundleSize?: number | null;
}

/** Store one report and return the row as written. */
export async function createBugReport(
  input: CreateBugReportInput
): Promise<BugReportRow> {
  const row: BugReportRow = {
    id: input.id ?? createTimeOrderedUuid(),
    user_id: input.userId,
    source: input.source,
    title: input.title,
    description: input.description,
    steps: input.steps ?? null,
    expected: input.expected ?? null,
    body: input.body,
    bundle_key: input.bundleKey ?? null,
    bundle_size: input.bundleSize ?? null,
    created_at: new Date().toISOString()
  };
  await getPortableDb().insert(bugReports).values(row);
  return row;
}
