// Linux hardware decode (D15, M6): VAAPI frames imported into the QRhi's
// Vulkan device through DMA-BUF. See VulkanInterop.h.

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
#include <libavutil/hwcontext_vaapi.h>
}

#include <vulkan/vulkan.h>

#include <unistd.h>

#include <atomic>
#include <cstdlib>
#include <deque>
#include <mutex>
#include <vector>

namespace nt::hw {
namespace {

std::atomic<int> g_liveFrameRefs{0};
std::atomic<int> g_liveCompletionMarks{0};
std::atomic<int> g_releasedInFlight{0};
std::atomic<long long> g_completedFrame{-1};
std::atomic<int> g_framesInFlight{2};

void advanceCompleted(long long frame) {
    long long seen = g_completedFrame.load();
    while (seen < frame && !g_completedFrame.compare_exchange_weak(seen, frame)) {
    }
}

// The frame trackCompletion() saw last on this (the render) thread, for the
// next flush() to mark.
struct FrameMark {
    QRhiCommandBuffer* cb = nullptr;
    long long frame = -1;
};
thread_local FrameMark t_frameMark;

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

// Resources a submission still uses: freed when its fence signals.
struct Owned {
    std::array<VkImage, 2> images{};
    std::array<VkDeviceMemory, 2> memory{};
    AVFrame* drm = nullptr;
};

// A 16-byte buffer readback recorded in a frame: QRhi completes it once that
// frame's commands have run, as Metal's completed handler does on macOS.
// The interop owns a mark until it is destroyed. A mark still recorded then
// is orphaned: QRhi writes it until the readback completes (at a later frame,
// QRhi::finish() or the QRhi's destruction), so its callback frees it.
struct CompletionMark {
    enum State : int { Recorded, Completed, Orphaned };
    QRhiReadbackResult result;
    std::atomic<int> state{Recorded};

    CompletionMark() { ++g_liveCompletionMarks; }
    ~CompletionMark() { --g_liveCompletionMarks; }
    CompletionMark(const CompletionMark&) = delete;
    CompletionMark& operator=(const CompletionMark&) = delete;
};

struct Pending {
    VkFence fence = VK_NULL_HANDLE;
    VkCommandBuffer cb = VK_NULL_HANDLE;
    Owned owned;  // freed with the submission (a release), or empty (an acquire)
};

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
    // The render thread only. Recursive: a wrap() that fails destroys its
    // FrameRef, whose retire() runs while wrap() holds the lock.
    std::recursive_mutex mutex;
    std::vector<Pending> pending;
    std::vector<VkFence> freeFences;
    // Retired frames whose release to the foreign family could not be
    // submitted (no command buffer, no fence, a failed submit). Their VA
    // surfaces stay out of the decoder's free list until a release succeeds
    // (retried on each flush()) or the device is lost.
    std::vector<Owned> unreleased;
    bool lost = false;
    std::unique_ptr<QRhiBuffer> markBuffer;
    std::deque<std::unique_ptr<CompletionMark>> marks;  // in frame order

    void freeOwned(Owned& o) {
        for (size_t i = 0; i < 2; ++i) {
            if (o.images[i]) df->vkDestroyImage(dev, o.images[i], nullptr);
            if (o.memory[i]) df->vkFreeMemory(dev, o.memory[i], nullptr);
            o.images[i] = VK_NULL_HANDLE;
            o.memory[i] = VK_NULL_HANDLE;
        }
        av_frame_free(&o.drm);  // releases the DMA-BUF fds and returns the VA surface
    }

    // The device is gone: every submission counts as complete, and every
    // object may be destroyed. The interop accepts no more frames.
    void lose() {
        lost = true;
        for (Pending& p : pending) {
            df->vkFreeCommandBuffers(dev, pool, 1, &p.cb);
            df->vkDestroyFence(dev, p.fence, nullptr);
            freeOwned(p.owned);
        }
        pending.clear();
        for (Owned& o : unreleased) freeOwned(o);
        unreleased.clear();
    }

