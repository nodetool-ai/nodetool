# @nodetool-ai/security

Secret storage and encryption for [NodeTool](https://nodetool.ai) — master-key management, crypto helpers, and startup security checks.

This package owns encryption at rest for the NodeTool backend. It derives and stores a master key (OS keychain via keytar or environment variable), encrypts and decrypts secrets (including Fernet-compatible payloads), and runs startup checks that verify the security configuration before the server accepts traffic.

## Install

```bash
npm install @nodetool-ai/security
```

## Exported symbols

| Symbol | Kind | Description |
| --- | --- | --- |
| `generateMasterKey` | function | Generate a new random master key |
| `deriveKey` | function | Derive an encryption key from a passphrase |
| `encrypt` / `decrypt` | function | Encrypt and decrypt payloads with the master key |
| `encryptFernet` / `decryptFernet` | function | Fernet-compatible encryption for cross-runtime secrets |
| `isValidMasterKey` | function | Validate a master-key string |
| `getMasterKey` / `initMasterKey` | function | Read or initialize the active master key |
| `setMasterKey` / `setMasterKeyPersistent` / `deleteMasterKey` | function | Set (optionally persist to keychain) or delete the master key |
| `clearMasterKeyCache` | function | Clear the in-memory key cache |
| `isUsingEnvKey` | function | Report whether the env var supplies the key |
| `setKeytarLoader` / `resetKeytarLoader` | function | Override the keytar loader (for tests) |
| `KeychainAccessError` | class | Error thrown when the OS keychain is unreachable |
| `runStartupChecks` | function | Verify security configuration at startup |
| `StartupCheckResult` | type | Result of a startup check |

## Usage

```ts
import { initMasterKey, encrypt, decrypt } from "@nodetool-ai/security";

await initMasterKey();
const sealed = encrypt("sk-secret-value");
const plain = decrypt(sealed);
```

## Links

- [NodeTool](https://nodetool.ai)
- [GitHub](https://github.com/nodetool-ai/nodetool)
