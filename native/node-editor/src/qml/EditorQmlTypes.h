#pragma once
#include <QObject>
#include <QtQml/qqmlregistration.h>

#include "interfaces/DocumentTabs.h"
#include "interfaces/GenerationReplay.h"
#include "interfaces/NodeCatalog.h"
#include "interfaces/NodeInspector.h"
#include "interfaces/PanelLayout.h"
#include "interfaces/StatusModel.h"
#include "interfaces/EditorCommands.h"
#include "interfaces/Selection.h"
#include "interfaces/RunState.h"
#include "interfaces/Viewport.h"
#include "interfaces/FirstWorkflowGuide.h"
#include "interfaces/ChatWindow.h"
#include "server/WorkflowBrowser.h"
#include "interfaces/WorkflowHeader.h"
#include "interfaces/Notifications.h"
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

struct DocumentTabsForeign {
    Q_GADGET
    QML_FOREIGN(nodetool::node_editor::DocumentTabs)
    QML_NAMED_ELEMENT(DocumentTabs)
    QML_UNCREATABLE("A DocumentTabs comes from its owner.")
};

struct NotificationsForeign {
    Q_GADGET
    QML_FOREIGN(nodetool::node_editor::Notifications)
    QML_NAMED_ELEMENT(Notifications)
    QML_UNCREATABLE("A Notifications comes from its owner.")
};

struct WorkflowHeaderForeign {
    Q_GADGET
    QML_FOREIGN(nodetool::node_editor::WorkflowHeader)
    QML_NAMED_ELEMENT(WorkflowHeader)
    QML_UNCREATABLE("A WorkflowHeader comes from its owner.")
};

struct PanelLayoutForeign {
    Q_GADGET
    QML_FOREIGN(nodetool::node_editor::PanelLayout)
    QML_NAMED_ELEMENT(PanelLayout)
    QML_UNCREATABLE("A PanelLayout comes from its owner.")
};

struct StatusModelForeign {
    Q_GADGET
    QML_FOREIGN(nodetool::node_editor::StatusModel)
    QML_NAMED_ELEMENT(StatusModel)
    QML_UNCREATABLE("A StatusModel comes from its owner.")
};

struct EditorCommandsForeign {
    Q_GADGET
    QML_FOREIGN(nodetool::node_editor::EditorCommands)
    QML_NAMED_ELEMENT(EditorCommands)
    QML_UNCREATABLE("An EditorCommands comes from its owner.")
};

struct SelectionForeign {
    Q_GADGET
    QML_FOREIGN(nodetool::node_editor::Selection)
    QML_NAMED_ELEMENT(Selection)
    QML_UNCREATABLE("A Selection comes from its owner.")
};

struct RunStateForeign {
    Q_GADGET
    QML_FOREIGN(nodetool::node_editor::RunState)
    QML_NAMED_ELEMENT(RunState)
    QML_UNCREATABLE("A RunState comes from its owner.")
};

struct ViewportForeign {
    Q_GADGET
    QML_FOREIGN(nodetool::node_editor::Viewport)
    QML_NAMED_ELEMENT(Viewport)
    QML_UNCREATABLE("A Viewport comes from its owner.")
};

struct FirstWorkflowGuideForeign {
    Q_GADGET
    QML_FOREIGN(nodetool::node_editor::FirstWorkflowGuide)
    QML_NAMED_ELEMENT(FirstWorkflowGuide)
    QML_UNCREATABLE("A FirstWorkflowGuide comes from its owner.")
};

struct ChatWindowForeign {
    Q_GADGET
    QML_FOREIGN(nodetool::node_editor::ChatWindow)
    QML_NAMED_ELEMENT(ChatWindow)
    QML_UNCREATABLE("A ChatWindow comes from its owner.")
};

// WorkflowBrowser.qml already names the panel, so the model takes another name.
struct WorkflowBrowserForeign {
    Q_GADGET
    QML_FOREIGN(nodetool::node_editor::WorkflowBrowser)
    QML_NAMED_ELEMENT(WorkflowBrowserModel)
    QML_UNCREATABLE("A WorkflowBrowserModel comes from its owner.")
};

}  // namespace nodetool::node_editor::qml