    // Frees what the completed submissions held.
    void collect() {
        for (size_t i = 0; i < pending.size();) {
            const VkResult st = df->vkGetFenceStatus(dev, pending[i].fence);
            if (st == VK_ERROR_DEVICE_LOST) {
                lose();
                return;
            }
            if (st != VK_SUCCESS) {
                ++i;
                continue;
            }
            df->vkFreeCommandBuffers(dev, pool, 1, &pending[i].cb);
            df->vkResetFences(dev, 1, &pending[i].fence);
            freeFences.push_back(pending[i].fence);
            freeOwned(pending[i].owned);
            pending.erase(pending.begin() + static_cast<std::ptrdiff_t>(i));
        }
    }

    // Records `barriers` and submits them on Qt's queue, ahead of the frame
    // that samples the images (queue submission order makes the barriers
    // visible to it). The command buffer, the fence and `owned` stay alive
    // until the fence signals. Returns false when nothing was submitted;
    // `owned` is then still the caller's.
    bool submit(const VkImageMemoryBarrier* barriers, std::uint32_t count, VkPipelineStageFlags src,
                VkPipelineStageFlags dst, Owned& owned, std::string* why) {
        VkCommandBufferAllocateInfo cbInfo{};
        cbInfo.sType = VK_STRUCTURE_TYPE_COMMAND_BUFFER_ALLOCATE_INFO;
        cbInfo.commandPool = pool;
        cbInfo.level = VK_COMMAND_BUFFER_LEVEL_PRIMARY;
        cbInfo.commandBufferCount = 1;
        VkCommandBuffer cb = VK_NULL_HANDLE;
        if (df->vkAllocateCommandBuffers(dev, &cbInfo, &cb) != VK_SUCCESS) {
            *why = "no command buffer";
            return false;
        }
        VkCommandBufferBeginInfo begin{};
        begin.sType = VK_STRUCTURE_TYPE_COMMAND_BUFFER_BEGIN_INFO;
        begin.flags = VK_COMMAND_BUFFER_USAGE_ONE_TIME_SUBMIT_BIT;
        df->vkBeginCommandBuffer(cb, &begin);
        df->vkCmdPipelineBarrier(cb, src, dst, 0, 0, nullptr, 0, nullptr, count, barriers);
        df->vkEndCommandBuffer(cb);
        VkFence fence = VK_NULL_HANDLE;
        if (!freeFences.empty()) {
            fence = freeFences.back();
            freeFences.pop_back();
        } else {
            VkFenceCreateInfo fenceInfo{};
            fenceInfo.sType = VK_STRUCTURE_TYPE_FENCE_CREATE_INFO;
            if (df->vkCreateFence(dev, &fenceInfo, nullptr, &fence) != VK_SUCCESS) {
                df->vkFreeCommandBuffers(dev, pool, 1, &cb);  // never submitted
                *why = "no fence";
                return false;
            }
        }
        VkSubmitInfo submitInfo{};
        submitInfo.sType = VK_STRUCTURE_TYPE_SUBMIT_INFO;
        submitInfo.commandBufferCount = 1;
        submitInfo.pCommandBuffers = &cb;
        const VkResult rc = df->vkQueueSubmit(queue, 1, &submitInfo, fence);
        if (rc != VK_SUCCESS) {
            // A failed submission did not run: its objects are free to go.
            df->vkFreeCommandBuffers(dev, pool, 1, &cb);
            freeFences.push_back(fence);
            if (rc == VK_ERROR_DEVICE_LOST) lose();
            *why = rc == VK_ERROR_DEVICE_LOST ? "the Vulkan device is lost" : "vkQueueSubmit failed";
            return false;
        }
        pending.push_back(Pending{fence, cb, owned});
        owned = Owned{};
        return true;
    }

    // Submits the release of `owned`'s images to the foreign family in the
    // external layout; `owned` is then freed when that submission completes.
    // False when nothing was submitted: `owned` is still the caller's.
    bool release(Owned& owned, std::string* why) {
        VkImageMemoryBarrier barriers[2]{};
        std::uint32_t count = 0;
        for (size_t i = 0; i < 2; ++i) {
            if (!owned.images[i]) continue;
            VkImageMemoryBarrier& b = barriers[count++];
            b.sType = VK_STRUCTURE_TYPE_IMAGE_MEMORY_BARRIER;
            b.srcAccessMask = VK_ACCESS_SHADER_READ_BIT;
            b.dstAccessMask = 0;
            b.oldLayout = VK_IMAGE_LAYOUT_SHADER_READ_ONLY_OPTIMAL;
            b.newLayout = VK_IMAGE_LAYOUT_GENERAL;
            b.srcQueueFamilyIndex = queueFamily;
            b.dstQueueFamilyIndex = VK_QUEUE_FAMILY_FOREIGN_EXT;
            b.image = owned.images[i];
            b.subresourceRange = {VK_IMAGE_ASPECT_COLOR_BIT, 0, 1, 0, 1};
        }
        if (count == 0) {
            *why = "no image to release";
            return false;
        }
        return submit(barriers, count, VK_PIPELINE_STAGE_FRAGMENT_SHADER_BIT, VK_PIPELINE_STAGE_BOTTOM_OF_PIPE_BIT,
                      owned, why);
    }

