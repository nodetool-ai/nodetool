import type { MissingPackInstall } from "@nodetool-ai/protocol";

export interface PackLoaderPackage {
  readonly npm: string;
  readonly version: string;
  readonly realPackageRoot: string;
}

export interface PackLoaderEntry {
  readonly id: string;
  readonly packages: readonly PackLoaderPackage[];
}

export interface PackLoaderContext {
  readonly coreVersion: string;
  readonly packs: readonly PackLoaderEntry[];
  readonly install: MissingPackInstall;
}

let context: PackLoaderContext | undefined;
let provider: (() => PackLoaderContext | Promise<PackLoaderContext>) | undefined;
let pending: Promise<PackLoaderContext> | undefined;

/** Hosts opt into an admitted tree. Unconfigured library users retain D22 resolution. */
export function setPackLoaderContext(value: PackLoaderContext | undefined): void {
  context = value;
  provider = undefined;
  pending = undefined;
}

/** Defer inventory reads until a command actually asks for a node pack. */
export function setPackLoaderContextProvider(value: () => PackLoaderContext | Promise<PackLoaderContext>): void {
  context = undefined;
  provider = value;
  pending = undefined;
}

export async function loadPackLoaderContext(): Promise<PackLoaderContext | undefined> {
  if (context || !provider) {
    return context;
  }
  pending ??= Promise.resolve().then(provider).then((value) => {
    context = value;
    return value;
  }).catch((error: unknown) => {
    pending = undefined;
    throw error;
  });
  return pending;
}

/** Errors use the host's mode guidance after the admitted inventory is initialized. */
export function currentPackInstall(): MissingPackInstall | undefined {
  return context?.install;
}
