#include "nodetool/account/accounts_index.h"

#include "nodetool/account/storage.h"

#include <algorithm>
#include <optional>
#include <nlohmann/json.hpp>

namespace nodetool::account {

namespace {

std::optional<AccountEntry> entryFrom(const nlohmann::json& item) {
  if (!item.is_object()) {
    return std::nullopt;
  }
  AccountEntry entry{item.value("server", ""), item.value("user_id", ""), item.value("display_name", "")};
  if (entry.serverOrigin.empty() || entry.userId.empty()) {
    return std::nullopt;
  }
  return entry;
}

nlohmann::json toJson(const AccountEntry& e) {
  return {{"server", e.serverOrigin}, {"user_id", e.userId}, {"display_name", e.displayName}};
}

} // namespace

bool writeAccountEntry(const std::filesystem::path& accountDir, const AccountEntry& entry) {
  std::error_code ec;
  std::filesystem::create_directories(accountDir, ec);
  return writeFileAtomically(accountDir / "entry.json", toJson(entry).dump(2));
}

std::vector<AccountEntry> AccountsIndex::list() const {
  auto out = listIndex();
  std::error_code ec;
  for (const auto& dir : std::filesystem::directory_iterator(dataDir_ / "accounts", ec)) {
    const auto raw = readWholeFile(dir.path() / "entry.json");
    if (!raw) {
      continue;
    }
    const auto entry = entryFrom(nlohmann::json::parse(*raw, nullptr, false));
    if (!entry) {
      continue;
    }
    const bool listed = std::any_of(out.begin(), out.end(), [&](const AccountEntry& e) {
      return e.serverOrigin == entry->serverOrigin && e.userId == entry->userId;
    });
    if (!listed) {
      out.push_back(*entry);
    }
  }
  return out;
}

std::vector<AccountEntry> AccountsIndex::listIndex() const {
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
    if (auto entry = entryFrom(item)) {
      out.push_back(std::move(*entry));
    }
  }
  return out;
}

bool AccountsIndex::write(const std::vector<AccountEntry>& entries) const {
  nlohmann::json accounts = nlohmann::json::array();
  for (const auto& e : entries) {
    accounts.push_back(toJson(e));
  }
  const nlohmann::json j = {{"version", 1}, {"accounts", accounts}};
  return writeFileAtomically(path(), j.dump(2));
}

bool AccountsIndex::upsert(const AccountEntry& entry, std::chrono::milliseconds lockTimeout) {
  const auto lock = AccountLock::acquire(dataDir_ / "accounts.lock", lockTimeout);
  if (!lock) {
    return false;
  }
  auto entries = listIndex();
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
  // The entry file goes first, or list() would bring the account back.
  std::error_code ec;
  std::filesystem::remove(accountDir(dataDir_, serverOrigin, userId) / "entry.json", ec);
  if (ec) {
    return false;
  }
  auto entries = listIndex();
  std::erase_if(entries,
                [&](const AccountEntry& e) { return e.serverOrigin == serverOrigin && e.userId == userId; });
  return write(entries);
}

} // namespace nodetool::account
