#include "edit/inspectorsections/InspectorSectionRegistry.h"

namespace {
const bool registered = [] {
    using nt::inspector::registerInspectorSection;
    registerInspectorSection("text", QUrl("qrc:/qt/qml/NodeTool/Timeline/qml/Inspector/TextStyleSection.qml"), 5, "Text");
    registerInspectorSection("shape", QUrl("qrc:/qt/qml/NodeTool/Timeline/qml/Inspector/ShapeSection.qml"), 6, "Shape");
    registerInspectorSection("caption", QUrl("qrc:/qt/qml/NodeTool/Timeline/qml/Inspector/CaptionStyle.qml"), 25, "Caption");
    return true;
}();
}
