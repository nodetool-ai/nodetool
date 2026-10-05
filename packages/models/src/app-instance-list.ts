import { and, desc, eq, lt, or } from "drizzle-orm";
import { z } from "zod";
import { appInstanceResponse } from "@nodetool-ai/protocol/api-schemas/app-runs.js";
import { getDatabase } from "./db.js";
import {
  AppRunError,
  resolveAppInstanceApplicationId
} from "./app-instance.js";

const metadataSchema = appInstanceResponse.omit({
  snapshot: true,
  variables: true
});
const cursorSchema = z.object({
  updated_at: z.string().datetime(),
  id: z.string().regex(/^[0-9a-f]{32}$/)
});
export type AppInstanceMetadata = z.infer<typeof metadataSchema>;
export interface ListAppInstanceMetadataOptions {
  applicationId?: string;
  sourceId?: string;
  limit?: number;
  cursor?: string;
}

/** Owner-scoped switcher projection without execution snapshots or working values. */
export async function listAppInstanceMetadata(
  userId: string,
  options: ListAppInstanceMetadataOptions = {}
): Promise<{ instances: AppInstanceMetadata[]; next_cursor: string | null }> {
  const limit = options.limit ?? 50;
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    throw new AppRunError(
      "invalid_input",
      "Instance list limit must be between 1 and 100"
    );
  }
  let cursor: z.infer<typeof cursorSchema> | undefined;
  if (options.cursor) {
    try {
      cursor = cursorSchema.parse(
        JSON.parse(Buffer.from(options.cursor, "base64url").toString("utf8"))
      );
    } catch {
      throw new AppRunError("invalid_input", "Invalid instance list cursor");
    }
  }
  const applicationId = options.applicationId
    ? await resolveAppInstanceApplicationId(userId, options.applicationId)
    : undefined;
  const c = getDatabase();
  const t = c.schema.appInstances;
  const condition = and(
    eq(t.user_id, userId),
    applicationId ? eq(t.application_id, applicationId) : undefined,
    options.sourceId ? eq(t.source_id, options.sourceId) : undefined,
    cursor
      ? or(
          lt(t.updated_at, cursor.updated_at),
          and(eq(t.updated_at, cursor.updated_at), lt(t.id, cursor.id))
        )
      : undefined
  );
  const rows =
    c.dialect === "sqlite"
      ? await c.db
          .select({
            id: c.schema.appInstances.id,
            user_id: c.schema.appInstances.user_id,
            application_id: c.schema.appInstances.application_id,
            source_id: c.schema.appInstances.source_id,
            name: c.schema.appInstances.name,
            version: c.schema.appInstances.version,
            revision: c.schema.appInstances.revision,
            is_default: c.schema.appInstances.is_default,
            created_at: c.schema.appInstances.created_at,
            updated_at: c.schema.appInstances.updated_at
          })
          .from(c.schema.appInstances)
          .where(condition)
          .orderBy(desc(t.updated_at), desc(t.id))
          .limit(limit + 1)
      : await c.db
          .select({
            id: c.schema.appInstances.id,
            user_id: c.schema.appInstances.user_id,
            application_id: c.schema.appInstances.application_id,
            source_id: c.schema.appInstances.source_id,
            name: c.schema.appInstances.name,
            version: c.schema.appInstances.version,
            revision: c.schema.appInstances.revision,
            is_default: c.schema.appInstances.is_default,
            created_at: c.schema.appInstances.created_at,
            updated_at: c.schema.appInstances.updated_at
          })
          .from(c.schema.appInstances)
          .where(condition)
          .orderBy(desc(t.updated_at), desc(t.id))
          .limit(limit + 1);
  const instances = rows
    .slice(0, limit)
    .map((row) => metadataSchema.parse(row));
  const last = instances.at(-1);
  return {
    instances,
    next_cursor:
      rows.length > limit && last
        ? Buffer.from(
            JSON.stringify({ updated_at: last.updated_at, id: last.id })
          ).toString("base64url")
        : null
  };
}
