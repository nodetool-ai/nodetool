// Windows hardware decode and independent scrub-cache textures (D15, D19).

#include "preview/hw/D3D11Interop.h"

#include "preview/hw/HwInterop.h"
#include "preview/FrameCache.h"

#include <rhi/qrhi.h>

// Before the FFmpeg headers: hwcontext_d3d11va.h includes d3d11.h, whose C++
// operators cannot be declared inside extern "C".
#define WIN32_LEAN_AND_MEAN
#define NOMINMAX
#include <d3d11_4.h>

extern "C" {
#include <libavcodec/avcodec.h>
#include <libavutil/error.h>
#include <libavutil/hwcontext.h>
#include <libavutil/hwcontext_d3d11va.h>
}

#include <atomic>

namespace nt::hw {
void CacheFrameFree::operator()(AVFrame* frame) const {
    av_frame_free(&frame);
}

CacheFrame cacheCopy(const AVFrame* frame) {
    if (!frame || frame->format != AV_PIX_FMT_D3D11 || !frame->hw_frames_ctx) return nullptr;
    auto* texture = reinterpret_cast<ID3D11Texture2D*>(frame->data[0]);
    D3D11_TEXTURE2D_DESC desc{};
    texture->GetDesc(&desc);
    if (desc.Format != DXGI_FORMAT_NV12) return nullptr;
    auto* source = reinterpret_cast<AVHWFramesContext*>(frame->hw_frames_ctx->data);
    const auto unref = [](AVBufferRef* ref) { av_buffer_unref(&ref); };
    std::unique_ptr<AVBufferRef, decltype(unref)> pool(av_hwframe_ctx_alloc(source->device_ref), unref);
    if (!pool) return nullptr;
    auto* target = reinterpret_cast<AVHWFramesContext*>(pool->data);
    target->format = AV_PIX_FMT_D3D11;
    target->sw_format = AV_PIX_FMT_NV12;
    target->width = static_cast<int>(desc.Width);
    target->height = static_cast<int>(desc.Height);
    target->initial_pool_size = 1;
    static_cast<AVD3D11VAFramesContext*>(target->hwctx)->BindFlags = D3D11_BIND_SHADER_RESOURCE;
    if (av_hwframe_ctx_init(pool.get()) < 0) return nullptr;
    CacheFrame copy(av_frame_alloc());
    if (!copy || av_hwframe_get_buffer(pool.get(), copy.get(), 0) < 0 ||
        av_frame_copy_props(copy.get(), frame) < 0) return nullptr;
    copy->width = frame->width;
    copy->height = frame->height;
    auto* device = static_cast<AVD3D11VADeviceContext*>(source->device_ctx->hwctx);
    // Queue the copy before releasing the source slot. Decoder reuse and
    // rendering use this same serialized immediate command stream.
    device->lock(device->lock_ctx);
    device->device_context->CopySubresourceRegion(
        reinterpret_cast<ID3D11Texture2D*>(copy->data[0]), 0, 0, 0, 0, texture,
        static_cast<UINT>(reinterpret_cast<intptr_t>(frame->data[1])), nullptr);
    device->unlock(device->lock_ctx);
    return copy;
}

bool isCacheFrame(const AVFrame* frame) {
    if (!frame || frame->format != AV_PIX_FMT_D3D11 || !frame->hw_frames_ctx || !frame->data[0]) return false;
    D3D11_TEXTURE2D_DESC desc{};
    reinterpret_cast<ID3D11Texture2D*>(frame->data[0])->GetDesc(&desc);
    return desc.ArraySize == 1 && (desc.BindFlags & D3D11_BIND_SHADER_RESOURCE) &&
           !(desc.BindFlags & D3D11_BIND_DECODER);
}

namespace {

std::atomic<int> g_liveFrameRefs{0};
std::atomic<int> g_releasedInFlight{0};
std::atomic<long long> g_completedFrame{-1};
std::mutex g_deviceMutex;
ID3D11Device* g_sharedDevice = nullptr;  // one reference while set

std::string avError(int rc) {
    char buf[AV_ERROR_MAX_STRING_SIZE] = {};
    av_strerror(rc, buf, sizeof(buf));
    return buf;
}

AVPixelFormat pickD3D11(AVCodecContext*, const AVPixelFormat* formats) {
    for (const AVPixelFormat* f = formats; *f != AV_PIX_FMT_NONE; ++f) {
        if (*f == AV_PIX_FMT_D3D11) return *f;
    }
    return formats[0];
}

ID3D11Texture2D* arrayOf(const AVFrame* frame) {
    return reinterpret_cast<ID3D11Texture2D*>(frame->data[0]);
}

}  // namespace

bool cacheDeviceMatches(const AVFrame* frame) {
    ID3D11Device* owner = nullptr;
    arrayOf(frame)->GetDevice(&owner);
    std::lock_guard lock(g_deviceMutex);
    const bool matches = !g_sharedDevice || owner == g_sharedDevice;
    owner->Release();
    return matches;
}

void trackCompletion(QRhiCommandBuffer*, long long frameNumber) {
    // Beginning frame N means frame N - 1 was submitted, and the immediate
    // context executes in order.
    long long seen = g_completedFrame.load();
    while (seen < frameNumber - 1 && !g_completedFrame.compare_exchange_weak(seen, frameNumber - 1)) {
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
    for (auto& p : m_planes) p.reset();  // the views before the texture
    if (m_texture && m_interop) m_interop->recycle(m_texture, m_size);
    --g_liveFrameRefs;
}

std::shared_ptr<D3D11Interop> D3D11Interop::create(QRhi* rhi) {
    if (!rhi || rhi->backend() != QRhi::D3D11) return nullptr;
    const auto* handles = static_cast<const QRhiD3D11NativeHandles*>(rhi->nativeHandles());
    if (!handles || !handles->dev || !handles->context) return nullptr;
    auto* device = static_cast<ID3D11Device*>(handles->dev);
    auto* context = static_cast<ID3D11DeviceContext*>(handles->context);
    // FFmpeg decodes on this device from its worker threads while Qt renders
    // on the render thread: the device must serialize its context.
    ID3D11Multithread* mt = nullptr;
    if (SUCCEEDED(context->QueryInterface(__uuidof(ID3D11Multithread), reinterpret_cast<void**>(&mt))) && mt) {
        mt->SetMultithreadProtected(TRUE);
        mt->Release();
    } else {
        return nullptr;
    }
    std::shared_ptr<D3D11Interop> interop(new D3D11Interop());
    interop->m_rhi = rhi;
    device->AddRef();
    context->AddRef();
    interop->m_device = device;
    interop->m_context = context;
    bool deviceChanged = false;
    {
        std::lock_guard lock(g_deviceMutex);
        deviceChanged = g_sharedDevice != device;
        if (g_sharedDevice) g_sharedDevice->Release();
        device->AddRef();
        g_sharedDevice = device;
    }
    // Never hold the device lock while taking the cache lock. Cache reads
    // also check device identity during the change and decoder shutdown.
    if (deviceChanged) {
        FrameCache::shared().clear();
    }
    return interop;
}

D3D11Interop::~D3D11Interop() {
    for (auto& [size, tex] : m_pool) static_cast<ID3D11Texture2D*>(tex)->Release();
    if (m_context) static_cast<ID3D11DeviceContext*>(m_context)->Release();
    if (m_device) static_cast<ID3D11Device*>(m_device)->Release();
}

void* D3D11Interop::acquireSharedDevice() {
    std::lock_guard lock(g_deviceMutex);
    if (g_sharedDevice) g_sharedDevice->AddRef();
    return g_sharedDevice;
}

void* D3D11Interop::takeTexture(QSize size, std::string* error) {
    {
        std::lock_guard lock(m_poolMutex);
        for (auto it = m_pool.begin(); it != m_pool.end(); ++it) {
            if (it->first == size) {
                void* tex = it->second;
                m_pool.erase(it);
                return tex;
            }
        }
    }
    D3D11_TEXTURE2D_DESC desc{};
    desc.Width = static_cast<UINT>(size.width());
    desc.Height = static_cast<UINT>(size.height());
    desc.MipLevels = 1;
    desc.ArraySize = 1;
    desc.Format = DXGI_FORMAT_NV12;
    desc.SampleDesc.Count = 1;
    desc.Usage = D3D11_USAGE_DEFAULT;
    desc.BindFlags = D3D11_BIND_SHADER_RESOURCE;
    ID3D11Texture2D* tex = nullptr;
    const HRESULT hr = static_cast<ID3D11Device*>(m_device)->CreateTexture2D(&desc, nullptr, &tex);
    if (FAILED(hr)) {
        if (error) *error = "cannot create an NV12 copy texture";
        return nullptr;
    }
    return tex;
}

void D3D11Interop::recycle(void* texture, QSize size) {
    std::lock_guard lock(m_poolMutex);
    if (m_pool.size() < 16) {
        m_pool.emplace_back(size, texture);
    } else {
        static_cast<ID3D11Texture2D*>(texture)->Release();
    }
}

std::shared_ptr<FrameRef> D3D11Interop::wrap(const AVFrame* frame, std::string* error) {
    const auto fail = [&](const char* why) -> std::shared_ptr<FrameRef> {
        if (error) *error = why;
        return nullptr;
    };
    if (frame->format != AV_PIX_FMT_D3D11 || !frame->hw_frames_ctx) return fail("D3D11VA returned a software frame");
    ID3D11Texture2D* array = arrayOf(frame);
    const auto slice = static_cast<UINT>(reinterpret_cast<intptr_t>(frame->data[1]));
    D3D11_TEXTURE2D_DESC desc{};
    array->GetDesc(&desc);
    if (desc.Format != DXGI_FORMAT_NV12) return fail("D3D11VA output is not 8-bit NV12 (10-bit waits for P010)");
    ID3D11Device* owner = nullptr;
    array->GetDevice(&owner);
    const bool sameDevice = owner == static_cast<ID3D11Device*>(m_device);
    if (owner) owner->Release();
    if (!sameDevice) return fail("the D3D11VA decoder runs on another device than the renderer");

    // The visible area only: the decoder's array is padded to the coded size.
    const QSize size(frame->width & ~1, frame->height & ~1);
    std::string why;
    void* tex = takeTexture(size, &why);
    if (!tex) return fail(why.c_str());
    auto* frames = reinterpret_cast<AVHWFramesContext*>(frame->hw_frames_ctx->data);
    auto* hwctx = static_cast<AVD3D11VADeviceContext*>(frames->device_ctx->hwctx);
    const D3D11_BOX box{0, 0, 0, static_cast<UINT>(size.width()), static_cast<UINT>(size.height()), 1};
    hwctx->lock(hwctx->lock_ctx);
    static_cast<ID3D11DeviceContext*>(m_context)
        ->CopySubresourceRegion(static_cast<ID3D11Texture2D*>(tex), 0, 0, 0, 0, array, slice, &box);
    hwctx->unlock(hwctx->lock_ctx);

    std::shared_ptr<FrameRef> ref(new FrameRef());
    ++g_liveFrameRefs;
    ref->m_interop = shared_from_this();
    ref->m_texture = tex;
    ref->m_size = size;
    const QSize sizes[2] = {size, QSize(size.width() / 2, size.height() / 2)};
    const QRhiTexture::Format formats[2] = {QRhiTexture::R8, QRhiTexture::RG8};
    for (int p = 0; p < 2; ++p) {
        std::unique_ptr<QRhiTexture> t(m_rhi->newTexture(formats[p], sizes[p]));
        if (!t->createFrom({reinterpret_cast<quint64>(tex), 0})) {
            return fail("QRhiTexture::createFrom rejected the NV12 copy");  // ref's destructor recycles tex
        }
        ref->m_planes[static_cast<size_t>(p)] = std::move(t);
    }
    return ref;
}

// ---- the decoder side of the seam (HwInterop.h) ----

const char* apiName() {
    return "D3D11VA";
}

const char* decoderName() {
    return "d3d11va";
}

int pixelFormat() {
    return AV_PIX_FMT_D3D11;
}

std::string setUpDecoder(AVCodecContext* ctx, const AVCodec* codec, const std::string& codecName, AVBufferRef** device) {
    bool supported = false;
    for (int i = 0;; ++i) {
        const AVCodecHWConfig* config = avcodec_get_hw_config(codec, i);
        if (!config) break;
        if (config->device_type == AV_HWDEVICE_TYPE_D3D11VA &&
            (config->methods & AV_CODEC_HW_CONFIG_METHOD_HW_DEVICE_CTX)) {
            supported = true;
            break;
        }
    }
    if (!supported) return "no D3D11VA decoder for " + codecName;
    auto* shared = static_cast<ID3D11Device*>(D3D11Interop::acquireSharedDevice());
    if (!shared) return "no D3D11 device from the renderer yet";
    AVBufferRef* ref = av_hwdevice_ctx_alloc(AV_HWDEVICE_TYPE_D3D11VA);
    if (!ref) {
        shared->Release();
        return "D3D11VA device: out of memory";
    }
    auto* dc = reinterpret_cast<AVHWDeviceContext*>(ref->data);
    auto* d3d = static_cast<AVD3D11VADeviceContext*>(dc->hwctx);
    d3d->device = shared;  // FFmpeg releases this reference with the context
    const int rc = av_hwdevice_ctx_init(ref);
    if (rc < 0) {
        av_buffer_unref(&ref);
        // Typically a device created without D3D11_CREATE_DEVICE_VIDEO_SUPPORT
        // (prepareWindow in HwWindow.cpp creates it with that flag).
        return "D3D11VA device: " + avError(rc);
    }
    *device = ref;
    ctx->hw_device_ctx = av_buffer_ref(ref);
    ctx->get_format = pickD3D11;
    return {};
}

std::string checkFrame(const AVFrame* frame) {
    if (frame->format != AV_PIX_FMT_D3D11) return "D3D11VA returned a software frame";
    D3D11_TEXTURE2D_DESC desc{};
    arrayOf(frame)->GetDesc(&desc);
    if (desc.Format != DXGI_FORMAT_NV12) return "D3D11VA output is not 8-bit NV12 (10-bit waits for P010)";
    return {};
}

std::size_t frameBytes(const AVFrame* frame) {
    // One slice of the decoder's array: NV12 at the coded size.
    D3D11_TEXTURE2D_DESC desc{};
    arrayOf(frame)->GetDesc(&desc);
    return static_cast<std::size_t>(desc.Width) * desc.Height * 3 / 2;
}

std::shared_ptr<FrameRef> wrapFrame(PlatformInterop& interop, const AVFrame* frame, std::string* error) {
    return interop.wrap(frame, error);
}

}  // namespace nt::hw
