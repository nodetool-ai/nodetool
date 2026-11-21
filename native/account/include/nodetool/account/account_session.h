// One app's view of the session for one server and user: the request rule,
// the refresh under the lock, sign-out, and the repair rule (technical
// design, "Credential storage and the second app" and "Sign-out").
//
// Both apps on a computer create an AccountSession for the same server and
// user. They share the keychain item and the files in the account folder,
// and coordinate only through them.
#pragma once

#include "nodetool/account/http_transport.h"
#include "nodetool/account/session_record.h"
#include "nodetool/account/storage.h"
#include "nodetool/account/token_endpoint.h"

#include <atomic>
#include <chrono>
#include <cstdint>
#include <filesystem>
#include <functional>
#include <memory>
#include <mutex>
#include <optional>
#include <string>
#include <vector>

namespace nodetool::account {

// Points where a process kill matters, so tests can stop a process there.
// A hook that throws leaves the files as a kill would: the lock is released
// with its file, and nothing after the point is written.
enum class FaultPoint {
  // A refresh or a sign-out wrote the generation file and has not written
  // the session record.
  AfterGenerationWrite,
  // A sign-in wrote the session record and has not written the generation
  // file.
  AfterRecordWrite,
  // A refresh got new tokens, found the generation file unchanged, and has
  // not written anything yet.
  BeforeRefreshPublish,
};

struct AccountSessionOptions {
  std::filesystem::path dataDir;
  std::string serverOrigin;
  std::string userId;
  // Milliseconds since the Unix epoch. Defaults to the system clock.
  std::function<int64_t()> nowMs;
  // How long a refresh and a sign-out wait for `account.lock`.
  std::chrono::milliseconds lockTimeout{15000};
  // Test hook. Called at each FaultPoint.
  std::function<void(FaultPoint)> fault;
  // Called once each time this app moves from signed in to signed out: its
  // own sign-out, the other app's, or a refusal of the session. Called on
  // the thread that noticed, with no lock held. The app aborts its cloud
  // requests and closes its sockets here, posting to its UI thread.
  std::function<void()> onSignedOut;
  // Whether this session may use its credential now, such as the managed
  // policy's answer for the server. When it returns false, a request gets
  // no credential and a refresh sends nothing, both answering as signed
  // out, and the record is left as it is. Sign-out and ending pending
  // sessions on the server still run. Unset allows. Called on the thread
  // of the request or refresh, with no lock held.
  std::function<bool()> credentialAllowed;
};

// The access token is renewed when it expires within this margin.
inline constexpr int64_t kRefreshMarginMs = 60'000;

enum class CredentialStatus {
  // Attach `accessToken` to the request.
  Ready,
  // The session is signed out. The request is not sent.
  SignedOut,
  // The token could not be renewed now: the lock timed out, or the server
  // was unreachable. The request fails as offline and the next one tries
  // again.
  Offline,
};

struct Credential {
  CredentialStatus status = CredentialStatus::Offline;
  std::string accessToken;
};

enum class RefreshOutcome {
  // Another app had already renewed the token. No server call was made.
  Adopted,
  Refreshed,
  SignedOut,
  Offline,
};

enum class ServerEnd {
  // Every pending session ended with a 200 (or a 404 for a handle the server
  // does not know). The app shows "Signed out".
  Ended,
  // A handle is still pending. The app shows "Signed out, session not yet
  // ended on the server" and retries.
  Pending,
  // The sign-out could not be written on this computer: this app stopped
  // using the credential, but the other app may not have, and the handle
  // is kept in this app's memory only. The app says so and retries.
  NotSaved,
};

// The credential for one request, and the flag that ends it. A request that
// holds it is registered with the session until the flag is released.
struct Authorization {
  CredentialStatus status = CredentialStatus::Offline;
  std::string accessToken;
  std::shared_ptr<RequestCancel> cancel;
};

// The delay before the n-th retry (0-based) of ending a session on the
// server: 5 seconds doubling up to 15 minutes.
std::chrono::seconds endSessionRetryDelay(unsigned attempt);

// Thread affinity: thread-safe. `mutex_` guards the tokens this app holds.
// `operationMutex_` lets one refresh, sign-out or server end run at a time
// in this process. A refresh calls the TokenEndpoint with `operationMutex_`
// held and `mutex_` released. A server end calls it with neither held, so a
// sign-out never waits on it.
//
// Ownership: the session borrows the store and the endpoint, which must
// outlive it. It owns its options and their callbacks, and destroys them
// with itself.
class AccountSession {
public:
  AccountSession(SecretStore& store, TokenEndpoint& endpoint, AccountSessionOptions options);
  AccountSession(const AccountSession&) = delete;
  AccountSession& operator=(const AccountSession&) = delete;

  // The request rule. Call before every request that carries the
  // credential: it compares the generation file with the generation of the
  // tokens this app holds, adopts the record when they differ, and renews
  // the access token when it expires within kRefreshMarginMs.
  Credential credentialForRequest();

