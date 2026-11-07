#pragma once
#include "js/engine.h"
#include <functional>
namespace gr::host {
void installSandboxSessions(js::Engine&, const js::Value&, std::function<bool()>);
}
