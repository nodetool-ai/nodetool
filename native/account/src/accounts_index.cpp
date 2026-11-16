#include "nodetool/account/accounts_index.h"

#include "nodetool/account/storage.h"

#include <algorithm>
#include <nlohmann/json.hpp>

namespace nodetool::account {

std::vector<AccountEntry> AccountsIndex::list() const {
  const auto raw = readWholeFile(path());
  if (!raw) {
    return {};
  }
  const auto j = nlohmann::json::parse(*raw, nullptr, false);
  std::vector<AccountEntry> out;
  if (j.is_discarded() || !j.is_object() || !j.contains("accounts") || !j["accounts"].is_array()) {
    return out;
  }
  for (const auto& item : j["accounts"]) {
    if (!item.is_object()) {
      continue;
    }
    AccountEntry entry{item.value("server", ""), item.value("user_id", ""), item.value("display_name", "")};
    if (!entry.serverOrigin.empty() && !entry.userId.empty()) {
      out.push_back(std::move(entry));
    }
  }
  return out;
}

bool AccountsIndex::write(const std::vector<AccountEntry>& entries) const {
  nlohmann::json accounts = nlohmann::json::array();
  for (const auto& e : entries) {
    accounts.push_back({{"server", e.serverOrigin}, {"user_id", e.userId}, {"display_name", e.displayName}});
  }
  const nlohmann::json j = {{"version", 1}, {"accounts", accounts}};
  return writeFileAtomically(path(), j.dump(2));
}

bool AccountsIndex::upsert(const AccountEntry& entry, std::chrono::milliseconds lockTimeout) {
  const auto lock = AccountLock::acquire(dataDir_ / "accounts.lock", lockTimeout);
  if (!lock) {
    return false;
  }
  auto entries = list();
  const auto it = std::find_if(entries.begin(), entries.end(), [&](const AccountEntry& e) {
    return e.serverOrigin == entry.serverOrigin && e.userId == entry.userId;
  });
  if (it == entries.end()) {
    entries.push_back(entry);
  } else {
    it->displayName = entry.displayName;
  }
  return write(entries);
}

bool AccountsIndex::remove(std::string_view serverOrigin, std::string_view userId,
                           std::chrono::milliseconds lockTimeout) {
  const auto lock = AccountLock::acquire(dataDir_ / "accounts.lock", lockTimeout);
  if (!lock) {
    return false;
  }
  auto entries = list();
  std::erase_if(entries,
                [&](const AccountEntry& e) { return e.serverOrigin == serverOrigin && e.userId == userId; });
  return write(entries);
}

} // namespace nodetool::account
