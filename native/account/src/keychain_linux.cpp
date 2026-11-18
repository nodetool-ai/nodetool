// KeychainStore on Linux: libsecret, with keytar's schema and attributes.
#include "nodetool/account/keychain_store.h"

#ifdef NODETOOL_ACCOUNT_HAVE_LIBSECRET
#include <libsecret/secret.h>
#endif

#include <string>

namespace nodetool::account {

#ifdef NODETOOL_ACCOUNT_HAVE_LIBSECRET

namespace {

const SecretSchema* keytarSchema() {
  // keytar_posix.cc declares the same schema.
  static const SecretSchema schema = {"org.freedesktop.Secret.Generic",
                                      SECRET_SCHEMA_NONE,
                                      {{"service", SECRET_SCHEMA_ATTRIBUTE_STRING},
                                       {"account", SECRET_SCHEMA_ATTRIBUTE_STRING},
                                       {nullptr, SECRET_SCHEMA_ATTRIBUTE_STRING}},
                                      0, nullptr, nullptr, nullptr, nullptr, nullptr, nullptr, nullptr};
  return &schema;
}

// Owns a GError and frees it.
struct ErrorHolder {
  GError* error = nullptr;
  ~ErrorHolder() {
    if (error) {
      g_error_free(error);
    }
  }
  ErrorHolder() = default;
  ErrorHolder(const ErrorHolder&) = delete;
  ErrorHolder& operator=(const ErrorHolder&) = delete;
};

// Owns a secret from secret_password_lookup_sync and frees it.
struct SecretHolder {
  gchar* value = nullptr;
  ~SecretHolder() {
    if (value) {
      secret_password_free(value);
    }
  }
  SecretHolder() = default;
  SecretHolder(const SecretHolder&) = delete;
  SecretHolder& operator=(const SecretHolder&) = delete;
};

} // namespace

bool keychainCompiledIn() { return true; }

bool KeychainStore::available() const {
  const std::lock_guard lock(mutex_);
  if (!available_) {
    // A lookup of an item that never exists answers without an error when a
    // Secret Service is running, and with one when none is.
    ErrorHolder error;
    SecretHolder value;
    value.value = secret_password_lookup_sync(keytarSchema(), nullptr, &error.error, "service",
                                              "ai.nodetool.native.probe", "account", "probe", nullptr);
    available_ = error.error == nullptr;
  }
  return *available_;
}

std::optional<std::string> KeychainStore::read(std::string_view service, std::string_view account) {
  const std::string s(service);
  const std::string a(account);
  ErrorHolder error;
  SecretHolder value;
  value.value = secret_password_lookup_sync(keytarSchema(), nullptr, &error.error, "service", s.c_str(),
                                            "account", a.c_str(), nullptr);
  if (error.error || !value.value) {
    return std::nullopt;
  }
  return std::string(value.value);
}

bool KeychainStore::write(std::string_view service, std::string_view account, std::string_view value) {
  if (value.size() > kMaxSecretBytes) {
    return false;
  }
  const std::string s(service);
  const std::string a(account);
  const std::string v(value);
  const std::string label = s + "/" + a;
  ErrorHolder error;
  const gboolean ok = secret_password_store_sync(keytarSchema(), SECRET_COLLECTION_DEFAULT, label.c_str(),
                                                 v.c_str(), nullptr, &error.error, "service", s.c_str(),
                                                 "account", a.c_str(), nullptr);
  return ok && !error.error;
}

void KeychainStore::remove(std::string_view service, std::string_view account) {
  const std::string s(service);
  const std::string a(account);
  ErrorHolder error;
  secret_password_clear_sync(keytarSchema(), nullptr, &error.error, "service", s.c_str(), "account", a.c_str(),
                             nullptr);
}

#else

bool keychainCompiledIn() { return false; }
bool KeychainStore::available() const { return false; }
std::optional<std::string> KeychainStore::read(std::string_view, std::string_view) { return std::nullopt; }
bool KeychainStore::write(std::string_view, std::string_view, std::string_view) { return false; }
void KeychainStore::remove(std::string_view, std::string_view) {}

#endif

} // namespace nodetool::account
