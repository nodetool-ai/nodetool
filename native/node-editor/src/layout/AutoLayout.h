#pragma once
#include <QHash>
#include <QJsonObject>
#include <QSizeF>
#include <QStringList>
#include <optional>
namespace nodetool::node_editor::layout {
struct LayoutOptions {
    std::optional<QStringList> selection;
    double layerGap = 30;
    double nodeGap = 50;
    double padding = 50;
};
struct LayoutStats { qsizetype nodes = 0; qsizetype edges = 0; qsizetype components = 0; };
struct LayoutResult {
    bool ok = false;
    QString error;
    QJsonObject command;
    LayoutStats stats;
};
// Canonical graph JSON in, one moveNodes command out. Dimensions include any
// title/preview protrusion. Missing/invalid dimensions use 280x100.
// Whole graphs arrange siblings in parent-relative space. Selections arrange
// only selected roots in canvas space, keeping descendants relative to groups.
// Unlike web ELK, this uses deterministic SCC layering and barycenter ordering,
// reserves child footprints but does not resize stored groups, route edges,
// or optimize using NETWORK_SIMPLEX.
[[nodiscard]] LayoutResult autoLayoutCommand(const QJsonObject& graph,
    const QHash<QString, QSizeF>& cardSizes = {}, const LayoutOptions& options = {});
}
