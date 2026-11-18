import { BaseNode, prop } from "@nodetool-ai/node-sdk";
import type { NodeClass } from "@nodetool-ai/node-sdk";
import { assertLocalPathIsOwn } from "@nodetool-ai/runtime";
import type { ProcessingContext } from "@nodetool-ai/runtime";
import { isAbsolute, join, relative } from "node:path";

/**
 * The real path of the database `databaseName` in the run's workspace.
 *
 * The path is opened by whatever the workflow hands it to, never through the
 * workspace, so it is held to the workspace here: inside its folder, and not
 * in the folder of another project inside it.
 */
async function resolveDbPath(
  context: ProcessingContext | undefined,
  databaseName: string
): Promise<string> {
  // SQLite opens the file directly and holds it open across statements, so a
  // staged copy would diverge from the workspace the moment a second run
  // touched it. This node therefore needs a workspace that is a real folder.
  const workspaceDir = context?.workspace?.localDir ?? context?.workspaceDir;
  if (!workspaceDir) {
    throw new Error(
      context?.workspace
        ? "SQLite needs a workspace that is a folder on the machine running " +
          "the workflow. This run's workspace is cloud storage, which cannot " +
          "back a live database file."
        : "A workspace is required for SQLite operations"
    );
  }
  const dbPath = join(workspaceDir, databaseName);
  const inside = relative(workspaceDir, dbPath);
  if (!inside || inside.startsWith("..") || isAbsolute(inside)) {
    throw new Error(
      `The database name "${databaseName}" resolves outside the workspace. ` +
        `Name a file inside it.`
    );
  }
  if (context?.workspace) {
    await assertLocalPathIsOwn(
      context.workspace,
      workspaceDir,
      dbPath,
      databaseName
    );
  }
  return dbPath;
}

/** Output handles GetDatabasePathLibNode.process() emits. */
type GetDatabasePathLibNodeOutputs = {
  output: string;
};

export class GetDatabasePathLibNode extends BaseNode {
  static readonly nodeType = "lib.sqlite.GetDatabasePath";
  static readonly title = "Get Database Path";
  static readonly inlineFields = ["database_name"];
  static readonly inputFields = [];
  static readonly description =
    "Get the full path to a SQLite database file.\n    sqlite, database, path, location\n\n    Use cases:\n    - Reference database location\n    - Verify database exists\n    - Pass path to external tools";
  static readonly metadataOutputTypes = {
    output: "str"
  };

  @prop({
    type: "str",
    default: "memory.db",
    title: "Database Name",
    description: "Name of the SQLite database file"
  })
  declare database_name: string;

  async process(context?: ProcessingContext): Promise<GetDatabasePathLibNodeOutputs> {
    const dbPath = await resolveDbPath(context, this.database_name);
    return { output: dbPath };
  }
}

export const LIB_SQLITE_NODES: readonly NodeClass[] = [
  GetDatabasePathLibNode
];
