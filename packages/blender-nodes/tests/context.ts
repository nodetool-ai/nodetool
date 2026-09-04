/**
 * Workspace test double for `runBlenderJob` calls.
 *
 * Production resolves the runner's scratch parent from
 * `context.workspace.scratchDir()` (D6 step 1); tests build that seam with
 * `createFakeContext` instead of a tmpdir fallback in production code. The
 * fake context owns a temp workspace dir; call `cleanup()` when done.
 */

import { createFakeContext, type ProcessingContext } from "@nodetool-ai/runtime";

export interface BlenderTestContext {
  context: ProcessingContext;
  cleanup: () => void;
}

export function blenderTestContext(): BlenderTestContext {
  const handle = createFakeContext();
  return { context: handle.context, cleanup: () => handle.cleanup() };
}
