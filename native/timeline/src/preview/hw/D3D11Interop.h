#pragma once

// Windows hardware frames (DESIGN.md D15, PLAN M6). FFmpeg's D3D11VA decoder
// runs on the QRhi's own ID3D11Device, so decoder and renderer share one
// device. A decoded frame is one slice of the decoder's NV12 texture array,
// which QRhiTexture::createFrom() cannot address (R4). Each frame is
// therefore copied on the GPU (CopySubresourceRegion, no CPU copy) into a
// single NV12 texture from a small pool, and that texture is wrapped twice:
// as R8 (the luma plane) and as RG8 (the chroma plane). D3D11 picks the
// plane of an NV12 resource from the view format.
//
// Header kept free of Windows headers; COM pointers are void* here.

#include <QSize>

#include <array>
#include <memory>
#include <mutex>
#include <string>
#include <utility>
#include <vector>

class QQuickWindow;
class QRhi;
class QRhiTexture;
class QRhiCommandBuffer;
struct AVFrame;

namespace nt::hw {

class D3D11Interop;

// Independent GPU storage, owned through FFmpeg. Unlike decoder surfaces,
// these frames may remain in the scrub cache until its budget evicts them.
struct CacheFrameFree {
    void operator()(AVFrame* frame) const;
};
using CacheFrame = std::unique_ptr<AVFrame, CacheFrameFree>;
CacheFrame cacheCopy(const AVFrame* frame);
bool isCacheFrame(const AVFrame* frame);
bool cacheDeviceMatches(const AVFrame* frame);

// One displayed hardware frame: plane 0 is Y (R8), plane 1 CbCr (RG8), both
// views of one NV12 texture that the frame owns until it is retired.
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
    friend class D3D11Interop;
    FrameRef() = default;

    std::shared_ptr<D3D11Interop> m_interop;  // owns the texture pool
    void* m_texture = nullptr;                 // ID3D11Texture2D*, one reference
    std::array<std::unique_ptr<QRhiTexture>, 2> m_planes;
    QSize m_size;
    long long m_lastUse = -1;
};

// D3D11 runs every command of the QRhi and of the copies on one immediate
// context, in order, so frame N's commands have completed for any later
// resource reuse once frame N + 1 begins (QRhi::FramesInFlight is 1).
void trackCompletion(QRhiCommandBuffer* cb, long long frameNumber);
long long completedFrame();

class D3D11Interop : public std::enable_shared_from_this<D3D11Interop> {
public:
    // Null when `rhi` is not a D3D11 QRhi.
    static std::shared_ptr<D3D11Interop> create(QRhi* rhi);
    ~D3D11Interop();

    // Copies and wraps an AV_PIX_FMT_D3D11 frame. Null with `error` set when
    // the frame is not 8-bit NV12 or lives on another device.
    std::shared_ptr<FrameRef> wrap(const AVFrame* frame, std::string* error);
    void flush() {}

    // The QRhi's device, AddRef'd for the caller (an ID3D11Device*), or null
    // before the first create(). The decoder opens on it (D15).
    static void* acquireSharedDevice();

private:
    friend class FrameRef;
    D3D11Interop() = default;
    void* takeTexture(QSize size, std::string* error);  // from the pool or new
    void recycle(void* texture, QSize size);

    QRhi* m_rhi = nullptr;
    void* m_device = nullptr;   // ID3D11Device*, one reference
    void* m_context = nullptr;  // ID3D11DeviceContext*, one reference
    std::mutex m_poolMutex;
    std::vector<std::pair<QSize, void*>> m_pool;
};

}  // namespace nt::hw
