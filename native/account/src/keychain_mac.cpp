// KeychainStore on macOS: a generic password item with service and account
// attributes. When the running binary carries a validated
// `keychain-access-groups` entitlement for `*.ai.nodetool.native`, items use
// the Data Protection keychain so signed NodeTool apps share credentials
// without legacy ACL prompts. Unsigned or unentitled builds fall back to the
// legacy login keychain in keytar's format.
#include "nodetool/account/keychain_store.h"

#include <CoreFoundation/CoreFoundation.h>
#include <Security/SecTask.h>
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

std::string fromCfString(CFStringRef s) {
  if (!s) {
    return {};
  }
  if (const char* fast = CFStringGetCStringPtr(s, kCFStringEncodingUTF8)) {
    return std::string(fast);
  }
  const CFIndex length = CFStringGetLength(s);
  const CFIndex maxSize = CFStringGetMaximumSizeForEncoding(length, kCFStringEncodingUTF8) + 1;
  std::string out(static_cast<size_t>(maxSize), '\0');
  if (!CFStringGetCString(s, out.data(), maxSize, kCFStringEncodingUTF8)) {
    return {};
  }
  out.resize(std::char_traits<char>::length(out.c_str()));
  return out;
}

// Inspects the process's validated entitlements for a shared NodeTool keychain
// access group (`<TEAM_ID>.ai.nodetool.native` or `ai.nodetool.native`).
// Returns empty string when no matching group is entitled.
std::string detectEntitledAccessGroup() {
  CfHolder<SecTaskRef> task(SecTaskCreateFromSelf(kCFAllocatorDefault));
  if (!task.value) {
    return {};
  }
  CfHolder<CFTypeRef> value(SecTaskCopyValueForEntitlement(task.value, CFSTR("keychain-access-groups"), nullptr));
  if (!value.value || CFGetTypeID(value.value) != CFArrayGetTypeID()) {
    return {};
  }
  const auto groups = static_cast<CFArrayRef>(value.value);
  const CFIndex count = CFArrayGetCount(groups);
  const std::string suffix = "." + std::string(kKeychainService);
  for (CFIndex i = 0; i < count; ++i) {
    const CFTypeRef item = CFArrayGetValueAtIndex(groups, i);
    if (!item || CFGetTypeID(item) != CFStringGetTypeID()) {
      continue;
    }
    const std::string group = fromCfString(static_cast<CFStringRef>(item));
    if (group == kKeychainService || group.ends_with(suffix)) {
      return group;
    }
  }
  return {};
}

// The query that names one item: class, service, account, and (when entitled)
// the Data Protection keychain and shared access group.
CFMutableDictionaryRef makeQuery(CFStringRef service, CFStringRef account, CFStringRef accessGroup) {
  CFMutableDictionaryRef query =
      CFDictionaryCreateMutable(kCFAllocatorDefault, 0, &kCFTypeDictionaryKeyCallBacks,
                                &kCFTypeDictionaryValueCallBacks);
  CFDictionaryAddValue(query, kSecClass, kSecClassGenericPassword);
  CFDictionaryAddValue(query, kSecAttrService, service);
  CFDictionaryAddValue(query, kSecAttrAccount, account);
  if (accessGroup) {
    CFDictionaryAddValue(query, kSecUseDataProtectionKeychain, kCFBooleanTrue);
    CFDictionaryAddValue(query, kSecAttrAccessGroup, accessGroup);
  }
  return query;
}

SecretReadStatus classifyStatus(OSStatus status) {
  switch (status) {
  case errSecSuccess:
    return SecretReadStatus::Ok;
  case errSecItemNotFound:
    return SecretReadStatus::NotFound;
  case errSecUserCanceled:
  case errSecAuthFailed:
  case errSecInteractionNotAllowed:
  case errSecNoAccessForItem:
    return SecretReadStatus::AccessDenied;
  default:
    return SecretReadStatus::Error;
  }
}

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
  std::string group;
  {
    const std::lock_guard lock(mutex_);
    if (!accessGroup_) {
      accessGroup_ = detectEntitledAccessGroup();
    }
    group = *accessGroup_;
  }
  CfHolder<CFStringRef> s(makeString(service));
  CfHolder<CFStringRef> a(makeString(account));
  CfHolder<CFStringRef> g(group.empty() ? nullptr : makeString(group));
  CfHolder<CFMutableDictionaryRef> query(makeQuery(s.value, a.value, g.value));
  CFDictionaryAddValue(query.value, kSecReturnData, kCFBooleanTrue);
  CFDictionaryAddValue(query.value, kSecMatchLimit, kSecMatchLimitOne);
  CFTypeRef found = nullptr;
  const OSStatus status = SecItemCopyMatching(query.value, &found);
  if (status != errSecSuccess) {
    return {classifyStatus(status), {}};
  }
  if (!found) {
    return {SecretReadStatus::Error, {}};
  }
  CfHolder<CFDataRef> data(static_cast<CFDataRef>(found));
  return {SecretReadStatus::Ok,
          std::string(reinterpret_cast<const char*>(CFDataGetBytePtr(data.value)),
                      static_cast<size_t>(CFDataGetLength(data.value)))};
}

bool KeychainStore::write(std::string_view service, std::string_view account, std::string_view value) {
  if (value.size() > kMaxSecretBytes) {
    return false;
  }
  std::string group;
  {
    const std::lock_guard lock(mutex_);
    if (!accessGroup_) {
      accessGroup_ = detectEntitledAccessGroup();
    }
    group = *accessGroup_;
  }
  CfHolder<CFStringRef> s(makeString(service));
  CfHolder<CFStringRef> a(makeString(account));
  CfHolder<CFStringRef> g(group.empty() ? nullptr : makeString(group));
  CfHolder<CFDataRef> data(CFDataCreate(kCFAllocatorDefault, reinterpret_cast<const UInt8*>(value.data()),
                                        static_cast<CFIndex>(value.size())));
  CfHolder<CFMutableDictionaryRef> query(makeQuery(s.value, a.value, g.value));
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
  if (g.value) {
    CFDictionaryAddValue(query.value, kSecAttrAccessible, kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly);
  }
  return SecItemAdd(query.value, nullptr) == errSecSuccess;
}

void KeychainStore::remove(std::string_view service, std::string_view account) {
  std::string group;
  {
    const std::lock_guard lock(mutex_);
    if (!accessGroup_) {
      accessGroup_ = detectEntitledAccessGroup();
    }
    group = *accessGroup_;
  }
  CfHolder<CFStringRef> s(makeString(service));
  CfHolder<CFStringRef> a(makeString(account));
  CfHolder<CFStringRef> g(group.empty() ? nullptr : makeString(group));
  CfHolder<CFMutableDictionaryRef> query(makeQuery(s.value, a.value, g.value));
  SecItemDelete(query.value);
}

} // namespace nodetool::account
