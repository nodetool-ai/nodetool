#include "DynamicPortsController.h"
#include <QSet>

namespace nodetool::node_editor {
DynamicPortsController::DynamicPortsController(WorkflowDocument* document, QObject* parent)
    : QObject(parent), document_(document) {
    if (document) {
        connect(document, &WorkflowDocument::changed, this, &DynamicPortsController::changed);
        connect(document, &QObject::destroyed, this, &DynamicPortsController::changed);
    }
}
void DynamicPortsController::setNodeMetadata(const QJsonArray& metadata) {
    metadata_.clear();
    for (const auto& value : metadata) { const auto entry = value.toObject(); metadata_.insert(entry.value("node_type").toString(), entry); }
    emit changed();
}
void DynamicPortsController::setSelectedNode(const QString& id) {
    if (id == selectedNode_) { return; }
    selectedNode_ = id; error_.clear(); emit changed();
}
QJsonObject DynamicPortsController::definition() const {
    return document_ ? metadata_.value(document_->node(selectedNode_).value("type").toString()) : QJsonObject{};
}
bool DynamicPortsController::supportsInputs() const { return definition().value("supports_dynamic_inputs").toBool(); }
bool DynamicPortsController::supportsOutputs() const { return definition().value("supports_dynamic_outputs").toBool(); }
bool DynamicPortsController::readOnly() const { return !document_ || document_->isReadOnly() || document_->node(selectedNode_).isEmpty(); }
QVariantList DynamicPortsController::rows(bool output) const {
    QVariantList result;
    if (!document_) { return result; }
    const auto node = document_->node(selectedNode_);
    auto ports = node.value(output ? "dynamic_outputs" : "dynamic_inputs").toObject();
    if (!output) {
        const auto values = node.value("dynamic_properties").toObject();
        for (auto it = values.begin(); it != values.end(); ++it) { if (!ports.contains(it.key())) { ports.insert(it.key(), QJsonObject{{"type", "any"}}); } }
    }
    QSet<QString> connected;
    for (const auto& value : document_->edges()) {
        const auto edge = value.toObject();
        if (edge.value(output ? "source" : "target") == selectedNode_) { connected.insert(edge.value(output ? "sourceHandle" : "targetHandle").toString()); }
    }
    // The web offers the type chip only on an unconnected input of a node whose
    // inputs the user owns (PropertyInput.tsx:530-535, dynamicSlotTypes.ts:88-111).
    const auto nodeType = node.value("type").toString();
    const auto data = node.value("data").toObject();
    const bool schemaDriven = nodeType.startsWith("fal.") || nodeType.startsWith("kie.") || nodeType.startsWith("replicate.") || nodeType.startsWith("comfy.")
        || nodeType == "nodetool.workflows.workflow_node.Workflow" || nodeType == "nodetool.workflows.subgraph.Subgraph"
        || data.contains("endpoint_id") || data.contains("model_id");
    for (auto it = ports.begin(); it != ports.end(); ++it) {
        const auto raw = it.value().isObject() ? it.value().toObject().value("type") : QJsonValue{};
        auto declared = raw.isObject() ? raw.toObject() : QJsonObject{{"type", raw.isString() ? raw.toString() : QString()}};
        if (output || it.value().isString()) { declared = it.value().isObject() ? it.value().toObject() : QJsonObject{{"type", it.value().toString()}}; }
        const auto type = declared.value("type").toString();
        const auto args = declared.value("type_args").toArray();
        const auto key = type == "list" && args.size() == 1 ? "list[" + args[0].toObject().value("type").toString() + "]" : type;
        const bool isConnected = connected.contains(it.key());
        result.append(QVariantMap{{"name", it.key()}, {"type", type.isEmpty() ? "any" : type}, {"typeKey", key.isEmpty() ? "any" : key},
                                  {"connected", isConnected}, {"retypable", !output && !isConnected && !schemaDriven}});
    }
    return result;
}
bool DynamicPortsController::apply(QJsonObject command) {
    if (readOnly()) { error_ = "Select an editable node"; emit changed(); return false; }
    command.insert("id", selectedNode_);
    const auto result = document_->applyCommand(command);
    error_ = result.error; emit changed(); return result.ok;
}
namespace {
QString typeKey(const QJsonObject& type) {
    const auto args = type.value("type_args").toArray();
    return type.value("type") == "list" && args.size() == 1 ? "list[" + args[0].toObject().value("type").toString() + "]" : type.value("type").toString();
}
QVariantMap option(const QJsonObject& type) {
    const auto key = typeKey(type);
    return {{"label", key}, {"value", key}, {"metadata", type.toVariantMap()}};
}
}
QVariantList DynamicPortsController::outputTypes() const {
    QVariantList result;
    for (const auto& name : {"bool", "int", "float", "str"}) { result.append(option(QJsonObject{{"type", name}, {"type_args", QJsonArray{}}, {"optional", false}})); }
    return result;
}
QVariantList DynamicPortsController::inputTypes() const {
    QVariantList result;
    const auto allowed = definition().value("allowed_dynamic_slot_types").toArray();
    if (!allowed.isEmpty()) {
        for (const auto& value : allowed) { if (value.isObject()) { result.append(option(value.toObject())); } }
        return result;
    }
    const QStringList base{"any", "str", "int", "float", "bool", "image", "audio", "video", "document", "dataframe"};
    for (const auto& name : base) { result.append(option(QJsonObject{{"type", name}, {"type_args", QJsonArray{}}, {"optional", false}})); }
    for (const auto& name : base) {
        if (name != "any") { result.append(option(QJsonObject{{"type", "list"}, {"type_args", QJsonArray{QJsonObject{{"type", name}}}}, {"optional", false}})); }
    }
    return result;
}
bool DynamicPortsController::addPort(bool output, const QString& name, const QString& type) {
    QJsonObject command{{"op", output ? "addDynamicOutput" : "addDynamicInput"}, {"name", name.trimmed()}};
    bool found = !output && type.isEmpty();
    for (const auto& entry : output ? outputTypes() : inputTypes()) {
        const auto row = entry.toMap();
        if (row.value("value").toString() == type) { command.insert("type", QJsonObject::fromVariantMap(row.value("metadata").toMap())); found = true; break; }
    }
    if (!found) { error_ = "Choose a supported port type"; emit changed(); return false; }
    return apply(command);
}
bool DynamicPortsController::renamePort(bool output, const QString& name, const QString& newName) {
    return apply({{"op", output ? "renameDynamicOutput" : "renameDynamicInput"}, {"name", name}, {"newName", newName.trimmed()}});
}
bool DynamicPortsController::setPortType(const QString& name, const QString& type) {
    for (const auto& entry : inputTypes()) {
        const auto row = entry.toMap();
        if (row.value("value").toString() == type) {
            return apply({{"op", "setDynamicInputType"}, {"name", name}, {"type", QJsonObject::fromVariantMap(row.value("metadata").toMap())}});
        }
    }
    error_ = "Choose a supported port type";
    emit changed();
    return false;
}
bool DynamicPortsController::removePort(bool output, const QString& name) {
    return apply({{"op", output ? "removeDynamicOutput" : "removeDynamicInput"}, {"name", name}});
}
void DynamicPortsController::clearError() { if (!error_.isEmpty()) { error_.clear(); emit changed(); } }
}
