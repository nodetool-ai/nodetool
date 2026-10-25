#pragma once

// The hardware decode seam (DESIGN.md D15, PLAN M6). FfmpegSource, the
// compositor and LayerSource use only the names here; each platform supplies
// them, chosen at compile time:
//
//   NT_HW_VIDEOTOOLBOX  macOS: VideoToolbox, IOSurface NV12 wrapped as Metal
//                       textures (VideoToolboxInterop, M1c).
//   NT_HW_D3D11VA       Windows: D3D11VA on the QRhi's ID3D11Device, each
//                       frame copied on the GPU out of the decoder's texture
//                       array (D3D11Interop).
//   NT_HW_VAAPI         Linux: VAAPI, each frame exported as DMA-BUF and
//                       imported into the QRhi's Vulkan device
//                       (VulkanInterop).
//   (NT_HW_SYNTAX_CHECK_VAAPI selects the Linux branch on any host, for a
//   compile-only check of VulkanInterop.cpp; scripts/check-portable.sh.)
//   none                no hardware path: `create()` returns null and every
//                       source decodes in software. Also selected on macOS
//                       with -DNT_HW_NONE, so the portable code compiles and
//                       its tests run on the development machine.
//
// Each platform header defines, in nt::hw:
//   class FrameRef        one displayed hardware frame: plane(0) Y as R8,
//                         plane(1) CbCr as RG8, size(), markUsed(frame),
//                         static live() and releasedInFlight();
//   class PlatformInterop  static create(QRhi*) (null when the QRhi backend
//                         or the device cannot import), flush() once per frame;
//   trackCompletion(cb, frame), completedFrame().
// This header adds the decoder side as free functions.

#include <cstddef>
#include <memory>
#include <string>

struct AVBufferRef;
struct AVCodec;
struct AVCodecContext;
struct AVFrame;

#if defined(__APPLE__) && !defined(NT_HW_NONE) && !defined(NT_HW_SYNTAX_CHECK_VAAPI)
#define NT_HW_VIDEOTOOLBOX 1
#include "preview/hw/VideoToolboxInterop.h"
namespace nt::hw {
using PlatformInterop = VideoToolboxInterop;
}
#elif defined(_WIN32) && !defined(NT_HW_NONE)
#define NT_HW_D3D11VA 1
#include "preview/hw/D3D11Interop.h"
namespace nt::hw {
using PlatformInterop = D3D11Interop;
}
#elif (defined(__linux__) && defined(NT_HAVE_VAAPI_VULKAN) && !defined(NT_HW_NONE)) || defined(NT_HW_SYNTAX_CHECK_VAAPI)
#define NT_HW_VAAPI 1
#include "preview/hw/VulkanInterop.h"
namespace nt::hw {
using PlatformInterop = VulkanInterop;
}
#else
#define NT_HW_NONE_ACTIVE 1
#include <QSize>
class QRhi;
class QRhiTexture;
class QRhiCommandBuffer;
namespace nt::hw {
// No hardware frames exist, so no FrameRef is ever made.
class FrameRef {
public:
    QRhiTexture* plane(int) const { return nullptr; }
    QSize size() const { return {}; }
    void markUsed(long long) {}
    static int live() { return 0; }
    static int releasedInFlight() { return 0; }
};
class NullInterop {
public:
    static std::shared_ptr<NullInterop> create(QRhi*) { return nullptr; }
    void flush() {}
};
using PlatformInterop = NullInterop;
inline void trackCompletion(QRhiCommandBuffer*, long long) {}
inline long long completedFrame() { return -1; }
}  // namespace nt::hw
#endif

namespace nt::hw {

// The decoder API's name for reasons and the loader report: "VideoToolbox",
// "D3D11VA", "VAAPI", or "hardware decode" where there is none.
const char* apiName();
// The `decoder` value of the media report: "videotoolbox", "d3d11va", "vaapi".
const char* decoderName();
// AVPixelFormat of the hardware frames, or -1 (AV_PIX_FMT_NONE).
int pixelFormat();

// Sets up hardware decode on `ctx` before avcodec_open2: the device context
// and get_format. `device` receives the reference the caller keeps. Empty on
// success, else why not; the source then decodes in software (D15).
std::string setUpDecoder(AVCodecContext* ctx, const AVCodec* codec, const std::string& codecName, AVBufferRef** device);

// Empty when a decoded hardware frame is one the interop can wrap (8-bit
// 4:2:0), else why not.
std::string checkFrame(const AVFrame* frame);

// Bytes the hardware frame holds (its surface allocation), for the cache
// budget.
std::size_t frameBytes(const AVFrame* frame);

// Wraps a hardware frame as two textures. Null with `error` set on failure.
std::shared_ptr<FrameRef> wrapFrame(PlatformInterop& interop, const AVFrame* frame, std::string* error);

#if NT_HW_VAAPI
// Waits on the decoder thread until the decode into the frame's surface has
// finished (vaSyncSurface). nvidia-vaapi-driver can leave a surface whose
// first sync comes from the render thread, while the decoder thread decodes
// into the same context, waiting forever. 0, or a negative AVERROR.
int syncFrame(const AVFrame* frame);

// A system-memory NV12 copy of a VAAPI frame, which the scrub cache keeps in
// its place (D19), or null. A VAAPI decode context numbers every surface it
// decodes into, and nvidia-vaapi-driver allows 32 per context: past that,
// vaBeginPicture fails (VA_STATUS_ERROR_MAX_NUM_EXCEEDED) and a later
// vaSyncSurface on the undecoded surface never returns. Cached surfaces
// would count against that limit, so the cache holds none.
AVFrame* cacheCopy(const AVFrame* frame);
#endif

}  // namespace nt::hw
