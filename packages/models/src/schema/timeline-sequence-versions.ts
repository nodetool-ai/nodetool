import {
  sqliteTable,
  text,
  integer,
  index,
  uniqueIndex
} from "drizzle-orm/sqlite-core";
import { timelineSequences } from "./timeline-sequences.js";

/**
 * An immutable snapshot of a timeline sequence: the document plus the render
 * settings it was written against. Manual saves, autosaves and the snapshot
 * taken before a restore all live here, told apart by `save_type`.
 */
export const timelineSequenceVersions = sqliteTable(
  "timeline_sequence_versions",
  {
    id: text("id").primaryKey(),
    /**
     * The sequence this snapshot belongs to. The cascade keeps a deleted
     * sequence's history from outliving it.
     */
    timeline_id: text("timeline_id")
      .notNull()
      .references(() => timelineSequences.id, { onDelete: "cascade" }),
    /**
     * Owner at snapshot time, copied from the parent. Version reads happen
     * against a timeline id alone, so the snapshot carries the owner it was
     * written for rather than trusting whatever row holds that id now.
     */
    user_id: text("user_id").notNull(),
    name: text("name"),
    /** Monotonic per timeline. */
    version: integer("version").notNull().default(1),
    save_type: text("save_type").notNull().default("manual"),
    fps: integer("fps").notNull().default(30),
    width: integer("width").notNull().default(1920),
    height: integer("height").notNull().default(1080),
    duration_ms: integer("duration_ms").notNull().default(0),
    document: text("document").notNull(),
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
    // Two writers that read the same MAX(version) must not both land: the
    // second insert fails instead of minting a duplicate version number.
    uniqueIndex("idx_tsv_timeline_version").on(table.timeline_id, table.version)
  ]
);
