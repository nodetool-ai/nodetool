// Vulkan import of shared textures into the QRhi device of a Qt Quick
// window. The producer (wgpu) and Qt each have their own VkDevice on the
// same physical device. The memory comes over as an opaque file descriptor.
//
// Ownership of the content follows the Vulkan external memory rules: the
// producer releases the image to VK_QUEUE_FAMILY_EXTERNAL in
// SHADER_READ_ONLY_OPTIMAL before a frame is published, acquire() takes it
// for Qt's queue family, and release() gives it back the same way. Each
// transfer is one command buffer on Qt's queue. Qt's queue is used on the
// render thread only, where Qt itself submits, so submissions are ordered:
// an acquire runs before the frame that samples the image, a release after
// the last one.
#include "TextureImporter.h"

#include <QLoggingCategory>
#include <QQuickWindow>
#include <QSGRendererInterface>
#include <QSGTexture>
#include <QVulkanDeviceFunctions>
#include <QVulkanFunctions>
#include <QVulkanInstance>
#include <private/qquickwindow_p.h>

#include <algorithm>
#include <cstring>
#include <map>

Q_LOGGING_CATEGORY(lcVulkanImport, "nodetool.gpupreview.vulkan")

namespace nt::preview {
namespace {

namespace gpu = gr::host::gpu;

QString vkError(const char* what, VkResult result) {
    return QStringLiteral("%1 failed (VkResult %2)").arg(QLatin1String(what)).arg(int(result));
}

class VulkanImporter final : public TextureImporter {
public:
    VulkanImporter(QQuickWindow* window, QVulkanInstance* instance, VkPhysicalDevice physicalDevice, VkDevice device,
                   VkQueue queue, uint32_t queueFamily)
        : m_window(window), m_f(instance->functions()), m_df(instance->deviceFunctions(device)),
          m_physicalDevice(physicalDevice), m_device(device), m_queue(queue), m_queueFamily(queueFamily) {
        m_id.sType = VK_STRUCTURE_TYPE_PHYSICAL_DEVICE_ID_PROPERTIES;
        VkPhysicalDeviceProperties2 properties{};
        properties.sType = VK_STRUCTURE_TYPE_PHYSICAL_DEVICE_PROPERTIES_2;
        properties.pNext = &m_id;
        m_f->vkGetPhysicalDeviceProperties2(physicalDevice, &properties);
    }

    ~VulkanImporter() override { shutdown(); }

    bool createPool(QString* reason) {
        VkCommandPoolCreateInfo info{};
        info.sType = VK_STRUCTURE_TYPE_COMMAND_POOL_CREATE_INFO;
        info.flags = VK_COMMAND_POOL_CREATE_RESET_COMMAND_BUFFER_BIT;
        info.queueFamilyIndex = m_queueFamily;
        const VkResult result = m_df->vkCreateCommandPool(m_device, &info, nullptr, &m_pool);
        if (result != VK_SUCCESS) *reason = vkError("vkCreateCommandPool", result);
        return result == VK_SUCCESS;
    }

    QSGTexture* acquire(const gpu::FrameRing::Frame& frame, QString* error) override {
        const gpu::ShareDescriptor& d = frame.texture->descriptor();
        if (d.backend != gpu::ShareBackend::Vulkan) {
            *error = QStringLiteral("the frame comes from a %1 device and the window renders with Vulkan")
                         .arg(QLatin1String(gpu::shareBackendName(d.backend)));
            return nullptr;
        }
        // An opaque descriptor is valid only on the same physical device and driver.
        if (std::memcmp(d.vulkanDeviceUuid.data(), m_id.deviceUUID, VK_UUID_SIZE) != 0 ||
            std::memcmp(d.vulkanDriverUuid.data(), m_id.driverUUID, VK_UUID_SIZE) != 0) {
            *error = QStringLiteral("the compute device and the window use different Vulkan devices or drivers, "
                                    "so their memory cannot be shared");
            return nullptr;
        }
        auto it = m_imports.find(frame.texture->id());
        if (it == m_imports.end()) {
            Import created;
            if (!import(*frame.texture, created, error)) {
                destroy(created);
                return nullptr;
            }
            created.lease = frame.texture;
            it = m_imports.emplace(frame.texture->id(), std::move(created)).first;
        }
        Import& entry = it->second;
        if (entry.acquired) {
            *error = QStringLiteral("a shared texture was presented twice without a release");
            return nullptr;
        }
        if (!transfer(entry.image, false, nullptr, error)) return nullptr;
        entry.acquired = true;
        entry.slot = frame.slot;
        return entry.texture.get();
    }

