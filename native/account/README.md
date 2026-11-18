# Native account service

The credential and account library that the node editor and the timeline app
both link (component K4 in
[the native cloud technical design](../../docs/plans/native-cloud-sync/technical-design.md#credential-storage-and-the-second-app)).
It signs in to a NodeTool server through the browser, keeps one session per
server and user that both apps share, renews the access token, and signs out.

The library depends on the C++20 standard library, threads, sockets and
nlohmann_json only. Three interfaces connect it to the rest of the app:

- `SecretStore` is the operating system's credential store.
  `KeychainStore` writes items exactly as keytar does, the keychain library
  the Node backend uses for its master key, so either side can read what
  the other wrote. `MemorySecretStore` serves the tests and the case where
  no store exists.
- `HttpTransport` sends one HTTP request. Each app implements it with its
  own network stack (`QNetworkAccessManager` in the Qt apps), so the library
  needs no HTTP or TLS library.
- `TokenEndpoint` makes the three server calls: the code exchange, the
  refresh and `/oauth/session/end`. `HttpTokenEndpoint` makes them over an
  `HttpTransport`.
- `CloudSaver` sends one save of a whole document to the cloud server.
  `WorkflowCloudSaver` and `TimelineCloudSaver` implement it for the two
  kinds phase 1 opens from the cloud.

| Header | What it holds |
|---|---|
| `nodetool/account/account_session.h` | `AccountSession`: the request rule, the refresh under the lock, sign-out, the repair rule. `recordSignIn`, `endSessionRetryDelay` |
| `nodetool/account/sign_in.h` | `SignInFlow`, `LoopbackListener`, PKCE, the authorize URL and the callback check |
| `nodetool/account/session_record.h` | `SessionRecord`, the keychain item both apps read and write whole |
| `nodetool/account/keychain_store.h` | `KeychainStore`, the platform credential store in keytar's format |
| `nodetool/account/storage.h` | `SecretStore`, `MemorySecretStore`, `AccountLock`, the generation file, atomic file writes, the folder layout |
| `nodetool/account/accounts_index.h` | `AccountsIndex`, the `accounts.json` list the Account control reads |
| `nodetool/account/token_endpoint.h` | `TokenEndpoint` and its results |
| `nodetool/account/http_transport.h` | `HttpTransport`, `HttpRequest`, `HttpResponse` |
| `nodetool/account/http_token_endpoint.h` | `HttpTokenEndpoint` and `parseTokenResponse` |
| `nodetool/account/cloud_client.h` | `CloudClient`, the one request layer that attaches the credential (WP1.10) |
| `nodetool/account/cloud_drafts.h` | `CloudDocumentSaver`, the saved-state rule (FR11). `DraftStore` and `LocalServerDraftStore`, the client of the local store |
| `nodetool/account/cloud_savers.h` | `WorkflowCloudSaver` and `TimelineCloudSaver`, the save of each kind, and the schema versions this client writes |
| `nodetool/account/cloud_transfer.h` | `LocalTransferClient`, the client of the bundled server's `cloudTransfer` router for Publish and Synchronize, and `TransferReview`, the rows and choices of the review sheet (WP2.8) |
| `nodetool/account/policy.h` | `ManagedPolicy`, the managed policy file per platform and `checkServer` (WP1.9) |
| `nodetool/account/crypto.h` | SHA-256, base64url, hex, random bytes, the server key |

Everything is in the namespace `nodetool::account`. The CMake target is the
static library `nodetool_account`.

## What is on the computer

| Item | Where | Holds a secret |
|---|---|---|
| Session record | Keychain item, service `ai.nodetool.native`, account `<server origin>#<user id>` | Yes: refresh token, access token, revocation handles |
| `account.lock` | `<data dir>/accounts/<server key>-<user key>/` | No |
| `session.gen` | Same folder. 16 bytes: the generation, the state, the magic `NTG` | No |
| `signout.gen` | Same folder. The generation of the last sign-out, in the `session.gen` format | No |
| `entry.json` | Same folder. The server, user id and display name, written at sign-in | No |
| `accounts.json` | `<data dir>/`, written under `accounts.lock`. `AccountsIndex::list()` adds each `entry.json` it lacks | No |

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
  as the design says. It writes `signout.gen` before `session.gen` and the
  record. No credential at or below that generation is used, so a refresh
  that passed its check before the marker and publishes after it is undone:
  the refresh rechecks the marker after its writes and signs out, and every
  app refuses the credential before then.
- A refresh or sign-out whose keychain write fails says so. The refresh
  returns offline and does not adopt its tokens. The sign-out returns
  `ServerEnd::NotSaved`, the marker still stops the credential, and the app
  keeps the handles in memory so `endPendingSessions()` still ends them.
- `authorizeRequest()` returns the credential with a cancel flag registered
  under the session's mutex. A move to signed out cancels every flag, so a
  request authorized just before a sign-out is stopped.
- A sign-in writes `entry.json` before the record. When `accounts.json`
  cannot be written, the account is still listed. When the record cannot be
  stored, the sign-in flow ends the new session on the server.
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

## The request layer and the saved state

The credential is bound to one origin: the canonical HTTPS form of the
server the session signed in to (`origin.h`, `AccountSession::serverOrigin`).
A session whose server is not HTTPS sends nothing. `HttpTokenEndpoint`
refuses a non-HTTPS origin without sending, and a session refuses to
refresh through an endpoint bound to another origin.

`CloudClient::send()` takes the session's authorization and its cancel flag
in one step, attaches `Authorization: Bearer`, and replaces any header the
caller set. It sends only to a URL whose origin equals the session's, and
sets that origin as the request's `requiredOrigin`, which the transport
checks again at the send. A transport never follows a redirect. On a 401 it
renews the token with `refresh(rejectedToken)`, which calls the server even
when the refused token has not expired, and sends once more with a
different token. A request in flight when the session signs out returns
`Cancelled`. Every request also carries `x-nodetool-protocol` with the
client's protocol version, so a server that needs a newer client refuses its
writes with `CLIENT_TOO_OLD` (WP1.7).

`CloudDocumentSaver` drives one open cloud document. `edit()` takes the
whole in-memory document from any thread. `persist()` and `send()` run on
two worker threads, each at least every 250 ms, so a slow cloud server
never delays a local write:

1. The draft is written to the local store once the edits pause for
   200 ms, and at the latest 500 ms after the first unstored edit, so every
   edit is stored within 750 ms.
2. The stored draft is sent. On acceptance the local store deletes the
   draft row and records the new base in one transaction. Only then does
   the status read Saved to cloud.
3. A failed local write, or a failed record of an acceptance or refusal,
   shows Not saving at once. Not saving stays until the store works,
   whatever the cloud answers. A failed write is retried every 2 seconds. A
   failed record is retried alone, so the server never gets the same draft
   twice.
4. A refused save keeps the draft as unsent edits. Offline and signed-out
   sends are retried every 5 seconds.

`flush()` writes the latest edit at once, without the delay or the retry
wait, for a document that closes. `makeLocalServerDraftStore` returns a
`LocalServerDraftStore` that owns its transport, for an owner that hands the
store on.

Each `CloudDocumentSaver` draws a new editing instance id when the document
opens and sends it with every save (WP1.6). When a save from one instance
replaces a revision another instance wrote, the server keeps the replaced
revision as a version first.

| Kind | Draft | Procedure | Sent with it |
|---|---|---|---|
| workflow | `{"graph": {"nodes": [], "edges": []}, "name": "..."}`, or the graph alone in a draft kept before the name was | `workflows.autosave` | `expected_updated_at`, `editing_instance`, `schema_version`, `force`, and `name` when the draft has a non-empty one |
| timeline | the timeline document, with `fps`, `width` and `height` | `timeline.update` | `baseUpdatedAt`, `editingInstance`, `schemaVersion`, and the three settings as the sequence's columns |

A save the server refuses reports the server's API code, such as
`ALREADY_EXISTS` for a stale base or `SCHEMA_DOWNGRADE`, or `HTTP_<status>`
when the answer names none. A 5xx counts as offline and is sent again. A
draft that is not the kind's JSON is never sent and reads as refused with
`INVALID_DRAFT`.

The local store is the `cloudLocal` tRPC router of the app's bundled
server, over the `cloud_drafts` and `cloud_open_state` tables
(`packages/models/src/cloud-local-store.ts`). Each draft write gets a new
random `draft_id` that is never reused. An acceptance deletes the row only
when it is still the draft that was sent, rebases a newer row only when it
edits the same base, and leaves any other row alone, so a late
acknowledgement never deletes or moves back a newer draft. `DraftStore::load`
and `list` read the rows back, and the second `CloudDocumentSaver`
constructor resumes one after a restart. Rolling the migration back leaves
both tables in place.

## Sharing

`cloud_sharing.h` holds what the share dialog sends and checks (PRD FR21,
FR52, FR67, SR6). A workflow uses `workflows.sharing.*` with its id, and
every other kind uses `documentSharing.*` with its kind and id. Only the
owner may call them.

- `readSharing()` reads the links, enabled ones first, and the people with
  their effective role. `createLink()`, `disableLink()`,
  `setLinkOptions()`, `setPersonRole()` and `removePerson()` change them.
- `shareUrl()` builds the address of the web route that accepts a link.
- `linkStatement()` is the sentence that says what a link gives, including
  that downloaded files and copies cannot be taken back.
- `linkedDocuments()` lists the scripts and storyboards a timeline's clips
  name. A link to the timeline does not open them.
- `findSecretLike()` reports each place, never the value, where a string
  has the shape of a common key or token, or a long value sits under a name
  such as `api_key` or `password`. It is best-effort, and the dialog says so.

## Not in this library yet

- The WP0.2 checks that need each platform: whether a second, separately
  signed app reads the macOS item without a prompt, and the Windows and
  macOS builds of `KeychainStore`, which this repository's CI does not
  compile yet.
- The macOS and Windows readers of the managed policy compile only on those
  platforms, which this repository's CI does not build yet.

## The managed policy

`readManagedPolicy()` reads the administrator's policy from
`/etc/nodetool/policy.json` on Linux, the managed preferences of the domain
`ai.nodetool.native` on macOS (only forced values count), and
`HKEY_LOCAL_MACHINE\SOFTWARE\Policies\NodeTool\Native` on Windows. It
has two keys:

| Key | JSON and macOS | Windows | When absent |
|---|---|---|---|
| `CloudEnabled` | boolean | `REG_DWORD`, 0 or 1 | cloud features on |
| `AllowedServers` | array of origins, at least one | `REG_MULTI_SZ` | any server |

```json
{ "CloudEnabled": true, "AllowedServers": ["https://nodetool.example.com"] }
```

`checkServer()` answers Allowed, CloudOff or ServerNotAllowed, with the
sentence to show. Origins compare after `normalizeOrigin()`, so case, the
default port and a trailing slash do not matter. A policy that exists and
cannot be read turns the cloud features off and names the problem. That
includes a key given twice, an empty `AllowedServers`, and a Linux policy
path that is a broken link or not a regular file.

## The Qt layer

`qt/` builds `nodetool_account_qt` when `NODETOOL_ACCOUNT_QT` is on. It
needs Qt Core and Network.

- `QtHttpTransport` implements `HttpTransport` with a
  `QNetworkAccessManager` per call. It blocks, so it runs on a worker
  thread. It never follows a redirect, because a redirect would take the
  credential to another URL. The request's timeout is a deadline on the
  whole request, its cancel flag aborts it in flight, and a request bound
  to an origin goes nowhere else. Status 0 means no complete response,
  including a body cut short after the headers.
- `AccountController` is the QObject the Account control binds to. Its
  properties are the state (signed out, signing in, signed in), the display
  name, whether a server end is pending, whether the policy allows cloud
  features, the sentence to show and the last error. `signIn()` checks the
  managed policy, emits `browserRequested(url)` for the app to open, and
  waits for the browser on its own thread. `signOut()` runs the sign-out
  and retries the server end with `endSessionRetryDelay`. A
  `QFileSystemWatcher` on the generation file and the data folder shows a
  sign-in or sign-out from the other app, and a check every 2 seconds reads
  the policy and the records again, so a missed watch event or an account
  the other app switched to still shows. `cancelSignIn()` ends the attempt
  at any point, and a session minted after it is signed out at once.
- `session()` returns the session for the request layer. The reference
  keeps the store, endpoint and transport it uses alive after the
  controller is gone. It is null while the managed policy holds the server
  back, and a session handed out earlier then gets no credential and
  renews none. Sign-out and a pending server end still run.
  `readSession()` reads the signed-in session at once on the calling
  thread, for a window that opens a cloud document before the controller's
  own read finishes. It may block on the keychain.

- `AccountServers` lists the servers one app can sign in to: the default,
  every server in `accounts.json`, and any address added with
  `addServer()`, which accepts HTTPS origins only and reads an address
  without a scheme as HTTPS. It keeps one `AccountController` per server,
  so switching never drops another account's session or its drafts. The
  app stores the current server (`cloud/server` in its settings) and passes
  it back at start.
- `CloudBrowser` fills the Cloud and Shared with me groups for one kind
  from `listOwnDocuments` and `listSharedDocuments`
  (`cloud_listing.h`), as two list models. It empties both when the
  account signs out or changes, and keeps the last lists when the server
  is offline. A view of the lists calls `requestOpen()`, and the app opens
  the document on `openRequested()`.
- `CloudDocument` holds one open cloud document. It reads the document
  with the kind's saver, opens a draft the local store kept over the
  revision, ticks `CloudDocumentSaver` every 250 ms, with the local writes
  and the sends on two task threads so a slow send never holds an edit in
  memory, and
  shows the synchronization status: Saved to cloud, Sending, changes
  waiting with a count, Offline with the last connection, Cloud status
  unknown, Not saving, Unsent edits and signed out. A viewer's document
  and one whose access was removed are read-only, and so is one whose
  kept draft could not be read, so no new draft replaces it.
  `writeLocally()` writes the last edit before the tab closes and says
  when it could not, so the app asks before closing. The destructor writes
  it once more. `content()`
  returns the document as the tab last showed it.
- `ShareController` reads and changes the sharing of one document on its
  task thread, and gives QML the viewer and editor links with their
  statements, the people, the linked documents with whether each has a link
  of its own, and the secret warnings. QML creates it.
- `TransferController` runs Publish to Cloud and Synchronize through the
  app's own server on its task thread. It captures the send, and for a
  linked project the receive, and gives QML the review rows. Synchronize
  receives first with the person's choices, captures the send again when
  the receive replaced a document, and answers the one refusal of each
  document kept local with the cloud revision the sheet showed. QML
  creates it.
- `ServerToken.h` is the one place the apps attach their own server's
  token, local or self-hosted, to a request. `attachServerToken()` sets
  `Authorization: Bearer` only when the token is not empty and the request
  goes to that server's origin, where a socket URL (`ws`, `wss`) counts as
  its HTTP origin. Qt copies the headers to every redirect it follows, so a
  request with the token follows redirects inside its origin only, unless
  it reads redirects itself. A request to any other host, such as a provider's media
  URL, carries no token. The node editor and the timeline send their
  server requests through it. Native chat builds without the account
  service, so `ChatClient` keeps the same rule in a helper of its own. A
  cloud document's requests go through `CloudClient`, and the local draft
  store's client, which talks to the local server alone, takes the token in
  its headers. The header needs only Qt Network, so the timeline's server
  client links its interface target `nodetool_account_server_token` alone.

`qt/qml/` holds the QML both apps compile: `AccountControl.qml`, with the
server menu and the Sign in to another server dialog, `CloudDocumentsPanel.qml`,
`CloudSyncStatus.qml`, `SharePanel.qml` and `ShareDialog.qml`, which shows
the panel in a dialog, and `TransferPanel.qml`, the review sheet of Publish
and Synchronize. The node editor compiles the transfer panel. Neither app
opens it from a menu yet. The node editor shows the panel in its own overlay
window from Workflow > Share or the header's Share button, and the timeline
shows the dialog from Share in the document bar. Both show Share only on a
cloud document the account owns.

The controller runs the keychain, lock and server calls on one task
thread. Results come back through an inbox guarded by a mutex, and a
queued call by name drains it on the UI thread. No data crosses threads
through captures in Qt's event queue, so ThreadSanitizer sees every
hand-off.

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

`account_cloud_tests` covers `HttpTokenEndpoint` against canned responses,
`CloudClient` against the fake token server, `LocalServerDraftStore`
against a fake bundled server, and `CloudDocumentSaver`, including TC9 (the
disk fills while editing) and edits made during a send, and the two
savers against a fake cloud server.

`account_policy_tests` covers the JSON policy, the origin rule and TC91's
policy half.

`account_qt_tests` builds with the Qt layer. It runs `QtHttpTransport`
against a local HTTP server, and two `AccountController` objects on one
data folder and one keychain against the fake token server: a sign-in in
one shows in the other within 5 seconds without a browser (TC1's second
app), a sign-out in one signs the other out, a declined or cancelled
sign-in, a policy that refuses the server (TC91) or holds back a restored
session, a session that outlives its controller, and the transport's
deadline, cancel, origin and truncated-body cases.

```bash
cmake -S native/account -B native/account/build-qt -G Ninja \
  -DNODETOOL_ACCOUNT_QT=ON -DCMAKE_PREFIX_PATH=<qt prefix>
cmake --build native/account/build-qt
ctest --test-dir native/account/build-qt --output-on-failure
```

When Qt comes from conda, add `-DPKG_CONFIG_USE_CMAKE_PREFIX_PATH=OFF`, or
pkg-config picks up the conda GLib for libsecret. Qt is uninstrumented, so
the ThreadSanitizer build reads `qt/tests/tsan.supp`, which suppresses
reports inside Qt, GLib, OpenSSL and QtTest only. A race in this library
still reports. With the mutex on `SignInFlow`'s listener removed, the TSan
run reports the race between `cancel()` and the end of `finish()`.

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
