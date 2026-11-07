#pragma once
#include <cstddef>
#include <functional>
#include <map>
#include <string>
namespace gr::host {
// JSON operations are exact-name grants. Callback implementations must cooperate
// with cancelled() during blocking work. No process-wide service is discovered.
struct ContextOptions {
  using Callback = std::function<std::string(const std::string&)>;
  std::map<std::string, Callback> operations;
  std::function<bool()> cancelled;
  std::string modelOptionsJson = "{}";
  std::string userId = "default";
  std::string environmentJson = "{}";
  // Authorized SandboxModuleResolution; no filesystem package discovery.
  std::string sandboxModuleResolutionJson = "null";
  // Array of InjectedTool metadata; each entry also needs a tool:<name> grant.
  std::string toolDefinitionsJson = "[]";
  // Explicit read grant for native OCR language models. Empty disables OCR.
  std::string ocrDataDirectory;
  size_t maxPayloadBytes = 1024 * 1024;
  size_t maxCalls = 10000;
};
}
