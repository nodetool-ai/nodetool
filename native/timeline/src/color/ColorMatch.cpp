// Ported from FilmCraft (https://github.com/storytold/filmcraft) crates/render/src/color_match.rs at 8c171a0. MIT, see licenses/FilmCraft-MIT.txt.
#include "color/ColorMatch.h"
#include "color/ColorMatchMath.h"
#include "preview/effects/ClipEffects.h"
#include <QJsonObject>
#include <qfloat16.h>
#include <algorithm>
#include <cmath>
#include <memory>
#include <numbers>
#include <numeric>
#include <optional>
#include <vector>

namespace nt::color {
namespace {
using detail::Triple;
using detail::Stats;
using nt::effects::Op;
using nt::effects::Pass;
using Parameters = std::array<double,10>;
double clamp(double x) { return std::clamp(x,0.0,1.0); }
double smooth(double a, double b, double x) { const double t = clamp((x-a)/(b-a)); return t*t*(3-2*t); }
double linear(double x) { return x <= .04045 ? x/12.92 : std::pow((x+.055)/1.055,2.4); }
Triple labOf(Triple encoded) {
    for (auto &v : encoded) { v = linear(v); }
    return detail::oklab(encoded);
}
struct Frame {
    int width = 0, height = 0;
    std::vector<Triple> rgb;
};
bool floatImage(const QImage &image) {
    return image.format() == QImage::Format_RGBA16FPx4 ||
           image.format() == QImage::Format_RGBA16FPx4_Premultiplied ||
           image.format() == QImage::Format_RGBA32FPx4 ||
           image.format() == QImage::Format_RGBA32FPx4_Premultiplied;
}
Frame pixels(const QImage &image) {
    if (floatImage(image)) {
        const auto rgba = image.convertToFormat(QImage::Format_RGBA32FPx4);
        Frame out{image.width(),image.height(),{}};
        out.rgb.reserve(size_t(out.width)*out.height);
        for (int y = 0; y < out.height; ++y) {
            const auto *row = reinterpret_cast<const float*>(rgba.constScanLine(y));
            for (int x = 0; x < out.width; ++x) { out.rgb.push_back({row[x*4],row[x*4+1],row[x*4+2]}); }
        }
        return out;
    }
    const auto rgba = image.convertToFormat(QImage::Format_RGBA8888);
    Frame out{image.width(),image.height(),{}};
    out.rgb.reserve(size_t(out.width)*out.height);
    for (int y = 0; y < out.height; ++y) {
        const auto *row = rgba.constScanLine(y);
        for (int x = 0; x < out.width; ++x) { out.rgb.push_back({row[x*4]/255.0,row[x*4+1]/255.0,row[x*4+2]/255.0}); }
    }
    return out;
}
Frame boxResize(const Frame &source, int width, int height) {
    if (source.width == width && source.height == height) { return source; }
    Frame out{width,height,std::vector<Triple>(size_t(width)*height)};
    const double sx = double(source.width)/width, sy = double(source.height)/height;
    for (int y = 0; y < height; ++y) {
        const double y0 = y*sy, y1 = (y+1)*sy;
        for (int x = 0; x < width; ++x) {
            const double x0 = x*sx, x1 = (x+1)*sx;
            Triple sum{};
            for (int yy = int(y0); yy < std::min(source.height,int(std::ceil(y1))); ++yy) {
                const double wy = std::min(y1,double(yy+1))-std::max(y0,double(yy));
                for (int xx = int(x0); xx < std::min(source.width,int(std::ceil(x1))); ++xx) {
                    const double weight = wy*(std::min(x1,double(xx+1))-std::max(x0,double(xx)));
                    const auto &c = source.rgb[size_t(yy)*source.width+xx];
                    for (int k = 0; k < 3; ++k) { sum[k] += c[k]*weight; }
                }
            }
            for (auto &v : sum) { v /= sx*sy; }
            out.rgb[size_t(y)*width+x] = sum;
        }
    }
    return out;
}
std::pair<Frame,Frame> pairedFrames(const QImage &a, const QImage &b) {
    const int width = std::min({96,a.width(),b.width()});
    const int height = std::max(1,std::min(int(std::lround(double(a.height())*width/a.width())),
                                         int(std::lround(double(b.height())*width/b.width()))));
    return {boxResize(pixels(a),width,height),boxResize(pixels(b),width,height)};
}
// A Curves pass carries the table the renderer samples, built once per plan.
struct ColourPass : Pass {
    std::shared_ptr<const std::array<float,1024>> curveTable;
};
std::vector<ColourPass> colourPlan(const QJsonArray &effects, const QJsonArray &trackEffects) {
    auto plan = nt::effects::planChain(effects,trackEffects);
    std::erase_if(plan,[](const Pass &p) {
        return p.op != Op::LiftGammaGain && p.op != Op::Curves && p.op != Op::Levels && p.op != Op::Cdl &&
               p.op != Op::Grade && p.op != Op::Vignette;
    });
    std::vector<ColourPass> out;
    out.reserve(plan.size());
    for (const auto &pass : plan) {
        out.push_back({pass,pass.op == Op::Curves ? std::make_shared<const std::array<float,1024>>(nt::effects::curveTransfer(pass.curve)) : nullptr});
    }
    return out;
}
int matchIndex(const QJsonArray &effects) {
    for (int i = 0; i < effects.size(); ++i) {
        const auto type = effects[i].toObject()["type"].toString();
        if (type == "liftGammaGain") { return i; }
    }
    for (int i = 0; i < effects.size(); ++i) {
        const auto type = effects[i].toObject()["type"].toString();
        if (type == "curves" || type == "vignette") { return i; }
    }
    return int(effects.size());
}
std::array<float,3> rotateHue(std::array<float,3> rgb, float degrees) {
    const float hi = std::max({rgb[0],rgb[1],rgb[2]}), lo = std::min({rgb[0],rgb[1],rgb[2]});
    const float delta = hi-lo;
    float hue = 0, sat = 0;
    if (delta > .00001f) {
        sat = delta/hi;
        if (hi == rgb[0]) { hue = (rgb[1]-rgb[2])/delta; if (rgb[1] < rgb[2]) { hue += 6; } }
        else if (hi == rgb[1]) { hue = 2+(rgb[2]-rgb[0])/delta; }
        else { hue = 4+(rgb[0]-rgb[1])/delta; }
        hue /= 6;
    }
    hue += degrees/360; hue -= std::floor(hue); hue *= 6;
    const int sector = int(std::floor(hue));
    const float f = hue-std::floor(hue), a = hi*(1-sat), b = hi*(1-sat*f), c = hi*(1-sat*(1-f));
    switch (sector%6) {
    case 0: return {hi,c,a}; case 1: return {b,hi,a}; case 2: return {a,hi,c};
    case 3: return {a,b,hi}; case 4: return {c,a,hi}; default: return {hi,a,b};
    }
}
// (u, v) is the pixel center in 0..1 of the clip's surface and aspect its width over height. Only a vignette reads them.
Triple evaluate(Triple input, const std::vector<ColourPass> &plan, double u, double v, double aspect, nt::WorkingFormat format) {
    std::array<float,3> rgb{float(input[0]),float(input[1]),float(input[2])};
    bool applied = false;
    const auto sat = [](float v) { return std::clamp(v,0.0f,1.0f); };
    const auto lum = [&] { return rgb[0]*.299f+rgb[1]*.587f+rgb[2]*.114f; };
    for (const auto &pass : plan) {
        const auto &p = pass.params;
        if (pass.op == Op::LiftGammaGain) {
            bool neutral = true;
            for (int k = 0; k < 3; ++k) { neutral = neutral && p[k] == 0 && p[4+k] == 1 && p[8+k] == 1; }
            if (neutral) { continue; }
        }
        if (pass.op == Op::Grade) {
            bool neutral = true;
            for (int k = 0; k < 8; ++k) { neutral = neutral && std::abs(p[k]-(k == 1 || k == 2 ? 1 : 0)) <= .001f; }
            if (neutral) { continue; }
        }
        applied = true;
        switch (pass.op) {
        case Op::LiftGammaGain:
            for (int k = 0; k < 3; ++k) { rgb[k] = std::pow(std::max((rgb[k]+p[k])*p[8+k],0.0f),1/std::max(p[4+k],.01f)); }
            break;
        case Op::Vignette: {
            const float inner = std::max(0.0f,p[1]-p[2]), outer = std::max(inner+.001f,p[1]);
            const double axisX = 1+p[5]*(std::max(aspect,1.0)-1), axisY = 1+p[5]*(std::max(1/aspect,1.0)-1);
            const float t = sat((float(std::hypot((u-p[3])*2*axisX,(v-p[4])*2*axisY))-inner)/(outer-inner));
            for (auto &value : rgb) { value *= 1-p[0]*t*t*(3-2*t); }
            break;
        }
        case Op::Curves:
            for (int k = 0; k < 3; ++k) {
                const float at = sat(rgb[k])*255;
                const int lo = int(at), hi = std::min(255,lo+1);
                const auto &table = *pass.curveTable;
                rgb[k] = std::lerp(table[size_t(lo)*4+k],table[size_t(hi)*4+k],at-float(lo));
            }
            break;
        case Op::Levels:
            for (auto &value : rgb) { value = std::pow(sat((value-p[0])/std::max(1.0f/255,p[2]-p[0])),1/std::max(.01f,p[1])); }
            break;
        case Op::Cdl:
            for (auto &value : rgb) { value = sat(value*p[0]+p[1]); }
            break;
        case Op::Grade:
            if (std::abs(p[0]) > .001f) { for (auto &value : rgb) { value = sat(value+p[0]); } }
            if (std::abs(p[1]-1) > .001f) { for (auto &value : rgb) { value = sat((value-.5f)*p[1]+.5f); } }
            if (std::abs(p[2]-1) > .001f) {
                const float l = lum(); for (auto &value : rgb) { value = sat(l+(value-l)*p[2]); }
            }
            if (std::abs(p[3]) > .001f) { rgb = rotateHue(rgb,p[3]); }
            if (std::abs(p[4]) > .001f) {
                const float t = p[4];
                if (t > 0) { rgb = {std::min(1.0f,rgb[0]+t*.2f),std::min(1.0f,rgb[1]+t*.1f),std::max(0.0f,rgb[2]-t*.2f)}; }
                else { rgb = {std::max(0.0f,rgb[0]+t*.2f),std::max(0.0f,rgb[1]+t*.05f),std::min(1.0f,rgb[2]-t*.2f)}; }
            }
            if (std::abs(p[5]) > .001f) { rgb = {sat(rgb[0]+p[5]*.1f),sat(rgb[1]-p[5]*.2f),sat(rgb[2]+p[5]*.1f)}; }
            if (std::abs(p[6]) > .001f || std::abs(p[7]) > .001f) {
                const float l = lum();
                const float adj = p[6]*(1-float(smooth(0,.33f,l)))*.3f+p[7]*float(smooth(.66f,1,l))*.3f;
                for (auto &value : rgb) { value = sat(value+adj); }
            }
            break;
        default: break;
        }
        // Each pass writes the route's storage, including between Levels and CDL.
        for (auto &value : rgb) {
            value = format == nt::WorkingFormat::Rgba8
                ? std::round(sat(value)*255)/255 : float(qfloat16(sat(value)));
        }
    }
    return applied ? Triple{rgb[0],rgb[1],rgb[2]} : input;
}
Frame graded(const Frame &source, const std::vector<ColourPass> &plan, nt::WorkingFormat format) {
    Frame out = source;
    for (int y = 0; y < out.height; ++y) {
        for (int x = 0; x < out.width; ++x) {
            auto &c = out.rgb[size_t(y)*out.width+x];
            c = evaluate(c,plan,(x+.5)/out.width,(y+.5)/out.height,double(out.width)/out.height,format);
        }
    }
    return out;
}
Stats stats(const Frame &frame, bool protectSkin) {
    Stats out;
    std::array<double,3> colourWeights{};
    double chromaWeight = 0;
    for (const auto &pixel : frame.rgb) {
        const auto lab = labOf(pixel);
        const double sk = detail::skinWeight(lab), cw = protectSkin ? 1-.8*sk : 1;
        const auto weights = detail::tonalWeights(lab[0]);
        for (int k = 0; k < 3; ++k) {
            const double weight = weights[k];
            out.bands[k][0] += weight; out.bands[k][1] += weight*lab[0];
            out.bands[k][2] += weight*cw*lab[1]; out.bands[k][3] += weight*cw*lab[2];
            colourWeights[k] += weight*cw;
        }
        out.chroma += cw*std::hypot(lab[1],lab[2]); chromaWeight += cw;
        out.skin[0] += sk*lab[1]; out.skin[1] += sk*lab[2]; out.skin[2] += sk;
    }
    const double n = double(std::max(size_t(1),frame.rgb.size()));
    for (int k = 0; k < 3; ++k) {
        auto &band = out.bands[k];
        band[1] /= std::max(1e-9,band[0]); band[0] /= n;
        band[2] /= std::max(1e-9,colourWeights[k]); band[3] /= std::max(1e-9,colourWeights[k]);
    }
    out.chroma /= std::max(1e-9,chromaWeight);
    out.skin[0] /= std::max(1e-9,out.skin[2]); out.skin[1] /= std::max(1e-9,out.skin[2]); out.skin[2] /= n;
    return out;
}
Triple meanLab(const Frame &frame) {
    Triple mean{};
    for (const auto &c : frame.rgb) {
        const auto lab = labOf(c);
        for (int k = 0; k < 3; ++k) { mean[k] += lab[k]; }
    }
    for (auto &v : mean) { v /= std::max(size_t(1),frame.rgb.size()); }
    return mean;
}
double difference(const Frame &a, const Frame &b) {
    const auto ma = meanLab(a), mb = meanLab(b);
    return std::hypot(ma[0]-mb[0],ma[1]-mb[1],ma[2]-mb[2]);
}
Parameters residuals(const Stats &current, const Stats &reference) {
    Parameters r{};
    for (int k = 0; k < 3; ++k) {
        const double w = std::sqrt(clamp(std::min(current.bands[k][0],reference.bands[k][0])*3));
        for (int j = 0; j < 3; ++j) { r[k*3+j] = (current.bands[k][j+1]-reference.bands[k][j+1])*w*(j ? 2 : 1); }
    }
    r[9] = (current.chroma-reference.chroma)*2;
    return r;
}
double squareNorm(const Parameters &p) { return std::inner_product(p.begin(),p.end(),p.begin(),0.0); }
std::optional<Parameters> solveLinear(std::array<Parameters,10> a, Parameters b) {
    for (int col = 0; col < 10; ++col) {
        int pivot = col;
        for (int i = col+1; i < 10; ++i) { if (std::abs(a[i][col]) > std::abs(a[pivot][col])) { pivot = i; } }
        if (std::abs(a[pivot][col]) < 1e-14) { return {}; }
        std::swap(a[pivot],a[col]); std::swap(b[pivot],b[col]);
        for (int row = col+1; row < 10; ++row) {
            const double f = a[row][col]/a[col][col];
            for (int k = col; k < 10; ++k) { a[row][k] -= f*a[col][k]; }
            b[row] -= f*b[col];
        }
    }
    Parameters x{};
    for (int i = 9; i >= 0; --i) {
        double sum = 0;
        for (int k = i+1; k < 10; ++k) { sum += a[i][k]*x[k]; }
        x[i] = (b[i]-sum)/a[i][i];
    }
    return x;
}
MatchResult values(const Parameters &x) {
    MatchResult r;
    // Normalised parameters: one unit is .5 lift or two stops of gamma/gain.
    for (int k = 0; k < 3; ++k) { r.lift[k] = .5*x[k]; r.gamma[k] = std::exp2(2*x[3+k]); r.gain[k] = std::exp2(2*x[6+k]); }
    r.saturationScale = std::exp2(2*x[9]);
    return r;
}
struct SearchPlan {
    std::vector<ColourPass> passes;
    size_t lgg = 0, grade = 0;
    double saturation = 1;
    void set(const Parameters &x) {
        const auto r = values(x);
        auto &p = passes[lgg].params;
        for (int k = 0; k < 3; ++k) { p[k] = float(r.lift[k]); p[4+k] = float(r.gamma[k]); p[8+k] = float(r.gain[k]); }
        passes[grade].params[2] = float(std::clamp(saturation*r.saturationScale,0.0,4.0));
    }
};
SearchPlan searchPlan(const QJsonArray &effects, const QJsonArray &trackEffects) {
    QJsonArray list = effects;
    bool foundLgg = false, foundColour = false;
    for (int i = 0; i < list.size(); ++i) {
        auto e = list[i].toObject();
        if (!foundLgg && e["type"] == "liftGammaGain") { e["enabled"] = true; foundLgg = true; }
        if (e["id"] == "inspector:color") { e["enabled"] = true; foundColour = true; }
        list[i] = e;
    }
    if (!foundLgg) { list.insert(matchIndex(list),QJsonObject{{"type","liftGammaGain"},{"enabled",true}}); }
    if (!foundColour) { list.append(QJsonObject{{"id","inspector:color"},{"type","color"},{"enabled",true}}); }
    std::array<double,8> grade{0,1,1,0,0,0,0,0};
    constexpr std::array keys{"brightness","contrast","saturation","hue","temperature","tint","shadows","highlights"};
    // The renderer sums clip and track color into one pass.
    QJsonArray colours = list;
    for (const auto &value : trackEffects) { colours.append(value); }
    for (const auto &value : colours) {
        const auto e = value.toObject();
        if (e["type"] != "color" || !e["enabled"].toBool()) { continue; }
        for (int k = 0; k < 8; ++k) {
            if (k == 1 || k == 2) { grade[k] *= e[keys[k]].toDouble(1); }
            else { grade[k] += e[keys[k]].toDouble(); }
        }
    }
    // A zero-saturation sentinel guarantees planChain retains the aggregate Grade.
    list.append(QJsonObject{{"type","color"},{"enabled",true},{"saturation",0}});
    SearchPlan out;
    out.passes = colourPlan(list,trackEffects);
    out.saturation = grade[2];
    for (size_t i = 0; i < out.passes.size(); ++i) {
        if (out.passes[i].op == Op::LiftGammaGain) { out.lgg = i; break; }
    }
    for (size_t i = 0; i < out.passes.size(); ++i) {
        if (out.passes[i].op != Op::Grade) { continue; }
        out.grade = i;
        for (int k = 0; k < 8; ++k) {
            const double v = k == 3 ? std::fmod(std::fmod(grade[k],360)+540,360)-180 :
                std::clamp(grade[k],k == 1 || k == 2 ? 0.0 : -1.0,k == 1 || k == 2 ? 4.0 : 1.0);
            out.passes[i].params[k] = float(v);
        }
    }
    return out;
}
}
namespace detail {
Triple oklab(Triple c) {
    for (auto &v : c) { v = std::max(0.0,v); }
    const auto [r,g,b] = c;
    const double l = std::cbrt(.41222147*r+.53633255*g+.051445995*b);
    const double m = std::cbrt(.2119035*r+.6806995*g+.10739696*b);
    const double s = std::cbrt(.08830246*r+.28171885*g+.6299787*b);
    return {.21045426*l+.7936178*m-.004072047*s,1.9779985*l-2.4285922*m+.4505937*s,.025904037*l+.78277177*m-.80867577*s};
}
Triple tonalWeights(double l) {
    const double s = smooth(.55,.15,l), h = smooth(.45,.85,l);
    return {s,std::max(0.0,1-s-h),h};
}
double skinWeight(Triple lab) {
    const double c = std::hypot(lab[1],lab[2]);
    if (c < .02 || c > .2 || lab[0] < .25 || lab[0] > .92) { return 0; }
    const double hue = std::atan2(lab[2],lab[1])*180/std::numbers::pi;
    const double d = hue < 20 ? 20-hue : hue > 75 ? hue-75 : 0;
    return clamp(1-d/10);
}
Stats statistics(const QImage &image, bool protectSkin) { return stats(pixels(image),protectSkin); }
}
QImage trimBlackBars(const QImage &image) {
    if (image.isNull()) { return image; }
    const bool fp = floatImage(image);
    const auto rgba = image.convertToFormat(fp ? QImage::Format_RGBA32FPx4 : QImage::Format_RGBA8888);
    int left = image.width(), right = -1, top = image.height(), bottom = -1;
    for (int y = 0; y < image.height(); ++y) {
        const auto *row = rgba.constScanLine(y);
        for (int x = 0; x < image.width(); ++x) {
            const auto *c = row+x*4;
            const auto *f = fp ? reinterpret_cast<const float*>(row)+x*4 : nullptr;
            // Same black-bar cutoff, without byte conversion of working samples.
            const bool visible = fp ? (f[0] >= 2.5/255 || f[1] >= 2.5/255 || f[2] >= 2.5/255)
                                    : (c[0] > 2 || c[1] > 2 || c[2] > 2);
            if (visible) {
                left = std::min(left,x); right = std::max(right,x); top = std::min(top,y); bottom = std::max(bottom,y);
            }
        }
    }
    if (right < left || (left == 0 && right == image.width()-1 && top == 0 && bottom == image.height()-1)) { return image; }
    return image.copy(left,top,right-left+1,bottom-top+1);
}
QImage applyGrade(const QImage &frame, const QJsonArray &effects, const QJsonArray &trackEffects, nt::WorkingFormat format) {
    if (frame.isNull()) { return {}; }
    if (format == nt::WorkingFormat::Rgba16F) {
        auto out = frame.convertToFormat(QImage::Format_RGBA32FPx4);
        const auto plan = colourPlan(effects,trackEffects);
        for (int y = 0; y < out.height(); ++y) {
            auto *row = reinterpret_cast<float*>(out.scanLine(y));
            for (int x = 0; x < out.width(); ++x) {
                auto *p = row+x*4;
                const auto c = evaluate({p[0],p[1],p[2]},plan,(x+.5)/out.width(),
                    (y+.5)/out.height(),double(out.width())/out.height(),format);
                for (int k = 0; k < 3; ++k) { p[k] = float(c[k]); }
                p[3] = 1;
            }
        }
        return out;
    }
    auto out = frame.convertToFormat(QImage::Format_RGBA8888);
    const auto plan = colourPlan(effects,trackEffects);
    for (int y = 0; y < out.height(); ++y) {
        auto *row = out.scanLine(y);
        for (int x = 0; x < out.width(); ++x) {
            auto *p = row+x*4;
            const auto c = evaluate({p[0]/255.0,p[1]/255.0,p[2]/255.0},plan,(x+.5)/out.width(),(y+.5)/out.height(),double(out.width())/out.height(),format);
            for (int k = 0; k < 3; ++k) { p[k] = std::uint8_t(std::lround(clamp(c[k])*255)); }
            p[3] = 255;
        }
    }
    return out;
}
double meanColorDifference(const QImage &a, const QImage &b) {
    if (a.isNull() || b.isNull()) { return 0; }
    const auto [aa,bb] = pairedFrames(trimBlackBars(a),trimBlackBars(b));
    return difference(aa,bb);
}
QJsonArray applyMatchToEffects(const QJsonArray &effects, const MatchResult &result, const QString &newId) {
    auto list = effects;
    const auto round4 = [](double v) { return std::round(v*10000)/10000; };
    const auto triple = [&](const Triple &values) { return QJsonArray{round4(values[0]),round4(values[1]),round4(values[2])}; };
    bool found = false;
    for (int i = 0; i < list.size(); ++i) {
        auto e = list[i].toObject();
        if (e["type"] != "liftGammaGain") { continue; }
        e["lift"] = triple(result.lift); e["gamma"] = triple(result.gamma); e["gain"] = triple(result.gain); e["enabled"] = true;
        list[i] = e; found = true; break;
    }
    if (!found) {
        list.insert(matchIndex(list),QJsonObject{{"id",newId},{"type","liftGammaGain"},{"enabled",true},
            {"lift",triple(result.lift)},{"gamma",triple(result.gamma)},{"gain",triple(result.gain)}});
    }
    const bool scaled = std::abs(result.saturationScale-1) > .005;
    found = false;
    for (int i = 0; i < list.size(); ++i) {
        auto e = list[i].toObject();
        if (e["id"] != "inspector:color") { continue; }
        // The search ran with this effect on, so it has to be on for the result to hold.
        if (scaled) { e["saturation"] = round4(e["saturation"].toDouble(1)*result.saturationScale); }
        e["enabled"] = true;
        list[i] = e; found = true; break;
    }
    if (!found && scaled) { list.append(QJsonObject{{"id","inspector:color"},{"type","color"},{"enabled",true},{"saturation",round4(result.saturationScale)}}); }
    return list;
}
QJsonArray probeEffects(const QJsonArray &effects) {
    QJsonArray out = effects;
    const int place = matchIndex(effects);
    for (int i = 0; i < out.size(); ++i) {
        auto e = out[i].toObject();
        const auto type = e["type"].toString();
        if (type == "liftGammaGain" || type == "curves" || type == "levels" || type == "color" || type == "vignette" || type == "blur" || i > place) {
            e["enabled"] = false; out[i] = e;
        }
    }
    return out;
}
QString colorEffectAfterCorrection(const QJsonArray &effects) {
    constexpr std::array unmodelled{"lut","posterize","stylize","generator","chromaKey","glow","exposure","secondaryColor"};
    for (int i = matchIndex(effects)+1; i < effects.size(); ++i) {
        const auto e = effects[i].toObject();
        const auto type = e["type"].toString();
        if (e["enabled"].toBool() && std::ranges::any_of(unmodelled,[&](const char *name) { return type == QLatin1String(name); })) { return type; }
    }
    return {};
}
MatchResult solveMatch(const MatchInput &input) {
    MatchResult result;
    const auto cancelled = [&] {
        if (input.cancelled && input.cancelled()) { result.wasCancelled = true; result.error = "Colour matching was cancelled."; return true; }
        return false;
    };
    if (cancelled()) { return result; }
    if (input.current.isNull()) { result.error = "The current shot has no frame to match."; return result; }
    if (input.reference.isNull()) { result.error = "The reference has no frame to match."; return result; }
    const auto currentImage = input.workingFormat == nt::WorkingFormat::Rgba8
        ? input.current.convertToFormat(QImage::Format_RGBA8888) : input.current;
    const auto referenceImage = input.workingFormat == nt::WorkingFormat::Rgba8
        ? input.reference.convertToFormat(QImage::Format_RGBA8888) : input.reference;
    const auto [current,reference] = pairedFrames(trimBlackBars(currentImage),trimBlackBars(referenceImage));
    const auto referenceStats = stats(reference,input.protectSkin);
    auto plan = searchPlan(input.effects,input.trackEffects);
    Parameters x{};
    constexpr double regularisation = .02*.02;
    const auto cost = [&](const Parameters &p) {
        plan.set(p);
        const auto r = residuals(stats(graded(current,plan.passes,input.workingFormat),input.protectSkin),referenceStats);
        return std::pair{r,squareNorm(r)+regularisation*squareNorm(p)};
    };
    auto [r,c] = cost(x);
    const double before = std::sqrt(c);
    double mu = 1e-3;
    for (int iteration = 0; iteration < 24 && c > 1e-16; ++iteration) {
        if (cancelled()) { return result; }
        constexpr double h = .01;
        std::array<Parameters,10> jac{};
        for (int j = 0; j < 10; ++j) {
            if (cancelled()) { return result; }
            const double step = x[j]+h <= 1 ? h : -h;
            auto xp = x; xp[j] += step;
            const auto rp = cost(xp).first;
            for (int i = 0; i < 10; ++i) { jac[i][j] = (rp[i]-r[i])/step; }
        }
        std::array<Parameters,10> a{};
        Parameters g{};
        for (int i = 0; i < 10; ++i) {
            for (int p = 0; p < 10; ++p) {
                g[p] += jac[i][p]*r[i];
                for (int q = 0; q < 10; ++q) { a[p][q] += jac[i][p]*jac[i][q]; }
            }
        }
        for (int p = 0; p < 10; ++p) {
            g[p] = -g[p]-regularisation*x[p];
            a[p][p] += regularisation+mu*(1+a[p][p]);
        }
        const auto dx = solveLinear(a,g);
        if (!dx) { break; }
        auto xn = x;
        for (int p = 0; p < 10; ++p) { xn[p] = std::clamp(x[p]+(*dx)[p],-1.0,1.0); }
        const auto [rn,cn] = cost(xn);
        if (cn < c) {
            const double improvement = c-cn;
            x = xn; r = rn; c = cn; mu = std::max(1e-6,mu*.3);
            if (improvement < 1e-9) { break; }
        } else { mu *= 10; if (mu > 1e4) { break; } }
    }
    if (input.protectSkin) {
        const auto original = stats(current,true);
        if (original.skin[2] > .002) {
            const double h0 = std::atan2(original.skin[1],original.skin[0]);
            const auto solved = x;
            // Retain neutral exposure changes while reducing the per-channel cast.
            for (int attempt = 0; attempt < 24; ++attempt) {
                if (cancelled()) { return result; }
                plan.set(x);
                const auto sk = stats(graded(current,plan.passes,input.workingFormat),true).skin;
                const double shift = std::abs(std::remainder(std::atan2(sk[1],sk[0])-h0,2*std::numbers::pi))*180/std::numbers::pi;
                if (sk[2] > .002 && shift <= 8) { break; }
                const double scale = attempt == 23 ? 0 : std::pow(.7,attempt+1);
                for (int band = 0; band < 3; ++band) {
                    const int start = band*3;
                    const double mean = (solved[start]+solved[start+1]+solved[start+2])/3;
                    for (int k = 0; k < 3; ++k) { x[start+k] = mean+(solved[start+k]-mean)*scale; }
                }
            }
            c = cost(x).second;
        }
    }
    if (cancelled()) { return result; }
    result = values(x);
    result.ok = true; result.before = before; result.after = std::sqrt(c);
    // What the shot looks like now, not the probe with its grade switched off.
    // Trimmed first, because a vignette runs on the clip's own surface and not the bars around it.
    const auto trimmed = trimBlackBars(currentImage);
    result.differenceBefore = meanColorDifference(applyGrade(trimmed,input.effects,input.trackEffects,input.workingFormat),referenceImage);
    result.differenceAfter = meanColorDifference(applyGrade(trimmed,applyMatchToEffects(input.effects,result,"match"),input.trackEffects,input.workingFormat),referenceImage);
    return result;
}
}
