# security — Secret Storage & Encryption

**Navigation**: [packages/AGENTS.md](../AGENTS.md) → **security**

> Read [packages/AGENTS.md](../AGENTS.md) and [DEVELOPMENT_STANDARDS §16 Security](../../docs/DEVELOPMENT_STANDARDS.md#16-security) first. Bugs here silently orphan or corrupt user secrets, so every change needs a test that pins the exact behavior.

## Cross-runtime crypto correctness

- **Keep base64 padding on tokens consumed cross-runtime.** `encryptFernet`
  stripped `=` padding, but Python's `cryptography.Fernet` uses
  `base64.urlsafe_b64decode`, which rejects unpadded input → `InvalidToken`. Only
  translate the alphabet (`+`→`-`, `/`→`_`); keep the padding.
- **A TS-only round-trip test is not a cross-runtime compatibility test.** Assert
  the exact wire format the other runtime expects (`token.length % 4 === 0`, no
  `+`/`/`), not just that TS can decode what TS encoded.

## Master-key resolution

- **A failure from a configured key source is fatal — never fall back to
  generating a new key.** Silently falling through to keychain key-generation
  makes every previously-encrypted secret undecryptable. Don't swallow errors in
  the layer the precedence logic depends on.
- **Single-flight lazy init.** Guard generate-and-persist initialization
  (`initMasterKey`) with an in-flight promise so concurrent first-run callers share
  one key instead of each generating a different one and racing to persist.
- **Health/startup checks must use the same full async resolution path as
  production reads** (`await initMasterKey()`), never a partial sync getter
  (`getMasterKey()` sees only env + cache) — otherwise the check disagrees with
  real behavior and reports false failures for keychain/AWS-resident keys.
