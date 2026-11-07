#pragma once
#include "js/engine.h"
#include <functional>
namespace gr::host {
void installSandbox(js::Engine&, const js::Value&, std::function<bool()> cancelled = {});
}
