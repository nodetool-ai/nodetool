/**
 * `nodetool runtime list | add | remove | path` — install the heavy
 * third-party libraries the npm package leaves out (llama.cpp, Transformers.js,
 * PDF and Office libraries, …) into the CLI's optional-node root.
 *
 * The specs are `RUNTIME_NPM_PACKAGES` from `@nodetool-ai/protocol`, the same
 * pinned list the desktop Package Manager installs. A feature that needs a
 * missing one fails with a message naming `nodetool runtime add <id>`.
 *
 * `sd-cpp` is the stable-diffusion.cpp `sd-server` release, unpacked into
 * `runtimeLocations().sdCpp` by the installer the desktop app shares.
 * `acestep` is the acestep.cpp `ace-server` archive NodeTool builds, unpacked
 * into `runtimeLocations().aceStep`. It installs for macOS on Apple silicon.
 * `wan2gp` is the Wan2GP source and the Python environment its own installer
 * builds in `runtimeLocations().wan2gp`, with a Python 3.10+ and uv from the
 * NodeTool conda environment or PATH.
 *
 * The conda packages (`python`, `yt-dlp`, `rust`), the uv tools (`manimgx`)
 * and `runtime python-packs` go through `@nodetool-ai/runtime-install`, the
 * installer the desktop app uses, into the shared conda environment.
 */
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { delimiter, join } from "node:path";
import type { Command } from "commander";
import { z } from "zod";
import {
  WAN2GP_VERSION,
  aceStepInstallStatus,
  installAceStep,
  installSdCpp,
  installWan2GP,
  runtimeLocations,
  sdCppInstallStatus,
  uninstallAceStep,
  uninstallSdCpp,
  uninstallWan2GP,
  wan2gpInstallStatus
} from "@nodetool-ai/config";
import {
  RUNTIME_NPM_PACKAGES,
  RUNTIME_PACKAGE_NAMES,
  isRuntimeNpmPackageId,
  type RuntimeNpmPackageId
} from "@nodetool-ai/protocol";

import { optionalNodeModulesDir, optionalNodeRoot } from "@nodetool-ai/cli-common/optional-node-root";
import { asJson, printTable } from "@nodetool-ai/cli-common/commands/output";
import { runNpm } from "@nodetool-ai/pack-manager/npm-runner";
import { withInstallLock } from "@nodetool-ai/pack-manager/install-lock";
import type { RuntimePackageId } from "@nodetool-ai/protocol/missing-runtime-package";

import {
  addManagedRuntimes,
  cliRuntimeRegistry,
  isManagedRuntimeId,
  managedRuntimeIds,
  removeManagedRuntimes
} from "./runtime-managed.js";
import { registerPythonPackCommands, type PythonPackOperations } from "./runtime-python-packs.js";

const installedManifestSchema = z.object({ version: z.string() });

const SD_CPP_ID = "sd-cpp";
const WAN2GP_ID = "wan2gp";
const ACESTEP_ID = "acestep";

interface RuntimeRow {
  id: RuntimePackageId;
  name: string;
  installed: boolean;
  version: string;
  description: string;
}

/** The version installed in the optional-node root, or null. */
async function installedVersion(packageName: string): Promise<string | null> {
  const manifest = join(optionalNodeModulesDir(), packageName, "package.json");
  if (!existsSync(manifest)) {
    return null;
  }
  try {
    const parsed = installedManifestSchema.safeParse(
      JSON.parse(await readFile(manifest, "utf8"))
    );
    return parsed.success ? parsed.data.version : null;
  } catch {
    // An unreadable manifest is a broken install; report it as missing.
    return null;
  }
}

function sdCppDir(): string {
  const dir = runtimeLocations().sdCpp;
  if (!dir) {
    throw new Error("This host has no sd-server install directory. Set SD_CPP_SERVER_PATH instead.");
  }
  return dir;
}

async function sdCppRow(): Promise<RuntimeRow> {
  const status = await sdCppInstallStatus(sdCppDir(), process.platform);
  return {
    id: SD_CPP_ID,
    name: RUNTIME_PACKAGE_NAMES[SD_CPP_ID],
    installed: status.installed,
    version: status.version ?? "",
    description: "Local image generation server (sd-server) for the stable-diffusion.cpp provider."
  };
}

function aceStepDir(): string {
  const dir = runtimeLocations().aceStep;
  if (!dir) {
    throw new Error("This host has no ace-server install directory. Set ACESTEP_SERVER_PATH instead.");
  }
  return dir;
}

async function aceStepRow(): Promise<RuntimeRow> {
  const status = await aceStepInstallStatus(aceStepDir());
  return {
    id: ACESTEP_ID,
    name: RUNTIME_PACKAGE_NAMES[ACESTEP_ID],
    installed: status.installed,
    version: status.version ?? "",
    description: "Local music generation server (ace-server) for the ACE-Step provider and music mode."
  };
}

