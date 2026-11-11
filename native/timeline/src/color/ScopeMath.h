// Ported from FilmCraft (https://github.com/storytold/filmcraft) crates/scopes/src/lib.rs at 8c171a0. MIT, see licenses/FilmCraft-MIT.txt.
#pragma once
#include <QImage>
#include <QString>
#include <QStringView>
#include <array>
#include <cstdint>
#include <optional>
#include <utility>
#include <vector>

namespace nt::scopes {
enum class Matrix { Bt601, Bt709, Bt2020 };
inline constexpr int kMaxWidth = 480, kMaxHeight = 270;
inline constexpr float kVectorExtent = 0.6f;
inline constexpr float kSkinToneDeg = 123.0f;
inline constexpr int kBins = 256;
// Display-encoded 8-bit samples, row-major. Decimation picks whole pixels.
struct Signal {
    int width = 0, height = 0;
    std::vector<std::array<std::uint8_t, 3>> rgb;
};
Signal decimate(const QImage &frame, int maxWidth = kMaxWidth, int maxHeight = kMaxHeight);
std::array<float, 3> rgbToYCbCr(float r, float g, float b, Matrix m);
std::uint8_t lumaCode(std::array<std::uint8_t, 3> rgb, Matrix m);
// data[row * cols + col], with the lowest signal level at row zero.
struct Grid {
    QString name;
    int cols = 0, rows = 0;
    std::vector<std::uint32_t> data;
    std::uint32_t at(int col, int row) const;
    std::uint64_t total() const;
    std::uint32_t max() const;
    std::vector<int> rowsIn(int col) const;
};
struct Waveform {
    int perColumn = 0;
    std::vector<Grid> traces;
    const Grid *trace(QStringView name) const;
};
Waveform waveformLuma(const Signal &, Matrix);
Waveform waveformRgb(const Signal &);
Waveform paradeRgb(const Signal &);
struct Histogram {
    std::array<std::uint32_t, kBins> r{}, g{}, b{}, y{};
    std::uint32_t samples = 0;
};
Histogram histogram(const Signal &, Matrix);
// Cb increases rightwards. Row zero is at the top, towards positive Cr.
struct Vectorscope {
    int size = 255;
    float extent = kVectorExtent;
    std::vector<std::uint32_t> data;
    std::uint32_t samples = 0;
    std::array<float, 2> mean{0, 0};
    std::uint32_t at(int x, int y) const;
    std::optional<std::pair<int, int>> cell(float cb, float cr) const;
    std::array<float, 2> point(int x, int y) const;
};
Vectorscope vectorscope(const Signal &, Matrix, int size = 255);
float angleDeg(float cb, float cr);
struct Target { QString name; std::array<float, 3> rgb; float cb, cr; };
std::array<Target, 6> targets(Matrix, float amplitude);
QImage paintWaveform(const Waveform &, const std::vector<std::array<float, 3>> &colours, float gain = 1.0f);
QImage paintParade(const Waveform &, float gain = 1.0f);
QImage paintVectorscope(const Vectorscope &, float gain = 1.0f);
QImage paintHistogram(const Histogram &, int height = 128);
}
