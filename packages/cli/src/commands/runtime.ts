/**
 * `nodetool runtime list | add | remove | path` — install the heavy
 * third-party libraries the npm package leaves out (llama.cpp, Transformers.js,
 * PDF and Office libraries, …) into the CLI's optional-node root.
 *
 * The specs are `RUNTIME_NPM_PACKAGES` from `@nodetool-ai/protocol`, the same
 * pinned list the desktop Package Manager installs. A feature that needs a
 * missing one fails with a message naming `nodetool runtime add <id>`.
 */
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Command } from "commander";
import { z } from "zod";
import {
  RUNTIME_NPM_PACKAGES,
  RUNTIME_PACKAGE_NAMES,
  isRuntimeNpmPackageId,
  type RuntimeNpmPackageId
} from "@nodetool-ai/protocol";

import { optionalNodeModulesDir, optionalNodeRoot } from "../optional-node-root.js";
import { asJson, printTable } from "./output.js";

const installedManifestSchema = z.object({ version: z.string() });

interface RuntimeRow {
  id: RuntimeNpmPackageId;
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

async function runtimeRows(): Promise<RuntimeRow[]> {
  const ids = Object.keys(RUNTIME_NPM_PACKAGES).filter(isRuntimeNpmPackageId);
  return Promise.all(
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
}

/** Parse the ids a user typed, failing on any id the catalog lacks. */
function parseIds(ids: readonly string[]): RuntimeNpmPackageId[] {
  const unknown = ids.filter((id) => !isRuntimeNpmPackageId(id));
  if (unknown.length > 0) {
    const known = Object.keys(RUNTIME_NPM_PACKAGES).join(", ");
    throw new Error(
      `Unknown runtime package: ${unknown.join(", ")}. Known: ${known}.`
    );
  }
  return ids.filter(isRuntimeNpmPackageId);
}

/** Create the root with a private manifest, so npm installs into it. */
async function ensureRoot(): Promise<string> {
  const root = optionalNodeRoot();
  await mkdir(root, { recursive: true });
  const manifest = join(root, "package.json");
  if (!existsSync(manifest)) {
    await writeFile(
      manifest,
      `${JSON.stringify({ name: "nodetool-optional-node", private: true }, null, 2)}\n`
    );
  }
  return root;
}

/** Run npm in the optional-node root with the terminal attached. */
function runNpm(root: string, args: readonly string[]): Promise<void> {
  const isWindows = process.platform === "win32";
  const command = isWindows ? "npm.cmd" : "npm";
  return new Promise((resolve, reject) => {
    // Every argument is a catalog spec or package name, never user text, so
    // the Windows shell (required to start npm.cmd) sees no untrusted input.
    const child = spawn(
      command,
      [...args, "--prefix", root, "--no-audit", "--no-fund"],
      { stdio: "inherit", shell: isWindows }
    );
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`npm exited with code ${String(code)}`));
      }
    });
  });
}

export function registerRuntimeCommands(program: Command): void {
  const runtime = program
    .command("runtime")
    .description(
      "Install optional libraries (llama.cpp, Transformers.js, PDF, Office, …) on demand"
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
      const parsed = parseIds(ids);
      const specs = parsed.flatMap((id) => RUNTIME_NPM_PACKAGES[id].npmPackages);
      const root = await ensureRoot();
      console.error(`Installing ${parsed.join(", ")} into ${root}`);
      await runNpm(root, ["install", "--save-exact", ...specs]);
      console.error(
        "Installed. Restart a running `nodetool serve` or MCP server to load it."
      );
    });

  runtime
    .command("remove")
    .description("Uninstall one or more runtime packages by id")
    .argument("<ids...>", "Runtime package ids")
    .action(async (ids: string[]) => {
      const parsed = parseIds(ids);
      const names = parsed.flatMap((id) => RUNTIME_NPM_PACKAGES[id].packageNames);
      const root = optionalNodeRoot();
      if (!existsSync(join(root, "package.json"))) {
        console.error("Nothing is installed.");
        return;
      }
      await runNpm(root, ["uninstall", ...names]);
    });

  runtime
    .command("path")
    .description("Print the directory runtime packages install into")
    .action(() => {
      console.log(optionalNodeRoot());
    });
}
