// The decoder side of the hardware seam for macOS (VideoToolbox) and for the
// build without hardware decode. Windows and Linux implement the same
// functions in D3D11Interop.cpp and VulkanInterop.cpp.

#include "preview/hw/HwInterop.h"

extern "C" {
#include <libavcodec/avcodec.h>
#include <libavutil/error.h>
#include <libavutil/hwcontext.h>
}

#if NT_HW_VIDEOTOOLBOX
#include <CoreVideo/CVPixelBuffer.h>
#include <IOSurface/IOSurfaceRef.h>
#endif

namespace nt::hw {

#if NT_HW_VIDEOTOOLBOX

namespace {
std::string avError(int rc) {
    char buf[AV_ERROR_MAX_STRING_SIZE] = {};
    av_strerror(rc, buf, sizeof(buf));
    return buf;
}

// Offers VideoToolbox when the decoder lists it, else the first (software)
// format, which is how FFmpeg declines a stream VideoToolbox cannot decode.
AVPixelFormat pickVideoToolbox(AVCodecContext*, const AVPixelFormat* formats) {
    for (const AVPixelFormat* f = formats; *f != AV_PIX_FMT_NONE; ++f) {
        if (*f == AV_PIX_FMT_VIDEOTOOLBOX) return *f;
    }
    return formats[0];
}
}  // namespace

const char* apiName() {
    return "VideoToolbox";
}

const char* decoderName() {
    return "videotoolbox";
}

int pixelFormat() {
    return AV_PIX_FMT_VIDEOTOOLBOX;
}

std::string setUpDecoder(AVCodecContext* ctx, const AVCodec* codec, const std::string& codecName, AVBufferRef** device) {
    bool supported = false;
    for (int i = 0;; ++i) {
        const AVCodecHWConfig* config = avcodec_get_hw_config(codec, i);
        if (!config) break;
        if (config->device_type == AV_HWDEVICE_TYPE_VIDEOTOOLBOX &&
            (config->methods & AV_CODEC_HW_CONFIG_METHOD_HW_DEVICE_CTX)) {
            supported = true;
            break;
        }
    }
    if (!supported) return "no VideoToolbox decoder for " + codecName;
    const int rc = av_hwdevice_ctx_create(device, AV_HWDEVICE_TYPE_VIDEOTOOLBOX, nullptr, nullptr, 0);
    if (rc < 0) return "VideoToolbox device: " + avError(rc);
    ctx->hw_device_ctx = av_buffer_ref(*device);
    ctx->get_format = pickVideoToolbox;
    return {};
}

std::string checkFrame(const AVFrame* frame) {
    if (frame->format != AV_PIX_FMT_VIDEOTOOLBOX) return "VideoToolbox returned a software frame";
    auto pb = reinterpret_cast<CVPixelBufferRef>(frame->data[3]);
    const OSType f = CVPixelBufferGetPixelFormatType(pb);
    if (f != kCVPixelFormatType_420YpCbCr8BiPlanarVideoRange && f != kCVPixelFormatType_420YpCbCr8BiPlanarFullRange) {
        return "VideoToolbox output is not 8-bit NV12 (10-bit waits for P010)";
    }
    return {};
}

std::size_t frameBytes(const AVFrame* frame) {
    // The IOSurface's allocation, with its row and plane alignment.
    auto pb = reinterpret_cast<CVPixelBufferRef>(frame->data[3]);
    if (IOSurfaceRef surface = CVPixelBufferGetIOSurface(pb)) return IOSurfaceGetAllocSize(surface);
    return CVPixelBufferGetDataSize(pb);
}

std::shared_ptr<FrameRef> wrapFrame(PlatformInterop& interop, const AVFrame* frame, std::string* error) {
    return interop.wrap(reinterpret_cast<void*>(frame->data[3]), error);
}

#elif NT_HW_NONE_ACTIVE

const char* apiName() {
    return "hardware decode";
}

const char* decoderName() {
    return "none";
}

int pixelFormat() {
    return AV_PIX_FMT_NONE;
}

std::string setUpDecoder(AVCodecContext*, const AVCodec*, const std::string&, AVBufferRef**) {
    return "this build has no hardware decode";
}

std::string checkFrame(const AVFrame*) {
    return "this build has no hardware decode";
}

std::size_t frameBytes(const AVFrame*) {
    return 0;
}

std::shared_ptr<FrameRef> wrapFrame(PlatformInterop&, const AVFrame*, std::string* error) {
    if (error) *error = "this build has no hardware decode";
    return nullptr;
}

#endif

}  // namespace nt::hw
