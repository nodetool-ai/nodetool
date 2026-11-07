#include "SelectionLayout.h"
#include <QCollator>
#include <QJsonArray>
#include <QLocale>
#include <QSet>
#include <algorithm>
#include <cmath>
#include <limits>
#include <vector>

namespace nodetool::node_editor::layout {
SelectionLayoutResult selectionLayoutCommand(const QJsonObject& graph,
    const QStringList& selection, const QHash<QString, QRectF>& absoluteGeometry,
    SelectionAction action) {
    SelectionLayoutResult result;
    const auto fail = [&](const QString& error) { result.error = error; return result; };
    if (action < SelectionAction::AlignLeft || action > SelectionAction::Grid) { return fail("Unknown selection layout action"); }
    if (!graph.value("nodes").isArray()) { return fail("Layout requires graph nodes"); }
    QHash<QString, QString> parents;
    for (const auto& value : graph.value("nodes").toArray()) {
        const auto node = value.toObject();
        const auto id = node.value("id").toString();
        const auto parent = node.value("parent_id");
        if (id.isEmpty() || parents.contains(id)) { return fail("Layout requires unique node IDs"); }
        if (!parent.isUndefined() && !parent.isNull() && !parent.isString()) { return fail("Invalid layout parent ID"); }
        parents.insert(id, parent.toString());
    }
    for (auto it = parents.cbegin(); it != parents.cend(); ++it) {
        if (!it.value().isEmpty() && !parents.contains(it.value())) { return fail("Layout requires existing parents"); }
    }
    QSet<QString> selected;
    for (const auto& id : selection) {
        if (!parents.contains(id)) { return fail("Unknown selected node ID: " + id); }
        selected.insert(id);
    }
    // Memoize ancestry once, so selecting a deep hierarchy never walks the
    // same ancestor chain for every selected descendant.
    QHash<QString, bool> carried;
    for (auto it = parents.cbegin(); it != parents.cend(); ++it) {
        QStringList path;
        QSet<QString> visiting;
        auto current = it.key();
        while (!current.isEmpty() && !carried.contains(current)) {
            if (visiting.contains(current)) { return fail("Layout refuses cyclic parents"); }
            visiting.insert(current); path.append(current); current = parents.value(current);
        }
        bool ancestorSelected = !current.isEmpty() && (selected.contains(current) || carried.value(current));
        while (!path.isEmpty()) {
            const auto id = path.takeLast();
            carried.insert(id, ancestorSelected);
            ancestorSelected = ancestorSelected || selected.contains(id);
        }
    }
    struct Placed { QString id; QRectF rectangle; };
    std::vector<Placed> placed;
    QSet<QString> added;
    for (const auto& id : selection) {
        if (carried.value(id) || added.contains(id)) { continue; }
        const auto found = absoluteGeometry.constFind(id);
        if (found == absoluteGeometry.cend()) { return fail("Missing measured geometry for selected node " + id); }
        const auto rect = *found;
        if (!std::isfinite(rect.x()) || !std::isfinite(rect.y()) || !std::isfinite(rect.width()) || !std::isfinite(rect.height())
            || !std::isfinite(rect.right()) || !std::isfinite(rect.bottom()) || rect.width() <= 0 || rect.height() <= 0) {
            return fail("Layout requires finite positions and positive measured dimensions");
        }
        placed.push_back({id, rect}); result.roots.append(id); added.insert(id);
    }
    QJsonObject positions;
    result.command = QJsonObject{{"op", "moveNodes"}, {"space", "absolute"}, {"positions", positions}};
    if (placed.size() < 2) { result.ok = true; return result; }
    constexpr double horizontalGap = 40, verticalGap = 20;
    double left = std::numeric_limits<double>::infinity(), top = left;
    double right = -left, bottom = -left, centerX = 0, centerY = 0;
    for (const auto& node : placed) {
        left = std::min(left, node.rectangle.x()); top = std::min(top, node.rectangle.y());
        right = std::max(right, node.rectangle.right()); bottom = std::max(bottom, node.rectangle.bottom());
        centerX += node.rectangle.center().x(); centerY += node.rectangle.center().y();
    }
    centerX /= static_cast<double>(placed.size()); centerY /= static_cast<double>(placed.size());
    // Resource IDs are normally lowercase hex. Use fixed English collation for
    // legacy/named IDs to mirror browser localeCompare without machine locale
    // changing tie order between native sessions.
    QCollator collator(QLocale(QLocale::English, QLocale::UnitedStates));
    const auto byId = [&](const Placed& a, const Placed& b) { return collator.compare(a.id, b.id) < 0; };
    const auto readingOrder = [&](const Placed& a, const Placed& b) {
        if (a.rectangle.y() != b.rectangle.y()) { return a.rectangle.y() < b.rectangle.y(); }
        if (a.rectangle.x() != b.rectangle.x()) { return a.rectangle.x() < b.rectangle.x(); }
        return byId(a, b);
    };
    if (action == SelectionAction::DistributeHorizontal) {
        std::stable_sort(placed.begin(), placed.end(), [&](const Placed& a, const Placed& b) {
            return a.rectangle.x() != b.rectangle.x() ? a.rectangle.x() < b.rectangle.x() : byId(a, b);
        });
    } else if (action == SelectionAction::DistributeVertical) {
        std::stable_sort(placed.begin(), placed.end(), [&](const Placed& a, const Placed& b) {
            return a.rectangle.y() != b.rectangle.y() ? a.rectangle.y() < b.rectangle.y() : byId(a, b);
        });
    } else if (action == SelectionAction::Stack || action == SelectionAction::Grid) {
        std::stable_sort(placed.begin(), placed.end(), readingOrder);
    }
    std::vector<double> columnX, rowY;
    std::size_t columns = 0;
    if (action == SelectionAction::Grid) {
        columns = static_cast<std::size_t>(std::ceil(std::sqrt(static_cast<double>(placed.size()))));
        const auto rows = (placed.size() + columns - 1) / columns;
        columnX.resize(columns, 0); rowY.resize(rows, 0);
        for (std::size_t i = 0; i < placed.size(); ++i) {
            columnX[i % columns] = std::max(columnX[i % columns], placed[i].rectangle.width());
            rowY[i / columns] = std::max(rowY[i / columns], placed[i].rectangle.height());
        }
        // Prefix sums match the web column/row maxima with linear work.
        auto x = left;
        for (auto& width : columnX) { const auto next = x + width + horizontalGap; width = x; x = next; }
        auto y = top;
        for (auto& height : rowY) { const auto next = y + height + verticalGap; height = y; y = next; }
    }
    double nextX = left, nextY = top;
    for (std::size_t i = 0; i < placed.size(); ++i) {
        const auto& node = placed[i];
        auto x = node.rectangle.x(), y = node.rectangle.y();
        switch (action) {
        case SelectionAction::AlignLeft: x = left; break;
        case SelectionAction::AlignCenter: x = centerX - node.rectangle.width() / 2; break;
        case SelectionAction::AlignRight: x = right - node.rectangle.width(); break;
        case SelectionAction::AlignTop: y = top; break;
        case SelectionAction::AlignMiddle: y = centerY - node.rectangle.height() / 2; break;
        case SelectionAction::AlignBottom: y = bottom - node.rectangle.height(); break;
        case SelectionAction::DistributeHorizontal: x = nextX; nextX += node.rectangle.width() + horizontalGap; break;
        case SelectionAction::DistributeVertical: y = nextY; nextY += node.rectangle.height() + verticalGap; break;
        case SelectionAction::Stack: x = left; y = nextY; nextY += node.rectangle.height() + verticalGap; break;
        case SelectionAction::Grid: x = columnX[i % columns]; y = rowY[i / columns]; break;
        default: return fail("Unknown selection layout action");
        }
        if (!std::isfinite(x) || !std::isfinite(y)) { return fail("Layout positions exceed finite canvas coordinates"); }
        positions.insert(node.id, QJsonObject{{"x", x}, {"y", y}});
    }
    result.command.insert("positions", positions); result.ok = true; return result;
}
}
