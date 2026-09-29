import { and, eq, isNull } from "drizzle-orm";
import { forUpdate, getDb, getDbType, type DbTransaction } from "./db.js";
import { applications } from "./schema/applications.js";
import { assets } from "./schema/assets.js";
import { imageDocuments } from "./schema/image-documents.js";
import { jsScripts } from "./schema/js-scripts.js";
import { scripts } from "./schema/scripts.js";
import { storyboards } from "./schema/storyboards.js";
import { timelineSequences } from "./schema/timeline-sequences.js";
import { projects } from "./schema/projects.js";

export type ProjectCopyAsset = typeof assets.$inferInsert;

export type ProjectCopyDocument =
  | {
      readonly type: "storyboard";
      readonly values: typeof storyboards.$inferInsert;
    }
  | { readonly type: "script"; readonly values: typeof scripts.$inferInsert }
  | {
      readonly type: "timeline";
      readonly values: typeof timelineSequences.$inferInsert;
    }
  | {
      readonly type: "sketch";
      readonly values: typeof imageDocuments.$inferInsert;
    }
  | {
      readonly type: "application";
      readonly values: typeof applications.$inferInsert;
    }
  | {
      readonly type: "jsscript";
      readonly values: typeof jsScripts.$inferInsert;
    };

function insertDocument(tx: DbTransaction, document: ProjectCopyDocument) {
  switch (document.type) {
    case "storyboard":
      return tx.insert(storyboards).values(document.values);
    case "script":
      return tx.insert(scripts).values(document.values);
    case "timeline":
      return tx.insert(timelineSequences).values(document.values);
    case "sketch":
      return tx.insert(imageDocuments).values(document.values);
    case "application":
      return tx.insert(applications).values(document.values);
    case "jsscript":
      return tx.insert(jsScripts).values(document.values);
  }
}

/** Persist a fully prepared project copy atomically. */
export async function persistProjectCopy(args: {
  readonly userId: string;
  readonly destinationProjectId: string;
  readonly assets: readonly ProjectCopyAsset[];
  readonly documents: readonly ProjectCopyDocument[];
}): Promise<void> {
  const db = getDb();
  const writes = (tx: DbTransaction) => {
    const statements: Array<{ run: () => void }> = [];
    for (const asset of args.assets)
      statements.push(tx.insert(assets).values(asset));
    for (const document of args.documents) {
      statements.push(insertDocument(tx, document));
    }
    return statements;
  };
  if (getDbType() === "sqlite") {
    db.transaction((tx: DbTransaction): void => {
      const destination = tx
        .select({ id: projects.id })
        .from(projects)
        .where(
          and(
            eq(projects.id, args.destinationProjectId),
            eq(projects.user_id, args.userId),
            isNull(projects.deleted_at)
          )
        )
        .limit(1)
        .all();
      if (!destination[0])
        throw new Error("Destination project is unavailable");
      for (const statement of writes(tx)) statement.run();
    });
  } else {
    await db.transaction(async (tx: DbTransaction): Promise<void> => {
      const destination = await forUpdate(
        tx
          .select({ id: projects.id })
          .from(projects)
          .where(
            and(
              eq(projects.id, args.destinationProjectId),
              eq(projects.user_id, args.userId),
              isNull(projects.deleted_at)
            )
          )
          .limit(1)
      );
      if (!destination[0])
        throw new Error("Destination project is unavailable");
      for (const statement of writes(tx)) await statement;
    });
  }
}