    void release(std::size_t slot) override {
        for (auto& [id, entry] : m_imports) {
            if (!entry.acquired || entry.slot != slot) continue;
            Pending pending;
            pending.slot = slot;
            QString error;
            if (transfer(entry.image, true, &pending, &error)) {
                m_pending.push_back(pending);
            } else {
                // The device is failing. The slot must still return to the
                // producer, which otherwise starves.
                qCWarning(lcVulkanImport) << "release of a shared texture failed:" << error;
                m_failed.push_back(slot);
            }
            entry.acquired = false;
            return;
        }
        m_failed.push_back(slot);
    }

    std::vector<std::size_t> collect() override {
        std::vector<std::size_t> done;
        done.swap(m_failed);
        for (auto it = m_pending.begin(); it != m_pending.end();) {
            const VkResult status = m_df->vkGetFenceStatus(m_device, it->fence);
            if (status == VK_NOT_READY) {
                ++it;
                continue;
            }
            // Signaled, or the device is lost: either way the GPU is done with it.
            if (it->slot != kNoSlot) done.push_back(it->slot);
            free(*it);
            it = m_pending.erase(it);
        }
        return done;
    }

    bool pending() const override { return !m_pending.empty() || !m_failed.empty(); }

    void prune(const std::vector<std::uint64_t>& live) override {
        for (auto it = m_imports.begin(); it != m_imports.end();) {
            if (it->second.acquired || std::find(live.begin(), live.end(), it->first) != live.end()) {
                ++it;
                continue;
            }
            // Not acquired: the producer owns the content, and every frame of
            // Qt's that sampled it completed before its release fence did.
            m_retired.push_back(std::move(it->second));
            it = m_imports.erase(it);
        }
        // Destroyed once no transfer is in flight: every frame that
        // sampled them was submitted before their release.
        if (m_pending.empty()) {
            for (Import& entry : m_retired) destroy(entry);
            m_retired.clear();
        }
    }

    void shutdown() override {
        if (!m_device) return;
        // The window's frames are finished: nothing samples the images, and
        // the transfers below may wait.
        const bool lost = m_df->vkDeviceWaitIdle(m_device) == VK_ERROR_DEVICE_LOST;
        for (auto& [id, entry] : m_imports) {
            if (entry.acquired && !lost) {
                Pending pending;
                QString error;
                if (transfer(entry.image, true, &pending, &error)) m_pending.push_back(pending);
            }
            entry.acquired = false;
        }
        for (Pending& pending : m_pending) {
            if (!lost) m_df->vkWaitForFences(m_device, 1, &pending.fence, VK_TRUE, UINT64_MAX);
            free(pending);
        }
        m_pending.clear();
        m_failed.clear();
        for (auto& [id, entry] : m_imports) destroy(entry);
        m_imports.clear();
        for (Import& entry : m_retired) destroy(entry);
        m_retired.clear();
        if (m_pool) m_df->vkDestroyCommandPool(m_device, m_pool, nullptr);
        m_pool = VK_NULL_HANDLE;
        m_device = VK_NULL_HANDLE;
    }

    int imports() const override { return int(m_imports.size()); }

private:
    static constexpr std::size_t kNoSlot = ~std::size_t(0);

    // One opened texture: the image and memory on Qt's device, and Qt's
    // wrapper of the image.
    struct Import {
        // Keeps the producer's allocation alive while Qt may sample it.
        // Shared with the producer's ring (gpu_share.h).
        std::shared_ptr<gpu::SharedTexture> lease;
        VkImage image = VK_NULL_HANDLE;
        VkDeviceMemory memory = VK_NULL_HANDLE;
        std::unique_ptr<QSGTexture> texture;
        bool acquired = false;
        std::size_t slot = kNoSlot;
    };

    // One transfer in flight on Qt's queue.
    struct Pending {
        VkCommandBuffer commands = VK_NULL_HANDLE;
        VkFence fence = VK_NULL_HANDLE;
        std::size_t slot = kNoSlot;
    };

