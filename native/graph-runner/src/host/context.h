#pragma once
#include "js/engine.h"
#include "nodetool/context_options.h"
namespace gr::host {
void installContext(js::Engine&, const js::Value&, const ContextOptions&);
}
