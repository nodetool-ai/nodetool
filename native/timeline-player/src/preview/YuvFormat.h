#pragma once

// YUV to RGB for decoded video planes (DESIGN.md D10). Pure: no FFmpeg or GPU
// types, so the colour maths is unit tested on its own.

#include <array>

namespace nt {

enum class YuvMatrix { Bt709, Bt601 };
enum class YuvRange { Limited, Full };

// How the planes of a frame are laid out on the GPU.
enum class PlaneLayout {
    I420,  // Y, U, V as three R8 textures (U and V at half width and height)
    Nv12,  // Y as R8, interleaved CbCr as one RG8 texture at half size
    Rgba,  // one RGBA8 texture (RGB input, opaque): no chroma subsampling
};

// Column-major 4x4: rgb = (M * vec4(y, cb, cr, 1)).rgb with y, cb, cr the
// normalized texture values in [0, 1].
std::array<float, 16> yuvToRgbMatrix(YuvMatrix matrix, YuvRange range);

// The matrix a stream with no colour tag uses: BT.709 at a height of 720 or
// more, else BT.601 (DESIGN.md D10).
YuvMatrix defaultMatrixForHeight(int height);

// Applies the matrix to 8-bit code values, for tests and CPU checks.
std::array<double, 3> yuvToRgb(YuvMatrix matrix, YuvRange range, int y, int cb, int cr);

}  // namespace nt
