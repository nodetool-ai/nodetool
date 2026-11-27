import { existsSync, readFileSync } from "node:fs";
import { chmod, readFile, stat, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import type { Command } from "commander";
import { parseEnvFile } from "@nodetool-ai/config";
import { ENV_CATALOGUE, envTemplate, isStorableCredential, storedCredentialStatus, type CredentialStatus, type EnvGroup, type SecretStoreState } from "./envCatalogue.js";
import { envFilePermissionWarnings, isGitTracked, type EnvLoadResult } from "./envFiles.js";
import { CREDENTIAL_ALIASES } from "./providerStatus.js";

export interface EnvCommandDeps {
  readonly env: NodeJS.ProcessEnv;
  /** Files applied at startup. Without it every set variable counts as coming from the process environment. */
  envLoad?: EnvLoadResult;
  readonly cwd: string;
  readonly print: (value: unknown) => void;
  readonly output: (value: string) => void;
  readonly secretStoreState: () => Promise<SecretStoreState>;
  /** Encrypt and store each pair in the local secret store. Throws without SECRETS_MASTER_KEY. */
  readonly storeSecrets: (pairs: readonly (readonly [string, string])[]) => Promise<void>;
}

export type VariableSource = "env" | "file" | "secret store" | null;

export interface VariableReport {
  readonly name: string;
  readonly group: EnvGroup;
  readonly secret: boolean;
  readonly status: CredentialStatus;
  readonly source: VariableSource;
  /** The env file that set it, when `source` is "file". */
  readonly file?: string;
  readonly used_by: readonly string[];
}

export interface EnvCheckReport {
  readonly files: readonly {
    readonly path: string; readonly scope: string; readonly exists: boolean;
    readonly applied: readonly string[]; readonly shadowed: readonly string[];
    readonly git_tracked: boolean; readonly warnings: readonly string[];
  }[];
  readonly secret_store: { readonly path: string; readonly exists: boolean; readonly master_key: SecretStoreState["masterKey"]; readonly master_key_source: VariableSource; readonly stored: readonly string[] };
  readonly variables: readonly VariableReport[];
  readonly warnings: readonly string[];
}

/** Build the `env check` report. Reads names, paths and file modes, never values. */
export async function envCheckReport(deps: Pick<EnvCommandDeps, "env" | "envLoad" | "secretStoreState">): Promise<EnvCheckReport> {
  const { env, envLoad } = deps;
  const store = await deps.secretStoreState();
  const sources = envLoad?.sources ?? {};
  const environmentSource = (name: string): { source: VariableSource; file?: string } | null => {
    const present = [name, ...CREDENTIAL_ALIASES[name] ?? []].find(candidate => env[candidate]);
    if (!present) { return null; }
    const file = sources[present];
    return file ? { source: "file", file } : { source: "env" };
  };
  const variables = ENV_CATALOGUE.map((variable): VariableReport => {
    const base = { name: variable.name, group: variable.group, secret: variable.secret, used_by: variable.usedBy };
    const fromEnvironment = environmentSource(variable.name);
    if (fromEnvironment) { return { ...base, status: "set", ...fromEnvironment }; }
    if (variable.group === "provider") {
      const status = storedCredentialStatus(variable.name, store);
      return { ...base, status, source: status === "unset" ? null : "secret store" };
    }
    return { ...base, status: "unset", source: null };
  });
  const files = (envLoad?.files ?? []).map(file => {
    const gitTracked = file.exists && isGitTracked(file.path);
    const warnings = [...file.warnings];
    if (gitTracked) { warnings.push(`${file.path} is tracked by git. Remove it with \`git rm --cached ${file.path}\` and add it to .gitignore.`); }
    return { path: file.path, scope: file.scope, exists: file.exists, applied: file.applied, shadowed: file.shadowed, git_tracked: gitTracked, warnings };
  });
  const warnings = files.flatMap(file => file.warnings);
  if (store.masterKey !== "set" && [...store.names].length > 0) {
    warnings.push(`The secret store holds ${store.names.size} secret(s), but SECRETS_MASTER_KEY is ${store.masterKey === "missing" ? "not set" : "shorter than 32 characters"}. Command features then need the system keychain to read them. On a headless machine, set SECRETS_MASTER_KEY in ~/.nodetool/.env.`);
  }
  const unreadable = variables.filter(variable => variable.status === "unreadable").map(variable => variable.name);
  if (unreadable.length) { warnings.push(`Stored under another SECRETS_MASTER_KEY, so no run can read them: ${unreadable.join(", ")}.`); }
  const masterKey = variables.find(variable => variable.name === "SECRETS_MASTER_KEY");
  return {
    files,
    secret_store: { path: store.path, exists: store.exists, master_key: store.masterKey, master_key_source: masterKey?.source ?? null, stored: [...store.names].sort() },
    variables,
    warnings
  };
}

function gitignoreCoversEnv(directory: string): boolean {
  const file = join(directory, ".gitignore");
  if (!existsSync(file)) { return false; }
  return readFileSync(file, "utf8").split(/\r?\n/).map(line => line.trim()).some(line => [".env", ".env*", "*.env", ".env.*", "/.env"].includes(line));
}

/** Register `nodetool env check|list|init|import`. */
export function registerEnvCommands(program: Command, deps: EnvCommandDeps): void {
  const envCommand = program.command("env").description("Discover, check and set up the environment variables the CLI reads, and the env files it loads");
  envCommand.command("check").description("List every known variable with its status and source (environment, env file or secret store). Never prints values.")
    .option("--json", "Output JSON, for agents")
    .option("--all", "Include provider credentials that are not set (text output; JSON always includes them)")
    .action(async (flags: { json?: boolean; all?: boolean }) => {
      const report = await envCheckReport(deps);
      if (flags.json) { deps.print(report); return; }
      const out = deps.output;
      out("Env files (highest precedence first):\n");
      for (const file of report.files) {
        out(`  ${file.exists ? "loaded " : "absent "} ${file.path}${file.exists ? ` (${file.applied.length} set${file.shadowed.length ? `, ${file.shadowed.length} already set elsewhere` : ""})` : ""}\n`);
      }
      out(`\nSecret store: ${report.secret_store.path}${report.secret_store.exists ? "" : " (not created yet)"}\n`);
      out(`  SECRETS_MASTER_KEY: ${report.secret_store.master_key}${report.secret_store.master_key_source ? ` (${report.secret_store.master_key_source})` : ""}\n`);
      out("\nVariables:\n");
      const shown = report.variables.filter(variable => flags.all || variable.group !== "provider" || variable.status !== "unset");
      const width = Math.max(...shown.map(variable => variable.name.length));
      for (const variable of shown) {
        const where = variable.source === "file" ? `file ${variable.file ?? ""}` : variable.source ?? "";
        out(`  ${variable.name.padEnd(width)}  ${variable.status.padEnd(10)}  ${where}\n`);
      }
      const hidden = report.variables.length - shown.length;
      if (hidden > 0) { out(`  (${hidden} provider credentials not set: \`nodetool env check --all\` lists them)\n`); }
      if (report.warnings.length) {
        out("\nWarnings:\n");
        for (const warning of report.warnings) { out(`  ${warning}\n`); }
      }
    });
  envCommand.command("list").description("List every variable the CLI reads, which commands read it, and whether it is a credential")
    .option("--json", "Output JSON")
    .action((flags: { json?: boolean }) => {
      const entries = ENV_CATALOGUE.map(variable => ({ name: variable.name, group: variable.group, secret: variable.secret, used_by: variable.usedBy, description: variable.description }));
      if (flags.json) { deps.print(entries); return; }
      for (const entry of entries) { deps.output(`${entry.name} [${entry.group}${entry.secret ? ", secret" : ""}]\n  ${entry.description}\n  Used by: ${entry.used_by.join(", ")}\n`); }
    });
  envCommand.command("init [file]").description("Write a commented template of every variable (default ./.env.example), with mode 600 and every value empty")
    .option("--force", "Overwrite an existing file")
    .action(async (file: string | undefined, flags: { force?: boolean }) => {
      const path = resolve(deps.cwd, file ?? ".env.example");
      try {
        await writeFile(path, envTemplate(), { mode: 0o600, flag: flags.force ? "w" : "wx" });
      } catch (error) {
        if (error instanceof Error && "code" in error && error.code === "EEXIST") { throw new Error(`${path} already exists. Pass --force to overwrite it.`); }
        throw error;
      }
      if (process.platform !== "win32") { await chmod(path, 0o600); }
      deps.output(`Wrote ${path}.\nCopy it to .env or ~/.nodetool/.env and fill in only what you use. \`nodetool env check\` confirms what loaded.\n`);
      if (!gitignoreCoversEnv(deps.cwd)) { deps.output(`Add .env and .env.local to ${join(deps.cwd, ".gitignore")} so the filled-in copy is never committed.\n`); }
    });
  envCommand.command("import [file]").description("Move provider credentials from an env file (default ./.env) into the encrypted local secret store. Needs SECRETS_MASTER_KEY.")
    .option("--remove", "Delete the imported lines from the file afterwards")
    .option("--json", "Output JSON")
    .action(async (file: string | undefined, flags: { remove?: boolean; json?: boolean }) => {
      const path = resolve(deps.cwd, file ?? ".env");
      if (!existsSync(path)) { throw new Error(`Env file ${path} does not exist. Name another with \`nodetool env import <file>\`.`); }
      const pairs = Object.entries(parseEnvFile(await readFile(path, "utf8")));
      const importable = pairs.filter(([name, value]) => value !== "" && isStorableCredential(name));
      const skipped = pairs.filter(([name, value]) => !(value !== "" && isStorableCredential(name))).map(([name, value]) => ({
        name, reason: value === "" ? "empty" : name === "SECRETS_MASTER_KEY" ? "the master key stays outside the store it encrypts" : "not a provider credential"
      }));
      if (importable.length) { await deps.storeSecrets(importable); }
      const imported = importable.map(([name]) => name);
      if (flags.remove && imported.length) {
        const mode = (await stat(path)).mode & 0o777;
        const kept = (await readFile(path, "utf8")).split(/(?<=\n)/).filter(line => !Object.keys(parseEnvFile(line)).some(name => imported.includes(name)));
        await writeFile(path, kept.join(""), { mode });
      }
      const store = await deps.secretStoreState();
      const result = { file: path, imported, skipped, secret_store: store.path, removed_from_file: Boolean(flags.remove && imported.length), warnings: envFilePermissionWarnings(path) };
      if (flags.json) { deps.print(result); return; }
      deps.output(`Imported ${imported.length} credential(s) into ${store.path}${imported.length ? `: ${imported.join(", ")}` : ""}.\n`);
      if (imported.length && !flags.remove) { deps.output(`They are still in ${path}. Delete those lines, or run again with --remove.\n`); }
      for (const warning of result.warnings) { deps.output(`${warning}\n`); }
    });
}