    bool import(const gpu::SharedTexture& shared, Import& out, QString* error) {
        const gpu::ShareDescriptor& d = shared.descriptor();

        // Can this device import the format with this usage?
        VkPhysicalDeviceExternalImageFormatInfo externalInfo{};
        externalInfo.sType = VK_STRUCTURE_TYPE_PHYSICAL_DEVICE_EXTERNAL_IMAGE_FORMAT_INFO;
        externalInfo.handleType = VK_EXTERNAL_MEMORY_HANDLE_TYPE_OPAQUE_FD_BIT;
        VkPhysicalDeviceImageFormatInfo2 formatInfo{};
        formatInfo.sType = VK_STRUCTURE_TYPE_PHYSICAL_DEVICE_IMAGE_FORMAT_INFO_2;
        formatInfo.pNext = &externalInfo;
        formatInfo.format = VkFormat(d.vulkanFormat);
        formatInfo.type = VK_IMAGE_TYPE_2D;
        formatInfo.tiling = VK_IMAGE_TILING_OPTIMAL;
        formatInfo.usage = VkImageUsageFlags(d.vulkanUsage);
        VkExternalImageFormatProperties externalProperties{};
        externalProperties.sType = VK_STRUCTURE_TYPE_EXTERNAL_IMAGE_FORMAT_PROPERTIES;
        VkImageFormatProperties2 formatProperties{};
        formatProperties.sType = VK_STRUCTURE_TYPE_IMAGE_FORMAT_PROPERTIES_2;
        formatProperties.pNext = &externalProperties;
        VkResult result =
            m_f->vkGetPhysicalDeviceImageFormatProperties2(m_physicalDevice, &formatInfo, &formatProperties);
        if (result != VK_SUCCESS || !(externalProperties.externalMemoryProperties.externalMemoryFeatures &
                                      VK_EXTERNAL_MEMORY_FEATURE_IMPORTABLE_BIT)) {
            *error = QStringLiteral("the window's Vulkan device cannot import this texture format");
            return false;
        }

        // The same parameters as the producer's image (gpu_share_vulkan.cpp).
        VkExternalMemoryImageCreateInfo external{};
        external.sType = VK_STRUCTURE_TYPE_EXTERNAL_MEMORY_IMAGE_CREATE_INFO;
        external.handleTypes = VK_EXTERNAL_MEMORY_HANDLE_TYPE_OPAQUE_FD_BIT;
        VkImageCreateInfo info{};
        info.sType = VK_STRUCTURE_TYPE_IMAGE_CREATE_INFO;
        info.pNext = &external;
        info.imageType = VK_IMAGE_TYPE_2D;
        info.format = VkFormat(d.vulkanFormat);
        info.extent = {d.width, d.height, 1};
        info.mipLevels = 1;
        info.arrayLayers = 1;
        info.samples = VK_SAMPLE_COUNT_1_BIT;
        info.tiling = VK_IMAGE_TILING_OPTIMAL;
        info.usage = VkImageUsageFlags(d.vulkanUsage);
        info.sharingMode = VK_SHARING_MODE_EXCLUSIVE;
        info.initialLayout = VK_IMAGE_LAYOUT_UNDEFINED;
        result = m_df->vkCreateImage(m_device, &info, nullptr, &out.image);
        if (result != VK_SUCCESS) {
            *error = vkError("vkCreateImage", result);
            return false;
        }

        std::string openError;
        gpu::NativeShareHandle handle = shared.open(openError);
        if (handle.memoryFd() < 0) {
            *error = QStringLiteral("cannot open the shared texture: %1").arg(QString::fromStdString(openError));
            return false;
        }
        VkMemoryDedicatedAllocateInfo dedicated{};
        dedicated.sType = VK_STRUCTURE_TYPE_MEMORY_DEDICATED_ALLOCATE_INFO;
        dedicated.image = out.image;
        VkImportMemoryFdInfoKHR imported{};
        imported.sType = VK_STRUCTURE_TYPE_IMPORT_MEMORY_FD_INFO_KHR;
        imported.pNext = &dedicated;
        imported.handleType = VK_EXTERNAL_MEMORY_HANDLE_TYPE_OPAQUE_FD_BIT;
        imported.fd = handle.memoryFd();
        VkMemoryAllocateInfo allocate{};
        allocate.sType = VK_STRUCTURE_TYPE_MEMORY_ALLOCATE_INFO;
        allocate.pNext = &imported;
        allocate.allocationSize = d.vulkanAllocationSize;
        allocate.memoryTypeIndex = d.vulkanMemoryType;
        result = m_df->vkAllocateMemory(m_device, &allocate, nullptr, &out.memory);
        if (result != VK_SUCCESS) {
            *error = vkError("importing the shared memory (vkAllocateMemory)", result);
            return false;
        }
        handle.releaseFd();  // the import owns the descriptor now
        result = m_df->vkBindImageMemory(m_device, out.image, out.memory, 0);
        if (result != VK_SUCCESS) {
            *error = vkError("vkBindImageMemory", result);
            return false;
        }

        // Qt wraps the image and samples it in the layout acquire() leaves.
        // The public QSGVulkanTexture::fromNative() assumes RGBA8, so the
        // format goes through the private overload.
        QQuickWindow::CreateTextureOptions options = QQuickWindow::TextureHasAlphaChannel;
        out.texture.reset(QQuickWindowPrivate::get(m_window)->createTextureFromNativeTexture(
            quint64(out.image), VK_IMAGE_LAYOUT_SHADER_READ_ONLY_OPTIMAL, uint(d.vulkanFormat),
            QSize(int(d.width), int(d.height)), options));
        if (!out.texture) {
            *error = QStringLiteral("Qt could not wrap the imported Vulkan image");
            return false;
        }
        return true;
    }

