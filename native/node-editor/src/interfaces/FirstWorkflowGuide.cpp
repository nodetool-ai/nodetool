#include "FirstWorkflowGuide.h"

#include "interfaces/Assign.h"

namespace nodetool::node_editor {

FirstWorkflowGuide::FirstWorkflowGuide(QObject *parent) : QObject(parent) {}

FirstWorkflowGuide::~FirstWorkflowGuide() = default;

void FirstWorkflowGuide::setState(bool visible, bool started, const QVariantList &readiness) {
    // Bitwise or, so every field is assigned.
    if (assign(visible_, visible) | assign(started_, started) | assign(readiness_, readiness)) {
        emit stateChanged();
    }
}

}  // namespace nodetool::node_editor
