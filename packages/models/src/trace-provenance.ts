import { and, eq, sql } from "drizzle-orm";
import { getDatabase } from "./db.js";
import { COMPACTION_EVENT_TYPE } from "./message.js";

/** Inspect tool names across a thread without returning messages or tool arguments. */
export async function threadHasTraceContentTools(
  userId: string,
  threadId: string,
  toolNames: readonly string[]
): Promise<boolean> {
  if (toolNames.length === 0) { return false; }
  const connection = getDatabase();
  const table = connection.schema.messages;
  const names = sql.join(toolNames.map((name) => sql`${name}`), sql`, `);
  const nestedNames = connection.dialect === "sqlite"
    ? sql`EXISTS (
        SELECT 1 FROM json_each(${table.tool_calls}) AS call
        WHERE CASE WHEN call.type = 'object' THEN json_extract(call.value, '$.name') END IN (${names})
           OR CASE WHEN call.type = 'object' THEN json_extract(call.value, '$.function.name') END IN (${names})
      )`
    : sql`EXISTS (
        SELECT 1 FROM jsonb_array_elements(
          CASE WHEN jsonb_typeof(${table.tool_calls}::jsonb) = 'array'
            THEN ${table.tool_calls}::jsonb ELSE '[]'::jsonb END
        ) AS call(value)
        WHERE call.value ->> 'name' IN (${names})
           OR call.value -> 'function' ->> 'name' IN (${names})
      )`;
  const compactedNames = connection.dialect === "sqlite"
    ? sql`EXISTS (
        SELECT 1 FROM json_each(CASE WHEN json_type(${table.tools}) = 'array' THEN ${table.tools} ELSE '[]' END) AS tool
        WHERE tool.type = 'text' AND tool.value IN (${names})
      )`
    : sql`EXISTS (
        SELECT 1 FROM jsonb_array_elements_text(
          CASE WHEN jsonb_typeof(${table.tools}::jsonb) = 'array' THEN ${table.tools}::jsonb ELSE '[]'::jsonb END
        ) AS tool(value)
        WHERE tool.value IN (${names})
      )`;
  const predicate = and(
    eq(table.user_id, userId),
    eq(table.thread_id, threadId),
    sql`(${table.name} IN (${names}) OR ${nestedNames} OR (${table.execution_event_type} = ${COMPACTION_EVENT_TYPE} AND ${compactedNames}))`
  );
  const rows = connection.dialect === "sqlite"
    ? await connection.db.select({ id: connection.schema.messages.id }).from(connection.schema.messages).where(predicate).limit(1)
    : await connection.db.select({ id: connection.schema.messages.id }).from(connection.schema.messages).where(predicate).limit(1);
  return rows.length > 0;
}
