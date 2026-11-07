#include "InspectorSectionRegistry.h"
namespace {
const bool registered = [] {
    using nt::inspector::registerInspectorSection;
    registerInspectorSection("media", QUrl("qrc:/qt/qml/NodeTool/Timeline/src/edit/inspectorsections/MediaSection.qml"), 10, "Media");
    registerInspectorSection("timing", QUrl("qrc:/qt/qml/NodeTool/Timeline/src/edit/inspectorsections/TimingSection.qml"), 20, "Timing");
    registerInspectorSection("transition", QUrl("qrc:/qt/qml/NodeTool/Timeline/qml/Inspector/TransitionSection.qml"), 80, "Transition");
    return true;
}();
}
