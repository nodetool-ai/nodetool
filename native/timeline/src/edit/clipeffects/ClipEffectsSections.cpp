#include "edit/inspectorsections/InspectorSectionRegistry.h"

namespace {
const bool registered = [] {
    using nt::inspector::registerInspectorSection;
    registerInspectorSection("color", QUrl("qrc:/qt/qml/NodeTool/Timeline/src/edit/clipeffects/ClipAdjustments.qml"), 50, "Color");
    registerInspectorSection("effects", QUrl("qrc:/qt/qml/NodeTool/Timeline/src/edit/clipeffects/ClipEffectsList.qml"), 60, "Effects");
    return true;
}();
}
