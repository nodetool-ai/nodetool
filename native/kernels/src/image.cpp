// Histogram and rank kernels of the lib.image.enhance nodes. Each one matches
// the TypeScript loop it replaced bit for bit, including that loop's float32
// storage of the tile CDFs in AdaptiveContrast.
#include "nodetool/kernels.h"

#include "js_math.h"

#include <algorithm>
#include <array>
#include <cstring>
#include <vector>

namespace {

using nt::kernels::jsRound;
using nt::kernels::u8;

constexpr size_t kChannels = 4;

bool validImage(const uint8_t* src, const uint8_t* dst, uint32_t width,
                uint32_t height) {
  return src && dst && width > 0 && height > 0;
}

size_t byteCount(uint32_t width, uint32_t height) {
  return static_cast<size_t>(width) * height * kChannels;
}

std::array<uint32_t, 256> histogram(const uint8_t* rgba, size_t bytes,
                                    size_t channel) {
  std::array<uint32_t, 256> hist{};
  for (size_t i = channel; i < bytes; i += kChannels) hist[rgba[i]]++;
  return hist;
}

// The k-th smallest value of the 256-bin histogram `hist`.
uint8_t histogramRank(const std::array<uint32_t, 256>& hist, uint32_t k) {
  uint32_t seen = 0;
  for (int v = 0; v < 256; v++) {
    seen += hist[v];
    if (seen > k) return static_cast<uint8_t>(v);
  }
  return 255;
}

}  // namespace

