// The Vulkan side of texture sharing on the wgpu device (gpu_share.h):
// exportable images, their memory descriptors and the queue family
// transfers that hand content to and from another Vulkan device.
//
// Internal to the device (gpu_device.cpp). Built only when the Vulkan
// headers are present and wgpu-native has the native interop functions.
#pragma once

#include "host/gpu_share.h"

#include <cstdint>
#include <memory>
#include <string>

namespace gr::host::gpu::vkshare {

struct ContextState;

// An image with exportable, dedicated memory on the wgpu device. Destroys
// both in the destructor. wgpu-native holds it through the texture's drop
// callback, so it dies after the last GPU work that uses the image.
//
// Thread affinity: none. The destructor may run on any thread: it calls
// only vkDestroyImage and vkFreeMemory, which need no queue.
class ExportedImage {
public:
  ExportedImage(void* device, uint64_t image) : device_(device), image_(image) {}
  ExportedImage(const ExportedImage&) = delete;
  ExportedImage& operator=(const ExportedImage&) = delete;
  ~ExportedImage();

  uint64_t image() const { return image_; }
  uint64_t memory() const { return memory_; }
  // Takes over the memory allocated for the image.
  void adoptMemory(uint64_t memory) { memory_ = memory; }

private:
  void* device_;      // VkDevice, borrowed from wgpu-native for the process lifetime
  uint64_t image_;    // VkImage
  uint64_t memory_ = 0;  // VkDeviceMemory
};

// Raw Vulkan access to the wgpu device.
//
// Thread affinity: createImage() and transfer() use the device's VkQueue or
// command pool, which Vulkan requires to be externally synchronized. The
// caller holds the device mutex, which also serializes every wgpu
// submission. exportFd() is thread-safe.
class Context {
public:
  // Null with `reason` set when the device cannot export memory.
  explicit Context(std::unique_ptr<ContextState> state);
  static std::unique_ptr<Context> create(void* physicalDevice, void* device, void* queue, uint32_t queueFamily,
                                         std::string& reason);
  ~Context();

  // Fills the Vulkan fields of `descriptor` and returns the image. Throws
  // when the format cannot be exported.
  std::unique_ptr<ExportedImage> createImage(ShareDescriptor& descriptor);
  // A new opaque descriptor of `memory`, or -1 with `error` set.
  int exportFd(uint64_t memory, std::string& error) const;
  // Moves the image between the device's queue family and
  // VK_QUEUE_FAMILY_EXTERNAL with a layout change, and waits for it.
  void transfer(uint64_t image, uint32_t oldLayout, uint32_t newLayout, bool toExternal);

  static uint32_t layoutGeneral();
  static uint32_t layoutColorAttachment();
  static uint32_t layoutShaderReadOnly();
  static uint32_t layoutTransferSource();

private:
  std::unique_ptr<ContextState> impl_;
};

}  // namespace gr::host::gpu::vkshare
