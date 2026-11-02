// Ported from FilmCraft crates/render/src/scene.rs (MIT, see licenses/FilmCraft-MIT.txt).
#include "scenedetect/SceneDetect.h"

#include <algorithm>
#include <bit>
#include <cmath>
#include <limits>

namespace nt::shots {

Signature signature(std::span<const std::uint8_t> rgba, int width, int height, int strideBytes) {
    Signature result;
    if (width <= 0 || height <= 0 || strideBytes < 0) {
        return result;
    }
    const auto rowBytes = static_cast<std::size_t>(width) * 4;
    const auto stride = strideBytes == 0 ? rowBytes : static_cast<std::size_t>(strideBytes);
    if (stride < rowBytes || static_cast<std::size_t>(height - 1) > (std::numeric_limits<std::size_t>::max() - rowBytes) / stride ||
        rgba.size() < static_cast<std::size_t>(height - 1) * stride + rowBytes) {
        return result;
    }
    std::array<std::uint32_t, kGridWidth * kGridHeight> count{};
    const int stepX = std::max(width / 256, 1);
    const int stepY = std::max(height / 144, 1);
    std::uint32_t n = 0;
    for (int y = 0; y < height; y += stepY) {
        const auto gy = static_cast<std::size_t>(y) * kGridHeight / height;
        for (int x = 0; x < width; x += stepX) {
            const auto i = static_cast<std::size_t>(y) * stride + static_cast<std::size_t>(x) * 4;
            const float r = static_cast<float>(rgba[i]);
            const float g = static_cast<float>(rgba[i + 1]);
            const float b = static_cast<float>(rgba[i + 2]);
            const float luma = 0.2126F * r + 0.7152F * g + 0.0722F * b;
            const auto gi = gy * kGridWidth + static_cast<std::size_t>(x) * kGridWidth / width;
            result.grid[gi] += luma;
            ++count[gi];
            result.histogram[rgba[i] * kHistogramBins / 256] += 1.0F;
            result.histogram[kHistogramBins + rgba[i + 1] * kHistogramBins / 256] += 1.0F;
            result.histogram[2 * kHistogramBins + rgba[i + 2] * kHistogramBins / 256] += 1.0F;
            ++n;
        }
    }
    for (std::size_t i = 0; i < result.grid.size(); ++i) {
        result.grid[i] = count[i] > 0 ? result.grid[i] / static_cast<float>(count[i]) / 255.0F : 0.0F;
    }
    const float inv = 1.0F / static_cast<float>(std::max(n, 1U));
    for (auto& value : result.histogram) {
        value *= inv;
    }
    return result;
}

Signature signature(const std::uint8_t* rgba, int width, int height, int strideBytes) {
    if (!rgba || width <= 0 || height <= 0 || strideBytes < 0) {
        return {};
    }
    const auto rowBytes = static_cast<std::size_t>(width) * 4;
    const auto stride = strideBytes == 0 ? rowBytes : static_cast<std::size_t>(strideBytes);
    if (stride < rowBytes || static_cast<std::size_t>(height - 1) > (std::numeric_limits<std::size_t>::max() - rowBytes) / stride) {
        return {};
    }
    return signature(std::span<const std::uint8_t>(rgba, static_cast<std::size_t>(height - 1) * stride + rowBytes),
                     width, height, strideBytes);
}

float difference(const Signature& a, const Signature& b) {
    float h = 0.0F;
    for (std::size_t i = 0; i < a.histogram.size(); ++i) {
        h += std::abs(a.histogram[i] - b.histogram[i]);
    }
    h /= 6.0F;
    float g = 0.0F;
    for (std::size_t i = 0; i < a.grid.size(); ++i) {
        g += std::abs(a.grid[i] - b.grid[i]);
    }
    g /= static_cast<float>(kGridWidth * kGridHeight);
    return std::clamp(0.5F * h + 0.5F * std::min(2.0F * g, 1.0F), 0.0F, 1.0F);
}

float SceneOptions::threshold() const {
    const float s = std::clamp(sensitivity, 0.0F, 100.0F) / 100.0F;
    return 0.45F - 0.33F * s;
}

std::vector<int> detectCuts(std::span<const float> diffs, const SceneOptions& options) {
    constexpr std::size_t window = 5;
    const float threshold = options.threshold();
    std::vector<int> cuts;
    for (std::size_t i = 1; i < diffs.size(); ++i) {
        const float d = diffs[i];
        if (d < threshold) {
            continue;
        }
        const auto lo = std::max(i > window ? i - window : 0, std::size_t{1});
        const auto hi = i + std::min(window + 1, diffs.size() - i);
        std::vector<float> around;
        around.reserve(2 * window);
        for (auto j = lo; j < hi; ++j) {
            if (j != i) {
                around.push_back(diffs[j]);
            }
        }
        // Rust f32::total_cmp orders signed zeros and NaNs by their bits too.
        std::sort(around.begin(), around.end(), [](float a, float b) {
            auto key = [](float value) {
                auto bits = std::bit_cast<std::int32_t>(value);
                bits ^= static_cast<std::int32_t>(static_cast<std::uint32_t>(bits >> 31) >> 1);
                return bits;
            };
            return key(a) < key(b);
        });
        const float median = around.empty() ? 0.0F : around[around.size() / 2];
        if (d < 2.5F * median + 0.05F) {
            continue;
        }
        if ((i + 1 < diffs.size() && diffs[i + 1] > d) ||
            (i > 1 && diffs[i - 1] > d && (cuts.empty() || static_cast<std::size_t>(cuts.back()) != i - 1))) {
            continue;
        }
        const auto since = cuts.empty() ? 0 : static_cast<std::size_t>(cuts.back());
        if (i - since < static_cast<std::size_t>(std::max(options.minShotFrames, 1))) {
            continue;
        }
        cuts.push_back(static_cast<int>(i));
    }
    return cuts;
}

}  // namespace nt::shots
