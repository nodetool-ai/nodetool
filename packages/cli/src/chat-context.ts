/**
 * The ProcessingContext a CLI chat turn runs on.
 *
 * Both entrances build the same one — the Ink app and `--stdin` mode — so a
 * turn behaves the same whichever way it was started.
 *
 * It carries the same persistence a local workflow run gets. Without it
 * `persistOutput` falls back to a workspace file, and since the CLI's
 * workspace is the current directory, a generated image landed in whatever
 * folder the user happened to start the chat in, with no `asset://` URI for
 * anything downstream to reference.
 */

import { resolveLocalSecret } from "./local-secrets.js";
import { createLocalWorkspace, ProcessingContext } from "@nodetool-ai/runtime";
import { localModelInterfaces } from "./local-model-interfaces.js";

export async function createChatContext(opts: {
  workspaceDir?: string | null;
  userId?: string;
}): Promise<ProcessingContext> {
  const workspaceDir = opts.workspaceDir ?? null;
  const context = new ProcessingContext({
    jobId: crypto.randomUUID(),
    userId: opts.userId ?? "1",
    workspace: workspaceDir ? createLocalWorkspace(workspaceDir) : null,
    secretResolver: resolveLocalSecret
  });
  context.setModelInterfaces(await localModelInterfaces());
  return context;
}
