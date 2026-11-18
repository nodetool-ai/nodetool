#include "nodetool/account/storage.h"

#include "nodetool/account/crypto.h"

#include <array>
#include <cstdio>
#include <fstream>
#include <sstream>
#include <system_error>
#include <thread>

#ifdef _WIN32
#ifndef NOMINMAX
#define NOMINMAX
#endif
#include <io.h>
#include <windows.h>
#else
#include <fcntl.h>
#include <sys/file.h>
#include <unistd.h>
#endif

namespace nodetool::account {
namespace {

std::string itemKey(std::string_view service, std::string_view account) {
  std::string key(service);
  key.push_back('\n');
  key.append(account);
  return key;
}

std::string shortHash(std::string_view value) {
  const auto digest = sha256(value);
  return hexEncode(digest.data(), digest.size()).substr(0, 16);
}

constexpr std::array<char, 3> kMagic = {'N', 'T', 'G'};

} // namespace

std::optional<std::string> MemorySecretStore::read(std::string_view service, std::string_view account) {
  const std::lock_guard lock(mutex_);
  const auto it = items_.find(itemKey(service, account));
  if (it == items_.end()) {
    return std::nullopt;
  }
  return it->second;
}

bool MemorySecretStore::write(std::string_view service, std::string_view account, std::string_view value) {
  const std::lock_guard lock(mutex_);
  items_[itemKey(service, account)] = std::string(value);
  return true;
}

void MemorySecretStore::remove(std::string_view service, std::string_view account) {
  const std::lock_guard lock(mutex_);
  items_.erase(itemKey(service, account));
}

std::map<std::string, std::string> MemorySecretStore::snapshot() const {
  const std::lock_guard lock(mutex_);
  return items_;
}

std::string keychainAccount(std::string_view serverOrigin, std::string_view userId) {
  std::string account(serverOrigin);
  account.push_back('#');
  account.append(userId);
  return account;
}

std::filesystem::path accountDir(const std::filesystem::path& dataDir, std::string_view serverOrigin,
                                 std::string_view userId) {
  return dataDir / "accounts" / (serverKey(serverOrigin) + "-" + shortHash(userId));
}

// ── AccountLock ──────────────────────────────────────────────────────────

std::optional<AccountLock> AccountLock::acquire(const std::filesystem::path& path,
                                                std::chrono::milliseconds timeout) {
  std::error_code ec;
  std::filesystem::create_directories(path.parent_path(), ec);
  const auto deadline = std::chrono::steady_clock::now() + timeout;
#ifdef _WIN32
  HANDLE file = CreateFileW(path.wstring().c_str(), GENERIC_READ | GENERIC_WRITE,
                            FILE_SHARE_READ | FILE_SHARE_WRITE | FILE_SHARE_DELETE, nullptr, OPEN_ALWAYS,
                            FILE_ATTRIBUTE_NORMAL, nullptr);
  if (file == INVALID_HANDLE_VALUE) {
    return std::nullopt;
  }
  for (;;) {
    OVERLAPPED overlapped{};
    if (LockFileEx(file, LOCKFILE_EXCLUSIVE_LOCK | LOCKFILE_FAIL_IMMEDIATELY, 0, 1, 0, &overlapped)) {
      return AccountLock(reinterpret_cast<intptr_t>(file));
    }
    if (std::chrono::steady_clock::now() >= deadline) {
      CloseHandle(file);
      return std::nullopt;
    }
    std::this_thread::sleep_for(std::chrono::milliseconds(5));
  }
#else
  const int fd = ::open(path.c_str(), O_RDWR | O_CREAT | O_CLOEXEC, 0600);
  if (fd < 0) {
    return std::nullopt;
  }
  for (;;) {
    if (::flock(fd, LOCK_EX | LOCK_NB) == 0) {
      return AccountLock(fd);
    }
    if (std::chrono::steady_clock::now() >= deadline) {
      ::close(fd);
      return std::nullopt;
    }
    std::this_thread::sleep_for(std::chrono::milliseconds(5));
  }
#endif
}

AccountLock::AccountLock(AccountLock&& other) noexcept : handle_(other.handle_) { other.handle_ = -1; }

AccountLock& AccountLock::operator=(AccountLock&& other) noexcept {
  if (this != &other) {
    release();
    handle_ = other.handle_;
    other.handle_ = -1;
  }
  return *this;
}

AccountLock::~AccountLock() { release(); }

void AccountLock::release() {
  if (handle_ == -1) {
    return;
  }
#ifdef _WIN32
  HANDLE file = reinterpret_cast<HANDLE>(handle_);
  OVERLAPPED overlapped{};
  UnlockFileEx(file, 0, 1, 0, &overlapped);
  CloseHandle(file);
#else
  ::flock(static_cast<int>(handle_), LOCK_UN);
  ::close(static_cast<int>(handle_));
#endif
  handle_ = -1;
}

// ── Files ────────────────────────────────────────────────────────────────

bool writeFileAtomically(const std::filesystem::path& path, std::string_view bytes) {
  std::error_code ec;
  std::filesystem::create_directories(path.parent_path(), ec);
  const auto nonce = randomBytes(6);
  std::filesystem::path temp = path;
  temp += ".tmp-" + hexEncode(nonce.data(), nonce.size());
#ifdef _WIN32
  HANDLE file = CreateFileW(temp.wstring().c_str(), GENERIC_WRITE, 0, nullptr, CREATE_NEW,
                            FILE_ATTRIBUTE_NORMAL, nullptr);
  if (file == INVALID_HANDLE_VALUE) {
    return false;
  }
  DWORD written = 0;
  const bool ok = WriteFile(file, bytes.data(), static_cast<DWORD>(bytes.size()), &written, nullptr) &&
                  written == bytes.size() && FlushFileBuffers(file);
  CloseHandle(file);
  if (!ok || !MoveFileExW(temp.wstring().c_str(), path.wstring().c_str(),
                          MOVEFILE_REPLACE_EXISTING | MOVEFILE_WRITE_THROUGH)) {
    DeleteFileW(temp.wstring().c_str());
    return false;
  }
  return true;
#else
  const int fd = ::open(temp.c_str(), O_WRONLY | O_CREAT | O_EXCL | O_CLOEXEC, 0600);
  if (fd < 0) {
    return false;
  }
  size_t done = 0;
  bool ok = true;
  while (done < bytes.size()) {
    const ssize_t n = ::write(fd, bytes.data() + done, bytes.size() - done);
    if (n <= 0) {
      ok = false;
      break;
    }
    done += static_cast<size_t>(n);
  }
  ok = ok && ::fsync(fd) == 0;
  ::close(fd);
  if (!ok || ::rename(temp.c_str(), path.c_str()) != 0) {
    ::unlink(temp.c_str());
    return false;
  }
  return true;
#endif
}

std::optional<std::string> readWholeFile(const std::filesystem::path& path) {
  std::ifstream in(path, std::ios::binary);
  if (!in) {
    return std::nullopt;
  }
  std::ostringstream buffer;
  buffer << in.rdbuf();
  return buffer.str();
}

GenerationStamp readGenerationFile(const std::filesystem::path& path) {
  std::ifstream in(path, std::ios::binary);
  std::array<char, 16> bytes{};
  if (!in || !in.read(bytes.data(), bytes.size())) {
    return {};
  }
  if (bytes[9] != kMagic[0] || bytes[10] != kMagic[1] || bytes[11] != kMagic[2]) {
    return {};
  }
  GenerationStamp stamp;
  for (int i = 0; i < 8; ++i) {
    stamp.generation |= uint64_t{static_cast<uint8_t>(bytes[i])} << (8 * i);
  }
  stamp.state = bytes[8] == 1 ? SessionState::SignedIn : SessionState::SignedOut;
  return stamp;
}

bool writeGenerationFile(const std::filesystem::path& path, GenerationStamp stamp) {
  std::array<char, 16> bytes{};
  for (int i = 0; i < 8; ++i) {
    bytes[i] = static_cast<char>((stamp.generation >> (8 * i)) & 0xff);
  }
  bytes[8] = stamp.state == SessionState::SignedIn ? 1 : 0;
  bytes[9] = kMagic[0];
  bytes[10] = kMagic[1];
  bytes[11] = kMagic[2];
  return writeFileAtomically(path, std::string_view(bytes.data(), bytes.size()));
}

} // namespace nodetool::account
