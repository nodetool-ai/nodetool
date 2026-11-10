#include "host/image_jobs.h"

#include "host/image.h"
#include "host/image_vips.h"
#include "kernel/job_inputs.h"

#include <algorithm>
#include <cmath>
#include <stdexcept>
#include <string>
#include <utility>

using nodetool::jobs::JobCost;
using nodetool::jobs::JobOutcome;
using nodetool::jobs::JobPayload;
using nodetool::jobs::NativeJob;
using nodetool::jobs::Reservation;
using nodetool::jobs::checkedAdd;
using nodetool::jobs::checkedMul;

namespace gr::host {
namespace {

using Args = const std::vector<js::Value>&;

// The native pixel limit of image_vips.cpp and encodePng.
constexpr uint64_t kMaxPixels = 16777216;
// What a PNG adds to its deflate stream: signature, IHDR, IDAT and IEND
// chunks, plus the zlib header and checksum.
constexpr uint64_t kPngFraming = 128;
// stb_image_write's deflate hash table: 16384 buckets, each an array that
// holds at most 2 * quality (16) pointers before it is halved, so it grows
// to at most 23 slots of 8 bytes plus an 8-byte header.
constexpr uint64_t kStbHashBytes = 16384 * 8 + 16384 * (23 * 8 + 8);
// The most a metadata result holds, its format name included.
constexpr uint64_t kInfoBytes = 64;
// Room for encoder framing in a libvips PNG or WebP beyond its pixel bound.
constexpr uint64_t kVipsFraming = 64 * nodetool::jobs::kKiB;
// The bytes per pixel libvips holds for a decoded input: four 16-bit bands.
constexpr uint64_t kDecodedPixelBytes = 8;

// A job's encoded output: a PNG, or a transform's bytes and their info.
//
// Thread affinity: none. Created on the lane thread, then moved in its
// JobResult to the worker or destroyed where a closed mailbox disposes it.
struct EncodedBytes final : JobPayload {
  explicit EncodedBytes(std::vector<uint8_t> b) : bytes(std::move(b)) {}
  std::vector<uint8_t> bytes;
};
struct MetadataPayload final : JobPayload {
  explicit MetadataPayload(VipsInfo i) : info(std::move(i)) {}
  VipsInfo info;
};
struct DecodedPayload final : JobPayload {
  explicit DecodedPayload(RgbaImage i) : image(std::move(i)) {}
  RgbaImage image;
};
struct TransformPayload final : JobPayload {
  explicit TransformPayload(VipsOutput o) : output(std::move(o)) {}
  VipsOutput output;
};

js::Value infoValue(js::Engine& e, const VipsInfo& info) {
  auto out = e.object();
  e.set(out, "width", e.number(info.width));
  e.set(out, "height", e.number(info.height));
  e.set(out, "channels", e.number(info.channels));
  e.set(out, "format", e.string(info.format));
  e.set(out, "hasAlpha", e.boolean(info.hasAlpha));
  return out;
}

uint32_t dimArg(js::Engine& e, Args args, size_t i) {
  double d = args.size() > i ? e.toNumber(args[i]) : 0;
  if (!(d >= 1 && d <= 65535) || d != std::floor(d)) throw std::runtime_error("__host.image: invalid image size");
  return uint32_t(d);
}

// A view of the argument's bytes, valid until JavaScript runs again.
std::span<const uint8_t> bytesArg(js::Engine& e, Args args, size_t i, const char* fn) {
  if (args.size() <= i || !e.isBytes(args[i])) {
    throw std::runtime_error(std::string("__host.image.") + fn + ": expected bytes");
  }
  return e.viewBytes(args[i]);
}

template <class Area>
uint64_t areaPixels(const Area& area) {
  return std::min(checkedMul(area.width, area.height), kMaxPixels);
}

// The pixels of encoded `bytes`, read from their header without decoding,
// or the pixel limit when the header cannot be read here.
uint64_t encodedPixels(const std::vector<uint8_t>& bytes) {
  try {
    uint32_t w = 0, h = 0;
    imageSize(bytes.data(), bytes.size(), w, h);
    return std::min(checkedMul(w, h), kMaxPixels);
  } catch (const std::runtime_error&) {
    return kMaxPixels;
  }
}

// Encodes a pixel snapshot with stb_image_write.
//
// Thread affinity: the lane thread that runs it, one call at a time.
// Created, and possibly destroyed, on the worker.
class PngJob final : public NativeJob {
public:
  PngJob(std::vector<uint8_t> rgba, uint32_t width, uint32_t height)
      : rgba_(std::move(rgba)), width_(width), height_(height) {}

