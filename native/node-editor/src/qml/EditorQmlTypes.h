#pragma once
#include <QObject>
#include <QtQml/qqmlregistration.h>

#include "interfaces/GenerationReplay.h"
#include "interfaces/NodeCatalog.h"
#include "interfaces/NodeInspector.h"
#include "interfaces/PropertyHost.h"
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

struct NodeInspectorForeign {
    Q_GADGET
    QML_FOREIGN(nodetool::node_editor::NodeInspector)
    QML_NAMED_ELEMENT(NodeInspector)
    QML_UNCREATABLE("A NodeInspector comes from its owner.")
};

struct PropertyHostForeign {
    Q_GADGET
    QML_FOREIGN(nodetool::node_editor::PropertyHost)
    QML_NAMED_ELEMENT(PropertyHost)
    QML_UNCREATABLE("A PropertyHost comes from its owner.")
};

struct GenerationReplayForeign {
    Q_GADGET
    QML_FOREIGN(nodetool::node_editor::GenerationReplay)
    QML_NAMED_ELEMENT(GenerationReplay)
    QML_UNCREATABLE("A GenerationReplay comes from its owner.")
};

}  // namespace nodetool::node_editor::qml
