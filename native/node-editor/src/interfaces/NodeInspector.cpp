#include "NodeInspector.h"

#include "interfaces/Assign.h"

namespace nodetool::node_editor {

NodeInspector::NodeInspector(QObject *parent) : QObject(parent) {}

NodeInspector::~NodeInspector() = default;

void NodeInspector::setSelection(const QString &selection) {
    if (assign(selection_, selection)) { emit selectionChanged(); }
}

void NodeInspector::setSelectionInfo(const QVariantMap &info) {
    if (assign(selectionInfo_, info)) { emit selectionInfoChanged(); }
}

void NodeInspector::setProperties(const QVariantList &properties) {
    if (assign(properties_, properties)) { emit propertiesChanged(); }
}

void NodeInspector::setDynamicPorts(QObject *controller) {
    if (dynamicPorts_ == controller) { return; }
    dynamicPorts_ = controller;
    emit dynamicPortsChanged();
}

void NodeInspector::setReadOnlyReason(const QString &reason) {
    if (assign(readOnlyReason_, reason)) { emit readOnlyChanged(); }
}

void NodeInspector::setMessage(const QString &message) {
    if (assign(message_, message)) { emit messageChanged(); }
}

void NodeInspector::setCanRun(bool canRun) {
    if (assign(canRun_, canRun)) { emit canRunChanged(); }
}

void NodeInspector::setRunning(bool running) {
    if (assign(running_, running)) { emit runChanged(); }
}

void NodeInspector::setRunProgress(const QVariantMap &progress) {
    if (assign(runProgress_, progress)) { emit runChanged(); }
}

void NodeInspector::setCostEstimate(const QVariantMap &estimate) {
    if (assign(costEstimate_, estimate)) { emit runChanged(); }
}

}  // namespace nodetool::node_editor
