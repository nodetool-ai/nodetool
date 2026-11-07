#pragma once
#include "js/engine.h"
#include "nodetool/graph_runner.h"
namespace gr::host {
// Headless Cairo/Pango surfaces. File reads remain in the granted files
// capability.
void installCanvas(js::Engine&, const js::Value&, const HostOptions&);
}  // namespace gr::host