  JobCost cost() const override { return pngJobCost(width_, height_); }

  JobOutcome run(std::stop_token stop) override {
    if (stop.stop_requested()) return JobOutcome::stopped();
    const uint64_t cap = pngJobCost(width_, height_).outputBytes;
    std::vector<uint8_t> png = encodePng(rgba_.data(), width_, height_, cap);
    if (stop.stop_requested()) return JobOutcome::stopped();
    return JobOutcome::value(std::make_unique<EncodedBytes>(std::move(png)));
  }

private:
  std::vector<uint8_t> rgba_;
  uint32_t width_;
  uint32_t height_;
};

// Decodes a PNG, JPEG or other stb image into straight RGBA.
//
// Thread affinity: as PngJob. The stb decoder state lives inside run().
class DecodeJob final : public NativeJob {
public:
  explicit DecodeJob(std::vector<uint8_t> bytes) : bytes_(std::move(bytes)) {}

  // The output is the decoded RGBA of the header's size. stb decodes into
  // its own buffer of that size, which is copied into the result.
  JobCost cost() const override {
    const uint64_t output = checkedMul(encodedPixels(bytes_), 4);
    return {bytes_.size(), output, output};
  }

  JobOutcome run(std::stop_token stop) override {
    if (stop.stop_requested()) return JobOutcome::stopped();
    RgbaImage image = decodeImage(bytes_.data(), bytes_.size());
    if (stop.stop_requested()) return JobOutcome::stopped();
    return JobOutcome::value(std::make_unique<DecodedPayload>(std::move(image)));
  }

private:
  std::vector<uint8_t> bytes_;
};

// Reads an image header through libvips.
//
// Thread affinity: as PngJob. Every libvips object lives inside run().
class MetadataJob final : public NativeJob {
public:
  MetadataJob(std::vector<uint8_t> bytes, ImageSpec spec) : bytes_(std::move(bytes)), spec_(spec) {}

  // libvips reads only the header, so no decoded pixels are counted.
  JobCost cost() const override { return {checkedAdd(bytes_.size(), sizeof(ImageSpec)), kInfoBytes, 0}; }

  JobOutcome run(std::stop_token stop) override {
    if (stop.stop_requested()) return JobOutcome::stopped();
    VipsInfo info = vipsMetadata(bytes_, spec_);
    if (stop.stop_requested()) return JobOutcome::stopped();
    return JobOutcome::value(std::make_unique<MetadataPayload>(std::move(info)));
  }

private:
  std::vector<uint8_t> bytes_;
  ImageSpec spec_;
};

// Evaluates a sharp chain through libvips.
//
// Thread affinity: as PngJob. Every libvips object lives inside run(), and
// raw pixels reach libvips as a view of `bytes_`, which outlives the call.
class TransformJob final : public NativeJob {
public:
  TransformJob(std::vector<uint8_t> bytes, ImageSpec spec, std::vector<std::vector<uint8_t>> overlays)
      : bytes_(std::move(bytes)), spec_(spec), overlays_(std::move(overlays)) {}

  // The output is bounded by its pixels: the extract area, else the resize,
  // else the raw or created size, else the source's header. Encoded output
  // adds an eighth for framing and the source's own size for the metadata
  // libvips copies. The workspace is libvips's output buffer, copied into
  // the result, and each encoded input decoded in full (random access).
  // Allocations inside libvips beyond those stay outside the ledger
  // (design section 9, R2).
  JobCost cost() const override {
    uint64_t snapshot = checkedAdd(bytes_.size(), sizeof(ImageSpec));
    uint64_t workspace = 0;
    for (const auto& overlay : overlays_) {
      snapshot = checkedAdd(snapshot, overlay.size());
      workspace = checkedAdd(workspace, checkedMul(encodedPixels(overlay), kDecodedPixelBytes));
    }
    const bool encodedSource = !spec_.raw && !spec_.create;
    if (encodedSource) workspace = checkedAdd(workspace, checkedMul(encodedPixels(bytes_), kDecodedPixelBytes));
    uint64_t pixels = 0;
    if (spec_.extract) {
      pixels = areaPixels(*spec_.extract);
    } else if (spec_.resize) {
      pixels = areaPixels(*spec_.resize);
    } else if (spec_.raw) {
      pixels = areaPixels(*spec_.raw);
    } else if (spec_.create) {
      pixels = areaPixels(*spec_.create);
    } else {
      pixels = encodedPixels(bytes_);
    }
    const uint64_t raw = checkedMul(pixels, 4);
    const bool rawOutput = spec_.format == ImageSpec::Format::Raw;
    const uint64_t output =
        rawOutput ? raw : checkedAdd(checkedAdd(raw, raw / 8), checkedAdd(bytes_.size(), kVipsFraming));
    return {snapshot, output, checkedAdd(workspace, output)};
  }

