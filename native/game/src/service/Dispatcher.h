#pragma once
#include "document/Document.h"
#include <memory>
namespace nodetool::game {
inline constexpr std::uint32_t MaxRequestBytes = 16 * 1024 * 1024;
Json failure(const std::string &requestId, const std::string &code,
             const std::string &message, const std::string &path = "");
class Dispatcher {
public:
  Dispatcher();
  ~Dispatcher();
  Json dispatch(const Json &request);
private:
  class Impl;
  std::unique_ptr<Impl> impl_;
};
}
