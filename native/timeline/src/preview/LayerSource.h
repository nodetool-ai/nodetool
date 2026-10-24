#pragma once

// The seam between the compositor and a clip's pixels. The compositor owns one
// LayerSource per clip and keeps it, and its textures, alive across frames.
//
// M1a: SyntheticSource draws a test pattern on the CPU and uploads it.
// M1b: FfmpegSource decodes on a worker thread and uploads YUV planes
// (I420 or NV12); the shader converts them with the frame's colour matrix.
// Later: a VideoToolbox source wraps CVPixelBuffer IOSurfaces as Metal
// textures with no upload (QRhiTexture::createFrom).

#include <rhi/qrhi.h>

#include <QSize>

#include <array>

namespace nt {

struct LayerFrame {
    enum class Format {
        None,             // no frame yet (decoder still opening or seeking): skip the layer
        Rgba8Premultiplied,
        I420,             // Y, U, V as R8 textures
        Nv12,             // Y as R8, CbCr as RG8
    };
    Format format = Format::None;
    std::array<QRhiTexture*, 3> planes{};  // plane 0 only for RGBA
    QSize size;
    // YUV formats: rgb = (colorMatrix * vec4(y, cb, cr, 1)).rgb, column-major.
    std::array<float, 16> colorMatrix{};
    // The frame's presentation time in the source, or negative for a source
    // with no timeline (a synthetic pattern).
    double ptsSec = -1.0;
    // The source's frame rate, 0 when unknown or variable, and its duration
    // (0 when unknown): frame error clamps the expected frame to the last.
    double frameRate = 0.0;
    bool constantRate = false;
    double durationSec = 0.0;
    // Whether this is the exact frame for the requested time (the D17 pick),
    // not a held frame while the decoder catches up.
    bool exact = true;
};

class LayerSource {
public:
    virtual ~LayerSource() = default;

    // Pixel size of the source's frames. Drives the contain-fit base scale.
    virtual QSize frameSize() const = 0;

    // Called on the render thread once per composited frame. Makes the
    // returned textures show the frame at `sourceTimeMs` (clip in-point plus
    // time into the clip). Never blocks: a source without that frame yet
    // returns the frame it showed last, or Format::None before its first.
    // Uploads go into `updates`, which the compositor submits before its
    // first draw. The textures stay owned by the source.
    virtual LayerFrame frameAt(QRhi* rhi, QRhiResourceUpdateBatch* updates, double sourceTimeMs) = 0;
};

}  // namespace nt
