#include "nodetool/account/account_session.h"

#include "nodetool/account/accounts_index.h"

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
      keychainAccount_(keychainAccount(options_.serverOrigin, options_.userId)) {}

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
  }
  if (signedOutNow && options_.onSignedOut) {
    options_.onSignedOut();
  }
}

void AccountSession::repairLocked() {
  const GenerationStamp stamp = readGenerationFile(generationPath());
  auto record = readSessionRecord(store_, keychainAccount_);
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
  const GenerationStamp stamp = readGenerationFile(generationPath());
  {
    const std::lock_guard lock(mutex_);
    if (held_ && held_->generation == stamp.generation && held_->state == stamp.state) {
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
    const std::lock_guard lock(mutex_);
    if (held_ && held_->state == SessionState::SignedIn && held_->generation == after.generation &&
        after.state == SessionState::SignedIn) {
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

RefreshOutcome AccountSession::refresh() {
  const std::lock_guard operation(operationMutex_);
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
    if (record->accessExpiresAtMs - now() > kRefreshMarginMs) {
      adopt(heldFrom(*record));
      return RefreshOutcome::Adopted;
    }
    // Step 4.
    const TokenResult result = endpoint_.refresh(record->refreshToken);
    // Step 5: a sign-out intervened. Its tokens are never stored.
    if (readGenerationFile(generationPath()) != before) {
      continue;
    }
    const uint64_t next = before.generation + 1;
    switch (result.status) {
    case TokenStatus::Ok: {
      // Step 6.
      writeGenerationFile(generationPath(), {next, SessionState::SignedIn});
      fault(FaultPoint::AfterGenerationWrite);
      record->generation = next;
      record->refreshToken = result.tokens.refreshToken;
      record->accessToken = result.tokens.accessToken;
      record->accessExpiresAtMs = now() + result.tokens.expiresInSeconds * 1000;
      writeSessionRecord(store_, keychainAccount_, *record);
      adopt(heldFrom(*record));
      return RefreshOutcome::Refreshed;
    }
    case TokenStatus::InvalidGrant: {
      // Step 7: the server ended the session.
      writeGenerationFile(generationPath(), {next, SessionState::SignedOut});
      fault(FaultPoint::AfterGenerationWrite);
      signOutRecord(*record, next);
      writeSessionRecord(store_, keychainAccount_, *record);
      Held signedOut;
      signedOut.generation = next;
      adopt(signedOut);
      return RefreshOutcome::SignedOut;
    }
    case TokenStatus::Offline:
    case TokenStatus::Refused:
      return RefreshOutcome::Offline;
    }
  }
  return RefreshOutcome::Offline;
}

ServerEnd AccountSession::signOut() {
  {
    const std::lock_guard operation(operationMutex_);
    // Local 1. Without the lock the sign-out still proceeds: a refresh that
    // holds it discards its response at its step 5.
    const auto lock = AccountLock::acquire(lockPath(), options_.lockTimeout);
    const GenerationStamp stamp = readGenerationFile(generationPath());
    SessionRecord record = readSessionRecord(store_, keychainAccount_).value_or(SessionRecord{});
    uint64_t next = std::max(stamp.generation, record.generation) + 1;
    // Local 2: from this write on, neither app attaches the credential.
    writeGenerationFile(generationPath(), {next, SessionState::SignedOut});
    fault(FaultPoint::AfterGenerationWrite);
    // Local 3.
    signOutRecord(record, next);
    writeSessionRecord(store_, keychainAccount_, record);
    if (!lock) {
      // Without the lock a writer may have replaced the file between the two
      // writes. Make the sign-out the last word.
      const GenerationStamp after = readGenerationFile(generationPath());
      if (after != GenerationStamp{next, SessionState::SignedOut}) {
        next = std::max(after.generation, next) + 1;
        writeGenerationFile(generationPath(), {next, SessionState::SignedOut});
        signOutRecord(record, next);
        writeSessionRecord(store_, keychainAccount_, record);
      }
    }
    // Local 4.
    Held signedOut;
    signedOut.generation = next;
    adopt(signedOut);
  }
  return endPendingSessions();
}

ServerEnd AccountSession::endPendingSessions() {
  const std::lock_guard operation(operationMutex_);
  const auto record = readSessionRecord(store_, keychainAccount_);
  if (!record) {
    return ServerEnd::Ended;
  }
  bool allEnded = true;
  for (const std::string& handle : record->pendingHandles()) {
    const EndSessionStatus status = endpoint_.endSession(handle);
    if (status == EndSessionStatus::Offline) {
      allEnded = false;
      continue;
    }
    // Ended or unknown: nothing on the server is left to end. Forget the
    // handle under the lock, re-reading the record another app may have
    // changed.
    const auto lock = AccountLock::acquire(lockPath(), options_.lockTimeout);
    if (!lock) {
      allEnded = false;
      continue;
    }
    if (auto current = readSessionRecord(store_, keychainAccount_)) {
      current->forgetHandle(handle);
      writeSessionRecord(store_, keychainAccount_, *current);
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
  const bool fileSignedOut = stamp.generation > record->generation && stamp.state == SessionState::SignedOut;
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
    const auto earlier = readSessionRecord(store, account);
    SessionRecord record;
    record.generation = std::max(stamp.generation, earlier ? earlier->generation : 0) + 1;
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
  AccountsIndex index(options.dataDir);
  index.upsert({options.serverOrigin, tokens.userId, tokens.displayName}, options.lockTimeout);
  return true;
}

} // namespace nodetool::account
