/**
 * ClaudeCodeCredentialsStore — reads and writes the credential file the Claude
 * Agent SDK authenticates from.
 *
 * The SDK spawns the bundled `claude` binary, which loads its subscription
 * credentials from `$CLAUDE_CONFIG_DIR/.credentials.json` (defaulting to
 * `~/.claude/.credentials.json`) under a `claudeAiOauth` key. Writing that exact
 * shape is the whole point of this module: a NodeTool login and a `claude login`
 * produce interchangeable credentials, and {@link ClaudeAgentProvider} needs no
 * token plumbing of its own.
 *
 * The file is not NodeTool's — other keys are preserved on write, and the mode
 * is forced to 0600 to match what the CLI does.
 */

import {
  chmod,
  mkdir,
  readFile,
  rename,
  unlink,
  writeFile
} from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { createLogger, type Logger } from "@nodetool-ai/config";
import type { ClaudeCodeTokens } from "./claude-code-oauth-client.js";
import { isObjectLike, isString } from "@nodetool-ai/protocol";

/** The `claudeAiOauth` entry, field-for-field as the CLI writes it. */
export interface ClaudeAiOAuthCredentials {
  accessToken: string;
  refreshToken: string | null;
  /** Absolute expiry, epoch ms. */
  expiresAt: number | null;
  scopes: string[];
  subscriptionType: string | null;
  rateLimitTier: string | null;
  /** Only set when a non-default OAuth client minted the token. */
  clientId?: string;
}

/** The subset of the credential file this module understands. */
interface CredentialsFile {
  claudeAiOauth?: ClaudeAiOAuthCredentials;
  [key: string]: unknown;
}

/** Owner-only file mode, matching the CLI. */
const FILE_MODE = 0o600;

interface ClaudeCodeCredentialsStoreOptions {
  /** Override the config directory. Defaults to `$CLAUDE_CONFIG_DIR` or `~/.claude`. */
  readonly configDir?: string;
  readonly logger?: Logger;
}

/**
 * The directory the `claude` CLI keeps its state in. `CLAUDE_CONFIG_DIR` is the
 * CLI's own override — honouring it keeps NodeTool pointed at the same profile
 * the user's terminal sessions use.
 */
export function claudeConfigDir(): string {
  const override = process.env.CLAUDE_CONFIG_DIR;
  return override && override.length > 0
    ? override
    : join(homedir(), ".claude");
}

export class ClaudeCodeCredentialsStore {
  private readonly configDir: string;
  private readonly logger: Logger;

  constructor(options: ClaudeCodeCredentialsStoreOptions = {}) {
    this.configDir = options.configDir ?? claudeConfigDir();
    this.logger =
      options.logger ??
      createLogger("nodetool.runtime.oauth.claude-credentials");
  }

  /** Absolute path of the credential file. */
  get path(): string {
    return join(this.configDir, ".credentials.json");
  }

  /** The stored OAuth credentials, or null when there is no usable login. */
  async read(): Promise<ClaudeAiOAuthCredentials | null> {
    const file = await this.readFile();
    const oauth = file?.claudeAiOauth;
    return oauth && isString(oauth.accessToken) ? oauth : null;
  }

  /**
   * Merge a fresh token set into the file, preserving any keys the CLI owns
   * (and any profile metadata a previous login recorded).
   */
  async save(params: {
    tokens: ClaudeCodeTokens;
    subscriptionType?: string | null;
    rateLimitTier?: string | null;
    /** Set only for a non-default OAuth client. */
    clientId?: string;
  }): Promise<ClaudeAiOAuthCredentials> {
    const file = (await this.readFile()) ?? {};
    const previous = file.claudeAiOauth;
    const credentials: ClaudeAiOAuthCredentials = {
      accessToken: params.tokens.accessToken,
      refreshToken:
        params.tokens.refreshToken ?? previous?.refreshToken ?? null,
      expiresAt: params.tokens.expiresAt,
      scopes: [...params.tokens.scopes],
      subscriptionType:
        params.subscriptionType ?? previous?.subscriptionType ?? null,
      rateLimitTier: params.rateLimitTier ?? previous?.rateLimitTier ?? null
    };
    if (params.clientId) credentials.clientId = params.clientId;

    await this.writeFile({ ...file, claudeAiOauth: credentials });
    return credentials;
  }

  /**
   * Drop the OAuth entry. Other keys survive; the file itself is removed once
   * nothing is left in it.
   */
  async clear(): Promise<boolean> {
    const file = await this.readFile();
    if (!file?.claudeAiOauth) return false;
    const { claudeAiOauth: _removed, ...rest } = file;
    if (Object.keys(rest).length === 0) {
      await unlink(this.path).catch(() => {});
    } else {
      await this.writeFile(rest);
    }
    return true;
  }

  private async readFile(): Promise<CredentialsFile | null> {
    let raw: string;
    try {
      raw = await readFile(this.path, "utf8");
    } catch {
      return null;
    }
    try {
      const parsed: unknown = JSON.parse(raw);
      return isObjectLike(parsed) ? (parsed as CredentialsFile) : null;
    } catch {
      this.logger.warn("Claude credential file is not valid JSON", {
        path: this.path
      });
      return null;
    }
  }

  /**
   * Write via a temp file in the same directory, so a concurrent `claude`
   * process never observes a half-written credential file.
   */
  private async writeFile(contents: CredentialsFile): Promise<void> {
    await mkdir(this.configDir, { recursive: true });
    const tmp = `${this.path}.${process.pid}.tmp`;
    await writeFile(tmp, `${JSON.stringify(contents, null, 2)}\n`, {
      encoding: "utf8",
      mode: FILE_MODE
    });
    try {
      await rename(tmp, this.path);
    } catch (err) {
      await unlink(tmp).catch(() => {});
      throw err;
    }
    await chmod(this.path, FILE_MODE);
  }
}

/** True when `expiresAt` has passed (or comes within `skewMs`). */
export function isExpired(
  credentials: Pick<ClaudeAiOAuthCredentials, "expiresAt">,
  now: number,
  skewMs = 60_000
): boolean {
  return credentials.expiresAt != null && credentials.expiresAt - skewMs <= now;
}
