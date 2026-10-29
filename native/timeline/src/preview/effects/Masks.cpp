#include "preview/effects/Masks.h"
#include "preview/effects/BlurBounds.h"
#include "preview/effects/ClipEffects.h"
#include "scene/SvgPath.h"
#include <QDir>
#include <QFileInfo>
#include <QJsonArray>
#include <QJsonDocument>
#include <QPainter>
#include <QPainterPath>
#include <algorithm>
#include <cmath>

namespace nt::effects {
namespace {
double number(const QJsonObject &mask, const char *key, double fallback = 0) {
    return mask.value(key).toDouble(fallback);
}
std::optional<QPainterPath> outline(const QJsonObject &mask, QSize size) {
    const auto kind = mask.value("kind").toString();
    const double x = number(mask, "x") * size.width(), y = number(mask, "y") * size.height();
    const double w = number(mask, "width", 1) * size.width(), h = number(mask, "height", 1) * size.height();
    QPainterPath path;
    path.setFillRule(Qt::WindingFill);
    if (kind == "rect") {
        const double r = std::min({std::max(0., number(mask, "radiusPx")), w / 2, h / 2});
        if (r <= 0) {
            path.addRect(x, y, w, h);
        } else {
            // Canvas uses quadratic corners, not QPainter's cubic round rect.
            path.moveTo(x + r, y);
            path.lineTo(x + w - r, y);
            path.quadTo(x + w, y, x + w, y + r);
            path.lineTo(x + w, y + h - r);
            path.quadTo(x + w, y + h, x + w - r, y + h);
            path.lineTo(x + r, y + h);
            path.quadTo(x, y + h, x, y + h - r);
            path.lineTo(x, y + r);
            path.quadTo(x, y, x + r, y);
            path.closeSubpath();
        }
    } else if (kind == "ellipse") {
        if (w < 0 || h < 0) {
            return number(mask, "featherPx") > 0 ? std::optional<QPainterPath>{path} : std::nullopt;
        }
        path.addEllipse(QRectF(x, y, w, h));
    } else if (kind == "path") {
        const auto segments = scene::parseSvgPath(mask.value("d").toString());
        if (!segments) {
            return std::nullopt;
        }
        for (const auto &s : *segments) {
            const auto point = [&](double px, double py) { return QPointF(px * size.width(), py * size.height()); };
            switch (s.kind) {
            case scene::PathSegment::Move:
                path.moveTo(point(s.x, s.y));
                break;
            case scene::PathSegment::Line:
                path.lineTo(point(s.x, s.y));
                break;
            case scene::PathSegment::Cubic:
                path.cubicTo(point(s.x1, s.y1), point(s.x2, s.y2), point(s.x, s.y));
                break;
            case scene::PathSegment::Quad:
                path.quadTo(point(s.x1, s.y1), point(s.x, s.y));
                break;
            case scene::PathSegment::Close:
                path.closeSubpath();
                break;
            }
        }
    } else {
        return std::nullopt;
    }
    return path;
}
QImage blurCoverage(const QImage &source, double sigma) {
    if (!std::isfinite(sigma) || sigma <= 0 || source.isNull()) {
        return source;
    }
    const int extent = std::max(source.width(), source.height());
    sigma = boundedBlurRadius(sigma, extent / 3.);
    const int radius = static_cast<int>(std::min(std::ceil(3 * sigma), double(extent)));
    if (radius <= 0) {
        return source;
    }
    std::vector<double> kernel(size_t(2 * radius + 1));
    double sum = 0;
    for (int i = -radius; i <= radius; ++i) {
        const double v = std::exp(-double(i) * i / (2 * sigma * sigma));
        kernel[size_t(i + radius)] = v;
        sum += v;
    }
    for (auto &v : kernel) {
        v /= sum;
    }
    QImage current = source;
    for (int axis = 0; axis < 2; ++axis) {
        QImage out(source.size(), QImage::Format_RGBA8888);
        out.fill(Qt::transparent);
        for (int y = 0; y < out.height(); ++y) {
            for (int x = 0; x < out.width(); ++x) {
                double a = 0;
                for (int i = -radius; i <= radius; ++i) {
                    const int sx = x + (axis == 0 ? i : 0), sy = y + (axis == 1 ? i : 0);
                    if (sx >= 0 && sy >= 0 && sx < out.width() && sy < out.height()) {
                        a += current.pixelColor(sx, sy).alpha() * kernel[size_t(i + radius)];
                    }
                }
                out.setPixelColor(x, y, QColor(255, 255, 255, qRound(a)));
            }
        }
        current = std::move(out);
    }
    return current;
}
QString generatedPath(const Clip &clip) {
    const auto raw = clip.raw.value("generatedMatte").toObject();
    const auto path = raw.value("mediaPath").toString();
    if (path.isEmpty() || QFileInfo(path).isAbsolute()) {
        return path;
    }
    // TimelineJson resolved the picture against the fixture directory. Remove
    // the original relative picture path to recover that same directory.
    const auto picture = clip.raw.value("mediaPath").toString();
    if (picture.isEmpty() || QFileInfo(picture).isAbsolute() || clip.mediaPath.empty()) {
        return {};
    }
    auto base = QString::fromStdString(clip.mediaPath);
    if (!base.endsWith(picture)) {
        return {};
    }
    base.chop(picture.size());
    return QDir::cleanPath(QDir(base).filePath(path));
}
} // namespace
QString resolvedGeneratedMattePath(const Clip &clip) { return generatedPath(clip); }
QImage MaskRasterizer::rasterize(const QJsonObject &mask, QSize sourceSize) {
    if (sourceSize.isEmpty()) {
        return {};
    }
    const double scale = std::min(1., 2048. / std::max(sourceSize.width(), sourceSize.height()));
    const QSize size(std::max(1, qRound(sourceSize.width() * scale)), std::max(1, qRound(sourceSize.height() * scale)));
    const QByteArray key = QByteArray::number(sourceSize.width()) + 'x' + QByteArray::number(sourceSize.height()) + '|' + QByteArray::number(size.width()) + 'x' + QByteArray::number(size.height()) + '|' +
                           QJsonDocument(mask).toJson(QJsonDocument::Compact);
    const auto hit = std::ranges::find(m_cache, key, &decltype(m_cache)::value_type::first);
    if (hit != m_cache.end()) {
        return hit->second;
    }
    auto scaledMask = mask;
    for (const auto *key : {"featherPx", "radiusPx"}) {
        if (scaledMask.contains(key)) { scaledMask.insert(key, number(mask, key) * scale); }
    }
    const auto path = outline(scaledMask, size);
    if (!path) {
        return {};
    }
    QImage image(size, QImage::Format_RGBA8888);
    image.fill(Qt::transparent);
    const auto kind = mask.value("kind").toString();
    const double feather = boundedBlurRadius(number(scaledMask, "featherPx"), 2. * std::max(size.width(), size.height()) / 3);
    const bool filtered = feather > 0 && (kind == "path" || (kind == "rect" && number(mask, "radiusPx") > 0));
    {
        QPainter painter(&image);
        painter.setRenderHint(QPainter::Antialiasing);
        painter.setPen(Qt::NoPen);
        painter.setBrush(Qt::white);
        const double x = number(mask, "x") * size.width(), y = number(mask, "y") * size.height();
        const double w = number(mask, "width", 1) * size.width(), h = number(mask, "height", 1) * size.height();
        if (feather <= 0 || filtered) {
            painter.drawPath(*path);
        } else if (w > 0 && h > 0 && kind == "ellipse") {
            const double rx = w / 2, ry = h / 2,
                         inner = std::min(.999, std::max(0., 1 - feather / std::max(.001, std::min(rx, ry))));
            painter.translate(x + rx, y + ry);
            painter.scale(rx, ry);
            QRadialGradient gradient(0, 0, 1);
            gradient.setColorAt(0, Qt::white);
            gradient.setColorAt(inner, Qt::white);
            gradient.setColorAt(1, QColor(255, 255, 255, 0));
            painter.setBrush(gradient);
            painter.drawEllipse(QRectF(-1, -1, 2, 2));
        } else if (w > 0 && h > 0 && kind == "rect") {
            const double f = std::min({feather, w / 2, h / 2});
            painter.drawRect(QRectF(x + f, y + f, w - 2 * f, h - 2 * f));
            const auto edge = [&](QPointF from, QPointF to, QRectF region) {
                QLinearGradient g(from, to);
                g.setColorAt(0, QColor(255, 255, 255, 0));
                g.setColorAt(1, Qt::white);
                painter.fillRect(region, g);
            };
            edge({x, y}, {x + f, y}, {x, y + f, f, h - 2 * f});
            edge({x + w, y}, {x + w - f, y}, {x + w - f, y + f, f, h - 2 * f});
            edge({x, y}, {x, y + f}, {x + f, y, w - 2 * f, f});
            edge({x, y + h}, {x, y + h - f}, {x + f, y + h - f, w - 2 * f, f});
            const auto corner = [&](double cx, double cy, double sx, double sy) {
                QRadialGradient g(cx, cy, f);
                g.setColorAt(0, Qt::white);
                g.setColorAt(1, QColor(255, 255, 255, 0));
                painter.fillRect(QRectF(std::min(cx, sx), std::min(cy, sy), f, f), g);
            };
            corner(x + f, y + f, x, y);
            corner(x + w - f, y + f, x + w, y);
            corner(x + f, y + h - f, x, y + h);
            corner(x + w - f, y + h - f, x + w, y + h);
        }
    }
    if (filtered) {
        const double sigma = std::round(feather / 2 * 100) / 100;
        image = blurCoverage(image, sigma);
        // @napi-rs/canvas applies ctx.filter twice under destination-out.
        // The inverted path and rounded-rect goldens include that second blur.
        if (mask.value("invert").toBool()) {
            image = blurCoverage(image, sigma);
        }
    }
    if (mask.value("invert").toBool()) {
        // The export's @napi-rs/canvas destination-out clips a transformed
        // feathered ellipse at its translated origin (mask-invert golden).
        // Preserve that raster, rather than the browser's full complement.
        const bool clippedEllipse = kind == "ellipse" && feather > 0;
        const double left = std::floor((number(mask, "x") + number(mask, "width", 1) / 2) * size.width());
        const double top = std::floor((number(mask, "y") + number(mask, "height", 1) / 2) * size.height());
        for (int y = 0; y < size.height(); ++y) {
            auto *row = image.scanLine(y);
            for (int x = 0; x < size.width(); ++x) {
                row[4 * x + 3] = clippedEllipse && (x < left || y < top) ? 255 : 255 - row[4 * x + 3];
            }
        }
    }
    if (m_cache.size() == 32) {
        m_cache.pop_front();
    }
    m_cache.emplace_back(key, image);
    return image;
}
void decorateMasks(ActiveLayer &layer, const Clip &clip, const SceneDecorationContext *context) {
    if (layer.ext.value("generatedMatteSource").toBool()) { return; }
    if (clip.mediaType != MediaType::Group && !layer.ext.contains("shapeMask") && clip.raw.value("mask").isObject()) {
        layer.ext.insert("shapeMask", clip.raw.value("mask"));
    }
    const auto generated = clip.raw.value("generatedMatte").toObject();
    if (generated.isEmpty() || generated.value("status").toString("ready") != "ready") {
        return;
    }
    const auto path = generatedPath(clip);
    if (path.isEmpty()) {
        return;
    }
    auto source = std::make_shared<ActiveLayer>(layer);
    source->matte.reset();
    // Exporter output keeps resolved clip treatments and the animated layer mask,
    // but excludes track effects and transition reveals, despite its doc comment.
    source->ext = {};
    if (context) {
        decorateEffects(source->ext, clip, *context);
    } else {
        decorateEffects(source->ext, clip);
        if (clip.mediaType != MediaType::Group && clip.raw.value("mask").isObject()) {
            source->ext.insert("shapeMask", clip.raw.value("mask"));
        }
    }
    if (source->transition) {
        source->transition->mask.reset();
        source->transition->iris.reset();
        source->transition->solidColor.reset();
        source->transition->solidOpacity = 0;
    }
    source->kind = "j-generated-matte";
    source->opacity = 1;
    source->drawOpacity = 1;
    source->blendMode = "normal";
    source->sourceRect = {0, 0, 1, 1};
    source->ext.insert("effectSourceRect", QJsonArray{0, 0, 1, 1});
    source->ext.insert("generatedMatteSource", true);
    // The secondary frame has its own source identity but keeps the clip id so
    // S4 can find its timing and request a decoder through the source pool.
    LayerMatte info{"luma", generated.value("invert").toBool(), std::move(source), {}, {}};
    const double feather = boundedBlurRadius(number(generated, "featherPx"));
    if (feather > 0) { info.featherPx = feather; }
    // S4 applies layer opacity once after the matte. Fold strength there as the
    // web does, avoiding an extra RGBA8 quantization in the keyhole.
    layer.opacity *= std::clamp(number(generated, "strength", 1), 0., 1.);
    layer.matte = std::move(info);
}
std::vector<SecondSourceRequest> generatedMatteSources(const ActiveLayer &layer, const Clip &clip) {
    if (!layer.ext.value("generatedMatteSource").toBool()) {
        return {};
    }
    const auto path = generatedPath(clip);
    std::vector<SecondSourceRequest> requests;
    if (!path.isEmpty()) {
        requests.push_back({"j-generated-matte", path.toStdString()});
    }
    return requests;
}
} // namespace nt::effects
