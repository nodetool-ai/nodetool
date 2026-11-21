// KeychainStore on Windows: Credential Manager, with keytar's target name,
// user name and persistence.
#include "nodetool/account/keychain_store.h"

#ifndef NOMINMAX
#define NOMINMAX
#endif
#include <windows.h>
#include <wincred.h>

#include <string>

namespace nodetool::account {
namespace {

std::wstring widen(std::string_view utf8) {
  if (utf8.empty()) {
    return {};
  }
  const int size = MultiByteToWideChar(CP_UTF8, 0, utf8.data(), static_cast<int>(utf8.size()), nullptr, 0);
  std::wstring out(static_cast<size_t>(size), L'\0');
  MultiByteToWideChar(CP_UTF8, 0, utf8.data(), static_cast<int>(utf8.size()), out.data(), size);
  return out;
}

std::wstring targetName(std::string_view service, std::string_view account) {
  std::string target(service);
  target.push_back('/');
  target.append(account);
  return widen(target);
}

// Owns a CREDENTIALW from CredReadW and frees it.
struct CredentialHolder {
  PCREDENTIALW value = nullptr;
  ~CredentialHolder() {
    if (value) {
      CredFree(value);
    }
  }
  CredentialHolder() = default;
  CredentialHolder(const CredentialHolder&) = delete;
  CredentialHolder& operator=(const CredentialHolder&) = delete;
};

} // namespace

bool keychainCompiledIn() { return true; }

bool KeychainStore::available() const { return true; }

std::optional<std::string> KeychainStore::read(std::string_view service, std::string_view account) {
  SecretReadResult result = readResult(service, account);
  if (result.status != SecretReadStatus::Ok) {
    return std::nullopt;
  }
  return std::move(result.value);
}

SecretReadResult KeychainStore::readResult(std::string_view service, std::string_view account) {
  const std::wstring target = targetName(service, account);
  CredentialHolder cred;
  if (!CredReadW(target.c_str(), CRED_TYPE_GENERIC, 0, &cred.value)) {
    const DWORD error = GetLastError();
    if (error == ERROR_NOT_FOUND) {
      return {SecretReadStatus::NotFound, {}};
    }
    if (error == ERROR_ACCESS_DENIED || error == ERROR_CANCELLED) {
      return {SecretReadStatus::AccessDenied, {}};
    }
    return {SecretReadStatus::Error, {}};
  }
  return {SecretReadStatus::Ok,
          std::string(reinterpret_cast<const char*>(cred.value->CredentialBlob), cred.value->CredentialBlobSize)};
}

bool KeychainStore::write(std::string_view service, std::string_view account, std::string_view value) {
  if (value.size() > kMaxSecretBytes) {
    return false;
  }
  std::wstring target = targetName(service, account);
  std::wstring user = widen(account);
  std::string blob(value);
  CREDENTIALW cred{};
  cred.Type = CRED_TYPE_GENERIC;
  cred.TargetName = target.data();
  cred.UserName = user.data();
  cred.CredentialBlobSize = static_cast<DWORD>(blob.size());
  cred.CredentialBlob = reinterpret_cast<LPBYTE>(blob.data());
  cred.Persist = CRED_PERSIST_ENTERPRISE;
  return CredWriteW(&cred, 0) != FALSE;
}

void KeychainStore::remove(std::string_view service, std::string_view account) {
  const std::wstring target = targetName(service, account);
  CredDeleteW(target.c_str(), CRED_TYPE_GENERIC, 0);
}

} // namespace nodetool::account
