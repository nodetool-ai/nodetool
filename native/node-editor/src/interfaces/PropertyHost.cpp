#include "PropertyHost.h"

#include "interfaces/Assign.h"

namespace nodetool::node_editor {

PropertyHost::PropertyHost(QObject *parent) : QObject(parent) {}

PropertyHost::~PropertyHost() = default;

void PropertyHost::setSelection(const QString &selection) {
    if (assign(selection_, selection)) { emit selectionChanged(); }
}

void PropertyHost::setReadOnly(bool readOnly) {
    if (assign(readOnly_, readOnly)) { emit readOnlyChanged(); }
}

void PropertyHost::setDocumentEpoch(quint64 epoch) {
    if (assign(documentEpoch_, epoch)) { emit documentEpochChanged(); }
}

void PropertyHost::setCredentialsEpoch(quint64 epoch) {
    if (assign(credentialsEpoch_, epoch)) { emit credentialsEpochChanged(); }
}

void PropertyHost::setServices(const Services &services) {
    if (assign(services_, services)) { emit servicesChanged(); }
}

}  // namespace nodetool::node_editor
