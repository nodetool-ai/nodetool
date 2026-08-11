/**
 * Code-node authoring harness tools — the write → validate → run → test loop
 * for a `nodetool.code.Code` body, available as ordinary top-level tools:
 *
 *   validate_code — the static check the workflow validator runs
 *   run_code      — execute a body in the QuickJS sandbox with given inputs
 *   test_code     — run a case list and grade each against expected outputs
 *
 * The implementations live in the `code` capability module
 * (`../capabilities/code.ts`); the classes below are thin wrappers so
 * `BUILTIN_TOOL_CLASSES` and every belt that names them keep working.
 *
 * These are NOT a second CodeAct surface: `execute_code` remains how an agent
 * acts. This harness runs a *Code-node body* — `inputs` object, implicit
 * return, `yield` streaming, sandbox packages — so an agent can author,
 * debug, and regression-test node code from any surface.
 */

import type { ProcessingContext } from "@nodetool-ai/runtime";
import {
  CapabilityTool,
  UNGATED,
  createCapabilityRun,
  type CapabilityRun
} from "../capabilities/index.js";
import { validateCode, runCode, testCode } from "../capabilities/code.js";

/** These capabilities need nothing per-run beyond the calling context. */
const codeRun = (context: ProcessingContext): CapabilityRun =>
  createCapabilityRun({ context, gate: UNGATED });

export class ValidateCodeTool extends CapabilityTool {
  constructor() {
    super(validateCode.spec, validateCode.impl, codeRun);
  }
}

export class RunCodeTool extends CapabilityTool {
  constructor() {
    super(runCode.spec, runCode.impl, codeRun);
  }
}

export class TestCodeTool extends CapabilityTool {
  constructor() {
    super(testCode.spec, testCode.impl, codeRun);
  }
}
