#pragma once
// SVG path data: a port of `parseSvgPath` and `pathSegmentBounds` in
// packages/timeline/src/render/svgPath.ts. The flex layout sizes a path shape
// with no authored box from these bounds.
#include <QString>

#include <optional>
#include <vector>

namespace nt::scene {

struct PathSegment {
    enum Kind { Move, Line, Cubic, Quad, Close } kind = Move;
    double x1 = 0, y1 = 0, x2 = 0, y2 = 0, x = 0, y = 0;
};

// The segments, or nullopt when the data does not parse (the web's
// `{ ok: false }`).
std::optional<std::vector<PathSegment>> parseSvgPath(const QString& d);

struct PathBounds {
    double minX = 0, minY = 0, maxX = 0, maxY = 0;
};

// The hull of every end and control point; nullopt for no segment.
std::optional<PathBounds> pathSegmentBounds(const std::vector<PathSegment>& segments);

}  // namespace nt::scene
