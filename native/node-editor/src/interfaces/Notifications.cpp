#include "Notifications.h"

#include "interfaces/Assign.h"

namespace nodetool::node_editor {

Notifications::Notifications(QObject *parent) : QObject(parent) {}

Notifications::~Notifications() = default;

void Notifications::setEntries(const QVariantList &entries) {
    if (assign(entries_, entries)) { emit entriesChanged(); }
}

void Notifications::setUnread(int unread) {
    if (assign(unread_, unread)) { emit unreadChanged(); }
}

}  // namespace nodetool::node_editor
