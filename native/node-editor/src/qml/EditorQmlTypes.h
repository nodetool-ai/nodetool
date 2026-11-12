#pragma once
#include <QObject>
#include <QtQml/qqmlregistration.h>

#include "interfaces/NodeCatalog.h"
#include "server/PackSetup.h"

// The C++ interface types that NodeTool.NodeEditor components take as required
// properties. They live in node_editor_interfaces, outside the QML module, so a
// host or a test can link them without the editor. The owner creates each one,
// so QML cannot.
namespace nodetool::node_editor::qml {

struct NodeCatalogForeign {
    Q_GADGET
    QML_FOREIGN(nodetool::node_editor::NodeCatalog)
    QML_NAMED_ELEMENT(NodeCatalog)
    QML_UNCREATABLE("A NodeCatalog comes from its owner.")
};

struct PackSetupForeign {
    Q_GADGET
    QML_FOREIGN(nodetool::node_editor::PackSetup)
    QML_NAMED_ELEMENT(PackSetup)
    QML_UNCREATABLE("A PackSetup comes from its owner.")
};

}  // namespace nodetool::node_editor::qml
