#include "edit/inspectorsections/InspectorSectionRegistry.h"

namespace {
const bool registered = nt::inspector::registerInspectorSection("audio",
    QUrl("qrc:/qt/qml/NodeTool/Timeline/qml/Inspector/AudioSection.qml"), 41, "Audio");
const bool effectsRegistered = nt::inspector::registerInspectorSection("audioEffects",
    QUrl("qrc:/qt/qml/NodeTool/Timeline/qml/Inspector/AudioEffects.qml"), 42, "Audio effects");
}
