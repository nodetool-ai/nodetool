// Tests for texture sharing (src/host/gpu_share.h): the frame ring's state
// machine, the native handle, and the device's shareable textures: writes,
// publish and reclaim, lifetime past releaseRun(), and the refusals.
//
//   gr_gpu_share_tests [--require-sharing | --no-gpu]
//
// Device cases need a WebGPU adapter. ctest points the Vulkan loader at
// lavapipe when it is installed. With --require-sharing the run fails when
// the device cannot share textures. Without it, a device that cannot share
// must say why and refuse every sharing call. With --no-gpu, for a build
// without GPU support, there must be no device and a reason.
#include "host/gpu_catalog.h"
#include "host/gpu_device.h"
#include "host/gpu_share.h"

#include <cstdio>
#include <cstring>
#include <string>
#include <thread>
#include <vector>

#ifndef _WIN32
#include <fcntl.h>
#include <unistd.h>
#endif

namespace {

struct Counts {
  int failures = 0;
  int checks = 0;
};

#define CHECK(cond)                                                                          \
  do {                                                                                       \
    ++counts.checks;                                                                         \
    if (!(cond)) {                                                                           \
      ++counts.failures;                                                                     \
      std::fprintf(stderr, "%s:%d: CHECK failed: %s\n", __FILE__, __LINE__, #cond);          \
    }                                                                                        \
  } while (0)

#define CHECK_THROWS(expr)                                                                   \
  do {                                                                                       \
    ++counts.checks;                                                                         \
    bool threw = false;                                                                      \
    try {                                                                                    \
      expr;                                                                                  \
    } catch (const std::exception&) {                                                        \
      threw = true;                                                                          \
    }                                                                                        \
    if (!threw) {                                                                            \
      ++counts.failures;                                                                     \
      std::fprintf(stderr, "%s:%d: expected a throw: %s\n", __FILE__, __LINE__, #expr);      \
    }                                                                                        \
  } while (0)

namespace gpu = gr::host::gpu;
using gr::Json;
using Ring = gpu::FrameRing;

// A SharedTexture with no GPU behind it.
class FakeTexture final : public gpu::SharedTexture {
public:
  explicit FakeTexture(uint64_t id) : id_(id) {}
  uint64_t id() const override { return id_; }
  const gpu::ShareDescriptor& descriptor() const override { return descriptor_; }
  std::chrono::nanoseconds publish() override { return std::chrono::nanoseconds(5); }
  void reclaim() override {}
  bool published() const override { return false; }
  gpu::NativeShareHandle open(std::string&) const override { return {}; }
  uint64_t cpuTransfers() const override { return transfers; }
  uint64_t transfers = 0;

private:
  uint64_t id_;
  gpu::ShareDescriptor descriptor_;
};

size_t write(Ring& ring, Counts& counts, uint64_t textureId) {
  auto slot = ring.beginWrite();
  CHECK(slot.has_value());
  if (!slot) return 0;
  if (!ring.texture(*slot)) ring.setTexture(*slot, std::make_shared<FakeTexture>(textureId));
  ring.publish(*slot, std::chrono::nanoseconds(1000));
  return *slot;
}

void ringStates(Counts& counts) {
  CHECK_THROWS(Ring(1));
  Ring ring(3);
  CHECK(ring.capacity() == 3);
  CHECK(!ring.present().has_value());
  CHECK(ring.stats().framesReused == 1);

  // Free -> Writing -> Ready -> Displayed.
  const size_t a = write(ring, counts, 1);
  CHECK(ring.state(a) == Ring::State::Ready);
  auto shown = ring.present();
  CHECK(shown && shown->slot == a && shown->texture && shown->texture->id() == 1);
  CHECK(ring.state(a) == Ring::State::Displayed);

  CHECK(ring.waitConsumed(std::chrono::milliseconds(1)));

  // A second frame: the first becomes Retiring and cannot be written.
  const size_t b = write(ring, counts, 2);
  CHECK(b != a);
  auto next = ring.present();
  CHECK(next && next->slot == b && next->sequence > shown->sequence);
  CHECK(ring.state(a) == Ring::State::Retiring);
  CHECK(ring.state(b) == Ring::State::Displayed);

  // One slot is left. A frame published over an undisplayed one replaces it.
  const size_t c = write(ring, counts, 3);
  CHECK(c != a && c != b);
  CHECK(!ring.waitConsumed(std::chrono::milliseconds(1)));  // a frame is waiting
  CHECK(!ring.beginWrite().has_value());  // Displayed, Retiring, Ready: none free
  CHECK(ring.stats().framesDropped == 1);
  CHECK(!ring.waitWritable(std::chrono::milliseconds(1)));

  // The consumer finished with the retiring slot: it is writable again.
  ring.retire(a);
  CHECK(ring.state(a) == Ring::State::Free);
  CHECK(ring.waitWritable(std::chrono::milliseconds(1)));
  const size_t d = write(ring, counts, 4);
  CHECK(d == a);
  CHECK(ring.state(c) == Ring::State::Free);  // replaced before display
  CHECK(ring.stats().framesReplaced == 1);

  // Operations in the wrong state change nothing and are counted.
  const uint64_t before = ring.stats().ownershipFailures;
  ring.retire(b);  // Displayed, not Retiring
  CHECK(ring.state(b) == Ring::State::Displayed);
  CHECK_THROWS(ring.publish(c, std::chrono::nanoseconds(0)));  // Free, not Writing
  CHECK_THROWS(ring.setTexture(b, nullptr));
  ring.abandon(b);
  CHECK(ring.state(b) == Ring::State::Displayed);
  CHECK(ring.stats().ownershipFailures == before + 4);

  // A frame the consumer cannot open returns its slot. The frame shown
  // before it is released by the consumer as usual.
  auto unopened = ring.present();
  CHECK(unopened && unopened->slot == d);
  CHECK(ring.state(b) == Ring::State::Retiring);
  ring.reject(d);
  CHECK(ring.state(d) == Ring::State::Free);
  ring.retire(b);
  CHECK(ring.state(b) == Ring::State::Free);
  const size_t e = write(ring, counts, 5);
  CHECK(ring.present().has_value());
  CHECK(ring.state(e) == Ring::State::Displayed);
  const size_t f = write(ring, counts, 6);

  // A cancelled write returns its slot.
  auto cancelled = ring.beginWrite();
  CHECK(cancelled && *cancelled == c);
  ring.abandon(*cancelled);
  CHECK(ring.state(c) == Ring::State::Free);

  // The consumer loses its GPU state: what it held is free, a Ready frame stays.
  ring.consumerReset();
  CHECK(ring.state(e) == Ring::State::Free);
  CHECK(ring.state(f) == Ring::State::Ready);

  gpu::ShareStats stats = ring.stats();
  CHECK(stats.framesPublished == 6);
  CHECK(stats.framesPresented == 4);
  CHECK(stats.resourcesCreated == 3);
  CHECK(stats.syncWaitNanosTotal == 6000 && stats.syncWaitNanosMax == 1000);
  CHECK(stats.gpuToCpuTransfers == 0 && stats.gpuToGpuCopies == 0);

  // CPU transfers of a slot's texture are reported, and kept when the
  // texture is replaced.
  auto fake = std::make_shared<FakeTexture>(9);
  fake->transfers = 2;
  auto slot = ring.beginWrite();
  CHECK(slot.has_value());
  ring.setTexture(*slot, fake);
  CHECK(ring.stats().gpuToCpuTransfers == 2);
  const uint64_t retired = ring.stats().resourcesRetired;
  ring.setTexture(*slot, std::make_shared<FakeTexture>(10));
  CHECK(ring.stats().gpuToCpuTransfers == 2);
  CHECK(ring.stats().resourcesRetired == retired + 1);
  ring.abandon(*slot);

  ring.close();
  CHECK(ring.closed());
  CHECK(!ring.beginWrite().has_value());
  CHECK(!ring.present().has_value());
}

// A waiting producer wakes when the consumer retires a slot.
void ringWakesProducer(Counts& counts) {
  Ring ring(2);
  const size_t a = write(ring, counts, 1);
  CHECK(ring.present().has_value());
  const size_t b = write(ring, counts, 2);
  CHECK(ring.present().has_value());
  CHECK(ring.state(a) == Ring::State::Retiring);
  CHECK(ring.state(b) == Ring::State::Displayed);
  CHECK(!ring.waitWritable(std::chrono::milliseconds(1)));
  bool writable = false;
  std::thread producer([&] { writable = ring.waitWritable(std::chrono::seconds(10)); });
  std::this_thread::sleep_for(std::chrono::milliseconds(20));
  ring.retire(a);
  producer.join();
  CHECK(writable);
}

void handleOwnsDescriptor(Counts& counts) {
#ifndef _WIN32
  int fds[2];
  CHECK(::pipe(fds) == 0);
  {
    gpu::NativeShareHandle handle = gpu::NativeShareHandle::fromFd(fds[0]);
    CHECK(bool(handle) && handle.memoryFd() == fds[0]);
    gpu::NativeShareHandle moved = std::move(handle);
    CHECK(moved.memoryFd() == fds[0]);
  }
  CHECK(::fcntl(fds[0], F_GETFD) == -1);  // closed with the handle
  {
    gpu::NativeShareHandle handle = gpu::NativeShareHandle::fromFd(fds[1]);
    CHECK(handle.releaseFd() == fds[1]);
  }
  CHECK(::fcntl(fds[1], F_GETFD) != -1);  // given up, not closed
  ::close(fds[1]);
#endif
  int released = 0;
  {
    gpu::NativeShareHandle handle =
        gpu::NativeShareHandle::fromObject(&released, [](void* object) { ++*static_cast<int*>(object); });
    CHECK(handle.object() == &released);
  }
  CHECK(released == 1);
}

const char* kCatalog = R"JSON({
  "format": 1,
  "vertex": "@vertex fn vs(@builtin(vertex_index) i: u32) -> @builtin(position) vec4f { var p = array<vec2f, 3>(vec2f(-1.0, -1.0), vec2f(3.0, -1.0), vec2f(-1.0, 3.0)); return vec4f(p[i], 0.0, 1.0); }",
  "vertexEntryPoint": "vs",
  "alphaConvert": { "toStraight": "none@1", "toPremultiplied": "none@1" },
  "modules": {
    "test.fill@1": {
      "kind": "compute",
      "io": { "inputs": {}, "output": {} },
      "wgsl": "struct P { color: vec4f } @group(0) @binding(0) var<uniform> p: P; @group(0) @binding(1) var target_image: texture_storage_2d<rgba8unorm, write>; @compute @workgroup_size(8, 8) fn main(@builtin(global_invocation_id) id: vec3u) { let size = textureDimensions(target_image); if (id.x >= size.x || id.y >= size.y) { return; } textureStore(target_image, vec2i(id.xy), p.color); }",
      "entryPoint": "main",
      "workgroupSize": [8, 8, 1],
      "layout": [
        { "binding": 0, "visibility": 4, "buffer": { "type": "uniform" } },
        { "binding": 1, "visibility": 4, "storageTexture": { "access": "write-only", "format": "rgba8unorm" } }
      ],
      "bindings": [
        { "name": "params", "binding": 0, "kind": "uniform" },
        { "name": "output", "binding": 1, "kind": "storageTexture" }
      ],
      "uniform": { "size": 16, "fields": [ { "name": "color", "type": "vec4f", "offset": 0 } ] }
    },
    "test.fill16@1": {
      "kind": "compute",
      "io": { "inputs": {}, "output": {} },
      "wgsl": "struct P { color: vec4f } @group(0) @binding(0) var<uniform> p: P; @group(0) @binding(1) var target_image: texture_storage_2d<rgba16float, write>; @compute @workgroup_size(8, 8) fn main(@builtin(global_invocation_id) id: vec3u) { let size = textureDimensions(target_image); if (id.x >= size.x || id.y >= size.y) { return; } textureStore(target_image, vec2i(id.xy), p.color); }",
      "entryPoint": "main",
      "workgroupSize": [8, 8, 1],
      "layout": [
        { "binding": 0, "visibility": 4, "buffer": { "type": "uniform" } },
        { "binding": 1, "visibility": 4, "storageTexture": { "access": "write-only", "format": "rgba16float" } }
      ],
      "bindings": [
        { "name": "params", "binding": 0, "kind": "uniform" },
        { "name": "output", "binding": 1, "kind": "storageTexture" }
      ],
      "uniform": { "size": 16, "fields": [ { "name": "color", "type": "vec4f", "offset": 0 } ] }
    },
    "test.copy@1": {
      "kind": "fragment",
      "io": { "inputs": { "source": {} }, "output": {} },
      "wgsl": "@group(0) @binding(0) var source: texture_2d<f32>; @fragment fn fs(@builtin(position) at: vec4f) -> @location(0) vec4f { return textureLoad(source, vec2i(0, 0), 0); }",
      "entryPoint": "fs",
      "workgroupSize": [1, 1, 1],
      "layout": [ { "binding": 0, "visibility": 2, "texture": { "sampleType": "float" } } ],
      "bindings": [ { "name": "source", "binding": 0, "kind": "texture" } ]
    },
    "test.fillFragment@1": {
      "kind": "fragment",
      "io": { "inputs": {}, "output": {} },
      "wgsl": "struct P { color: vec4f } @group(0) @binding(0) var<uniform> p: P; @fragment fn fs() -> @location(0) vec4f { return p.color; }",
      "entryPoint": "fs",
      "workgroupSize": [1, 1, 1],
      "layout": [ { "binding": 0, "visibility": 2, "buffer": { "type": "uniform" } } ],
      "bindings": [ { "name": "params", "binding": 0, "kind": "uniform" } ],
      "uniform": { "size": 16, "fields": [ { "name": "color", "type": "vec4f", "offset": 0 } ] }
    }
  }
})JSON";

Json color(double r, double g, double b, double a) { return Json{{"color", {r, g, b, a}}}; }

bool allPixels(const std::vector<uint8_t>& px, uint8_t r, uint8_t g, uint8_t b, uint8_t a) {
  if (px.empty()) return false;
  for (size_t i = 0; i + 3 < px.size(); i += 4) {
    if (px[i] != r || px[i + 1] != g || px[i + 2] != b || px[i + 3] != a) return false;
  }
  return true;
}

void deviceSharing(Counts& counts, bool requireSharing, bool noGpu) {
  gr::GpuOptions options;
  options.enabled = true;
  std::string error;
  auto device = gpu::Device::acquire(options, error);
  if (noGpu) {
    CHECK(!device);
    CHECK(!error.empty());
    return;
  }
  ++counts.checks;
  if (!device) {
    ++counts.failures;
    std::fprintf(stderr, "no GPU device: %s\n", error.c_str());
    return;
  }
  const auto catalog = gpu::parseCatalog(kCatalog);
  const gpu::ShareSupport support = device->shareSupport();
  std::printf("device: %s\nsharing: %s%s%s\n", device->description().c_str(),
              gpu::shareBackendName(support.backend), support.reason.empty() ? "" : " - ", support.reason.c_str());

  if (support.backend == gpu::ShareBackend::None) {
    // An unsupported device says why and refuses, without a fallback.
    CHECK(!requireSharing);
    CHECK(!support.reason.empty());
    CHECK_THROWS(device->createShareable(16, 16, gpu::ShareFormat::Rgba8Unorm, "share-test"));
    const uint64_t plain = device->run(*catalog, "test.fill@1", color(1, 0, 0, 1), {}, 16, 16, "share-test");
    CHECK_THROWS(device->share(plain));
    CHECK(device->releaseRun("share-test") == 1);
    return;
  }

  const size_t liveBefore = device->liveTextures();
  CHECK_THROWS(device->createShareable(0, 16, gpu::ShareFormat::Rgba8Unorm, "share-test"));
  CHECK_THROWS(device->createShareable(16, 70000, gpu::ShareFormat::Rgba8Unorm, "share-test"));

  const uint64_t id = device->createShareable(40, 24, gpu::ShareFormat::Rgba8Unorm, "share-test");
  CHECK(device->has(id));
  std::shared_ptr<gpu::SharedTexture> lease = device->share(id);
  CHECK(lease && lease->id() == id);
  CHECK(lease->descriptor().backend == support.backend);
  CHECK(lease->descriptor().width == 40 && lease->descriptor().height == 24);
  CHECK(device->share(id) == lease);  // one share state per texture

  // Nothing was written yet: there is no content to hand over.
  CHECK_THROWS(lease->publish());
  CHECK(!lease->published());

  // A compute pass writes straight into the shareable texture.
  device->runInto(*catalog, "test.fill@1", color(1, 0, 0, 1), {}, id);
  uint32_t w = 0, h = 0;
  CHECK(allPixels(device->read(id, w, h), 255, 0, 0, 255));
  CHECK(w == 40 && h == 24);
  CHECK(lease->cpuTransfers() == 1);  // the read above, and only that

  // Published: the content is with the consumer. The device refuses to
  // write, read or sample it until it is reclaimed.
  lease->publish();
  CHECK(lease->published());
  CHECK_THROWS(device->runInto(*catalog, "test.fill@1", color(0, 1, 0, 1), {}, id));
  CHECK_THROWS(device->read(id, w, h));
  std::string openError;
  gpu::NativeShareHandle handle = lease->open(openError);
  CHECK(bool(handle));
  CHECK(openError.empty());
#ifndef _WIN32
  if (support.backend == gpu::ShareBackend::Vulkan) {
    CHECK(handle.memoryFd() >= 0 && ::fcntl(handle.memoryFd(), F_GETFD) != -1);
    CHECK(lease->descriptor().vulkanAllocationSize >= 40u * 24u * 4u);
  }
#endif

  // Reclaimed: the next frame overwrites it, here with a fragment pass,
  // then with a compute pass again (two different Vulkan layouts).
  lease->reclaim();
  CHECK(!lease->published());
  device->runInto(*catalog, "test.fillFragment@1", color(0, 1, 0, 1), {}, id);
  lease->publish();
  lease->reclaim();
  CHECK(allPixels(device->read(id, w, h), 0, 255, 0, 255));
  device->runInto(*catalog, "test.fill@1", color(0, 0, 1, 1), {}, id);
  lease->publish();
  lease->reclaim();
  CHECK(allPixels(device->read(id, w, h), 0, 0, 255, 255));

  // A shareable texture is also an ordinary input of another pass.
  const uint64_t other = device->createShareable(8, 8, gpu::ShareFormat::Rgba8Unorm, "share-test");
  device->runInto(*catalog, "test.copy@1", Json::object(), {{"source", id}}, other);
  CHECK(allPixels(device->read(other, w, h), 0, 0, 255, 255));
  lease->publish();
  CHECK_THROWS(device->runInto(*catalog, "test.copy@1", Json::object(), {{"source", id}}, other));
  lease->reclaim();
  device->release(other);

  // The texture cannot be its own input, and an ordinary output cannot be a target.
  CHECK_THROWS(device->runInto(*catalog, "test.fill@1", color(0, 0, 0, 1), {{"source", id}}, id));
  const uint64_t plain = device->run(*catalog, "test.fill@1", color(1, 1, 1, 1), {}, 8, 8, "share-test");
  CHECK_THROWS(device->runInto(*catalog, "test.fill@1", color(0, 0, 0, 1), {}, plain));
  if (support.backend == gpu::ShareBackend::Vulkan) {
    CHECK_THROWS(device->share(plain));  // its memory is not exportable; no copy is made
  }

  // A module whose storage format differs from the texture's is refused
  // before anything is encoded. The device and the texture stay usable.
  CHECK_THROWS(device->runInto(*catalog, "test.fill16@1", color(1, 1, 1, 1), {}, id));
  device->runInto(*catalog, "test.fill@1", color(1, 1, 0, 1), {}, id);
  CHECK(allPixels(device->read(id, w, h), 255, 255, 0, 255));

  // A float texture is shared in its own format.
  const uint64_t floatId = device->createShareable(16, 16, gpu::ShareFormat::Rgba16Float, "share-test");
  std::shared_ptr<gpu::SharedTexture> floatLease = device->share(floatId);
  CHECK(floatLease->descriptor().format == gpu::ShareFormat::Rgba16Float);
  device->runInto(*catalog, "test.fill16@1", color(2.5, 0.5, 0.25, 1), {}, floatId);
  floatLease->publish();
  CHECK(floatLease->published());

  // The run ends while a consumer still holds the texture: the ids go, the
  // allocation stays and can still be opened and reclaimed.
  lease->publish();
  CHECK(device->releaseRun("share-test") == 3);
  CHECK(!device->has(id) && !device->has(floatId));
  CHECK(device->liveTextures() == liveBefore);
  CHECK_THROWS(device->runInto(*catalog, "test.fill@1", color(0, 0, 0, 1), {}, id));
  gpu::NativeShareHandle late = lease->open(openError);
  CHECK(bool(late));
  lease->reclaim();
  CHECK(!lease->published());

  // The last holders let go: the textures are destroyed. The device still works.
  handle = {};
  late = {};
  lease.reset();
  floatLease.reset();
  const uint64_t after = device->run(*catalog, "test.fill@1", color(1, 0, 1, 1), {}, 8, 8, "share-test-2");
  CHECK(allPixels(device->read(after, w, h), 255, 0, 255, 255));
  CHECK(device->releaseRun("share-test-2") == 1);
  CHECK(device->liveTextures() == liveBefore);
}

}  // namespace

int main(int argc, char** argv) {
  bool requireSharing = false;
  bool noGpu = false;
  for (int i = 1; i < argc; ++i) {
    if (std::strcmp(argv[i], "--require-sharing") == 0) requireSharing = true;
    if (std::strcmp(argv[i], "--no-gpu") == 0) noGpu = true;
  }
  Counts counts;
  ringStates(counts);
  ringWakesProducer(counts);
  handleOwnsDescriptor(counts);
  deviceSharing(counts, requireSharing, noGpu);
  std::printf("%d checks, %d failures\n", counts.checks, counts.failures);
  return counts.failures ? 1 : 0;
}
