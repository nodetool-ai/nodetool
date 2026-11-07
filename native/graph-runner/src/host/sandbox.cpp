#include "host/sandbox.h"
#include "host/sandbox_session.h"
#include "host/sandbox_wasm.h"

namespace gr::host {
void installSandbox(js::Engine& engine, const js::Value& object, std::function<bool()> cancelled) {
  installSandboxSessions(engine, object, cancelled);
  installSandboxWasm(engine, object, std::move(cancelled));
}
}
