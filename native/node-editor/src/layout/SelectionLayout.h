#pragma once
#include <QHash>
#include <QJsonObject>
#include <QRectF>
#include <QStringList>

namespace nodetool::node_editor::layout {
enum class SelectionAction {
    AlignLeft, AlignCenter, AlignRight, AlignTop, AlignMiddle, AlignBottom,
    DistributeHorizontal, DistributeVertical, Stack, Grid
};
struct SelectionLayoutResult {
    bool ok = false;
    QString error;
    QJsonObject command;
    QStringList roots;
};
// Ports useSelectionActions.ts formulas. Geometry is the host's measured card
// rectangle in absolute canvas coordinates, including expanded groups/previews.
// Selected descendants move with their selected ancestors, never a second time.
// The returned absolute moveNodes command is a single document undo operation.
[[nodiscard]] SelectionLayoutResult selectionLayoutCommand(const QJsonObject& graph,
    const QStringList& selection, const QHash<QString, QRectF>& absoluteGeometry,
    SelectionAction action);
}
