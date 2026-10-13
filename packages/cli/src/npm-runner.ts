import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join, delimiter } from "node:path";

export type NpmInstallMode = "global" | "local";

/** Override npm configuration that could change the verified install shape. */
export function npmInstallFlags(
  mode: NpmInstallMode,
  scriptPolicy: "ignore" | "user" = "ignore"
): string[] {
  return [
    ...(scriptPolicy === "ignore" ? ["--ignore-scripts"] : []), "--omit=dev", "--include=prod", "--include=optional",
    "--strict-peer-deps", "--legacy-peer-deps=false", "--install-strategy=hoisted",
    "--prefer-dedupe", "--package-lock=true", "--global=false", "--workspaces=false",
    "--force=false", "--dry-run=false", "--no-audit", "--no-fund", "--update-notifier=false",
    ...(mode === "global" ? ["--no-save"] : ["--save", "--save-exact", "--save-prod"])
  ];
}

export function assertInstallerModuleIdentity(
  execArgv: readonly string[] = process.execArgv,
  nodeOptions: string = process.env["NODE_OPTIONS"] ?? ""
): void {
  const flags = [...execArgv, nodeOptions].join(" ");
  if (/(?:^|[\s"'])--preserve-symlinks(?:-main)?(?:$|[\s="'])/.test(flags)) {
    throw new Error("Remove --preserve-symlinks and --preserve-symlinks-main before installing NodeTool packages.");
  }
}

/** Returns a warning for untested future npm releases. */
export function checkNpmVersion(version: string): string | null {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version.trim());
  const major = Number(match?.[1]);
  const minor = Number(match?.[2]);
  if (!match || major < 10 || (major === 10 && minor < 9)) {
    throw new Error(`npm ${version.trim()} is unsupported. NodeTool requires npm 10.9.0 or later. Upgrade with npm install -g npm@11.`);
  }
  return major >= 12 ? `npm ${version.trim()} has not been tested with the NodeTool installer.` : null;
}

export function findNpmCli(
  executable: string = process.execPath,
  platform: NodeJS.Platform = process.platform,
  path: string = process.env["PATH"] ?? ""
): string | null {
  const besideNode = platform === "win32"
    ? join(dirname(executable), "node_modules", "npm", "bin", "npm-cli.js")
    : join(dirname(executable), "..", "lib", "node_modules", "npm", "bin", "npm-cli.js");
  if (existsSync(besideNode)) {
    return besideNode;
  }
  // Windows command shims are never executed through a shell. Resolve their JS entry.
  for (const dir of path.split(delimiter)) {
    const entry = join(dir, "node_modules", "npm", "bin", "npm-cli.js");
    if (existsSync(entry)) {
      return entry;
    }
  }
  return null;
}

function npmCall(cli: string | null, args: readonly string[], root: string,
  capture: boolean, signal?: AbortSignal): Promise<string> {
  if (!cli && process.platform === "win32") {
    throw new Error("Cannot locate npm-cli.js. Install Node.js with npm and run the command again.");
  }
  return new Promise((resolve, reject) => {
    const child = spawn(cli ? process.execPath : "npm", cli ? [cli, ...args] : [...args], {
      cwd: root, shell: false, stdio: capture ? ["ignore", "pipe", "pipe"] : "inherit", signal
    });
    let output = "";
    let errors = "";
    child.stdout?.on("data", (chunk: Buffer) => { output += chunk.toString(); });
    child.stderr?.on("data", (chunk: Buffer) => { errors += chunk.toString(); });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve(output);
      } else {
        reject(new Error(`npm exited with code ${String(code)}${errors ? `: ${errors.trim()}` : ""}`));
      }
    });
  });
}

export async function runNpm(
  root: string,
  args: readonly string[],
  options: { readonly mode: NpmInstallMode; readonly scriptPolicy?: "ignore" | "user"; readonly signal?: AbortSignal; readonly onWarning?: (warning: string) => void }
): Promise<void> {
  assertInstallerModuleIdentity();
  const cli = findNpmCli();
  const warning = checkNpmVersion(await npmCall(cli, ["--version"], root, true, options.signal));
  if (warning) {
    options.onWarning?.(warning);
  }
  await npmCall(cli, [...args, ...npmInstallFlags(options.mode, options.scriptPolicy)], root, false, options.signal);
}

/** Installer commands retain forced policy while returning machine-readable output. */
export async function runInstallerNpm(
  root: string, args: readonly string[],
  options: { readonly mode: NpmInstallMode; readonly dryRun?: boolean; readonly rebuild?: boolean; readonly signal?: AbortSignal; readonly onWarning?: (warning: string) => void }
): Promise<string> {
  assertInstallerModuleIdentity();
  const cli = findNpmCli();
  const warning = checkNpmVersion(await npmCall(cli, ["--version"], root, true, options.signal));
  if (warning) { (options.onWarning ?? ((value: string) => process.stderr.write(value + "\n")))(warning); }
  const flags = npmInstallFlags(options.mode).filter((flag) => flag !== "--dry-run=false" &&
    (!options.rebuild || flag !== "--ignore-scripts"));
  return npmCall(cli, [...args, ...flags, `--dry-run=${String(options.dryRun ?? false)}`,
    ...(options.rebuild ? ["--ignore-scripts=false", "--foreground-scripts"] : [])], root, true, options.signal);
}

export async function installerNpmVersion(root: string, signal?: AbortSignal, onWarning?: (warning: string) => void): Promise<string> {
  assertInstallerModuleIdentity();
  const version = (await npmCall(findNpmCli(), ["--version"], root, true, signal)).trim();
  const warning = checkNpmVersion(version);
  if (warning) { (onWarning ?? ((value: string) => process.stderr.write(value + "\n")))(warning); }
  return version;
}
