#include "properties/CodeInference.h"
#include "WorkflowDocument.h"
#include "ChildPorts.h"
#include "ConnectionTypes.h"
#include "properties/PropertyFields.h"
#include <QJsonDocument>
#include <QCollator>
#include <QLocale>
#include <QJsonParseError>
#include <QSet>
#include <QRegularExpression>
#include <QPointF>
#include <QUuid>
#include <QUndoCommand>
#include <cmath>
#include <algorithm>
#include <limits>

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
constexpr auto groupType = "nodetool.workflows.base_node.Group";
constexpr auto commentType = "nodetool.workflows.base_node.Comment";
bool isGroup(const QJsonObject& node) {
    return node.value("type") == groupType || node.value("type") == "nodetool.workflows.Group";
}
bool isComment(const QJsonObject& node) {
    return node.value("type") == commentType || node.value("type") == "nodetool.workflows.Comment";
}
QPointF positionOf(const QJsonObject& node) {
    const auto position = node.value("ui_properties").toObject().value("position").toObject();
    return {position.value("x").toDouble(), position.value("y").toDouble()};
}
bool editableGeometry(const QJsonObject& node) {
    const auto ui = node.value("ui_properties");
    if (!ui.isUndefined() && !ui.isNull() && !ui.isObject()) { return false; }
    const auto position = ui.toObject().value("position");
    return position.isUndefined() || position.isNull() || position.isObject();
}
void setPosition(QJsonObject& node, const QPointF& position) {
    auto ui = node.value("ui_properties").toObject();
    auto stored = ui.value("position").toObject();
    stored.insert("x", position.x()); stored.insert("y", position.y());
    ui.insert("position", stored); node.insert("ui_properties", ui);
}
// Iterative memoization handles deep imported hierarchies without recursion or
// repeatedly walking each node's ancestors. validate() has rejected cycles.
QHash<QString, QPointF> absolutePositions(const QJsonArray& nodes, const QJsonObject& targets = {}) {
    QHash<QString, QJsonObject> byId;
    QHash<QString, QPointF> absolute;
    for (const auto& value : nodes) {
        const auto node = value.toObject(); byId.insert(node.value("id").toString(), node);
    }
    for (auto it = byId.cbegin(); it != byId.cend(); ++it) {
        QStringList path;
        auto current = it.key();
        while (byId.contains(current) && !absolute.contains(current)) {
            path.append(current); current = byId.value(current).value("parent_id").toString();
        }
        auto position = absolute.value(current);
        while (!path.isEmpty()) {
            const auto id = path.takeLast();
            if (targets.contains(id)) { const auto target = targets.value(id).toObject(); position = QPointF(target.value("x").toDouble(), target.value("y").toDouble()); }
            else { position += positionOf(byId.value(id)); }
            absolute.insert(id, position);
        }
    }
    return absolute;
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
            if (field == "links") {
                if (id.isEmpty()) { return "Link requires a nonempty ID"; }
                for (const auto& member : {QStringLiteral("label"), QStringLiteral("kind")}) {
                    const auto entry = edge.value(member);
                    if (!entry.isUndefined() && !entry.isNull() && !entry.isString()) { return "Link label and kind must be strings or null"; }
                }
            }
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

QJsonObject portType(const QJsonObject& rawNode, const QString& handle, bool output,
                     const QHash<QString, QJsonObject>& metadata) {
    QJsonArray catalog;
    for (const auto &entry : metadata) { catalog.append(entry); }
    const auto node = withChildPorts(withVisibleCodePorts(rawNode), catalog);
    const auto type = node.value("type").toString();
    if (handle.isEmpty() || !metadata.contains(type)) { return {}; }
    for (const auto& value : metadata.value(type).value(output ? "outputs" : "properties").toArray()) {
        const auto port = value.toObject();
        if (port.value("name") == handle) { return port.value("type").toObject(); }
    }
    if (output) { return normalizedDynamicPortType(node.value("dynamic_outputs").toObject().value(handle)); }
    const auto inputs = node.value("dynamic_inputs").toObject();
    if (inputs.contains(handle)) {
        return normalizedDynamicPortType(inputs.value(handle));
    }
    if (node.value("dynamic_properties").toObject().contains(handle)
        && (node["type"] == "nodetool.code.Code" || !node.value("dynamic_outputs").toObject().contains(handle))) { return {{"type", "any"}}; }
    return {};
}
bool emptyModelProperty(const QJsonValue& value) {
    if (value.isUndefined() || value.isNull()) { return true; }
    if (value.isBool()) { return !value.toBool(); }
    if (value.isDouble()) { return value.toDouble() == 0; }
    if (value.isString()) { return value.toString().isEmpty(); }
    if (!value.isObject()) { return false; }
    const auto model = value.toObject();
    return model.value("provider") == "empty" || model.value("provider") == "" || model.value("id") == "";
}
QJsonObject withPropertyDefaults(QJsonObject node, const QJsonObject& defaults) {
    if (node.isEmpty()) { return node; }
    if (node.contains("data") && !node.value("data").isObject()) { return node; }
    auto data = node.value("data").toObject();
    bool changed = false;
    for (auto property = defaults.cbegin(); property != defaults.cend(); ++property) {
        if (emptyModelProperty(data.value(property.key())) && !emptyModelProperty(property.value())) {
            data.insert(property.key(), property.value());
            changed = true;
        }
    }
    if (changed) { node.insert("data", data); }
    return node;
}
void applyGraphDefaults(QJsonObject& workflow, const QHash<QString, QJsonObject>& defaults) {
    auto graph = workflow.value("graph").toObject();
    auto nodes = graph.value("nodes").toArray();
    for (qsizetype i = 0; i < nodes.size(); ++i) {
        const auto node = nodes.at(i).toObject();
        const auto found = defaults.constFind(node.value("id").toString());
        if (found != defaults.cend()) { nodes[i] = withPropertyDefaults(node, *found); }
    }
    graph.insert("nodes", nodes);
    workflow.insert("graph", graph);
}
QJsonObject endpointDefinition(QJsonObject node) {
    node.remove("ui_properties");
    node.remove("parent_id");
    return node;
}
QString validateEdgeEndpoints(const QHash<QString, QJsonObject>& byId, const QJsonObject& edge,
                              const QHash<QString, QJsonObject>& metadata) {
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
        if (!connectionTypesCompatible(output, input)) { return "Incompatible port types"; }
    }
    if (source == target) { return "Self connections are unsupported"; }
    return {};
}
QString validateNewEdge(const QJsonArray& nodes, const QJsonArray& edges, const QJsonObject& edge,
                        const QHash<QString, QJsonObject>& metadata) {
    QHash<QString, QJsonObject> byId;
    for (const auto& value : nodes) { const auto n = value.toObject(); byId.insert(n.value("id").toString(), n); }
    if (const auto error = validateEdgeEndpoints(byId, edge, metadata); !error.isEmpty()) { return error; }
    const auto source = edge.value("source").toString(), target = edge.value("target").toString();
    const bool control = edge.value("edge_type") == "control" || edge.value("sourceHandle") == "__control__" || edge.value("targetHandle") == "__control__";
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
// NodeStore.addEdge: a list input of one concrete type collects every wire that
// lands on it. Any other handle keeps only the newest. Web isCollectType
// excludes list[any], bare lists and unions. Control handles are separate.
bool collectsEdges(const QJsonArray& nodes, const QJsonObject& edge, const QHash<QString, QJsonObject>& metadata) {
    const auto targetHandle = edge.value("targetHandle").toString();
    if (edge.value("edge_type") == "control" || edge.value("sourceHandle") == "__control__" || targetHandle == "__control__") { return true; }
    const auto targetIndex = indexOf(nodes, edge.value("target").toString());
    if (targetIndex < 0) { return true; }
    const auto input = portType(nodes[targetIndex].toObject(), targetHandle, false, metadata);
    const auto arguments = input.value("type_args").toArray();
    return input.value("type") == "list" && arguments.size() == 1 && arguments.first().toObject().value("type") != "any";
}
QByteArray connectionKey(const QJsonObject& edge) {
    return QJsonDocument(QJsonArray{edge.value("source"), edge.value("target"),
        edge.value("sourceHandle"), edge.value("targetHandle")}).toJson(QJsonDocument::Compact);
}
// A single SCC pass answers every pasted edge's cycle query, including paths
// through preserved imported edges. Feedback inputs do not form cycle paths.
QHash<QString, int> connectionComponents(const QHash<QString, QJsonObject>& nodes,
                                         const QJsonArray& edges) {
    QHash<QString, QStringList> forward, reverse;
    for (const auto& value : edges) {
        const auto edge = value.toObject();
        const auto source = edge.value("source").toString(), target = edge.value("target").toString();
        if (loopFeedback(nodes.value(target), edge.value("targetHandle").toString())) { continue; }
        forward[source].append(target);
        reverse[target].append(source);
    }
    QSet<QString> visited;
    QStringList order;
    struct Frame { QString id; qsizetype next = 0; };
    for (auto node = nodes.cbegin(); node != nodes.cend(); ++node) {
        if (visited.contains(node.key())) { continue; }
        std::vector<Frame> stack{{node.key()}};
        visited.insert(node.key());
        while (!stack.empty()) {
            auto& frame = stack.back();
            const auto adjacent = forward.constFind(frame.id);
            if (adjacent != forward.cend() && frame.next < adjacent->size()) {
                const auto next = adjacent->at(frame.next++);
                if (!visited.contains(next)) { visited.insert(next); stack.push_back({next}); }
            } else { order.append(frame.id); stack.pop_back(); }
        }
    }
    QHash<QString, int> components;
    int component = 0;
    while (!order.isEmpty()) {
        const auto root = order.takeLast();
        if (components.contains(root)) { continue; }
        QStringList pending{root};
        components.insert(root, component);
        while (!pending.isEmpty()) {
            const auto id = pending.takeLast();
            for (const auto& next : reverse.value(id)) {
                if (!components.contains(next)) { components.insert(next, component); pending.append(next); }
            }
        }
        ++component;
    }
    return components;
}
QString validatePastedEdges(const QJsonObject& workflow, const QJsonObject& fragment,
                            const QHash<QString, QJsonObject>& metadata) {
    QHash<QString, QJsonObject> originalNodes, pastedNodes;
    const auto graph = workflow.value("graph").toObject();
    for (const auto& value : graph.value("nodes").toArray()) {
        const auto node = value.toObject();
        originalNodes.insert(node.value("id").toString(), endpointDefinition(node));
    }
    QSet<QString> unchanged;
    for (const auto& value : fragment.value("nodes").toArray()) {
        const auto node = value.toObject();
        const auto id = node.value("id").toString();
        pastedNodes.insert(id, node);
        if (originalNodes.contains(id) && originalNodes.value(id) == endpointDefinition(node)) { unchanged.insert(id); }
    }
    QSet<QByteArray> originalEdges;
    for (const auto& value : graph.value("edges").toArray()) {
        originalEdges.insert(QJsonDocument(value.toObject()).toJson(QJsonDocument::Compact));
    }
    const auto edges = fragment.value("edges").toArray();
    QHash<QByteArray, int> duplicates;
    for (const auto& value : edges) { ++duplicates[connectionKey(value.toObject())]; }
    const auto components = connectionComponents(pastedNodes, edges);
    for (const auto& value : edges) {
        const auto edge = value.toObject();
        const auto source = edge.value("source").toString(), target = edge.value("target").toString();
        if (unchanged.contains(source) && unchanged.contains(target)
            && originalEdges.contains(QJsonDocument(edge).toJson(QJsonDocument::Compact))) { continue; }
        if (duplicates.value(connectionKey(edge)) > 1) { return "Duplicate pasted connection"; }
        if (const auto error = validateEdgeEndpoints(pastedNodes, edge, metadata); !error.isEmpty()) { return error; }
        if (!loopFeedback(pastedNodes.value(target), edge.value("targetHandle").toString())
            && components.value(source) == components.value(target)) { return "Connection creates a cycle"; }
    }
    return {};
}
// NodeStore.addEdge: a wire into a property that the card does not show adds it to
// `exposed_inputs`, so its handle stays after a disconnect. Metadata handles,
// dynamic slots and the control handle have their own surfaces.
bool exposeConnectedInput(QJsonObject& node, const QString& handle, const QHash<QString, QJsonObject>& metadata) {
    const auto definition = metadata.value(node.value("type").toString());
    if (definition.isEmpty() || handle.isEmpty() || handle == "__control__") { return false; }
    if (definition.value("inline_fields").toArray().contains(handle) || definition.value("input_fields").toArray().contains(handle)) { return false; }
    if (node.value("dynamic_properties").toObject().contains(handle) || node.value("dynamic_inputs").toObject().contains(handle)) { return false; }
    bool declared = false;
    for (const auto& value : definition.value("properties").toArray()) { declared = declared || value.toObject().value("name").toString() == handle; }
    if (!declared) { return false; }
    auto ui = node.value("ui_properties").toObject();
    auto exposed = ui.value("exposed_inputs").toArray();
    if (exposed.contains(handle)) { return false; }
    exposed.append(handle);
    ui.insert("exposed_inputs", exposed);
    node.insert("ui_properties", ui);
    return true;
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
    if (op == "replaceGraph") {
        auto candidate = workflow;
        candidate.insert("graph", command.value("graph"));
        const auto error = validate(candidate);
        if (!error.isEmpty()) { return failure(error); }
        workflow = candidate;
        return success();
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
    } else if (op == "groupNodes" || op == "ungroupNodes" || op == "detachNodes") {
        QHash<QString, int> indices;
        for (qsizetype i = 0; i < nodes.size(); ++i) { indices.insert(nodes[i].toObject().value("id").toString(), static_cast<int>(i)); }
        QSet<QString> selected;
        for (const auto& value : command.value("ids").toArray()) {
            if (!value.isString() || !indices.contains(value.toString())) { return failure("Unknown node ID"); }
            selected.insert(value.toString());
        }
        if (selected.isEmpty()) { return failure("Select at least one node"); }
        const auto absolute = absolutePositions(nodes);
        if (op == "groupNodes") {
            if (command.contains("sizes") && !command.value("sizes").isObject()) { return failure("Group sizes must be an object"); }
            const auto sizes = command.value("sizes").toObject();
            const auto validDimension = [](const QJsonValue& dimension) {
                return dimension.isDouble() && std::isfinite(dimension.toDouble()) && dimension.toDouble() > 0;
            };
            for (auto it = sizes.begin(); it != sizes.end(); ++it) {
                const auto size = it.value().toObject();
                if (!indices.contains(it.key()) || !validDimension(size.value("width")) || !validDimension(size.value("height"))) {
                    return failure("Group sizes require known nodes and finite positive dimensions");
                }
            }
            // Keep only selected roots. An already selected ancestor carries its
            // descendants, even when that ancestor is several levels above.
            QHash<QString, bool> beneathSelection;
            for (const auto& selectedId : selected) {
                QStringList path;
                auto current = nodes[indices.value(selectedId)].toObject().value("parent_id").toString();
                while (!current.isEmpty() && !selected.contains(current) && !beneathSelection.contains(current)) {
                    path.append(current); current = nodes[indices.value(current)].toObject().value("parent_id").toString();
                }
                const bool beneath = selected.contains(current) || beneathSelection.value(current);
                for (const auto& ancestor : path) { beneathSelection.insert(ancestor, beneath); }
                beneathSelection.insert(selectedId, beneath);
            }
            QSet<QString> roots;
            constexpr auto infinity = std::numeric_limits<double>::infinity();
            double left = infinity, top = infinity, right = -infinity, bottom = -infinity;
            for (const auto& selectedId : selected) {
                if (beneathSelection.value(selectedId)) { continue; }
                if (!editableGeometry(nodes[indices.value(selectedId)].toObject())) { return failure("Unsupported node geometry"); }
                roots.insert(selectedId);
                const auto position = absolute.value(selectedId);
                const auto node = nodes[indices.value(selectedId)].toObject();
                const auto ui = node.value("ui_properties").toObject();
                const bool comment = node.value("type") == commentType || node.value("type") == "nodetool.workflows.Comment";
                // The host supplies rendered card bounds, including dynamic
                // properties. Headless callers use authored dimensions or the
                // same fallback footprint as native layout.
                const auto measured = sizes.value(selectedId).toObject();
                const auto width = measured.contains("width") ? measured.value("width").toDouble()
                    : validDimension(ui.value("width")) ? ui.value("width").toDouble() : isGroup(node) ? 400.0 : comment ? 300.0 : 280.0;
                const auto height = measured.contains("height") ? measured.value("height").toDouble()
                    : validDimension(ui.value("height")) ? ui.value("height").toDouble() : isGroup(node) ? 300.0 : comment ? 160.0 : 100.0;
                left = std::min(left, position.x()); top = std::min(top, position.y());
                right = std::max(right, position.x() + width + 40);
                bottom = std::max(bottom, position.y() + height + 50);
            }
            const auto groupId = id.isEmpty() ? newId() : id;
            if (indices.contains(groupId)) { return failure("Node ID already exists"); }
            const auto title = command.value("title").toString("Group");
            QJsonObject group{{"id", groupId}, {"type", groupType}, {"data", QJsonObject{{"headline", title}}},
                {"ui_properties", QJsonObject{{"title", title}, {"width", std::max(right - left + 40, 200.0)}, {"height", std::max(bottom - top + 40, 200.0)}}}};
            const QPointF origin(left - 20, top - 50);
            setPosition(group, origin);
            QJsonArray updated{group};
            for (const auto& value : nodes) {
                auto node = value.toObject(); const auto nodeId = node.value("id").toString();
                if (roots.contains(nodeId)) { node.insert("parent_id", groupId); setPosition(node, absolute.value(nodeId) - origin); }
                updated.append(node);
            }
            nodes = updated; result.idMap.insert("group", groupId);
        } else if (op == "detachNodes") {
            for (qsizetype i = 0; i < nodes.size(); ++i) {
                auto node = nodes[i].toObject(); const auto nodeId = node.value("id").toString();
                if (selected.contains(nodeId) && !node.value("parent_id").toString().isEmpty()) {
                    if (!editableGeometry(node)) { return failure("Unsupported node geometry"); }
                    node.remove("parent_id"); setPosition(node, absolute.value(nodeId)); nodes[i] = node;
                }
            }
        } else {
            for (const auto& selectedId : selected) { if (!isGroup(nodes[indices.value(selectedId)].toObject())) { return failure("Ungroup requires group nodes"); } }
            // Resolve promoted parents once per removed frame, including chains
            // of selected nested frames, to keep the operation linear.
            QHash<QString, QString> promotedParents;
            for (const auto& selectedId : selected) {
                QStringList path; auto current = selectedId;
                while (selected.contains(current) && !promotedParents.contains(current)) {
                    path.append(current); current = nodes[indices.value(current)].toObject().value("parent_id").toString();
                }
                const auto parent = promotedParents.contains(current) ? promotedParents.value(current) : current;
                for (const auto& frame : path) { promotedParents.insert(frame, parent); }
            }
            QJsonArray updated;
            for (const auto& value : nodes) {
                auto node = value.toObject(); const auto nodeId = node.value("id").toString();
                if (selected.contains(nodeId)) { continue; }
                const auto oldParent = node.value("parent_id").toString();
                if (selected.contains(oldParent)) {
                    if (!editableGeometry(node)) { return failure("Unsupported node geometry"); }
                    const auto parent = promotedParents.value(oldParent);
                    if (parent.isEmpty()) { node.remove("parent_id"); } else { node.insert("parent_id", parent); }
                    setPosition(node, absolute.value(nodeId) - absolute.value(parent));
                }
                updated.append(node);
            }
            nodes = updated;
            // A frame may carry imported links. Remove only connections whose
            // endpoint was the removed frame, preserving all child wires.
            const auto prune = [&](const QJsonArray& values) {
                QJsonArray kept;
                for (const auto& value : values) { const auto edge = value.toObject(); if (!selected.contains(edge.value("source").toString()) && !selected.contains(edge.value("target").toString())) { kept.append(value); } }
                return kept;
            };
            edges = prune(edges); links = prune(links);
        }
    } else if (op == "renameNode" || op == "setComment" || op == "setCommentColor" || op == "setGroupColor") {
        const auto index = indexOf(nodes, id);
        if (index < 0) { return failure("Unknown node ID"); }
        auto node = nodes[index].toObject();
        const auto field = op == "renameNode" && !isGroup(node) ? "ui_properties" : "data";
        if (node.contains(field) && !node.value(field).isObject() && !node.value(field).isNull()) { return failure("Unsupported node container"); }
        auto container = node.value(field).toObject();
        if (op == "renameNode") {
            if (!command.value("title").isString()) { return failure("Title must be a string"); }
            container.insert(isGroup(node) ? "headline" : "title", command.value("title"));
        } else if (op == "setCommentColor" || op == "setGroupColor") {
            if (op == "setGroupColor" ? !isGroup(node) : !isComment(node)) { return failure("Select an authored node"); }
            const auto value = command.value("value");
            if (!value.isNull() && (!value.isString() || !QRegularExpression("^#[0-9a-fA-F]{6}$").match(value.toString()).hasMatch())) { return failure("Invalid comment color"); }
            container.insert(op == "setGroupColor" ? "group_color" : "comment_color", value);
        } else {
            if (node.value("type") != commentType && node.value("type") != "nodetool.workflows.Comment") { return failure("Select a comment node"); }
            const auto value = command.value("value");
            if (!value.isString() && !(value.isObject() && value.toObject().value("root").isObject())) { return failure("Comment must be markdown or Lexical JSON"); }
            container.insert("comment", value);
        }
        node.insert(field, container); nodes[index] = node;
    } else if (op == "addLink" || op == "linkNodes") {
        auto link = command.value("link").toObject();
        if (op == "linkNodes") {
            const auto ids = command.value("ids").toArray();
            if (ids.size() != 2 || !ids[0].isString() || !ids[1].isString() || ids[0] == ids[1]) { return failure("Link requires exactly two different selected nodes"); }
            const auto first = indexOf(nodes, ids[0].toString()), second = indexOf(nodes, ids[1].toString());
            if (first < 0 || second < 0) { return failure("Unknown node ID"); }
            auto source = nodes[first].toObject(), target = nodes[second].toObject();
            const auto a = positionOf(source), b = positionOf(target);
            const QCollator collator(QLocale(QLocale::English, QLocale::UnitedStates));
            if (a.x() > b.x() || (a.x() == b.x() && (a.y() > b.y() || (a.y() == b.y() && collator.compare(source.value("id").toString(), target.value("id").toString()) > 0)))) { std::swap(source, target); }
            link.insert("source", source.value("id")); link.insert("target", target.value("id"));
            if (command.contains("id")) { link.insert("id", command.value("id")); }
            for (const auto& field : {QStringLiteral("label"), QStringLiteral("kind")}) { if (command.contains(field)) { link.insert(field, command.value(field)); } }
        }
        if (link.contains("id") && !link.value("id").isString()) { return failure("Link ID must be a string"); }
        const auto source = link.value("source").toString(), target = link.value("target").toString();
        if (source.isEmpty() || target.isEmpty() || source == target || indexOf(nodes, source) < 0 || indexOf(nodes, target) < 0) { return failure("Link requires two existing different nodes"); }
        for (const auto& field : {QStringLiteral("label"), QStringLiteral("kind")}) {
            const auto value = link.value(field);
            if (!value.isUndefined() && !value.isNull() && !value.isString()) { return failure("Link label and kind must be strings or null"); }
            if (value.isUndefined()) { link.insert(field, QJsonValue::Null); }
        }
        for (const auto& value : links) {
            const auto existing = value.toObject();
            if (existing.value("source") == source && existing.value("target") == target && (existing.value("kind").isUndefined() ? QJsonValue(QJsonValue::Null) : existing.value("kind")) == link.value("kind")) {
                result.idMap.insert("link", existing.value("id")); return result;
            }
        }
        if (link.value("id").toString().isEmpty()) { link.insert("id", newId()); }
        if (indexOf(links, link.value("id").toString()) >= 0) { return failure("Link ID already exists"); }
        result.idMap.insert("link", link.value("id")); links.append(link);
    } else if (op == "removeLink") {
        auto index = indexOf(links, id);
        if (index < 0 && id.size() == 12 && std::all_of(id.cbegin(), id.cend(), [](QChar c) { return (c >= '0' && c <= '9') || (c >= 'a' && c <= 'f'); })) {
            for (qsizetype i = 0; i < links.size(); ++i) {
                if (!links[i].toObject().value("id").toString().startsWith(id)) { continue; }
                if (index >= 0) { return failure("Ambiguous link ID prefix"); }
                index = static_cast<int>(i);
            }
        }
        if (id.isEmpty() || index < 0) { return failure("Unknown link ID"); }
        links.removeAt(index);
    } else if (op == "insertReroute") {
        const auto edgeIndex = indexOf(edges, id);
        if (id.isEmpty() || edgeIndex < 0) { return failure("Unknown data edge ID"); }
        const auto position = command.value("position").toObject();
        if (!position.value("x").isDouble() || !position.value("y").isDouble()
            || !std::isfinite(position.value("x").toDouble()) || !std::isfinite(position.value("y").toDouble())) {
            return failure("Reroute requires a finite canvas position");
        }
        const auto original = edges[edgeIndex].toObject();
        if (original.value("edge_type") == "control" || original.value("type") == "control"
            || original.value("data").toObject().value("edge_type") == "control"
            || original.value("sourceHandle") == "__control__" || original.value("targetHandle") == "__control__") {
            return failure("Reroutes cannot split control edges");
        }
        constexpr auto rerouteType = "nodetool.control.Reroute";
        const auto definition = metadata.value(rerouteType);
        QJsonObject reroute{{"id", newId()}, {"type", rerouteType}};
        const auto input = portType(reroute, "input_value", false, metadata);
        const auto output = portType(reroute, "output", true, metadata);
        if (!validType(input) || !validType(output) || input.value("type") != "any" || output.value("type") != "any") {
            return failure("Load canonical Reroute metadata before inserting it");
        }
        QJsonArray remaining;
        for (qsizetype i = 0; i < edges.size(); ++i) { if (i != edgeIndex) { remaining.append(edges[i]); } }
        // Validate the saved endpoint contract before introducing an `any`
        // passthrough, which must not make an invalid saved edge appear valid.
        if (const auto error = validateNewEdge(nodes, remaining, original, metadata); !error.isEmpty()) { return failure(error); }
        QJsonObject defaults;
        for (const auto& value : definition.value("properties").toArray()) {
            const auto property = value.toObject();
            if (property.contains("default")) { defaults.insert(property.value("name").toString(), property.value("default")); }
        }
        reroute.insert("data", defaults);
        setPosition(reroute, QPointF(position.value("x").toDouble(), position.value("y").toDouble()));
        const auto rerouteId = reroute.value("id").toString();
        QJsonObject upstream{{"id", newId()}, {"source", original.value("source")}, {"sourceHandle", original.value("sourceHandle")},
            {"target", rerouteId}, {"targetHandle", "input_value"}, {"edge_type", "data"}};
        auto downstream = original;
        downstream.insert("source", rerouteId); downstream.insert("sourceHandle", "output");
        nodes.append(reroute);
        if (const auto error = validateNewEdge(nodes, remaining, upstream, metadata); !error.isEmpty()) { return failure(error); }
        remaining.append(upstream);
        if (const auto error = validateNewEdge(nodes, remaining, downstream, metadata); !error.isEmpty()) { return failure(error); }
        QJsonArray updated;
        for (qsizetype i = 0; i < edges.size(); ++i) {
            if (i == edgeIndex) { updated.append(upstream); updated.append(downstream); }
            else { updated.append(edges[i]); }
        }
        edges = updated;
        result.idMap.insert("reroute", rerouteId);
        result.idMap.insert("upstreamEdge", upstream.value("id"));
    } else if (op == "reconnectEdge") {
        const auto index = indexOf(edges, id);
        if (id.isEmpty() || index < 0) { return failure("Unknown edge ID"); }
        if (!command.value("connection").isObject()) { return failure("Reconnect requires a connection"); }
        const auto connection = command.value("connection").toObject();
        const QStringList fields{"source", "target", "sourceHandle", "targetHandle"};
        auto edge = edges[index].toObject();
        bool unchanged = true;
        for (const auto& field : fields) {
            const auto value = connection.value(field);
            if (!value.isString() || value.toString().isEmpty()) { return failure("Reconnect requires existing endpoints and named ports"); }
            unchanged = unchanged && edge.value(field) == value;
            edge.insert(field, value);
        }
        // Returning to the original endpoint remains a successful no-op even
        // when metadata is unavailable for an imported node type.
        if (unchanged) { return success(); }
        const auto sourceHandle = edge.value("sourceHandle").toString();
        const auto targetHandle = edge.value("targetHandle").toString();
        const auto targetIndex = indexOf(nodes, edge.value("target").toString());
        const bool collect = targetIndex >= 0 && collectsEdges(nodes, edge, metadata)
            && !(edge.value("edge_type") == "control" || sourceHandle == "__control__" || targetHandle == "__control__");
        QSet<qsizetype> replaced;
        QJsonArray remaining;
        for (qsizetype i = 0; i < edges.size(); ++i) {
            if (i == index) { continue; }
            const auto existing = edges[i].toObject();
            if (!collect && existing.value("target") == edge.value("target") && existing.value("targetHandle") == edge.value("targetHandle")) {
                replaced.insert(i);
                continue;
            }
            bool duplicate = true;
            for (const auto& field : fields) { duplicate = duplicate && existing.value(field) == edge.value(field); }
            if (duplicate) { return failure("Connection already exists"); }
            remaining.append(existing);
        }
        if (const auto error = validateNewEdge(nodes, remaining, edge, metadata); !error.isEmpty()) { return failure(error); }
        QJsonArray updated;
        for (qsizetype i = 0; i < edges.size(); ++i) {
            if (i == index) { updated.append(edge); }
            else if (!replaced.contains(i)) { updated.append(edges[i]); }
        }
        edges = updated;
    } else if (op == "addEdge") {
        auto edge = command.value("edge").toObject();
        if (edge.value("id").toString().isEmpty()) { edge.insert("id", newId()); }
        if (indexOf(edges, edge.value("id").toString()) >= 0) { return failure("Edge ID already exists"); }
        for (const auto& value : edges) {
            const auto existing = value.toObject();
            if (existing.value("source") == edge.value("source") && existing.value("target") == edge.value("target") && existing.value("sourceHandle") == edge.value("sourceHandle") && existing.value("targetHandle") == edge.value("targetHandle")) { return failure("Connection already exists"); }
        }
        if (edge.value("source") == edge.value("target")) { return failure("Self connections are unsupported"); }
        // The newest wire into a single-value input replaces the one already there.
        if (!collectsEdges(nodes, edge, metadata)) {
            QJsonArray kept;
            for (const auto& value : edges) {
                const auto existing = value.toObject();
                if (existing.value("target") == edge.value("target") && existing.value("targetHandle") == edge.value("targetHandle")) { continue; }
                kept.append(value);
            }
            edges = kept;
        }
        if (const auto error = validateNewEdge(nodes, edges, edge, metadata); !error.isEmpty()) { return failure(error); }
        edges.append(edge);
        for (qsizetype i = 0; i < nodes.size(); ++i) {
            auto target = nodes[i].toObject();
            if (target.value("id") != edge.value("target")) { continue; }
            if (exposeConnectedInput(target, edge.value("targetHandle").toString(), metadata)) { nodes[i] = target; }
            break;
        }
    } else if (op == "removeEdge") {
        const auto index = indexOf(edges, id);
        if (id.isEmpty() || index < 0) { return failure("Unknown edge ID"); }
        edges.removeAt(index);
    } else if (op == "removeNodes" || op == "setDisabled") {
        QHash<QString, QJsonObject> byId;
        for (const auto& value : nodes) { const auto node = value.toObject(); byId.insert(node.value("id").toString(), node); }
        QSet<QString> selected;
        for (const auto& value : command.value("ids").toArray()) {
            if (!value.isString() || !byId.contains(value.toString())) { return failure("Unknown node ID"); }
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
            // A frame is an authoring aid, not an execution bypass. Apply the
            // explicit state to its runnable descendants in one undo step.
            QHash<QString, QStringList> children;
            for (const auto& value : nodes) { const auto node = value.toObject(); children[node.value("parent_id").toString()].append(node.value("id").toString()); }
            QStringList pending;
            for (const auto& selectedId : selected) { if (isGroup(byId.value(selectedId))) { pending.append(selectedId); } }
            QSet<QString> expanded;
            while (!pending.isEmpty()) {
                const auto parent = pending.takeLast();
                if (expanded.contains(parent)) { continue; }
                expanded.insert(parent);
                for (const auto& child : children.value(parent)) { selected.insert(child); if (isGroup(byId.value(child))) { pending.append(child); } }
            }
            for (qsizetype i = 0; i < nodes.size(); ++i) {
                auto n = nodes[i].toObject();
                if (selected.contains(n.value("id").toString()) && !isGroup(n) && !isComment(n)) {
                    if (n.contains("ui_properties") && !n.value("ui_properties").isObject() && !n.value("ui_properties").isNull()) { return failure("Unsupported UI properties"); }
                    auto ui = n.value("ui_properties").toObject(); ui.insert("bypassed", command.value("disabled")); n.insert("ui_properties", ui); nodes[i] = n;
                }
            }
        }
    } else if (op == "moveNodes") {
        if (!command.value("positions").isObject()) { return failure("Positions must be an object"); }
        const auto positions = command.value("positions").toObject();
        const auto space = command.value("space").toString("relative");
        if (space != "relative" && space != "absolute") { return failure("Unknown position space"); }
        const auto absolute = space == "absolute" ? absolutePositions(nodes, positions) : QHash<QString, QPointF>{};
        QHash<QString, int> indices;
        for (qsizetype i = 0; i < nodes.size(); ++i) { indices.insert(nodes[i].toObject().value("id").toString(), static_cast<int>(i)); }
        for (auto it = positions.begin(); it != positions.end(); ++it) {
            const auto index = indices.value(it.key(), -1); const auto position = it.value().toObject();
            if (index < 0 || !position.value("x").isDouble() || !position.value("y").isDouble() || !std::isfinite(position.value("x").toDouble()) || !std::isfinite(position.value("y").toDouble())) { return failure("Invalid node position"); }
            auto n = nodes[index].toObject();
            if (n.contains("ui_properties") && !n.value("ui_properties").isObject() && !n.value("ui_properties").isNull()) { return failure("Unsupported UI properties"); }
            auto target = QPointF(position.value("x").toDouble(), position.value("y").toDouble());
            if (space == "absolute") {
                const auto parent = n.value("parent_id").toString();
                target -= absolute.value(parent);
            }
            if (!editableGeometry(n)) { return failure("Unsupported node geometry"); }
            setPosition(n, target); nodes[index] = n;
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
            if (!validType(output ? it.value() : QJsonValue(normalizedDynamicPortType(it.value())))) {
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
    } else if (op == "setDynamicInputType") {
        // The web type chip (DynamicSlotTypePicker.tsx, useDynamicProperty.ts
        // handleUpdatePropertyType) keeps a value that still fits the new type
        // and reseeds one that does not.
        const auto index = indexOf(nodes, id);
        if (index < 0) { return failure("Unknown node ID"); }
        auto n = nodes[index].toObject();
        const auto definition = metadata.value(n.value("type").toString());
        if (!definition.value("supports_dynamic_inputs").toBool()) {
            return failure("Node metadata does not support editing these dynamic ports");
        }
        const auto data = n.value("data").toObject();
        const auto nodeType = n.value("type").toString();
        if (nodeType.startsWith("fal.") || nodeType.startsWith("kie.") || nodeType.startsWith("replicate.") || nodeType.startsWith("comfy.")
            || nodeType == "nodetool.workflows.workflow_node.Workflow" || nodeType == "nodetool.workflows.subgraph.Subgraph"
            || data.contains("endpoint_id") || data.contains("model_id")) {
            return failure("This node's schema sets its input types");
        }
        for (const auto& container : {QStringLiteral("dynamic_inputs"), QStringLiteral("dynamic_properties")}) {
            if (n.contains(container) && !n.value(container).isObject()) { return failure("Unsupported dynamic port container"); }
        }
        const auto name = command.value("name").toString();
        auto ports = n.value("dynamic_inputs").toObject();
        auto values = n.value("dynamic_properties").toObject();
        if (name.isEmpty() || (!ports.contains(name) && !values.contains(name))) { return failure("Unknown dynamic port"); }
        for (const auto& port : definition.value("properties").toArray()) {
            if (port.toObject().value("name") == name) { return failure("Unknown dynamic port"); }
        }
        for (const auto& value : edges) {
            const auto edge = value.toObject();
            if (edge.value("target") == id && edge.value("targetHandle") == name) { return failure("Disconnect the input before changing its type"); }
        }
        const auto type = command.value("type");
        if (!validType(type) || type.toObject().value("type").toString().isEmpty()) { return failure("Invalid dynamic port type metadata"); }
        const auto key = [](const QJsonObject& candidate) {
            const auto args = candidate.value("type_args").toArray();
            return candidate.value("type") == "list" && args.size() == 1
                ? "list[" + args[0].toObject().value("type").toString() + "]" : candidate.value("type").toString();
        };
        const auto allowed = definition.value("allowed_dynamic_slot_types").toArray();
        bool permitted = allowed.isEmpty();
        for (const auto& candidate : allowed) { if (key(candidate.toObject()) == key(type.toObject())) { permitted = true; break; } }
        if (!permitted) { return failure("Dynamic input type is not allowed by node metadata"); }
        auto declaration = ports.value(name).isObject() ? ports.value(name).toObject() : QJsonObject{};
        declaration.insert("type", type);
        ports.insert(name, declaration);
        const auto previous = values.value(name);
        const bool keep = values.contains(name) && validatePropertyValue(QJsonObject{{"type", type}}, previous).isEmpty();
        if (!keep) {
            const auto kind = type.toObject().value("type").toString();
            QJsonValue seeded = QJsonValue::Null;
            if (kind == "str" || kind == "text" || kind == "any") { seeded = QString(); }
            else if (kind == "int" || kind == "float" || kind == "number") { seeded = 0; }
            else if (kind == "bool") { seeded = false; }
            else if (kind == "list") { seeded = QJsonArray{}; }
            else if (kind == "dict") { seeded = QJsonObject{}; }
            values.insert(name, seeded);
        }
        n.insert("dynamic_inputs", ports);
        n.insert("dynamic_properties", values);
        nodes[index] = n;
    } else if (op == "setChildGraph" || op == "setChildSnapshot") {
        const auto index = indexOf(nodes, id);
        if (index < 0) { return failure("Child owner no longer exists"); }
        const auto previous = withChildPorts(nodes[index].toObject());
        auto n = nodes[index].toObject();
        const auto key = childGraphKey(n);
        if (key.isEmpty() || !command["graph"].isObject()) { return failure("Unsupported child graph"); }
        if (op == "setChildSnapshot" && !command["snapshot"].isObject()) { return failure("Child snapshot must be an object"); }
        auto data = n["data"].toObject();
        if (op == "setChildSnapshot") { data[key] = command["snapshot"]; }
        else if (key == "graph") { data[key] = command["graph"]; }
        else { auto snapshot = data[key].toObject(); snapshot["graph"] = command["graph"]; data[key] = snapshot; }
        n["data"] = data;
        QJsonArray catalog;
        for (const auto &entry : metadata) { catalog.append(entry); }
        n = withChildPorts(n, catalog);
        removeStaleChildEdges(previous, n, edges);
        nodes[index] = n;
    } else if (op == "patchChatData") {
        const auto index = indexOf(nodes, id);
        if (index < 0) {
            return failure("Unknown node ID");
        }
        if (!command["data"].isObject()) {
            return failure("Data must be an object");
        }
        auto node = nodes[index].toObject();
        const auto patch = command["data"].toObject();
        auto ui = node["ui_properties"].toObject();
        auto properties = node["data"].toObject();
        auto overlay = node["chat_data"].toObject();
        const QSet<QString> uiFields{"title",       "color",       "collapsed",           "bypassed",
                                     "model_id",    "endpoint_id", "selected_generation", "selected_generations",
                                     "setupStepId", "selectable"};
        for (auto it = patch.begin(); it != patch.end(); ++it) {
            if (it.key() == "properties") {
                if (!it.value().isObject()) {
                    return failure("Properties must be an object");
                }
                const auto values = it.value().toObject();
                for (auto value = values.begin(); value != values.end(); ++value) {
                    properties[value.key()] = value.value();
                }
            } else if (it.key() == "dynamic_properties" || it.key() == "dynamic_inputs" ||
                       it.key() == "dynamic_outputs") {
                if (!it.value().isObject()) {
                    return failure("Port declarations must be objects");
                }
                node[it.key()] = it.value();
            } else if (uiFields.contains(it.key())) {
                ui[it.key() == "setupStepId" ? QStringLiteral("setup_step_id") : it.key()] = it.value();
            } else {
                overlay[it.key()] = it.value();
            }
        }
        node["data"] = properties;
        node["ui_properties"] = ui;
        if (!overlay.isEmpty()) {
            node["chat_data"] = overlay;
        }
        nodes[index] = withInferredCodePorts(node, edges);
    } else if (op == "setProperty" || op == "removeProperty" || op == "setNodeField") {
        const auto index = indexOf(nodes, id);
        if (index < 0) { return failure("Unknown node ID"); }
        auto n = nodes[index].toObject();
        if (op == "setProperty" || op == "removeProperty") {
            if (isChildNode(n)) {
                QJsonArray catalog;
                for (const auto &entry : metadata) { catalog.append(entry); }
                n = withChildPorts(n, catalog);
            }
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
            if (storage == "data" && name == "code") { n = withInferredCodePorts(n, edges); }
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
        if (const auto error = validatePastedEdges(workflow, fragment, metadata); !error.isEmpty()) { return failure(error); }
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
    void applyDefaults(const QHash<QString, QJsonObject>& defaults) {
        applyGraphDefaults(before_, defaults);
        applyGraphDefaults(after_, defaults);
    }
    void undo() override { document_.restore(before_); }
    void redo() override { document_.restore(after_); }
private:
    WorkflowDocument& document_;
    QJsonObject before_, after_;
};
class NodeDeltaEdit final : public QUndoCommand {
public:
    NodeDeltaEdit(WorkflowDocument& document, QJsonObject before, QJsonObject after, const QString& label)
        : QUndoCommand(label), document_(document), before_(std::move(before)), after_(std::move(after)) {}
    void applyDefaults(const QHash<QString, QJsonObject>& defaults) {
        for (auto node = before_.begin(); node != before_.end(); ++node) {
            node.value() = withPropertyDefaults(node.value().toObject(), defaults.value(node.key()));
        }
        for (auto node = after_.begin(); node != after_.end(); ++node) {
            node.value() = withPropertyDefaults(node.value().toObject(), defaults.value(node.key()));
        }
    }
    void undo() override { apply(before_, after_); }
    void redo() override { apply(after_, before_); }
private:
    void apply(const QJsonObject& values, const QJsonObject& other) {
        for (auto it = other.begin(); it != other.end(); ++it) {
            document_.writeNode(it.key(), values.value(it.key()).toObject());
        }
        for (auto it = values.begin(); it != values.end(); ++it) {
            if (!other.contains(it.key())) {
                document_.writeNode(it.key(), it.value().toObject());
            }
        }
        emit document_.changed();
    }
    WorkflowDocument& document_;
    QJsonObject before_;
    QJsonObject after_;
};
class EdgeDeltaEdit final : public QUndoCommand {
public:
    EdgeDeltaEdit(WorkflowDocument& document, QJsonObject edge, const QString& label)
        : QUndoCommand(label), document_(document), edge_(std::move(edge)) {}
    void undo() override {
        document_.popEdge();
        emit document_.changed();
    }
    void redo() override {
        document_.appendEdge(edge_);
        emit document_.changed();
    }
private:
    WorkflowDocument& document_;
    QJsonObject edge_;
};
void WorkflowDocument::appendEdge(const QJsonObject& value) {
    const auto id = value.value("id").toString();
    edgeIndices_.insert(id, edgeValues_.size());
    outgoing_[value.value("source").toString()].append(id);
    edgeValues_.push_back(value);
    graphDirty_ = true;
}
void WorkflowDocument::popEdge() {
    const auto edge = edgeValues_.back();
    outgoing_[edge.value("source").toString()].removeLast();
    edgeIndices_.remove(edge.value("id").toString());
    edgeValues_.pop_back();
    graphDirty_ = true;
}
void WorkflowDocument::rebuildGraph() {
    nodeValues_.clear();
    nodeIndices_.clear();
    for (const auto& value : workflow_.value("graph").toObject().value("nodes").toArray()) {
        const auto node = value.toObject();
        nodeIndices_.insert(node.value("id").toString(), nodeValues_.size());
        nodeValues_.push_back(node);
    }
    edgeValues_.clear();
    edgeIndices_.clear();
    outgoing_.clear();
    for (const auto& value : workflow_.value("graph").toObject().value("edges").toArray()) {
        appendEdge(value.toObject());
    }
    graphDirty_ = false;
}
void WorkflowDocument::writeNode(const QString& id, const QJsonObject& value) {
    const auto found = nodeIndices_.constFind(id);
    if (value.isEmpty()) {
        const auto index = *found;
        nodeValues_.erase(nodeValues_.begin() + index);
        nodeIndices_.remove(id);
        for (qsizetype i = index; i < nodeCount(); ++i) {
            nodeIndices_[nodeValues_[i].value("id").toString()] = i;
        }
    } else if (found == nodeIndices_.cend()) {
        nodeIndices_.insert(id, nodeValues_.size());
        nodeValues_.push_back(value);
    } else {
        nodeValues_[*found] = value;
    }
    graphDirty_ = true;
}
QJsonObject WorkflowDocument::snapshot() const {
    if (graphDirty_) {
        QJsonArray values;
        for (const auto& node : nodeValues_) {
            values.append(node);
        }
        auto graph = workflow_.value("graph").toObject();
        graph.insert("nodes", values);
        QJsonArray edges;
        for (const auto& edge : edgeValues_) {
            edges.append(edge);
        }
        graph.insert("edges", edges);
        workflow_.insert("graph", graph);
        graphDirty_ = false;
    }
    return workflow_;
}
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
void WorkflowDocument::applyPropertyDefaults(const QHash<QString, QJsonObject>& defaults) {
    if (isReadOnly()) { return; }
    bool anyChanged = false;
    for (auto values = defaults.cbegin(); values != defaults.cend(); ++values) {
        const auto current = node(values.key());
        const auto updated = withPropertyDefaults(current, values.value());
        if (updated != current) { writeNode(values.key(), updated); anyChanged = true; }
    }
    // Defaults are document initialization. Normalize existing history rather
    // than replaying defaults during undo, so later explicit clears stay clear.
    for (int i = 0; i < undo_.count(); ++i) {
        auto* command = const_cast<QUndoCommand*>(undo_.command(i));
        if (auto* edit = dynamic_cast<DocumentEdit*>(command)) { edit->applyDefaults(defaults); }
        else if (auto* edit = dynamic_cast<NodeDeltaEdit*>(command)) { edit->applyDefaults(defaults); }
    }
    if (anyChanged) {
        undo_.resetClean();
        emit changed();
    }
}
EditResult WorkflowDocument::load(const QJsonObject& workflow) {
    const auto error = validate(workflow);
    if (!workflow.value("graph").isObject()) { return failure(error); }
    undo_.clear();
    workflow_ = workflow;
    rebuildGraph();
    readOnlyReason_ = error;
    emit replaced();
    emit changed();
    return success();
}
EditResult WorkflowDocument::loadJson(const QByteArray& json) {
    QJsonParseError error;
    const auto parsed = QJsonDocument::fromJson(json, &error);
    if (error.error != QJsonParseError::NoError || !parsed.isObject()) { return failure("Invalid workflow JSON: " + error.errorString()); }
    return load(parsed.object());
}
QJsonObject WorkflowDocument::graph() const { return snapshot().value("graph").toObject(); }
QJsonArray WorkflowDocument::nodes() const { return graph().value("nodes").toArray(); }
QJsonArray WorkflowDocument::edges() const { return graph().value("edges").toArray(); }
QJsonObject WorkflowDocument::node(const QString& id) const {
    const auto found = nodeIndices_.constFind(id);
    return found == nodeIndices_.cend() ? QJsonObject{} : nodeValues_[*found];
}
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
    rebuildGraph();
    emit changed();
}
EditResult WorkflowDocument::applyCommand(const QJsonObject& command, const QString& label) {
    if (isReadOnly()) { return failure(readOnlyReason_); }
    const auto op = command.value("op").toString();
    const auto title = label.isEmpty() ? op : label;
    if (op == "addNode") {
        auto value = command.value("node").toObject();
        auto id = value.value("id").toString();
        if (id.isEmpty()) {
            id = newId();
            value.insert("id", id);
        }
        if (nodeIndices_.contains(id)) {
            return failure("Node ID already exists");
        }
        const auto parent = value.value("parent_id").toString();
        if (!parent.isEmpty() && !nodeIndices_.contains(parent)) {
            return failure("Missing parent node");
        }
        auto checked = value;
        checked.remove("parent_id");
        const auto error = validate(QJsonObject{{"graph", QJsonObject{{"nodes", QJsonArray{checked}}, {"edges", QJsonArray{}}}}});
        if (!error.isEmpty()) {
            return failure(error);
        }
        // native-rules #2: naked new, QUndoStack takes ownership of a raw QUndoCommand, no parent or smart pointer
        undo_.push(new NodeDeltaEdit(*this, {}, QJsonObject{{id, value}}, title));
        return success();
    }
    if (op == "addEdge") {
        auto edge = command.value("edge").toObject();
        if (edge.value("id").toString().isEmpty()) {
            edge.insert("id", newId());
        }
        if (edgeIndices_.contains(edge.value("id").toString())) {
            return failure("Edge ID already exists");
        }
        const auto source = edge.value("source").toString();
        const auto target = edge.value("target").toString();
        if (!nodeIndices_.contains(source) || !nodeIndices_.contains(target)) {
            return failure("Unknown connection endpoint");
        }
        // A wire that exposes a hidden input also changes the node, so it takes the batch path.
        if (auto exposed = node(target); exposeConnectedInput(exposed, edge.value("targetHandle").toString(), metadata_)) {
            return applyCommand(QJsonObject{{"op", "batch"}, {"commands", QJsonArray{command}}}, title);
        }
        // A wire that replaces the one into a single-value input also removes an edge.
        if (!collectsEdges(QJsonArray{node(target)}, edge, metadata_)) {
            for (const auto& existing : edgeValues_) {
                if (existing.value("target") == edge.value("target") && existing.value("targetHandle") == edge.value("targetHandle")
                    && existing.value("id") != edge.value("id")) {
                    return applyCommand(QJsonObject{{"op", "batch"}, {"commands", QJsonArray{command}}}, title);
                }
            }
        }
        for (const auto& id : outgoing_.value(source)) {
            const auto& existing = edgeValues_[edgeIndices_.value(id)];
            if (existing.value("target") == edge.value("target")
                && existing.value("sourceHandle") == edge.value("sourceHandle")
                && existing.value("targetHandle") == edge.value("targetHandle")) {
                return failure("Connection already exists");
            }
        }
        QJsonArray reachableNodes{node(source)};
        QJsonArray reachableEdges;
        QStringList pending{target};
        QSet<QString> visited{source};
        while (!pending.isEmpty()) {
            const auto id = pending.takeLast();
            if (visited.contains(id)) {
                continue;
            }
            visited.insert(id);
            reachableNodes.append(node(id));
            for (const auto& edgeId : outgoing_.value(id)) {
                const auto& next = edgeValues_[edgeIndices_.value(edgeId)];
                const auto destination = next.value("target").toString();
                if (loopFeedback(node(destination), next.value("targetHandle").toString())) {
                    continue;
                }
                reachableEdges.append(next);
                pending.append(destination);
            }
        }
        const auto error = validateNewEdge(reachableNodes, reachableEdges, edge, metadata_);
        if (!error.isEmpty()) {
            return failure(error);
        }
        if (!edge.value("sourceHandle").isString() || !edge.value("targetHandle").isString()) {
            return failure("Edge requires named ports");
        }
        // native-rules #2: naked new, QUndoStack takes ownership of a raw QUndoCommand, no parent or smart pointer
        undo_.push(new EdgeDeltaEdit(*this, edge, title));
        return success();
    }
    if (op == "moveNodes") {
        if (!command.value("positions").isObject()) {
            return failure("Positions must be an object");
        }
        QJsonObject before;
        QJsonObject after;
        const auto positions = command.value("positions").toObject();
        const auto space = command.value("space").toString("relative");
        if (space != "relative" && space != "absolute") {
            return failure("Unknown position space");
        }
        QHash<QString, QPointF> absolute;
        const auto parentPosition = [this, &positions, &absolute](QString id) {
            QStringList path;
            while (!id.isEmpty() && !absolute.contains(id)) {
                if (positions.contains(id)) {
                    const auto target = positions.value(id).toObject();
                    absolute.insert(id, QPointF(target.value("x").toDouble(), target.value("y").toDouble()));
                    break;
                }
                path.append(id);
                id = node(id).value("parent_id").toString();
            }
            auto result = absolute.value(id);
            while (!path.isEmpty()) {
                const auto current = path.takeLast();
                result += positionOf(node(current));
                absolute.insert(current, result);
            }
            return result;
        };
        for (auto it = positions.begin(); it != positions.end(); ++it) {
            auto value = node(it.key());
            const auto position = it.value().toObject();
            if (value.isEmpty() || !position.value("x").isDouble() || !position.value("y").isDouble()
                || !std::isfinite(position.value("x").toDouble()) || !std::isfinite(position.value("y").toDouble())) {
                return failure("Invalid node position");
            }
            if (value.contains("ui_properties") && !value.value("ui_properties").isObject()
                && !value.value("ui_properties").isNull()) {
                return failure("Unsupported UI properties");
            }
            if (!editableGeometry(value)) {
                return failure("Unsupported node geometry");
            }
            before.insert(it.key(), value);
            auto target = QPointF(position.value("x").toDouble(), position.value("y").toDouble());
            if (space == "absolute") {
                target -= parentPosition(value.value("parent_id").toString());
            }
            setPosition(value, target);
            after.insert(it.key(), value);
        }
        if (before != after) {
            // native-rules #2: naked new, QUndoStack takes ownership of a raw QUndoCommand, no parent or smart pointer
            undo_.push(new NodeDeltaEdit(*this, before, after, title));
        }
        return success();
    }
    auto candidate = snapshot();
    auto result = edit(candidate, command, metadata_);
    // native-rules #2: naked new, QUndoStack takes ownership of a raw QUndoCommand, no parent or smart pointer
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
