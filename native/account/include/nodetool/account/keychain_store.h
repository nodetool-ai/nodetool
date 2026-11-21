// The operating system's credential store, written the way keytar writes it.
// keytar is the keychain library of the Node backend
// (packages/security/src/master-key.ts), so an item one side writes is the
// same item the other side reads.
//
// | Platform | API | Item |
// |---|---|---|
// | macOS | Security framework, generic password | Data Protection keychain with shared `keychain-access-groups` (`*.ai.nodetool.native`) when entitled, otherwise legacy login keychain with service and account attributes |
// | Windows | Credential Manager, CRED_TYPE_GENERIC | target `<service>/<account>`, user name `<account>`, persist enterprise |
// | Linux | libsecret, schema `org.freedesktop.Secret.Generic` | attributes `service` and `account`, label `<service>/<account>`, default collection |
//
// On Linux the library builds without the store when libsecret is not
// installed, and available() is false. At run time available() is also false
// when no Secret Service answers.
#pragma once

#include "nodetool/account/storage.h"

#include <memory>
#include <mutex>
#include <optional>
#include <string>

namespace nodetool::account {

// The largest value Windows Credential Manager stores (CRED_MAX_CREDENTIAL_BLOB_SIZE).
// The store refuses a longer value on every platform, so a record behaves
// the same everywhere.
inline constexpr size_t kMaxSecretBytes = 5 * 512;

// Thread affinity: thread-safe. The platform APIs are thread-safe, and
// `mutex_` guards the cached availability probe and macOS access group probe.
class KeychainStore final : public SecretStore {
public:
  KeychainStore() = default;
  bool available() const override;
  std::optional<std::string> read(std::string_view service, std::string_view account) override;
  SecretReadResult readResult(std::string_view service, std::string_view account) override;
  bool write(std::string_view service, std::string_view account, std::string_view value) override;
  void remove(std::string_view service, std::string_view account) override;

private:
  mutable std::mutex mutex_;
  mutable std::optional<bool> available_;
  // Empty string means probed and no shared Data Protection access group was
  // entitled for this process.
  mutable std::optional<std::string> accessGroup_;
};

// True when this build includes a platform store.
bool keychainCompiledIn();

} // namespace nodetool::account
