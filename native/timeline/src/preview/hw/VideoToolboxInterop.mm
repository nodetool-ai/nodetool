#include "preview/hw/VideoToolboxInterop.h"

#include <rhi/qrhi.h>
#include <rhi/qrhi_platform.h>

#import <CoreVideo/CoreVideo.h>
#import <Metal/Metal.h>

namespace nt::hw {
namespace {

std::atomic<int> g_liveFrameRefs{0};
std::atomic<int> g_releasedInFlight{0};
std::atomic<long long> g_completedFrame{-1};

}  // namespace

void trackCompletion(QRhiCommandBuffer* cb, long long frameNumber) {
    const auto* handles = static_cast<const QRhiMetalCommandBufferNativeHandles*>(cb->nativeHandles());
    if (!handles || !handles->commandBuffer) return;
    id<MTLCommandBuffer> buffer = (id<MTLCommandBuffer>)handles->commandBuffer;
    [buffer addCompletedHandler:^(id<MTLCommandBuffer>) {
        long long seen = g_completedFrame.load();
        while (seen < frameNumber && !g_completedFrame.compare_exchange_weak(seen, frameNumber)) {
        }
    }];
}

long long completedFrame() {
    return g_completedFrame.load();
}

int FrameRef::releasedInFlight() {
    return g_releasedInFlight.load();
}

int FrameRef::live() {
    return g_liveFrameRefs.load();
}

FrameRef::~FrameRef() {
    if (m_lastUse >= 0 && m_lastUse > g_completedFrame.load()) ++g_releasedInFlight;
    // The wrappers first: they reference the Metal textures.
    for (auto& p : m_planes) p.reset();
    for (void*& t : m_cvTextures) {
        if (t) CFRelease(t);
        t = nullptr;
    }
    if (m_pixelBuffer) CVPixelBufferRelease(static_cast<CVPixelBufferRef>(m_pixelBuffer));
    --g_liveFrameRefs;
}

std::shared_ptr<VideoToolboxInterop> VideoToolboxInterop::create(QRhi* rhi) {
    if (!rhi || rhi->backend() != QRhi::Metal) return nullptr;
    const auto* handles = static_cast<const QRhiMetalNativeHandles*>(rhi->nativeHandles());
    if (!handles || !handles->dev) return nullptr;
    id<MTLDevice> device = (id<MTLDevice>)handles->dev;
    CVMetalTextureCacheRef cache = nullptr;
    if (CVMetalTextureCacheCreate(kCFAllocatorDefault, nullptr, device, nullptr, &cache) != kCVReturnSuccess) {
        return nullptr;
    }
    std::shared_ptr<VideoToolboxInterop> interop(new VideoToolboxInterop());
    interop->m_rhi = rhi;
    interop->m_cache = cache;
    return interop;
}

VideoToolboxInterop::~VideoToolboxInterop() {
    if (m_cache) CFRelease(m_cache);
}

void VideoToolboxInterop::flush() {
    if (m_cache) CVMetalTextureCacheFlush(static_cast<CVMetalTextureCacheRef>(m_cache), 0);
}

std::shared_ptr<FrameRef> VideoToolboxInterop::wrap(void* cvPixelBuffer, std::string* error) {
    auto pb = static_cast<CVPixelBufferRef>(cvPixelBuffer);
    const OSType format = CVPixelBufferGetPixelFormatType(pb);
    if (format != kCVPixelFormatType_420YpCbCr8BiPlanarVideoRange &&
        format != kCVPixelFormatType_420YpCbCr8BiPlanarFullRange) {
        if (error) *error = "pixel buffer is not 8-bit NV12";
        return nullptr;
    }
    if (!CVPixelBufferGetIOSurface(pb)) {
        if (error) *error = "pixel buffer has no IOSurface";
        return nullptr;
    }
    ++g_liveFrameRefs;  // the destructor decrements, also on the failure paths below
    std::shared_ptr<FrameRef> ref(new FrameRef());
    ref->m_interop = shared_from_this();
    ref->m_pixelBuffer = CVPixelBufferRetain(pb);
    const size_t w = CVPixelBufferGetWidthOfPlane(pb, 0);
    const size_t h = CVPixelBufferGetHeightOfPlane(pb, 0);
    ref->m_size = QSize(static_cast<int>(w), static_cast<int>(h));
    const MTLPixelFormat formats[2] = {MTLPixelFormatR8Unorm, MTLPixelFormatRG8Unorm};
    const QRhiTexture::Format rhiFormats[2] = {QRhiTexture::R8, QRhiTexture::RG8};
    for (size_t plane = 0; plane < 2; ++plane) {
        const size_t pw = CVPixelBufferGetWidthOfPlane(pb, plane);
        const size_t ph = CVPixelBufferGetHeightOfPlane(pb, plane);
        CVMetalTextureRef cvTex = nullptr;
        const CVReturn rc = CVMetalTextureCacheCreateTextureFromImage(
            kCFAllocatorDefault, static_cast<CVMetalTextureCacheRef>(m_cache), pb, nullptr, formats[plane], pw, ph,
            plane, &cvTex);
        if (rc != kCVReturnSuccess || !cvTex) {
            if (error) *error = "CVMetalTextureCacheCreateTextureFromImage failed (" + std::to_string(rc) + ")";
            return nullptr;
        }
        ref->m_cvTextures[plane] = cvTex;
        id<MTLTexture> mtl = CVMetalTextureGetTexture(cvTex);
        std::unique_ptr<QRhiTexture> t(
            m_rhi->newTexture(rhiFormats[plane], QSize(static_cast<int>(pw), static_cast<int>(ph))));
        if (!t->createFrom({quint64(reinterpret_cast<quintptr>((__bridge void*)mtl)), 0})) {
            if (error) *error = "QRhiTexture::createFrom failed";
            return nullptr;
        }
        ref->m_planes[plane] = std::move(t);
    }
    return ref;
}

}  // namespace nt::hw
