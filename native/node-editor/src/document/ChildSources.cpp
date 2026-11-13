#include "ChildSources.h"
#include <QJsonArray>
#include <QCoreApplication>
#include <QJsonDocument>
#include <QSet>
#include <QVector>

namespace nodetool::node_editor {
namespace {
constexpr auto workflowNodeType = "nodetool.workflows.workflow_node.Workflow";

struct WorkflowRef {
    QString id;
    QJsonObject graph;
};

// The workflows a graph's Workflow nodes run, with the copy each one stores.
QVector<WorkflowRef> workflowNodeRefs(const QJsonObject &graph) {
    QJsonArray nodes = graph["nodes"].toArray();
    if (graph["nodes"].isObject()) {
        const auto object = graph["nodes"].toObject();
        for (auto it = object.begin(); it != object.end(); ++it) { nodes.append(it.value()); }
    }
    QVector<WorkflowRef> refs;
    for (const auto &value : nodes) {
        const auto node = value.toObject();
        if (node["type"].toString() != QLatin1String(workflowNodeType)) { continue; }
        auto data = node["data"].toObject();
        if (data["properties"].isObject()) { data = data["properties"].toObject(); }
        const auto json = data["workflow_json"].toObject();
        auto id = data["workflow_id"].toString();
        if (id.isEmpty()) { id = json["id"].toString(); }
        if (!id.isEmpty()) { refs.append({id, json["graph"].toObject()}); }
    }
    return refs;
}
} // namespace

bool createsWorkflowCycle(const QString &hostId, const QJsonObject &workflow,
                          const std::function<QJsonObject(const QString &)> &liveGraph) {
    const auto id = workflow["id"].toString();
    if (id == hostId) { return true; }
    // Stored copies are finite trees. Each open workflow is expanded once.
    QSet<QString> expanded{id};
    QVector<QJsonObject> pending{workflow["graph"].toObject()};
    while (!pending.isEmpty()) {
        const auto graph = pending.takeLast();
        for (const auto &ref : workflowNodeRefs(graph)) {
            if (ref.id == hostId) { return true; }
            pending.append(ref.graph);
            if (!expanded.contains(ref.id)) {
                expanded.insert(ref.id);
                if (liveGraph) { pending.append(liveGraph(ref.id)); }
            }
        }
    }
    return false;
}

QJsonObject applicationOperation(const QJsonObject &document, const QString &storedOperationId) {
    QJsonObject first;
    for (const auto &value : document["operations"].toArray()) {
        const auto operation = value.toObject();
        // workflowOperations in appNodeIO.ts keeps the operations that run a workflow.
        if (operation["workflowId"].toString().isEmpty()) { continue; }
        if (!storedOperationId.isEmpty() && operation["id"].toString() == storedOperationId) { return operation; }
        if (first.isEmpty()) { first = operation; }
    }
    return first;
}

QJsonObject applicationDocument(const QJsonObject &application) {
    const auto document = application["document"];
    if (document.isString()) { return QJsonDocument::fromJson(document.toString().toUtf8()).object(); }
    return document.toObject();
}

QJsonObject applicationSnapshot(const QJsonObject &application, const QJsonObject &document,
                                const QJsonObject &operation, const QJsonObject &workflowGraph) {
    // The fields openChild stores, with the graph the node derives its ports from.
    return {{"name", application["name"]},
            {"operation_id", operation["id"]},
            {"workflow_id", operation["workflowId"]},
            {"input_bindings", operation["inputs"]},
            {"variables", document["variables"]},
            {"constants", QJsonObject{}},
            {"graph", workflowGraph}};
}
QJsonObject comfySchemaCommand(const QJsonObject &node, const QJsonArray &edges, const QJsonObject &schema,
                               const QStringList &exposedHandles) {
    const auto id = node["id"].toString();
    auto inputs = schema["dynamic_inputs"].toObject();
    auto values = schema["dynamic_properties"].toObject();
    for (const auto &entry : schema["available_params"].toArray()) {
        const auto param = entry.toObject();
        const auto handle = param["handle"].toString();
        if (!exposedHandles.contains(handle)) { continue; }
        // paramToDynInput in web/src/utils/comfyDynamicSchema.ts.
        inputs[handle] = QJsonObject{{"type", QJsonObject{{"type", param["type"]}, {"optional", true}, {"type_args", QJsonArray{}}}},
                                     {"description", param["label"]},
                                     {"default", param["default"]}};
        values[handle] = param["default"];
    }
    // A value already edited on a slot that still exists is kept.
    const auto existing = node["dynamic_properties"].toObject();
    for (auto it = values.begin(); it != values.end(); ++it) {
        if (existing.contains(it.key())) { it.value() = existing.value(it.key()); }
    }
    const auto outputs = schema["dynamic_outputs"].toObject();
    QSet<QString> previousInputs, nextInputs;
    for (const auto *field : {"dynamic_inputs", "dynamic_properties"}) {
        const auto declared = node[field].toObject();
        for (auto it = declared.begin(); it != declared.end(); ++it) { previousInputs.insert(it.key()); }
    }
    for (auto it = inputs.begin(); it != inputs.end(); ++it) { nextInputs.insert(it.key()); }
    for (auto it = values.begin(); it != values.end(); ++it) { nextInputs.insert(it.key()); }
    const auto previousOutputs = node["dynamic_outputs"].toObject();
    QJsonArray commands;
    // Edges on removed slots go first, while their handles still exist.
    for (const auto &value : edges) {
        const auto edge = value.toObject();
        const auto targetHandle = edge["targetHandle"].toString();
        const auto sourceHandle = edge["sourceHandle"].toString();
        const bool staleInput = edge["target"].toString() == id && previousInputs.contains(targetHandle) && !nextInputs.contains(targetHandle);
        const bool staleOutput = edge["source"].toString() == id && previousOutputs.contains(sourceHandle) && !outputs.contains(sourceHandle);
        if (staleInput || staleOutput) { commands.append(QJsonObject{{"op", "removeEdge"}, {"id", edge["id"]}}); }
    }
    commands.append(QJsonObject{{"op", "setProperty"}, {"id", id}, {"name", "workflow"},
                                {"value", QString::fromUtf8(QJsonDocument(schema["prompt"].toObject()).toJson(QJsonDocument::Compact))}});
    // Each value is checked against its slot's declaration, so the old and new
    // declarations stand while the values change, then the old ones go.
    auto declared = node["dynamic_inputs"].toObject();
    for (auto it = inputs.begin(); it != inputs.end(); ++it) { declared[it.key()] = it.value(); }
    commands.append(QJsonObject{{"op", "setNodeField"}, {"id", id}, {"field", "dynamic_inputs"}, {"value", declared}});
    commands.append(QJsonObject{{"op", "setNodeField"}, {"id", id}, {"field", "dynamic_properties"}, {"value", values}});
    commands.append(QJsonObject{{"op", "setNodeField"}, {"id", id}, {"field", "dynamic_inputs"}, {"value", inputs}});
    commands.append(QJsonObject{{"op", "setNodeField"}, {"id", id}, {"field", "dynamic_outputs"}, {"value", outputs}});
    return {{"op", "batch"}, {"commands", commands}};
}

QString comfySchemaSummary(const QJsonObject &schema) {
    const auto count = [](const QJsonValue &value) { return int(value.toObject().size()); };
    const auto inputs = count(schema["dynamic_inputs"]);
    const auto outputs = count(schema["dynamic_outputs"]);
    const auto nodes = count(schema["prompt"]);
    const auto tr = [](const char *text, int n) { return QCoreApplication::translate("ComfyWorkflowLoader", text, nullptr, n); };
    auto summary = (nodes == 1 ? tr("%n node", nodes) : tr("%n nodes", nodes));
    summary += QStringLiteral(" · ") + (inputs == 1 ? tr("%n typed input", inputs) : tr("%n typed inputs", inputs));
    if (schema["app_mode_inputs"].toBool()) { summary += QStringLiteral(" ") + QCoreApplication::translate("ComfyWorkflowLoader", "from App Mode"); }
    summary += QStringLiteral(" · ") + (outputs == 1 ? tr("%n output", outputs) : tr("%n outputs", outputs));
    return summary;
}
} // namespace nodetool::node_editor
