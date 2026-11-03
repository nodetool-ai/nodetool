import { readFileSync, statSync } from "node:fs";
import { mkdir, readdir, readFile, rename, rm, unlink, writeFile } from "node:fs/promises";
import { randomBytes, randomUUID } from "node:crypto";
import { join } from "node:path";
import { z } from "zod";
import type { CatalogPack, InstallPackagePin, NodeCatalogIndex } from "@nodetool-ai/pack-core";
import { RUNTIME_NPM_PACKAGES, isRuntimeNpmPackageId } from "@nodetool-ai/protocol/runtime-npm-packages";

/**
 * Packs live in an npm project the installer owns, one per core version:
 * `<packs home>/<core version>/<generation>/`. `current.json` names the active
 * generation. An install builds a new generation and switches the pointer only
 * after verification, so a failed install never touches the active tree.
 */
export const PACKS_PROJECT_NAME = "nodetool-packs";
const POINTER_FILE = "current.json";
const GENERATION_PATTERN = /^g-[0-9a-z]+-[0-9a-f]{16}$/;

const pointerSchema = z.object({ schemaVersion: z.literal(1), generation: z.string().regex(GENERATION_PATTERN) });
const selectionSchema = z.object({
  coreVersion: z.string().min(1),
  packs: z.array(z.string()),
  runtimeLibraries: z.array(z.string())
});
const manifestSchema = z.object({ name: z.literal(PACKS_PROJECT_NAME), nodetool: selectionSchema });

/** The ids a user asked for. npm resolves everything they require. */
export type PacksProjectSelection = z.infer<typeof selectionSchema>;

export interface PinnedSpec {
  readonly folder: string;
  readonly spec: string;
  readonly pin: InstallPackagePin;
}

function hasCode(error: unknown, code: string): boolean {
  return error instanceof Error && "code" in error && error.code === code;
}

function readPointer(packsRoot: string): string | null {
  let raw: string;
  try {
    raw = readFileSync(join(packsRoot, POINTER_FILE), "utf8");
  } catch (error) {
    if (hasCode(error, "ENOENT")) { return null; }
    throw error;
  }
  return join(packsRoot, pointerSchema.parse(JSON.parse(raw)).generation);
}

function isDirectory(path: string): boolean {
  try { return statSync(path).isDirectory(); }
  catch (error) {
    if (hasCode(error, "ENOENT")) { return false; }
    throw error;
  }
}

/**
 * The active generation directory, or null before the first install. A
 * pointer to a deleted generation also reads as null, so the CLI still starts
 * and `packs doctor` reports it.
 */
export function currentProject(packsRoot: string): string | null {
  const directory = readPointer(packsRoot);
  return directory && isDirectory(directory) ? directory : null;
}

/** A doctor message when the pointer names a generation that no longer exists. */
export function projectPointerIssue(packsRoot: string): string | null {
  const directory = readPointer(packsRoot);
  return directory && !isDirectory(directory)
    ? `Pack project pointer names a missing generation: ${directory}. Run "nodetool packs doctor --repair".` : null;
}

/** A new, empty generation directory beside the active one. */
export async function createGeneration(packsRoot: string): Promise<string> {
  await mkdir(packsRoot, { recursive: true });
  const name = `g-${Date.now().toString(36)}-${randomBytes(8).toString("hex")}`;
  const directory = join(packsRoot, name);
  await mkdir(directory);
  return directory;
}

/** Switch the active generation with one atomic rename of the pointer file. */
export async function activateGeneration(packsRoot: string, generation: string): Promise<void> {
  const name = generation.slice(packsRoot.length + 1);
  if (join(packsRoot, name) !== generation || !GENERATION_PATTERN.test(name)) {
    throw new Error(`Generation ${generation} is not inside ${packsRoot}`);
  }
  const temporary = join(packsRoot, `${POINTER_FILE}.${randomUUID()}.tmp`);
  try {
    await writeFile(temporary, JSON.stringify({ schemaVersion: 1, generation: name }) + "\n", { flag: "wx" });
    await rename(temporary, join(packsRoot, POINTER_FILE));
  } finally {
    await unlink(temporary).catch((error: unknown) => { if (!hasCode(error, "ENOENT")) { throw error; } });
  }
}

