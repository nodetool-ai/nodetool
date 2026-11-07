#pragma once

#include "kernel/json.h"
#include <chrono>
#include <memory>
#include <optional>
#include <string>
#include <vector>

namespace gr {
// Single kernel thread owns a store. Empty directory opens memory only.
// A nonempty directory is an explicit persistence grant, never inferred from cwd.
class ExecutionState {
public:
  explicit ExecutionState(const std::string& grantedDirectory = {});
  ~ExecutionState();
  ExecutionState(const ExecutionState&) = delete;
  ExecutionState& operator=(const ExecutionState&) = delete;
  static std::string cacheKey(const std::string& user, const std::string& type,
                              const Json& properties);
  std::optional<Json> cached(const std::string& key);
  void cache(const std::string& key, const Json& value, double ttlSeconds = 3600);
  void invalidate(const std::string& key);
  static std::string messageId(const std::string& run, const std::string& node,
                               const std::string& handle, long long seq);
  Json append(const std::string& run, const std::string& node,
              const std::string& handle, const Json& payload,
              const std::optional<std::string>& id = std::nullopt);
  std::vector<Json> pending(const std::string& run, const std::string& node,
                            const std::optional<std::string>& handle = std::nullopt,
                            int limit = 100, long long minSeq = 0);
  void acknowledge(const std::string& id);
  long long maxSequence(const std::string& run, const std::string& node,
                        const std::string& handle);
  int cleanup(const std::string& run, const std::string& node,
              const std::string& handle, long long olderThanSeq);
private:
  struct Impl;
  std::unique_ptr<Impl> impl_;
};
} // namespace gr
