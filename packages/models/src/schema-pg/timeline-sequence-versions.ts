import {
  pgTable,
  text,
  integer,
  index,
  uniqueIndex
} from "drizzle-orm/pg-core";
import { jsonText } from "./helpers.js";
import { timelineSequences } from "./timeline-sequences.js";
import type { TimelineDocument } from "../timeline-sequence.js";

/** See the SQLite schema for the column semantics. */
export const timelineSequenceVersions = pgTable(
  "timeline_sequence_versions",
  {
    id: text("id").primaryKey(),
    timeline_id: text("timeline_id")
      .notNull()
      .references(() => timelineSequences.id, { onDelete: "cascade" }),
    user_id: text("user_id").notNull(),
    name: text("name"),
    version: integer("version").notNull().default(1),
    save_type: text("save_type").notNull().default("manual"),
    fps: integer("fps").notNull().default(30),
    width: integer("width").notNull().default(1920),
    height: integer("height").notNull().default(1080),
    duration_ms: integer("duration_ms").notNull().default(0),
    document: jsonText<TimelineDocument>()("document").notNull(),
    created_at: text("created_at").notNull()
  },
  (table) => [
    index("idx_tsv_timeline").on(table.timeline_id),
    index("idx_tsv_user").on(table.user_id),
    index("idx_tsv_timeline_save_type_created").on(
      table.timeline_id,
      table.save_type,
      table.created_at
    ),
    uniqueIndex("idx_tsv_timeline_version").on(table.timeline_id, table.version)
  ]
);
