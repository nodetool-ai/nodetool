// The native media host (docs/plans/graph-runner-async-host.md, sections
// 4.8 and 4.9). Readers and encoders are sessions: each is a
// ResourceControl whose body owns its libav contexts, so the operations of
// one session run one at a time, in submission order, on the run's CPU lane.
// probe, packetTimes and muxAudio are one-shot jobs on that lane that open,
// use and free their contexts within one run. Every operation returns a
// promise. hasEncoder and openEncoder stay synchronous: they only check the
// grant and register a session.
#pragma once
#include "js/engine.h"
#include "nodetool/graph_runner.h"
#include <functional>
#include <set>
#include <stop_token>
#include <string_view>
namespace gr::host {
// Test seams of the media host. Production leaves them empty. They run on
// the lane thread of the operation that reaches them, so they must be
// thread-safe and must not touch the engine.
struct MediaTestHooks {
  // Reads the stop flags of the operation's session or job: what its next
  // stop check and the libraries' interrupt callbacks will see.
  using Stopped = std::function<bool()>;
  // At the start of every session operation and one-shot job, before it
  // calls a library, with the operation's name and its stop.
  std::function<void(std::string_view operation, const std::stop_token& stop,
                     const Stopped& stopped)>
      started;
  // At every stop check between packets and frames, before the check.
  std::function<void(const Stopped& stopped)> checkpoint;
  // When a write reaches an encoder, before it touches the codec.
  std::function<void()> encoderWrite;
};
// An embedder must explicitly grant media and the codecs it will permit.
struct MediaOptions {
  bool enabled = false;
  std::set<std::string> encoders;
  size_t maxPixels = 16777216;
  size_t maxFrames = 1000000;
  size_t maxBytes = 512 * 1024 * 1024;
  size_t maxSessions = 16;
  // Read on the worker only, when a host function is called.
  std::function<bool()> cancelled;
  MediaTestHooks hooks;
};
void installMedia(js::Engine &, const js::Value &, const HostOptions &,
                  const MediaOptions & = {});
} // namespace gr::host
