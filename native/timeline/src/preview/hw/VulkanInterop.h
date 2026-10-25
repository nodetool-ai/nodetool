#pragma once

// Linux hardware frames (DESIGN.md D15, PLAN M6). FFmpeg decodes with VAAPI.
// Each frame is exported as DMA-BUF (av_hwframe_map to DRM PRIME, one layer
// per plane) and each plane is imported into the QRhi's Vulkan device as its
// own VkImage (R8 for Y, R8G8 for CbCr) with its DRM format modifier, then
// wrapped with QRhiTexture::createFrom(). No CPU copy. A one-time barrier
// acquires the images from the foreign (VAAPI) queue family.
//
// D15 names FFmpeg's Vulkan decoder first and VAAPI as the fallback. This
// build takes VAAPI with DMA-BUF import: FFmpeg's Vulkan decoder outputs one
// multi-planar VkImage, and QRhi samples one view per QRhiTexture with the
// colour aspect, which a multi-planar image does not allow. The per-plane
// DMA-BUF import matches the R8 + RG8 planes the compositor already draws.
//
// Needs a Vulkan QRhi (HwWindow.cpp selects it when hardware decode is on)
// and the device extensions of requiredDeviceExtensions(). Without them
// create() returns null and the sources decode in software.
//
// Written for M6 and not compiled yet: the development machine is macOS.

#include <QByteArrayList>
#include <QSize>

#include <array>
#include <cstdint>
#include <memory>
#include <string>

class QRhi;
class QRhiTexture;
class QRhiCommandBuffer;
struct AVFrame;

namespace nt::hw {

class VulkanInterop;

class FrameRef {
public:
    ~FrameRef();
    FrameRef(const FrameRef&) = delete;
    FrameRef& operator=(const FrameRef&) = delete;

    QRhiTexture* plane(int i) const { return m_planes[static_cast<size_t>(i)].get(); }
    QSize size() const { return m_size; }
    void markUsed(long long frameNumber) { m_lastUse = frameNumber; }

    static int live();
    static int releasedInFlight();

private:
    friend class VulkanInterop;
    FrameRef() = default;

    std::shared_ptr<VulkanInterop> m_interop;
    AVFrame* m_drm = nullptr;                 // the DRM PRIME mapping: keeps the surface
    std::array<std::uint64_t, 2> m_images{};  // VkImage
    std::array<std::uint64_t, 2> m_memory{};  // VkDeviceMemory
    std::array<std::unique_ptr<QRhiTexture>, 2> m_planes;
    QSize m_size;
    long long m_lastUse = -1;
};

// QRhi guarantees frame N - FramesInFlight completed when frame N begins.
void trackCompletion(QRhiCommandBuffer* cb, long long frameNumber);
long long completedFrame();

class VulkanInterop : public std::enable_shared_from_this<VulkanInterop> {
public:
    // Null when `rhi` is not a Vulkan QRhi or its device lacks an extension.
    static std::shared_ptr<VulkanInterop> create(QRhi* rhi);
    ~VulkanInterop();

    std::shared_ptr<FrameRef> wrap(const AVFrame* frame, std::string* error);
    void flush() {}

    // The device extensions the import needs; HwWindow.cpp asks Qt Quick to
    // enable them.
    static QByteArrayList requiredDeviceExtensions();

private:
    friend class FrameRef;
    struct Vk;
    VulkanInterop();
    void destroyPlane(std::uint64_t image, std::uint64_t memory);

    QRhi* m_rhi = nullptr;
    std::unique_ptr<Vk> m_vk;
};

}  // namespace nt::hw
