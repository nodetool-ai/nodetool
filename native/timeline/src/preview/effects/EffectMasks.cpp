#include "preview/effects/EffectMasks.h"
#include <QJsonObject>
#include <algorithm>
#include <cmath>
#include <limits>

namespace nt::effects {
namespace {
constexpr int kSubdivisions = 16;

std::vector<double> flatten(const QJsonArray &vertices, double width, double height) {
    std::vector<double> points;
    const auto n = vertices.size();
    for (qsizetype i = 0; i < n; ++i) {
        const auto a = vertices[i].toObject(), b = vertices[(i + 1) % n].toObject();
        const double ax = a.value("x").toDouble(), ay = a.value("y").toDouble();
        const double bx = b.value("x").toDouble(), by = b.value("y").toDouble();
        const double aox = a.value("outX").toDouble(), aoy = a.value("outY").toDouble();
        const double bix = b.value("inX").toDouble(), biy = b.value("inY").toDouble();
        const double p0x = ax * width, p0y = ay * height, p3x = bx * width, p3y = by * height;
        points.push_back(p0x);
        points.push_back(p0y);
        if (aox == 0 && aoy == 0 && bix == 0 && biy == 0) { continue; }
        const double p1x = (ax + aox) * width, p1y = (ay + aoy) * height;
        const double p2x = (bx + bix) * width, p2y = (by + biy) * height;
        for (int s = 1; s < kSubdivisions; ++s) {
            const double t = double(s) / kSubdivisions, u = 1 - t;
            const double w0 = u * u * u, w1 = 3 * u * u * t, w2 = 3 * u * t * t, w3 = t * t * t;
            points.push_back(w0 * p0x + w1 * p1x + w2 * p2x + w3 * p3x);
            points.push_back(w0 * p0y + w1 * p1y + w2 * p2y + w3 * p3y);
        }
    }
    return points;
}

double signedDistance(const std::vector<double> &points, double px, double py) {
    const size_t n = points.size() / 2;
    double best = std::numeric_limits<double>::infinity();
    bool inside = false;
    for (size_t i = 0, j = n - 1; i < n; j = i++) {
        const double ax = points[j * 2], ay = points[j * 2 + 1], bx = points[i * 2], by = points[i * 2 + 1];
        const double ex = bx - ax, ey = by - ay, len = ex * ex + ey * ey;
        const double t = len > 0 ? std::max(0.0, std::min(1.0, ((px - ax) * ex + (py - ay) * ey) / len)) : 0;
        const double dx = px - (ax + ex * t), dy = py - (ay + ey * t);
        best = std::min(best, dx * dx + dy * dy);
        if ((ay > py) != (by > py) && px < ax + ((py - ay) / (by - ay)) * ex) { inside = !inside; }
    }
    const double distance = std::sqrt(best);
    return inside ? -distance : distance;
}
} // namespace

QJsonArray activeEffectMasks(const QJsonArray &masks) {
    QJsonArray result;
    for (const auto &value : masks) {
        const auto mask = value.toObject();
        if (mask.value("enabled").toBool(true) && mask.value("vertices").toArray().size() >= 2) { result.append(mask); }
    }
    return result;
}

std::vector<float> effectMaskCoverage(const QJsonArray &masks, int sourceWidth, int sourceHeight, int outWidth,
                                      int outHeight, int originX, int originY) {
    const auto active = activeEffectMasks(masks);
    if (active.isEmpty() || outWidth <= 0 || outHeight <= 0) { return {}; }
    const auto firstMode = active.first().toObject().value("mode").toString();
    std::vector<float> result(size_t(outWidth) * outHeight, firstMode == "subtract" || firstMode == "intersect" ? 1.f : 0.f);
    const double shorter = std::min(sourceWidth, sourceHeight);
    for (const auto &value : active) {
        const auto mask = value.toObject();
        const double feather = std::max(0.0, mask.value("feather").toDouble()) * shorter;
        const double expansion = mask.value("expansion").toDouble() * shorter;
        const double opacity = std::clamp(mask.value("opacity").toDouble(1), 0.0, 1.0);
        const bool inverted = mask.value("inverted").toBool();
        const auto mode = mask.value("mode").toString();
        const auto points = flatten(mask.value("vertices").toArray(), sourceWidth, sourceHeight);
        double x0 = std::numeric_limits<double>::infinity(), y0 = x0, x1 = -x0, y1 = -x0;
        for (size_t k = 0; k < points.size(); k += 2) {
            x0 = std::min(x0, points[k]); x1 = std::max(x1, points[k]);
            y0 = std::min(y0, points[k + 1]); y1 = std::max(y1, points[k + 1]);
        }
        const double margin = std::max(0.0, expansion + feather / 2) + 1;
        const double outside = inverted ? opacity : 0;
        for (int j = 0; j < outHeight; ++j) {
            const double py = originY + j + 0.5;
            for (int i = 0; i < outWidth; ++i) {
                const double px = originX + i + 0.5;
                double coverage = outside;
                if (!(px < x0 - margin || px > x1 + margin || py < y0 - margin || py > y1 + margin)) {
                    const double d = signedDistance(points, px, py) - expansion;
                    double c = feather <= 0 ? (d <= 0 ? 1 : 0) : std::clamp(0.5 - d / feather, 0.0, 1.0);
                    if (inverted) { c = 1 - c; }
                    coverage = c * opacity;
                }
                // The TS port stores each mask in a Float32Array before combining.
                const float single = float(coverage);
                float &acc = result[size_t(j) * outWidth + i];
                acc = mode == "subtract" ? acc * (1 - single) : mode == "intersect" ? std::min(acc, single) : std::max(acc, single);
            }
        }
    }
    return result;
}

QImage effectMaskImage(const std::vector<float> &coverage, int width, int height) {
    QImage image(width, height, QImage::Format_RGBA8888_Premultiplied);
    for (int y = 0; y < height; ++y) {
        auto *row = image.scanLine(y);
        for (int x = 0; x < width; ++x) {
            const auto v = uchar(std::lround(std::clamp(coverage[size_t(y) * width + x], 0.f, 1.f) * 255));
            std::fill(row + x * 4, row + x * 4 + 4, v);
        }
    }
    return image;
}
} // namespace nt::effects
