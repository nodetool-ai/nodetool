#include "scene/SvgPath.h"

#include <algorithm>
#include <cmath>
#include <deque>
#include <limits>

namespace nt::scene {
namespace {

constexpr double kPi = 3.14159265358979323846;

bool isJsSpace(char16_t c) {
    switch (c) {
    case 0x09: case 0x0a: case 0x0b: case 0x0c: case 0x0d: case 0x20: case 0xa0: case 0x1680:
    case 0x2028: case 0x2029: case 0x202f: case 0x205f: case 0x3000: case 0xfeff:
        return true;
    default:
        return c >= 0x2000 && c <= 0x200a;
    }
}

int arity(char16_t command) {
    switch (command) {
    case u'm': case u'l': case u't': return 2;
    case u'h': case u'v': return 1;
    case u'c': return 6;
    case u's': case u'q': return 4;
    case u'a': return 7;
    default: return 0;  // z
    }
}

bool isCommand(char16_t c) {
    switch (c) {
    case u'M': case u'm': case u'L': case u'l': case u'H': case u'h': case u'V': case u'v': case u'C': case u'c':
    case u'S': case u's': case u'Q': case u'q': case u'T': case u't': case u'A': case u'a': case u'Z': case u'z':
        return true;
    default:
        return false;
    }
}

bool isDigit(char16_t c) { return c >= u'0' && c <= u'9'; }

// The number token at `at`: `[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?`.
// Returns its length, or 0.
qsizetype numberToken(const QString& s, qsizetype at) {
    qsizetype i = at;
    const qsizetype n = s.size();
    if (i < n && (s[i] == u'+' || s[i] == u'-')) i++;
    const qsizetype mantissa = i;
    if (i < n && isDigit(s[i].unicode())) {
        while (i < n && isDigit(s[i].unicode())) i++;
        if (i < n && s[i] == u'.') {
            i++;
            while (i < n && isDigit(s[i].unicode())) i++;
        }
    } else if (i + 1 < n && s[i] == u'.' && isDigit(s[i + 1].unicode())) {
        i++;
        while (i < n && isDigit(s[i].unicode())) i++;
    } else {
        return 0;
    }
    if (i == mantissa) return 0;
    if (i < n && (s[i] == u'e' || s[i] == u'E')) {
        qsizetype j = i + 1;
        if (j < n && (s[j] == u'+' || s[j] == u'-')) j++;
        if (j < n && isDigit(s[j].unicode())) {
            while (j < n && isDigit(s[j].unicode())) j++;
            i = j;
        }
    }
    return i - at;
}

std::vector<PathSegment> arcToCubics(double x1, double y1, double rxIn, double ryIn, double rotationDeg, bool largeArc,
                                     bool sweep, double x2, double y2) {
    if (x1 == x2 && y1 == y2) return {};
    double rx = std::abs(rxIn);
    double ry = std::abs(ryIn);
    if (rx == 0 || ry == 0) return {PathSegment{PathSegment::Line, 0, 0, 0, 0, x2, y2}};
    const double phi = (rotationDeg * kPi) / 180;
    const double cosPhi = std::cos(phi);
    const double sinPhi = std::sin(phi);
    const double dx2 = (x1 - x2) / 2;
    const double dy2 = (y1 - y2) / 2;
    const double x1p = cosPhi * dx2 + sinPhi * dy2;
    const double y1p = -sinPhi * dx2 + cosPhi * dy2;
    const double lambda = (x1p * x1p) / (rx * rx) + (y1p * y1p) / (ry * ry);
    if (lambda > 1) {
        const double s = std::sqrt(lambda);
        rx *= s;
        ry *= s;
    }
    const double rxSq = rx * rx;
    const double rySq = ry * ry;
    const double x1pSq = x1p * x1p;
    const double y1pSq = y1p * y1p;
    const double sign = largeArc != sweep ? 1 : -1;
    const double num = rxSq * rySq - rxSq * y1pSq - rySq * x1pSq;
    const double den = rxSq * y1pSq + rySq * x1pSq;
    const double co = sign * std::sqrt(std::max(0.0, num / den));
    const double cxp = (co * (rx * y1p)) / ry;
    const double cyp = (co * -(ry * x1p)) / rx;
    const double cx = cosPhi * cxp - sinPhi * cyp + (x1 + x2) / 2;
    const double cy = sinPhi * cxp + cosPhi * cyp + (y1 + y2) / 2;
    const auto angleBetween = [](double ux, double uy, double vx, double vy) {
        const double dot = ux * vx + uy * vy;
        const double len = std::sqrt(ux * ux + uy * uy) * std::sqrt(vx * vx + vy * vy);
        double angle = std::acos(std::min(1.0, std::max(-1.0, dot / len)));
        if (ux * vy - uy * vx < 0) angle = -angle;
        return angle;
    };
    const double ux = (x1p - cxp) / rx;
    const double uy = (y1p - cyp) / ry;
    const double vx = (-x1p - cxp) / rx;
    const double vy = (-y1p - cyp) / ry;
    const double theta1 = angleBetween(1, 0, ux, uy);
    double deltaTheta = angleBetween(ux, uy, vx, vy);
    if (!sweep && deltaTheta > 0) deltaTheta -= 2 * kPi;
    if (sweep && deltaTheta < 0) deltaTheta += 2 * kPi;
    const int segmentCount = std::max(1, static_cast<int>(std::ceil(std::abs(deltaTheta) / (kPi / 2))));
    const double segmentDelta = deltaTheta / segmentCount;
    const double alpha = (4.0 / 3.0) * std::tan(segmentDelta / 4);
    const auto pointOn = [&](double theta, double& px, double& py) {
        const double ex = rx * std::cos(theta);
        const double ey = ry * std::sin(theta);
        px = cx + cosPhi * ex - sinPhi * ey;
        py = cy + sinPhi * ex + cosPhi * ey;
    };
    const auto derivativeOn = [&](double theta, double& dx, double& dy) {
        const double ex = -rx * std::sin(theta);
        const double ey = ry * std::cos(theta);
        dx = cosPhi * ex - sinPhi * ey;
        dy = sinPhi * ex + cosPhi * ey;
    };
    std::vector<PathSegment> out;
    double theta = theta1;
    for (int i = 0; i < segmentCount; i++) {
        const double next = theta + segmentDelta;
        double p0x, p0y, p3x, p3y, d0x, d0y, d3x, d3y;
        pointOn(theta, p0x, p0y);
        pointOn(next, p3x, p3y);
        derivativeOn(theta, d0x, d0y);
        derivativeOn(next, d3x, d3y);
        out.push_back(PathSegment{PathSegment::Cubic, p0x + alpha * d0x, p0y + alpha * d0y, p3x - alpha * d3x,
                                  p3y - alpha * d3y, p3x, p3y});
        theta = next;
    }
    if (!out.empty()) {
        out.back().x = x2;
        out.back().y = y2;
    }
    return out;
}

}  // namespace

std::optional<std::vector<PathSegment>> parseSvgPath(const QString& d) {
    qsizetype b = 0;
    qsizetype e = d.size();
    while (b < e && isJsSpace(d[b].unicode())) b++;
    while (e > b && isJsSpace(d[e - 1].unicode())) e--;
    const QString source = d.mid(b, e - b);
    if (source.isEmpty()) return std::nullopt;

    std::vector<PathSegment> segments;
    double cx = 0, cy = 0, startX = 0, startY = 0;
    bool started = false;
    char16_t prevCommand = 0;
    std::optional<std::pair<double, double>> lastCubic, lastQuad;
    char16_t command = 0;  // 0: none
    bool relative = false;
    std::deque<double> pending;

    // Consume `pending` while it holds a full repetition of `command`; false
    // on an error.
    const auto flush = [&](bool final) -> bool {
        if (command == 0) return pending.empty();
        const int n = arity(command);
        if (n == 0) {
            if (!started) return false;
            segments.push_back(PathSegment{PathSegment::Close});
            cx = startX;
            cy = startY;
            prevCommand = u'z';
            command = 0;
            return true;
        }
        while (static_cast<int>(pending.size()) >= n) {
            double v[7] = {};
            for (int i = 0; i < n; i++) {
                v[i] = pending.front();
                pending.pop_front();
            }
            const double px = relative ? cx : 0;
            const double py = relative ? cy : 0;
            if (command == u'm') {
                const double x = px + v[0];
                const double y = py + v[1];
                segments.push_back(PathSegment{PathSegment::Move, 0, 0, 0, 0, x, y});
                startX = cx = x;
                startY = cy = y;
                started = true;
                prevCommand = u'm';
                command = u'l';
                continue;
            }
            if (!started) return false;
            switch (command) {
            case u'l':
                cx = px + v[0];
                cy = py + v[1];
                segments.push_back(PathSegment{PathSegment::Line, 0, 0, 0, 0, cx, cy});
                prevCommand = u'l';
                break;
            case u'h':
                cx = relative ? cx + v[0] : v[0];
                segments.push_back(PathSegment{PathSegment::Line, 0, 0, 0, 0, cx, cy});
                prevCommand = u'h';
                break;
            case u'v':
                cy = relative ? cy + v[0] : v[0];
                segments.push_back(PathSegment{PathSegment::Line, 0, 0, 0, 0, cx, cy});
                prevCommand = u'v';
                break;
            case u'c': {
                const double x1 = px + v[0], y1 = py + v[1], x2 = px + v[2], y2 = py + v[3];
                cx = px + v[4];
                cy = py + v[5];
                segments.push_back(PathSegment{PathSegment::Cubic, x1, y1, x2, y2, cx, cy});
                prevCommand = u'c';
                lastCubic = std::pair{x2, y2};
                break;
            }
            case u's': {
                double sx = cx, sy = cy;
                if ((prevCommand == u'c' || prevCommand == u's') && lastCubic) {
                    sx = 2 * cx - lastCubic->first;
                    sy = 2 * cy - lastCubic->second;
                }
                const double x2 = px + v[0], y2 = py + v[1];
                cx = px + v[2];
                cy = py + v[3];
                segments.push_back(PathSegment{PathSegment::Cubic, sx, sy, x2, y2, cx, cy});
                prevCommand = u's';
                lastCubic = std::pair{x2, y2};
                break;
            }
            case u'q': {
                const double x1 = px + v[0], y1 = py + v[1];
                cx = px + v[2];
                cy = py + v[3];
                segments.push_back(PathSegment{PathSegment::Quad, x1, y1, 0, 0, cx, cy});
                prevCommand = u'q';
                lastQuad = std::pair{x1, y1};
                break;
            }
            case u't': {
                std::pair<double, double> control{cx, cy};
                if ((prevCommand == u'q' || prevCommand == u't') && lastQuad) {
                    control = {2 * cx - lastQuad->first, 2 * cy - lastQuad->second};
                }
                cx = px + v[0];
                cy = py + v[1];
                segments.push_back(PathSegment{PathSegment::Quad, control.first, control.second, 0, 0, cx, cy});
                prevCommand = u't';
                lastQuad = control;
                break;
            }
            case u'a': {
                if ((v[3] != 0 && v[3] != 1) || (v[4] != 0 && v[4] != 1)) return false;
                const double endX = px + v[5];
                const double endY = py + v[6];
                for (const PathSegment& s : arcToCubics(cx, cy, v[0], v[1], v[2], v[3] == 1, v[4] == 1, endX, endY)) {
                    segments.push_back(s);
                }
                cx = endX;
                cy = endY;
                prevCommand = u'a';
                break;
            }
            default:
                break;
            }
        }
        return !(final && !pending.empty());
    };

    qsizetype at = 0;
    while (at < source.size()) {
        const char16_t c = source[at].unicode();
        if (c == u',' || isJsSpace(c)) {
            at++;
            continue;
        }
        if (isCommand(c)) {
            at++;
            if (!flush(true)) return std::nullopt;
            pending.clear();
            command = static_cast<char16_t>(c >= u'a' ? c : c + 32);
            relative = c >= u'a';
            if (command == u'z' && !flush(true)) return std::nullopt;
            continue;
        }
        const qsizetype len = numberToken(source, at);
        if (len == 0) return std::nullopt;
        if (command == 0) return std::nullopt;
        pending.push_back(source.mid(at, len).toDouble());  // C locale, unlike strtod
        at += len;
        if (!flush(false)) return std::nullopt;
    }
    if (!flush(true)) return std::nullopt;
    if (segments.empty()) return std::nullopt;
    return segments;
}

std::optional<PathBounds> pathSegmentBounds(const std::vector<PathSegment>& segments) {
    if (segments.empty()) return std::nullopt;
    constexpr double inf = std::numeric_limits<double>::infinity();
    PathBounds b{inf, inf, -inf, -inf};
    const auto consider = [&](double x, double y) {
        if (x < b.minX) b.minX = x;
        if (y < b.minY) b.minY = y;
        if (x > b.maxX) b.maxX = x;
        if (y > b.maxY) b.maxY = y;
    };
    for (const PathSegment& s : segments) {
        switch (s.kind) {
        case PathSegment::Move:
        case PathSegment::Line: consider(s.x, s.y); break;
        case PathSegment::Cubic:
            consider(s.x1, s.y1);
            consider(s.x2, s.y2);
            consider(s.x, s.y);
            break;
        case PathSegment::Quad:
            consider(s.x1, s.y1);
            consider(s.x, s.y);
            break;
        case PathSegment::Close: break;
        }
    }
    if (!std::isfinite(b.minX) || !std::isfinite(b.minY)) return std::nullopt;
    return b;
}

}  // namespace nt::scene
