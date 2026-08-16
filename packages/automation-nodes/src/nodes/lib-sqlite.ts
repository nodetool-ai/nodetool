import { BaseNode, prop } from "@nodetool-ai/node-sdk";
import type { NodeClass } from "@nodetool-ai/node-sdk";
import type { ProcessingContext } from "@nodetool-ai/runtime";
import { join } from "node:path";

function resolveDbPath(
  context: ProcessingContext | undefined,
  databaseName: string
): string {
  const workspaceDir = context?.workspaceDir;
  if (!workspaceDir) {
    throw new Error("workspace_dir is required for SQLite operations");
  }
  return join(workspaceDir, databaseName);
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
  declare database_name: any;

  async process(context?: ProcessingContext): Promise<GetDatabasePathLibNodeOutputs> {
    const databaseName = String(this.database_name ?? "memory.db");
    const dbPath = resolveDbPath(context, databaseName);
    return { output: dbPath };
  }
}

export const LIB_SQLITE_NODES: readonly NodeClass[] = [
  GetDatabasePathLibNode
];
