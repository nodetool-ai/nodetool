import { existsSync, readFileSync, realpathSync } from "node:fs";
import { homedir } from "node:os";
import { join, posix, win32 } from "node:path";
import { z } from "zod";
import type { MissingPackInstall } from "@nodetool-ai/node-catalog";

export type InstallPathStyle = "posix" | "win32";

interface InstallIdentity {
  readonly cliRoot: string;
  readonly coreVersion: string;
  readonly pathStyle: InstallPathStyle;
}

export type InstallMode = InstallIdentity & (
  | { readonly kind: "global"; readonly installRoot: string; readonly nodeModulesRoot: string }
  | { readonly kind: "local"; readonly installRoot: string; readonly nodeModulesRoot: string }
  | { readonly kind: "npx" | "dev" | "unsupported"; readonly reason: string; readonly nodeModulesRoot: string | null }
);

export interface InstallLayout {
  readonly cliRoot: string;
  readonly coreVersion: string;
  readonly pathStyle?: InstallPathStyle;
  readonly globalNodeModulesRoots?: readonly string[];
  readonly projectHasCli?: boolean;
  readonly yarnPnp?: boolean;
  readonly bunGlobalRoots?: readonly string[];
  readonly workspaceRoot?: string;
}

export interface InstallModeOptions {
  readonly globalNodeModulesRoots?: readonly string[];
  readonly bunGlobalRoots?: readonly string[];
}

const NPX_REASON = 'Packs need a global or local install. Run "npm install -g @nodetool-ai/cli" or "npm install @nodetool-ai/cli" in a project.';
const DEV_REASON = "Node packs are workspaces in this checkout. Build the required workspace instead of installing it.";
const dependenciesSchema = z.record(z.string(), z.string());
const manifestSchema = z.object({
  name: z.string().optional(),
  version: z.string().min(1).optional(),
  dependencies: dependenciesSchema.optional(),
  devDependencies: dependenciesSchema.optional(),
  optionalDependencies: dependenciesSchema.optional(),
  workspaces: z.union([z.array(z.string()), z.object({ packages: z.array(z.string()) })]).optional()
});
type Manifest = z.infer<typeof manifestSchema>;

function pathKey(path: string, style: InstallPathStyle): string {
  const paths = style === "win32" ? win32 : posix;
  const normalized = paths.normalize(path).replace(/[/\\]+$/, "");
  return style === "win32" ? normalized.toLowerCase() : normalized;
}

/** Classify a known package root without filesystem reads or npm subprocesses. */
export function classifyInstallLayout(layout: InstallLayout): InstallMode {
  const pathStyle = layout.pathStyle ?? "posix";
  const paths = pathStyle === "win32" ? win32 : posix;
  const cliRoot = paths.normalize(layout.cliRoot);
  const segments = pathKey(cliRoot, pathStyle).split(paths.sep);
  const modules = paths.dirname(paths.dirname(cliRoot));
  const npmLayout = pathKey(paths.basename(modules), pathStyle) === "node_modules" &&
    pathKey(paths.basename(paths.dirname(cliRoot)), pathStyle) === "@nodetool-ai";
  const nodeModulesRoot = npmLayout ? modules : null;
  const identity = { cliRoot, coreVersion: layout.coreVersion, pathStyle };
  if (segments.includes("_npx")) {
    return { ...identity, kind: "npx", reason: NPX_REASON, nodeModulesRoot };
  }
  if (segments.includes(".pnpm")) {
    return { ...identity, kind: "unsupported", reason: "Node pack installation is unsupported in a pnpm store. Use an npm global or local install.", nodeModulesRoot };
  }
  if (layout.yarnPnp) {
    return { ...identity, kind: "unsupported", reason: "Node pack installation is unsupported with Yarn PnP. Use an npm global or local install.", nodeModulesRoot };
  }
  const bunLayout = segments.some((part, index) => part === ".bun" && segments[index + 1] === "install" && segments[index + 2] === "global") ||
    layout.bunGlobalRoots?.some((root) => pathKey(cliRoot, pathStyle).startsWith(pathKey(root, pathStyle) + paths.sep));
  if (bunLayout) {
    return { ...identity, kind: "unsupported", reason: "Node pack installation is unsupported in the Bun global directory. Use an npm global or local install.", nodeModulesRoot };
  }
  if (!segments.includes("node_modules")) {
    return { ...identity, kind: "dev", reason: DEV_REASON,
      nodeModulesRoot: layout.workspaceRoot ? paths.join(layout.workspaceRoot, "node_modules") : null };
  }
  if (nodeModulesRoot && layout.globalNodeModulesRoots?.some((root) => pathKey(root, pathStyle) === pathKey(nodeModulesRoot, pathStyle))) {
    return { ...identity, kind: "global", installRoot: cliRoot, nodeModulesRoot: paths.join(cliRoot, "node_modules") };
  }
  if (nodeModulesRoot && layout.projectHasCli) {
    return { ...identity, kind: "local", installRoot: paths.dirname(nodeModulesRoot), nodeModulesRoot };
  }
  return { ...identity, kind: "unsupported", reason: "The project does not list @nodetool-ai/cli as a dependency. Install it explicitly in the project or use an npm global install.", nodeModulesRoot };
}

function readManifest(root: string): Manifest | undefined {
  const file = join(root, "package.json");
  let content: string;
  try {
    content = readFileSync(file, "utf8");
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return undefined;
    }
    throw error;
  }
  try {
    return manifestSchema.parse(JSON.parse(content));
  } catch (cause) {
    throw new Error(`Invalid package manifest: ${file}`, { cause });
  }
}

