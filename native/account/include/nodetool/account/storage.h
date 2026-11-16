// What the account module keeps on the computer (technical design,
// "Credential storage and the second app"): the secret store that holds the
// session record, the lock file both apps take before they touch it, the
// generation file, and the folder layout for one server and user.
#pragma once

#include <chrono>
#include <cstdint>
#include <filesystem>
#include <map>
#include <memory>
#include <mutex>
#include <optional>
#include <string>
#include <string_view>

namespace nodetool::account {

// The operating system's credential store: Keychain on macOS, Credential
// Manager on Windows, the Secret Service on Linux. The platform
// implementations follow the WP0.2 spike. An item is addressed by service and
// account, and its value is one opaque string.
//
// Thread affinity: implementations are thread-safe.
class SecretStore {
public:
  virtual ~SecretStore() = default;
  // False when no store exists on this computer, such as Linux without a
  // Secret Service. The tokens then stay in the memory of one app (SR2).
  virtual bool available() const = 0;
  virtual std::optional<std::string> read(std::string_view service, std::string_view account) = 0;
  // Returns false when the store refused the write.
  virtual bool write(std::string_view service, std::string_view account, std::string_view value) = 0;
  virtual void remove(std::string_view service, std::string_view account) = 0;
};

// A store held in memory. Tests share one between two sessions to stand in
// for the keychain item both apps read, and an app uses one as the
// fallback when no store is available.
//
// Thread affinity: thread-safe. `mutex_` guards `items_`.
class MemorySecretStore final : public SecretStore {
public:
  bool available() const override { return true; }
  std::optional<std::string> read(std::string_view service, std::string_view account) override;
  bool write(std::string_view service, std::string_view account, std::string_view value) override;
  void remove(std::string_view service, std::string_view account) override;
  // Every stored value, for the tests that scan for a token.
  std::map<std::string, std::string> snapshot() const;

private:
  mutable std::mutex mutex_;
  std::map<std::string, std::string> items_;
};

// The keychain item name of one server and user: service
// `ai.nodetool.native`, account `<server origin>#<user id>`.
inline constexpr std::string_view kKeychainService = "ai.nodetool.native";
std::string keychainAccount(std::string_view serverOrigin, std::string_view userId);

// The folder that holds `account.lock` and `session.gen` for one server and
// user: `<data dir>/accounts/<server key>-<user key>`, where both keys are
// the first 16 hex characters of a SHA-256.
std::filesystem::path accountDir(const std::filesystem::path& dataDir, std::string_view serverOrigin,
                                 std::string_view userId);

// An exclusive lock on a file, held for the life of the object. The lock
// belongs to the open file, so two processes, and two AccountLock objects in
// one process, exclude each other. The operating system releases it when
// the holder dies.
//
// Thread affinity: one thread creates and destroys an AccountLock. Different
// threads may each hold their own.
//
// Ownership: the object owns the file descriptor or handle and closes it in
// its destructor.
class AccountLock {
public:
  // Waits at most `timeout`. Returns nullopt on timeout, or when the file
  // cannot be opened.
  static std::optional<AccountLock> acquire(const std::filesystem::path& path,
                                            std::chrono::milliseconds timeout);
  AccountLock(AccountLock&& other) noexcept;
  AccountLock& operator=(AccountLock&& other) noexcept;
  AccountLock(const AccountLock&) = delete;
  AccountLock& operator=(const AccountLock&) = delete;
  ~AccountLock();

private:
  explicit AccountLock(intptr_t handle) : handle_(handle) {}
  void release();
  intptr_t handle_ = -1;
};

enum class SessionState : uint8_t { SignedOut = 0, SignedIn = 1 };

// What the generation file holds: 16 bytes, the generation as a little
// endian 64-bit integer, the state, the magic "NTG" and four zero bytes. No
// secret.
struct GenerationStamp {
  uint64_t generation = 0;
  SessionState state = SessionState::SignedOut;
  bool operator==(const GenerationStamp&) const = default;
};

// Reads the generation file. A missing or malformed file reads as generation
// 0, signed out.
GenerationStamp readGenerationFile(const std::filesystem::path& path);

// Replaces the generation file. Returns false when the write failed.
bool writeGenerationFile(const std::filesystem::path& path, GenerationStamp stamp);

// Writes `bytes` to a temporary file beside `path`, flushes it to disk and
// renames it over `path`, so a reader sees the old or the new content and
// never a part of either.
bool writeFileAtomically(const std::filesystem::path& path, std::string_view bytes);

std::optional<std::string> readWholeFile(const std::filesystem::path& path);

} // namespace nodetool::account
