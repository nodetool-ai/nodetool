#pragma once
#include "js/engine.h"
#include "nodetool/graph_runner.h"
#include <functional>
#include <set>
namespace gr::host {
// An embedder must explicitly grant media and the codecs it will permit.
struct MediaOptions {
  bool enabled = false;
  std::set<std::string> encoders;
  size_t maxPixels = 16777216;
  size_t maxFrames = 1000000;
  size_t maxBytes = 512 * 1024 * 1024;
  size_t maxSessions = 16;
  std::function<bool()> cancelled;
};
void installMedia(js::Engine &, const js::Value &, const HostOptions &,
                  const MediaOptions & = {});
} // namespace gr::host