/** Delete generations other than the active one and the one it replaced. */
export async function pruneGenerations(packsRoot: string, keep: readonly (string | null)[]): Promise<void> {
  const kept = new Set(keep.filter((value): value is string => value !== null));
  for (const entry of await readdir(packsRoot, { withFileTypes: true })) {
    const directory = join(packsRoot, entry.name);
    if (entry.isDirectory() && GENERATION_PATTERN.test(entry.name) && !kept.has(directory)) {
      await rm(directory, { recursive: true, force: true });
    }
  }
}

/** Read the requested selection recorded in a generation's package.json. */
export async function readProjectSelection(project: string): Promise<PacksProjectSelection> {
  return manifestSchema.parse(JSON.parse(await readFile(join(project, "package.json"), "utf8"))).nodetool;
}

/** Catalog pin for each folder a runtime library installs at the project root. */
export function runtimeLibraryPins(catalog: NodeCatalogIndex, id: string): PinnedSpec[] {
  if (!isRuntimeNpmPackageId(id)) { throw new Error(`Runtime library ${id} cannot be installed by npm`); }
  const byFolder = new Map((catalog.installPins ?? []).map((pin) => [pin.installName ?? pin.name, pin]));
  const runtime = RUNTIME_NPM_PACKAGES[id];
  return runtime.packageNames.map((folder, index) => {
    const pin = byFolder.get(folder);
    if (!pin) { throw new Error(`Runtime library ${id} has no integrity pins; installation is unavailable until catalog pins are supplied.`); }
    const spec = pinSpec(pin);
    if (`${folder}@${spec}` !== runtime.npmPackages[index]) { throw new Error(`Runtime library ${id} pin differs from its exact runtime spec: ${folder}`); }
    return { folder, spec, pin };
  });
}

/** The dependency value npm records for a pin, including an npm alias. */
export function pinSpec(pin: InstallPackagePin): string {
  return pin.installName && pin.installName !== pin.name ? `npm:${pin.name}@${pin.version}` : pin.version;
}

/** Top-level folders, exact specs and integrity pins for a pack and its companions. */
export function packPins(catalog: NodeCatalogIndex, pack: CatalogPack): PinnedSpec[] {
  const byFolder = new Map((catalog.installPins ?? []).map((pin) => [pin.installName ?? pin.name, pin]));
  const companions = pack.provides.map((folder) => {
    const pin = byFolder.get(folder);
    if (!pin) { throw new Error(`Provided package ${folder} has no integrity pin`); }
    return { folder, spec: pinSpec(pin), pin };
  });
  return [{ folder: pack.npm.name, spec: pack.npm.version, pin: pack.npm }, ...companions];
}

/** The package.json of a generation: exact dependencies plus the requested selection. */
export function projectManifest(selection: PacksProjectSelection, roots: readonly PinnedSpec[]): Record<string, unknown> {
  const dependencies: Record<string, string> = {};
  for (const root of [...roots].sort((a, b) => a.folder.localeCompare(b.folder))) {
    const existing = dependencies[root.folder];
    if (existing !== undefined && existing !== root.spec) { throw new Error(`Conflicting pins for ${root.folder}: ${existing} and ${root.spec}`); }
    dependencies[root.folder] = root.spec;
  }
  return {
    name: PACKS_PROJECT_NAME,
    version: "0.0.0",
    private: true,
    description: "Node packs installed by the NodeTool CLI. Change them with nodetool packs add and nodetool packs remove.",
    nodetool: { coreVersion: selection.coreVersion, packs: [...selection.packs].sort(), runtimeLibraries: [...selection.runtimeLibraries].sort() },
    dependencies
  };
}
