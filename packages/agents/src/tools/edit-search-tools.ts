/**
 * File-editing and search tools for agents: Edit, Glob, and Grep.
 *
 * The implementations — the exact-replacement edit, the glob matcher, the grep
 * scan with its ReDoS guards and its time/size budgets — live in the `files`
 * capability module (`../capabilities/files.ts`). These classes are the
 * zero-arg constructor surface `BUILTIN_TOOL_CLASSES` and `resolveTool(name)`
 * still use.
 */

import { CapabilityTool } from "../capabilities/index.js";
import {
  editFile,
  fileCapabilityRun,
  glob,
  grep
} from "../capabilities/files.js";

/**
 * @deprecated Ported to the `files` capability module
 * (`../capabilities/files.ts`). Kept as a thin subclass so existing
 * constructors keep working; there is one implementation behind both.
 */
export class EditFileTool extends CapabilityTool {
  constructor() {
    super(editFile.spec, editFile.impl, fileCapabilityRun);
  }
}

/**
 * @deprecated Ported to the `files` capability module
 * (`../capabilities/files.ts`). Kept as a thin subclass so existing
 * constructors keep working; there is one implementation behind both.
 */
export class GlobTool extends CapabilityTool {
  constructor() {
    super(glob.spec, glob.impl, fileCapabilityRun);
  }
}

/**
 * @deprecated Ported to the `files` capability module
 * (`../capabilities/files.ts`). Kept as a thin subclass so existing
 * constructors keep working; there is one implementation behind both.
 */
export class GrepTool extends CapabilityTool {
  constructor() {
    super(grep.spec, grep.impl, fileCapabilityRun);
  }
}
