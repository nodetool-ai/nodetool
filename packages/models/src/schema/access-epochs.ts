import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

/**
 * One counter per document and per project that orders access changes
 * against the writes they authorize
 * (docs/plans/native-cloud-sync/technical-design.md, "Order of access
 * changes against writes"). A change to a grant, a share link, a role, a
 * document's project or its deleted state locks the row for update and
 * increments it. A write that checks access locks the rows of its document
 * and project in share mode first and holds them until it commits.
 */
export const accessEpochs = sqliteTable(
  "access_epochs",
  {
    /** `<kind>:<object_id>`. */
    id: text("id").primaryKey(),
    /** `project` or a document kind, such as `workflow` or `timeline`. */
    kind: text("kind").notNull(),
    object_id: text("object_id").notNull(),
    epoch: integer("epoch").notNull().default(0)
  }
);
