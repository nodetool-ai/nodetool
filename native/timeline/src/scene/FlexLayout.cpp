#include "scene/FlexLayout.h"

#include "preview/SceneEval.h"
#include "scene/ClipScene.h"
#include "scene/SvgPath.h"

#include <QJsonValue>

#include <yoga/Yoga.h>

#include <algorithm>
#include <atomic>
#include <cmath>
#include <limits>
#include <memory>
#include <optional>
#include <unordered_set>

namespace nt::scene {
namespace {

using ChildIndex = std::unordered_map<std::string, std::vector<const Clip*>>;

const std::string& parentOf(const Clip& clip) {
    static const std::string none;
    return clip.scene ? clip.scene->parentId : none;
}

bool isFlexContainer(const Clip& clip) {
    return clip.mediaType == MediaType::Group &&
           clip.raw.value(u"layout").toObject().value(u"display").toString() == u"flex";
}

std::optional<double> number(const QJsonObject& o, const char* key) {
    const QJsonValue v = o.value(QLatin1String(key));
    if (!v.isDouble()) return std::nullopt;
    return v.toDouble();
}

// ── projected boxes ───────────────────────────────────────────────────────

LayoutBox projectedBox(const LayoutBox& box, const ClipTransform& transform, double W, double H, Vec2 base = {1, 1}) {
    const Mat4 m = buildTransformMatrix(transform, base, W, H);
    const double corners[4][2] = {
        {box.x, box.y}, {box.x + box.width, box.y}, {box.x, box.y + box.height}, {box.x + box.width, box.y + box.height}};
    double left = std::numeric_limits<double>::infinity();
    double top = left;
    double right = -left;
    double bottom = -left;
    for (const auto& c : corners) {
        const double nx = 2 * c[0] / W - 1;
        const double ny = 1 - 2 * c[1] / H;
        const double w = static_cast<double>(m[3]) * nx + static_cast<double>(m[7]) * ny + static_cast<double>(m[15]);
        const double px = (static_cast<double>(m[0]) * nx + static_cast<double>(m[4]) * ny + static_cast<double>(m[12])) / w;
        const double py = (static_cast<double>(m[1]) * nx + static_cast<double>(m[5]) * ny + static_cast<double>(m[13])) / w;
        const double x = (px + 1) * W / 2;
        const double y = (1 - py) * H / 2;
        left = std::min(left, x);
        top = std::min(top, y);
        right = std::max(right, x);
        bottom = std::max(bottom, y);
    }
    return LayoutBox{left - W / 2, top - H / 2, right - left, bottom - top};
}

// `shapeAuthoredBox`: a path with no authored size measures its `d`.
LayoutBox shapeAuthoredBox(const QJsonObject& shape, double W, double H, const LayoutBox& fallback) {
    if (shape.value(u"kind").toString() == u"path" && !shape.contains(u"width") && !shape.contains(u"height")) {
        if (const auto segments = parseSvgPath(shape.value(u"d").toString())) {
            if (const auto b = pathSegmentBounds(*segments)) {
                return LayoutBox{b->minX * W, b->minY * H, (b->maxX - b->minX) * W, (b->maxY - b->minY) * H};
            }
        }
    }
    return LayoutBox{number(shape, "x").value_or(fallback.x) * W, number(shape, "y").value_or(fallback.y) * H,
                     number(shape, "width").value_or(fallback.width) * W,
                     number(shape, "height").value_or(fallback.height) * H};
}

// A leaf as `resolveClipLayouts` sees it: the clip with the styles flex
// resized (`sizedClip`).
struct LeafView {
    const Clip* clip = nullptr;
    std::optional<QJsonObject> shapeStyle;
    std::optional<TextStyle> textStyle;
    std::optional<ClipTransform> transform;  // unset: the clip's
};

struct Env {
    double W = 0, H = 0;
    const MeasureText* measure = nullptr;
    const ChildIndex* children = nullptr;
    const std::unordered_map<std::string, TextStyle>* textStyles = nullptr;

