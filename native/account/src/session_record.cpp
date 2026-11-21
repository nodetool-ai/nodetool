#include "nodetool/account/session_record.h"

#include <algorithm>
#include <nlohmann/json.hpp>

namespace nodetool::account {
namespace {

constexpr int kRecordVersion = 1;

} // namespace

std::string SessionRecord::toJson() const {
  nlohmann::json j = {
      {"version", kRecordVersion},
      {"state", state == SessionState::SignedIn ? "signed_in" : "signed_out"},
      {"generation", generation},
      {"refresh_token", refreshToken},
      {"access_token", accessToken},
      {"access_expires_at_ms", accessExpiresAtMs},
      {"revocation_handle", revocationHandle},
      {"handle_pending", handlePending},
      {"earlier_pending_handles", earlierPendingHandles},
      {"session_id", sessionId},
      {"user_id", userId},
      {"display_name", displayName},
  };
  return j.dump();
}

std::optional<SessionRecord> SessionRecord::fromJson(std::string_view json) {
  const auto j = nlohmann::json::parse(json, nullptr, false);
  if (j.is_discarded() || !j.is_object() || j.value("version", 0) != kRecordVersion) {
    return std::nullopt;
  }
  try {
    SessionRecord r;
    r.state = j.value("state", "") == "signed_in" ? SessionState::SignedIn : SessionState::SignedOut;
    r.generation = j.value("generation", uint64_t{0});
    r.refreshToken = j.value("refresh_token", "");
    r.accessToken = j.value("access_token", "");
    r.accessExpiresAtMs = j.value("access_expires_at_ms", int64_t{0});
    r.revocationHandle = j.value("revocation_handle", "");
    r.handlePending = j.value("handle_pending", false);
    r.earlierPendingHandles = j.value("earlier_pending_handles", std::vector<std::string>{});
    r.sessionId = j.value("session_id", "");
    r.userId = j.value("user_id", "");
    r.displayName = j.value("display_name", "");
    return r;
  } catch (const nlohmann::json::exception&) {
    return std::nullopt;
  }
}

std::vector<std::string> SessionRecord::pendingHandles() const {
  std::vector<std::string> out = earlierPendingHandles;
  if (handlePending && !revocationHandle.empty()) {
    out.push_back(revocationHandle);
  }
  return out;
}

void SessionRecord::forgetHandle(std::string_view handle) {
  std::erase(earlierPendingHandles, std::string(handle));
  if (revocationHandle == handle && handlePending) {
    revocationHandle.clear();
    handlePending = false;
  }
}

SessionRecordRead readSessionRecordResult(SecretStore& store, std::string_view keychainAccount) {
  const SecretReadResult raw = store.readResult(kKeychainService, keychainAccount);
  if (raw.status != SecretReadStatus::Ok) {
    return {raw.status, std::nullopt};
  }
  return {SecretReadStatus::Ok, SessionRecord::fromJson(raw.value)};
}

std::optional<SessionRecord> readSessionRecord(SecretStore& store, std::string_view keychainAccount) {
  return readSessionRecordResult(store, keychainAccount).record;
}

bool writeSessionRecord(SecretStore& store, std::string_view keychainAccount, const SessionRecord& record) {
  return store.write(kKeychainService, keychainAccount, record.toJson());
}

} // namespace nodetool::account
