#pragma once
#include "js/engine.h"
#include <functional>
namespace gr::host {
void installWebAssembly(js::Engine&, const js::Value&, std::function<bool()> cancelled = {});
}
