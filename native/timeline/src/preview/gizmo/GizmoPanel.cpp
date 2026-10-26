#include "app/PanelRegistry.h"

namespace {
const bool transformGizmoPanel = nt::app::registerPanel({
    QStringLiteral("overlay"), QStringLiteral("transformGizmo"),
    QUrl(QStringLiteral("qrc:/qt/qml/NodeTool/Timeline/qml/preview/TransformGizmoOverlay.qml")),
    10, QStringLiteral("Transform")});
}
