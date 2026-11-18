# Account helper

`nodetool-account-helper` lets the Electron desktop app share the cloud
sign-in of the node editor and the timeline. It links the native account
library in [`native/account`](../account/) and runs as a child process of
Electron main ([`electron/src/cloudAccount.ts`](../../electron/src/cloudAccount.ts)).
The design is in the [technical design](../../docs/plans/native-cloud-sync/technical-design.md),
section "The Electron desktop app", decision D23.

The sign-in record is guarded by `account.lock`, which the library takes with
`flock` or `LockFileEx`. Node cannot take that lock, so the desktop app runs
the same library in this helper instead of a second implementation.

## What it does

- Signs in with the app name `desktop`, through the browser and a loopback
  redirect, as the native apps do.
- Signs out of all three apps: it ends the shared record and the server
  session. When the server cannot be reached, the record is signed out at
  once and the server end is retried later.
- Every second it reads the generation file and `accounts.json`, so a sign-in
  or sign-out in another app shows within a second.
- It never refreshes a token and never hands one out. Electron's renderer
  receives the account state and nothing else.

The data folder is `NodeTool/native` in the generic data location, as the
native apps use: `$XDG_DATA_HOME` or `~/.local/share` on Linux,
`~/Library/Application Support` on macOS and `%LOCALAPPDATA%` on Windows.

## Protocol

JSON objects, one per line, on stdin and stdout. Lines over 1 MB are dropped.

Electron main to the helper:

| Message | Fields |
|---|---|
| `signIn` | |
| `cancelSignIn` | |
| `signOut` | |
| `reload` | Reads the record again at once. |
| `browserResult` | `opened` |
| `httpResponse` | `id`, `status`, `body` |

The helper to Electron main:

| Message | Fields |
|---|---|
| `ready` | `protocol` (1) |
| `state` | `state` (`signedOut`, `signingIn` or `signedIn`), `displayName`, `serverOrigin`, `serverEndPending`, `cloudAvailable`, `keychainAvailable`, `message` |
| `openBrowser` | `url` |
| `http` | `id`, `method`, `url`, `headers`, `body`, `timeoutMs`, `requiredOrigin` |
| `httpCancel` | `id` |
| `fatal` | `message` |

The helper has no network stack. Electron main sends each `http` request
with `net.fetch` and answers with `httpResponse`. Main sends a request only
over HTTPS to the canonical server origin, never follows a redirect, and
answers status 0 for a refused, failed or timed-out request. Main opens
`openBrowser` only for `<origin>/oauth/authorize`.

Command-line arguments: `--server <origin>` and `--data-dir <folder>`. When
stdin closes, the helper cancels a waiting sign-in and exits.

## Build and test

```bash
node electron/scripts/build-account-helper.mjs          # build and stage in electron/account-helper/
node electron/scripts/build-account-helper.mjs --test   # also run ctest and the process tests
```

Linux needs `libsecret-1-dev`. Without a credential store the helper keeps
the sign-in in memory and reports `keychainAvailable: false`.

The CMake option `NODETOOL_ACCOUNT_HELPER_TESTS` builds the tests and a
separate `nodetool-account-helper-test` binary. Only that binary reads the
test hooks (`NODETOOL_ACCOUNT_HELPER_TEST_STORE`, `_TEST_FAULT`,
`_TEST_TICK_MS`, `_TEST_POLICY`). `NODETOOL_ACCOUNT_HELPER_SANITIZE` and
`NODETOOL_ACCOUNT_HELPER_TSAN` select the sanitizer builds.

- `tests/helper.cpp`: the helper in process against a fake token server.
- `tests/process.test.mjs`: the built test binary as a child process, run
  with `node --test` and `NODETOOL_ACCOUNT_HELPER_TEST_BINARY`. It kills the
  helper in the middle of a sign-out and checks that a restart repairs it.

The `account-helper` workflow builds and tests on Linux, macOS and Windows
when `native/account/` or this folder changes. The release workflow builds
the helper before packaging, and electron-builder ships it as
`resources/account-helper/`.
