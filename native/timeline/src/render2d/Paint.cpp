#include "render2d/Paint.h"
#include "scene/SvgPath.h"
#include <QImage>
#include <QJsonArray>
#include <QLinearGradient>
#include <QPainter>
#include <QRadialGradient>
#include <QRegularExpression>
#include <QTransform>
#include <algorithm>
#include <array>
#include <cmath>
#include <numbers>
#include <optional>
#include <span>
#include <vector>

namespace nt::render2d {
namespace {
double number(const QJsonObject& o, const char* key, double fallback) {
    return o.value(QLatin1String(key)).toDouble(fallback);
}
QRectF shapeBox(const QJsonObject& o, QSize size) {
    return {number(o, "x", 0.25) * size.width(), number(o, "y", 0.25) * size.height(),
            number(o, "width", 0.5) * size.width(), number(o, "height", 0.5) * size.height()};
}
QPainterPath polygon(const std::vector<QPointF>& points, double radius) {
    QPainterPath path;
    for (std::size_t i = 0; i < points.size(); ++i) {
        const auto v = points[i], prev = points[(i + points.size() - 1) % points.size()],
                   next = points[(i + 1) % points.size()];
        const double in = QLineF(prev, v).length(), out = QLineF(v, next).length();
        const auto u = in > 0 ? (prev - v) / in : QPointF{}, w = out > 0 ? (next - v) / out : QPointF{};
        const double cosine = std::clamp(QPointF::dotProduct(u, w), -1.0, 1.0);
        const double sine = std::abs(u.x() * w.y() - u.y() * w.x());
        const double interior = std::acos(cosine);
        const double tangent = std::min({radius / std::tan(interior / 2), in / 2, out / 2});
        if (radius <= 0 || in <= 1e-6 || out <= 1e-6 || sine <= 1e-6 || !std::isfinite(tangent)) {
            if (i == 0) {
                path.moveTo(v);
            } else {
                path.lineTo(v);
            }
            continue;
        }
        const double handle = 4.0 / 3 * std::tan((std::numbers::pi - interior) / 4) * tangent * std::tan(interior / 2);
        const auto enter = v + u * tangent, exit = v + w * tangent;
        if (i == 0) {
            path.moveTo(enter);
        } else {
            path.lineTo(enter);
        }
        path.cubicTo(enter - u * handle, exit - w * handle, exit);
    }
    path.closeSubpath();
    path.setFillRule(Qt::WindingFill);
    return path;
}
using Polyline = std::vector<QPointF>;
std::vector<Polyline> flatten(const QPainterPath& path) {
    std::vector<Polyline> paths;
    QPointF at;
    for (int i = 0; i < path.elementCount(); ++i) {
        const auto element = path.elementAt(i);
        const QPointF p(element.x, element.y);
        if (element.isMoveTo()) {
            paths.push_back({p});
            at = p;
        } else if (element.isLineTo()) {
            paths.back().push_back(p);
            at = p;
        } else if (element.type == QPainterPath::CurveToElement) {
            const auto c2 = path.elementAt(++i), end = path.elementAt(++i);
            const QPointF q(c2.x, c2.y), b(end.x, end.y), a = at;
            const int steps =
                std::clamp(static_cast<int>(
                               std::ceil((QLineF(a, p).length() + QLineF(p, q).length() + QLineF(q, b).length()) / 3)),
                           8, 96);
            for (int j = 1; j <= steps; ++j) {
                const double t = static_cast<double>(j) / steps, s = 1 - t;
                paths.back().push_back(a * (s * s * s) + p * (3 * s * s * t) + q * (3 * s * t * t) + b * (t * t * t));
            }
            at = b;
        }
    }
    return paths;
}
QPainterPath trim(const QPainterPath& path, double start, double end) {
    const auto paths = flatten(path);
    double length = 0;
    for (const auto& points : paths) {
        for (std::size_t i = 1; i < points.size(); ++i) {
            length += QLineF(points[i - 1], points[i]).length();
        }
    }
    const double from = std::clamp(start, 0.0, 1.0) * length, to = std::clamp(end, 0.0, 1.0) * length;
    QPainterPath out;
    if (to - from <= 1e-6) {
        return out;
    }
    double walked = 0;
    for (const auto& points : paths) {
        bool run = false;
        for (std::size_t i = 1; i < points.size(); ++i) {
            const auto a = points[i - 1], b = points[i];
            const double segment = QLineF(a, b).length(), beginning = walked;
            walked += segment;
            if (segment <= 0 || walked <= from || beginning >= to) {
                continue;
            }
            const double t0 = std::max(0.0, (from - beginning) / segment),
                         t1 = std::min(1.0, (to - beginning) / segment);
            if (!run) {
                out.moveTo(a + (b - a) * t0);
                run = true;
            }
            out.lineTo(a + (b - a) * t1);
        }
    }
    return out;
}
} // namespace
QPainterPath flattenedPath(const QPainterPath& path) {
    QPainterPath result;
    for (const auto& run : flatten(path)) {
        if (run.empty()) {
            continue;
        }
        result.moveTo(run.front());
        for (std::size_t i = 1; i < run.size(); ++i) {
            result.lineTo(run[i]);
        }
    }
    return result;
}
namespace {
std::optional<double> cssNumber(QString text) {
    text = text.trimmed();
    if (text.isEmpty()) {
        return 0;
    }
    // Number() in the shared parser also accepts unsigned base-prefixed integers.
    static const QRegularExpression baseNumber(QStringLiteral("^0([xob])([0-9a-f]+)$"));
    const auto baseMatch = baseNumber.match(text);
    if (baseMatch.hasMatch()) {
        const auto prefix = baseMatch.captured(1);
        const int base = prefix == "x" ? 16 : prefix == "o" ? 8 : 2;
        double value = 0;
        for (const auto digit : baseMatch.captured(2)) {
            const int n = digit <= u'9' ? digit.unicode() - u'0' : digit.unicode() - u'a' + 10;
            if (n >= base) {
                return std::nullopt;
            }
            value = value * base + n;
        }
        return std::isfinite(value) ? std::optional(value) : std::nullopt;
    }
    bool ok = false;
    const double value = text.toDouble(&ok);
    return ok && std::isfinite(value) ? std::optional(value) : std::nullopt;
}
std::optional<double> cssComponent(QString text, double full) {
    text = text.trimmed();
    if (text.isEmpty()) {
        return std::nullopt;
    }
    const bool percent = text.endsWith(u'%');
    const auto value = cssNumber(percent ? text.chopped(1) : text);
    return value ? std::optional(std::clamp(*value / (percent ? 100 : full), 0.0, 1.0)) : std::nullopt;
}
std::optional<double> cssHue(const QString& text) {
    static const QRegularExpression angle(
        QStringLiteral(R"(^([+-]?(?:\d*\.)?\d+(?:e[+-]?\d+)?)(deg|grad|rad|turn)?$)"));
    const auto match = angle.match(text.trimmed());
    if (!match.hasMatch()) {
        return std::nullopt;
    }
    const auto value = cssNumber(match.captured(1));
    if (!value) {
        return std::nullopt;
    }
    const auto unit = match.captured(2);
    const double degrees = *value * (unit == "grad"   ? 0.9
                                     : unit == "rad"  ? 180 / std::numbers::pi
                                     : unit == "turn" ? 360
                                                      : 1);
    if (!std::isfinite(degrees)) {
        return std::nullopt;
    }
    return std::fmod(std::fmod(degrees, 360) + 360, 360);
}
} // namespace
QColor cssColor(const QString& value) {
    const auto text = value.trimmed().toLower();
    if (text == "transparent") {
        return QColor(Qt::transparent);
    }
    if (text == "rebeccapurple") {
        return QColor(102, 51, 153);
    }
    if (text.startsWith(u'#')) {
        static const QRegularExpression hex(QStringLiteral("^#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$"));
        if (!hex.match(text).hasMatch()) {
            return QColor(Qt::transparent);
        }
        // CSS #RRGGBBAA differs from QColor's #AARRGGBB.
        if (text.size() == 9) {
            return QColor("#" + text.mid(7, 2) + text.mid(1, 6));
        }
        if (text.size() == 5) {
            return QColor("#" + QString(2, text[4]) + QString(2, text[1]) + QString(2, text[2]) + QString(2, text[3]));
        }
        return QColor(text);
    }
    static const QRegularExpression function(QStringLiteral(R"(^(rgb|hsl)a?\(([^()]*)\)$)"));
    const auto match = function.match(text);
    if (match.hasMatch()) {
        const auto sections = match.captured(2).trimmed().split(u'/');
        if (sections.size() > 2) {
            return QColor(Qt::transparent);
        }
        static const QRegularExpression separator(QStringLiteral(R"([\s,]+)"));
        auto parts = sections[0].trimmed().split(separator, Qt::SkipEmptyParts);
        if (sections.size() == 2) {
            parts.append(sections[1].trimmed());
        }
        if (parts.size() != 3 && parts.size() != 4) {
            return QColor(Qt::transparent);
        }
        const bool rgb = match.captured(1) == "rgb";
        const auto a = parts.size() == 4 ? cssComponent(parts[3], 1) : std::optional(1.0);
        const auto first = rgb ? cssComponent(parts[0], 255) : cssHue(parts[0]);
        const auto second = cssComponent(parts[1], rgb ? 255 : 1);
        const auto third = cssComponent(parts[2], rgb ? 255 : 1);
        if (!a || !first || !second || !third) {
            return QColor(Qt::transparent);
        }
        if (rgb) {
            return QColor::fromRgbF(*first, *second, *third, *a);
        }
        const double c = (1 - std::abs(2 * *third - 1)) * *second;
        const double x = c * (1 - std::abs(std::fmod(*first / 60, 2) - 1));
        const double m = *third - c / 2;
        const std::array<std::array<double, 3>, 6> sectors{
            {{c, x, 0}, {x, c, 0}, {0, c, x}, {0, x, c}, {x, 0, c}, {c, 0, x}}};
        const auto& channels = sectors[static_cast<int>(*first / 60) % 6];
        return QColor::fromRgbF(channels[0] + m, channels[1] + m, channels[2] + m, *a);
    }
    static const auto names = QColor::colorNames();
    return names.contains(text) ? QColor(text) : QColor(Qt::transparent);
}
QBrush fillBrush(const QJsonValue& value, const QRectF& box) {
    if (value.isString()) {
        return cssColor(value.toString());
    }
    const auto fill = value.toObject();
    const auto type = fill.value(u"type").toString();
    if (type == "solid") {
        return cssColor(fill.value(u"color").toString());
    }
    QGradientStops stops;
    for (const auto& item : fill.value(u"stops").toArray()) {
        const auto stop = item.toObject();
        stops.append(
            {std::clamp(stop.value(u"offset").toDouble(), 0.0, 1.0), cssColor(stop.value(u"color").toString())});
    }
    if (type == "linear") {
        const double angle = number(fill, "angle", 0) * std::numbers::pi / 180;
        const double half = (std::abs(std::cos(angle)) * box.width() + std::abs(std::sin(angle)) * box.height()) / 2;
        const QPointF d(std::cos(angle) * half, std::sin(angle) * half);
        QLinearGradient gradient(box.center() - d, box.center() + d);
        gradient.setStops(stops);
        // Canvas interpolates stop components before premultiplying alpha.
        gradient.setInterpolationMode(QGradient::ComponentInterpolation);
        return gradient;
    }
    if (type == "radial") {
        QRadialGradient gradient(box.center(), std::hypot(box.width(), box.height()) / 2);
        gradient.setStops(stops);
        gradient.setInterpolationMode(QGradient::ComponentInterpolation);
        return gradient;
    }
    return Qt::NoBrush;
}
QPainterPath svgPath(const QString& data, QSize size) {
    QPainterPath path;
    const auto segments = scene::parseSvgPath(data);
    if (!segments) {
        return path;
    }
    for (const auto& s : *segments) {
        const QPointF end(s.x * size.width(), s.y * size.height());
        switch (s.kind) {
        case scene::PathSegment::Move:
            path.moveTo(end);
            break;
        case scene::PathSegment::Line:
            path.lineTo(end);
            break;
        case scene::PathSegment::Cubic:
            path.cubicTo({s.x1 * size.width(), s.y1 * size.height()}, {s.x2 * size.width(), s.y2 * size.height()}, end);
            break;
        case scene::PathSegment::Quad:
            path.quadTo({s.x1 * size.width(), s.y1 * size.height()}, end);
            break;
        case scene::PathSegment::Close:
            path.closeSubpath();
            break;
        }
    }
    path.setFillRule(Qt::WindingFill);
    return path;
}
QPainterPath shapePath(const QJsonObject& style, QSize size) {
    const auto kind = style.value(u"kind").toString();
    const auto box = shapeBox(style, size);
    QPainterPath path;
    path.setFillRule(Qt::WindingFill);
    if (kind == "path") {
        return svgPath(style.value(u"d").toString(), size);
    }
    if (kind == "ellipse") {
        path.addEllipse(box);
        return path;
    }
    if (kind == "line") {
        path.moveTo(box.topLeft());
        path.lineTo(number(style, "x2", 0.75) * size.width(), number(style, "y2", 0.75) * size.height());
        return path;
    }
    const double radius = std::max(0.0, number(style, "cornerRadius", 0)) * size.width();
    if (kind == "rect") {
        return polygon({box.topLeft(), box.topRight(), box.bottomRight(), box.bottomLeft()}, radius);
    }
    if (kind == "polygon" || kind == "star") {
        const int sides = std::max(3, static_cast<int>(std::round(number(style, "sides", 5))));
        const int count = kind == "star" ? sides * 2 : sides;
        std::vector<QPointF> points;
        points.reserve(count);
        for (int i = 0; i < count; ++i) {
            const double angle = -std::numbers::pi / 2 + i * 2 * std::numbers::pi / count;
            const double scale = kind == "star" && i % 2 ? std::max(0.0, number(style, "innerRadius", 0.5)) : 1;
            points.push_back(box.center() + QPointF(std::cos(angle) * box.width() / 2 * scale,
                                                    std::sin(angle) * box.height() / 2 * scale));
        }
        return polygon(points, radius);
    }
    return path;
}
void paintShape(QPainter& painter, const QJsonObject& style, QSize size) {
    const auto path = shapePath(style, size);
    if (style.contains(u"fill") || style.contains(u"fillStyle")) {
        painter.fillPath(path,
                         fillBrush(style.contains(u"fillStyle") ? style.value(u"fillStyle") : style.value(u"fill"),
                                   shapeBox(style, size)));
    }
    const double width = number(style, "strokeWidthPx", 0);
    if (!style.contains(u"stroke") || width <= 0) {
        return;
    }
    QPen pen(cssColor(style.value(u"stroke").toString()), width);
    const auto cap = style.value(u"lineCap").toString(), join = style.value(u"lineJoin").toString();
    pen.setCapStyle(cap == "round" ? Qt::RoundCap : cap == "square" ? Qt::SquareCap : Qt::FlatCap);
    pen.setJoinStyle(join == "round" ? Qt::RoundJoin : join == "bevel" ? Qt::BevelJoin : Qt::MiterJoin);
    pen.setMiterLimit(5); // Canvas's limit is measured in full stroke widths.
    QList<qreal> dash;
    bool anyPositive = false;
    for (const auto& item : style.value(u"dash").toArray()) {
        if (!item.isDouble() || item.toDouble() < 0) {
            continue;
        }
        const double length = item.toDouble() * size.width() / width;
        dash.append(length);
        anyPositive = anyPositive || length > 0;
    }
    if (anyPositive) {
        if (dash.size() % 2) {
            dash.append(dash);
        }
        pen.setDashPattern(dash);
    }
    const double start = number(style, "trimStart", 0), end = number(style, "trimEnd", 1);
    painter.strokePath(start <= 0 && end >= 1 ? path : trim(path, start, end), pen);
}
QImage blurred(const QImage& image, double sigma) {
    if (sigma <= 0) {
        return image;
    }
    const int radius = static_cast<int>(std::ceil(sigma * 3));
    std::vector<double> kernel(2 * radius + 1);
    double sum = 0;
    for (int i = -radius; i <= radius; ++i) {
        const double v = std::exp(-i * i / (2 * sigma * sigma));
        kernel[i + radius] = v;
        sum += v;
    }
    for (auto& v : kernel) {
        v /= sum;
    }
    QImage input = image.convertToFormat(QImage::Format_RGBA8888_Premultiplied), scratch(input.size(), input.format()),
           output(input.size(), input.format());
    for (int pass = 0; pass < 2; ++pass) {
        const auto& src = pass == 0 ? input : scratch;
        auto& dst = pass == 0 ? scratch : output;
        for (int y = 0; y < src.height(); ++y) {
            const std::span row(dst.scanLine(y), static_cast<std::size_t>(dst.bytesPerLine()));
            for (int x = 0; x < src.width(); ++x) {
                std::array<double, 4> channels{};
                for (int i = -radius; i <= radius; ++i) {
                    const int xx = pass == 0 ? x + i : x, yy = pass == 0 ? y : y + i;
                    if (xx < 0 || xx >= src.width() || yy < 0 || yy >= src.height()) {
                        continue;
                    }
                    const std::span source(src.constScanLine(yy), static_cast<std::size_t>(src.bytesPerLine()));
                    const auto pixel = source.subspan(static_cast<std::size_t>(xx) * 4, 4);
                    for (int c = 0; c < 4; ++c) {
                        channels[c] += pixel[c] * kernel[i + radius];
                    }
                }
                for (int c = 0; c < 4; ++c) {
                    row[x * 4 + c] = static_cast<uchar>(std::round(channels[c]));
                }
            }
        }
    }
    return output;
}
} // namespace nt::render2d