    // One queue family transfer of `image` on Qt's queue, in
    // SHADER_READ_ONLY_OPTIMAL on both sides. With `pending`, a fence
    // reports its completion.
    bool transfer(VkImage image, bool toExternal, Pending* pending, QString* error) {
        Pending local;
        VkCommandBufferAllocateInfo allocate{};
        allocate.sType = VK_STRUCTURE_TYPE_COMMAND_BUFFER_ALLOCATE_INFO;
        allocate.commandPool = m_pool;
        allocate.level = VK_COMMAND_BUFFER_LEVEL_PRIMARY;
        allocate.commandBufferCount = 1;
        VkResult result = m_df->vkAllocateCommandBuffers(m_device, &allocate, &local.commands);
        if (result != VK_SUCCESS) {
            *error = vkError("vkAllocateCommandBuffers", result);
            return false;
        }
        VkFenceCreateInfo fenceInfo{};
        fenceInfo.sType = VK_STRUCTURE_TYPE_FENCE_CREATE_INFO;
        result = m_df->vkCreateFence(m_device, &fenceInfo, nullptr, &local.fence);
        if (result != VK_SUCCESS) {
            free(local);
            *error = vkError("vkCreateFence", result);
            return false;
        }

        VkCommandBufferBeginInfo begin{};
        begin.sType = VK_STRUCTURE_TYPE_COMMAND_BUFFER_BEGIN_INFO;
        begin.flags = VK_COMMAND_BUFFER_USAGE_ONE_TIME_SUBMIT_BIT;
        result = m_df->vkBeginCommandBuffer(local.commands, &begin);
        if (result == VK_SUCCESS) {
            VkImageMemoryBarrier barrier{};
            barrier.sType = VK_STRUCTURE_TYPE_IMAGE_MEMORY_BARRIER;
            barrier.oldLayout = VK_IMAGE_LAYOUT_SHADER_READ_ONLY_OPTIMAL;
            barrier.newLayout = VK_IMAGE_LAYOUT_SHADER_READ_ONLY_OPTIMAL;
            barrier.srcQueueFamilyIndex = toExternal ? m_queueFamily : VK_QUEUE_FAMILY_EXTERNAL;
            barrier.dstQueueFamilyIndex = toExternal ? VK_QUEUE_FAMILY_EXTERNAL : m_queueFamily;
            barrier.image = image;
            barrier.subresourceRange = {VK_IMAGE_ASPECT_COLOR_BIT, 0, 1, 0, 1};
            barrier.srcAccessMask = toExternal ? VK_ACCESS_SHADER_READ_BIT : 0;
            barrier.dstAccessMask = toExternal ? 0 : VK_ACCESS_SHADER_READ_BIT;
            m_df->vkCmdPipelineBarrier(
                local.commands,
                toExternal ? VK_PIPELINE_STAGE_FRAGMENT_SHADER_BIT : VK_PIPELINE_STAGE_TOP_OF_PIPE_BIT,
                toExternal ? VK_PIPELINE_STAGE_BOTTOM_OF_PIPE_BIT : VK_PIPELINE_STAGE_FRAGMENT_SHADER_BIT, 0, 0,
                nullptr, 0, nullptr, 1, &barrier);
            result = m_df->vkEndCommandBuffer(local.commands);
        }
        if (result == VK_SUCCESS) {
            VkSubmitInfo submit{};
            submit.sType = VK_STRUCTURE_TYPE_SUBMIT_INFO;
            submit.commandBufferCount = 1;
            submit.pCommandBuffers = &local.commands;
            result = m_df->vkQueueSubmit(m_queue, 1, &submit, local.fence);
        }
        if (result != VK_SUCCESS) {
            free(local);
            *error = vkError("submitting an ownership transfer", result);
            return false;
        }
        if (pending) {
            local.slot = pending->slot;
            *pending = local;
        } else {
            // An acquire: nobody waits for it, but its command buffer and
            // fence are freed once it has run.
            m_pending.push_back(local);
        }
        return true;
    }

