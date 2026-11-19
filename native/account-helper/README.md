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
  session. The record is signed out at once. The server end runs on its own
  thread, so a server that is slow or unreachable never delays a sign-out,
  and it is retried later.
- Every second it reads the generation file and `accounts.json`, so a sign-in
  or sign-out in another app shows within a second.
- It authorizes the desktop app's cloud requests and transfer calls
  (protocol version 2). Before each one it applies the request rule of the
  library, so a sign-out in another app stops the next request at once. On a
  401 it renews the token once, under `account.lock`, and sends again.
  Reading the state never renews a token. Electron's renderer receives the
  account state and the answers, never a token.

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
| `request` | `id`, `method`, `path`, `timeoutMs`. A cloud request of the renderer. |
| `transfer` | `id`, `procedure`, `input`, `localOrigin`. A call of the local server's `cloudTransfer` router. |
| `socketToken` | `id`. An access token for one WebSocket upgrade. |
| `requestCancel` | `id`. Stops a `request`, `transfer` or `socketToken`. |

The helper to Electron main:

| Message | Fields |
|---|---|
| `ready` | `protocol` (2) |
| `state` | `state` (`signedOut`, `signingIn` or `signedIn`), `displayName`, `accountId` (empty unless signed in), `serverOrigin`, `serverEndPending`, `cloudAvailable`, `keychainAvailable`, `message` |
| `openBrowser` | `url` |
| `http` | `id`, `method`, `url`, `headers`, `body`, `timeoutMs`, `requiredOrigin`, and `request` or `transfer` with the id it serves |
| `httpCancel` | `id` |
| `response` | `id`, `status`, `error` (empty, `SIGNED_OUT`, `OFFLINE`, `CANCELLED`, `INVALID` or `BUSY`) |
| `transferResult` | `id`, `status` (`ok`, `signedOut`, `offline`, `refused`, `localUnavailable` or `cancelled`), `reason`, `data` |
| `socketTokenResult` | `id`, `token` or `error` |
| `fatal` | `message` |

The helper has no network stack. Electron main sends each `http` request
with `net.fetch` and answers with `httpResponse`. Main sends a request only
over HTTPS to the canonical server origin, never follows a redirect, and
answers status 0 for a refused, failed or timed-out request. Main opens
`openBrowser` only for `<origin>/oauth/authorize`.

A `request` carries no body and no headers, and its `response` none either.
The helper sends `http` messages for it with the `Authorization` header
only and the `request` field set. Main sends each with the renderer's
method, headers and body, keeps the response's headers and body, and answers
the helper with the status alone. The helper accepts a path that starts with
one `/`, has no dot segment, fragment, space or backslash, and is not under
`/oauth/`. Main applies the list of routes. A 401 renews the token once and
repeats the `http` message, so main keeps the request's body until the
`response`.

A `transfer` goes to `<localOrigin>/trpc/<procedure>`, a loopback `http`
origin, for the procedures of the router only. The helper sets `origin`,
`account_id` and, for the procedures that reach the cloud, `access_token` in
the input, replacing any the renderer named. Its `http` messages carry the
`transfer` field. Main sends them only to the local server it started, with
its local client token. `data` is the procedure's result.

Six threads run these messages, and at most 256 wait. An id that is still
in flight answers `INVALID`.

Command-line arguments: `--server <origin>` and `--data-dir <folder>`. When
stdin closes, the helper cancels a waiting sign-in and exits.

## Build and test

```bash
node electron/scripts/build-account-helper.mjs          # build and stage in electron/account-helper/
node electron/scripts/build-account-helper.mjs --test   # also run ctest and the process tests
```

Linux needs `libsecret-1-dev`. Without a credential store the helper keeps
the sign-in in memory and reports `keychainAvailable: false`. It then shows
only the accounts it holds in that memory. An account another app keeps in
a keychain the helper can't read is left alone.

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