    // Retries the releases that could not be submitted, oldest first; stops
    // at the first that fails again (the same shortage fails the rest).
    void retryReleases() {
        while (!lost && !unreleased.empty()) {
            std::string why;
            if (!release(unreleased.front(), &why)) return;  // a lost device freed them
            unreleased.erase(unreleased.begin());
        }
    }

    // The memory planes `modifier` needs for `format`, after checking that a
    // sampled image with it can be imported from a DMA-BUF of `size`. 0 with
    // `why` set when it cannot.
    std::uint32_t modifierPlanes(VkFormat format, std::uint64_t modifier, QSize size, std::string* why) {
        VkDrmFormatModifierPropertiesListEXT list{};
        list.sType = VK_STRUCTURE_TYPE_DRM_FORMAT_MODIFIER_PROPERTIES_LIST_EXT;
        VkFormatProperties2 props{};
        props.sType = VK_STRUCTURE_TYPE_FORMAT_PROPERTIES_2;
        props.pNext = &list;
        f->vkGetPhysicalDeviceFormatProperties2(physDev, format, &props);
        std::vector<VkDrmFormatModifierPropertiesEXT> mods(list.drmFormatModifierCount);
        list.pDrmFormatModifierProperties = mods.data();
        f->vkGetPhysicalDeviceFormatProperties2(physDev, format, &props);
        std::uint32_t planes = 0;
        for (const auto& m : mods) {
            if (m.drmFormatModifier == modifier && (m.drmFormatModifierTilingFeatures & VK_FORMAT_FEATURE_SAMPLED_IMAGE_BIT)) {
                planes = m.drmFormatModifierPlaneCount;
            }
        }
        if (planes == 0) {
            *why = "the device cannot sample this DRM format modifier";
            return 0;
        }
        VkPhysicalDeviceImageDrmFormatModifierInfoEXT modInfo{};
        modInfo.sType = VK_STRUCTURE_TYPE_PHYSICAL_DEVICE_IMAGE_DRM_FORMAT_MODIFIER_INFO_EXT;
        modInfo.drmFormatModifier = modifier;
        modInfo.sharingMode = VK_SHARING_MODE_EXCLUSIVE;
        VkPhysicalDeviceExternalImageFormatInfo extInfo{};
        extInfo.sType = VK_STRUCTURE_TYPE_PHYSICAL_DEVICE_EXTERNAL_IMAGE_FORMAT_INFO;
        extInfo.pNext = &modInfo;
        extInfo.handleType = VK_EXTERNAL_MEMORY_HANDLE_TYPE_DMA_BUF_BIT_EXT;
        VkPhysicalDeviceImageFormatInfo2 info{};
        info.sType = VK_STRUCTURE_TYPE_PHYSICAL_DEVICE_IMAGE_FORMAT_INFO_2;
        info.pNext = &extInfo;
        info.format = format;
        info.type = VK_IMAGE_TYPE_2D;
        info.tiling = VK_IMAGE_TILING_DRM_FORMAT_MODIFIER_EXT;
        info.usage = VK_IMAGE_USAGE_SAMPLED_BIT;
        VkExternalImageFormatProperties extProps{};
        extProps.sType = VK_STRUCTURE_TYPE_EXTERNAL_IMAGE_FORMAT_PROPERTIES;
        VkImageFormatProperties2 out{};
        out.sType = VK_STRUCTURE_TYPE_IMAGE_FORMAT_PROPERTIES_2;
        out.pNext = &extProps;
        if (f->vkGetPhysicalDeviceImageFormatProperties2(physDev, &info, &out) != VK_SUCCESS ||
            !(extProps.externalMemoryProperties.externalMemoryFeatures & VK_EXTERNAL_MEMORY_FEATURE_IMPORTABLE_BIT)) {
            *why = "a DMA-BUF image with this modifier cannot be imported";
            return 0;
        }
        if (out.imageFormatProperties.maxExtent.width < static_cast<std::uint32_t>(size.width()) ||
            out.imageFormatProperties.maxExtent.height < static_cast<std::uint32_t>(size.height())) {
            *why = "the frame is larger than an imported image may be";
            return 0;
        }
        return planes;
    }
};

void trackCompletion(QRhiCommandBuffer* cb, long long frameNumber) {
    // QRhi has waited for frame N - FramesInFlight when frame N begins. The
    // buffer readback that flush() records in frame N completes once frame N
    // has run, which also covers the last frame before QRhi::finish().
    advanceCompleted(frameNumber - g_framesInFlight.load());
    t_frameMark = {cb, frameNumber};
}

long long completedFrame() {
    return g_completedFrame.load();
}

int FrameRef::live() {
    return g_liveFrameRefs.load();
}

int VulkanInterop::liveCompletionMarks() {
    return g_liveCompletionMarks.load();
}

int FrameRef::releasedInFlight() {
    return g_releasedInFlight.load();
}

FrameRef::~FrameRef() {
    if (m_lastUse >= 0 && m_lastUse > g_completedFrame.load()) ++g_releasedInFlight;
    for (auto& p : m_planes) p.reset();  // the QRhi wrappers before the images
    if (m_interop) {
        m_interop->retire(m_images, m_memory, m_drm, m_acquired);
    } else {
        av_frame_free(&m_drm);
    }
    m_drm = nullptr;
    --g_liveFrameRefs;
}

VulkanInterop::VulkanInterop() : m_vk(std::make_unique<Vk>()) {}

VulkanInterop::~VulkanInterop() {
    Vk& vk = *m_vk;
    if (!vk.dev || !vk.df) return;
    // Teardown: wait for every submission (the device may only be idle or
    // lost here), then free. A frame whose release never ran is freed too:
    // no frame samples it (the retire queue waited for its last use), and
    // the decoder that would reuse its VA surface is going as well.
    for (Pending& p : vk.pending) {
        if (!vk.lost && vk.df->vkWaitForFences(vk.dev, 1, &p.fence, VK_TRUE, UINT64_MAX) == VK_ERROR_DEVICE_LOST) {
            vk.lost = true;
        }
        vk.df->vkFreeCommandBuffers(vk.dev, vk.pool, 1, &p.cb);
        vk.df->vkDestroyFence(vk.dev, p.fence, nullptr);
        vk.freeOwned(p.owned);
    }
    vk.pending.clear();
    for (Owned& o : vk.unreleased) vk.freeOwned(o);
    vk.unreleased.clear();
    for (VkFence f : vk.freeFences) vk.df->vkDestroyFence(vk.dev, f, nullptr);
    if (vk.pool) vk.df->vkDestroyCommandPool(vk.dev, vk.pool, nullptr);
    // QRhi still writes a readback that has not completed: its callback
    // takes the mark and frees it (CompletionMark).
    for (auto& mark : vk.marks) {
        if (mark->state.exchange(CompletionMark::Orphaned) == CompletionMark::Recorded) (void)mark.release();
    }
}

void VulkanInterop::flush() {
    Vk& vk = *m_vk;
    std::lock_guard lock(vk.mutex);
    while (!vk.marks.empty() && vk.marks.front()->state.load() == CompletionMark::Completed) vk.marks.pop_front();
    if (t_frameMark.cb && m_rhi) {
        QRhiResourceUpdateBatch* batch = m_rhi->nextResourceUpdateBatch();
        if (!vk.markBuffer) {
            vk.markBuffer.reset(m_rhi->newBuffer(QRhiBuffer::Immutable, QRhiBuffer::VertexBuffer, 16));
            if (vk.markBuffer->create()) {
                static constexpr std::array<char, 16> zeros{};
                batch->uploadStaticBuffer(vk.markBuffer.get(), zeros.data());
            } else {
                vk.markBuffer.reset();
            }
        }
        if (vk.markBuffer) {
            auto mark = std::make_unique<CompletionMark>();
            CompletionMark* m = mark.get();
            const long long frame = t_frameMark.frame;
            // QRhi calls a copy of this function and no longer touches the
            // result, so an orphaned mark may delete itself here.
            m->result.completed = [m, frame] {
                advanceCompleted(frame);
                if (m->state.exchange(CompletionMark::Completed) == CompletionMark::Orphaned) delete m;
            };
            batch->readBackBuffer(vk.markBuffer.get(), 0, 16, &m->result);
            vk.marks.push_back(std::move(mark));
        }
        t_frameMark.cb->resourceUpdate(batch);
        t_frameMark = {};
    }
    if (vk.lost) return;
    vk.collect();
    vk.retryReleases();
}

void VulkanInterop::retire(std::array<std::uint64_t, 2> images, std::array<std::uint64_t, 2> memory, AVFrame* drm,
                           bool acquired) {
    Vk& vk = *m_vk;
    std::lock_guard lock(vk.mutex);
    Owned owned;
    for (size_t i = 0; i < 2; ++i) {
        owned.images[i] = reinterpret_cast<VkImage>(images[i]);
        owned.memory[i] = reinterpret_cast<VkDeviceMemory>(memory[i]);
    }
    owned.drm = drm;
    if (vk.lost || !acquired || (!owned.images[0] && !owned.images[1])) {
        // Never on the GPU (no acquire, no image), or the device is gone.
        vk.freeOwned(owned);
        return;
    }
    // Release to the foreign family in the external layout, then free with
    // the surface once that has run (review F1). The retire queue already
    // waited until no frame in flight samples the images.
    std::string why;
    if (vk.release(owned, &why)) return;
    if (vk.lost) {
        vk.freeOwned(owned);  // submit() lost the device: nothing runs any more
        return;
    }
    // No release could be submitted. Waiting for the queue would not move
    // the images to the foreign family, so the VA surface must not go back
    // to the decoder yet: keep it until a retried release succeeds.
    vk.unreleased.push_back(owned);
}

QByteArrayList VulkanInterop::requiredDeviceExtensions() {
    // VK_EXT_image_drm_format_modifier needs VK_KHR_image_format_list below
    // Vulkan 1.2, and the instance asks for 1.1 (HwWindow.cpp).
    return {QByteArrayLiteral("VK_KHR_external_memory_fd"), QByteArrayLiteral("VK_EXT_external_memory_dma_buf"),
            QByteArrayLiteral("VK_KHR_image_format_list"), QByteArrayLiteral("VK_EXT_image_drm_format_modifier"),
            QByteArrayLiteral("VK_EXT_queue_family_foreign")};
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
    interop->m_rhi = rhi;
    g_framesInFlight.store(rhi->resourceLimit(QRhi::FramesInFlight));
    return interop;
}

std::shared_ptr<FrameRef> VulkanInterop::wrap(const AVFrame* frame, std::string* error) {
    Vk& vk = *m_vk;
    std::lock_guard lock(vk.mutex);
    const auto fail = [&](std::string reason) -> std::shared_ptr<FrameRef> {
        if (error) *error = std::move(reason);
        return nullptr;
    };
    if (vk.lost) return fail("the Vulkan device is lost");
    vk.collect();
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
        // The memory planes of picture plane p: layer p when the export has
        // one layer per plane (a CCS modifier adds auxiliary memory planes to
        // the layer), or plane p of a single NV12 layer.
        std::vector<const AVDRMPlaneDescriptor*> memPlanes;
        if (desc->nb_layers >= 2) {
            const AVDRMLayerDescriptor& layer = desc->layers[p];
            for (int i = 0; i < layer.nb_planes; ++i) memPlanes.push_back(&layer.planes[i]);
        } else if (desc->nb_layers == 1 && desc->layers[0].nb_planes == 2) {
            memPlanes.push_back(&desc->layers[0].planes[p]);
        } else {
            return fail("unsupported DRM PRIME layout (" + std::to_string(desc->nb_layers) + " layers)");
        }
        if (memPlanes.empty()) return fail("the DRM PRIME frame has no plane " + std::to_string(p));
        const int objectIndex = memPlanes[0]->object_index;
        for (const auto* mp : memPlanes) {
            // Planes in separate objects need a disjoint image, which this
            // import does not build.
            if (mp->object_index != objectIndex) return fail("the planes of a DRM layer live in separate objects");
        }
        const AVDRMObjectDescriptor& object = desc->objects[objectIndex];

        std::string why;
        const std::uint32_t modifierPlanes = vk.modifierPlanes(formats[p], object.format_modifier, sizes[p], &why);
        if (modifierPlanes == 0) return fail(why);
        if (modifierPlanes != memPlanes.size()) {
            return fail("the modifier needs " + std::to_string(modifierPlanes) + " memory planes, the export has " +
                        std::to_string(memPlanes.size()));
        }
        std::vector<VkSubresourceLayout> layouts(memPlanes.size());
        for (size_t i = 0; i < memPlanes.size(); ++i) {
            layouts[i].offset = static_cast<VkDeviceSize>(memPlanes[i]->offset);
            layouts[i].rowPitch = static_cast<VkDeviceSize>(memPlanes[i]->pitch);
        }
        VkImageDrmFormatModifierExplicitCreateInfoEXT modifier{};
        modifier.sType = VK_STRUCTURE_TYPE_IMAGE_DRM_FORMAT_MODIFIER_EXPLICIT_CREATE_INFO_EXT;
        modifier.drmFormatModifier = object.format_modifier;
        modifier.drmFormatModifierPlaneCount = modifierPlanes;
        modifier.pPlaneLayouts = layouts.data();
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
        info.initialLayout = VK_IMAGE_LAYOUT_UNDEFINED;  // creation only; the contents come with the acquire below
        VkImage image = VK_NULL_HANDLE;
        if (vk.df->vkCreateImage(vk.dev, &info, nullptr, &image) != VK_SUCCESS) {
            return fail("vkCreateImage for a DMA-BUF plane failed");
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

        // Acquire from the foreign (VAAPI) family. The old layout is the
        // external one, GENERAL, not UNDEFINED, so the decoded contents are
        // kept (review F1).
        VkImageMemoryBarrier& b = barriers[p];
        b.sType = VK_STRUCTURE_TYPE_IMAGE_MEMORY_BARRIER;
        b.srcAccessMask = 0;
        b.dstAccessMask = VK_ACCESS_SHADER_READ_BIT;
        b.oldLayout = VK_IMAGE_LAYOUT_GENERAL;
        b.newLayout = VK_IMAGE_LAYOUT_SHADER_READ_ONLY_OPTIMAL;
        b.srcQueueFamilyIndex = VK_QUEUE_FAMILY_FOREIGN_EXT;
        b.dstQueueFamilyIndex = vk.queueFamily;
        b.image = image;
        b.subresourceRange = {VK_IMAGE_ASPECT_COLOR_BIT, 0, 1, 0, 1};
    }

    // Submitted on Qt's queue ahead of the frame that samples the images;
    // the submission is collected when its fence signals (review F2).
    Owned none;
    std::string why;
    if (!vk.submit(barriers, 2, VK_PIPELINE_STAGE_TOP_OF_PIPE_BIT, VK_PIPELINE_STAGE_FRAGMENT_SHADER_BIT, none, &why)) {
        return fail("the DMA-BUF acquire was not submitted: " + why);
    }
    ref->m_acquired = true;

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

int syncFrame(const AVFrame* frame) {
    if (!frame->hw_frames_ctx) return AVERROR(EINVAL);
    const auto* frames = reinterpret_cast<const AVHWFramesContext*>(frame->hw_frames_ctx->data);
    const auto* device = static_cast<const AVVAAPIDeviceContext*>(frames->device_ctx->hwctx);
    const auto surface = static_cast<VASurfaceID>(reinterpret_cast<std::uintptr_t>(frame->data[3]));
    return vaSyncSurface(device->display, surface) == VA_STATUS_SUCCESS ? 0 : AVERROR_EXTERNAL;
}

void CacheFrameFree::operator()(AVFrame* frame) const {
    av_frame_free(&frame);
}

CacheFrame cacheCopy(const AVFrame* frame) {
    CacheFrame copy(av_frame_alloc());
    if (!copy) return nullptr;
    copy->format = AV_PIX_FMT_NV12;
    if (av_hwframe_transfer_data(copy.get(), frame, 0) < 0 || av_frame_copy_props(copy.get(), frame) < 0) {
        return nullptr;
    }
    return copy;
}

}  // namespace nt::hw
