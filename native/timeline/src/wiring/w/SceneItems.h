#pragma once
#include <QQuickItem>
#include <QQuickWindow>

namespace nt::wiring::w {
// Overlay loaders have visual parents outside the QObject ownership tree.
inline QQuickItem* findItem(QQuickItem* root, const QString& name) {
    if (!root) { return nullptr; }
    if (root->objectName() == name) { return root; }
    for (auto* child : root->childItems()) {
        if (auto* found = findItem(child, name)) { return found; }
    }
    return nullptr;
}
inline QQuickItem* windowItem(QQuickItem* anchor, const QString& name) {
    return anchor && anchor->window() ? findItem(anchor->window()->contentItem(), name) : nullptr;
}
}
