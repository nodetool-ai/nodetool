#include "app/PanelRegistry.h"

namespace {
const bool transformGizmoPanel = nt::app::registerPanel({
    QStringLiteral("preview"), QStringLiteral("transformGizmo"),
    QUrl(QStringLiteral("qrc:/qt/qml/NodeTool/Timeline/qml/wiring/FrameGizmoOverlay.qml")),
    10, QStringLiteral("Transform")});
}
