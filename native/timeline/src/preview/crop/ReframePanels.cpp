#include "app/PanelRegistry.h"
#include "edit/inspectorsections/InspectorSectionRegistry.h"

namespace {
const bool registered = [] {
    using nt::inspector::registerInspectorSection;
    registerInspectorSection("crop", QUrl("qrc:/qt/qml/NodeTool/Timeline/qml/Inspector/ReframeCrop.qml"), 45, "Crop");
    registerInspectorSection("reframe", QUrl("qrc:/qt/qml/NodeTool/Timeline/qml/Inspector/ReframeSection.qml"), 84, "Smart reframe");
    nt::app::registerPanel({"preview", "reframeFocus",
        QUrl("qrc:/qt/qml/NodeTool/Timeline/qml/Inspector/ReframePreview.qml"), 20, "Reframe focus"});
    return true;
}();
}
