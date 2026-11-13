#include "WorkflowHeader.h"

#include "interfaces/Assign.h"

namespace nodetool::node_editor {

WorkflowHeader::WorkflowHeader(QObject *parent) : QObject(parent) {}

WorkflowHeader::~WorkflowHeader() = default;

void WorkflowHeader::setWorkflowName(const QString &name) {
    if (assign(workflowName_, name)) { emit workflowNameChanged(); }
}

void WorkflowHeader::setRenamable(bool renamable) {
    if (assign(renamable_, renamable)) { emit renamableChanged(); }
}

void WorkflowHeader::setSaveStatus(const QString &status) {
    if (assign(saveStatus_, status)) { emit saveStatusChanged(); }
}

void WorkflowHeader::setHistory(bool canUndo, bool canRedo) {
    // Bitwise or, so both fields are assigned.
    if (assign(canUndo_, canUndo) | assign(canRedo_, canRedo)) { emit historyChanged(); }
}

void WorkflowHeader::setActions(const QStringList &enabled, bool instantUpdate, bool mouseNavigation) {
    if (assign(enabledActions_, enabled) | assign(instantUpdate_, instantUpdate) | assign(mouseNavigation_, mouseNavigation)) {
        emit actionsChanged();
    }
}

}  // namespace nodetool::node_editor
