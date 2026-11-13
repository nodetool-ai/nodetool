#pragma once
#include <QJsonArray>
#include <QJsonObject>
#include <QStringList>
#include <QString>
#include <functional>

namespace nodetool::node_editor {
// Whether running workflow from a Workflow node in hostId would reach hostId
// again, as createsWorkflowCycle in WorkflowLoader.helpers.ts. Follows each
// nested Workflow node through its stored copy and, for workflows open in a
// tab, through liveGraph, which returns an empty object for a closed one.
bool createsWorkflowCycle(const QString &hostId, const QJsonObject &workflow,
                          const std::function<QJsonObject(const QString &)> &liveGraph);

// The operation an App node runs: the stored operation when the app still has
// it, else the app's first workflow operation, as AppLoader.tsx picks it.
// Empty when the document has no workflow operation.
QJsonObject applicationOperation(const QJsonObject &document, const QString &storedOperationId);

// The application's document object. The server sends it as an object or as JSON text.
QJsonObject applicationDocument(const QJsonObject &application);

// The app_json copy an App node stores for application and its operation,
// with the operation's workflow graph.
QJsonObject applicationSnapshot(const QJsonObject &application, const QJsonObject &document,
                                const QJsonObject &operation, const QJsonObject &workflowGraph);
// The batch that loads a resolved ComfyUI workflow into a Run ComfyUI Workflow
// node, as ComfyWorkflowLoader's handleApply and replaceDynamicSlots: the
// prompt as the workflow property, the derived slots plus each exposed
// parameter, the values already typed into slots that remain, and the removal
// of edges on dynamic handles the new slots no longer declare. schema is the
// /api/comfy/resolve-workflow answer.
QJsonObject comfySchemaCommand(const QJsonObject &node, const QJsonArray &edges, const QJsonObject &schema,
                               const QStringList &exposedHandles);
// The dialog's summary line, as ComfyWorkflowLoader's summary.
QString comfySchemaSummary(const QJsonObject &schema);
} // namespace nodetool::node_editor
