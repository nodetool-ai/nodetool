# Native account service

The credential and account library that the node editor and the timeline app
both link (component K4 in
[the native cloud technical design](../../docs/plans/native-cloud-sync/technical-design.md#credential-storage-and-the-second-app)).
It signs in to a NodeTool server through the browser, keeps one session per
server and user that both apps share, renews the access token, and signs out.

The library depends on the C++20 standard library, threads, sockets and
nlohmann_json only. Two interfaces connect it to the rest of the app:

- `SecretStore` is the operating system's credential store.
  `KeychainStore` writes items exactly as keytar does, the keychain library
  the Node backend uses for its master key, so either side can read what
  the other wrote. `MemorySecretStore` serves the tests and the case where
  no store exists.
- `TokenEndpoint` makes the three server calls: the code exchange, the
  refresh and `/oauth/session/end`. The HTTP implementation belongs to the
  request layer (WP1.10).

| Header | What it holds |
|---|---|
| `nodetool/account/account_session.h` | `AccountSession`: the request rule, the refresh under the lock, sign-out, the repair rule. `recordSignIn`, `endSessionRetryDelay` |
| `nodetool/account/sign_in.h` | `SignInFlow`, `LoopbackListener`, PKCE, the authorize URL and the callback check |
| `nodetool/account/session_record.h` | `SessionRecord`, the keychain item both apps read and write whole |
| `nodetool/account/keychain_store.h` | `KeychainStore`, the platform credential store in keytar's format |
| `nodetool/account/storage.h` | `SecretStore`, `MemorySecretStore`, `AccountLock`, the generation file, atomic file writes, the folder layout |
| `nodetool/account/accounts_index.h` | `AccountsIndex`, the `accounts.json` list the Account control reads |
| `nodetool/account/token_endpoint.h` | `TokenEndpoint` and its results |
| `nodetool/account/crypto.h` | SHA-256, base64url, hex, random bytes, the server key |

Everything is in the namespace `nodetool::account`. The CMake target is the
static library `nodetool_account`.

## What is on the computer

| Item | Where | Holds a secret |
|---|---|---|
| Session record | Keychain item, service `ai.nodetool.native`, account `<server origin>#<user id>` | Yes: refresh token, access token, revocation handles |
| `account.lock` | `<data dir>/accounts/<server key>-<user key>/` | No |
| `session.gen` | Same folder. 16 bytes: the generation, the state, the magic `NTG` | No |
| `accounts.json` | `<data dir>/`, written under `accounts.lock` | No |

Both keys in the folder name are the first 16 hex characters of a SHA-256,
of the server origin and of the user id. Every file is written to a
temporary file, flushed and renamed over the old one.

## How the two apps coordinate

Before a request, `credentialForRequest()` reads the 16-byte generation file
and compares it with the generation of the tokens the app holds. When they
match and the access token is valid for more than 60 seconds, the request
goes out with no lock. Otherwise the app takes `account.lock`, runs the repair
rule, and either adopts the record (another app already renewed it) or calls
`/oauth/token`. A refresh that finds the generation file changed after its
call discards the response, so a sign-out in between is never undone.

`signOut()` writes the generation file first and the record second. From the
first write on, neither app attaches the credential. It then tries
`/oauth/session/end` with every pending handle. While the server is
unreachable the handles stay in the record, and `endPendingSessions()` retries
them on the delays of `endSessionRetryDelay`.

The app's file watcher calls `checkGenerationFile()`. On a sign-out by the
other app it calls `onSignedOut` before taking the lock, so the app can abort
its requests and close its sockets at once.

## Choices this library made

- A sign-in writes the record before the generation file. The design lists
  the file first for every write. With the file first, a kill between the two
  writes leaves a session whose revocation handle nothing on the computer
  holds (FC4). With the record first, the repair rule adopts the new session.
  Refresh and sign-out keep the file first.
- The record keeps `earlier_pending_handles`. A sign-in that happens before
  the server confirmed an earlier sign-out would otherwise overwrite the only
  copy of that handle.
- A sign-out that cannot take the lock within its wait proceeds without it,
  as the design says, and checks the generation file once more after its two
  writes. A refresh that passed its own check in the microseconds between the
  sign-out's writes and that check can still store its tokens. The window
  needs a lock holder that is stuck for over 15 seconds and a response that
  arrives inside it.
- The generation file is read with a 16-byte file read on every request.
  WP0.2 may replace this with a shared memory mapping.
- The credential store calls the platform APIs directly instead of
  QtKeychain, so the library needs no Qt. It matches keytar item for item:

  | Platform | API | Item |
  |---|---|---|
  | macOS | Security framework, generic password (`SecItem*`) | `kSecAttrService` = service, `kSecAttrAccount` = account |
  | Windows | Credential Manager, `CRED_TYPE_GENERIC` | target `<service>/<account>`, user name `<account>`, `CRED_PERSIST_ENTERPRISE` |
  | Linux | libsecret, schema `org.freedesktop.Secret.Generic` | attributes `service` and `account`, label `<service>/<account>`, default collection |

  A value longer than 2,560 bytes, the Windows limit, is refused on every
  platform. A session record with three pending handles is under 1 KB.

## Not in this library yet

- The WP0.2 checks that need each platform: whether a second, separately
  signed app reads the macOS item without a prompt, and the Windows and
  macOS builds of `KeychainStore`, which this repository's CI does not
  compile yet.
- The HTTP `TokenEndpoint` and the request layer that calls
  `credentialForRequest()` before each request (WP1.10).
- The file watcher, the Account control and the Qt bindings (WP1.11).
- The managed policy file (WP1.9).

## Build and test

```bash
cmake -S native/account -B native/account/build -G Ninja
cmake --build native/account/build
ctest --test-dir native/account/build --output-on-failure
```

`account_unit_tests` covers the pieces. `account_session_tests` runs TC1,
TC4, TC7 and TC16 to TC18 from the design's phase 1 table against a fake
token server and an in-memory keychain. Two `AccountSession` objects with
their own lock descriptors stand in for the two apps. A kill is a fault hook
that throws at a `FaultPoint`: the lock is released with its file, as the
operating system releases it from a killed process, and nothing after the
point is written. TC5's real process kill, and the behavior of the keychain
across two separately built apps, need the WP0.2 spike on each platform.

`account_keychain_tests` writes, overwrites and removes real items in the
platform store and stores a full session record. It prints `SKIP` and passes
when no store answers, as on a Linux machine without a Secret Service. To run
it on headless Linux, start a session bus and an unlocked keyring:

```bash
dbus-run-session -- sh -c 'echo -n x | gnome-keyring-daemon --unlock --components=secrets >/dev/null && ctest --test-dir native/account/build --output-on-failure'
```

`-DNODETOOL_ACCOUNT_SANITIZE=ON` builds the tests with AddressSanitizer and
UndefinedBehaviorSanitizer, and `-DNODETOOL_ACCOUNT_TSAN=ON` with
ThreadSanitizer. The ThreadSanitizer build leaves libsecret out, because
GLib is not built with it and TSan reports races inside GLib's own worker
threads.
