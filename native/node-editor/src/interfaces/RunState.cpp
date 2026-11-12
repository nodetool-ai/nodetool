#include "RunState.h"

#include "interfaces/Assign.h"

namespace nodetool::node_editor {

RunState::RunState(QObject *parent) : QObject(parent) {}

RunState::~RunState() = default;

void RunState::setQueue(const QVariantList &queue) {
    if (assign(queue_, queue)) { emit queueChanged(); }
}

void RunState::setConnected(bool connected) {
    if (assign(connected_, connected)) { emit connectionChanged(); }
}

void RunState::setWorkflowId(const QString &id) {
    if (assign(workflowId_, id)) { emit workflowIdChanged(); }
}

}  // namespace nodetool::node_editor
