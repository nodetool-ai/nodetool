import type { ModuleConfig, NodeConfig } from "./types.js";

/** One entry of `kie-nodes/src/kie-manifest.json`. */
export interface ManifestEntry {
  className: string;
  moduleName: string;
  modelId: string;
  title: string;
  description: string;
  outputType: string;
  pollInterval: number;
  maxAttempts: number;
  useSuno?: boolean;
  sunoEndpoint?: string;
  useOmniDirect?: boolean;
  submitEndpoint?: string;
  responseIdKey?: string;
  resultObjectKey?: string;
  fields: NodeConfig["fields"];
  uploads?: NodeConfig["uploads"];
  validation?: NodeConfig["validation"];
  paramNames?: NodeConfig["paramNames"];
  conditionalFields?: NodeConfig["conditionalFields"];
}

export function configToManifest(config: ModuleConfig): ManifestEntry[] {
  return config.nodes.map((node) => {
    const entry: ManifestEntry = {
      className: node.className,
      moduleName: node.moduleName ?? config.moduleName,
      modelId: node.modelId,
      title: node.title || node.className.replace(/([A-Z])/g, " $1").trim(),
      description: node.description,
      outputType: node.outputType,
      pollInterval: node.pollInterval ?? config.defaultPollInterval ?? 2000,
      maxAttempts: node.maxAttempts ?? config.defaultMaxAttempts ?? 300,
      fields: node.fields
    };
    if (node.useSuno) entry.useSuno = true;
    if (node.sunoEndpoint) entry.sunoEndpoint = node.sunoEndpoint;
    if (node.useOmniDirect) entry.useOmniDirect = true;
    if (node.submitEndpoint) entry.submitEndpoint = node.submitEndpoint;
    if (node.responseIdKey) entry.responseIdKey = node.responseIdKey;
    if (node.resultObjectKey) entry.resultObjectKey = node.resultObjectKey;
    if (node.uploads?.length) entry.uploads = node.uploads;
    if (node.validation?.length) entry.validation = node.validation;
    if (node.paramNames && Object.keys(node.paramNames).length > 0)
      entry.paramNames = node.paramNames;
    if (node.conditionalFields?.length)
      entry.conditionalFields = node.conditionalFields;
    return entry;
  });
}
