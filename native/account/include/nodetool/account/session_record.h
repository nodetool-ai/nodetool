// The shared session record: one keychain item per server and user that both
// apps read and write whole, and only while they hold `account.lock`
// (technical design, "Credential storage and the second app").
#pragma once

#include "nodetool/account/storage.h"

#include <cstdint>
#include <optional>
#include <string>
#include <string_view>
#include <vector>

namespace nodetool::account {

// Thread affinity: a plain value. Copy it across threads.
struct SessionRecord {
  SessionState state = SessionState::SignedOut;
  uint64_t generation = 0;
  std::string refreshToken;
  std::string accessToken;
  // Milliseconds since the Unix epoch.
  int64_t accessExpiresAtMs = 0;
  // The handle of the current session, stored from sign-in on. While
  // `handlePending` is true a sign-out has not yet reached the server.
  std::string revocationHandle;
  bool handlePending = false;
  // Handles of earlier sessions whose sign-out has not reached the server.
  // A new sign-in moves the pending handle here, so signing in again before
  // the server answered never loses a session that must still end.
  std::vector<std::string> earlierPendingHandles;
  std::string sessionId;
  std::string userId;
  std::string displayName;

  std::string toJson() const;
  // Nullopt for a value this version cannot read.
  static std::optional<SessionRecord> fromJson(std::string_view json);

  // Every handle whose session must still be ended on the server.
  std::vector<std::string> pendingHandles() const;
  // Drop `handle` from the pending set after the server answered 200.
  void forgetHandle(std::string_view handle);
};

struct SessionRecordRead {
  SecretReadStatus status = SecretReadStatus::NotFound;
  std::optional<SessionRecord> record;
  bool storeFailed() const {
    return status == SecretReadStatus::AccessDenied || status == SecretReadStatus::Error;
  }
};

SessionRecordRead readSessionRecordResult(SecretStore& store, std::string_view keychainAccount);
std::optional<SessionRecord> readSessionRecord(SecretStore& store, std::string_view keychainAccount);
bool writeSessionRecord(SecretStore& store, std::string_view keychainAccount, const SessionRecord& record);

} // namespace nodetool::account
