// Ported from FilmCraft (https://github.com/storytold/filmcraft) crates/scopes/src/lib.rs at 8c171a0. MIT, see licenses/FilmCraft-MIT.txt.
#include "color/ScopeMath.h"
#include <algorithm>
#include <cmath>
#include <numbers>
#include <numeric>

namespace nt::scopes {
namespace {
std::array<int, 3> coefficients(Matrix m) {
    switch (m) {
    case Matrix::Bt601: return {2990, 5870, 1140};
    case Matrix::Bt709: return {2126, 7152, 722};
    case Matrix::Bt2020: return {2627, 6780, 593};
    }
    return {2126, 7152, 722};
}
struct LumaTable {
    std::array<int, 256> r{}, g{}, b{};
    explicit LumaTable(Matrix m) {
        const auto k = coefficients(m);
        for (int c = 0; c < 256; ++c) { r[c] = c*k[0]; g[c] = c*k[1]; b[c] = c*k[2]; }
    }
    int sum(const std::array<std::uint8_t,3> &c) const { return r[c[0]] + g[c[1]] + b[c[2]]; }
    std::uint8_t code(const std::array<std::uint8_t,3> &c) const { return (sum(c) + 5000) / 10000; }
};
const LumaTable &table(Matrix m) {
    static const LumaTable bt601(Matrix::Bt601), bt709(Matrix::Bt709), bt2020(Matrix::Bt2020);
    switch (m) {
    case Matrix::Bt601: return bt601;
    case Matrix::Bt709: return bt709;
    case Matrix::Bt2020: return bt2020;
    }
    return bt709;
}
bool valid(const Signal &s) {
    return s.width > 0 && s.height > 0 && s.rgb.size() == size_t(s.width)*size_t(s.height);
}
Grid grid(QString name, int width) { return {std::move(name), width, 256, std::vector<std::uint32_t>(size_t(width)*256)}; }
}
Signal decimate(const QImage &frame, int maxWidth, int maxHeight) {
    if (frame.isNull()) { return {}; }
    const int sx = 1 + (frame.width()-1) / std::max(1,maxWidth);
    const int sy = 1 + (frame.height()-1) / std::max(1,maxHeight);
    Signal s;
    s.width = 1 + (frame.width()-1) / sx;
    s.height = 1 + (frame.height()-1) / sy;
    s.rgb.resize(size_t(s.width)*s.height);
    const auto format = frame.format();
    const bool rgba = format == QImage::Format_RGBA8888 || format == QImage::Format_RGBX8888 ||
                      format == QImage::Format_RGBA8888_Premultiplied;
    const bool argb = format == QImage::Format_ARGB32 || format == QImage::Format_RGB32 ||
                      format == QImage::Format_ARGB32_Premultiplied;
    const QImage converted = rgba || argb ? QImage{} : frame.convertToFormat(QImage::Format_RGBA8888);
    const QImage &source = converted.isNull() ? frame : converted;
    auto dst = s.rgb.begin();
    for (int y = 0; y < frame.height(); y += sy) {
        const auto *row = source.constScanLine(y);
        for (int x = 0; x < frame.width(); x += sx) {
            if (argb) {
                const auto p = reinterpret_cast<const QRgb *>(row)[x];
                *dst++ = {std::uint8_t(qRed(p)), std::uint8_t(qGreen(p)), std::uint8_t(qBlue(p))};
            } else {
                const auto *p = row + size_t(x)*4;
                *dst++ = {p[0],p[1],p[2]};
            }
        }
    }
    return s;
}
std::array<float,3> rgbToYCbCr(float r, float g, float b, Matrix m) {
    const auto k = coefficients(m);
    // The difference form keeps neutral chroma exactly zero.
    const float y = g + (k[0]/10000.0f)*(r-g) + (k[2]/10000.0f)*(b-g);
    return {y,(b-y)/(2*(1-k[2]/10000.0f)),(r-y)/(2*(1-k[0]/10000.0f))};
}
std::uint8_t lumaCode(std::array<std::uint8_t,3> rgb, Matrix m) { return table(m).code(rgb); }
std::uint32_t Grid::at(int col, int row) const {
    if (col < 0 || row < 0 || col >= cols || row >= rows) { return 0; }
    const auto i = size_t(row)*cols + col;
    return i < data.size() ? data[i] : 0;
}
std::uint64_t Grid::total() const { return std::accumulate(data.begin(),data.end(),std::uint64_t{0}); }
std::uint32_t Grid::max() const { return data.empty() ? 0 : *std::ranges::max_element(data); }
std::vector<int> Grid::rowsIn(int col) const {
    std::vector<int> out;
    for (int row = 0; row < rows; ++row) { if (at(col,row)) { out.push_back(row); } }
    return out;
}
const Grid *Waveform::trace(QStringView name) const {
    const auto found = std::ranges::find_if(traces,[&](const Grid &g){ return g.name == name; });
    return found == traces.end() ? nullptr : &*found;
}
Waveform waveformLuma(const Signal &s, Matrix m) {
    if (!valid(s)) { return {}; }
    Waveform w{s.height,{grid("Y",s.width)}};
    const auto &lut = table(m);
    auto *g = w.traces[0].data.data();
    auto pixel = s.rgb.begin();
    for (int y = 0; y < s.height; ++y) {
        for (int x = 0; x < s.width; ++x) { ++g[size_t(lut.code(*pixel++))*s.width+x]; }
    }
    return w;
}
Waveform waveformRgb(const Signal &s) {
    if (!valid(s)) { return {}; }
    Waveform w{s.height,{grid("R",s.width),grid("G",s.width),grid("B",s.width)}};
    auto *r = w.traces[0].data.data(), *g = w.traces[1].data.data(), *b = w.traces[2].data.data();
    auto pixel = s.rgb.begin();
    for (int y = 0; y < s.height; ++y) {
        for (int x = 0; x < s.width; ++x) {
            const auto c = *pixel++;
            ++r[size_t(c[0])*s.width+x]; ++g[size_t(c[1])*s.width+x]; ++b[size_t(c[2])*s.width+x];
        }
    }
    return w;
}
Waveform paradeRgb(const Signal &s) { return waveformRgb(s); }
Histogram histogram(const Signal &s, Matrix m) {
    Histogram h;
    h.samples = static_cast<std::uint32_t>(s.rgb.size());
    const auto &lut = table(m);
    for (const auto &c : s.rgb) { ++h.r[c[0]]; ++h.g[c[1]]; ++h.b[c[2]]; ++h.y[lut.code(c)]; }
    return h;
}
std::uint32_t Vectorscope::at(int x, int y) const {
    if (x < 0 || y < 0 || x >= size || y >= size) { return 0; }
    const auto i = size_t(y)*size+x;
    return i < data.size() ? data[i] : 0;
}
std::optional<std::pair<int,int>> Vectorscope::cell(float cb, float cr) const {
    if (size < 2 || !(extent > 0)) { return {}; }
    const float n = float(size-1);
    const float x = (cb/extent*.5f+.5f)*n, y = (.5f-cr/extent*.5f)*n;
    if (!(x >= 0 && x <= n && y >= 0 && y <= n)) { return {}; }
    return std::pair{int(std::round(x)),int(std::round(y))};
}
std::array<float,2> Vectorscope::point(int x, int y) const {
    if (size < 2) { return {}; }
    const float n = float(size-1);
    return {(x/n-.5f)*2*extent,(.5f-y/n)*2*extent};
}
Vectorscope vectorscope(const Signal &s, Matrix m, int size) {
    Vectorscope v;
    v.size = std::max(2,size);
    v.data.resize(size_t(v.size)*v.size);
    const auto k = coefficients(m);
    const auto &lut = table(m);
    // Fixed-point, per-channel contributions to the grid coordinates. No float
    // conversion or division is needed for each sample.
    constexpr std::int64_t unit = 1 << 20;
    const double scale = (v.size-1)/(2.0*v.extent)*unit;
    const double cbDen = 2.0*(10000-k[2])*255, crDen = 2.0*(10000-k[0])*255;
    std::array<std::array<std::int64_t,256>,3> xs{}, ys{};
    for (int c = 0; c < 256; ++c) {
        xs[0][c] = std::llround(-c*k[0]/cbDen*scale);
        xs[1][c] = std::llround(-c*k[1]/cbDen*scale);
        xs[2][c] = -xs[0][c]-xs[1][c];
        ys[0][c] = std::llround(-c*(10000-k[0])/crDen*scale);
        ys[2][c] = std::llround(c*k[2]/crDen*scale);
        ys[1][c] = -ys[0][c]-ys[2][c];
    }
    const std::int64_t origin = std::int64_t(v.size-1)*unit/2 + unit/2;
    std::int64_t cbSum = 0, crSum = 0;
    for (const auto &c : s.rgb) {
        const int x = int((origin+xs[0][c[0]]+xs[1][c[1]]+xs[2][c[2]])/unit);
        const int y = int((origin+ys[0][c[0]]+ys[1][c[1]]+ys[2][c[2]])/unit);
        ++v.data[size_t(y)*v.size+x];
        const int lum = lut.sum(c);
        cbSum += c[2]*10000-lum; crSum += c[0]*10000-lum;
    }
    v.samples = static_cast<std::uint32_t>(s.rgb.size());
    if (v.samples) { v.mean = {float(cbSum/cbDen/v.samples),float(crSum/crDen/v.samples)}; }
    return v;
}
float angleDeg(float cb, float cr) {
    const float a = std::atan2(cr,cb)*180/std::numbers::pi_v<float>;
    return a < 0 ? a+360 : a;
}
std::array<Target,6> targets(Matrix m, float a) {
    const auto make = [m](QString name,std::array<float,3> rgb) {
        const auto yuv = rgbToYCbCr(rgb[0],rgb[1],rgb[2],m);
        return Target{std::move(name),rgb,yuv[1],yuv[2]};
    };
    return {make("R",{a,0,0}),make("Mg",{a,0,a}),make("B",{0,0,a}),make("Cy",{0,a,a}),make("G",{0,a,0}),make("Yl",{a,a,0})};
}
}