function wan2gpDir(): string {
  const dir = runtimeLocations().wan2gp;
  if (!dir) {
    throw new Error("This host has no Wan2GP install directory. Set WAN2GP_MCP_URL to a Wan2GP server instead.");
  }
  return dir;
}

async function wan2gpRow(): Promise<RuntimeRow> {
  const status = await wan2gpInstallStatus(wan2gpDir(), process.platform);
  return {
    id: WAN2GP_ID,
    name: RUNTIME_PACKAGE_NAMES[WAN2GP_ID],
    installed: status.installed,
    version: status.version ?? "",
    description: `Local video, image and audio generation server for the Wan2GP provider and nodes (${WAN2GP_VERSION}).`
  };
}

/** The first of `names` in the NodeTool conda environment, then on PATH. */
function findExecutable(names: readonly string[]): string | null {
  const windows = process.platform === "win32";
  const dirs: string[] = [];
  const conda = runtimeLocations().condaEnv;
  if (conda) {
    dirs.push(windows ? conda : join(conda, "bin"));
    if (windows) dirs.push(join(conda, "Library", "bin"), join(conda, "Scripts"));
  }
  dirs.push(...(process.env.PATH ?? "").split(delimiter).filter(Boolean));
  for (const dir of dirs) {
    for (const name of names) {
      const candidate = join(dir, windows ? `${name}.exe` : name);
      if (existsSync(candidate)) return candidate;
    }
  }
  return null;
}

async function addWan2GP(options: { python?: string; uv?: string; profile?: string }): Promise<void> {
  const python = options.python ?? findExecutable(["python3", "python"]);
  const uv = options.uv ?? findExecutable(["uv"]);
  if (!python || !uv) {
    throw new Error(
      "Installing Wan2GP needs a Python 3.10+ and uv (https://docs.astral.sh/uv/). Put them on PATH, or pass --python and --uv."
    );
  }
  const installDir = wan2gpDir();
  console.error(`Installing Wan2GP ${WAN2GP_VERSION} into ${installDir}`);
  await installWan2GP({
    installDir,
    platform: process.platform,
    python,
    uv,
    ...(options.profile && { profile: options.profile }),
    onEvent: (event) => {
      if (event.type === "stage") {
        console.error(event.label);
      }
    }
  });
}

async function runtimeRows(): Promise<RuntimeRow[]> {
  const ids = Object.keys(RUNTIME_NPM_PACKAGES).filter(isRuntimeNpmPackageId);
  const npmRows = await Promise.all(
    ids.map(async (id) => {
      const spec = RUNTIME_NPM_PACKAGES[id];
      const versions = await Promise.all(spec.packageNames.map(installedVersion));
      const installed = versions.every((version) => version !== null);
      return {
        id,
        name: RUNTIME_PACKAGE_NAMES[id],
        installed,
        version: installed ? (versions[0] ?? "") : "",
        description: spec.description
      };
    })
  );
  const registry = cliRuntimeRegistry();
  const managedRows = await Promise.all(
    managedRuntimeIds().map(async (id) => {
      const status = await registry.status(id);
      const pkg = registry.get(id);
      return {
        id,
        name: pkg?.name ?? id,
        installed: status.installed,
        version: status.installedVersion ?? "",
        description: pkg?.description ?? ""
      };
    })
  );
  const rows: RuntimeRow[] = [...managedRows, ...npmRows];
  if (runtimeLocations().sdCpp) rows.push(await sdCppRow());
  if (runtimeLocations().aceStep) rows.push(await aceStepRow());
  if (runtimeLocations().wan2gp) rows.push(await wan2gpRow());
  return rows;
}

/** Parse the ids a user typed, failing on any id the catalog lacks. */
function parseIds(ids: readonly string[]): {
  managed: RuntimePackageId[];
  npm: RuntimeNpmPackageId[];
  sdCpp: boolean;
  aceStep: boolean;
  wan2gp: boolean;
} {
  const unknown = ids.filter(
    (id) => id !== SD_CPP_ID && id !== WAN2GP_ID && id !== ACESTEP_ID && !isRuntimeNpmPackageId(id) && !isManagedRuntimeId(id)
  );
  if (unknown.length > 0) {
    const known = [...managedRuntimeIds(), ...Object.keys(RUNTIME_NPM_PACKAGES), SD_CPP_ID, WAN2GP_ID, ACESTEP_ID].join(", ");
    throw new Error(
      `Unknown runtime package: ${unknown.join(", ")}. Known: ${known}.`
    );
  }
  return {
    managed: ids.filter(isManagedRuntimeId),
    npm: ids.filter(isRuntimeNpmPackageId),
    sdCpp: ids.includes(SD_CPP_ID),
    aceStep: ids.includes(ACESTEP_ID),
    wan2gp: ids.includes(WAN2GP_ID)
  };
}

