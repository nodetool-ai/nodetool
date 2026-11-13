#include "host/gpu_share_vulkan.h"

#include <vulkan/vulkan.h>

#include <cstring>
#include <stdexcept>
#include <vector>

namespace gr::host::gpu::vkshare {
namespace {

VkDevice asDevice(void* device) { return static_cast<VkDevice>(device); }

std::string vkError(const char* what, VkResult result) {
  return std::string(what) + " failed (VkResult " + std::to_string(int(result)) + ")";
}

VkFormat vkFormat(ShareFormat format) {
  return format == ShareFormat::Rgba16Float ? VK_FORMAT_R16G16B16A16_SFLOAT : VK_FORMAT_R8G8B8A8_UNORM;
}

// What wgpu-hal sets for a texture with render attachment, storage, texture
// binding and copy source usage. The consumer's image uses the same value.
constexpr VkImageUsageFlags kUsage = VK_IMAGE_USAGE_COLOR_ATTACHMENT_BIT | VK_IMAGE_USAGE_STORAGE_BIT |
                                     VK_IMAGE_USAGE_SAMPLED_BIT | VK_IMAGE_USAGE_TRANSFER_SRC_BIT;

}  // namespace

ExportedImage::~ExportedImage() {
  if (image_) vkDestroyImage(asDevice(device_), VkImage(image_), nullptr);
  if (memory_) vkFreeMemory(asDevice(device_), VkDeviceMemory(memory_), nullptr);
}

struct ContextState {
  VkPhysicalDevice physicalDevice = VK_NULL_HANDLE;
  VkDevice device = VK_NULL_HANDLE;
  VkQueue queue = VK_NULL_HANDLE;
  uint32_t queueFamily = 0;
  PFN_vkGetMemoryFdKHR getMemoryFd = nullptr;
  VkPhysicalDeviceIDProperties id{};
  VkPhysicalDeviceMemoryProperties memory{};
  // Created on the wgpu device, which lives as long as the process.
  VkCommandPool pool = VK_NULL_HANDLE;
  VkCommandBuffer commands = VK_NULL_HANDLE;
  VkFence fence = VK_NULL_HANDLE;
};

Context::Context(std::unique_ptr<ContextState> impl) : impl_(std::move(impl)) {}

Context::~Context() {
  if (!impl_ || !impl_->device) return;
  if (impl_->fence) vkDestroyFence(impl_->device, impl_->fence, nullptr);
  if (impl_->pool) vkDestroyCommandPool(impl_->device, impl_->pool, nullptr);
}

std::unique_ptr<Context> Context::create(void* physicalDevice, void* device, void* queue, uint32_t queueFamily,
                                         std::string& reason) {
  if (!physicalDevice || !device || !queue || queueFamily == UINT32_MAX) {
    reason = "wgpu-native returned no Vulkan handles for this device";
    return nullptr;
  }
  auto impl = std::make_unique<ContextState>();
  impl->physicalDevice = static_cast<VkPhysicalDevice>(physicalDevice);
  impl->device = asDevice(device);
  impl->queue = static_cast<VkQueue>(queue);
  impl->queueFamily = queueFamily;

  VkPhysicalDeviceProperties properties{};
  vkGetPhysicalDeviceProperties(impl->physicalDevice, &properties);
  if (properties.apiVersion < VK_API_VERSION_1_1) {
    reason = "the Vulkan device is older than 1.1 and has no external memory";
    return nullptr;
  }
  uint32_t count = 0;
  vkEnumerateDeviceExtensionProperties(impl->physicalDevice, nullptr, &count, nullptr);
  std::vector<VkExtensionProperties> extensions(count);
  vkEnumerateDeviceExtensionProperties(impl->physicalDevice, nullptr, &count, extensions.data());
  bool hasFd = false;
  for (const auto& e : extensions) {
    if (std::strcmp(e.extensionName, VK_KHR_EXTERNAL_MEMORY_FD_EXTENSION_NAME) == 0) hasFd = true;
  }
  // wgpu-hal enables VK_KHR_external_memory_fd on its device whenever the
  // driver supports it (vulkan/adapter.rs, required_device_extensions).
  if (!hasFd) {
    reason = "the Vulkan driver does not support VK_KHR_external_memory_fd";
    return nullptr;
  }
  impl->getMemoryFd =
      reinterpret_cast<PFN_vkGetMemoryFdKHR>(vkGetDeviceProcAddr(impl->device, "vkGetMemoryFdKHR"));
  if (!impl->getMemoryFd) {
    reason = "vkGetMemoryFdKHR is not available on the wgpu device";
    return nullptr;
  }

  impl->id.sType = VK_STRUCTURE_TYPE_PHYSICAL_DEVICE_ID_PROPERTIES;
  VkPhysicalDeviceProperties2 properties2{};
  properties2.sType = VK_STRUCTURE_TYPE_PHYSICAL_DEVICE_PROPERTIES_2;
  properties2.pNext = &impl->id;
  vkGetPhysicalDeviceProperties2(impl->physicalDevice, &properties2);
  vkGetPhysicalDeviceMemoryProperties(impl->physicalDevice, &impl->memory);

  auto context = std::make_unique<Context>(std::move(impl));
  ContextState& c = *context->impl_;
  VkCommandPoolCreateInfo pool{};
  pool.sType = VK_STRUCTURE_TYPE_COMMAND_POOL_CREATE_INFO;
  pool.flags = VK_COMMAND_POOL_CREATE_RESET_COMMAND_BUFFER_BIT;
  pool.queueFamilyIndex = queueFamily;
  VkResult result = vkCreateCommandPool(c.device, &pool, nullptr, &c.pool);
  if (result == VK_SUCCESS) {
    VkCommandBufferAllocateInfo allocate{};
    allocate.sType = VK_STRUCTURE_TYPE_COMMAND_BUFFER_ALLOCATE_INFO;
    allocate.commandPool = c.pool;
    allocate.level = VK_COMMAND_BUFFER_LEVEL_PRIMARY;
    allocate.commandBufferCount = 1;
    result = vkAllocateCommandBuffers(c.device, &allocate, &c.commands);
  }
  if (result == VK_SUCCESS) {
    VkFenceCreateInfo fence{};
    fence.sType = VK_STRUCTURE_TYPE_FENCE_CREATE_INFO;
    result = vkCreateFence(c.device, &fence, nullptr, &c.fence);
  }
  if (result != VK_SUCCESS) {
    reason = vkError("creating the transfer command buffer", result);
    return nullptr;
  }
  return context;
}

std::unique_ptr<ExportedImage> Context::createImage(ShareDescriptor& descriptor) {
  ContextState& c = *impl_;
  const VkFormat format = vkFormat(descriptor.format);

  // Can this format, with this usage, be exported as an opaque descriptor?
  VkPhysicalDeviceExternalImageFormatInfo externalInfo{};
  externalInfo.sType = VK_STRUCTURE_TYPE_PHYSICAL_DEVICE_EXTERNAL_IMAGE_FORMAT_INFO;
  externalInfo.handleType = VK_EXTERNAL_MEMORY_HANDLE_TYPE_OPAQUE_FD_BIT;
  VkPhysicalDeviceImageFormatInfo2 formatInfo{};
  formatInfo.sType = VK_STRUCTURE_TYPE_PHYSICAL_DEVICE_IMAGE_FORMAT_INFO_2;
  formatInfo.pNext = &externalInfo;
  formatInfo.format = format;
  formatInfo.type = VK_IMAGE_TYPE_2D;
  formatInfo.tiling = VK_IMAGE_TILING_OPTIMAL;
  formatInfo.usage = kUsage;
  VkExternalImageFormatProperties externalProperties{};
  externalProperties.sType = VK_STRUCTURE_TYPE_EXTERNAL_IMAGE_FORMAT_PROPERTIES;
  VkImageFormatProperties2 formatProperties{};
  formatProperties.sType = VK_STRUCTURE_TYPE_IMAGE_FORMAT_PROPERTIES_2;
  formatProperties.pNext = &externalProperties;
  VkResult result =
      vkGetPhysicalDeviceImageFormatProperties2(c.physicalDevice, &formatInfo, &formatProperties);
  if (result != VK_SUCCESS) throw std::runtime_error("the Vulkan driver cannot share this texture format");
  if (!(externalProperties.externalMemoryProperties.externalMemoryFeatures &
        VK_EXTERNAL_MEMORY_FEATURE_EXPORTABLE_BIT)) {
    throw std::runtime_error("the Vulkan driver cannot export this texture format as an opaque descriptor");
  }
  if (descriptor.width > formatProperties.imageFormatProperties.maxExtent.width ||
      descriptor.height > formatProperties.imageFormatProperties.maxExtent.height) {
    throw std::runtime_error("the texture is larger than the Vulkan driver can share");
  }

  VkExternalMemoryImageCreateInfo external{};
  external.sType = VK_STRUCTURE_TYPE_EXTERNAL_MEMORY_IMAGE_CREATE_INFO;
  external.handleTypes = VK_EXTERNAL_MEMORY_HANDLE_TYPE_OPAQUE_FD_BIT;
  VkImageCreateInfo info{};
  info.sType = VK_STRUCTURE_TYPE_IMAGE_CREATE_INFO;
  info.pNext = &external;
  info.imageType = VK_IMAGE_TYPE_2D;
  info.format = format;
  info.extent = {descriptor.width, descriptor.height, 1};
  info.mipLevels = 1;
  info.arrayLayers = 1;
  info.samples = VK_SAMPLE_COUNT_1_BIT;
  info.tiling = VK_IMAGE_TILING_OPTIMAL;
  info.usage = kUsage;
  info.sharingMode = VK_SHARING_MODE_EXCLUSIVE;
  info.initialLayout = VK_IMAGE_LAYOUT_UNDEFINED;
  VkImage image = VK_NULL_HANDLE;
  result = vkCreateImage(c.device, &info, nullptr, &image);
  if (result != VK_SUCCESS) throw std::runtime_error(vkError("vkCreateImage", result));
  auto owned = std::make_unique<ExportedImage>(c.device, uint64_t(image));

  VkMemoryRequirements requirements{};
  vkGetImageMemoryRequirements(c.device, image, &requirements);
  uint32_t type = UINT32_MAX;
  for (uint32_t i = 0; i < c.memory.memoryTypeCount; ++i) {
    if ((requirements.memoryTypeBits & (1u << i)) &&
        (c.memory.memoryTypes[i].propertyFlags & VK_MEMORY_PROPERTY_DEVICE_LOCAL_BIT)) {
      type = i;
      break;
    }
  }
  if (type == UINT32_MAX) throw std::runtime_error("no device-local Vulkan memory type for a shared texture");

  VkMemoryDedicatedAllocateInfo dedicated{};
  dedicated.sType = VK_STRUCTURE_TYPE_MEMORY_DEDICATED_ALLOCATE_INFO;
  dedicated.image = image;
  VkExportMemoryAllocateInfo exported{};
  exported.sType = VK_STRUCTURE_TYPE_EXPORT_MEMORY_ALLOCATE_INFO;
  exported.pNext = &dedicated;
  exported.handleTypes = VK_EXTERNAL_MEMORY_HANDLE_TYPE_OPAQUE_FD_BIT;
  VkMemoryAllocateInfo allocate{};
  allocate.sType = VK_STRUCTURE_TYPE_MEMORY_ALLOCATE_INFO;
  allocate.pNext = &exported;
  allocate.allocationSize = requirements.size;
  allocate.memoryTypeIndex = type;
  VkDeviceMemory memory = VK_NULL_HANDLE;
  result = vkAllocateMemory(c.device, &allocate, nullptr, &memory);
  if (result != VK_SUCCESS) throw std::runtime_error(vkError("vkAllocateMemory", result));
  owned->adoptMemory(uint64_t(memory));
  result = vkBindImageMemory(c.device, image, memory, 0);
  if (result != VK_SUCCESS) throw std::runtime_error(vkError("vkBindImageMemory", result));

  descriptor.backend = ShareBackend::Vulkan;
  std::memcpy(descriptor.vulkanDeviceUuid.data(), c.id.deviceUUID, VK_UUID_SIZE);
  std::memcpy(descriptor.vulkanDriverUuid.data(), c.id.driverUUID, VK_UUID_SIZE);
  descriptor.vulkanFormat = uint32_t(format);
  descriptor.vulkanUsage = uint32_t(kUsage);
  descriptor.vulkanMemoryType = type;
  descriptor.vulkanAllocationSize = requirements.size;
  return owned;
}

int Context::exportFd(uint64_t memory, std::string& error) const {
  VkMemoryGetFdInfoKHR info{};
  info.sType = VK_STRUCTURE_TYPE_MEMORY_GET_FD_INFO_KHR;
  info.memory = VkDeviceMemory(memory);
  info.handleType = VK_EXTERNAL_MEMORY_HANDLE_TYPE_OPAQUE_FD_BIT;
  int fd = -1;
  const VkResult result = impl_->getMemoryFd(impl_->device, &info, &fd);
  if (result != VK_SUCCESS) {
    error = vkError("vkGetMemoryFdKHR", result);
    return -1;
  }
  return fd;
}

void Context::transfer(uint64_t image, uint32_t oldLayout, uint32_t newLayout, bool toExternal) {
  ContextState& c = *impl_;
  VkResult result = vkResetCommandBuffer(c.commands, 0);
  if (result != VK_SUCCESS) throw std::runtime_error(vkError("vkResetCommandBuffer", result));
  VkCommandBufferBeginInfo begin{};
  begin.sType = VK_STRUCTURE_TYPE_COMMAND_BUFFER_BEGIN_INFO;
  begin.flags = VK_COMMAND_BUFFER_USAGE_ONE_TIME_SUBMIT_BIT;
  result = vkBeginCommandBuffer(c.commands, &begin);
  if (result != VK_SUCCESS) throw std::runtime_error(vkError("vkBeginCommandBuffer", result));

  VkImageMemoryBarrier barrier{};
  barrier.sType = VK_STRUCTURE_TYPE_IMAGE_MEMORY_BARRIER;
  barrier.oldLayout = VkImageLayout(oldLayout);
  barrier.newLayout = VkImageLayout(newLayout);
  barrier.srcQueueFamilyIndex = toExternal ? c.queueFamily : VK_QUEUE_FAMILY_EXTERNAL;
  barrier.dstQueueFamilyIndex = toExternal ? VK_QUEUE_FAMILY_EXTERNAL : c.queueFamily;
  barrier.image = VkImage(image);
  barrier.subresourceRange = {VK_IMAGE_ASPECT_COLOR_BIT, 0, 1, 0, 1};
  const VkAccessFlags all = VK_ACCESS_SHADER_READ_BIT | VK_ACCESS_SHADER_WRITE_BIT |
                            VK_ACCESS_COLOR_ATTACHMENT_READ_BIT | VK_ACCESS_COLOR_ATTACHMENT_WRITE_BIT |
                            VK_ACCESS_TRANSFER_READ_BIT;
  // The side that gives the image up names the accesses it made; the side
  // that takes it names the ones it will make.
  barrier.srcAccessMask = toExternal ? all : 0;
  barrier.dstAccessMask = toExternal ? 0 : all;
  vkCmdPipelineBarrier(c.commands, toExternal ? VK_PIPELINE_STAGE_ALL_COMMANDS_BIT : VK_PIPELINE_STAGE_TOP_OF_PIPE_BIT,
                       toExternal ? VK_PIPELINE_STAGE_BOTTOM_OF_PIPE_BIT : VK_PIPELINE_STAGE_ALL_COMMANDS_BIT, 0, 0,
                       nullptr, 0, nullptr, 1, &barrier);
  result = vkEndCommandBuffer(c.commands);
  if (result != VK_SUCCESS) throw std::runtime_error(vkError("vkEndCommandBuffer", result));

  VkSubmitInfo submit{};
  submit.sType = VK_STRUCTURE_TYPE_SUBMIT_INFO;
  submit.commandBufferCount = 1;
  submit.pCommandBuffers = &c.commands;
  result = vkQueueSubmit(c.queue, 1, &submit, c.fence);
  if (result != VK_SUCCESS) throw std::runtime_error(vkError("vkQueueSubmit", result));
  result = vkWaitForFences(c.device, 1, &c.fence, VK_TRUE, UINT64_MAX);
  if (result != VK_SUCCESS) throw std::runtime_error(vkError("vkWaitForFences", result));
  result = vkResetFences(c.device, 1, &c.fence);
  if (result != VK_SUCCESS) throw std::runtime_error(vkError("vkResetFences", result));
}

uint32_t Context::layoutGeneral() { return uint32_t(VK_IMAGE_LAYOUT_GENERAL); }
uint32_t Context::layoutColorAttachment() { return uint32_t(VK_IMAGE_LAYOUT_COLOR_ATTACHMENT_OPTIMAL); }
uint32_t Context::layoutTransferSource() { return uint32_t(VK_IMAGE_LAYOUT_TRANSFER_SRC_OPTIMAL); }
uint32_t Context::layoutShaderReadOnly() { return uint32_t(VK_IMAGE_LAYOUT_SHADER_READ_ONLY_OPTIMAL); }

}  // namespace gr::host::gpu::vkshare
