import { KEYED_PROVIDERS } from "./providerStatus.js";

export type EnvGroup = "secrets" | "local" | "server" | "provider";

export interface EnvVariable {
  readonly name: string;
  readonly group: EnvGroup;
  readonly description: string;
  /** Commands or providers that read the variable. */
  readonly usedBy: readonly string[];
  /** A credential: its value is never printed, and `env import` moves it into the secret store. */
  readonly secret: boolean;
}

/** Variables the lean CLI itself reads. Provider credentials follow from the provider table. */
const CORE_VARIABLES: readonly EnvVariable[] = [
  { name: "SECRETS_MASTER_KEY", group: "secrets", secret: true, usedBy: ["secrets set", "env import", "serve", "every run that reads a stored secret"],
    description: "Encrypts the local secret store, at least 32 characters (`openssl rand -base64 32`). Without it, command features read the key from the system keychain, which a headless machine lacks. Keep it: secrets stored with one key cannot be read with another." },
  { name: "NODETOOL_ENV_FILE", group: "local", secret: false, usedBy: ["every command"], description: "An extra env file, loaded before ./.env.local, ./.env, ~/.nodetool/.env and ~/.env." },
  { name: "NODETOOL_USER_ID", group: "local", secret: false, usedBy: ["secrets", "run", "serve"], description: "Local user whose secrets are read and written. Default \"1\", shared with the desktop app." },
  { name: "DB_PATH", group: "local", secret: false, usedBy: ["secrets", "run", "info"], description: "SQLite database that holds the local secret store. Default nodetool.sqlite3 in the NodeTool data directory." },
  { name: "DATABASE_URL", group: "local", secret: true, usedBy: ["secrets", "run"], description: "Database connection string, used instead of DB_PATH when set." },
  { name: "NODETOOL_TEXT_MODEL", group: "local", secret: false, usedBy: ["text", "nodes --example"], description: "Default model for `nodetool text`." },
  { name: "OPENAI_BASE_URL", group: "local", secret: false, usedBy: ["text", "run", "serve"], description: "An OpenAI-compatible endpoint on a public HTTPS host for `nodetool text` and the built-in OpenAI nodes. Loopback, private and .local hosts are refused." },
  { name: "NODETOOL_LOG_LEVEL", group: "local", secret: false, usedBy: ["every command"], description: "Set to debug to log which env files were loaded (names only, never values)." },
  { name: "NODETOOL_API_URL", group: "server", secret: false, usedBy: ["workflows", "jobs", "assets", "secrets (with a token)"], description: "Server URL for server commands. Default http://127.0.0.1:7777." },
  { name: "NODETOOL_API_TOKEN", group: "server", secret: true, usedBy: ["workflows", "jobs", "assets", "secrets (with a token)", "serve"], description: "Bearer token for server commands, and the token `nodetool serve` accepts." },
  { name: "NODETOOL_TOKENS", group: "server", secret: true, usedBy: ["serve"], description: "JSON object mapping bearer tokens to user IDs, for a server with several users." },
  { name: "NODETOOL_DATA_DIR", group: "server", secret: false, usedBy: ["serve"], description: "Data directory of `nodetool serve`. Default ./nodetool-data." },
  { name: "NODETOOL_FEATURES", group: "server", secret: false, usedBy: ["serve"], description: "Pack features `nodetool serve` loads, as feature-id=package,..." },
  { name: "HOST", group: "server", secret: false, usedBy: ["serve"], description: "Listen address of `nodetool serve`. Default 127.0.0.1." },
  { name: "PORT", group: "server", secret: false, usedBy: ["serve"], description: "Listen port of `nodetool serve`. Default 7777." }
];

/** Credential names that hold an address or project id rather than a secret. */
const NON_SECRET_CREDENTIALS = new Set(["AZURE_OPENAI_ENDPOINT", "GOOGLE_CLOUD_PROJECT", "LLAMA_CPP_URL", "VLLM_BASE_URL"]);

function providerVariables(): EnvVariable[] {
  const byName = new Map<string, { providers: string[]; names: string[] }>();
  for (const provider of KEYED_PROVIDERS) {
    for (const credential of provider.credentials) {
      const entry = byName.get(credential) ?? { providers: [], names: [] };
      entry.providers.push(`provider ${provider.id}`);
      entry.names.push(provider.name);
      byName.set(credential, entry);
    }
  }
  return [...byName].map(([name, entry]) => ({
    name, group: "provider" as const, secret: !NON_SECRET_CREDENTIALS.has(name), usedBy: entry.providers,
    description: `${entry.names.join(", ")} credential.`
  }));
}