function ancestorDirectories(start: string): string[] {
  const paths = process.platform === "win32" ? win32 : posix;
  const result: string[] = [];
  for (let current = start; ; current = paths.dirname(current)) {
    result.push(current);
    if (paths.dirname(current) === current) {
      return result;
    }
  }
}

function prefixFromNpmrc(): string | undefined {
  const file = process.env["npm_config_userconfig"] ?? process.env["NPM_CONFIG_USERCONFIG"] ?? join(homedir(), ".npmrc");
  let content: string;
  try {
    content = readFileSync(file, "utf8");
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return undefined;
    }
    throw error;
  }
  let prefix: string | undefined;
  for (const line of content.split(/\r?\n/)) {
    // npm config sections do not define a top-level global prefix.
    if (line.trimStart().startsWith("[")) {
      break;
    }
    const match = /^\s*prefix\s*=\s*(.*)$/.exec(line);
    if (!match) {
      continue;
    }
    const raw = match[1].trim();
    if (raw.startsWith('"') && raw.endsWith('"')) {
      try {
        prefix = z.string().parse(JSON.parse(raw));
      } catch {
        // A malformed prefix is not a reliable global installation root.
        prefix = undefined;
      }
    } else if (raw.startsWith("'") && raw.endsWith("'")) {
      prefix = raw.slice(1, -1);
    } else {
      const chars: string[] = [];
      for (let index = 0; index < raw.length; index++) {
        const char = raw[index];
        if (char === ";" || char === "#") {
          break;
        }
        if (char === "\\" && ["\\", ";", "#"].includes(raw[index + 1])) {
          index++;
          chars.push(raw[index]);
        } else {
          chars.push(char);
        }
      }
      prefix = chars.join("").trim();
    }
  }
  return prefix;
}

function defaultGlobalRoots(): string[] {
  const paths = process.platform === "win32" ? win32 : posix;
  const roots = process.platform === "win32"
    ? [paths.join(paths.dirname(process.execPath), "node_modules")]
    : [paths.resolve(paths.dirname(process.execPath), "../lib/node_modules"), "/usr/local/lib/node_modules", "/usr/lib/node_modules"];
  const prefix = process.env["npm_config_prefix"] ?? process.env["NPM_CONFIG_PREFIX"] ?? prefixFromNpmrc();
  if (prefix) {
    let expanded = prefix.replace(/(?<!\\)\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g, (original: string, name: string) => process.env[name] ?? original);
    if (expanded.startsWith("~/") || expanded.startsWith("~\\")) {
      expanded = paths.join(homedir(), expanded.slice(2));
    }
    roots.push(paths.resolve(expanded, process.platform === "win32" ? "node_modules" : "lib/node_modules"));
  }
  const appData = process.env["APPDATA"];
  if (process.platform === "win32" && appData) {
    roots.push(paths.join(appData, "npm", "node_modules"));
  }
  return roots;
}

function canonicalGlobalRoot(root: string): string {
  try {
    return realpathSync(root);
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return root;
    }
    throw error;
  }
}

/** Resolve the real CLI entry and inspect its layout only when the host requests it. */
export function detectInstallMode(entryPath: string, options: InstallModeOptions = {}): InstallMode {
  const paths = process.platform === "win32" ? win32 : posix;
  const entry = realpathSync(entryPath);
  let cliRoot: string | undefined;
  let coreVersion: string | undefined;
  for (const directory of ancestorDirectories(paths.dirname(entry))) {
    const manifest = readManifest(directory);
    if (manifest?.name === "@nodetool-ai/cli") {
      if (!manifest.version) {
        throw new Error(`CLI package has no version: ${directory}`);
      }
      cliRoot = directory;
      coreVersion = manifest.version;
      break;
    }
  }
  if (!cliRoot || !coreVersion) {
    throw new Error(`Cannot find @nodetool-ai/cli package root for ${entry}`);
  }
  const ancestors = ancestorDirectories(cliRoot);
  const yarnPnp = ancestors.some((directory) => [".pnp.cjs", ".pnp.js", ".pnp.loader.mjs"].some((file) => existsSync(paths.join(directory, file))));
  const modules = paths.dirname(paths.dirname(cliRoot));
  const project = readManifest(paths.dirname(modules));
  const projectHasCli = Boolean(project?.dependencies?.["@nodetool-ai/cli"] ?? project?.devDependencies?.["@nodetool-ai/cli"] ?? project?.optionalDependencies?.["@nodetool-ai/cli"]);
  const workspaceRoot = ancestors.find((directory) => readManifest(directory)?.workspaces !== undefined);
  const layout: InstallLayout = {
    cliRoot, coreVersion, pathStyle: process.platform === "win32" ? "win32" : "posix",
    globalNodeModulesRoots: (options.globalNodeModulesRoots ?? defaultGlobalRoots()).map(canonicalGlobalRoot), projectHasCli, yarnPnp,
    bunGlobalRoots: options.bunGlobalRoots ?? [paths.join(process.env["BUN_INSTALL"] ?? paths.join(homedir(), ".bun"), "install", "global")]
  };
  if (workspaceRoot) {
    return classifyInstallLayout({ ...layout, workspaceRoot });
  }
  return classifyInstallLayout(layout);
}

/** The catalog factory supplies the concrete closure when no ids are available yet. */
export function installDetailsForMode(mode: InstallMode, ids: readonly string[] = []): MissingPackInstall {
  if (mode.kind === "global" || mode.kind === "local") {
    return { supported: true, reason: null, command: ids.length ? `nodetool nodes add ${[...new Set(ids)].sort().join(" ")}` : null };
  }
  return { supported: false, reason: mode.reason, command: null };
}
