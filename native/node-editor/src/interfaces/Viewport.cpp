#include "Viewport.h"

#include "interfaces/Assign.h"

namespace nodetool::node_editor {

Viewport::Viewport(QObject *parent) : QObject(parent) {}

Viewport::~Viewport() = default;

void Viewport::setZoom(int percent, bool preset) {
    // Bitwise or, so both fields are assigned.
    if (assign(zoomPercent_, percent) | assign(zoomIsPreset_, preset)) { emit zoomChanged(); }
}

void Viewport::setMiniMapColorMode(const QString &mode) {
    if (assign(miniMapColorMode_, mode)) { emit colorModeChanged(); }
}

}  // namespace nodetool::node_editor
