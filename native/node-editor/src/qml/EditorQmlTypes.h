#pragma once
#include <QObject>
#include <QtQml/qqmlregistration.h>

#include "interfaces/DocumentTabs.h"
#include "interfaces/ExampleGallery.h"
#include "interfaces/GenerationActivity.h"
#include "interfaces/WorkerFleet.h"
#include "interfaces/GenerationRowsModel.h"
#include "interfaces/GenerationReplay.h"
#include "interfaces/NodeCatalog.h"
#include "interfaces/NodeInfo.h"
#include "interfaces/PriceChip.h"
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
#include "library/LibraryBrowser.h"
#include "server/ProjectFolder.h"
#include "interfaces/WorkflowHeader.h"
#include "interfaces/Notifications.h"
#include "interfaces/PropertyHost.h"
#include "server/PackSetup.h"
#include "nodetool/account/qt/AccountController.h"
#include "nodetool/account/qt/AccountServers.h"
#include "nodetool/account/qt/CloudBrowser.h"
#include "nodetool/account/qt/CloudDocument.h"
#include "nodetool/account/qt/ShareController.h"
#include "nodetool/account/qt/TransferController.h"

// The C++ interface types that NodeTool.NodeEditor components take as required
// properties. They live in node_editor_interfaces, outside the QML module, so a
// host or a test can link them without the editor. The owner creates each one,
// so QML cannot.
namespace nodetool::node_editor::qml {

struct AccountControllerForeign {
    Q_GADGET
    QML_FOREIGN(nodetool::account::qt::AccountController)
    QML_NAMED_ELEMENT(AccountController)
    QML_UNCREATABLE("An AccountController comes from its owner.")
};

struct AccountServersForeign {
    Q_GADGET
    QML_FOREIGN(nodetool::account::qt::AccountServers)
    QML_NAMED_ELEMENT(AccountServers)
    QML_UNCREATABLE("AccountServers comes from its owner.")
};

struct CloudBrowserForeign {
    Q_GADGET
    QML_FOREIGN(nodetool::account::qt::CloudBrowser)
    QML_NAMED_ELEMENT(CloudBrowser)
    QML_UNCREATABLE("A CloudBrowser comes from its owner.")
};

struct CloudDocumentListForeign {
    Q_GADGET
    QML_FOREIGN(nodetool::account::qt::CloudDocumentList)
    QML_NAMED_ELEMENT(CloudDocumentList)
    QML_UNCREATABLE("A CloudDocumentList comes from its CloudBrowser.")
};

struct CloudDocumentForeign {
    Q_GADGET
    QML_FOREIGN(nodetool::account::qt::CloudDocument)
    QML_NAMED_ELEMENT(CloudDocument)
    QML_UNCREATABLE("A CloudDocument comes from its owner.")
};

// The share dialog creates its own controller.
struct ShareControllerForeign {
    Q_GADGET
    QML_FOREIGN(nodetool::account::qt::ShareController)
    QML_NAMED_ELEMENT(ShareController)
};

// The transfer panel creates its own controller.
struct TransferControllerForeign {
    Q_GADGET
    QML_FOREIGN(nodetool::account::qt::TransferController)
    QML_NAMED_ELEMENT(TransferController)
};

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

struct NodeInfoForeign {
    Q_GADGET
    QML_FOREIGN(nodetool::node_editor::NodeInfo)
    QML_NAMED_ELEMENT(NodeInfo)
    QML_UNCREATABLE("A NodeInfo comes from its owner.")
};

struct PriceChipForeign {
    Q_GADGET
    QML_FOREIGN(nodetool::node_editor::PriceChip)
    QML_NAMED_ELEMENT(PriceChip)
    QML_UNCREATABLE("A PriceChip comes from its owner.")
};

struct PropertyHostForeign {
    Q_GADGET
    QML_FOREIGN(nodetool::node_editor::PropertyHost)
    QML_NAMED_ELEMENT(PropertyHost)
    QML_UNCREATABLE("A PropertyHost comes from its owner.")
};

struct ExampleGalleryForeign {
    Q_GADGET
    QML_FOREIGN(nodetool::node_editor::ExampleGallery)
    QML_NAMED_ELEMENT(ExampleGallery)
    QML_UNCREATABLE("An ExampleGallery comes from its owner.")
};

struct GenerationActivityForeign {
    Q_GADGET
    QML_FOREIGN(nodetool::node_editor::GenerationActivity)
    QML_NAMED_ELEMENT(GenerationActivity)
    QML_UNCREATABLE("A GenerationActivity comes from its owner.")
};

struct WorkerFleetForeign {
    Q_GADGET
    QML_FOREIGN(nodetool::node_editor::WorkerFleet)
    QML_NAMED_ELEMENT(WorkerFleet)
    QML_UNCREATABLE("A WorkerFleet comes from its owner.")
};

struct GenerationRowsModelForeign {
    Q_GADGET
    QML_FOREIGN(nodetool::node_editor::GenerationRowsModel)
    QML_NAMED_ELEMENT(GenerationRowsModel)
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

struct LibraryBrowserForeign {
    Q_GADGET
    QML_FOREIGN(nodetool::node_editor::LibraryBrowser)
    QML_NAMED_ELEMENT(LibraryBrowser)
    QML_UNCREATABLE("A LibraryBrowser comes from its owner.")
};

struct ProjectFolderForeign {
    Q_GADGET
    QML_FOREIGN(nodetool::node_editor::ProjectFolder)
    QML_NAMED_ELEMENT(ProjectFolder)
    QML_UNCREATABLE("A ProjectFolder comes from its owner.")
};

}  // namespace nodetool::node_editor::qml
