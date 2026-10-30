/**
 * `nodetool runtime list | add | remove | path` — install the heavy
 * third-party libraries the npm package leaves out (llama.cpp, Transformers.js,
 * PDF and Office libraries, …) into the CLI's optional-node root.
 *
 * The specs are `RUNTIME_NPM_PACKAGES` from `@nodetool-ai/protocol`, the same
 * pinned list the desktop Package Manager installs. A feature that needs a
 * missing one fails with a message naming `nodetool runtime add <id>`.
 *
 * `sd-cpp` is the one binary here: the stable-diffusion.cpp `sd-server`
 * release, unpacked into `runtimeLocations().sdCpp` by the installer the
 * desktop app shares.
 */
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Command } from "commander";
import { z } from "zod";
import {
  installSdCpp,
  runtimeLocations,
  sdCppInstallStatus,
  uninstallSdCpp
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

const installedManifestSchema = z.object({ version: z.string() });

const SD_CPP_ID = "sd-cpp";

interface RuntimeRow {
  id: RuntimeNpmPackageId | typeof SD_CPP_ID;
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
  return runtimeLocations().sdCpp ? [...npmRows, await sdCppRow()] : npmRows;
}

/** Parse the ids a user typed, failing on any id the catalog lacks. */
function parseIds(ids: readonly string[]): { npm: RuntimeNpmPackageId[]; sdCpp: boolean } {
  const unknown = ids.filter((id) => id !== SD_CPP_ID && !isRuntimeNpmPackageId(id));
  if (unknown.length > 0) {
    const known = [...Object.keys(RUNTIME_NPM_PACKAGES), SD_CPP_ID].join(", ");
    throw new Error(
      `Unknown runtime package: ${unknown.join(", ")}. Known: ${known}.`
    );
  }
  return { npm: ids.filter(isRuntimeNpmPackageId), sdCpp: ids.includes(SD_CPP_ID) };
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

export function registerRuntimeCommands(program: Command): void {
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
        asJson({ root: optionalNodeRoot(), packages: rows });
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
    .action(async (ids: string[]) => {
      const { npm: parsed, sdCpp } = parseIds(ids);
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
      const { npm: parsed, sdCpp } = parseIds(ids);
      if (sdCpp) {
        await uninstallSdCpp(sdCppDir());
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

  runtime
    .command("path")
    .description("Print the directory runtime packages install into")
    .action(() => {
      console.log(optionalNodeRoot());
    });
}