    void free(Pending& pending) {
        if (pending.fence) m_df->vkDestroyFence(m_device, pending.fence, nullptr);
        if (pending.commands) m_df->vkFreeCommandBuffers(m_device, m_pool, 1, &pending.commands);
        pending = {};
    }

    void destroy(Import& entry) {
        entry.texture.reset();
        if (entry.image) m_df->vkDestroyImage(m_device, entry.image, nullptr);
        if (entry.memory) m_df->vkFreeMemory(m_device, entry.memory, nullptr);
        entry.image = VK_NULL_HANDLE;
        entry.memory = VK_NULL_HANDLE;
        entry.lease.reset();
    }

    // Borrowed from the window, which outlives the scene graph nodes.
    QQuickWindow* m_window;
    QVulkanFunctions* m_f;
    QVulkanDeviceFunctions* m_df;
    VkPhysicalDevice m_physicalDevice;
    VkDevice m_device;
    VkQueue m_queue;
    uint32_t m_queueFamily;
    VkPhysicalDeviceIDProperties m_id{};
    VkCommandPool m_pool = VK_NULL_HANDLE;
    std::map<std::uint64_t, Import> m_imports;  // by SharedTexture::id()
    std::vector<Import> m_retired;              // pruned, destroyed once the queue drained
    std::vector<Pending> m_pending;
    std::vector<std::size_t> m_failed;          // slots whose release could not be submitted
};

}  // namespace

std::unique_ptr<TextureImporter> createVulkanImporter(QQuickWindow* window, QString* reason) {
    QSGRendererInterface* renderer = window->rendererInterface();
    auto* instance =
        static_cast<QVulkanInstance*>(renderer->getResource(window, QSGRendererInterface::VulkanInstanceResource));
    auto* physicalDevice =
        static_cast<VkPhysicalDevice*>(renderer->getResource(window, QSGRendererInterface::PhysicalDeviceResource));
    auto* device = static_cast<VkDevice*>(renderer->getResource(window, QSGRendererInterface::DeviceResource));
    auto* queue = static_cast<VkQueue*>(renderer->getResource(window, QSGRendererInterface::CommandQueueResource));
    auto* family = static_cast<uint32_t*>(
        renderer->getResource(window, QSGRendererInterface::GraphicsQueueFamilyIndexResource));
    if (!instance || !physicalDevice || !device || !queue || !family) {
        *reason = QStringLiteral("the window's Vulkan device is not available yet");
        return nullptr;
    }
    // Qt enables only the device extensions asked for before the scene
    // graph starts (prepareWindow() in GpuPreview.h).
    if (!window->graphicsConfiguration().deviceExtensions().contains(VK_KHR_EXTERNAL_MEMORY_FD_EXTENSION_NAME)) {
        *reason = QStringLiteral("the window was not prepared for texture sharing: call "
                                 "nt::preview::prepareWindow() before it is shown");
        return nullptr;
    }
    uint32_t count = 0;
    QVulkanFunctions* f = instance->functions();
    f->vkEnumerateDeviceExtensionProperties(*physicalDevice, nullptr, &count, nullptr);
    std::vector<VkExtensionProperties> extensions(count);
    f->vkEnumerateDeviceExtensionProperties(*physicalDevice, nullptr, &count, extensions.data());
    const bool supported = std::any_of(extensions.begin(), extensions.end(), [](const VkExtensionProperties& e) {
        return std::strcmp(e.extensionName, VK_KHR_EXTERNAL_MEMORY_FD_EXTENSION_NAME) == 0;
    });
    if (!supported) {
        *reason = QStringLiteral("the window's Vulkan driver does not support VK_KHR_external_memory_fd");
        return nullptr;
    }
    auto importer = std::make_unique<VulkanImporter>(window, instance, *physicalDevice, *device, *queue, *family);
    if (!importer->createPool(reason)) return nullptr;
    return importer;
}

}  // namespace nt::preview
