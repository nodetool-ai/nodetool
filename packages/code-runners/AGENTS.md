# code-runners — Secure Code Execution

**Navigation**: [packages/AGENTS.md](../AGENTS.md) → **code-runners**

> Read [packages/AGENTS.md](../AGENTS.md) and [DEVELOPMENT_STANDARDS §16 Security](../../docs/DEVELOPMENT_STANDARDS.md#16-security) first. This package runs untrusted code in Docker/subprocess sandboxes — correctness here is a security boundary.

## Resource lifecycle (containers, child processes, sockets)

- **Register every external handle on the shared base field the moment it's
  created, and null it in `finally`.** `ServerDockerRunner` overrode `stream()`
  to create its own container but never set `_activeContainerId`, so the inherited
  `stop()` couldn't kill it — it leaked until timeout. Keep lifecycle fields
  `protected` (not `private`) so subclasses that own creation can clean up.
- **Honor the stop/cancel flag inside *every* polling and streaming loop**
  (`if (this._stopped) break`) — readiness waits and log pumps included.
- **Distinguish a timeout-kill from a genuine non-zero exit, and check both
  `exitCode` and `signalCode`** (a signal kill leaves `exitCode === null`).
  Surface captured child output when readiness fails — never throw a bare
  "did not become ready".

## Stream decoding

- **Never `buffer.toString("utf-8")` on a streamed/chunked byte slice** — a
  multibyte UTF-8 character split across a frame boundary decodes to `U+FFFD`. Use
  a per-stream `new StringDecoder("utf8")` (separate for stdout/stderr),
  accumulate via `decoder.write(payload)`, and flush `decoder.end()` on close.

## Filesystem / archive safety

- **Zip Slip: validate entry names against the destination prefix *before*
  extracting anything** (`unzip -Z1` to list, reject escapes), then after
  extraction walk with `lstatSync` (does **not** follow symlinks) and remove any
  symlink whose `realpathSync` target escapes `destDir`. A post-hoc `statSync`
  walk follows symlinks and misses the attack.
- **Pass absolute, pre-created host paths to Docker bind mounts** (via
  `getWorkspaceHostPath`) — Docker rejects relative, non-existent bind sources.

## Caching & defaults

- **Derive a cache key from every input that changes the artifact** (URL, version,
  args) — `binaryCacheName` hashes the URL into the filename. Keying on a constant
  label (`"server"`) made different `binaryUrl`s reuse the first cached binary.
- **Apply option defaults as `{ ...options, image: options?.image ?? DEFAULT }`** —
  spread first, default last. Spreading `...options` after the default lets an
  explicit `image: undefined` clobber the computed language default.
