#include "browser/Bridge.h"
#include "document/Document.h"
#include "service/Dispatcher.h"
#include <cstdlib>
#include <exception>
#include <iostream>
#include <new>
#include <utility>
using nodetool::game::Json;
namespace {
bool failNextAllocation = false;
void require(bool value, const char *message) { if (!value) { throw std::runtime_error(message); } }
Json dispatch(std::uint32_t handle, const Json &request) {
  const auto text = request.dump();
  require(ng_dispatch(handle, text.data(), text.size()) >= 0, "dispatch handle");
  return Json::parse(std::string_view(ng_response_pointer(handle), ng_response_length(handle)));
}
}
void *operator new(std::size_t size) {
  if (std::exchange(failNextAllocation, false)) { throw std::bad_alloc(); }
  if (auto *memory = std::malloc(size == 0 ? 1 : size)) { return memory; }
  throw std::bad_alloc();
}
void operator delete(void *memory) noexcept { std::free(memory); }
void operator delete(void *memory, std::size_t) noexcept { std::free(memory); }
int main() {
  try {
    {
      nodetool::game::Dispatcher dispatcher;
      unsigned sequence = 0;
      auto request = [&](const std::string &operation) { return Json{{"protocolVersion", 1}, {"requestId", "recovery-" + std::to_string(++sequence)}, {"operation", operation}, {"sessionId", "fault"}}; };
      auto open = request("open");
      open["document"] = {{"engine", "native-cpp-1"}, {"schemaVersion", 5}, {"dimension", "2d"}, {"id", "fault"}, {"title", "Fault"}, {"initialSceneId", "scene"}, {"scenes", Json::array({{{"id", "scene"}, {"entities", Json::array({{{"id", "actor"}}})}}})}};
      require(dispatcher.dispatch(open).at("status") == "ok", "recovery test open");
      require(dispatcher.dispatch(request("start")).at("status") == "ok", "recovery test start");
      const auto cancellation = std::make_exception_ptr(nodetool::game::Error("cancelled", "cancel with failed allocation during recovery"));
      bool armed = true;
      nodetool::game::setCancellationCheck([&] {
        if (std::exchange(armed, false)) {
          failNextAllocation = true;
          std::rethrow_exception(cancellation);
        }
      });
      const auto failed = dispatcher.dispatch(request("step"));
      nodetool::game::setCancellationCheck({});
      require(!failNextAllocation && failed.at("error").at("code") == "session_faulted", "Actual recovery allocation failure faults session");
      for (const auto *operation : {"snapshot", "inspect", "frame", "step", "restore", "reload"}) {
        bool missing = false;
        try { dispatcher.dispatch(request(operation)); }
        catch (const nodetool::game::Error &error) { missing = error.code == "not_found"; }
        require(missing, "Irrecoverable session is evicted before any later access");
      }
      open["requestId"] = "recovery-reopen";
      require(dispatcher.dispatch(open).at("status") == "ok", "Eviction releases document identity for fresh session");
    }
    {
      unsigned calls = 0;
      nodetool::game::setCancellationCheck([&] { ++calls; throw nodetool::game::Error("cancelled", "installed callback"); });
      {
        const nodetool::game::CancellationRecoveryScope outer;
        try { const nodetool::game::CancellationRecoveryScope inner; throw std::runtime_error("nested recovery"); } catch (const std::runtime_error &) {}
        nodetool::game::checkCancellation();
      }
      bool restored = false;
      try { nodetool::game::checkCancellation(); } catch (const nodetool::game::Error &) { restored = true; }
      nodetool::game::setCancellationCheck({});
      require(restored && calls == 1, "Nested recovery exception restores installed cancellation callback");
    }
    auto a = ng_create(), b = ng_create();
    require(a && b && a != b, "independent contexts");
    for (const auto dimension : {"2d", "3d"}) {
      const auto id = std::string(dimension);
      Json document{{"engine", "native-cpp-1"}, {"schemaVersion", id == "2d" ? 5 : 4}, {"id", id}, {"title", id}, {"initialSceneId", "scene"}, {"scenes", Json::array({{{"id", "scene"}, {"entities", Json::array({{{"id", "box"}}})}}})}};
      document["dimension"] = id;
      auto request = [&](std::string operation) { return Json{{"protocolVersion", 1}, {"requestId", id + operation}, {"operation", operation}, {"sessionId", id}}; };
      auto open = request("open"); open["document"] = document;
      require(dispatch(a, open).at("status") == "ok", "open dimension");
      require(dispatch(a, open) == dispatch(a, open), "idempotent retry");
      require(dispatch(a, request("start")).at("status") == "ok", "start dimension");
      auto snapshot = dispatch(a, request("snapshot")).at("result");
      require(dispatch(a, request("step")).at("status") == "ok", "step dimension");
      auto restore = request("restore"); restore["snapshot"] = snapshot;
      require(dispatch(a, restore).at("status") == "ok", "same session restore");
      require(dispatch(b, open).at("status") == "ok", "foreign open");
      require(dispatch(b, request("start")).at("status") == "ok", "foreign start");
      require(dispatch(b, restore).at("status") == "error", "foreign snapshot rejected");
      restore["requestId"] = id + "tamper";
      restore["snapshot"]["tick"] = 999;
      require(dispatch(a, restore).at("status") == "error", "tampered snapshot rejected");
      require(dispatch(a, request("close")).at("status") == "ok", "close dimension");
    }
    const std::string malformed = "{\"x\":\"\xff\"}";
    require(ng_dispatch(a, malformed.data(), malformed.size()) == 1, "invalid UTF8 rejected");
    require(ng_dispatch(a, "x", 16 * 1024 * 1024 + 1) == 1, "oversize rejected before read");
    ng_destroy(a);
    require(ng_dispatch(a, "{}", 2) == -1 && !ng_response_pointer(a) && ng_response_length(a) == 0, "stale handle rejected");
    require(dispatch(b, {{"protocolVersion", 1}, {"requestId", "hello"}, {"operation", "hello"}}).at("status") == "ok", "second context survives");
    ng_destroy(b);
    std::cout << "Bridge conformance passed for 2D and 3D\n";
  } catch (const std::exception &error) { std::cerr << error.what() << '\n'; return 1; }
}
