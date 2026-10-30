import { setWorkspaceFactory } from "./context.js";
import { StorageWorkspace, createLocalWorkspace } from "@nodetool-ai/runtime-core";
export { StorageWorkspace, createWorkspace, createLocalWorkspace } from "@nodetool-ai/runtime-core";

setWorkspaceFactory((opts) => {
  if (opts.workspace) return opts.workspace;
  if (opts.workspaceStorage) return new StorageWorkspace(opts.workspaceStorage);
  if (opts.workspaceDir) return createLocalWorkspace(opts.workspaceDir);
  return null;
});
