#include "preview/YuvFormat.h"

namespace nt {

std::array<float, 16> yuvToRgbMatrix(YuvMatrix matrix, YuvRange range) {
    const double kr = matrix == YuvMatrix::Bt709 ? 0.2126 : 0.299;
    const double kb = matrix == YuvMatrix::Bt709 ? 0.0722 : 0.114;
    const double kg = 1.0 - kr - kb;
    // Normalized code value to Y' in [0, 1] and C' in [-0.5, 0.5].
    const bool limited = range == YuvRange::Limited;
    const double ys = limited ? 255.0 / 219.0 : 1.0;
    const double yo = limited ? -16.0 / 219.0 : 0.0;
    const double cs = limited ? 255.0 / 224.0 : 1.0;
    const double co = limited ? -128.0 / 224.0 : -128.0 / 255.0;

    const double rCr = 2.0 * (1.0 - kr);
    const double gCb = -2.0 * kb * (1.0 - kb) / kg;
    const double gCr = -2.0 * kr * (1.0 - kr) / kg;
    const double bCb = 2.0 * (1.0 - kb);

    std::array<float, 16> m{};
    // Column 0: Y.
    m[0] = static_cast<float>(ys);
    m[1] = static_cast<float>(ys);
    m[2] = static_cast<float>(ys);
    // Column 1: Cb.
    m[5] = static_cast<float>(gCb * cs);
    m[6] = static_cast<float>(bCb * cs);
    // Column 2: Cr.
    m[8] = static_cast<float>(rCr * cs);
    m[9] = static_cast<float>(gCr * cs);
    // Column 3: offsets.
    m[12] = static_cast<float>(yo + rCr * co);
    m[13] = static_cast<float>(yo + (gCb + gCr) * co);
    m[14] = static_cast<float>(yo + bCb * co);
    m[15] = 1.0f;
    return m;
}

YuvMatrix defaultMatrixForHeight(int height) {
    return height >= 720 ? YuvMatrix::Bt709 : YuvMatrix::Bt601;
}

std::array<double, 3> yuvToRgb(YuvMatrix matrix, YuvRange range, int y, int cb, int cr) {
    const auto m = yuvToRgbMatrix(matrix, range);
    const double v[4] = {y / 255.0, cb / 255.0, cr / 255.0, 1.0};
    std::array<double, 3> rgb{};
    for (int row = 0; row < 3; ++row) {
        double sum = 0.0;
        for (int col = 0; col < 4; ++col) sum += static_cast<double>(m[static_cast<size_t>(col * 4 + row)]) * v[col];
        rgb[static_cast<size_t>(row)] = sum;
    }
    return rgb;
}

}  // namespace nt
