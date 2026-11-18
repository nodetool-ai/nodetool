// A credential store in a folder, one file per item. Compiled only into the
// test helper (NODETOOL_ACCOUNT_HELPER_TESTING), so separate helper
// processes in a test share one store the way the apps share the keychain.
// The shipped helper never writes a credential to a file.
#pragma once

#include "nodetool/account/storage.h"

#include <filesystem>

#ifndef NODETOOL_ACCOUNT_HELPER_TESTING
#error "file_secret_store.h is for the test helper only"
#endif

namespace nodetool::account_helper {

// Thread affinity: thread-safe. Each write replaces one file atomically.
class FileSecretStore final : public account::SecretStore {
public:
  explicit FileSecretStore(std::filesystem::path dir) : dir_(std::move(dir)) {}
  bool available() const override { return true; }
  std::optional<std::string> read(std::string_view service, std::string_view account) override;
  bool write(std::string_view service, std::string_view account, std::string_view value) override;
  void remove(std::string_view service, std::string_view account) override;

private:
  std::filesystem::path itemPath(std::string_view service, std::string_view account) const;
  std::filesystem::path dir_;
};

} // namespace nodetool::account_helper
