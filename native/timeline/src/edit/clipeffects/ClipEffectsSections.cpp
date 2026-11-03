#include "edit/inspectorsections/InspectorSectionRegistry.h"

namespace {
const bool registered = [] {
    using nt::inspector::registerInspectorSection;
    registerInspectorSection("effects", QUrl("qrc:/qt/qml/NodeTool/Timeline/src/edit/clipeffects/ClipEffectsList.qml"), 60, "Effects");
    return true;
}();
}
