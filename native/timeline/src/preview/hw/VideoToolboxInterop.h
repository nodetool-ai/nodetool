#pragma once

// Zero-copy display of VideoToolbox frames (DESIGN.md D15, D11). A
// CVMetalTextureCache on the QRhi's MTLDevice turns each plane of an
// IOSurface-backed NV12 CVPixelBuffer into an MTLTexture, and
// QRhiTexture::createFrom() wraps it. QRhi does not own a wrapped texture, so
// a FrameRef holds the pixel buffer, the Metal textures and the wrappers
// together, and is released through the RetireQueue once no command buffer
// samples it.

#include <QSize>

#include <array>
#include <atomic>
#include <memory>
#include <string>

class QRhi;
class QRhiTexture;
class QRhiCommandBuffer;

namespace nt::hw {

class VideoToolboxInterop;

// One displayed hardware frame: plane 0 is Y (R8), plane 1 CbCr (RG8).
class FrameRef {
public:
    ~FrameRef();
    FrameRef(const FrameRef&) = delete;
    FrameRef& operator=(const FrameRef&) = delete;

    QRhiTexture* plane(int i) const { return m_planes[static_cast<size_t>(i)].get(); }
    QSize size() const { return m_size; }

    // FrameRefs alive now, over the whole process (the M1c exit check).
    static int live();
    // FrameRefs released while a command buffer that sampled them had not yet
    // completed on the GPU (the D11 hazard; must stay 0).
    static int releasedInFlight();

    // The render thread records each frame number that draws with this frame.
    void markUsed(long long frameNumber) { m_lastUse = frameNumber; }

private:
    friend class VideoToolboxInterop;
    FrameRef() = default;

    std::shared_ptr<VideoToolboxInterop> m_interop;  // keeps the texture cache alive
    void* m_pixelBuffer = nullptr;                   // CVPixelBufferRef, retained
    std::array<void*, 2> m_cvTextures{};             // CVMetalTextureRef, owned
    std::array<std::unique_ptr<QRhiTexture>, 2> m_planes;
    QSize m_size;
    long long m_lastUse = -1;
};

// GPU completion tracking: a completed handler on the frame's Metal command
// buffer records its frame number, so a release can be checked against what
// the GPU has finished.
void trackCompletion(QRhiCommandBuffer* cb, long long frameNumber);
long long completedFrame();

class VideoToolboxInterop : public std::enable_shared_from_this<VideoToolboxInterop> {
public:
    // Null when `rhi` is not a Metal QRhi or the texture cache fails.
    static std::shared_ptr<VideoToolboxInterop> create(QRhi* rhi);
    ~VideoToolboxInterop();

    // Wraps an NV12 CVPixelBufferRef (8-bit, video or full range). Null with
    // `error` set when the buffer is another format or the cache fails.
    std::shared_ptr<FrameRef> wrap(void* cvPixelBuffer, std::string* error);

    // Lets the cache drop textures it no longer needs; call once per frame.
    void flush();

private:
    VideoToolboxInterop() = default;
    QRhi* m_rhi = nullptr;
    void* m_cache = nullptr;  // CVMetalTextureCacheRef
};

}  // namespace nt::hw
