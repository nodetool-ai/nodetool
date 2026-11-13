#include "DocumentTabs.h"

#include "interfaces/Assign.h"

namespace nodetool::node_editor {

DocumentTabs::DocumentTabs(QObject *parent) : QObject(parent) {}

DocumentTabs::~DocumentTabs() = default;

void DocumentTabs::setTabs(const QVariantList &tabs, int activeTab, const QString &projectName,
                           const QVariantList &canvasStrips) {
    // Every call emits, because each emit rebuilds the strip's delegates and
    // the owner calls only when its tab list changed.
    tabs_ = tabs;
    activeTab_ = activeTab;
    projectName_ = projectName;
    canvasStrips_ = canvasStrips;
    emit tabsChanged();
}

void DocumentTabs::setStripOffset(qreal offset) {
    if (assign(stripOffset_, offset)) { emit stripOffsetChanged(); }
}

}  // namespace nodetool::node_editor
