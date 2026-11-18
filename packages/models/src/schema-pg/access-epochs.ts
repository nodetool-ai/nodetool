import { pgTable, text, integer } from "drizzle-orm/pg-core";

/** PostgreSQL twin of `src/schema/access-epochs.ts`, which describes it. */
export const accessEpochs = pgTable(
  "access_epochs",
  {
    id: text("id").primaryKey(),
    kind: text("kind").notNull(),
    object_id: text("object_id").notNull(),
    epoch: integer("epoch").notNull().default(0)
  }
);
