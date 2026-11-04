#pragma once
#include <QImage>
#include <QSize>
#include <QString>
#include <algorithm>
#include <cmath>
#include <cstring>
#include <stdexcept>

namespace nt::exporting::delivery {
// The working capture is premultiplied. No transfer conversion occurs here.
inline QImage straightFloat(const QImage& working) {
    if (working.format() != QImage::Format_RGBA16FPx4_Premultiplied &&
        working.format() != QImage::Format_RGBA32FPx4_Premultiplied) {
        throw std::invalid_argument("Float delivery requires a premultiplied float capture");
    }
    auto result = working.convertToFormat(QImage::Format_RGBA32FPx4_Premultiplied);
    result.detach();
    for (int y = 0; y < result.height(); ++y) {
        auto* row = reinterpret_cast<float*>(result.scanLine(y));
        for (int x = 0; x < result.width(); ++x) {
            auto* p = row + 4 * x;
            for (int c = 0; c < 4; ++c) {
                if (!std::isfinite(p[c])) { throw std::invalid_argument("Nonfinite working capture"); }
            }
            const float alpha = p[3];
            for (int c = 0; c < 3; ++c) { p[c] = alpha > 0 ? p[c] / alpha : 0; }
            p[3] = std::clamp(alpha, 0.f, 1.f);
        }
    }
    return result.reinterpretAsFormat(QImage::Format_RGBA32FPx4) ? result : QImage{};
}

inline QImage resample(const QImage& straight, QSize target, const QString& mode, bool explicitSize) {
    if (straight.format() != QImage::Format_RGBA32FPx4) {
        throw std::invalid_argument("Delivery resampling requires straight float pixels");
    }
    if (straight.size() == target) { return straight; }
    if (!explicitSize) { return straight.scaled(target, Qt::IgnoreAspectRatio, Qt::SmoothTransformation); }
    const bool fill = mode == u"fill";
    const auto scaled = straight.scaled(target,
        fill ? Qt::KeepAspectRatioByExpanding : Qt::KeepAspectRatio, Qt::SmoothTransformation);
    if (fill) {
        return scaled.copy((scaled.width() - target.width()) / 2,
                           (scaled.height() - target.height()) / 2, target.width(), target.height());
    }
    QImage result(target, QImage::Format_RGBA32FPx4);
    result.fill(Qt::black);
    const int left = (target.width() - scaled.width()) / 2;
    const int top = (target.height() - scaled.height()) / 2;
    for (int y = 0; y < scaled.height(); ++y) {
        std::memcpy(result.scanLine(top + y) + left * 4 * sizeof(float),
                    scaled.constScanLine(y), scaled.width() * 4 * sizeof(float));
    }
    return result;
}

// 8x8 Bayer ranks, centered on zero. Coordinates are delivery pixels, never
// time or working-texture coordinates. Alpha never receives dither.
inline double dither(int x, int y) {
    unsigned rank = 0;
    for (unsigned bit = 0; bit < 3; ++bit) {
        const unsigned a = (unsigned(x) >> bit) & 1;
        const unsigned b = (unsigned(y) >> bit) & 1;
        rank |= ((a ^ b) * 2 + b) << (4 - bit * 2);
    }
    return (double(rank) + 0.5) / 64.0 - 0.5;
}
inline uchar quantize(double code, int x, int y) {
    return static_cast<uchar>(std::clamp(std::floor(code + dither(x, y) + 0.5), 0.0, 255.0));
}
inline QImage rgba8(const QImage& straight) {
    if (straight.format() != QImage::Format_RGBA32FPx4) {
        throw std::invalid_argument("Delivery quantization requires straight float pixels");
    }
    QImage result(straight.size(), QImage::Format_RGBA8888);
    for (int y = 0; y < result.height(); ++y) {
        const auto* input = reinterpret_cast<const float*>(straight.constScanLine(y));
        auto* output = result.scanLine(y);
        for (int x = 0; x < result.width(); ++x) {
            for (int c = 0; c < 3; ++c) {
                output[4*x+c] = quantize(std::clamp(input[4*x+c], 0.f, 1.f) * 255.0, x, y);
            }
            output[4*x+3] = static_cast<uchar>(std::lround(std::clamp(input[4*x+3], 0.f, 1.f) * 255.0));
        }
    }
    return result;
}
// This staging conversion rounds at 16 bits without dither. YUV conversion
// retains those bits until the final, subsampled delivery planes.
inline QImage rgba64(const QImage& straight) {
    if (straight.format() != QImage::Format_RGBA32FPx4) {
        throw std::invalid_argument("Video staging requires straight float pixels");
    }
    return straight.convertToFormat(QImage::Format_RGBA64);
}
inline void quantizePlane(const uint8_t* source, int sourceStride, uint8_t* target,
                          int targetStride, int width, int height) {
    for (int y = 0; y < height; ++y) {
        const auto* row = reinterpret_cast<const uint16_t*>(source + y * sourceStride);
        for (int x = 0; x < width; ++x) {
            // Limited-range 16-bit codes are 8-bit codes multiplied by 256.
            target[y * targetStride + x] = quantize(row[x] / 256.0, x, y);
        }
    }
}

}
