import { GuestContext } from "./host/context.mjs";
export function forkContext(parent) {
  const child = new GuestContext({
    jobId: parent.jobId, workflowId: parent.workflowId, signal: parent.signal,
    providerResolver: parent._providerResolver, modelInterfaces: parent._modelInterfaces,
    injectedTools: parent._injectedTools, userId: parent.userId,
    environment: parent.environment, modelServices: parent._models
  });
  child._variables = { ...parent._variables };
  child._providers = new Map(parent._providers);
  child._resolvedSecrets = parent._resolvedSecrets;
  for (const name of ["storage", "workspace", "workspaceDir", "assetStorage", "workspaceStorage", "assetOutputMode", "persistOutputAssets", "authToken", "sandboxModuleCatalog", "triggerEvent", "threadId", "projectId"]) child[name] = parent[name];
  return child;
}
