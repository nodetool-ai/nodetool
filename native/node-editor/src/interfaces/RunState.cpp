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

void RunState::setJobsError(const QString &error) {
    if (assign(jobsError_, error)) { emit jobsErrorChanged(); }
}

void RunState::setWorkflowId(const QString &id) {
    if (assign(workflowId_, id)) { emit workflowIdChanged(); }
}

void RunState::setOutput(const QVariantList &runs, const QString &selectedRunId) {
    // Bitwise or, so both fields are assigned.
    if (assign(outputRuns_, runs) | assign(selectedRunId_, selectedRunId)) { emit outputChanged(); }
}

void RunState::setOutputModels(QAbstractItemModel *collections, QAbstractItemModel *richEntries) {
    if (collections_ == collections && richEntries_ == richEntries) { return; }
    collections_ = collections;
    richEntries_ = richEntries;
    emit outputModelsChanged();
}

}  // namespace nodetool::node_editor
