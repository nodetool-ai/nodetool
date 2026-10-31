#include "Bridge.h"
#include "Model.h"
#include "service/Dispatcher.h"
#include <map>
#include <limits>
#include <string_view>
#ifdef __EMSCRIPTEN__
#include <emscripten/heap.h>
#ifdef __EMSCRIPTEN_PTHREADS__
#error "The native game browser bridge requires a single-threaded build"
#endif
#endif
namespace {
using namespace nodetool::game;
struct Context {
  Dispatcher dispatcher;
  std::string response;
  bool emergency = false;
  Context() { response.reserve(4096); }
};
constexpr std::string_view EmergencyResponse = R"({"protocolVersion":1,"requestId":"","status":"error","error":{"code":"resource_limit","message":"Interface memory budget exhausted","path":""}})";
std::map<std::uint32_t, std::unique_ptr<Context>> contexts;
std::uint32_t nextHandle = 1;
bool dispatching = false;
struct DispatchGuard {
  DispatchGuard() { dispatching = true; }
  ~DispatchGuard() { dispatching = false; }
};
}
extern "C" {
std::uint32_t ng_create() {
  if (dispatching) { return 0; }
  try {
    if (contexts.size() >= 8 || nextHandle == 0) { return 0; }
    auto context = std::make_unique<Context>();
    const auto handle = nextHandle++;
    contexts.emplace(handle, std::move(context));
    return handle;
  } catch (...) { return 0; }
}
int ng_dispatch(std::uint32_t handle, const char *request, std::uint32_t length) {
  if (dispatching) { return -2; }
  DispatchGuard guard;
  const auto found = contexts.find(handle);
  if (found == contexts.end()) { return -1; }
  auto &context = *found->second;
  context.emergency = false;
  std::string requestId;
  const auto reject = [&](const auto &makeResponse) noexcept {
    try { context.response = makeResponse().dump(); }
    catch (...) { context.emergency = true; }
  };
  try {
    if (!request || length == 0 || length > MaxRequestBytes) {
      throw Error("resource_limit", "Request length exceeds interface limits");
    }
#ifdef __EMSCRIPTEN__
    const auto pointer = reinterpret_cast<std::uintptr_t>(request);
    const auto heapBytes = emscripten_get_heap_size();
    if (pointer > heapBytes || length > heapBytes - pointer) {
      throw Error("protocol_error", "Request points outside interface memory");
    }
#endif
    std::size_t depth = 0;
    bool quoted = false, escaped = false;
    for (const char value : std::string_view(request, length)) {
      if (quoted) {
        if (escaped) { escaped = false; }
        else if (value == '\\') { escaped = true; }
        else if (value == '"') { quoted = false; }
      } else if (value == '"') { quoted = true; }
      else if (value == '{' || value == '[') {
        if (++depth > 128) { throw Error("resource_limit", "JSON nesting exceeds interface limits"); }
      } else if ((value == '}' || value == ']') && depth > 0) { --depth; }
    }
    const auto envelope = Json::parse(std::string_view(request, length));
    if (!envelope.is_object()) { throw Error("protocol_error", "Request must be an object"); }
    if (envelope.contains("requestId") && envelope["requestId"].is_string()) {
      requestId = envelope["requestId"].get<std::string>();
    }
    if (requestId.empty() || requestId.size() > 128 || envelope.value("protocolVersion", 0) != 1) {
      throw Error("protocol_error", "Expected protocolVersion 1 and bounded requestId");
    }
    auto result = envelope.value("operation", std::string{}) == "prepareModel"
      ? Json{{"protocolVersion", 1}, {"requestId", requestId}, {"status", "ok"}, {"result", prepareBrowserModel(envelope)}}
      : context.dispatcher.dispatch(envelope);
    auto response = result.dump();
    if (response.size() > MaxRequestBytes) { throw Error("resource_limit", "Response exceeds interface limits"); }
    context.response = std::move(response);
    return Json::parse(context.response).at("status") == "ok" ? 0 : 1;
  } catch (const Error &error) {
    reject([&] {
      auto response = failure(requestId, error.code, error.what(), error.path);
      if (!error.details.empty()) { response["error"]["details"] = error.details; }
      return response;
    });
  } catch (const Json::exception &) {
    reject([&] { return failure(requestId, "protocol_error", "Malformed UTF-8 JSON request payload"); });
  } catch (const std::bad_alloc &) {
    context.emergency = true;
  } catch (const std::exception &) {
    reject([&] { return failure(requestId, "worker_error", "Native browser operation failed"); });
  } catch (...) {
    reject([&] { return failure(requestId, "worker_error", "Native browser operation failed"); });
  }
  return 1;
}
const char *ng_response_pointer(std::uint32_t handle) {
  const auto found = contexts.find(handle);
  return found == contexts.end() ? nullptr : found->second->emergency ? EmergencyResponse.data() : found->second->response.data();
}
std::uint32_t ng_response_length(std::uint32_t handle) {
  const auto found = contexts.find(handle);
  return found == contexts.end() ? 0 : static_cast<std::uint32_t>(found->second->emergency ? EmergencyResponse.size() : found->second->response.size());
}
void ng_destroy(std::uint32_t handle) {
  if (!dispatching) { contexts.erase(handle); }
}
}