/** Every variable the lean CLI and its keyed providers read. */
export const ENV_CATALOGUE: readonly EnvVariable[] = [...CORE_VARIABLES, ...providerVariables()];

/** Credentials that belong in the encrypted secret store rather than a file. */
export function isStorableCredential(name: string): boolean {
  const variable = ENV_CATALOGUE.find(entry => entry.name === name);
  return variable?.group === "provider" && variable.secret;
}

/** What the local secret store holds for the current user, by name only. */
export interface SecretStoreState {
  readonly path: string;
  readonly exists: boolean;
  /** Every stored name. */
  readonly names: ReadonlySet<string>;
  /** Stored names that decrypt with the current SECRETS_MASTER_KEY. Empty without one. */
  readonly readable: ReadonlySet<string>;
  readonly masterKey: "set" | "missing" | "too short";
}

export type CredentialStatus = "set" | "locked" | "unreadable" | "unset";

/** `locked`: stored, but no master key to decrypt it. `unreadable`: stored under another master key. */
export function storedCredentialStatus(name: string, store: SecretStoreState): CredentialStatus {
  if (store.readable.has(name)) { return "set"; }
  if (!store.names.has(name)) { return "unset"; }
  return store.masterKey === "set" ? "unreadable" : "locked";
}

/**
 * A missing-credential error that names the variable, where it may live, and
 * the command that sets it. It tells a store with no master key apart from a
 * value stored under another key and from a value that is nowhere.
 */
export function missingCredentialMessage(name: string, store: SecretStoreState): string {
  const status = storedCredentialStatus(name, store);
  const check = "Run `nodetool env check` to see every variable and where it comes from.";
  if (status === "locked") {
    return `${name} is in the local secret store (${store.path}), but SECRETS_MASTER_KEY is ${store.masterKey === "too short" ? "shorter than 32 characters" : "not set"}, so it cannot be decrypted. Set SECRETS_MASTER_KEY in the environment or in ~/.nodetool/.env (the key it was stored with). ${check}`;
  }
  if (status === "unreadable") {
    return `${name} is in the local secret store (${store.path}), but it does not decrypt with the current SECRETS_MASTER_KEY: it was stored under another key. Restore that key, or store the value again with \`printf %s "$VALUE" | nodetool secrets set ${name}\`. ${check}`;
  }
  return `${name} is not set: it is not in the environment, not in a loaded env file (./.env.local, ./.env, ~/.nodetool/.env, ~/.env), and not in the local secret store. Store it with \`printf %s "$VALUE" | nodetool secrets set ${name}\` (needs SECRETS_MASTER_KEY), or add ${name}=... to ./.env or ~/.nodetool/.env. ${check}`;
}

/** The commented template `nodetool env init` writes. Every value is left empty. */
export function envTemplate(): string {
  const lines = [
    "# NodeTool CLI environment.",
    "# Copy this file to .env (project) or ~/.nodetool/.env (every project) and fill in",
    "# only what you use. Keep the copy private: chmod 600, and never commit it.",
    "#",
    "# Load order, highest first: real environment variables, --env-file,",
    "# NODETOOL_ENV_FILE, ./.env.local, ./.env, ~/.nodetool/.env, ~/.env.",
    "# `nodetool env check` shows each variable's source. `nodetool env import .env`",
    "# moves provider keys into the encrypted secret store.",
    ""
  ];
  const headings: Record<EnvGroup, string> = {
    secrets: "Secret store",
    local: "Local commands",
    server: "Server commands and `nodetool serve`",
    provider: "Provider credentials (only what you use)"
  };
  for (const group of ["secrets", "local", "server", "provider"] as const) {
    lines.push(`# ── ${headings[group]} ──`);
    for (const variable of ENV_CATALOGUE.filter(entry => entry.group === group)) {
      if (group !== "provider") { lines.push(`# ${variable.description}`); }
      lines.push(`# ${variable.name}=${group === "provider" ? `    # ${variable.description.replace(/\.$/, "")}` : ""}`);
    }
    lines.push("");
  }
  return lines.join("\n");
}
