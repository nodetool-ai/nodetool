// Sharing completed GPU textures with a second GPU runtime, such as Qt's
// scene graph, without reading pixels back. This header has no GPU or Qt
// dependency: the device implements SharedTexture (gpu_device.cpp), and a
// presentation adapter outside the runner consumes it.
//
// The mechanism per backend (ShareBackend):
//   Vulkan  Each runtime has its own VkDevice. The texture's memory is
//           allocated exportable, handed over as an opaque file descriptor
//           and imported by the consumer. Ownership of the content moves
//           with queue family transfers to and from VK_QUEUE_FAMILY_EXTERNAL
//           in VK_IMAGE_LAYOUT_SHADER_READ_ONLY_OPTIMAL.
//   Metal   Both runtimes use one MTLDevice. The consumer receives a
//           retained MTLTexture.
//   D3D12   Not available.
//
// Completion is tracked on the CPU: publish() returns only after the
// producer's GPU work has finished, and the consumer reports when its own
// GPU work with a frame has finished (FrameRing::retire).
#pragma once

#include <array>
#include <atomic>
#include <chrono>
#include <condition_variable>
#include <cstdint>
#include <memory>
#include <mutex>
#include <optional>
#include <string>
#include <vector>

namespace gr::host::gpu {

enum class ShareBackend { None, Metal, D3D12, Vulkan };
const char* shareBackendName(ShareBackend backend);

// Formats a shareable texture can have. Rgba16Float is the working format
// of float pipelines: it is shared as is, never through an 8-bit copy.
enum class ShareFormat { Rgba8Unorm, Rgba16Float };

// Whether this device can share textures, and why not.
struct ShareSupport {
  ShareBackend backend = ShareBackend::None;
  std::string reason;  // set when backend is None
};

// What a consumer needs to open a shared texture on its own device. The
// values are fixed for the life of the texture.
struct ShareDescriptor {
  ShareBackend backend = ShareBackend::None;
  uint32_t width = 0;
  uint32_t height = 0;
  ShareFormat format = ShareFormat::Rgba8Unorm;
  // The pipeline writes premultiplied alpha.
  bool premultiplied = true;

  // Vulkan. The consumer creates an image with the same parameters and
  // binds the imported memory to it. The UUIDs identify the physical device
  // and driver: an opaque descriptor is valid only where both match.
  std::array<uint8_t, 16> vulkanDeviceUuid{};
  std::array<uint8_t, 16> vulkanDriverUuid{};
  uint32_t vulkanFormat = 0;       // VkFormat
  uint32_t vulkanUsage = 0;        // VkImageUsageFlags
  uint32_t vulkanMemoryType = 0;   // memoryTypeIndex of the allocation
  uint64_t vulkanAllocationSize = 0;

  // Metal. The registryID of the MTLDevice the texture belongs to.
  uint64_t metalDeviceRegistryId = 0;
};

// An owned native reference to a shared texture, for the consumer.
//
// Vulkan: `memoryFd` is an opaque descriptor of the texture's memory. A
// successful vkAllocateMemory import takes it over: call releaseFd() then.
// Metal: `object` is a retained id<MTLTexture>, released with the handle.
//
// Thread affinity: none, one thread at a time. Move-only.
class NativeShareHandle {
public:
  NativeShareHandle() = default;
  NativeShareHandle(NativeShareHandle&& other) noexcept;
  NativeShareHandle& operator=(NativeShareHandle&& other) noexcept;
  NativeShareHandle(const NativeShareHandle&) = delete;
  NativeShareHandle& operator=(const NativeShareHandle&) = delete;
  ~NativeShareHandle();

  static NativeShareHandle fromFd(int fd);
  // Takes over one retain count of `object`; `release` drops it.
  static NativeShareHandle fromObject(void* object, void (*release)(void*));

  int memoryFd() const { return fd_; }
  // Gives up the descriptor, after an import took it over.
  int releaseFd();
  void* object() const { return object_; }
  explicit operator bool() const { return fd_ >= 0 || object_ != nullptr; }

private:
  void reset();
  int fd_ = -1;
  void* object_ = nullptr;
  void (*release_)(void*) = nullptr;
};

// A hold on one texture for a consumer on another GPU runtime. While a
// SharedTexture exists, the GPU allocation stays alive: Device::release(),
// Device::releaseRun(), cancellation and the end of the graph only remove
// the texture from the device's table.
//
// Thread affinity: publish() and reclaim() are called by the producer, one
// thread at a time. Every other member is thread-safe. The destructor may
// run on any thread.
class SharedTexture {
public:
  virtual ~SharedTexture() = default;

  // Stable for the life of the allocation, unique in the process. Keys the
  // consumer's import cache.
  virtual uint64_t id() const = 0;
  virtual const ShareDescriptor& descriptor() const = 0;

