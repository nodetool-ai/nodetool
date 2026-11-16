// `accounts.json` in the shared data folder: the servers, account ids and
// display names the Account control lists. It holds no secret, and no
// decision about a credential reads it.
#pragma once

#include <chrono>
#include <filesystem>
#include <string>
#include <vector>

namespace nodetool::account {

struct AccountEntry {
  std::string serverOrigin;
  std::string userId;
  std::string displayName;
  bool operator==(const AccountEntry&) const = default;
};

// Thread affinity: thread-safe. Reads and writes go through the file, and
// writes take `accounts.lock` in the data folder.
class AccountsIndex {
public:
  explicit AccountsIndex(std::filesystem::path dataDir) : dataDir_(std::move(dataDir)) {}

  std::vector<AccountEntry> list() const;
  // Adds the entry, or updates its display name. Returns false when the
  // lock or the write failed.
  bool upsert(const AccountEntry& entry, std::chrono::milliseconds lockTimeout);
  bool remove(std::string_view serverOrigin, std::string_view userId, std::chrono::milliseconds lockTimeout);

  std::filesystem::path path() const { return dataDir_ / "accounts.json"; }

private:
  bool write(const std::vector<AccountEntry>& entries) const;
  std::filesystem::path dataDir_;
};

} // namespace nodetool::account