extern "C" {

int nt_image_auto_contrast(const uint8_t* src, uint8_t* dst, uint32_t width,
                           uint32_t height, double cutoff_percent) {
  if (!validImage(src, dst, width, height)) return NT_ERR_ARGS;
  const size_t bytes = byteCount(width, height);
  const double totalPixels = static_cast<double>(width) * height;
  const double cutCount = std::floor((totalPixels * cutoff_percent) / 100);
  std::memcpy(dst, src, bytes);
  for (size_t c = 0; c < 3; c++) {
    const auto hist = histogram(dst, bytes, c);
    int lo = 0;
    double cumLo = 0;
    while (lo < 255 && cumLo + hist[lo] <= cutCount) {
      cumLo += hist[lo];
      lo++;
    }
    int hi = 255;
    double cumHi = 0;
    while (hi > 0 && cumHi + hist[hi] <= cutCount) {
      cumHi += hist[hi];
      hi--;
    }
    if (lo >= hi) continue;
    const double scale = 255.0 / (hi - lo);
    for (size_t i = c; i < bytes; i += kChannels) {
      dst[i] = u8(jsRound((dst[i] - lo) * scale));
    }
  }
  return NT_OK;
}

int nt_image_equalize(const uint8_t* src, uint8_t* dst, uint32_t width,
                      uint32_t height) {
  if (!validImage(src, dst, width, height)) return NT_ERR_ARGS;
  const size_t bytes = byteCount(width, height);
  const double totalPixels = static_cast<double>(width) * height;
  std::memcpy(dst, src, bytes);
  for (size_t c = 0; c < 3; c++) {
    const auto hist = histogram(dst, bytes, c);
    std::array<uint32_t, 256> cdf{};
    cdf[0] = hist[0];
    for (int j = 1; j < 256; j++) cdf[j] = cdf[j - 1] + hist[j];
    uint32_t cdfMin = 0;
    for (int j = 0; j < 256; j++) {
      if (cdf[j] > 0) {
        cdfMin = cdf[j];
        break;
      }
    }
    std::array<uint8_t, 256> lut{};
    const double denom = totalPixels - cdfMin;
    if (denom > 0) {
      for (int j = 0; j < 256; j++) {
        // Bins below the first occupied one are never read.
        lut[j] = u8(jsRound(((static_cast<double>(cdf[j]) - cdfMin) / denom) * 255));
      }
    }
    for (size_t i = c; i < bytes; i += kChannels) dst[i] = lut[dst[i]];
  }
  return NT_OK;
}

int nt_image_adaptive_contrast(const uint8_t* src, uint8_t* dst, uint32_t width,
                               uint32_t height, double clip_limit,
                               uint32_t grid_size) {
  if (!validImage(src, dst, width, height) || grid_size == 0 || grid_size > NT_IMAGE_MAX_GRID) {
    return NT_ERR_ARGS;
  }
  const int64_t w = width;
  const int64_t h = height;
  const int64_t grid = grid_size;
  const int64_t tileW = (w + grid - 1) / grid;
  const int64_t tileH = (h + grid - 1) / grid;
  // cdfs[((ty * grid + tx) * 3 + c) * 256 + value], float32 as in the
  // TypeScript loop, which kept each CDF in a Float32Array.
  std::vector<float> cdfs(static_cast<size_t>(grid * grid * 3 * 256));
  for (int64_t ty = 0; ty < grid; ty++) {
    for (int64_t tx = 0; tx < grid; tx++) {
      const int64_t x0 = tx * tileW;
      const int64_t y0 = ty * tileH;
      const int64_t x1 = std::min(x0 + tileW, w);
      const int64_t y1 = std::min(y0 + tileH, h);
      // A tile past the image edge has a negative extent, so no pixels.
      const double tilePixels = static_cast<double>((x1 - x0) * (y1 - y0));
      for (int64_t c = 0; c < 3; c++) {
        std::array<uint32_t, 256> hist{};
        for (int64_t y = y0; y < y1; y++) {
          for (int64_t x = x0; x < x1; x++) {
            hist[src[(y * w + x) * kChannels + c]]++;
          }
        }
        const double limit = std::max(1.0, jsRound((clip_limit * tilePixels) / 256));
        double excess = 0;
        for (auto& count : hist) {
          if (count > limit) {
            excess += count - limit;
            count = static_cast<uint32_t>(limit);
          }
        }
        const auto increment = static_cast<uint32_t>(std::floor(excess / 256));
        for (auto& count : hist) count += increment;
        float* cdf = &cdfs[static_cast<size_t>(((ty * grid + tx) * 3 + c) * 256)];
        cdf[0] = static_cast<float>(hist[0]);
        for (int j = 1; j < 256; j++) {
          cdf[j] = static_cast<float>(static_cast<double>(cdf[j - 1]) + hist[j]);
        }
        const double cdfMax = cdf[255];
        if (cdfMax > 0) {
          for (int j = 0; j < 256; j++) {
            cdf[j] = static_cast<float>((cdf[j] / cdfMax) * 255);
          }
        }
      }
    }
  }
  std::memcpy(dst, src, byteCount(width, height));
  const auto tileCdf = [&](int64_t ty, int64_t tx, int64_t c) {
    return &cdfs[static_cast<size_t>(((ty * grid + tx) * 3 + c) * 256)];
  };
  for (int64_t y = 0; y < h; y++) {
    const double fty = (static_cast<double>(y) + 0.5) / static_cast<double>(tileH) - 0.5;
    const int64_t ty0 = std::max<int64_t>(0, static_cast<int64_t>(std::floor(fty)));
    const int64_t ty1 = std::min(grid - 1, ty0 + 1);
    const double fy = std::max(0.0, std::min(1.0, fty - static_cast<double>(ty0)));
    for (int64_t x = 0; x < w; x++) {
      const double ftx = (static_cast<double>(x) + 0.5) / static_cast<double>(tileW) - 0.5;
      const int64_t tx0 = std::max<int64_t>(0, static_cast<int64_t>(std::floor(ftx)));
      const int64_t tx1 = std::min(grid - 1, tx0 + 1);
      const double fx = std::max(0.0, std::min(1.0, ftx - static_cast<double>(tx0)));
      for (int64_t c = 0; c < 3; c++) {
        const size_t at = static_cast<size_t>((y * w + x) * kChannels + c);
        const uint8_t val = src[at];
        const double tl = tileCdf(ty0, tx0, c)[val];
        const double tr = tileCdf(ty0, tx1, c)[val];
        const double bl = tileCdf(ty1, tx0, c)[val];
        const double br = tileCdf(ty1, tx1, c)[val];
        const double top = tl * (1 - fx) + tr * fx;
        const double bot = bl * (1 - fx) + br * fx;
        dst[at] = u8(jsRound(top * (1 - fy) + bot * fy));
      }
    }
  }
  return NT_OK;
}

int nt_image_rank_filter(const uint8_t* src, uint8_t* dst, uint32_t width,
                         uint32_t height, uint32_t size, uint32_t rank) {
  if (!validImage(src, dst, width, height)) return NT_ERR_ARGS;
  const int64_t w = width;
  const int64_t h = height;
  const int64_t half = std::clamp<uint32_t>(size, 1, 25) / 2;
  const int64_t side = 2 * half + 1;
  const auto count = static_cast<uint32_t>(side * side);
  const uint32_t k = std::min(rank, count - 1);
  std::memcpy(dst, src, byteCount(width, height));
  const auto clampX = [&](int64_t x) { return std::clamp<int64_t>(x, 0, w - 1); };
  const auto clampY = [&](int64_t y) { return std::clamp<int64_t>(y, 0, h - 1); };
  const auto at = [&](int64_t x, int64_t y, int64_t c) {
    return static_cast<size_t>((y * w + x) * kChannels + c);
  };

  // Small windows: select from the gathered neighbourhood. Large windows:
  // a histogram per channel that slides one column per pixel. Both give the
  // k-th smallest value of the same multiset.
  if (count <= 49) {
    std::array<uint8_t, 49> window{};
    for (int64_t y = 0; y < h; y++) {
      for (int64_t x = 0; x < w; x++) {
        for (int64_t c = 0; c < 3; c++) {
          size_t n = 0;
          for (int64_t ky = -half; ky <= half; ky++) {
            const int64_t ny = clampY(y + ky);
            for (int64_t kx = -half; kx <= half; kx++) {
              window[n++] = src[at(clampX(x + kx), ny, c)];
            }
          }
          std::nth_element(window.begin(), window.begin() + k, window.begin() + n);
          dst[at(x, y, c)] = window[k];
        }
      }
    }
    return NT_OK;
  }

  std::array<std::array<uint32_t, 256>, 3> hist{};
  for (int64_t y = 0; y < h; y++) {
    for (auto& channel : hist) channel.fill(0);
    for (int64_t ky = -half; ky <= half; ky++) {
      const int64_t ny = clampY(y + ky);
      for (int64_t kx = -half; kx <= half; kx++) {
        for (int64_t c = 0; c < 3; c++) hist[c][src[at(clampX(kx), ny, c)]]++;
      }
    }
    for (int64_t x = 0; x < w; x++) {
      for (int64_t c = 0; c < 3; c++) dst[at(x, y, c)] = histogramRank(hist[c], k);
      if (x + 1 == w) break;
      const int64_t leaving = clampX(x - half);
      const int64_t entering = clampX(x + 1 + half);
      for (int64_t ky = -half; ky <= half; ky++) {
        const int64_t ny = clampY(y + ky);
        for (int64_t c = 0; c < 3; c++) {
          hist[c][src[at(leaving, ny, c)]]--;
          hist[c][src[at(entering, ny, c)]]++;
        }
      }
    }
  }
  return NT_OK;
}

}  // extern "C"
