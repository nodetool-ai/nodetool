// Ported from FilmCraft (https://github.com/storytold/filmcraft) crates/scopes/src/summary.rs at 8c171a0. MIT, see licenses/FilmCraft-MIT.txt.
// JSON shape follows crates/engine/src/scopes.rs at the same revision.
#include "color/ScopeNumbers.h"
#include <QJsonArray>
#include <algorithm>
#include <cmath>

namespace nt::scopes {
namespace {
double round2(double v) { return std::round(v*100)/100; }
struct Acc {
    double min = 0, max = 0, sum = 0;
    std::uint64_t count = 0;
    void add(double v, std::uint32_t n = 1) {
        if (!n) { return; }
        if (!count) { min = max = v; }
        else { min = std::min(min,v); max = std::max(max,v); }
        sum += v*n; count += n;
    }
    QJsonValue level() const {
        if (!count) { return QJsonValue(QJsonValue::Null); }
        return QJsonObject{{"min",round2(min)},{"max",round2(max)},{"mean",round2(sum/count)}};
    }
};
QJsonObject levels(const Waveform &w, int columns) {
    QJsonObject traces;
    for (const auto &g : w.traces) {
        QJsonArray ranges;
        const int buckets = std::clamp(columns,1,std::max(1,g.cols));
        for (int b = 0; b < buckets; ++b) {
            Acc acc;
            const int first = b*g.cols/buckets;
            const int last = std::min(g.cols,std::max(first+1,(b+1)*g.cols/buckets));
            for (int row = 0; row < g.rows; ++row) {
                std::uint32_t count = 0;
                for (int x = first; x < last; ++x) { count += g.data[size_t(row)*g.cols+x]; }
                acc.add(row*100.0/255,count);
            }
            ranges.append(acc.level());
        }
        traces.insert(g.name,ranges);
    }
    return {{"lo",0},{"hi",100},{"columns",columns},{"traces",traces}};
}
QJsonObject vectorNumbers(const Vectorscope &v, int limit) {
    std::vector<std::pair<std::uint32_t,size_t>> cells;
    for (size_t i = 0; i < v.data.size(); ++i) {
        if (v.data[i]) { cells.emplace_back(v.data[i],i); }
    }
    const auto compare = [](auto a,auto b){ return a.first != b.first ? a.first > b.first : a.second < b.second; };
    const auto count = std::min(size_t(limit),cells.size());
    std::partial_sort(cells.begin(),cells.begin()+count,cells.end(),compare);
    QJsonArray peaks;
    for (size_t i = 0; i < count; ++i) {
        const auto [hits,idx] = cells[i];
        const int x = int(idx%v.size), y = int(idx/v.size);
        const auto p = v.point(x,y);
        peaks.append(QJsonObject{{"x",x},{"y",y},{"cb",round2(p[0]*100.0)},{"cr",round2(p[1]*100.0)},
            {"angleDeg",round2(angleDeg(p[0],p[1]))},{"magnitude",round2(std::hypot(p[0],p[1])*200.0)},
            {"share",std::round(double(hits)/std::max(1u,v.samples)*10000)/10000}});
    }
    return {{"samples",double(v.samples)},{"mean",QJsonArray{round2(v.mean[0]*100.0),round2(v.mean[1]*100.0)}},
        {"meanAngleDeg",round2(angleDeg(v.mean[0],v.mean[1]))},{"peaks",peaks}};
}
}
QJsonObject readNumbers(const Signal &s, const NumbersOptions &options) {
    const QStringList all{"waveform","parade","histogram","vectorscope"};
    const auto scopes = options.scopes.isEmpty() ? all : options.scopes;
    for (const auto &name : scopes) {
        if (!all.contains(name)) { return {{"error","unknown scope "+name}}; }
    }
    if (s.rgb.empty() || s.width <= 0 || s.height <= 0 || s.rgb.size() != size_t(s.width)*s.height) {
        return {{"error","no frame"}};
    }
    const int columns = std::clamp(options.columns,1,512), peaks = std::clamp(options.peaks,1,64);
    std::array<Acc,4> acc;
    double cbSum = 0, crSum = 0;
    for (const auto &c : s.rgb) {
        const auto yuv = rgbToYCbCr(c[0]/255.0f,c[1]/255.0f,c[2]/255.0f,options.matrix);
        for (int k = 0; k < 3; ++k) { acc[k].add(c[k]*100.0/255); }
        acc[3].add(yuv[0]*100.0); cbSum += yuv[1]; crSum += yuv[2];
    }
    const float cb = float(cbSum/s.rgb.size()), cr = float(crSum/s.rgb.size());
    const QString matrix = options.matrix == Matrix::Bt601 ? "Bt601" : options.matrix == Matrix::Bt2020 ? "Bt2020" : "Bt709";
    QJsonObject stats{{"r",acc[0].level()},{"g",acc[1].level()},{"b",acc[2].level()},{"y",acc[3].level()},
        {"chromaMean",QJsonArray{round2(cb*100.0),round2(cr*100.0)}},{"hueDeg",round2(angleDeg(cb,cr))},
        {"saturation",round2(std::hypot(cb,cr)*200.0)}};
    QJsonObject out{{"samples",QJsonArray{s.width,s.height}},{"matrix",matrix},{"unit","%"},{"stats",stats}};
    for (const auto &name : scopes) {
        if (name == "waveform") { out[name] = levels(waveformLuma(s,options.matrix),columns); }
        else if (name == "parade") { out[name] = levels(paradeRgb(s),columns); }
        else if (name == "histogram") {
            const auto h = histogram(s,options.matrix);
            QJsonObject hist{{"samples",double(h.samples)}}, peakBins;
            const std::array channels{&h.r,&h.g,&h.b,&h.y};
            constexpr std::array names{"r","g","b","y"};
            for (int k = 0; k < 4; ++k) {
                const auto &bins = *channels[k];
                peakBins[names[k]] = int(std::ranges::max_element(bins)-bins.begin());
                if (options.bins) {
                    QJsonArray values;
                    for (const auto bin : bins) { values.append(double(bin)); }
                    hist[names[k]] = values;
                }
            }
            hist["peakBin"] = peakBins; out[name] = hist;
        } else if (name == "vectorscope") { out[name] = vectorNumbers(vectorscope(s,options.matrix),peaks); }
    }
    return out;
}
}
