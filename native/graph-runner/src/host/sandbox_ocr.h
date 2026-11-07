#pragma once
#include "js/engine.h"
#include <functional>
#include <string>
namespace gr::host {
void installSandboxOcr(js::Engine &, const js::Value &, const std::string &,
                       std::function<bool()>);
}
