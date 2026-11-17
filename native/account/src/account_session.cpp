#include "nodetool/account/account_session.h"

#include "nodetool/account/accounts_index.h"
#include "nodetool/account/origin.h"

#include <algorithm>

namespace nodetool::account {
namespace {

int64_t systemNowMs() {
  return std::chrono::duration_cast<std::chrono::milliseconds>(
             std::chrono::system_clock::now().time_since_epoch())
      .count();
}

// How often a refresh starts again after a sign-out intervened, before it
// gives up as offline. One restart reads the signed-out record and stops, so
// a second only happens when the record changed again meanwhile.
constexpr int kRefreshAttempts = 3;

void signOutRecord(SessionRecord& record, uint64_t generation) {
  record.state = SessionState::SignedOut;
  record.generation = generation;
  record.refreshToken.clear();
  record.accessToken.clear();
  record.accessExpiresAtMs = 0;
  if (!record.revocationHandle.empty()) {
    record.handlePending = true;
  }
}

} // namespace

std::chrono::seconds endSessionRetryDelay(unsigned attempt) {
  constexpr int64_t kFirst = 5;
  constexpr int64_t kLast = 15 * 60;
  int64_t delay = kFirst;
  for (unsigned i = 0; i < attempt && delay < kLast; ++i) {
    delay *= 2;
  }
  return std::chrono::seconds(std::min(delay, kLast));
}

AccountSession::AccountSession(SecretStore& store, TokenEndpoint& endpoint, AccountSessionOptions options)
    : store_(store), endpoint_(endpoint), options_(std::move(options)),
      dir_(account::accountDir(options_.dataDir, options_.serverOrigin, options_.userId)),
      keychainAccount_(keychainAccount(options_.serverOrigin, options_.userId)),
      origin_(canonicalHttpsOrigin(options_.serverOrigin).value_or(std::string())),
      endpointMismatch_(!endpoint.serverOrigin().empty() && endpoint.serverOrigin() != origin_) {}

int64_t AccountSession::now() const { return options_.nowMs ? options_.nowMs() : systemNowMs(); }

void AccountSession::fault(FaultPoint point) const {
  if (options_.fault) {
    options_.fault(point);
  }
}

AccountSession::Held AccountSession::heldFrom(const SessionRecord& record) const {
  Held held;
  held.generation = record.generation;
  held.state = record.state;
  if (record.state == SessionState::SignedIn) {
    held.accessToken = record.accessToken;
    held.accessExpiresAtMs = record.accessExpiresAtMs;
  }
  return held;
}

void AccountSession::adopt(const Held& next) {
  bool signedOutNow = false;
  {
    const std::lock_guard lock(mutex_);
    const bool wasSignedIn = held_ && held_->state == SessionState::SignedIn;
    held_ = next;
    signedOutNow = wasSignedIn && next.state == SessionState::SignedOut;
    if (next.state == SessionState::SignedOut) {
      // No request authorized while signed in may start or go on.
      for (const auto& weak : requests_) {
        if (const auto request = weak.lock()) {
          request->cancel();
        }
      }
      requests_.clear();
    }
  }
  if (signedOutNow && options_.onSignedOut) {
    options_.onSignedOut();
  }
}

uint64_t AccountSession::signOutMarker() const { return readGenerationFile(signOutMarkerPath()).generation; }

bool AccountSession::publishSignOut(SessionRecord record, uint64_t atLeast) {
  const GenerationStamp stamp = readGenerationFile(generationPath());
  const uint64_t next = std::max({stamp.generation, record.generation, signOutMarker(), atLeast}) + 1;
  // The marker first: from this write on, no credential of this generation
  // or lower is used, whatever a refresh in flight writes after it.
  bool saved = writeGenerationFile(signOutMarkerPath(), {next, SessionState::SignedOut});
  saved = writeGenerationFile(generationPath(), {next, SessionState::SignedOut}) && saved;
  fault(FaultPoint::AfterGenerationWrite);
  signOutRecord(record, next);
  const bool recordSaved = writeSessionRecord(store_, keychainAccount_, record);
  if (!recordSaved) {
    // The record still holds the session as signed in, with no handle
    // pending. Keep the handles here so the server end can reach them.
    const std::lock_guard lock(mutex_);
    for (const std::string& handle : record.pendingHandles()) {
      if (std::find(unsavedHandles_.begin(), unsavedHandles_.end(), handle) == unsavedHandles_.end()) {
        unsavedHandles_.push_back(handle);
      }
    }
  }
  Held signedOut;
  signedOut.generation = next;
  adopt(signedOut);
  return saved && recordSaved;
}

void AccountSession::repairLocked() {
  const GenerationStamp stamp = readGenerationFile(generationPath());
  auto record = readSessionRecord(store_, keychainAccount_);
  if (record && record->state == SessionState::SignedIn && record->generation <= signOutMarker()) {
    // A refresh published after a sign-out that did not hold the lock. The
    // sign-out wins.
    publishSignOut(*record, 0);
    return;
  }
  if (!record) {
    // No record: nothing to sign in with. A file that still says signed in
    // is set to signed out so the other app stops too.
    if (stamp.state == SessionState::SignedIn) {
      writeGenerationFile(generationPath(), {stamp.generation + 1, SessionState::SignedOut});
    }
    return;
  }
  if (stamp.generation > record->generation) {
    if (stamp.state == SessionState::SignedOut) {
      // A sign-out stopped between its two writes. Complete it.
      signOutRecord(*record, stamp.generation);
      writeSessionRecord(store_, keychainAccount_, *record);
    } else {
      // A refresh stopped between its two writes. The record still holds
      // the refresh token the server rotated, which the lost-rotation rule
      // accepts once more.
      writeGenerationFile(generationPath(), {record->generation, record->state});
    }
  } else if (stamp.generation < record->generation ||
             (stamp.generation == record->generation && stamp.state != record->state)) {
    // A sign-in stopped between its two writes, or the file was lost.
    writeGenerationFile(generationPath(), {record->generation, record->state});
  }
}

Credential AccountSession::credentialForRequest() {
  if (options_.credentialAllowed && !options_.credentialAllowed()) {
    return {CredentialStatus::SignedOut, {}};
  }
  const GenerationStamp stamp = readGenerationFile(generationPath());
  const uint64_t marker = signOutMarker();
  {
    const std::lock_guard lock(mutex_);
    if (held_ && held_->generation == stamp.generation && held_->state == stamp.state &&
        (held_->state == SessionState::SignedOut || held_->generation > marker)) {
      if (held_->state == SessionState::SignedOut) {
        return {CredentialStatus::SignedOut, {}};
      }
      if (held_->accessExpiresAtMs - now() > kRefreshMarginMs) {
        return {CredentialStatus::Ready, held_->accessToken};
      }
    }
  }
  switch (refresh()) {
  case RefreshOutcome::Adopted:
  case RefreshOutcome::Refreshed: {
    // Compare once more: a sign-out that landed during the refresh changed
    // the file, and the request is then not sent.
    const GenerationStamp after = readGenerationFile(generationPath());
    const uint64_t markerAfter = signOutMarker();
    const std::lock_guard lock(mutex_);
    if (held_ && held_->state == SessionState::SignedIn && held_->generation == after.generation &&
        after.state == SessionState::SignedIn && held_->generation > markerAfter) {
      return {CredentialStatus::Ready, held_->accessToken};
    }
    return {after.state == SessionState::SignedOut ? CredentialStatus::SignedOut : CredentialStatus::Offline,
            {}};
  }
  case RefreshOutcome::SignedOut:
    return {CredentialStatus::SignedOut, {}};
  case RefreshOutcome::Offline:
    break;
  }
  return {CredentialStatus::Offline, {}};
}

Authorization AccountSession::authorizeRequest() {
  const Credential credential = credentialForRequest();
  Authorization out;
  out.status = credential.status;
  if (credential.status != CredentialStatus::Ready) {
    return out;
  }
  const std::lock_guard lock(mutex_);
  // Registered under the same mutex adopt() cancels under: a sign-out this
  // app noticed since the check above refuses the request here, and one it
  // notices later cancels it.
  if (!held_ || held_->state != SessionState::SignedIn || held_->accessToken != credential.accessToken) {
    out.status = CredentialStatus::SignedOut;
    return out;
  }
  std::erase_if(requests_, [](const std::weak_ptr<RequestCancel>& weak) { return weak.expired(); });
  out.accessToken = credential.accessToken;
  out.cancel = std::make_shared<RequestCancel>();
  requests_.push_back(out.cancel);
  return out;
}

RefreshOutcome AccountSession::refresh(std::string_view rejectedAccessToken) {
  if (options_.credentialAllowed && !options_.credentialAllowed()) {
    return RefreshOutcome::SignedOut;
  }
  const std::lock_guard operation(operationMutex_);
  if (endpointMismatch_) {
    // The refresh token never goes to a server the session did not sign in
    // to.
    return RefreshOutcome::Offline;
  }
  for (int attempt = 0; attempt < kRefreshAttempts; ++attempt) {
    // Step 1.
    const auto lock = AccountLock::acquire(lockPath(), options_.lockTimeout);
    if (!lock) {
      return RefreshOutcome::Offline;
    }
    repairLocked();
    // Step 2.
    const GenerationStamp before = readGenerationFile(generationPath());
    auto record = readSessionRecord(store_, keychainAccount_);
    if (!record || record->state == SessionState::SignedOut) {
      Held signedOut;
      signedOut.generation = before.generation;
      adopt(signedOut);
      return RefreshOutcome::SignedOut;
    }
    // Step 3: the other app renewed the token already.
    const bool rejected = !rejectedAccessToken.empty() && record->accessToken == rejectedAccessToken;
    if (!rejected && record->accessExpiresAtMs - now() > kRefreshMarginMs) {
      adopt(heldFrom(*record));
      return RefreshOutcome::Adopted;
    }
    // Step 4.
    const TokenResult result = endpoint_.refresh(record->refreshToken);
    // Step 5: a sign-out intervened. Its tokens are never stored.
    if (readGenerationFile(generationPath()) != before || signOutMarker() > before.generation) {
      continue;
    }
    fault(FaultPoint::BeforeRefreshPublish);
    const uint64_t next = before.generation + 1;
    switch (result.status) {
    case TokenStatus::Ok: {
      // Step 6. A failed write publishes nothing: the repair rule returns
      // the file to the record, whose refresh token the lost-rotation rule
      // accepts once more.
      if (!writeGenerationFile(generationPath(), {next, SessionState::SignedIn})) {
        return RefreshOutcome::Offline;
      }
      fault(FaultPoint::AfterGenerationWrite);
      record->generation = next;
      record->refreshToken = result.tokens.refreshToken;
      record->accessToken = result.tokens.accessToken;
      record->accessExpiresAtMs = now() + result.tokens.expiresInSeconds * 1000;
      if (!writeSessionRecord(store_, keychainAccount_, *record)) {
        return RefreshOutcome::Offline;
      }
      // A sign-out without the lock may have written its marker after step
      // 5, and its stamp and record before ours. It wins.
      if (signOutMarker() >= next) {
        publishSignOut(*record, next);
        return RefreshOutcome::SignedOut;
      }
      adopt(heldFrom(*record));
      return RefreshOutcome::Refreshed;
    }
    case TokenStatus::InvalidGrant:
      // Step 7: the server ended the session.
      publishSignOut(*record, before.generation);
      return RefreshOutcome::SignedOut;
    case TokenStatus::Offline:
    case TokenStatus::Refused:
      return RefreshOutcome::Offline;
    }
  }
  return RefreshOutcome::Offline;
}

ServerEnd AccountSession::signOut() {
  bool saved = false;
  {
    const std::lock_guard operation(operationMutex_);
    // Local 1. Without the lock the sign-out still proceeds: its marker
    // makes a refresh that holds the lock discard or undo its write.
    const auto lock = AccountLock::acquire(lockPath(), options_.lockTimeout);
    const SessionRecord record = readSessionRecord(store_, keychainAccount_).value_or(SessionRecord{});
    // Local 2 to 4: the marker, the file, the record, then this app.
    saved = publishSignOut(record, 0);
  }
  const ServerEnd server = endPendingSessions();
  return saved ? server : ServerEnd::NotSaved;
}

ServerEnd AccountSession::endPendingSessions() {
  const std::lock_guard operation(operationMutex_);
  // A sign-out killed between its two writes leaves the record signed in
  // with its handle unmarked. The repair rule completes it and marks the
  // handle pending, so an app that only retries the server end, and makes
  // no request, still ends that session.
  if (const auto lock = AccountLock::acquire(lockPath(), options_.lockTimeout)) {
    repairLocked();
  }
  std::vector<std::string> handles;
  if (const auto record = readSessionRecord(store_, keychainAccount_)) {
    handles = record->pendingHandles();
  }
  {
    const std::lock_guard lock(mutex_);
    for (const std::string& handle : unsavedHandles_) {
      if (std::find(handles.begin(), handles.end(), handle) == handles.end()) {
        handles.push_back(handle);
      }
    }
  }
  bool allEnded = true;
  for (const std::string& handle : handles) {
    const EndSessionStatus status = endpoint_.endSession(handle);
    if (status == EndSessionStatus::Offline) {
      allEnded = false;
      continue;
    }
    {
      const std::lock_guard lock(mutex_);
      std::erase(unsavedHandles_, handle);
    }
    // Ended or unknown: nothing on the server is left to end. Forget the
    // handle under the lock, re-reading the record another app may have
    // changed. Ended counts only once that is written.
    const auto lock = AccountLock::acquire(lockPath(), options_.lockTimeout);
    if (!lock) {
      allEnded = false;
      continue;
    }
    if (auto current = readSessionRecord(store_, keychainAccount_)) {
      const auto pending = current->pendingHandles();
      if (std::find(pending.begin(), pending.end(), handle) != pending.end()) {
        current->forgetHandle(handle);
        if (!writeSessionRecord(store_, keychainAccount_, *current)) {
          allEnded = false;
        }
      }
    }
  }
  return allEnded ? ServerEnd::Ended : ServerEnd::Pending;
}

bool AccountSession::checkGenerationFile() {
  const GenerationStamp stamp = readGenerationFile(generationPath());
  {
    const std::lock_guard lock(mutex_);
    if (held_ && held_->generation == stamp.generation && held_->state == stamp.state) {
      return false;
    }
  }
  if (stamp.state == SessionState::SignedOut) {
    // Stop at once, before taking the lock: the file alone is enough to
    // refuse the credential.
    Held signedOut;
    signedOut.generation = stamp.generation;
    adopt(signedOut);
    return true;
  }
  refresh();
  return true;
}

AccountSession::Status AccountSession::status() {
  Status out;
  const auto record = readSessionRecord(store_, keychainAccount_);
  if (!record) {
    return out;
  }
  const GenerationStamp stamp = readGenerationFile(generationPath());
  const bool fileSignedOut = (stamp.generation > record->generation && stamp.state == SessionState::SignedOut) ||
                             (record->state == SessionState::SignedIn && record->generation <= signOutMarker());
  out.state = fileSignedOut ? SessionState::SignedOut : record->state;
  out.displayName = record->displayName;
  out.serverEndPending = !record->pendingHandles().empty() || (fileSignedOut && !record->revocationHandle.empty());
  return out;
}

bool recordSignIn(SecretStore& store, const AccountSessionOptions& options, const TokenSet& tokens) {
  const auto dir = accountDir(options.dataDir, options.serverOrigin, tokens.userId);
  const std::string account = keychainAccount(options.serverOrigin, tokens.userId);
  {
    const auto lock = AccountLock::acquire(dir / "account.lock", options.lockTimeout);
    if (!lock) {
      return false;
    }
    const GenerationStamp stamp = readGenerationFile(dir / "session.gen");
    const uint64_t marker = readGenerationFile(dir / "signout.gen").generation;
    const auto earlier = readSessionRecord(store, account);
    // The entry file first: an account whose record exists is always found,
    // even when `accounts.json` cannot be written below.
    if (!writeAccountEntry(dir, {options.serverOrigin, tokens.userId, tokens.displayName})) {
      return false;
    }
    SessionRecord record;
    // Above the sign-out marker, so the new session is not taken for one it
    // signed out.
    record.generation = std::max({stamp.generation, marker, earlier ? earlier->generation : 0}) + 1;
    if (earlier) {
      record.earlierPendingHandles = earlier->pendingHandles();
      if (earlier->state == SessionState::SignedIn && !earlier->revocationHandle.empty()) {
        // A second sign-in replaces a live session: end the earlier one too.
        record.earlierPendingHandles.push_back(earlier->revocationHandle);
      }
    }
    const int64_t now = options.nowMs ? options.nowMs() : systemNowMs();
    record.state = SessionState::SignedIn;
    record.refreshToken = tokens.refreshToken;
    record.accessToken = tokens.accessToken;
    record.accessExpiresAtMs = now + tokens.expiresInSeconds * 1000;
    record.revocationHandle = tokens.revocationHandle;
    record.handlePending = false;
    record.sessionId = tokens.sessionId;
    record.userId = tokens.userId;
    record.displayName = tokens.displayName;
    if (!writeSessionRecord(store, account, record)) {
      return false;
    }
    if (options.fault) {
      options.fault(FaultPoint::AfterRecordWrite);
    }
    if (!writeGenerationFile(dir / "session.gen", {record.generation, SessionState::SignedIn})) {
      return false;
    }
  }
  // Best effort: AccountsIndex::list also reads the entry file written above.
  AccountsIndex index(options.dataDir);
  index.upsert({options.serverOrigin, tokens.userId, tokens.displayName}, options.lockTimeout);
  return true;
}

} // namespace nodetool::account