  // Blocks until every write to the texture has completed on the GPU, then
  // hands its content to the consumer side. Returns the time waited. Throws
  // when the texture was never written or the device was lost.
  virtual std::chrono::nanoseconds publish() = 0;
  // Takes the content back for writing. The consumer must have finished
  // with the texture (FrameRing moves a slot to Free only then).
  virtual void reclaim() = 0;
  // Whether the content is with the consumer side (between publish() and
  // reclaim()).
  virtual bool published() const = 0;

  // A new native reference for the consumer's device. Empty with `error`
  // set on failure.
  virtual NativeShareHandle open(std::string& error) const = 0;

  // How many times Device::read() copied this texture to the CPU.
  virtual uint64_t cpuTransfers() const = 0;
};

// Counters of one presentation path. A zero-copy path keeps
// gpuToCpuTransfers and gpuToGpuCopies at zero.
struct ShareStats {
  uint64_t gpuToCpuTransfers = 0;
  uint64_t gpuToGpuCopies = 0;
  uint64_t resourcesCreated = 0;
  uint64_t resourcesRetired = 0;
  uint64_t framesPublished = 0;
  uint64_t framesPresented = 0;
  // The producer found no free slot and skipped a frame.
  uint64_t framesDropped = 0;
  // A published frame was superseded before the consumer showed it.
  uint64_t framesReplaced = 0;
  // The consumer drew again with the frame it already had.
  uint64_t framesReused = 0;
  // Time the producer waited for GPU completion and ownership transfer.
  uint64_t syncWaitNanosTotal = 0;
  uint64_t syncWaitNanosMax = 0;
  // From the start of a frame's write to its first presentation.
  uint64_t latencyNanosTotal = 0;
  uint64_t latencyNanosMax = 0;
  // A slot was used in a state that does not allow the operation.
  uint64_t ownershipFailures = 0;
};

// The bounded pool of frames between one producer and one consumer, and the
// state of each slot:
//
//   Free ──beginWrite──▶ Writing ──publish──▶ Ready ──present──▶ Displayed
//    ▲                      │                   │                    │
//    │◀──────abandon────────┘                   │ (a newer frame     │ (a newer frame
//    │◀──────────── replaced ───────────────────┘  is published)     │  is presented)
//    │                                                               ▼
//    └────────────────────────── retire ─────────────────────── Retiring
//
// A slot is written only in Writing and sampled only in Displayed or
// Retiring, so the producer never writes a texture the consumer samples.
// The consumer calls retire() when its GPU has finished the last frame
// that sampled the slot.
//
// Thread affinity: thread-safe. `mutex_` guards every member below it.
class FrameRing {
public:
  enum class State { Free, Writing, Ready, Displayed, Retiring };

  struct Frame {
    size_t slot = 0;
    // Shared with the producer's slot table: the consumer samples the
    // texture after the producer may have dropped its own reference.
    std::shared_ptr<SharedTexture> texture;
    uint64_t sequence = 0;
  };

  explicit FrameRing(size_t capacity);

  size_t capacity() const { return capacity_; }

  // Producer. Claims a free slot. None free: counts a dropped frame.
  std::optional<size_t> beginWrite();
  // Producer. Sets the texture of a slot it is writing. Counts a created
  // resource, and a retired one when the slot had a texture.
  void setTexture(size_t slot, std::shared_ptr<SharedTexture> texture);
  std::shared_ptr<SharedTexture> texture(size_t slot) const;
  // Producer. The write completed and the texture was published. `waited`
  // is what SharedTexture::publish() returned.
  void publish(size_t slot, std::chrono::nanoseconds waited);
  // Producer. The write failed or was cancelled.
  void abandon(size_t slot);
  // Producer. Waits until a slot is free or the ring is closed.
  bool waitWritable(std::chrono::milliseconds timeout);
  // Producer. Waits until the consumer has taken every published frame, so
  // a producer paced by the display renders no frame that would be replaced.
  bool waitConsumed(std::chrono::milliseconds timeout);

  // Consumer. Takes the newest published frame. None: keep the current one.
  std::optional<Frame> present();
  // Consumer. It could not open the frame present() just returned. The
  // slot returns to Free, and the frame shown before stays the current one.
  void reject(size_t slot);
  // Consumer. Its GPU finished with a Retiring slot.
  void retire(size_t slot);
  // Consumer. It lost its GPU state (scene graph invalidated, device lost,
  // item destroyed): every slot it holds returns to Free.
  void consumerReset();

  // Either side. Ends the stream: beginWrite() and present() return nothing.
  void close();
  bool closed() const;

  State state(size_t slot) const;
  ShareStats stats() const;

private:
  struct Slot {
    State state = State::Free;
    std::shared_ptr<SharedTexture> texture;
    uint64_t sequence = 0;
    std::chrono::steady_clock::time_point writeStart{};
    // CPU transfers of textures this slot no longer holds.
    uint64_t pastCpuTransfers = 0;
  };

  bool check(size_t slot, State expected);

  const size_t capacity_;
  mutable std::mutex mutex_;
  std::condition_variable writable_;
  std::vector<Slot> slots_;
  ShareStats stats_;
  uint64_t nextSequence_ = 1;
  bool closed_ = false;
};

}  // namespace gr::host::gpu
