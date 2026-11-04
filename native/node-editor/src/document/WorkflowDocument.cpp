#include "WorkflowDocument.h"
#include "properties/PropertyFields.h"
#include <QJsonDocument>
#include <QJsonParseError>
#include <QSet>
#include <QPointF>
#include <QUuid>
#include <QUndoCommand>
#include <cmath>

namespace nodetool::node_editor {
namespace {
QString newId() { return QUuid::createUuid().toString(QUuid::Id128); }
EditResult success() { return {true, {}, {}}; }
EditResult failure(const QString& error) { return {false, error, {}}; }
int indexOf(const QJsonArray& values, const QString& id) {
    for (qsizetype i = 0; i < values.size(); ++i) {
        if (values[i].toObject().value("id").toString() == id) { return static_cast<int>(i); }
    }
    return -1;
}
bool validType(const QJsonValue& value, int depth = 0) {
    if (!value.isObject() || depth > 128) { return false; }
    const auto type = value.toObject();
    if (!type.value("type").isString() || type.value("type").toString().isEmpty()) { return false; }
    if (type.contains("optional") && !type.value("optional").isBool()) { return false; }
    if (type.contains("type_name") && !type.value("type_name").isNull() && !type.value("type_name").isString()) { return false; }
    if (type.contains("values") && !type.value("values").isNull()) {
        if (!type.value("values").isArray()) { return false; }
        for (const auto& v : type.value("values").toArray()) { if (!v.isString() && !v.isDouble()) { return false; } }
    }
    if (type.contains("type_args")) {
        if (!type.value("type_args").isArray()) { return false; }
        for (const auto& v : type.value("type_args").toArray()) { if (!validType(v, depth + 1)) { return false; } }
    }
    return true;
}
QString validate(const QJsonObject& workflow) {
    if (!workflow.value("graph").isObject()) { return "Workflow graph must be an object"; }
    const auto graph = workflow.value("graph").toObject();
    if (!graph.value("nodes").isArray() || !graph.value("edges").isArray()) { return "Graph nodes and edges must be arrays"; }
    QSet<QString> ids;
    for (const auto& value : graph.value("nodes").toArray()) {
        const auto node = value.toObject();
        const auto id = node.value("id").toString();
        if (!value.isObject() || id.isEmpty() || ids.contains(id) || !node.value("type").isString()) { return "Invalid or duplicate node ID/type"; }
        if (node.contains("dynamic_outputs")) {
            if (!node.value("dynamic_outputs").isObject()) { return "Dynamic outputs must be an object"; }
            const auto outputs = node.value("dynamic_outputs").toObject();
            for (auto it = outputs.begin(); it != outputs.end(); ++it) { if (!validType(it.value())) { return "Invalid dynamic output type metadata"; } }
        }
        ids.insert(id);
    }
    const auto checkConnections = [&](const QString& field, bool ports) -> QString {
        if (graph.contains(field) && !graph.value(field).isArray()) { return field + " must be an array"; }
        QSet<QString> edgeIds;
        for (const auto& value : graph.value(field).toArray()) {
            const auto edge = value.toObject();
            const auto id = edge.value("id").toString();
            if (!value.isObject() || !ids.contains(edge.value("source").toString()) || !ids.contains(edge.value("target").toString())) { return "Invalid " + field + " endpoint"; }
            if (!id.isEmpty() && edgeIds.contains(id)) { return "Duplicate " + field + " ID"; }
            edgeIds.insert(id);
            if (ports && (!edge.value("sourceHandle").isString() || !edge.value("targetHandle").isString())) { return "Edge requires named ports"; }
        }
        return {};
    };
    if (auto error = checkConnections("edges", true); !error.isEmpty()) { return error; }
    if (auto error = checkConnections("links", false); !error.isEmpty()) { return error; }
    QHash<QString, QString> parents;
    for (const auto& value : graph.value("nodes").toArray()) {
        const auto node = value.toObject();
        const auto parent = node.value("parent_id").toString();
        if (!parent.isEmpty() && !ids.contains(parent)) { return "Missing parent node"; }
        parents.insert(node.value("id").toString(), parent);
    }
    QSet<QString> complete;
    for (const auto& id : ids) {
        QSet<QString> path;
        auto current = id;
        while (!current.isEmpty() && !complete.contains(current)) {
            if (path.contains(current)) { return "Cyclic node parents"; }
            path.insert(current);
            current = parents.value(current);
        }
        complete.unite(path);
    }
    return {};
}
bool loopFeedback(const QJsonObject& node, const QString& handle) {
    return node.value("type") == "nodetool.control.Loop" && (handle == "next" || handle == "condition");
}
// Mirrors web TypeHandler.isConnectable, including its permissive union overlap.
bool connectable(const QJsonObject& source, const QJsonObject& target, int depth = 0) {
    if (depth > 128) { return false; }
    const auto a = source.value("type").toString(), b = target.value("type").toString();
    if (a.isEmpty() || b.isEmpty()) { return false; }
    if (a == "any" || b == "any") { return true; }
    if ((a == "cv" && b == "chunk") || (a == "chunk" && b == "cv")) { return true; }
    const auto aa = source.value("type_args").toArray(), ba = target.value("type_args").toArray();
    if (a != "list" && b == "list" && ba.size() == 1 && connectable(source, ba[0].toObject(), depth + 1)) { return true; }
    if (a == "union") {
        for (const auto& arg : aa) { if (connectable(arg.toObject(), target, depth + 1)) { return true; } }
        return false;
    }
    if (b == "union") {
        for (const auto& arg : ba) { if (connectable(source, arg.toObject(), depth + 1)) { return true; } }
        return false;
    }
    if (b == "object") {
        const QSet<QString> nonObjects{"str", "number", "boolean", "null", "enum", "list", "dict", "union", "tuple"};
        return !nonObjects.contains(a);
    }
    if (b == "enum") {
        return a == "str" || (a == "enum" && !source.value("type_name").toString().isEmpty()
            && source.value("type_name") == target.value("type_name"));
    }
    if (a == "enum") { return b == "str"; }
    if (a == "list") {
        return b == "list" && (aa.size() != 1 || ba.size() != 1 || connectable(aa[0].toObject(), ba[0].toObject(), depth + 1));
    }
    if (a == "dict") {
        if (b != "dict") { return false; }
        if (aa.size() < 2 || ba.size() < 2) { return true; }
        return aa.size() == 2 && ba.size() == 2
            && connectable(aa[0].toObject(), ba[0].toObject(), depth + 1)
            && connectable(aa[1].toObject(), ba[1].toObject(), depth + 1);
    }
    return a == b;
}
QJsonObject portType(const QJsonObject& node, const QString& handle, bool output,
                     const QHash<QString, QJsonObject>& metadata) {
    const auto type = node.value("type").toString();
    if (handle.isEmpty() || !metadata.contains(type)) { return {}; }
    for (const auto& value : metadata.value(type).value(output ? "outputs" : "properties").toArray()) {
        const auto port = value.toObject();
        if (port.value("name") == handle) { return port.value("type").toObject(); }
    }
    if (output) { return node.value("dynamic_outputs").toObject().value(handle).toObject(); }
    const auto inputs = node.value("dynamic_inputs").toObject();
    if (inputs.contains(handle)) {
        const auto declaration = inputs.value(handle).toObject();
        return declaration.value("type").isObject() ? declaration.value("type").toObject() : declaration;
    }
    if (node.value("dynamic_properties").toObject().contains(handle)
        && !node.value("dynamic_outputs").toObject().contains(handle)) { return {{"type", "any"}}; }
    return {};
}
QJsonObject endpointDefinition(QJsonObject node) {
    node.remove("ui_properties");
    node.remove("parent_id");
    return node;
}
bool preservesExistingEdge(const QJsonObject& workflow, const QJsonObject& fragment, const QJsonObject& edge) {
    const auto graph = workflow.value("graph").toObject();
    if (!graph.value("edges").toArray().contains(edge)) { return false; }
    const auto existing = graph.value("nodes").toArray(), pasted = fragment.value("nodes").toArray();
    for (const auto& field : {QStringLiteral("source"), QStringLiteral("target")}) {
        const auto id = edge.value(field).toString();
        const auto oldIndex = indexOf(existing, id), newIndex = indexOf(pasted, id);
        if (oldIndex < 0 || newIndex < 0 || endpointDefinition(existing[oldIndex].toObject()) != endpointDefinition(pasted[newIndex].toObject())) { return false; }
    }
    return true;
}
QString validateNewEdge(const QJsonArray& nodes, const QJsonArray& edges, const QJsonObject& edge,
                        const QHash<QString, QJsonObject>& metadata) {
    QHash<QString, QJsonObject> byId;
    for (const auto& value : nodes) { const auto n = value.toObject(); byId.insert(n.value("id").toString(), n); }
    const auto source = edge.value("source").toString(); const auto target = edge.value("target").toString();
    if (!byId.contains(source) || !byId.contains(target)) { return "Unknown connection endpoint"; }
    const auto sourceHandle = edge.value("sourceHandle").toString(), targetHandle = edge.value("targetHandle").toString();
    const bool control = edge.value("edge_type") == "control" || sourceHandle == "__control__" || targetHandle == "__control__";
    if (control) {
        if (edge.value("edge_type") != "control" || sourceHandle != "__control__" || targetHandle != "__control__"
            || !byId.value(source).value("type").toString().startsWith("nodetool.agents.")) { return "Invalid Agent control connection"; }
    } else {
        if (edge.contains("edge_type") && edge.value("edge_type") != "data") { return "Unsupported edge type"; }
        const auto output = portType(byId.value(source), sourceHandle, true, metadata);
        const auto input = portType(byId.value(target), targetHandle, false, metadata);
        if (!validType(output) || !validType(input)) { return "Unknown port or unavailable type metadata"; }
        if (!connectable(output, input)) { return "Incompatible port types"; }
    }
    if (source == target) { return "Self connections are unsupported"; }
    if (!control && loopFeedback(byId.value(target), edge.value("targetHandle").toString())) { return {}; }
    QHash<QString, QStringList> adjacency;
    for (const auto& value : edges) {
        const auto e = value.toObject();
        if (!loopFeedback(byId.value(e.value("target").toString()), e.value("targetHandle").toString())) {
            adjacency[e.value("source").toString()].append(e.value("target").toString());
        }
    }
    QStringList pending{target}; QSet<QString> visited;
    while (!pending.isEmpty()) {
        const auto id = pending.takeLast();
        if (id == source) { return "Connection creates a cycle"; }
        if (visited.contains(id)) { continue; }
        visited.insert(id); pending.append(adjacency.value(id));
    }
    return {};
}
EditResult edit(QJsonObject& workflow, const QJsonObject& command, const QHash<QString, QJsonObject>& metadata, int depth = 0) {
    if (depth > 64) { return failure("Command nesting limit exceeded"); }
    const auto op = command.value("op").toString();
    if (op == "batch") {
        if (!command.value("commands").isArray()) { return failure("Batch requires commands"); }
        EditResult result = success();
        for (const auto& child : command.value("commands").toArray()) {
            if (!child.isObject()) { return failure("Invalid batch command"); }
            auto applied = edit(workflow, child.toObject(), metadata, depth + 1);
            if (!applied) { return applied; }
            for (auto it = applied.idMap.begin(); it != applied.idMap.end(); ++it) { result.idMap.insert(it.key(), it.value()); }
        }
        return result;
    }
    auto graph = workflow.value("graph").toObject();
    auto nodes = graph.value("nodes").toArray();
    auto edges = graph.value("edges").toArray();
    auto links = graph.value("links").toArray();
    EditResult result = success();
    const auto id = command.value("id").toString();
    if (op == "addNode") {
        auto node = command.value("node").toObject();
        if (node.value("id").toString().isEmpty()) { node.insert("id", newId()); }
        if (indexOf(nodes, node.value("id").toString()) >= 0) { return failure("Node ID already exists"); }
        nodes.append(node);
    } else if (op == "addEdge") {
        auto edge = command.value("edge").toObject();
        if (edge.value("id").toString().isEmpty()) { edge.insert("id", newId()); }
        if (indexOf(edges, edge.value("id").toString()) >= 0) { return failure("Edge ID already exists"); }
        for (const auto& value : edges) {
            const auto existing = value.toObject();
            if (existing.value("source") == edge.value("source") && existing.value("target") == edge.value("target") && existing.value("sourceHandle") == edge.value("sourceHandle") && existing.value("targetHandle") == edge.value("targetHandle")) { return failure("Connection already exists"); }
        }
        if (edge.value("source") == edge.value("target")) { return failure("Self connections are unsupported"); }
        if (const auto error = validateNewEdge(nodes, edges, edge, metadata); !error.isEmpty()) { return failure(error); }
        edges.append(edge);
    } else if (op == "removeEdge") {
        const auto index = indexOf(edges, id);
        if (id.isEmpty() || index < 0) { return failure("Unknown edge ID"); }
        edges.removeAt(index);
    } else if (op == "removeNodes" || op == "setDisabled") {
        QSet<QString> selected;
        for (const auto& value : command.value("ids").toArray()) {
            if (!value.isString() || indexOf(nodes, value.toString()) < 0) { return failure("Unknown node ID"); }
            selected.insert(value.toString());
        }
        if (selected.isEmpty()) { return failure("Select at least one node"); }
        if (op == "removeNodes") {
            // Deleting a group deletes descendants, without flattening relative positions.
            QHash<QString, QStringList> children;
            for (const auto& value : nodes) { const auto n = value.toObject(); children[n.value("parent_id").toString()].append(n.value("id").toString()); }
            auto pending = selected.values();
            while (!pending.isEmpty()) {
                const auto parent = pending.takeLast();
                for (const auto& child : children.value(parent)) { if (!selected.contains(child)) { selected.insert(child); pending.append(child); } }
            }
            QJsonArray kept;
            for (const auto& value : nodes) { if (!selected.contains(value.toObject().value("id").toString())) { kept.append(value); } }
            nodes = kept;
            const auto prune = [&](const QJsonArray& values) { QJsonArray keptEdges; for (const auto& v : values) { const auto e = v.toObject(); if (!selected.contains(e.value("source").toString()) && !selected.contains(e.value("target").toString())) { keptEdges.append(v); } } return keptEdges; };
            edges = prune(edges); links = prune(links);
        } else {
            if (!command.value("disabled").isBool()) { return failure("Disabled must be boolean"); }
            for (qsizetype i = 0; i < nodes.size(); ++i) {
                auto n = nodes[i].toObject();
                if (selected.contains(n.value("id").toString())) {
                    if (n.contains("ui_properties") && !n.value("ui_properties").isObject() && !n.value("ui_properties").isNull()) { return failure("Unsupported UI properties"); }
                    auto ui = n.value("ui_properties").toObject(); ui.insert("bypassed", command.value("disabled")); n.insert("ui_properties", ui); nodes[i] = n;
                }
            }
        }
    } else if (op == "moveNodes") {
        if (!command.value("positions").isObject()) { return failure("Positions must be an object"); }
        const auto positions = command.value("positions").toObject();
        for (auto it = positions.begin(); it != positions.end(); ++it) {
            const auto index = indexOf(nodes, it.key()); const auto position = it.value().toObject();
            if (index < 0 || !position.value("x").isDouble() || !position.value("y").isDouble() || !std::isfinite(position.value("x").toDouble()) || !std::isfinite(position.value("y").toDouble())) { return failure("Invalid node position"); }
            auto n = nodes[index].toObject();
            if (n.contains("ui_properties") && !n.value("ui_properties").isObject() && !n.value("ui_properties").isNull()) { return failure("Unsupported UI properties"); }
            auto ui = n.value("ui_properties").toObject(); ui.insert("position", position); n.insert("ui_properties", ui); nodes[index] = n;
        }
    } else if (op == "addDynamicInput" || op == "renameDynamicInput" || op == "removeDynamicInput"
               || op == "addDynamicOutput" || op == "renameDynamicOutput" || op == "removeDynamicOutput") {
        const auto index = indexOf(nodes, id);
        if (index < 0) { return failure("Unknown node ID"); }
        auto n = nodes[index].toObject();
        const bool output = op.endsWith("Output"), adding = op.startsWith("add"), renaming = op.startsWith("rename");
        const auto definition = metadata.value(n.value("type").toString());
        if (!definition.value(output ? "supports_dynamic_outputs" : "supports_dynamic_inputs").toBool()) {
            return failure("Node metadata does not support editing these dynamic ports");
        }
        const auto field = output ? QStringLiteral("dynamic_outputs") : QStringLiteral("dynamic_inputs");
        for (const auto& container : {field, QStringLiteral("dynamic_properties")}) {
            if (n.contains(container) && !n.value(container).isObject()) { return failure("Unsupported dynamic port container"); }
        }
        auto ports = n.value(field).toObject(), values = n.value("dynamic_properties").toObject();
        for (auto it = ports.begin(); it != ports.end(); ++it) {
            const auto declaration = it.value().toObject();
            if (!validType(!output && declaration.value("type").isObject() ? declaration.value("type") : it.value())) {
                return failure("Unsupported dynamic port declaration");
            }
        }
        const auto name = command.value("name").toString();
        const auto newName = renaming ? command.value("newName").toString() : name;
        const auto validName = [](const QString& candidate) {
            if (candidate.isEmpty() || candidate.front().isDigit() || candidate != candidate.trimmed() || candidate.startsWith("__")
                || candidate == "prototype" || candidate == "constructor") { return false; }
            for (const auto character : candidate) { if (character.category() == QChar::Other_Control) { return false; } }
            return true;
        };
        if (!validName(name) || !validName(newName)) { return failure("Invalid or reserved port name"); }
        const auto exists = [&](const QString& candidate) { return ports.contains(candidate) || (!output && values.contains(candidate)); };
        const auto staticTaken = [&](const QString& candidate) {
            for (const auto& port : definition.value(output ? "outputs" : "properties").toArray()) {
                if (port.toObject().value("name") == candidate) { return true; }
            }
            return false;
        };
        if (!adding && (!exists(name) || staticTaken(name))) { return failure("Unknown dynamic port"); }
        if ((adding || (renaming && name != newName)) && (exists(newName) || staticTaken(newName))) {
            return failure("Port name already exists");
        }
        if (adding) {
            const auto type = command.value("type");
            if ((output || command.contains("type")) && (!validType(type) || type.toObject().value("type").toString().isEmpty())) {
                return failure("Invalid dynamic port type metadata");
            }
            if (!output && command.contains("type")) {
                const auto allowed = definition.value("allowed_dynamic_slot_types").toArray();
                const auto key = [](const QJsonObject& candidate) {
                    const auto args = candidate.value("type_args").toArray();
                    return candidate.value("type") == "list" && args.size() == 1
                        ? "list[" + args[0].toObject().value("type").toString() + "]" : candidate.value("type").toString();
                };
                bool permitted = allowed.isEmpty();
                for (const auto& candidate : allowed) { if (key(candidate.toObject()) == key(type.toObject())) { permitted = true; break; } }
                if (!permitted) { return failure("Dynamic input type is not allowed by node metadata"); }
            }
            if (output) { ports.insert(name, type); }
            else {
                QJsonValue value = QString();
                if (command.contains("type")) {
                    ports.insert(name, QJsonObject{{"type", type}});
                    const auto kind = type.toObject().value("type").toString();
                    if (kind == "int" || kind == "float" || kind == "number") { value = 0; }
                    else if (kind == "bool") { value = false; }
                    else if (kind == "list") { value = QJsonArray{}; }
                    else if (kind == "dict") { value = QJsonObject{}; }
                    else if (kind != "str" && kind != "text" && kind != "any") { value = QJsonValue::Null; }
                }
                if (command.contains("value")) {
                    value = command.value("value");
                    const auto error = validatePropertyValue(QJsonObject{{"type", command.contains("type") ? type : QJsonValue(QJsonObject{{"type", "any"}})}}, value);
                    if (!error.isEmpty()) { return failure(error); }
                }
                values.insert(name, value);
            }
        } else if (renaming) {
            if (name == newName) { return success(); }
            if (ports.contains(name)) { ports.insert(newName, ports.take(name)); }
            if (!output && values.contains(name)) { values.insert(newName, values.take(name)); }
        } else {
            ports.remove(name);
            if (!output) { values.remove(name); }
        }
        n.insert(field, ports);
        if (output && n.contains("dynamic_output_correlation")) {
            if (!n.value("dynamic_output_correlation").isObject()) { return failure("Unsupported dynamic output correlation"); }
            auto correlation = n.value("dynamic_output_correlation").toObject();
            if (!adding && correlation.contains(name)) {
                const auto entry = correlation.take(name);
                if (renaming) { correlation.insert(newName, entry); }
            }
            n.insert("dynamic_output_correlation", correlation);
        }
        if (!output) { n.insert("dynamic_properties", values); }
        nodes[index] = n;
        if (!adding) {
            QJsonArray updated;
            for (const auto& value : edges) {
                auto edge = value.toObject();
                const auto endpoint = output ? "source" : "target";
                const auto handle = output ? "sourceHandle" : "targetHandle";
                if (edge.value(endpoint) == id && edge.value(handle) == name) {
                    if (!renaming) { continue; }
                    edge.insert(handle, newName);
                }
                updated.append(edge);
            }
            edges = updated;
        }
    } else if (op == "setProperty" || op == "removeProperty" || op == "setNodeField") {
        const auto index = indexOf(nodes, id);
        if (index < 0) { return failure("Unknown node ID"); }
        auto n = nodes[index].toObject();
        if (op == "setProperty" || op == "removeProperty") {
            const auto name = command.value("name").toString();
            if (name.isEmpty() || (op == "setProperty" && !command.contains("value"))) { return failure("Property requires name and value"); }
            const auto rows = propertyFields(n, metadata.value(n.value("type").toString()), edges);
            QVariantMap row;
            for (const auto& v : rows) { if (v.toMap().value("name").toString() == name) { row = v.toMap(); break; } }
            if (row.isEmpty() || !row.value("editable").toBool()) { return failure("Property is connected or unsupported"); }
            const auto storage = row.value("storage").toString();
            if (command.contains("storage") && command.value("storage").toString() != storage) { return failure("Incorrect property storage"); }
            QJsonObject declaration;
            if (storage == "data") {
                for (const auto& v : metadata.value(n.value("type").toString()).value("properties").toArray()) {
                    if (v.toObject().value("name") == name) { declaration = v.toObject(); break; }
                }
            } else {
                const auto raw = n.value("dynamic_inputs").toObject().value(name);
                declaration = raw.isString() ? QJsonObject{{"type", QJsonObject{{"type", raw}}}} : raw.toObject();
            }
            if (op == "setProperty") {
                const auto error = validatePropertyValue(declaration, command.value("value"));
                if (!error.isEmpty()) { return failure(error); }
            } else if (declaration.value("required").toBool() && !declaration.contains("default")) { return failure("Required property has no default"); }
            if (n.contains(storage) && !n.value(storage).isObject()) { return failure("Unsupported property container"); }
            auto data = n.value(storage).toObject();
            if (op == "removeProperty") { data.remove(name); } else { data.insert(name, command.value("value")); }
            n.insert(storage, data);
        } else {
            const auto field = command.value("field").toString();
            const QSet<QString> allowed{"dynamic_properties", "dynamic_inputs", "dynamic_outputs", "dynamic_output_correlation", "ui_properties", "parent_id"};
            if (!allowed.contains(field) || !command.contains("value")) { return failure("Unsupported node field"); }
            const auto value = command.value("value");
            if (field == "parent_id") {
                if (!value.isNull() && !value.isString()) { return failure("Parent ID must be a string or null"); }
            } else if (!value.isObject()) { return failure("Node field must be an object"); }
            if (field == "dynamic_properties") {
                auto previous = n.value(field).toObject();
                const auto next = value.toObject();
                QSet<QString> keys;
                for (auto it = previous.begin(); it != previous.end(); ++it) { keys.insert(it.key()); }
                for (auto it = next.begin(); it != next.end(); ++it) { keys.insert(it.key()); }
                for (const auto& key : keys) {
                    if (previous.contains(key) == next.contains(key) && previous.value(key) == next.value(key)) { continue; }
                    QJsonObject nested{{"op", next.contains(key) ? "setProperty" : "removeProperty"}, {"id", id}, {"name", key}, {"storage", field}};
                    if (next.contains(key)) { nested.insert("value", next.value(key)); }
                    const auto checked = edit(workflow, nested, metadata, depth + 1);
                    if (!checked) { return checked; }
                }
            }
            n.insert(field, value);
        }
        nodes[index] = n;
    } else if (op == "paste") {
        const auto fragment = command.value("fragment").toObject();
        QJsonObject wrapped{{"graph", fragment}};
        if (const auto error = validate(wrapped); !error.isEmpty()) { return failure(error); }
        const auto fragmentEdges = fragment.value("edges").toArray();
        for (const auto& value : fragment.value("edges").toArray()) {
            const auto edge = value.toObject();
            if (!preservesExistingEdge(workflow, fragment, edge)) {
                QJsonArray others;
                bool skippedSelf = false;
                for (const auto& other : fragmentEdges) {
                    if (!skippedSelf && other == value) { skippedSelf = true; continue; }
                    const auto candidate = other.toObject();
                    if (candidate.value("source") == edge.value("source") && candidate.value("target") == edge.value("target")
                        && candidate.value("sourceHandle") == edge.value("sourceHandle") && candidate.value("targetHandle") == edge.value("targetHandle")) { return failure("Duplicate pasted connection"); }
                    others.append(other);
                }
                if (const auto error = validateNewEdge(fragment.value("nodes").toArray(), others, edge, metadata); !error.isEmpty()) { return failure(error); }
            }
        }
        for (const auto& value : fragment.value("nodes").toArray()) { result.idMap.insert(value.toObject().value("id").toString(), newId()); }
        const auto offset = command.value("offset").toObject();
        const auto dx = offset.value("x").toDouble(32); const auto dy = offset.value("y").toDouble(32);
        for (const auto& value : fragment.value("nodes").toArray()) {
            auto n = value.toObject(); n.insert("id", result.idMap.value(n.value("id").toString()));
            const auto parent = n.value("parent_id").toString();
            if (!parent.isEmpty()) { n.insert("parent_id", result.idMap.value(parent)); }
            if (parent.isEmpty()) {
                if (n.contains("ui_properties") && !n.value("ui_properties").isObject() && !n.value("ui_properties").isNull()) { return failure("Unsupported pasted geometry"); }
                auto ui = n.value("ui_properties").toObject(); auto p = ui.value("position").toObject();
                p.insert("x", p.value("x").toDouble() + dx); p.insert("y", p.value("y").toDouble() + dy); ui.insert("position", p); n.insert("ui_properties", ui);
            }
            nodes.append(n);
        }
        const auto remap = [&](const QJsonArray& values, QJsonArray& target) { for (const auto& value : values) { auto e = value.toObject(); e.insert("id", newId()); e.insert("source", result.idMap.value(e.value("source").toString())); e.insert("target", result.idMap.value(e.value("target").toString())); target.append(e); } };
        remap(fragment.value("edges").toArray(), edges); remap(fragment.value("links").toArray(), links);
    } else { return failure("Unsupported command: " + op); }
    graph.insert("nodes", nodes); graph.insert("edges", edges);
    if (graph.contains("links") || !links.isEmpty()) { graph.insert("links", links); }
    workflow.insert("graph", graph);
    if (const auto error = validate(workflow); !error.isEmpty()) { return failure(error); }
    return result;
}
}

class DocumentEdit final : public QUndoCommand {
public:
    DocumentEdit(WorkflowDocument& document, QJsonObject before, QJsonObject after, const QString& label)
        : QUndoCommand(label), document_(document), before_(std::move(before)), after_(std::move(after)) {}
    void undo() override { document_.restore(before_); }
    void redo() override { document_.restore(after_); }
private:
    WorkflowDocument& document_;
    QJsonObject before_, after_;
};
WorkflowDocument::WorkflowDocument(QObject* parent) : QObject(parent) {
    workflow_.insert("graph", QJsonObject{{"nodes", QJsonArray{}}, {"edges", QJsonArray{}}});
}
void WorkflowDocument::setNodeMetadata(const QJsonArray& metadata) {
    metadata_.clear();
    for (const auto& value : metadata) {
        const auto entry = value.toObject(); const auto type = entry.value("node_type").toString();
        if (!type.isEmpty()) { metadata_.insert(type, entry); }
    }
}
EditResult WorkflowDocument::load(const QJsonObject& workflow) {
    const auto error = validate(workflow);
    if (!workflow.value("graph").isObject()) { return failure(error); }
    undo_.clear(); workflow_ = workflow; readOnlyReason_ = error; emit changed();
    return success();
}
EditResult WorkflowDocument::loadJson(const QByteArray& json) {
    QJsonParseError error;
    const auto parsed = QJsonDocument::fromJson(json, &error);
    if (error.error != QJsonParseError::NoError || !parsed.isObject()) { return failure("Invalid workflow JSON: " + error.errorString()); }
    return load(parsed.object());
}
QJsonObject WorkflowDocument::graph() const { return workflow_.value("graph").toObject(); }
QJsonArray WorkflowDocument::nodes() const { return graph().value("nodes").toArray(); }
QJsonArray WorkflowDocument::edges() const { return graph().value("edges").toArray(); }
QJsonObject WorkflowDocument::node(const QString& id) const { const auto values = nodes(); const auto index = indexOf(values, id); return index < 0 ? QJsonObject{} : values[index].toObject(); }
void WorkflowDocument::reconcileMetadata(const QJsonObject& workflow) {
    auto updated = workflow;
    updated.insert("graph", graph());
    if (updated == workflow_) { return; }
    workflow_ = updated;
    emit changed();
}
void WorkflowDocument::restore(const QJsonObject& value) {
    // Undo belongs to the graph. Server identity and revisions outlive edits.
    workflow_.insert("graph", value.value("graph"));
    emit changed();
}
EditResult WorkflowDocument::applyCommand(const QJsonObject& command, const QString& label) {
    if (isReadOnly()) { return failure(readOnlyReason_); }
    auto candidate = workflow_;
    auto result = edit(candidate, command, metadata_);
    if (result && candidate != workflow_) { undo_.push(new DocumentEdit(*this, workflow_, candidate, label.isEmpty() ? command.value("op").toString() : label)); }
    return result;
}
QJsonObject WorkflowDocument::copy(const QStringList& ids) const {
    QSet<QString> selected(ids.begin(), ids.end());
    // Include descendants when copying a group.
    QHash<QString, QStringList> children;
    for (const auto& value : nodes()) { auto n = value.toObject(); children[n.value("parent_id").toString()].append(n.value("id").toString()); }
    auto pending = selected.values();
    while (!pending.isEmpty()) { const auto parent = pending.takeLast(); for (const auto& child : children.value(parent)) { if (!selected.contains(child)) { selected.insert(child); pending.append(child); } } }
    // Memoize absolute positions so nested selections cost O(nodes + ancestors).
    QHash<QString, QJsonObject> byId;
    QHash<QString, QPointF> absolute;
    for (const auto& value : nodes()) { const auto n = value.toObject(); byId.insert(n.value("id").toString(), n); }
    for (auto it = byId.cbegin(); it != byId.cend(); ++it) {
        QStringList path;
        QSet<QString> visiting;
        auto current = it.key();
        while (byId.contains(current) && !absolute.contains(current) && !visiting.contains(current)) {
            visiting.insert(current); path.append(current); current = byId.value(current).value("parent_id").toString();
        }
        auto position = absolute.value(current);
        while (!path.isEmpty()) {
            const auto id = path.takeLast();
            const auto p = byId.value(id).value("ui_properties").toObject().value("position").toObject();
            position += QPointF(p.value("x").toDouble(), p.value("y").toDouble()); absolute.insert(id, position);
        }
    }
    QJsonArray copied;
    for (const auto& value : nodes()) { auto n = value.toObject(); if (selected.contains(n.value("id").toString())) { if (!selected.contains(n.value("parent_id").toString())) { if (!n.value("parent_id").toString().isEmpty()) {
        auto ui = n.value("ui_properties").toObject(); auto p = ui.value("position").toObject();
        const auto position = absolute.value(n.value("id").toString());
        p.insert("x", position.x()); p.insert("y", position.y()); ui.insert("position", p); n.insert("ui_properties", ui);
    } n.remove("parent_id"); } copied.append(n); } }
    QJsonObject fragment{{"nodes", copied}};
    for (const auto& field : {QStringLiteral("edges"), QStringLiteral("links")}) { QJsonArray values; for (const auto& value : graph().value(field).toArray()) { auto e = value.toObject(); if (selected.contains(e.value("source").toString()) && selected.contains(e.value("target").toString())) { values.append(e); } } fragment.insert(field, values); }
    return fragment;
}
EditResult WorkflowDocument::duplicate(const QStringList& ids) { return applyCommand(QJsonObject{{"op", "paste"}, {"fragment", copy(ids)}}, "Duplicate nodes"); }
}
