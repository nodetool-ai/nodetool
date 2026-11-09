// The libvips half of the image capability: the sharp chains that
// guest/host/sharp.mjs builds, evaluated natively. No libvips type leaves
// image_vips.cpp. Each call creates, evaluates and destroys its own image
// graph, so no VipsImage crosses threads (docs/plans/
// graph-runner-async-host-evidence.md, Q1.4).
//
// Thread affinity: vipsStartup() is thread-safe. The other functions are
// safe on any thread, concurrently with each other, once vipsStartup()
// reported success.
#pragma once

#include "host/image_spec.h"

#include <cstdint>
#include <functional>
#include <optional>
#include <string>
#include <vector>

namespace gr::host {

// Starts libvips and empties its operation cache, on the first call in the
// process only, and returns the outcome: empty when libvips started, or why
// it did not. Later calls return the same outcome and never start libvips
// again, since pool threads may exist by then (Q1.6). The first pool thread
// starts after it: processJobDisposer() calls it before it creates the job
// disposer, which every lane needs. Never calls vips_concurrency_set or
// enables the kill hook.
//
// `start` replaces vips_init on the first call, for tests. It returns
// whether libvips started, and sets its argument to the reason when not.
// An exception it throws is recorded as the failure, like a false return.
const std::optional<std::string>& vipsStartup(const std::function<bool(std::string&)>& start = {});

// Throws std::runtime_error naming vipsStartup()'s failure, if any.
void requireVips();

struct VipsInfo {
  int width = 0;
  int height = 0;
  int channels = 0;
  bool hasAlpha = false;
  // "raw", "png", "jpeg", "webp", "gif" or "unknown" for metadata, and the
  // output format for a transform.
  std::string format;
};

struct VipsOutput {
  std::vector<uint8_t> data;
  VipsInfo info;
};

// The image `spec` describes: raw pixels or a created image when it says
// so, otherwise `bytes` decoded by an allowed in-memory raster loader.
// Throws std::runtime_error, also when libvips did not start. libvips keeps
// one error buffer for every thread, so when two calls fail at once a
// message can belong to the other call (Q1.6).
VipsInfo vipsMetadata(const std::vector<uint8_t>& bytes, const ImageSpec& spec);

// Applies `spec` (greyscale, resize, extract, the overlays composited over
// the centre, format, alpha) and encodes the result. Fails, after freeing
// libvips's buffer, when the encoded result holds more than `maxBytes`.
// Throws std::runtime_error like vipsMetadata.
VipsOutput vipsTransform(const std::vector<uint8_t>& bytes, const ImageSpec& spec,
                         const std::vector<std::vector<uint8_t>>& overlays, uint64_t maxBytes);

}  // namespace gr::host