    // The clip's text style at this frame.
    TextStyle textStyleOf(const Clip& clip) const {
        const auto it = textStyles->find(clip.id);
        if (it != textStyles->end()) return it->second;
        return parseTextStyle(clip.raw.value(u"textStyle").toObject());
    }
};

LayoutBox measuredClipBox(const LeafView& view, const Env& env, std::unordered_set<std::string>& visited);

LayoutBox boxOf(const Clip& clip, const Env& env) {
    std::unordered_set<std::string> visited;
    return measuredClipBox(LeafView{&clip, {}, {}, {}}, env, visited);
}

// `measuredClipBox`: the box the clip's content renders at, its current
// transform applied, canvas-centre-relative.
LayoutBox measuredClipBox(const LeafView& view, const Env& env, std::unordered_set<std::string>& visited) {
    const Clip& clip = *view.clip;
    const ClipTransform transform = view.transform.value_or(clip.transform.value_or(ClipTransform{}));
    const double W = env.W;
    const double H = env.H;
    if (clip.mediaType == MediaType::Group) {
        if (visited.count(clip.id)) return {};
        visited.insert(clip.id);
        std::vector<LayoutBox> boxes;
        const auto it = env.children->find(clip.id);
        if (it != env.children->end()) {
            for (const Clip* child : it->second) {
                const LayoutBox b = measuredClipBox(LeafView{child, {}, {}, {}}, env, visited);
                if (b.width > 0 && b.height > 0) boxes.push_back(b);
            }
        }
        visited.erase(clip.id);
        if (boxes.empty()) return {};
        double x0 = std::numeric_limits<double>::infinity(), y0 = x0, x1 = -x0, y1 = -x0;
        for (const LayoutBox& b : boxes) {
            x0 = std::min(x0, b.x);
            y0 = std::min(y0, b.y);
            x1 = std::max(x1, b.x + b.width);
            y1 = std::max(y1, b.y + b.height);
        }
        return projectedBox(LayoutBox{x0 + W / 2, y0 + H / 2, x1 - x0, y1 - y0}, transform, W, H);
    }
    const QJsonValue textValue = clip.raw.value(u"textStyle");
    if (clip.mediaType == MediaType::Text && textValue.isObject()) {
        const TextStyle style = view.textStyle ? *view.textStyle : env.textStyleOf(clip);
        const TextBox b = textBlockBox(*env.measure, style, W, H);
        return projectedBox(LayoutBox{b.x, b.y, b.width, b.height}, transform, W, H);
    }
    const QJsonValue shapeValue = clip.raw.value(u"shapeStyle");
    if (clip.mediaType == MediaType::Shape && shapeValue.isObject()) {
        const LayoutBox b = shapeAuthoredBox(view.shapeStyle.value_or(shapeValue.toObject()), W, H, LayoutBox{0, 0, 1, 1});
        return projectedBox(b, transform, W, H);
    }
    const Vec2 size = containBaseScale(clip.width ? *clip.width : W, clip.height ? *clip.height : H, W, H);
    return projectedBox(LayoutBox{0, 0, W, H}, transform, W, H, size);
}

// ── Yoga styles ───────────────────────────────────────────────────────────

// `String.prototype.trim`: ECMAScript white space and line terminators.
QString jsTrim(const QString& s) {
    qsizetype b = 0;
    qsizetype e = s.size();
    while (b < e && isJsSpace(s[b].unicode())) b++;
    while (e > b && isJsSpace(s[e - 1].unicode())) e--;
    return s.mid(b, e - b);
}

// JavaScript's `Number(s)`: trimmed, "" is 0, NaN when it is not a whole
// number literal.
double jsNumber(const QString& raw) {
    const QString s = jsTrim(raw);
    if (s.isEmpty()) return 0;
    if (s.size() > 2 && s[0] == u'0' && (s[1] == u'x' || s[1] == u'X' || s[1] == u'o' || s[1] == u'O' ||
                                          s[1] == u'b' || s[1] == u'B')) {
        const int base = (s[1] == u'x' || s[1] == u'X') ? 16 : (s[1] == u'o' || s[1] == u'O') ? 8 : 2;
        bool ok = false;
        const qulonglong v = s.mid(2).toULongLong(&ok, base);
        return ok ? static_cast<double>(v) : std::nan("");
    }
    if (s == u"Infinity" || s == u"+Infinity") return std::numeric_limits<double>::infinity();
    if (s == u"-Infinity") return -std::numeric_limits<double>::infinity();
    // toDouble also takes "inf" and "nan", which Number does not.
    for (const QChar ch : s) {
        const char16_t c = ch.unicode();
        if (!((c >= u'0' && c <= u'9') || c == u'.' || c == u'e' || c == u'E' || c == u'+' || c == u'-')) return std::nan("");
    }
    bool ok = false;
    const double v = s.toDouble(&ok);
    return ok ? v : std::nan("");
}

// JavaScript's `parseFloat` of a "N%" string: the longest number prefix.
double jsParseFloat(const QString& s) {
    qsizetype i = 0;
    while (i < s.size() && isJsSpace(s[i].unicode())) i++;
    qsizetype j = i;
    if (j < s.size() && (s[j] == u'+' || s[j] == u'-')) j++;
    if (s.mid(j).startsWith(u"Infinity")) return s[i] == u'-' ? -INFINITY : INFINITY;
    qsizetype digits = 0;
    while (j < s.size() && s[j].isDigit()) j++, digits++;
    if (j < s.size() && s[j] == u'.') {
        j++;
        while (j < s.size() && s[j].isDigit()) j++, digits++;
    }
    if (digits == 0) return std::nan("");
    if (j < s.size() && (s[j] == u'e' || s[j] == u'E')) {
        qsizetype k = j + 1;
        if (k < s.size() && (s[k] == u'+' || s[k] == u'-')) k++;
        if (k < s.size() && s[k].isDigit()) {
            while (k < s.size() && s[k].isDigit()) k++;
            j = k;
        }
    }
    return s.mid(i, j - i).toDouble();
}

// A `ClipLayoutDimension` as Yoga takes it (`yogaDimension`).
struct Dimension {
    double value = 0;
    bool percent = false;
};

std::optional<Dimension> yogaDimension(const QJsonValue& v) {
    if (v.isDouble()) {
        const double n = v.toDouble();
        return std::isfinite(n) ? std::optional<Dimension>(Dimension{n, false}) : std::nullopt;
    }
    if (!v.isString()) return std::nullopt;
    const QString trimmed = jsTrim(v.toString());
    if (trimmed.endsWith(u'%')) {
        // The npm wrapper calls `parseFloat` and throws on NaN.
        const double n = jsParseFloat(trimmed);
        return std::isnan(n) ? std::nullopt : std::optional<Dimension>(Dimension{n, true});
    }
    const double n = jsNumber(trimmed);
    return std::isfinite(n) ? std::optional<Dimension>(Dimension{n, false}) : std::nullopt;
}

// `rootDimensionPx`: a root resolves "N%" against the canvas.
std::optional<double> rootDimensionPx(const QJsonValue& v, double basis) {
    if (v.isDouble()) return v.toDouble();
    if (!v.isString()) return std::nullopt;
    const QString trimmed = jsTrim(v.toString());
    if (trimmed.endsWith(u'%')) {
        const double n = jsNumber(trimmed.left(trimmed.size() - 1));
        return std::isfinite(n) ? std::optional<double>(n / 100 * basis) : std::nullopt;
    }
    const double n = jsNumber(trimmed);
    return std::isfinite(n) ? std::optional<double>(n) : std::nullopt;
}

struct Edges {
    double top = 0, right = 0, bottom = 0, left = 0;
};

// `fourEdges` with a fallback of 0.
Edges fourEdges(const QJsonValue& v) {
    if (v.isDouble()) {
        const double n = v.toDouble();
        return Edges{n, n, n, n};
    }
    const QJsonObject o = v.toObject();
    return Edges{o.value(u"top").toDouble(0), o.value(u"right").toDouble(0), o.value(u"bottom").toDouble(0),
                 o.value(u"left").toDouble(0)};
}

std::optional<YGJustify> justifyOf(const QString& s) {
    if (s == u"flex-start") return YGJustifyFlexStart;
    if (s == u"flex-end") return YGJustifyFlexEnd;
    if (s == u"center") return YGJustifyCenter;
    if (s == u"space-between") return YGJustifySpaceBetween;
    if (s == u"space-around") return YGJustifySpaceAround;
    if (s == u"space-evenly") return YGJustifySpaceEvenly;
    return std::nullopt;
}

std::optional<YGAlign> alignOf(const QString& s) {
    if (s == u"flex-start") return YGAlignFlexStart;
    if (s == u"flex-end") return YGAlignFlexEnd;
    if (s == u"center") return YGAlignCenter;
    if (s == u"stretch") return YGAlignStretch;
    if (s == u"baseline") return YGAlignBaseline;
    return std::nullopt;
}

std::optional<YGAlign> alignContentOf(const QString& s) {
    if (s == u"flex-start") return YGAlignFlexStart;
    if (s == u"flex-end") return YGAlignFlexEnd;
    if (s == u"center") return YGAlignCenter;
    if (s == u"space-between") return YGAlignSpaceBetween;
    if (s == u"space-around") return YGAlignSpaceAround;
    if (s == u"space-evenly") return YGAlignSpaceEvenly;
    return std::nullopt;
}

using DimSetter = void (*)(YGNodeRef, float);

void setDimension(YGNodeRef node, const std::optional<Dimension>& d, DimSetter points, DimSetter percent) {
    if (!d) return;
    (d->percent ? percent : points)(node, static_cast<float>(d->value));
}

void applyContainerStyle(YGNodeRef node, const QJsonObject& layout, bool isRoot, double W, double H) {
    YGNodeStyleSetDisplay(node, YGDisplayFlex);
    YGNodeStyleSetFlexDirection(node, layout.value(u"flexDirection").toString() == u"column" ? YGFlexDirectionColumn
                                                                                              : YGFlexDirectionRow);
    if (const auto j = justifyOf(layout.value(u"justifyContent").toString())) YGNodeStyleSetJustifyContent(node, *j);
    if (const auto a = alignOf(layout.value(u"alignItems").toString())) YGNodeStyleSetAlignItems(node, *a);
    if (const auto a = alignContentOf(layout.value(u"alignContent").toString())) YGNodeStyleSetAlignContent(node, *a);
    const QString wrap = layout.value(u"flexWrap").toString();
    if (wrap == u"nowrap") YGNodeStyleSetFlexWrap(node, YGWrapNoWrap);
    else if (wrap == u"wrap") YGNodeStyleSetFlexWrap(node, YGWrapWrap);
    else if (wrap == u"wrap-reverse") YGNodeStyleSetFlexWrap(node, YGWrapWrapReverse);
    if (const auto g = number(layout, "gap")) YGNodeStyleSetGap(node, YGGutterAll, static_cast<float>(*g));
    if (const auto g = number(layout, "columnGap")) YGNodeStyleSetGap(node, YGGutterColumn, static_cast<float>(*g));
    if (const auto g = number(layout, "rowGap")) YGNodeStyleSetGap(node, YGGutterRow, static_cast<float>(*g));
    const Edges padding = fourEdges(layout.value(u"padding"));
    YGNodeStyleSetPadding(node, YGEdgeTop, static_cast<float>(padding.top));
    YGNodeStyleSetPadding(node, YGEdgeRight, static_cast<float>(padding.right));
    YGNodeStyleSetPadding(node, YGEdgeBottom, static_cast<float>(padding.bottom));
    YGNodeStyleSetPadding(node, YGEdgeLeft, static_cast<float>(padding.left));
    if (isRoot) {
        const auto px = [&](const char* key, double basis, DimSetter set) {
            if (const auto v = rootDimensionPx(layout.value(QLatin1String(key)), basis)) set(node, static_cast<float>(*v));
        };
        px("width", W, YGNodeStyleSetWidth);
        px("height", H, YGNodeStyleSetHeight);
        px("minWidth", W, YGNodeStyleSetMinWidth);
        px("maxWidth", W, YGNodeStyleSetMaxWidth);
        px("minHeight", H, YGNodeStyleSetMinHeight);
        px("maxHeight", H, YGNodeStyleSetMaxHeight);
    } else {
        setDimension(node, yogaDimension(layout.value(u"width")), YGNodeStyleSetWidth, YGNodeStyleSetWidthPercent);
        setDimension(node, yogaDimension(layout.value(u"height")), YGNodeStyleSetHeight, YGNodeStyleSetHeightPercent);
        setDimension(node, yogaDimension(layout.value(u"minWidth")), YGNodeStyleSetMinWidth, YGNodeStyleSetMinWidthPercent);
        setDimension(node, yogaDimension(layout.value(u"maxWidth")), YGNodeStyleSetMaxWidth, YGNodeStyleSetMaxWidthPercent);
        setDimension(node, yogaDimension(layout.value(u"minHeight")), YGNodeStyleSetMinHeight,
                     YGNodeStyleSetMinHeightPercent);
        setDimension(node, yogaDimension(layout.value(u"maxHeight")), YGNodeStyleSetMaxHeight,
                     YGNodeStyleSetMaxHeightPercent);
    }
}

void applyFlexItemStyle(YGNodeRef node, const QJsonValue& itemValue) {
    const QJsonObject item = itemValue.toObject();
    // CSS's `flex-shrink: 1`, for every child.
    YGNodeStyleSetFlexShrink(node, static_cast<float>(number(item, "shrink").value_or(1)));
    if (!itemValue.isObject()) return;
    if (const auto g = number(item, "grow")) YGNodeStyleSetFlexGrow(node, static_cast<float>(*g));
    setDimension(node, yogaDimension(item.value(u"basis")), YGNodeStyleSetFlexBasis, YGNodeStyleSetFlexBasisPercent);
    if (const auto a = alignOf(item.value(u"alignSelf").toString())) YGNodeStyleSetAlignSelf(node, *a);
    setDimension(node, yogaDimension(item.value(u"width")), YGNodeStyleSetWidth, YGNodeStyleSetWidthPercent);
    setDimension(node, yogaDimension(item.value(u"height")), YGNodeStyleSetHeight, YGNodeStyleSetHeightPercent);
    const Edges margin = fourEdges(item.value(u"margin"));
    YGNodeStyleSetMargin(node, YGEdgeTop, static_cast<float>(margin.top));
    YGNodeStyleSetMargin(node, YGEdgeRight, static_cast<float>(margin.right));
    YGNodeStyleSetMargin(node, YGEdgeBottom, static_cast<float>(margin.bottom));
    YGNodeStyleSetMargin(node, YGEdgeLeft, static_cast<float>(margin.left));
    if (item.value(u"position").toString() == u"absolute") {
        YGNodeStyleSetPositionType(node, YGPositionTypeAbsolute);
        const QJsonValue inset = item.value(u"inset");
        if (inset.isDouble()) {
            const auto n = static_cast<float>(inset.toDouble());
            for (YGEdge e : {YGEdgeTop, YGEdgeRight, YGEdgeBottom, YGEdgeLeft}) YGNodeStyleSetPosition(node, e, n);
        } else if (inset.isObject()) {
            const QJsonObject o = inset.toObject();
            if (const auto v = number(o, "top")) YGNodeStyleSetPosition(node, YGEdgeTop, static_cast<float>(*v));
            if (const auto v = number(o, "right")) YGNodeStyleSetPosition(node, YGEdgeRight, static_cast<float>(*v));
            if (const auto v = number(o, "bottom")) YGNodeStyleSetPosition(node, YGEdgeBottom, static_cast<float>(*v));
            if (const auto v = number(o, "left")) YGNodeStyleSetPosition(node, YGEdgeLeft, static_cast<float>(*v));
        }
    }
}

// ── the tree ──────────────────────────────────────────────────────────────

std::atomic<int> gLiveNodes{0};

// Owns one Yoga node from its creation. Freeing a node detaches it from its
// parent and children, so the nodes of a tree free in any order.
struct NodeDeleter {
    void operator()(YGNodeRef node) const {
        YGNodeFree(node);
        gLiveNodes.fetch_sub(1, std::memory_order_relaxed);
    }
};
using NodeArena = std::vector<std::unique_ptr<YGNode, NodeDeleter>>;

YGNodeRef newNode(NodeArena& arena) {
    arena.reserve(arena.size() + 1);  // a failed push must not leak the node
    YGNodeRef node = YGNodeNew();
    gLiveNodes.fetch_add(1, std::memory_order_relaxed);
    arena.emplace_back(node);
    return node;
}

struct Built {
    YGNodeRef node = nullptr;
    const Clip* clip = nullptr;
    bool container = false;
};

// The measure function's context: one leaf.
struct LeafContext {
    const Clip* clip = nullptr;
    const Env* env = nullptr;
};

// `measureLeaf`: a leaf's intrinsic size at the width Yoga offers.
YGSize measureLeaf(YGNodeConstRef node, float width, YGMeasureMode widthMode, float, YGMeasureMode) {
    const auto* ctx = static_cast<const LeafContext*>(YGNodeGetContext(node));
    const Clip& clip = *ctx->clip;
    const Env& env = *ctx->env;
    const double offered = width;
    double w = env.W;
    double h = env.H;
    const QJsonValue textValue = clip.raw.value(u"textStyle");
    const QJsonValue shapeValue = clip.raw.value(u"shapeStyle");
    if (clip.mediaType == MediaType::Text && textValue.isObject()) {
        TextStyle style = env.textStyleOf(clip);
        // A text leaf wraps to the width Yoga offers, not its own maxWidthFrac.
        style.maxWidthFrac = env.W > 0 && widthMode != YGMeasureModeUndefined && std::isfinite(offered)
                                 ? std::min(1.0, std::max(0.05, offered / env.W))
                                 : 1.0;
        const TextBox b = textBlockBox(*env.measure, style, env.W, env.H);
        w = b.width;
        h = b.height;
    } else if (clip.mediaType == MediaType::Shape && shapeValue.isObject()) {
        const LayoutBox b = shapeAuthoredBox(shapeValue.toObject(), env.W, env.H, LayoutBox{0, 0, 0, 0});
        w = b.width;
        h = b.height;
    } else if (clip.mediaType == MediaType::Group) {
        const LayoutBox b = boxOf(clip, env);
        // `box.width || canvas.width`: 0 and NaN fall back.
        w = b.width != 0 && !std::isnan(b.width) ? b.width : env.W;
        h = b.height != 0 && !std::isnan(b.height) ? b.height : env.H;
    }
    return YGSize{static_cast<float>(w), static_cast<float>(h)};
}

YGNodeRef buildTree(const Clip& clip, const Env& env, bool isRoot, std::unordered_set<std::string>& visited,
                    std::unordered_map<std::string, Built>& built, std::vector<std::unique_ptr<LeafContext>>& contexts,
                    std::unordered_set<std::string>& cycles, NodeArena& arena) {
    YGNodeRef node = newNode(arena);
    const bool container = isFlexContainer(clip);
    built[clip.id] = Built{node, &clip, container};
    if (container) {
        applyContainerStyle(node, clip.raw.value(u"layout").toObject(), isRoot, env.W, env.H);
        if (visited.count(clip.id)) {
            cycles.insert(clip.id);
            return node;
        }
        visited.insert(clip.id);
        const auto it = env.children->find(clip.id);
        if (it != env.children->end()) {
            size_t index = 0;
            for (const Clip* child : it->second) {
                YGNodeRef childNode = buildTree(*child, env, false, visited, built, contexts, cycles, arena);
                applyFlexItemStyle(childNode, child->raw.value(u"flexItem"));
                YGNodeInsertChild(node, childNode, index++);
            }
        }
        visited.erase(clip.id);
    } else {
        contexts.push_back(std::make_unique<LeafContext>(LeafContext{&clip, &env}));
        YGNodeSetContext(node, contexts.back().get());
        YGNodeSetMeasureFunc(node, &measureLeaf);
    }
    return node;
}

void collectBoxes(const Clip& clip, YGNodeRef node, double originX, double originY,
                  const std::unordered_map<std::string, Built>& built, const ChildIndex& children,
                  std::unordered_map<std::string, LayoutBox>& out) {
    const double left = originX + static_cast<double>(YGNodeLayoutGetLeft(node));
    const double top = originY + static_cast<double>(YGNodeLayoutGetTop(node));
    out[clip.id] = LayoutBox{left, top, static_cast<double>(YGNodeLayoutGetWidth(node)),
                             static_cast<double>(YGNodeLayoutGetHeight(node))};
    if (!isFlexContainer(clip)) return;
    const auto it = children.find(clip.id);
    if (it == children.end()) return;
    for (const Clip* child : it->second) {
        const auto b = built.find(child->id);
        if (b == built.end()) continue;
        collectBoxes(*child, b->second.node, left, top, built, children, out);
    }
}

}  // namespace

int flexLiveNodeCount() { return gLiveNodes.load(std::memory_order_relaxed); }

bool hasFlexLayout(const std::vector<const Clip*>& clips) {
    return std::any_of(clips.begin(), clips.end(), [](const Clip* c) { return isFlexContainer(*c); });
}

FlexResult resolveClipLayouts(const std::vector<const Clip*>& clips, double W, double H,
                              const std::unordered_map<std::string, TextStyle>& textStyles, const MeasureText& measure) {
    FlexResult result;
    std::unordered_map<std::string, const Clip*> byId;
    ChildIndex children;
    for (const Clip* c : clips) {
        byId[c->id] = c;  // the last clip with an id wins, like `new Map`
        if (!parentOf(*c).empty()) children[parentOf(*c)].push_back(c);
    }
    const Env env{W, H, &measure, &children, &textStyles};
    std::unordered_set<std::string> allCycles;

    for (const Clip* rootClip : clips) {
        // `isFlexRoot`: a flex container no ancestor's flex tree reaches.
        if (!isFlexContainer(*rootClip)) continue;
        if (!parentOf(*rootClip).empty()) {
            const auto p = byId.find(parentOf(*rootClip));
            if (p != byId.end() && isFlexContainer(*p->second)) continue;
        }
        const Clip& root = *rootClip;
        std::unordered_map<std::string, Built> built;
        std::vector<std::unique_ptr<LeafContext>> contexts;
        std::unordered_set<std::string> visited;
        std::unordered_set<std::string> cycles;
        // Declared after `contexts`: the nodes go first, on success or unwind.
        NodeArena arena;
        YGNodeRef rootNode = buildTree(root, env, true, visited, built, contexts, cycles, arena);
        allCycles.insert(cycles.begin(), cycles.end());

        const QJsonObject layout = root.raw.value(u"layout").toObject();
        const auto rootWidth = rootDimensionPx(layout.value(u"width"), W);
        const auto rootHeight = rootDimensionPx(layout.value(u"height"), H);
        YGNodeCalculateLayout(rootNode, rootWidth ? static_cast<float>(*rootWidth) : YGUndefined,
                              rootHeight ? static_cast<float>(*rootHeight) : YGUndefined, YGDirectionLTR);

        // Parent-local: the root's own position stays out (its group matrix
        // adds it); its anchor picks the point of its box that position places.
        const double rootBoxWidth = YGNodeLayoutGetWidth(rootNode);
        const double rootBoxHeight = YGNodeLayoutGetHeight(rootNode);
        const Vec2 anchor = root.transform ? root.transform->anchor : Vec2{0.5, 0.5};
        const double originX = W / 2 - anchor.x * rootBoxWidth;
        const double originY = H / 2 - anchor.y * rootBoxHeight;
        std::unordered_map<std::string, LayoutBox> boxes;
        collectBoxes(root, rootNode, originX, originY, built, children, boxes);
        for (const auto& [id, b] : boxes) result.resolvedBoxes[id] = LayoutBox{b.x - W / 2, b.y - H / 2, b.width, b.height};

        // Each laid-out clip: shift its position by its target box's centre
        // against its current box's centre.
        for (const auto& [id, entry] : built) {
            if (id == root.id) continue;
            const Clip& clip = *entry.clip;
            const auto target = boxes.find(id);
            if (target == boxes.end()) continue;
            const LayoutBox& t = target->second;
            const QJsonObject item = clip.raw.value(u"flexItem").toObject();
            const bool absoluteNoInset = item.value(u"position").toString() == u"absolute" && !item.contains(u"inset");

            LeafView sized{&clip, {}, {}, {}};
            bool resized = false;
            if (!entry.container) {
                const QJsonValue shapeValue = clip.raw.value(u"shapeStyle");
                const QJsonValue textValue = clip.raw.value(u"textStyle");
                if (clip.mediaType == MediaType::Shape && shapeValue.isObject() &&
                    shapeValue.toObject().value(u"kind").toString() != u"path" && W > 0 && H > 0) {
                    QJsonObject shape = shapeValue.toObject();
                    shape.insert(QStringLiteral("x"), 0);
                    shape.insert(QStringLiteral("y"), 0);
                    shape.insert(QStringLiteral("width"), t.width / W);
                    shape.insert(QStringLiteral("height"), t.height / H);
                    sized.shapeStyle = shape;
                    resized = true;
                } else if (clip.mediaType == MediaType::Text && textValue.isObject() && W > 0) {
                    TextStyle style = env.textStyleOf(clip);
                    style.maxWidthFrac = std::min(1.0, std::max(0.05, t.width / W));
                    sized.textStyle = style;
                    resized = true;
                }
            }
            if (resized) result.sizes[id] = LayoutBox{0, 0, t.width, t.height};
            const ClipTransform current = clip.transform.value_or(ClipTransform{});
            if (absoluteNoInset) {
                if (resized) result.transforms[id] = current;
                continue;
            }
            std::unordered_set<std::string> seen;
            const LayoutBox now = measuredClipBox(sized, env, seen);
            const double nowX = now.x + now.width / 2;
            const double nowY = now.y + now.height / 2;
            const double targetX = t.x + t.width / 2 - W / 2;
            const double targetY = t.y + t.height / 2 - H / 2;
            ClipTransform moved = current;
            moved.position = Vec2{current.position.x + targetX - nowX, current.position.y + targetY - nowY};
            result.transforms[id] = moved;
        }
    }
    result.cycles.assign(allCycles.begin(), allCycles.end());
    return result;
}

}  // namespace nt::scene