  // The request rule, and the request registered in the same step: when the
  // status is Ready, `cancel` is set at the moment this app moves to signed
  // out, by its own sign-out or by noticing the other app's. The request
  // layer starts the request only while `cancel` is unset and aborts it when
  // it turns true. Keep the returned `cancel` for the life of the request.
  Authorization authorizeRequest();

  // The refresh algorithm, steps 1 to 7.
  //
  // `rejectedAccessToken` is a token the server just refused. The record's
  // token is adopted without a server call only when it differs, so a
  // revoked token is never reused because it has not expired.
  RefreshOutcome refresh(std::string_view rejectedAccessToken = {});

  // The local sign-out steps, which always complete, then one attempt to end
  // every pending session on the server.
  ServerEnd signOut();

  // The local sign-out steps alone. Returns false when they could not be
  // written (ServerEnd::NotSaved). The caller ends the server sessions with
  // endPendingSessions(), such as on another thread.
  bool signOutLocally();

  // One attempt to end every pending session on the server. Call at each
  // connectivity change and at app start, spaced by endSessionRetryDelay.
  ServerEnd endPendingSessions();

  // Re-read the generation file, for the app's file watcher. When it changed,
  // adopt the record as the request rule would. Returns true when it changed.
  bool checkGenerationFile();

  // The display state, read from the record and cached against `session.gen`
  // and `signout.gen` so idle polling does not re-read the OS keychain.
  struct Status {
    SessionState state = SessionState::SignedOut;
    std::string displayName;
    bool serverEndPending = false;
    // True when the credential store refused access or failed on this read.
    // Cached until the generation files change or invalidateStatusCache() runs.
    bool storeAccessDenied = false;
  };
  Status status();
  // Drops any cached status (including a recorded store denial) so the next
  // status() call reads the credential store again.
  void invalidateStatusCache();

  std::filesystem::path accountDir() const { return dir_; }
  // The canonical HTTPS form of the server origin the session signed in
  // to (see origin.h), or empty when that origin is not HTTPS. The request
  // layer sends the credential only to this origin.
  const std::string& serverOrigin() const { return origin_; }
  // The account this session signs in as.
  const std::string& accountId() const { return options_.userId; }
  std::filesystem::path generationPath() const { return dir_ / "session.gen"; }
  std::filesystem::path lockPath() const { return dir_ / "account.lock"; }
  // The durable sign-out marker: the generation of the last sign-out. A
  // credential of that generation or lower is never used, whatever a
  // refresh wrote after it.
  std::filesystem::path signOutMarkerPath() const { return dir_ / "signout.gen"; }
  std::string keychainAccountName() const { return keychainAccount_; }

private:
  struct Held {
    uint64_t generation = 0;
    SessionState state = SessionState::SignedOut;
    std::string accessToken;
    int64_t accessExpiresAtMs = 0;
  };

  int64_t now() const;
  void fault(FaultPoint point) const;
  // Run the repair rule and return the record read from the store. Call with
  // `account.lock` held.
  SessionRecordRead repairLocked();
  uint64_t signOutMarker() const;
  // Write the signed-out stamp and record at a generation above every
  // earlier one, and adopt it. Returns false when a write failed.
  bool publishSignOut(SessionRecord record, uint64_t atLeast);
  // Hold the record's tokens. Calls onSignedOut when that moves this app
  // from signed in to signed out.
  void adopt(const Held& next);
  Held heldFrom(const SessionRecord& record) const;

  struct CachedStatus {
    GenerationStamp stamp;
    uint64_t marker = 0;
    Status status;
  };

  SecretStore& store_;
  TokenEndpoint& endpoint_;
  const AccountSessionOptions options_;
  const std::filesystem::path dir_;
  const std::string keychainAccount_;
  const std::string origin_;
  // The token endpoint is bound to another origin than the session.
  const bool endpointMismatch_;

  std::mutex operationMutex_;
  // Guards held_, cachedStatus_, requests_ and unsavedHandles_.
  std::mutex mutex_;
  std::optional<Held> held_;
  std::optional<CachedStatus> cachedStatus_;
  // The requests authorized while signed in. Cancelled and cleared when this
  // app moves to signed out.
  std::vector<std::weak_ptr<RequestCancel>> requests_;
  // Handles of a sign-out whose record write failed, so the server end can
  // still reach them.
  std::vector<std::string> unsavedHandles_;
};

// Store a completed sign-in: the account's entry file, the record with the
// new tokens and the handle, then the generation file, all under
// `account.lock`, then the entry in `accounts.json`. A handle that was still
// pending in the earlier record is kept, so its session can still be ended.
// Returns false when the lock or a write failed. A failed `accounts.json`
// write fails nothing: AccountsIndex::list reads the entry files too.
//
// The record is written before the generation file here, unlike a refresh
// or a sign-out: a kill between the two then leaves a record the repair rule
// adopts, never a session whose handle nothing on the computer holds (FC4).
bool recordSignIn(SecretStore& store, const AccountSessionOptions& options, const TokenSet& tokens);

} // namespace nodetool::account
