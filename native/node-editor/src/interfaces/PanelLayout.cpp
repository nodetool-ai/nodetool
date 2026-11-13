#include "PanelLayout.h"

#include "interfaces/Assign.h"

namespace nodetool::node_editor {

PanelLayout::PanelLayout(QObject *parent) : QObject(parent) {}

PanelLayout::~PanelLayout() = default;

void PanelLayout::setPanels(const Panels &panels) {
    if (assign(panels_, panels)) { emit panelsChanged(); }
}

}  // namespace nodetool::node_editor
