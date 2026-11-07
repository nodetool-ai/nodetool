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
    // Output port names by node ID, in card order. Siblings fed by one node
    // keep that order, as the web's source handle ordering does.
    QHash<QString, QStringList> outputOrder;
};
struct LayoutStats { qsizetype nodes = 0; qsizetype edges = 0; qsizetype components = 0; };
struct LayoutResult {
    bool ok = false;
    QString error;
    QJsonObject command;
    // Groups the web resizes to their laid out children plus padding. Only
    // whole graph layouts report them. The host writes them in the same undo
    // step as the move.
    QHash<QString, QSizeF> groupSizes;
    LayoutStats stats;
};
// Canonical graph JSON in, one moveNodes command out. Dimensions include any
// title/preview protrusion. Missing/invalid dimensions use 280x100.
// Whole graphs arrange siblings in parent-relative space and keep the top left
// of the top-level nodes where it was, as the web does. Selections arrange
// only selected roots in canvas space, keeping descendants relative to groups.
// Unlike web ELK, this uses deterministic SCC layering and barycenter ordering,
// and does not route edges or optimize using NETWORK_SIMPLEX. A group with laid
// out children is reported in groupSizes at its children's extent plus padding.
// A controlled node follows its controller within a layer.
[[nodiscard]] LayoutResult autoLayoutCommand(const QJsonObject& graph,
    const QHash<QString, QSizeF>& cardSizes = {}, const LayoutOptions& options = {});
}