/** Create the root with a private manifest, so npm installs into it. */
async function ensureRoot(): Promise<string> {
  const root = optionalNodeRoot();
  await mkdir(root, { recursive: true });
  const manifest = join(root, "package.json");
  if (!existsSync(manifest)) {
    await writeFile(
      manifest,
      `${JSON.stringify({ name: "nodetool-optional-node", private: true, type: "module" }, null, 2)}\n`
    );
  }
  return root;
}

export function registerRuntimeCommands(
  program: Command,
  options: { pythonPacks?: PythonPackOperations } = {}
): void {
  const runtime = program
    .command("runtime")
    .description(
      "Install runtime libraries by id. Node packs use `nodetool packs add`."
    );

  runtime
    .command("list")
    .description("List optional runtime packages and whether each is installed")
    .option("--json", "Print JSON")
    .action(async (options: { json?: boolean }) => {
      const rows = await runtimeRows();
      if (options.json) {
        asJson({ root: optionalNodeRoot(), condaEnv: runtimeLocations().condaEnv, packages: rows });
        return;
      }
      printTable(
        rows.map((row) => ({ ...row, installed: row.installed ? "yes" : "no" })),
        ["id", "name", "installed", "version", "description"]
      );
    });

  runtime
    .command("add")
    .description("Install one or more runtime packages by id")
    .argument("<ids...>", "Runtime package ids, from `nodetool runtime list`")
    .option("--python <path>", "wan2gp: the Python 3.10+ that runs Wan2GP's installer")
    .option("--uv <path>", "wan2gp: the uv executable Wan2GP's installer uses")
    .option("--profile <name>", "wan2gp: a Wan2GP hardware profile, such as RTX_40, instead of the detected one")
    .option("--reinstall", "python, yt-dlp, rust, manimgx: install again when already installed")
    .action(async (ids: string[], options: { python?: string; uv?: string; profile?: string; reinstall?: boolean }) => {
      const { managed, npm: parsed, sdCpp, aceStep, wan2gp } = parseIds(ids);
      if (managed.length > 0) {
        await addManagedRuntimes(managed, options.reinstall === true);
      }
      if (wan2gp) {
        await addWan2GP(options);
      }
      if (sdCpp) {
        const installDir = sdCppDir();
        console.error(`Installing sd-cpp into ${installDir}`);
        await installSdCpp({
          installDir,
          platform: process.platform,
          arch: process.arch,
          onEvent: (event) => {
            if (event.type === "stage") {
              console.error(event.label);
            }
          }
        });
      }
      if (aceStep) {
        const installDir = aceStepDir();
        console.error(`Installing acestep into ${installDir}`);
        await installAceStep({
          installDir,
          platform: process.platform,
          arch: process.arch,
          onEvent: (event) => {
            if (event.type === "stage") {
              console.error(event.label);
            }
          }
        });
      }
      if (parsed.length === 0) {
        return;
      }
      const specs = parsed.flatMap((id) => RUNTIME_NPM_PACKAGES[id].npmPackages);
      const root = optionalNodeRoot();
      console.error(`Installing ${parsed.join(", ")} into ${root}`);
      await withInstallLock(root, ".nodetool-runtime.lock", async () => {
        await ensureRoot();
        // Preserve existing runtime install scripts until verified rebuild allowlists land.
        await runNpm(root, ["install", ...specs], { mode: "local", scriptPolicy: "user", onWarning: (warning) => console.error(warning) });
      }, { onWait: (path) => console.error(`Waiting for the install lock at ${path}`) });
      console.error(
        "Installed. Run the command again."
      );
    });

  runtime
    .command("remove")
    .description("Uninstall one or more runtime packages by id")
    .argument("<ids...>", "Runtime package ids")
    .action(async (ids: string[]) => {
      const { managed, npm: parsed, sdCpp, aceStep, wan2gp } = parseIds(ids);
      if (managed.length > 0) {
        await removeManagedRuntimes(managed);
      }
      if (sdCpp) {
        await uninstallSdCpp(sdCppDir());
      }
      if (aceStep) {
        await uninstallAceStep(aceStepDir());
      }
      if (wan2gp) {
        await uninstallWan2GP(wan2gpDir());
      }
      if (parsed.length === 0) {
        return;
      }
      const names = parsed.flatMap((id) => RUNTIME_NPM_PACKAGES[id].packageNames);
      const root = optionalNodeRoot();
      if (!existsSync(join(root, "package.json"))) {
        console.error("Nothing is installed.");
        return;
      }
      await withInstallLock(root, ".nodetool-runtime.lock", () =>
        runNpm(root, ["uninstall", ...names], { mode: "local", scriptPolicy: "user", onWarning: (warning) => console.error(warning) }),
        { onWait: (path) => console.error(`Waiting for the install lock at ${path}`) }
      );
    });

  registerPythonPackCommands(runtime, options.pythonPacks);

  runtime
    .command("path")
    .description("Print the directory runtime packages install into")
    .action(() => {
      console.log(optionalNodeRoot());
    });
}
