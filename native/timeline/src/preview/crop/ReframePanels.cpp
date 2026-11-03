#include "app/PanelRegistry.h"
#include "edit/inspectorsections/InspectorSectionRegistry.h"

namespace {
const bool registered = [] {
    using nt::inspector::registerInspectorSection;
    registerInspectorSection("reframe", QUrl("qrc:/qt/qml/NodeTool/Timeline/qml/Inspector/ReframeSection.qml"), 87, "Smart reframe", "motion");
    nt::app::registerPanel({"preview", "reframeFocus",
        QUrl("qrc:/qt/qml/NodeTool/Timeline/qml/Inspector/ReframePreview.qml"), 20, "Reframe focus"});
    return true;
}();
}
