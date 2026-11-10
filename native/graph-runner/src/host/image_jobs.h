// The native jobs of the image capability and of canvas encode
// (docs/plans/graph-runner-async-host.md, sections 4.7, 4.8 and 5.1).
//
// A host function copies the job's inputs on the worker after reserving
// their bytes, then submits the job to the bound run's CPU lane as a
// cancellable job. The job owns its copies: source bytes, overlay bytes, the
// validated ImageSpec (never a JSON tree) or a pixel snapshot. It creates, evaluates and destroys every
// libvips object inside run(), so no VipsImage crosses threads, and it never
// touches the engine, cairo or pango. Its result payload owns the output
// bytes, which the worker hands to JavaScript without a copy.
//
// A job checks its stop token before and after its library call. libvips
// and stb cannot be interrupted, so a job asked to stop during the call
// finishes it, then discards its output (section 4.9: the kill hook stays
// off).
#pragma once

#include "host/image_vips.h"
#include "kernel/async_jobs.h"

#include <cstdint>
#include <memory>
#include <vector>

namespace gr::host {

// What encoding a width x height PNG holds at most: the RGBA snapshot, the
// PNG, and stb_image_write's buffers (section 4.7). Throws AdmissionError on
// overflow.
nodetool::jobs::JobCost pngJobCost(uint32_t width, uint32_t height);

// Encodes `rgba`, width * height * 4 straight-alpha bytes, as a PNG.
std::unique_ptr<nodetool::jobs::NativeJob> makePngJob(std::vector<uint8_t> rgba, uint32_t width, uint32_t height);
// Resolves with a Uint8Array of the PNG.
ResultConverter pngConverter();

// Decodes encoded image `bytes` into straight RGBA.
std::unique_ptr<nodetool::jobs::NativeJob> makeDecodeJob(std::vector<uint8_t> bytes);
// Resolves with {rgba: Uint8Array, width, height}.
ResultConverter decodeConverter();

// Reads the size and format of the image `spec` describes in `bytes`.
std::unique_ptr<nodetool::jobs::NativeJob> makeMetadataJob(std::vector<uint8_t> bytes, ImageSpec spec);
// Resolves with {width, height, channels, format, hasAlpha}.
ResultConverter metadataConverter();

// Applies `spec` to `bytes` with `overlays` composited over it.
std::unique_ptr<nodetool::jobs::NativeJob> makeTransformJob(std::vector<uint8_t> bytes, ImageSpec spec,
                                                            std::vector<std::vector<uint8_t>> overlays);
// Resolves with {data: Uint8Array, info}.
ResultConverter transformConverter();

// Worker. Submits a PNG job for `rgba` to `run`'s CPU lane, cancellable.
// `reservation` already holds the snapshot's bytes. Returns its promise.
js::Value submitPngJob(AsyncRun& run, std::vector<uint8_t> rgba, uint32_t width, uint32_t height,
                       nodetool::jobs::Reservation reservation);

}  // namespace gr::host
