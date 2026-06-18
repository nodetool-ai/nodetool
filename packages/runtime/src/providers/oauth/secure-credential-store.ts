/**
 * SecureCredentialStore — the lowest storage layer.
 *
 * A minimal named-secret key/value abstraction. It knows nothing about OAuth,
 * tokens, or providers; it only persists opaque strings under string keys.
 * Higher layers (`TokenStore`) compose it. This separation is what lets the
 * token logic be unit-tested against an in-memory backend while production
 * persists into the OS credential store.
 */

import { importHidden } from "@nodetool-ai/config";
import type { Logger } from "@nodetool-ai/config";

/** Persist opaque secret strings. All operations are async. */
export interface SecureCredentialStore {
  /** Return the stored value for `key`, or null if absent. */
  get(key: string): Promise<string | null>;
  /** Create or overwrite the value for `key`. */
  set(key: string, value: string): Promise<void>;
  /** Remove `key`. Resolves whether or not it existed. */
  delete(key: string): Promise<void>;
}

/**
 * The subset of the `keytar` native module we depend on. Declared locally so we
 * neither hard-depend on the package at build time nor pull its prebuilt binary
 * into bundles that never authenticate.
 */
export interface KeyringBackend {
  getPassword(service: string, account: string): Promise<string | null>;
  setPassword(service: string, account: string, password: string): Promise<void>;
  deletePassword(service: string, account: string): Promise<boolean>;
}

export interface KeychainCredentialStoreOptions {
  /** Keychain service namespace. */
  readonly service?: string;
  /** Inject a backend (tests / custom keyrings). Defaults to lazy `keytar`. */
  readonly backend?: KeyringBackend;
  readonly logger?: Logger;
}

/**
 * SecureCredentialStore backed by the operating-system credential store
 * (macOS Keychain, Windows Credential Manager, Linux Secret Service) via
 * `keytar`. The OS layer provides at-rest encryption, satisfying the
 * "refresh tokens encrypted by the OS credential store" requirement. The
 * native module is loaded lazily so importing this file never forces the
 * binary to resolve.
 */
export class KeychainSecureCredentialStore implements SecureCredentialStore {
  private readonly service: string;
  private readonly injectedBackend?: KeyringBackend;
  private readonly logger?: Logger;
  private backendPromise?: Promise<KeyringBackend>;

  constructor(options: KeychainCredentialStoreOptions = {}) {
    this.service = options.service ?? "nodetool-oauth";
    this.injectedBackend = options.backend;
    this.logger = options.logger;
  }

  private async backend(): Promise<KeyringBackend> {
    if (this.injectedBackend) return this.injectedBackend;
    this.backendPromise ??= (async () => {
      const mod = await importHidden<KeyringBackend | { default: KeyringBackend }>("keytar");
      if (!mod) {
        throw new Error(
          "Secure credential storage requires the 'keytar' native module, which is unavailable in this runtime"
        );
      }
      return (mod as { default?: KeyringBackend }).default ?? (mod as KeyringBackend);
    })();
    return this.backendPromise;
  }

  async get(key: string): Promise<string | null> {
    const backend = await this.backend();
    return backend.getPassword(this.service, key);
  }

  async set(key: string, value: string): Promise<void> {
    const backend = await this.backend();
    await backend.setPassword(this.service, key, value);
    // Note: `key` is an account label, never a secret; `value` is never logged.
    this.logger?.debug("Stored credential in OS keychain", { service: this.service, key });
  }

  async delete(key: string): Promise<void> {
    const backend = await this.backend();
    await backend.deletePassword(this.service, key);
    this.logger?.debug("Deleted credential from OS keychain", { service: this.service, key });
  }
}

/**
 * In-memory SecureCredentialStore for tests and ephemeral sessions. Holds
 * secrets only for the lifetime of the instance — never touches disk.
 */
export class InMemorySecureCredentialStore implements SecureCredentialStore {
  private readonly map = new Map<string, string>();

  async get(key: string): Promise<string | null> {
    return this.map.has(key) ? (this.map.get(key) as string) : null;
  }

  async set(key: string, value: string): Promise<void> {
    this.map.set(key, value);
  }

  async delete(key: string): Promise<void> {
    this.map.delete(key);
  }
}
