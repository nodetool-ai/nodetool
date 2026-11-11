// Ported from FilmCraft (https://github.com/storytold/filmcraft) crates/scopes/src/paint.rs at 8c171a0. MIT, see licenses/FilmCraft-MIT.txt.
#include "color/ScopeMath.h"
#include <algorithm>
#include <cmath>
namespace nt::scopes {
namespace {
float intensity(std::uint32_t count, float reference, float gain) {
    if (!count) { return 0; }
    return std::clamp(gain*(.12f+.88f*std::log1p(float(count))/std::log1p(std::max(1.0f,reference))),0.0f,1.0f);
}
std::uint8_t byte(float v) { return static_cast<std::uint8_t>(std::clamp(v,0.0f,1.0f)*255+.5f); }
std::vector<float> intensities(std::uint32_t max, float reference, float gain) {
    std::vector<float> out(size_t(max)+1);
    for (size_t i = 1; i < out.size(); ++i) { out[i] = intensity(std::uint32_t(i),reference,gain); }
    return out;
}
}
QImage paintWaveform(const Waveform &w, const std::vector<std::array<float,3>> &colours, float gain) {
    if (w.traces.empty()) { return {}; }
    const int width = w.traces[0].cols, height = w.traces[0].rows;
    QImage image(width,height,QImage::Format_RGBA8888_Premultiplied);
    if (image.isNull()) { return image; }
    image.fill(Qt::transparent);
    std::vector<std::array<float,3>> acc(size_t(width)*height);
    std::uint32_t maximum = 0;
    for (const auto &g : w.traces) { maximum = std::max(maximum,g.max()); }
    const auto lut = intensities(maximum,std::max(1.0f,w.perColumn/2.0f),gain);
    for (size_t t = 0; t < std::min(w.traces.size(),colours.size()); ++t) {
        const auto &g = w.traces[t];
        if (g.cols != width || g.rows != height) { continue; }
        for (size_t i = 0; i < acc.size(); ++i) {
            const auto count = g.data[i];
            if (count) {
                const auto light = lut[count];
                for (int k = 0; k < 3; ++k) { acc[i][k] += colours[t][k]*light; }
            }
        }
    }
    for (int y = 0; y < height; ++y) {
        auto *dst = image.scanLine(height-1-y);
        const auto *src = acc.data()+size_t(y)*width;
        for (int x = 0; x < width; ++x) {
            for (int k = 0; k < 3; ++k) { dst[x*4+k] = byte(src[x][k]); }
            dst[x*4+3] = byte(std::max({src[x][0],src[x][1],src[x][2]}));
        }
    }
    return image;
}
QImage paintParade(const Waveform &w, float gain) {
    if (w.traces.empty()) { return {}; }
    const int width = w.traces[0].cols, height = w.traces[0].rows;
    const int count = std::min(3,int(w.traces.size()));
    QImage image(width*count+count-1,height,QImage::Format_RGBA8888_Premultiplied);
    if (image.isNull()) { return image; }
    image.fill(Qt::transparent);
    std::uint32_t maximum = 0;
    for (const auto &g : w.traces) { maximum = std::max(maximum,g.max()); }
    const auto lut = intensities(maximum,std::max(1.0f,w.perColumn/2.0f),gain);
    for (int t = 0; t < count; ++t) {
        const auto &g = w.traces[t];
        if (g.cols != width || g.rows != height) { continue; }
        for (int y = 0; y < height; ++y) {
            auto *dst = image.scanLine(height-1-y)+(width+1)*t*4;
            const auto *src = g.data.data()+size_t(y)*width;
            for (int x = 0; x < width; ++x) {
                if (src[x]) { const auto light = byte(lut[src[x]]); dst[x*4+t] = light; dst[x*4+3] = light; }
            }
        }
    }
    return image;
}
QImage paintVectorscope(const Vectorscope &v, float gain) {
    QImage image(v.size,v.size,QImage::Format_RGBA8888_Premultiplied);
    if (image.isNull()) { return image; }
    image.fill(Qt::transparent);
    const auto n = size_t(v.size)*v.size;
    if (v.data.size() != n) { return image; }
    const auto maximum = *std::ranges::max_element(v.data);
    const auto lut = intensities(maximum,std::max(1.0f,v.samples/64.0f),gain);
    std::vector<float> levels(n);
    std::vector<std::array<float,3>> tints(n);
    for (int y = 0; y < v.size; ++y) {
        for (int x = 0; x < v.size; ++x) {
            const auto c = v.data[size_t(y)*v.size+x];
            if (!c) { continue; }
            const auto point = v.point(x,y);
            const float cb = point[0]*.8f, cr = point[1]*.8f;
            const float r = .6f+1.5748f*cr, b = .6f+1.8556f*cb;
            const float g = (.6f-.2126f*r-.0722f*b)/.7152f;
            const std::array<float,3> tint{.55f+.45f*std::clamp(r,0.0f,1.0f),.55f+.45f*std::clamp(g,0.0f,1.0f),.55f+.45f*std::clamp(b,0.0f,1.0f)};
            for (int dy = -1; dy <= 1; ++dy) {
                for (int dx = -1; dx <= 1; ++dx) {
                    const int xx = x+dx, yy = y+dy;
                    if (xx < 0 || yy < 0 || xx >= v.size || yy >= v.size) { continue; }
                    const float weight = dx && dy ? .35f : dx || dy ? .6f : 1.0f;
                    const auto i = size_t(yy)*v.size+xx;
                    const float light = lut[c]*weight;
                    if (light > levels[i]) { levels[i] = light; tints[i] = tint; }
                }
            }
        }
    }
    for (int y = 0; y < v.size; ++y) {
        auto *dst = image.scanLine(y);
        for (int x = 0; x < v.size; ++x) {
            const auto i = size_t(y)*v.size+x;
            for (int k = 0; k < 3; ++k) { dst[x*4+k] = byte(tints[i][k]*levels[i]); }
            dst[x*4+3] = byte(levels[i]);
        }
    }
    return image;
}
QImage paintHistogram(const Histogram &h, int height) {
    QImage image(256,std::max(1,height),QImage::Format_RGBA8888_Premultiplied);
    if (image.isNull()) { return image; }
    image.fill(Qt::transparent);
    std::uint32_t maximum = 1;
    for (const auto *channel : {&h.r,&h.g,&h.b}) {
        maximum = std::max(maximum,*std::max_element(channel->begin()+1,channel->end()-1));
    }
    const std::array channels{&h.r,&h.g,&h.b};
    for (int k = 0; k < 3; ++k) {
        for (int x = 0; x < 256; ++x) {
            const int bar = int(std::min<std::uint64_t>(image.height(),std::uint64_t((*channels[k])[x])*image.height()/maximum));
            for (int y = image.height()-bar; y < image.height(); ++y) {
                auto *dst = image.scanLine(y)+x*4; dst[k] = 255; dst[3] = 255;
            }
        }
    }
    return image;
}
}
