export const FEATURE_API_VERSION = 1;

export interface FeatureDescriptor {
  readonly id: string;
  readonly apiVersion: number;
  readonly requires?: readonly string[];
  readonly capabilities?: readonly string[];
  readonly nodeTypes?: readonly string[];
}

export interface ServerFeature<Host> {
  readonly descriptor: FeatureDescriptor;
  readonly activate: (host: Host) => void | (() => void | Promise<void>) | Promise<void | (() => void | Promise<void>)>;
}

export interface ConfiguredFeature<Host> {
  readonly id: string;
  readonly load: () => Promise<ServerFeature<Host>>;
}

export class FeatureConfigurationError extends Error {
  override readonly name = "FeatureConfigurationError";
}

export class FeatureNotInstalledError extends Error {
  override readonly name = "FeatureNotInstalledError";
  readonly code = "FEATURE_NOT_INSTALLED";

  constructor(readonly nodeType: string, readonly featureIds: readonly string[]) {
    super(`Node ${nodeType} requires feature ${featureIds.join(", ")}`);
  }
}

export interface FeatureHost {
  readonly features: readonly FeatureDescriptor[];
  readonly capabilities: readonly string[];
  readonly requireNode: (nodeType: string) => void;
  readonly close: () => Promise<void>;
}

function checkDescriptor(descriptor: FeatureDescriptor): void {
  if (!descriptor.id || descriptor.apiVersion !== FEATURE_API_VERSION) {
    throw new FeatureConfigurationError(`Feature ${descriptor.id} requires unsupported API ${descriptor.apiVersion}`);
  }
  for (const values of [descriptor.requires, descriptor.capabilities, descriptor.nodeTypes]) {
    if (values?.some((value) => typeof value !== "string" || !value) || new Set(values).size !== (values?.length ?? 0)) {
      throw new FeatureConfigurationError(`Feature ${descriptor.id} contains empty or duplicate declarations`);
    }
  }
}

function snapshot(descriptor: FeatureDescriptor): FeatureDescriptor {
  return Object.freeze({
    id: descriptor.id,
    apiVersion: descriptor.apiVersion,
    requires: Object.freeze([...(descriptor.requires ?? [])]),
    capabilities: Object.freeze([...(descriptor.capabilities ?? [])]),
    nodeTypes: Object.freeze([...(descriptor.nodeTypes ?? [])])
  });
}

/** Load only administrator-configured features, then activate prerequisites first. */
export async function configureFeatures<Host>(
  configured: readonly ConfiguredFeature<Host>[],
  host: Host,
  catalog: readonly FeatureDescriptor[] = []
): Promise<FeatureHost> {
  const modules = new Map<string, ServerFeature<Host>>();
  const descriptors = new Map<string, FeatureDescriptor>();
  for (const entry of configured) {
    if (modules.has(entry.id)) {
      throw new FeatureConfigurationError(`Feature ${entry.id} is configured more than once`);
    }
    let feature: ServerFeature<Host>;
    try {
      feature = await entry.load();
    } catch (cause) {
      throw new FeatureConfigurationError(`Loading configured feature ${entry.id} failed`, { cause });
    }
    checkDescriptor(feature.descriptor);
    if (feature.descriptor.id !== entry.id) {
      throw new FeatureConfigurationError(`Feature ${entry.id} loaded descriptor ${feature.descriptor.id}`);
    }
    modules.set(entry.id, feature);
    descriptors.set(entry.id, snapshot(feature.descriptor));
  }
  const remaining = new Map<string, number>();
  const dependents = new Map<string, string[]>();
  const ordered: string[] = [];
  for (const descriptor of descriptors.values()) {
    const dependencies = descriptor.requires ?? [];
    remaining.set(descriptor.id, dependencies.length);
    if (dependencies.length === 0) {
      ordered.push(descriptor.id);
    }
    for (const dependency of dependencies) {
      if (!descriptors.has(dependency)) {
        throw new FeatureConfigurationError(`Required feature ${dependency} is not configured`);
      }
      const entries = dependents.get(dependency) ?? [];
      entries.push(descriptor.id);
      dependents.set(dependency, entries);
    }
  }
  for (let index = 0; index < ordered.length; index++) {
    const id = ordered[index];
    if (id === undefined) {
      throw new Error("Missing feature in activation order");
    }
    for (const dependent of dependents.get(id) ?? []) {
      const count = (remaining.get(dependent) ?? 0) - 1;
      remaining.set(dependent, count);
      if (count === 0) {
        ordered.push(dependent);
      }
    }
  }
  if (ordered.length !== descriptors.size) {
    throw new FeatureConfigurationError("Feature prerequisites contain a cycle");
  }
  const nodeOwners = new Map<string, string>();
  const installedNodes = new Set<string>();
  const catalogIds = new Set<string>();
  for (const descriptor of catalog) {
    checkDescriptor(descriptor);
    if (catalogIds.has(descriptor.id)) {
      throw new FeatureConfigurationError(`Feature ${descriptor.id} appears more than once in the catalog`);
    }
    catalogIds.add(descriptor.id);
    for (const nodeType of descriptor.nodeTypes ?? []) {
      const owner = nodeOwners.get(nodeType);
      if (owner !== undefined) {
        throw new FeatureConfigurationError(`Node ${nodeType} is declared by both ${owner} and ${descriptor.id}`);
      }
      nodeOwners.set(nodeType, descriptor.id);
    }
  }
  for (const descriptor of descriptors.values()) {
    for (const nodeType of descriptor.nodeTypes ?? []) {
      const owner = nodeOwners.get(nodeType);
      if (owner !== undefined && owner !== descriptor.id) {
        throw new FeatureConfigurationError(`Node ${nodeType} is declared by both ${owner} and ${descriptor.id}`);
      }
      nodeOwners.set(nodeType, descriptor.id);
      installedNodes.add(nodeType);
    }
  }
  const cleanup: Array<() => void | Promise<void>> = [];
  const close = async (): Promise<void> => {
    const errors: unknown[] = [];
    while (cleanup.length > 0) {
      try {
        await cleanup.pop()?.();
      } catch (error) {
        errors.push(error);
      }
    }
    if (errors.length > 0) {
      throw new AggregateError(errors, "Closing server features failed");
    }
  };
  for (const id of ordered) {
    try {
      const dispose = await modules.get(id)?.activate(host);
      if (dispose) {
        cleanup.push(dispose);
      }
    } catch (cause) {
      try {
        await close();
      } catch (cleanupError) {
        throw new FeatureConfigurationError(`Activating configured feature ${id} failed`, {
          cause: new AggregateError([cause, cleanupError], "Feature activation and rollback failed")
        });
      }
      throw new FeatureConfigurationError(`Activating configured feature ${id} failed`, { cause });
    }
  }
  const features = Object.freeze([...descriptors.values()]);
  return {
    features,
    capabilities: Object.freeze([...new Set(features.flatMap((descriptor) => descriptor.capabilities ?? []))].sort()),
    requireNode: (nodeType): void => {
      if (installedNodes.has(nodeType)) {
        return;
      }
      const owner = nodeOwners.get(nodeType);
      if (owner) {
        throw new FeatureNotInstalledError(nodeType, [owner]);
      }
      throw new Error(`Unknown node type ${nodeType}`);
    },
    close
  };
}
