// The data folder the native apps share, computed the way the Qt apps'
// sharedDataDir() computes it, without Qt: `NodeTool/native` under the
// writable generic data location of QStandardPaths.
#pragma once

#include <filesystem>
#include <functional>
#include <optional>
#include <string>

namespace nodetool::account_helper {

// `getenv` is injected so tests can set the variables. Nullopt when the
// home or local application data folder is unknown.
std::optional<std::filesystem::path> sharedDataDir(
    const std::function<std::optional<std::string>(const char*)>& getenv);

// The same, with the process environment and, on Windows, the known folder.
std::optional<std::filesystem::path> sharedDataDir();

} // namespace nodetool::account_helper
