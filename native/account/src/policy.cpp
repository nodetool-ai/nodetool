#include "nodetool/account/policy.h"

#include <nlohmann/json.hpp>

#include <algorithm>
#include <cctype>
#include <fstream>
#include <iterator>
#include <set>
#include <system_error>
#include <vector>

#if defined(__APPLE__)
#include <CoreFoundation/CoreFoundation.h>
#elif defined(_WIN32)
#ifndef NOMINMAX
#define NOMINMAX
#endif
#include <windows.h>
#endif

namespace nodetool::account {
namespace {

constexpr const char* kCloudEnabled = "CloudEnabled";
constexpr const char* kAllowedServers = "AllowedServers";

ManagedPolicy unreadable(std::string error) {
  ManagedPolicy policy;
  policy.present = true;
  policy.cloudEnabled = false;
  policy.error = std::move(error);
  return policy;
}

std::string lower(std::string_view text) {
  std::string out(text);
  std::transform(out.begin(), out.end(), out.begin(), [](unsigned char c) { return static_cast<char>(std::tolower(c)); });
  return out;
}

// Adds `server` to the policy, or marks the policy unreadable.
bool addServer(ManagedPolicy& policy, std::string_view server) {
  const std::string origin = normalizeOrigin(server);
  if (origin.empty()) {
    policy = unreadable("AllowedServers holds \"" + std::string(server) + "\", which is not an http or https origin");
    return false;
  }
  policy.allowedServers.push_back(origin);
  return true;
}

// An allowlist that names no server would read as "any server". The policy
// is then unreadable, because an administrator who set the key meant a list.
bool checkAllowlist(ManagedPolicy& policy) {
  if (policy.allowedServers.empty()) {
    policy = unreadable("AllowedServers names no server");
    return false;
  }
  return true;
}

#if defined(__APPLE__)

// Thread affinity: none, a value type. Owns one CoreFoundation reference.
struct CfRef {
  CFTypeRef ref = nullptr;
  explicit CfRef(CFTypeRef value) : ref(value) {}
  CfRef(const CfRef&) = delete;
  CfRef& operator=(const CfRef&) = delete;
  ~CfRef() {
    if (ref != nullptr) {
      CFRelease(ref);
    }
  }
};

std::string cfString(CFStringRef value) {
  const CFIndex length = CFStringGetLength(value);
  const CFIndex size = CFStringGetMaximumSizeForEncoding(length, kCFStringEncodingUTF8) + 1;
  std::string out(static_cast<size_t>(size), '\0');
  if (!CFStringGetCString(value, out.data(), size, kCFStringEncodingUTF8)) {
    return {};
  }
  out.resize(std::char_traits<char>::length(out.c_str()));
  return out;
}

ManagedPolicy readMacPolicy() {
  const CfRef domain(CFStringCreateWithCString(nullptr, "ai.nodetool.native", kCFStringEncodingUTF8));
  const CfRef enabledKey(CFStringCreateWithCString(nullptr, kCloudEnabled, kCFStringEncodingUTF8));
  const CfRef serversKey(CFStringCreateWithCString(nullptr, kAllowedServers, kCFStringEncodingUTF8));
  const auto domainRef = static_cast<CFStringRef>(domain.ref);
  // Only a value an administrator forced counts. A person's own defaults
  // write is not a policy.
  const bool enabledForced = CFPreferencesAppValueIsForced(static_cast<CFStringRef>(enabledKey.ref), domainRef);
  const bool serversForced = CFPreferencesAppValueIsForced(static_cast<CFStringRef>(serversKey.ref), domainRef);
  ManagedPolicy policy;
  if (!enabledForced && !serversForced) {
    return policy;
  }
  policy.present = true;
  if (enabledForced) {
    const CfRef value(CFPreferencesCopyAppValue(static_cast<CFStringRef>(enabledKey.ref), domainRef));
    if (value.ref == nullptr || CFGetTypeID(value.ref) != CFBooleanGetTypeID()) {
      return unreadable("CloudEnabled is not a boolean");
    }
    policy.cloudEnabled = CFBooleanGetValue(static_cast<CFBooleanRef>(value.ref));
  }
  if (serversForced) {
    const CfRef value(CFPreferencesCopyAppValue(static_cast<CFStringRef>(serversKey.ref), domainRef));
    if (value.ref == nullptr || CFGetTypeID(value.ref) != CFArrayGetTypeID()) {
      return unreadable("AllowedServers is not an array");
    }
    const auto array = static_cast<CFArrayRef>(value.ref);
    for (CFIndex i = 0; i < CFArrayGetCount(array); ++i) {
      const CFTypeRef item = CFArrayGetValueAtIndex(array, i);
      if (CFGetTypeID(item) != CFStringGetTypeID()) {
        return unreadable("AllowedServers holds a value that is not a string");
      }
      if (!addServer(policy, cfString(static_cast<CFStringRef>(item)))) {
        return policy;
      }
    }
    checkAllowlist(policy);
  }
  return policy;
}

#elif defined(_WIN32)

std::string narrow(const std::wstring& wide) {
  if (wide.empty()) {
    return {};
  }
  const int size = WideCharToMultiByte(CP_UTF8, 0, wide.data(), static_cast<int>(wide.size()), nullptr, 0, nullptr, nullptr);
  std::string out(static_cast<size_t>(size), '\0');
  WideCharToMultiByte(CP_UTF8, 0, wide.data(), static_cast<int>(wide.size()), out.data(), size, nullptr, nullptr);
  return out;
}

ManagedPolicy readWindowsPolicy() {
  constexpr const wchar_t* kKey = L"SOFTWARE\\Policies\\NodeTool\\Native";
  ManagedPolicy policy;
  DWORD enabled = 0;
  DWORD enabledSize = sizeof(enabled);
  const LSTATUS enabledStatus =
      RegGetValueW(HKEY_LOCAL_MACHINE, kKey, L"CloudEnabled", RRF_RT_REG_DWORD, nullptr, &enabled, &enabledSize);
  DWORD serversSize = 0;
  const LSTATUS serversProbe =
      RegGetValueW(HKEY_LOCAL_MACHINE, kKey, L"AllowedServers", RRF_RT_REG_MULTI_SZ, nullptr, nullptr, &serversSize);
  const bool hasEnabled = enabledStatus != ERROR_FILE_NOT_FOUND;
  const bool hasServers = serversProbe != ERROR_FILE_NOT_FOUND;
  if (!hasEnabled && !hasServers) {
    return policy;
  }
  policy.present = true;
  if (hasEnabled) {
    if (enabledStatus != ERROR_SUCCESS) {
      return unreadable("CloudEnabled is not a REG_DWORD");
    }
    policy.cloudEnabled = enabled != 0;
  }
  if (hasServers) {
    if (serversProbe != ERROR_SUCCESS) {
      return unreadable("AllowedServers is not a REG_MULTI_SZ");
    }
    std::wstring buffer(serversSize / sizeof(wchar_t) + 1, L'\0');
    DWORD size = static_cast<DWORD>(buffer.size() * sizeof(wchar_t));
    if (RegGetValueW(HKEY_LOCAL_MACHINE, kKey, L"AllowedServers", RRF_RT_REG_MULTI_SZ, nullptr, buffer.data(), &size) !=
        ERROR_SUCCESS) {
      return unreadable("AllowedServers could not be read");
    }
    // A REG_MULTI_SZ is strings each ended by a null, then one more null.
    const wchar_t* cursor = buffer.c_str();
    while (*cursor != L'\0') {
      const std::wstring item(cursor);
      if (!addServer(policy, narrow(item))) {
        return policy;
      }
      cursor += item.size() + 1;
    }
    checkAllowlist(policy);
  }
  return policy;
}

#endif

} // namespace

ManagedPolicy parsePolicyJson(std::string_view text) {
  // The JSON library keeps the last of two equal keys. A policy that gives a
  // key twice could mean either value, so it is unreadable.
  std::vector<std::set<std::string>> keys;
  std::string repeated;
  const nlohmann::json::parser_callback_t noteKeys = [&](int, nlohmann::json::parse_event_t event,
                                                         nlohmann::json& parsed) {
    if (event == nlohmann::json::parse_event_t::object_start) {
      keys.emplace_back();
    } else if (event == nlohmann::json::parse_event_t::object_end && !keys.empty()) {
      keys.pop_back();
    } else if (event == nlohmann::json::parse_event_t::key && !keys.empty() &&
               !keys.back().insert(parsed.get<std::string>()).second && repeated.empty()) {
      repeated = parsed.get<std::string>();
    }
    return true;
  };
  const nlohmann::json value = nlohmann::json::parse(text, noteKeys, false);
  if (value.is_discarded() || !value.is_object()) {
    return unreadable("The policy is not a JSON object");
  }
  if (!repeated.empty()) {
    return unreadable("The policy gives " + repeated + " more than once");
  }
  ManagedPolicy policy;
  policy.present = true;
  if (value.contains(kCloudEnabled)) {
    if (!value[kCloudEnabled].is_boolean()) {
      return unreadable("CloudEnabled is not a boolean");
    }
    policy.cloudEnabled = value[kCloudEnabled].get<bool>();
  }
  if (value.contains(kAllowedServers)) {
    const nlohmann::json& servers = value[kAllowedServers];
    if (!servers.is_array()) {
      return unreadable("AllowedServers is not an array");
    }
    for (const nlohmann::json& server : servers) {
      if (!server.is_string()) {
        return unreadable("AllowedServers holds a value that is not a string");
      }
      if (!addServer(policy, server.get<std::string>())) {
        return policy;
      }
    }
    checkAllowlist(policy);
  }
  return policy;
}

ManagedPolicy readPolicyFile(const std::filesystem::path& path) {
  // Only nothing at the path is no policy. A link to nothing, a folder, or a
  // path that cannot be inspected is a policy that cannot be read.
  std::error_code error;
  const std::filesystem::file_status own = std::filesystem::symlink_status(path, error);
  if (own.type() == std::filesystem::file_type::not_found) {
    return {};
  }
  if (error) {
    return unreadable("The policy file " + path.string() + " could not be inspected (" + error.message() + ")");
  }
  const std::filesystem::file_status target = std::filesystem::status(path, error);
  if (error || target.type() != std::filesystem::file_type::regular) {
    return unreadable("The policy file " + path.string() + " is not a regular file");
  }
  std::ifstream file(path, std::ios::binary);
  if (!file) {
    return unreadable("The policy file " + path.string() + " could not be opened");
  }
  std::string text;
  try {
    text.assign(std::istreambuf_iterator<char>(file), std::istreambuf_iterator<char>());
  } catch (const std::ios_base::failure&) {
    return unreadable("The policy file " + path.string() + " could not be read");
  }
  if (file.bad()) {
    return unreadable("The policy file " + path.string() + " could not be read");
  }
  return parsePolicyJson(text);
}

ManagedPolicy readManagedPolicy() {
#if defined(__APPLE__)
  return readMacPolicy();
#elif defined(_WIN32)
  return readWindowsPolicy();
#else
  return readPolicyFile("/etc/nodetool/policy.json");
#endif
}

std::string normalizeOrigin(std::string_view origin) {
  const std::string text = lower(origin);
  std::string scheme;
  std::string_view rest;
  if (text.starts_with("https://")) {
    scheme = "https";
    rest = std::string_view(text).substr(8);
  } else if (text.starts_with("http://")) {
    scheme = "http";
    rest = std::string_view(text).substr(7);
  } else {
    return {};
  }
  while (rest.ends_with('/')) {
    rest.remove_suffix(1);
  }
  // An origin has no path, query, fragment or credentials.
  if (rest.empty() || rest.find_first_of("/?#@ ") != std::string_view::npos) {
    return {};
  }
  std::string host(rest);
  const std::string defaultPort = scheme == "https" ? ":443" : ":80";
  if (host.ends_with(defaultPort)) {
    host.resize(host.size() - defaultPort.size());
  }
  if (host.empty() || host.starts_with(':')) {
    return {};
  }
  return scheme + "://" + host;
}

PolicyCheck checkServer(const ManagedPolicy& policy, std::string_view serverOrigin) {
  PolicyCheck check;
  if (!policy.present) {
    return check;
  }
  if (!policy.cloudEnabled) {
    check.decision = PolicyDecision::CloudOff;
    check.reason = policy.error.empty()
                       ? "Your administrator turned off cloud features on this computer."
                       : "Cloud features are off because the policy set by your administrator could not be read (" +
                             policy.error + ").";
    return check;
  }
  if (policy.allowedServers.empty()) {
    return check;
  }
  const std::string origin = normalizeOrigin(serverOrigin);
  if (std::find(policy.allowedServers.begin(), policy.allowedServers.end(), origin) == policy.allowedServers.end()) {
    check.decision = PolicyDecision::ServerNotAllowed;
    std::string allowed;
    for (const std::string& server : policy.allowedServers) {
      allowed += (allowed.empty() ? "" : ", ") + server;
    }
    check.reason = "Your administrator allows sign-in only to " + allowed + ".";
  }
  return check;
}

} // namespace nodetool::account
