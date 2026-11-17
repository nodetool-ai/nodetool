// KeychainStore on macOS: a generic password item with service and account
// attributes, the item keytar writes with SecKeychainAddGenericPassword. The
// SecItem calls here read and update the same items without the deprecated
// SecKeychain API.
#include "nodetool/account/keychain_store.h"

#include <CoreFoundation/CoreFoundation.h>
#include <Security/Security.h>

#include <string>

namespace nodetool::account {
namespace {

// Owns one Core Foundation reference and releases it.
template <typename T> struct CfHolder {
  T value = nullptr;
  explicit CfHolder(T v = nullptr) : value(v) {}
  ~CfHolder() {
    if (value) {
      CFRelease(value);
    }
  }
  CfHolder(const CfHolder&) = delete;
  CfHolder& operator=(const CfHolder&) = delete;
};

CFStringRef makeString(std::string_view s) {
  return CFStringCreateWithBytes(kCFAllocatorDefault, reinterpret_cast<const UInt8*>(s.data()),
                                 static_cast<CFIndex>(s.size()), kCFStringEncodingUTF8, false);
}

// The query that names one item: class, service and account.
CFMutableDictionaryRef makeQuery(CFStringRef service, CFStringRef account) {
  CFMutableDictionaryRef query =
      CFDictionaryCreateMutable(kCFAllocatorDefault, 0, &kCFTypeDictionaryKeyCallBacks,
                                &kCFTypeDictionaryValueCallBacks);
  CFDictionaryAddValue(query, kSecClass, kSecClassGenericPassword);
  CFDictionaryAddValue(query, kSecAttrService, service);
  CFDictionaryAddValue(query, kSecAttrAccount, account);
  return query;
}

} // namespace

bool keychainCompiledIn() { return true; }

bool KeychainStore::available() const { return true; }

std::optional<std::string> KeychainStore::read(std::string_view service, std::string_view account) {
  CfHolder<CFStringRef> s(makeString(service));
  CfHolder<CFStringRef> a(makeString(account));
  CfHolder<CFMutableDictionaryRef> query(makeQuery(s.value, a.value));
  CFDictionaryAddValue(query.value, kSecReturnData, kCFBooleanTrue);
  CFDictionaryAddValue(query.value, kSecMatchLimit, kSecMatchLimitOne);
  CFTypeRef found = nullptr;
  if (SecItemCopyMatching(query.value, &found) != errSecSuccess || !found) {
    return std::nullopt;
  }
  CfHolder<CFDataRef> data(static_cast<CFDataRef>(found));
  return std::string(reinterpret_cast<const char*>(CFDataGetBytePtr(data.value)),
                     static_cast<size_t>(CFDataGetLength(data.value)));
}

bool KeychainStore::write(std::string_view service, std::string_view account, std::string_view value) {
  if (value.size() > kMaxSecretBytes) {
    return false;
  }
  CfHolder<CFStringRef> s(makeString(service));
  CfHolder<CFStringRef> a(makeString(account));
  CfHolder<CFDataRef> data(CFDataCreate(kCFAllocatorDefault, reinterpret_cast<const UInt8*>(value.data()),
                                        static_cast<CFIndex>(value.size())));
  CfHolder<CFMutableDictionaryRef> query(makeQuery(s.value, a.value));
  CfHolder<CFMutableDictionaryRef> update(CFDictionaryCreateMutable(
      kCFAllocatorDefault, 0, &kCFTypeDictionaryKeyCallBacks, &kCFTypeDictionaryValueCallBacks));
  CFDictionaryAddValue(update.value, kSecValueData, data.value);
  const OSStatus status = SecItemUpdate(query.value, update.value);
  if (status == errSecSuccess) {
    return true;
  }
  if (status != errSecItemNotFound) {
    return false;
  }
  CFDictionaryAddValue(query.value, kSecValueData, data.value);
  return SecItemAdd(query.value, nullptr) == errSecSuccess;
}

void KeychainStore::remove(std::string_view service, std::string_view account) {
  CfHolder<CFStringRef> s(makeString(service));
  CfHolder<CFStringRef> a(makeString(account));
  CfHolder<CFMutableDictionaryRef> query(makeQuery(s.value, a.value));
  SecItemDelete(query.value);
}

} // namespace nodetool::account
