#include "pipe_transport.h"

#include <chrono>

namespace nodetool::account_helper {

namespace {
// How often a waiting request looks at its cancel flag.
constexpr std::chrono::milliseconds kCancelPoll{50};
} // namespace

account::HttpResponse PipeTransport::send(const account::HttpRequest& request) {
  if (request.cancel && request.cancel->cancelled()) {
    return {};
  }
  uint64_t id = 0;
  {
    const std::lock_guard lock(mutex_);
    if (closed_) {
      return {};
    }
    id = nextId_++;
    waiting_.emplace(id, std::nullopt);
  }
  nlohmann::json headers = nlohmann::json::array();
  for (const auto& [name, value] : request.headers) {
    headers.push_back({name, value});
  }
  emit_({{"type", "http"},
         {"id", id},
         {"method", request.method},
         {"url", request.url},
         {"headers", headers},
         {"body", request.body},
         {"timeoutMs", request.timeout.count()},
         {"requiredOrigin", request.requiredOrigin}});

  const auto deadline = std::chrono::steady_clock::now() + request.timeout;
  std::unique_lock lock(mutex_);
  for (;;) {
    auto it = waiting_.find(id);
    if (it->second) {
      account::HttpResponse response = std::move(*it->second);
      waiting_.erase(it);
      return response;
    }
    const bool cancelled = request.cancel && request.cancel->cancelled();
    if (closed_ || cancelled || std::chrono::steady_clock::now() >= deadline) {
      waiting_.erase(it);
      const bool tellMain = !closed_;
      lock.unlock();
      if (tellMain) {
        emit_({{"type", "httpCancel"}, {"id", id}});
      }
      return {};
    }
    answered_.wait_for(lock, kCancelPoll);
  }
}

void PipeTransport::deliver(uint64_t id, account::HttpResponse response) {
  {
    const std::lock_guard lock(mutex_);
    auto it = waiting_.find(id);
    if (it == waiting_.end()) {
      return;
    }
    it->second = std::move(response);
  }
  answered_.notify_all();
}

void PipeTransport::close() {
  {
    const std::lock_guard lock(mutex_);
    closed_ = true;
  }
  answered_.notify_all();
}

} // namespace nodetool::account_helper
