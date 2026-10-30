export const FEATURE_API_VERSION = 1;

export interface FeatureDescriptor {
  readonly id: string;
  readonly apiVersion: number;
  readonly packageName?: string;
  readonly packId?: string | null;
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

export type FeatureFailureCode = "FEATURE_NOT_INSTALLED" | "FEATURE_NOT_CONFIGURED" | "FEATURE_INITIALIZATION_FAILED";

export interface FeatureRecovery {
  readonly featureId: string;
  readonly packId: string | null;
  readonly packageName: string;
  readonly installCommand: string;
  readonly adapterInstallCommand?: string;
  readonly configuration: string;
  readonly restart: string;
  readonly authorizationRequired: true;
}

export function featureRecovery(featureId: string, packageName = "@nodetool-ai/server-feature-packs", packId: string | null = featureId): FeatureRecovery {
  const scoped = featureId === "automation" || featureId === "transformers-js";
  const configuration = featureId === "automation"
    ? 'Import createInstalledPackFeature and isolatedBrowserService from @nodetool-ai/server-feature-packs, import the installed @nodetool-ai/browser module as browser, then configure createInstalledPackFeature({packId:"automation",nodeTypes:["lib.browser.Screenshot"],openBrowser:isolatedBrowserService(browser)}) in the server features option.'
    : featureId === "transformers-js"
      ? 'Import createInstalledPackFeature and localTransformersService from @nodetool-ai/server-feature-packs, import the explicitly installed @huggingface/transformers runtime as transformers, then configure createInstalledPackFeature({packId:"transformers-js",nodeTypes:["transformers.TextGeneration"],openLocalGeneration:localTransformersService(transformers,{small:"/approved/local/model/path"})}) in the server features option. Provision an approved local model and select model ID small in the workflow.'
      : `Explicitly configure feature ${featureId} in the server features option. Installation alone does not activate it.`;
  const recovery: FeatureRecovery = {
    featureId, packId, packageName,
    installCommand: packId === null ? `npm install ${packageName}` : `nodetool packs add ${packId} --yes`,
    configuration,
    restart: "Restart the server with the updated feature configuration, then retry the original workflow.",
    authorizationRequired: true
  };
  if (scoped) { return { ...recovery, adapterInstallCommand: "npm install @nodetool-ai/server-feature-packs" }; }
  return recovery;
}

export class FeatureNotInstalledError extends Error {
  override readonly name = "FeatureNotInstalledError";
  readonly recovery: readonly FeatureRecovery[];

  constructor(
    readonly nodeType: string,
    readonly featureIds: readonly string[],
    readonly code: FeatureFailureCode = "FEATURE_NOT_INSTALLED",
    packages: ReadonlyMap<string, string> = new Map(),
    packIds: ReadonlyMap<string, string | null> = new Map()
  ) {
    const recovery = featureIds.map(id => featureRecovery(id, packages.get(id), packIds.has(id) ? packIds.get(id) : id));
    super(`Node ${nodeType} requires feature ${featureIds.join(", ")}. ${recovery.map(item => `Authorize installation using ${item.installCommand}.${item.adapterInstallCommand ? ` Then explicitly run ${item.adapterInstallCommand}.` : ""} ${item.configuration} ${item.restart}`).join(" ")}`);
    this.recovery = recovery;
  }
}

export class FeatureInitializationError extends FeatureConfigurationError {
  readonly code = "FEATURE_INITIALIZATION_FAILED";
  readonly featureIds: readonly string[];
  readonly recovery: readonly FeatureRecovery[];
  constructor(featureId: string, message: string, cause: unknown, descriptor?: FeatureDescriptor) {
    const recovery = featureRecovery(featureId, descriptor?.packageName, descriptor?.packId);
    super(`${message}. ${recovery.configuration} ${recovery.restart}`, {cause});
    this.featureIds = [featureId];
    this.recovery = [recovery];
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
    packageName: descriptor.packageName,
    packId: descriptor.packId,
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
  const catalogDescriptors = new Map(catalog.map(descriptor => [descriptor.id, descriptor]));
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
      throw new FeatureInitializationError(entry.id, `Loading configured feature ${entry.id} failed`, cause, catalogDescriptors.get(entry.id));
    }
    checkDescriptor(feature.descriptor);
    if (feature.descriptor.id !== entry.id) {
      throw new FeatureConfigurationError(`Feature ${entry.id} loaded descriptor ${feature.descriptor.id}`);
    }
    modules.set(entry.id, feature);
    descriptors.set(entry.id, snapshot({ ...catalogDescriptors.get(entry.id), ...feature.descriptor }));
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
        throw new FeatureInitializationError(id, `Activating configured feature ${id} failed`,
          new AggregateError([cause, cleanupError], "Feature activation and rollback failed"), descriptors.get(id));
      }
      if (cause instanceof FeatureNotInstalledError) { throw cause; }
      throw new FeatureInitializationError(id, `Activating configured feature ${id} failed`, cause, descriptors.get(id));
    }
  }
  const features = Object.freeze([...descriptors.values()]);
  const recoveryDescriptors = [...catalog, ...features];
  const recoveryPackages = new Map(recoveryDescriptors.flatMap(entry => entry.packageName ? [[entry.id, entry.packageName] as const] : []));
  const recoveryPackIds = new Map(recoveryDescriptors.map(entry => [entry.id, entry.packId === undefined ? entry.id : entry.packId] as const));
  return {
    features,
    capabilities: Object.freeze([...new Set(features.flatMap((descriptor) => descriptor.capabilities ?? []))].sort()),
    requireNode: (nodeType): void => {
      if (installedNodes.has(nodeType)) {
        return;
      }
      const owner = nodeOwners.get(nodeType);
      if (owner) {
        throw new FeatureNotInstalledError(nodeType, [owner], descriptors.has(owner) ? "FEATURE_NOT_CONFIGURED" : "FEATURE_NOT_INSTALLED", recoveryPackages, recoveryPackIds);
      }
      throw new Error(`Unknown node type ${nodeType}`);
    },
    close
  };
}
