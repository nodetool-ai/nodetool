#pragma once

// Linux hardware frames (DESIGN.md D15, PLAN M6). FFmpeg decodes with VAAPI.
// Each frame is exported as DMA-BUF (av_hwframe_map to DRM PRIME, one layer
// per plane) and each plane is imported into the QRhi's Vulkan device as its
// own VkImage (R8 for Y, R8G8 for CbCr) with its DRM format modifier, then
// wrapped with QRhiTexture::createFrom(). No CPU copy.
//
// Ownership (review F1, F2): each import submits a barrier that acquires the
// images from the foreign (VAAPI) queue family in the external layout
// VK_IMAGE_LAYOUT_GENERAL, which keeps the decoded contents. A retired frame
// submits the matching release back to the foreign family; its images, its
// memory and the VA surface are freed only after that submission's fence
// signals. A release that cannot be submitted is retried on each flush(), and
// its VA surface stays out of the decoder's pool until one is submitted (a
// queue wait would not move the images to the foreign family). Teardown
// retries every remaining release and waits for all submitted fences. If a
// release still cannot be submitted on a live device, its DRM mapping is
// deliberately retained for the process lifetime, keeping the VA surface
// out of the decoder pool. Each retained mapping is logged and counted by
// testing::releaseStats(), with no retention limit. An unexpected fence-wait
// failure is retried up to three attempts. If completion or device loss is
// still unconfirmed, that pending entry's command buffer, fence, images,
// memory and DRM mapping, plus the command pool, are deliberately retained
// for the process lifetime, logged and counted. On a live device, any
// unconfirmed pending submission also retains the images and memory of
// unreleased frames for the process lifetime, logged and counted by
// ReleaseStats::unconfirmedUnreleased. Their DRM mappings stay pinned as
// above. Other pending entries are still waited on. Only VK_ERROR_DEVICE_LOST
// marks the device lost. Nothing waits
// on a fence with a timeout: submissions on Qt's queue
// are ordered before the frames that sample the images, and finished
// submissions are collected on each flush(). A lost device frees everything
// at once and turns the interop off (the sources fall back to software).
//
// Modifiers (review F3): the format and DRM modifier are checked with
// vkGetPhysicalDeviceImageFormatProperties2 before import; a modifier with
// several memory planes (an Intel CCS layout) gets every plane's offset and
// pitch, and a layout this import cannot express (planes in separate
// objects, a plane count that does not match) is rejected before import.
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
// Frame completion (FrameRef::releasedInFlight): each frame records a small
// buffer readback, which QRhi completes once that frame has run.

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

namespace testing {
// Release-only injection: positive counts fail the next N attempts, negative
// fails every attempt. Zero restores native submissions. Counters are cumulative.
void setReleaseFailures(int count);
// Teardown waits only: fail the next N waits with out-of-host-memory without
// calling Vulkan. Negative fails every wait. Zero restores native waits.
void setFenceWaitFailures(int count);
struct ReleaseStats {
    int submitted;
    int completed;
    int freedWithoutRelease;
    int retainedMappings;
    // Pending submissions retained after teardown could not confirm completion.
    int unconfirmedPending;
    // Unreleased image sets retained because a pending submission was unconfirmed.
    int unconfirmedUnreleased;
};
ReleaseStats releaseStats();
}  // namespace testing

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
    bool m_acquired = false;  // the acquire barrier was submitted
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
    // Frees the resources of the submissions that have completed.
    void flush();

    // The device extensions the import needs; HwWindow.cpp asks Qt Quick to
    // enable them.
    static QByteArrayList requiredDeviceExtensions();
    // The frame completion marks allocated, by every interop (tests).
    static int liveCompletionMarks();

private:
    friend class FrameRef;
    struct Vk;
    VulkanInterop();
    // Called by ~FrameRef: releases the planes to the foreign queue family
    // and frees them, with the DRM frame, once that has completed.
    void retire(std::array<std::uint64_t, 2> images, std::array<std::uint64_t, 2> memory, AVFrame* drm, bool acquired);

    QRhi* m_rhi = nullptr;
    std::unique_ptr<Vk> m_vk;
};

}  // namespace nt::hw