  JobOutcome run(std::stop_token stop) override {
    if (stop.stop_requested()) return JobOutcome::stopped();
    VipsOutput output = vipsTransform(bytes_, spec_, overlays_, cost().outputBytes);
    if (stop.stop_requested()) return JobOutcome::stopped();
    return JobOutcome::value(std::make_unique<TransformPayload>(std::move(output)));
  }

private:
  std::vector<uint8_t> bytes_;
  ImageSpec spec_;
  std::vector<std::vector<uint8_t>> overlays_;
};

// The spec argument, validated into an ImageSpec. Its text is bounded before
// it is copied. With a reservation, the copy, the most the parser allocates
// (kImageSpecParseBytes) and the ImageSpec are charged before they are
// allocated, and only the ImageSpec stays charged once the text is gone.
// Throws std::runtime_error for a spec the adapter cannot evaluate, and
// AdmissionError when the run cannot hold the parse.
ImageSpec specArg(js::Engine& e, const js::Value& value, Reservation* reservation) {
  if (!e.isString(value)) throw std::runtime_error("Image spec must be a JSON string");
  // A UTF-16 unit is at least one UTF-8 byte.
  if (stringBytesBound(e, value, "Image spec") / 3 > kMaxImageSpecBytes) {
    throw std::runtime_error("Image spec exceeds " + std::to_string(kMaxImageSpecBytes) + " bytes");
  }
  if (!reservation) return parseImageSpec(e.toString(value));
  std::string text = snapshotString(e, value, "Image spec", *reservation);
  reservation->reserveSnapshot(kImageSpecParseBytes + sizeof(ImageSpec));
  ImageSpec spec = parseImageSpec(text);
  const uint64_t textBytes = text.size();
  std::string().swap(text);
  reservation->releaseSnapshot(checkedAdd(textBytes, kImageSpecParseBytes));
  return spec;
}

js::Value submitImageJob(AsyncRun& run, std::unique_ptr<NativeJob> job, ResultConverter convert,
                         Reservation reservation) {
  return run.submit(run.executor(), std::move(job), std::move(convert), true, std::move(reservation));
}

}  // namespace

JobCost pngJobCost(uint32_t width, uint32_t height) {
  const uint64_t pixels = checkedMul(width, height);
  const uint64_t rgba = checkedMul(pixels, 4);
  // One filter byte per row before the pixels.
  const uint64_t filtered = checkedMul(height, checkedAdd(checkedMul(width, 4), 1));
  // stb writes one fixed-Huffman block: at most 9 bits per filtered byte,
  // since a match of 3 or more bytes costs less than its literals. It falls
  // back to stored blocks when that is smaller.
  const uint64_t output = checkedAdd(checkedAdd(filtered, filtered / 8), kPngFraming);
  // The RGB copy of an opaque image, the filtered rows, the deflate buffer
  // (doubling, so up to twice the stream), the hash table, stb's PNG before
  // it is appended to the result, and one filter line.
  uint64_t workspace = checkedMul(pixels, 3);
  workspace = checkedAdd(workspace, filtered);
  workspace = checkedAdd(workspace, checkedMul(output, 2));
  workspace = checkedAdd(workspace, kStbHashBytes);
  workspace = checkedAdd(workspace, output);
  workspace = checkedAdd(workspace, checkedMul(width, 4));
  return {rgba, output, workspace};
}

std::unique_ptr<NativeJob> makePngJob(std::vector<uint8_t> rgba, uint32_t width, uint32_t height) {
  return std::make_unique<PngJob>(std::move(rgba), width, height);
}

ResultConverter pngConverter() {
  return [](ResultConversion& conversion) {
    auto* payload = static_cast<EncodedBytes*>(conversion.payload());
    return conversion.adoptBytes(std::move(payload->bytes));
  };
}

std::unique_ptr<NativeJob> makeMetadataJob(std::vector<uint8_t> bytes, ImageSpec spec) {
  return std::make_unique<MetadataJob>(std::move(bytes), spec);
}

std::unique_ptr<NativeJob> makeDecodeJob(std::vector<uint8_t> bytes) {
  return std::make_unique<DecodeJob>(std::move(bytes));
}

ResultConverter decodeConverter() {
  return [](ResultConversion& conversion) {
    auto* payload = static_cast<DecodedPayload*>(conversion.payload());
    js::Engine& e = conversion.engine();
    js::Value out = e.object();
    e.set(out, "rgba", conversion.adoptBytes(std::move(payload->image.pixels)));
    e.set(out, "width", e.number(payload->image.width));
    e.set(out, "height", e.number(payload->image.height));
    return out;
  };
}

ResultConverter metadataConverter() {
  return [](ResultConversion& conversion) {
    conversion.chargeCopy(kInfoBytes);
    return infoValue(conversion.engine(), static_cast<MetadataPayload*>(conversion.payload())->info);
  };
}

std::unique_ptr<NativeJob> makeTransformJob(std::vector<uint8_t> bytes, ImageSpec spec,
                                            std::vector<std::vector<uint8_t>> overlays) {
  return std::make_unique<TransformJob>(std::move(bytes), spec, std::move(overlays));
}

ResultConverter transformConverter() {
  return [](ResultConversion& conversion) {
    auto* payload = static_cast<TransformPayload*>(conversion.payload());
    js::Engine& e = conversion.engine();
    auto out = e.object();
    e.set(out, "data", conversion.adoptBytes(std::move(payload->output.data)));
    conversion.chargeCopy(kInfoBytes);
    e.set(out, "info", infoValue(e, payload->output.info));
    return out;
  };
}

js::Value submitPngJob(AsyncRun& run, std::vector<uint8_t> rgba, uint32_t width, uint32_t height,
                       Reservation reservation) {
  return submitImageJob(run, makePngJob(std::move(rgba), width, height), pngConverter(), std::move(reservation));
}

void installImage(js::Engine& e, const js::Value& object, const HostOptions&) {
  // libvips starts before the process's first pool thread (see
  // vipsStartup). Called here as well for a host with no pool, where this
  // is the first call. When libvips did not start, metadata and transform
  // reject with the reason, and the stb functions keep working.
  vipsStartup();
  auto binding = RunBinding::of(e);
  // Synchronous: a canvas Image decodes when its src is set. Inside a run
  // the pixels reach JavaScript without a copy.
  e.set(object, "decode", e.function("decode", 1, [binding](js::Engine& e, Args a) {
    auto bytes = bytesArg(e, a, 0, "decode");
    RgbaImage image = decodeImage(bytes.data(), bytes.size());
    js::Value out = e.object();
    AsyncRun* run = binding->run();
    e.set(out, "rgba", run ? run->adoptBytes(std::move(image.pixels)) : e.bytes(image.pixels.data(), image.pixels.size()));
    e.set(out, "width", e.number(image.width));
    e.set(out, "height", e.number(image.height));
    return out;
  }));
  // decode on the run's CPU lane, cancellable. Outside a run, decodes at
  // the call and returns the value.
  e.set(object, "decodeAsync", e.function("decodeAsync", 1, [binding](js::Engine& e, Args a) {
    if (a.empty() || !e.isBytes(a[0])) throw std::runtime_error("__host.image.decodeAsync: expected bytes");
    AsyncRun* run = binding->run();
    if (!run) {
      auto bytes = e.viewBytes(a[0]);
      RgbaImage image = decodeImage(bytes.data(), bytes.size());
      js::Value out = e.object();
      e.set(out, "rgba", e.bytes(image.pixels.data(), image.pixels.size()));
      e.set(out, "width", e.number(image.width));
      e.set(out, "height", e.number(image.height));
      return out;
    }
    Reservation reservation = run->reserve();
    auto bytes = snapshotBytes(e, a[0], "Image bytes", reservation);
    return submitImageJob(*run, makeDecodeJob(std::move(bytes)), decodeConverter(), std::move(reservation));
  }));
  e.set(object, "info", e.function("info", 1, [](js::Engine& e, Args a) {
    auto bytes = bytesArg(e, a, 0, "info");
    const EncodedImageInfo info = encodedImageInfo(bytes.data(), bytes.size());
    js::Value out = e.object();
    e.set(out, "width", e.number(info.width));
    e.set(out, "height", e.number(info.height));
    e.set(out, "channels", e.number(info.channels));
    e.set(out, "format", e.string(info.format));
    return out;
  }));
  // Synchronous: canvas toBuffer and Fabric toDataURL need the bytes at the
  // call (design section 5.1).
  e.set(object, "encodePng", e.function("encodePng", 3, [binding](js::Engine& e, Args a) {
    // The sizes are read first: their conversion can run JavaScript.
    uint32_t w = dimArg(e, a, 1), h = dimArg(e, a, 2);
    auto rgba = bytesArg(e, a, 0, "encodePng");
    if (rgba.size() != size_t(w) * h * 4) {
      throw std::runtime_error("__host.image.encodePng: pixel data does not match width * height * 4");
    }
    auto png = encodePng(rgba.data(), w, h);
    if (AsyncRun* run = binding->run()) return run->adoptBytes(std::move(png));
    return e.bytes(png.data(), png.size());
  }));
  e.set(object, "encodePngAsync", e.function("encodePngAsync", 3, [binding](js::Engine& e, Args a) {
    if (a.empty() || !e.isBytes(a[0])) throw std::runtime_error("__host.image.encodePngAsync: expected bytes");
    uint32_t w = dimArg(e, a, 1), h = dimArg(e, a, 2);
    // Checked before the copy, so a mismatched buffer is never copied.
    if (e.byteLength(a[0]) != size_t(w) * h * 4) {
      throw std::runtime_error("__host.image.encodePngAsync: pixel data does not match width * height * 4");
    }
    AsyncRun* run = binding->run();
    if (!run) {
      auto rgba = e.toBytes(a[0]);
      auto png = encodePng(rgba.data(), w, h);
      return e.bytes(png.data(), png.size());
    }
    Reservation reservation = run->reserve();
    auto rgba = snapshotBytes(e, a[0], "Image pixels", reservation);
    return submitPngJob(*run, std::move(rgba), w, h, std::move(reservation));
  }));
  e.set(object, "metadata", e.function("metadata", 2, [binding](js::Engine& e, Args a) {
    if (a.size() < 2 || !e.isBytes(a[0])) throw std::runtime_error("Image metadata requires bytes");
    requireVips();
    AsyncRun* run = binding->run();
    if (!run) return infoValue(e, vipsMetadata(e.toBytes(a[0]), specArg(e, a[1], nullptr)));
    Reservation reservation = run->reserve();
    ImageSpec spec = specArg(e, a[1], &reservation);
    auto bytes = snapshotBytes(e, a[0], "Image bytes", reservation);
    return submitImageJob(*run, makeMetadataJob(std::move(bytes), spec), metadataConverter(),
                          std::move(reservation));
  }));
  e.set(object, "transform", e.function("transform", 2, [binding](js::Engine& e, Args a) {
    if (a.size() < 2 || !e.isBytes(a[0])) throw std::runtime_error("Image transform requires bytes");
    for (size_t i = 2; i < a.size(); ++i) {
      if (!e.isBytes(a[i])) throw std::runtime_error("Composite requires bytes");
    }
    requireVips();
    AsyncRun* run = binding->run();
    if (!run) {
      const ImageSpec spec = specArg(e, a[1], nullptr);
      auto bytes = e.toBytes(a[0]);
      std::vector<std::vector<uint8_t>> overlays;
      for (size_t i = 2; i < a.size(); ++i) overlays.push_back(e.toBytes(a[i]));
      VipsOutput output = vipsTransform(bytes, spec, overlays, UINT64_MAX);
      auto out = e.object();
      e.set(out, "data", e.bytes(output.data.data(), output.data.size()));
      e.set(out, "info", infoValue(e, output.info));
      return out;
    }
    Reservation reservation = run->reserve();
    ImageSpec spec = specArg(e, a[1], &reservation);
    auto bytes = snapshotBytes(e, a[0], "Image bytes", reservation);
    std::vector<std::vector<uint8_t>> overlays;
    for (size_t i = 2; i < a.size(); ++i) overlays.push_back(snapshotBytes(e, a[i], "Composite bytes", reservation));
    return submitImageJob(*run, makeTransformJob(std::move(bytes), spec, std::move(overlays)), transformConverter(),
                          std::move(reservation));
  }));
}

}  // namespace gr::host
