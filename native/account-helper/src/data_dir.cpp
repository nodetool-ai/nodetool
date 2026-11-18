#include "data_dir.h"

#include <cstdlib>

#ifdef _WIN32
#include <shlobj.h>
#include <windows.h>
#endif

namespace nodetool::account_helper {

namespace {
std::filesystem::path appendNative(const std::filesystem::path& base) { return base / "NodeTool" / "native"; }
} // namespace

std::optional<std::filesystem::path> sharedDataDir(
    const std::function<std::optional<std::string>(const char*)>& getenv) {
#if defined(__APPLE__)
  // QStandardPaths: ~/Library/Application Support.
  const auto home = getenv("HOME");
  if (!home || home->empty()) {
    return std::nullopt;
  }
  return appendNative(std::filesystem::path(*home) / "Library" / "Application Support");
#elif defined(_WIN32)
  // QStandardPaths: FOLDERID_LocalAppData. The environment variable is the
  // fallback, and what tests set.
  const auto local = getenv("LOCALAPPDATA");
  if (!local || local->empty()) {
    return std::nullopt;
  }
  return appendNative(std::filesystem::path(*local));
#else
  // QStandardPaths: $XDG_DATA_HOME when it is an absolute path, otherwise
  // ~/.local/share.
  const auto xdg = getenv("XDG_DATA_HOME");
  if (xdg && !xdg->empty() && std::filesystem::path(*xdg).is_absolute()) {
    return appendNative(std::filesystem::path(*xdg));
  }
  const auto home = getenv("HOME");
  if (!home || home->empty()) {
    return std::nullopt;
  }
  return appendNative(std::filesystem::path(*home) / ".local" / "share");
#endif
}

std::optional<std::filesystem::path> sharedDataDir() {
#ifdef _WIN32
  PWSTR folder = nullptr;
  if (SUCCEEDED(SHGetKnownFolderPath(FOLDERID_LocalAppData, KF_FLAG_DONT_VERIFY, nullptr, &folder))) {
    std::filesystem::path base(folder);
    CoTaskMemFree(folder);
    return appendNative(base);
  }
  CoTaskMemFree(folder);
#endif
  return sharedDataDir([](const char* name) -> std::optional<std::string> {
    const char* value = std::getenv(name);
    if (value == nullptr) {
      return std::nullopt;
    }
    return std::string(value);
  });
}

} // namespace nodetool::account_helper
