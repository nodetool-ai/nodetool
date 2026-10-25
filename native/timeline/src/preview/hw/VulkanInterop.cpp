// Linux hardware decode (D15, M6): VAAPI frames imported into the QRhi's
// Vulkan device through DMA-BUF. See VulkanInterop.h. Written for M6 and not
// compiled on Linux yet (the development machine is macOS).

#include "preview/hw/VulkanInterop.h"

#include "preview/hw/HwInterop.h"

#include <rhi/qrhi.h>

#include <QVulkanDeviceFunctions>
#include <QVulkanFunctions>
#include <QVulkanInstance>

extern "C" {
#include <libavcodec/avcodec.h>
#include <libavutil/error.h>
#include <libavutil/hwcontext.h>
#include <libavutil/hwcontext_drm.h>
}

#include <vulkan/vulkan.h>

#include <unistd.h>

#include <atomic>
#include <cstdlib>
#include <mutex>
#include <vector>

namespace nt::hw {
namespace {

std::atomic<int> g_liveFrameRefs{0};
std::atomic<int> g_releasedInFlight{0};
std::atomic<long long> g_completedFrame{-1};
std::atomic<int> g_framesInFlight{2};

std::string avError(int rc) {
    char buf[AV_ERROR_MAX_STRING_SIZE] = {};
    av_strerror(rc, buf, sizeof(buf));
    return buf;
}

AVPixelFormat pickVaapi(AVCodecContext*, const AVPixelFormat* formats) {
    for (const AVPixelFormat* f = formats; *f != AV_PIX_FMT_NONE; ++f) {
        if (*f == AV_PIX_FMT_VAAPI) return *f;
    }
    return formats[0];
}

AVPixelFormat softwareFormatOf(const AVFrame* frame) {
    if (!frame->hw_frames_ctx) return AV_PIX_FMT_NONE;
    return reinterpret_cast<const AVHWFramesContext*>(frame->hw_frames_ctx->data)->sw_format;
}

template <typename T>
std::uint64_t handleBits(T handle) {
    return reinterpret_cast<std::uint64_t>(handle);
}

}  // namespace

struct VulkanInterop::Vk {
    VkPhysicalDevice physDev = VK_NULL_HANDLE;
    VkDevice dev = VK_NULL_HANDLE;
    VkQueue queue = VK_NULL_HANDLE;
    std::uint32_t queueFamily = 0;
    QVulkanFunctions* f = nullptr;
    QVulkanDeviceFunctions* df = nullptr;
    PFN_vkGetMemoryFdPropertiesKHR getMemoryFdProperties = nullptr;
    VkPhysicalDeviceMemoryProperties memory{};
    VkCommandPool pool = VK_NULL_HANDLE;
    VkFence fence = VK_NULL_HANDLE;
    std::mutex submitMutex;  // the render thread only, but wrap() may be reentered by tests
};

void trackCompletion(QRhiCommandBuffer*, long long frameNumber) {
    const long long done = frameNumber - g_framesInFlight.load();
    long long seen = g_completedFrame.load();
    while (seen < done && !g_completedFrame.compare_exchange_weak(seen, done)) {
    }
}

long long completedFrame() {
    return g_completedFrame.load();
}

int FrameRef::live() {
    return g_liveFrameRefs.load();
}

int FrameRef::releasedInFlight() {
    return g_releasedInFlight.load();
}

FrameRef::~FrameRef() {
    if (m_lastUse >= 0 && m_lastUse > g_completedFrame.load()) ++g_releasedInFlight;
    for (auto& p : m_planes) p.reset();  // the QRhi wrappers before the images
    if (m_interop) {
        for (size_t i = 0; i < 2; ++i) m_interop->destroyPlane(m_images[i], m_memory[i]);
    }
    av_frame_free(&m_drm);  // releases the DMA-BUF fds and the VAAPI surface
    --g_liveFrameRefs;
}

VulkanInterop::VulkanInterop() : m_vk(std::make_unique<Vk>()) {}

VulkanInterop::~VulkanInterop() {
    if (m_vk->dev && m_vk->df) {
        if (m_vk->fence) m_vk->df->vkDestroyFence(m_vk->dev, m_vk->fence, nullptr);
        if (m_vk->pool) m_vk->df->vkDestroyCommandPool(m_vk->dev, m_vk->pool, nullptr);
    }
}

QByteArrayList VulkanInterop::requiredDeviceExtensions() {
    return {QByteArrayLiteral("VK_KHR_external_memory_fd"), QByteArrayLiteral("VK_EXT_external_memory_dma_buf"),
            QByteArrayLiteral("VK_EXT_image_drm_format_modifier"), QByteArrayLiteral("VK_EXT_queue_family_foreign")};
}

std::shared_ptr<VulkanInterop> VulkanInterop::create(QRhi* rhi) {
    if (!rhi || rhi->backend() != QRhi::Vulkan) return nullptr;
    const auto* handles = static_cast<const QRhiVulkanNativeHandles*>(rhi->nativeHandles());
    if (!handles || !handles->dev || !handles->inst || !handles->gfxQueue) return nullptr;
    std::shared_ptr<VulkanInterop> interop(new VulkanInterop());
    Vk& vk = *interop->m_vk;
    vk.physDev = handles->physDev;
    vk.dev = handles->dev;
    vk.queue = handles->gfxQueue;
    vk.queueFamily = handles->gfxQueueFamilyIdx;
    vk.f = handles->inst->functions();
    vk.df = handles->inst->deviceFunctions(vk.dev);

    // Every extension of the import must be on the device Qt created.
    std::uint32_t count = 0;
    vk.f->vkEnumerateDeviceExtensionProperties(vk.physDev, nullptr, &count, nullptr);
    std::vector<VkExtensionProperties> props(count);
    vk.f->vkEnumerateDeviceExtensionProperties(vk.physDev, nullptr, &count, props.data());
    for (const QByteArray& want : requiredDeviceExtensions()) {
        bool found = false;
        for (const auto& p : props) found = found || want == p.extensionName;
        if (!found) return nullptr;
    }
    // A device-level extension function: through vkGetDeviceProcAddr.
    const auto getDeviceProcAddr =
        reinterpret_cast<PFN_vkGetDeviceProcAddr>(handles->inst->getInstanceProcAddr("vkGetDeviceProcAddr"));
    if (!getDeviceProcAddr) return nullptr;
    vk.getMemoryFdProperties =
        reinterpret_cast<PFN_vkGetMemoryFdPropertiesKHR>(getDeviceProcAddr(vk.dev, "vkGetMemoryFdPropertiesKHR"));
    if (!vk.getMemoryFdProperties) return nullptr;
    vk.f->vkGetPhysicalDeviceMemoryProperties(vk.physDev, &vk.memory);

    VkCommandPoolCreateInfo poolInfo{};

    poolInfo.sType = VK_STRUCTURE_TYPE_COMMAND_POOL_CREATE_INFO;
    poolInfo.flags = VK_COMMAND_POOL_CREATE_RESET_COMMAND_BUFFER_BIT | VK_COMMAND_POOL_CREATE_TRANSIENT_BIT;
    poolInfo.queueFamilyIndex = vk.queueFamily;
    if (vk.df->vkCreateCommandPool(vk.dev, &poolInfo, nullptr, &vk.pool) != VK_SUCCESS) return nullptr;
    VkFenceCreateInfo fenceInfo{};
    fenceInfo.sType = VK_STRUCTURE_TYPE_FENCE_CREATE_INFO;
    if (vk.df->vkCreateFence(vk.dev, &fenceInfo, nullptr, &vk.fence) != VK_SUCCESS) return nullptr;
    interop->m_rhi = rhi;
    g_framesInFlight.store(rhi->resourceLimit(QRhi::FramesInFlight));
    return interop;
}

void VulkanInterop::destroyPlane(std::uint64_t image, std::uint64_t memory) {
    if (image) m_vk->df->vkDestroyImage(m_vk->dev, reinterpret_cast<VkImage>(image), nullptr);
    if (memory) m_vk->df->vkFreeMemory(m_vk->dev, reinterpret_cast<VkDeviceMemory>(memory), nullptr);
}

std::shared_ptr<FrameRef> VulkanInterop::wrap(const AVFrame* frame, std::string* error) {
    Vk& vk = *m_vk;
    std::string why;
    const auto fail = [&](std::string reason) -> std::shared_ptr<FrameRef> {
        if (error) *error = std::move(reason);
        return nullptr;
    };
    if (frame->format != AV_PIX_FMT_VAAPI) return fail("VAAPI returned a software frame");
    if (softwareFormatOf(frame) != AV_PIX_FMT_NV12) return fail("VAAPI output is not 8-bit NV12 (10-bit waits for P010)");

    std::shared_ptr<FrameRef> ref(new FrameRef());
    ++g_liveFrameRefs;
    ref->m_interop = shared_from_this();
    ref->m_size = QSize(frame->width & ~1, frame->height & ~1);
    ref->m_drm = av_frame_alloc();
    ref->m_drm->format = AV_PIX_FMT_DRM_PRIME;
    // Syncs the surface, then exports it with one layer per plane.
    const int rc = av_hwframe_map(ref->m_drm, frame, AV_HWFRAME_MAP_READ);
    if (rc < 0) return fail("VAAPI to DRM PRIME map: " + avError(rc));
    const auto* desc = reinterpret_cast<const AVDRMFrameDescriptor*>(ref->m_drm->data[0]);

    const QSize sizes[2] = {ref->m_size, QSize(ref->m_size.width() / 2, ref->m_size.height() / 2)};
    const VkFormat formats[2] = {VK_FORMAT_R8_UNORM, VK_FORMAT_R8G8_UNORM};
    VkImageMemoryBarrier barriers[2]{};
    for (int p = 0; p < 2; ++p) {
        // Separate layers (R8, GR88), or one NV12 layer with two planes.
        const AVDRMPlaneDescriptor* plane = desc->nb_layers >= 2 ? &desc->layers[p].planes[0]
                                            : desc->layers[0].nb_planes >= 2 ? &desc->layers[0].planes[p]
                                                                              : nullptr;
        if (!plane) return fail("the DRM PRIME frame has no plane " + std::to_string(p));
        const AVDRMObjectDescriptor& object = desc->objects[plane->object_index];

        VkSubresourceLayout layout{};
        layout.offset = static_cast<VkDeviceSize>(plane->offset);
        layout.rowPitch = static_cast<VkDeviceSize>(plane->pitch);
        VkImageDrmFormatModifierExplicitCreateInfoEXT modifier{};
        modifier.sType = VK_STRUCTURE_TYPE_IMAGE_DRM_FORMAT_MODIFIER_EXPLICIT_CREATE_INFO_EXT;
        modifier.drmFormatModifier = object.format_modifier;
        modifier.drmFormatModifierPlaneCount = 1;
        modifier.pPlaneLayouts = &layout;
        VkExternalMemoryImageCreateInfo external{};
        external.sType = VK_STRUCTURE_TYPE_EXTERNAL_MEMORY_IMAGE_CREATE_INFO;
        external.pNext = &modifier;
        external.handleTypes = VK_EXTERNAL_MEMORY_HANDLE_TYPE_DMA_BUF_BIT_EXT;
        VkImageCreateInfo info{};
        info.sType = VK_STRUCTURE_TYPE_IMAGE_CREATE_INFO;
        info.pNext = &external;
        info.imageType = VK_IMAGE_TYPE_2D;
        info.format = formats[p];
        info.extent = {static_cast<std::uint32_t>(sizes[p].width()), static_cast<std::uint32_t>(sizes[p].height()), 1};
        info.mipLevels = 1;
        info.arrayLayers = 1;
        info.samples = VK_SAMPLE_COUNT_1_BIT;
        info.tiling = VK_IMAGE_TILING_DRM_FORMAT_MODIFIER_EXT;
        info.usage = VK_IMAGE_USAGE_SAMPLED_BIT;
        info.sharingMode = VK_SHARING_MODE_EXCLUSIVE;
        info.initialLayout = VK_IMAGE_LAYOUT_UNDEFINED;
        VkImage image = VK_NULL_HANDLE;
        if (vk.df->vkCreateImage(vk.dev, &info, nullptr, &image) != VK_SUCCESS) {
            return fail("vkCreateImage for a DMA-BUF plane failed (modifier not supported?)");
        }
        ref->m_images[static_cast<size_t>(p)] = handleBits(image);

        const int fd = dup(object.fd);  // Vulkan owns the fd once the import succeeds
        if (fd < 0) return fail("cannot dup the DMA-BUF fd");
        VkMemoryFdPropertiesKHR fdProps{};
        fdProps.sType = VK_STRUCTURE_TYPE_MEMORY_FD_PROPERTIES_KHR;
        if (vk.getMemoryFdProperties(vk.dev, VK_EXTERNAL_MEMORY_HANDLE_TYPE_DMA_BUF_BIT_EXT, fd, &fdProps) != VK_SUCCESS) {
            close(fd);
            return fail("vkGetMemoryFdPropertiesKHR failed");
        }
        VkMemoryRequirements req{};
        vk.df->vkGetImageMemoryRequirements(vk.dev, image, &req);
        const std::uint32_t bits = req.memoryTypeBits & fdProps.memoryTypeBits;
        std::uint32_t type = 0;
        while (type < vk.memory.memoryTypeCount && !(bits & (1u << type))) ++type;
        if (type == vk.memory.memoryTypeCount) {
            close(fd);
            return fail("no memory type can import the DMA-BUF");
        }
        VkMemoryDedicatedAllocateInfo dedicated{};
        dedicated.sType = VK_STRUCTURE_TYPE_MEMORY_DEDICATED_ALLOCATE_INFO;
        dedicated.image = image;
        VkImportMemoryFdInfoKHR import{};
        import.sType = VK_STRUCTURE_TYPE_IMPORT_MEMORY_FD_INFO_KHR;
        import.pNext = &dedicated;
        import.handleType = VK_EXTERNAL_MEMORY_HANDLE_TYPE_DMA_BUF_BIT_EXT;
        import.fd = fd;
        VkMemoryAllocateInfo alloc{};
        alloc.sType = VK_STRUCTURE_TYPE_MEMORY_ALLOCATE_INFO;
        alloc.pNext = &import;
        alloc.allocationSize = req.size;
        alloc.memoryTypeIndex = type;
        VkDeviceMemory memory = VK_NULL_HANDLE;
        if (vk.df->vkAllocateMemory(vk.dev, &alloc, nullptr, &memory) != VK_SUCCESS) {
            close(fd);
            return fail("vkAllocateMemory could not import the DMA-BUF");
        }
        ref->m_memory[static_cast<size_t>(p)] = handleBits(memory);
        if (vk.df->vkBindImageMemory(vk.dev, image, memory, 0) != VK_SUCCESS) return fail("vkBindImageMemory failed");

        VkImageMemoryBarrier& b = barriers[p];
        b.sType = VK_STRUCTURE_TYPE_IMAGE_MEMORY_BARRIER;
        b.srcAccessMask = 0;
        b.dstAccessMask = VK_ACCESS_SHADER_READ_BIT;
        b.oldLayout = VK_IMAGE_LAYOUT_UNDEFINED;
        b.newLayout = VK_IMAGE_LAYOUT_SHADER_READ_ONLY_OPTIMAL;
        b.srcQueueFamilyIndex = VK_QUEUE_FAMILY_FOREIGN_EXT;  // acquire from VAAPI
        b.dstQueueFamilyIndex = vk.queueFamily;
        b.image = image;
        b.subresourceRange = {VK_IMAGE_ASPECT_COLOR_BIT, 0, 1, 0, 1};
    }

    // One small submission on Qt's queue, from the render thread, before the
    // frame that samples the images is submitted.
    {
        std::lock_guard lock(vk.submitMutex);
        VkCommandBufferAllocateInfo cbInfo{};
        cbInfo.sType = VK_STRUCTURE_TYPE_COMMAND_BUFFER_ALLOCATE_INFO;
        cbInfo.commandPool = vk.pool;
        cbInfo.level = VK_COMMAND_BUFFER_LEVEL_PRIMARY;
        cbInfo.commandBufferCount = 1;
        VkCommandBuffer cb = VK_NULL_HANDLE;
        if (vk.df->vkAllocateCommandBuffers(vk.dev, &cbInfo, &cb) != VK_SUCCESS) return fail("no command buffer");
        VkCommandBufferBeginInfo begin{};
        begin.sType = VK_STRUCTURE_TYPE_COMMAND_BUFFER_BEGIN_INFO;
        begin.flags = VK_COMMAND_BUFFER_USAGE_ONE_TIME_SUBMIT_BIT;
        vk.df->vkBeginCommandBuffer(cb, &begin);
        vk.df->vkCmdPipelineBarrier(cb, VK_PIPELINE_STAGE_TOP_OF_PIPE_BIT, VK_PIPELINE_STAGE_FRAGMENT_SHADER_BIT, 0, 0,
                                    nullptr, 0, nullptr, 2, barriers);
        vk.df->vkEndCommandBuffer(cb);
        VkSubmitInfo submit{};
        submit.sType = VK_STRUCTURE_TYPE_SUBMIT_INFO;
        submit.commandBufferCount = 1;
        submit.pCommandBuffers = &cb;
        const bool ok = vk.df->vkQueueSubmit(vk.queue, 1, &submit, vk.fence) == VK_SUCCESS &&
                        vk.df->vkWaitForFences(vk.dev, 1, &vk.fence, VK_TRUE, 100'000'000) == VK_SUCCESS;
        vk.df->vkResetFences(vk.dev, 1, &vk.fence);
        vk.df->vkFreeCommandBuffers(vk.dev, vk.pool, 1, &cb);
        if (!ok) return fail("the DMA-BUF acquire barrier did not complete");
    }

    const QRhiTexture::Format rhiFormats[2] = {QRhiTexture::R8, QRhiTexture::RG8};
    for (int p = 0; p < 2; ++p) {
        std::unique_ptr<QRhiTexture> t(m_rhi->newTexture(rhiFormats[p], sizes[p]));
        if (!t->createFrom({ref->m_images[static_cast<size_t>(p)], VK_IMAGE_LAYOUT_SHADER_READ_ONLY_OPTIMAL})) {
            return fail("QRhiTexture::createFrom rejected the imported plane");
        }
        ref->m_planes[static_cast<size_t>(p)] = std::move(t);
    }
    return ref;
}

// ---- the decoder side of the seam (HwInterop.h) ----

const char* apiName() {
    return "VAAPI";
}

const char* decoderName() {
    return "vaapi";
}

int pixelFormat() {
    return AV_PIX_FMT_VAAPI;
}

std::string setUpDecoder(AVCodecContext* ctx, const AVCodec* codec, const std::string& codecName, AVBufferRef** device) {
    bool supported = false;
    for (int i = 0;; ++i) {
        const AVCodecHWConfig* config = avcodec_get_hw_config(codec, i);
        if (!config) break;
        if (config->device_type == AV_HWDEVICE_TYPE_VAAPI && (config->methods & AV_CODEC_HW_CONFIG_METHOD_HW_DEVICE_CTX)) {
            supported = true;
            break;
        }
    }
    if (!supported) return "no VAAPI decoder for " + codecName;
    // The default DRM render node, or the one in NT_VAAPI_DEVICE.
    const char* node = std::getenv("NT_VAAPI_DEVICE");
    const int rc = av_hwdevice_ctx_create(device, AV_HWDEVICE_TYPE_VAAPI, node, nullptr, 0);
    if (rc < 0) return "VAAPI device: " + avError(rc);
    ctx->hw_device_ctx = av_buffer_ref(*device);
    ctx->get_format = pickVaapi;
    return {};
}

std::string checkFrame(const AVFrame* frame) {
    if (frame->format != AV_PIX_FMT_VAAPI) return "VAAPI returned a software frame";
    if (softwareFormatOf(frame) != AV_PIX_FMT_NV12) return "VAAPI output is not 8-bit NV12 (10-bit waits for P010)";
    return {};
}

std::size_t frameBytes(const AVFrame* frame) {
    return static_cast<std::size_t>(frame->width) * static_cast<std::size_t>(frame->height) * 3 / 2;
}

std::shared_ptr<FrameRef> wrapFrame(PlatformInterop& interop, const AVFrame* frame, std::string* error) {
    return interop.wrap(frame, error);
}

}  // namespace nt::hw
