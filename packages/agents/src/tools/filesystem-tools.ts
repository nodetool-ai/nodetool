/**
 * Filesystem tools — backed by `context.workspaceStorage` so the agent's file
 * I/O is abstracted behind `StorageAdapter`. Local FS, S3, and Supabase
 * backends all expose the same tool surface.
 *
 * The implementations live in the `files` capability module
 * (`../capabilities/files.ts`); these classes are the zero-arg constructor
 * surface `BUILTIN_TOOL_CLASSES` and `resolveTool(name)` still use.
 */

import { CapabilityTool } from "../capabilities/index.js";
import {
  fileCapabilityRun,
  listDirectory,
  readFileCapability,
  writeFileCapability
} from "../capabilities/files.js";

/**
 * @deprecated Ported to the `files` capability module
 * (`../capabilities/files.ts`). Kept as a thin subclass so existing
 * constructors keep working; there is one implementation behind both.
 */
export class ReadFileTool extends CapabilityTool {
  constructor() {
    super(readFileCapability.spec, readFileCapability.impl, fileCapabilityRun);
  }
}

/**
 * @deprecated Ported to the `files` capability module
 * (`../capabilities/files.ts`). Kept as a thin subclass so existing
 * constructors keep working; there is one implementation behind both.
 */
export class WriteFileTool extends CapabilityTool {
  constructor() {
    super(
      writeFileCapability.spec,
      writeFileCapability.impl,
      fileCapabilityRun
    );
  }
}

/**
 * @deprecated Ported to the `files` capability module
 * (`../capabilities/files.ts`). Kept as a thin subclass so existing
 * constructors keep working; there is one implementation behind both.
 */
export class ListDirectoryTool extends CapabilityTool {
  constructor() {
    super(listDirectory.spec, listDirectory.impl, fileCapabilityRun);
  }
}
