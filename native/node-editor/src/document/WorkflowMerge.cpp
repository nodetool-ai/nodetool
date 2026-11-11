#include "WorkflowMerge.h"
#include <QHash>
#include <QSet>
#include <algorithm>
#include <optional>
#include <utility>

// Port of mergeByUnits (web/src/stores/documentMerge.ts) with the workflow
// adapter (web/src/stores/workflowMerge.ts) and mergeGraphLinks
// (packages/protocol/src/graph-links.ts). The web merges ReactFlow nodes, whose
// `data` bundles the graph node's properties, dynamic slots and the display
// fields of ui_properties. The same grouping is applied to persisted nodes here.
namespace nodetool::node_editor {
namespace {
const QStringList dataNodeKeys{"data", "dynamic_properties", "dynamic_outputs", "dynamic_inputs",
                               "dynamic_output_correlation"};
// graphNodeToReactFlowNode copies these ui_properties into ReactFlow node data.
const QStringList dataUiKeys{"title", "color", "collapsed", "bypassed", "selectable", "model_id", "endpoint_id",
                             "selected_generation", "selected_generations", "setup_step_id", "exposed_inputs",
                             "exposed_inputs_labeled", "exposed_inputs_hidden"};

struct Entry {
    QJsonObject item;
    qsizetype index = 0;
};
using UnitMap = QHash<QString, Entry>;

QString edgeKey(const QJsonObject& edge) {
    const auto id = edge.value("id").toString();
    if (!id.isEmpty()) { return id; }
    // Persisted edges carry IDs. A legacy edge without one is keyed by its connection.
    return edge.value("source").toString() + '\n' + edge.value("sourceHandle").toString() + '\n'
        + edge.value("target").toString() + '\n' + edge.value("targetHandle").toString();
}
QString nodeKey(const QJsonObject& node) { return node.value("id").toString(); }

UnitMap byId(const QJsonArray& units, QString (*key)(const QJsonObject&)) {
    UnitMap map;
    for (qsizetype i = 0; i < units.size(); ++i) {
        const auto unit = units.at(i).toObject();
        map.insert(key(unit), {unit, i});
    }
    return map;
}

struct Slot {
    QJsonValue value;
    bool contested = false;
};
// resolveSlot: a slot the draft never touched resolves to the remote value.
Slot resolve(const QJsonValue& base, const QJsonValue& local, const QJsonValue& remote) {
    if (local == remote) { return {local, false}; }
    if (local == base) { return {remote, false}; }
    if (remote == base) { return {local, false}; }
    return {local, true};
}

struct NodeParts {
    QJsonValue position = QJsonValue(QJsonValue::Undefined);
    QJsonObject data;
    QJsonObject rest;
};
NodeParts split(const QJsonObject& node) {
    NodeParts parts;
    parts.rest = node;
    for (const auto& key : dataNodeKeys) {
        if (node.contains(key)) {
            parts.data.insert(key, node.value(key));
            parts.rest.remove(key);
        }
    }
    if (node.value("ui_properties").isObject()) {
        auto ui = node.value("ui_properties").toObject();
        if (ui.contains("position")) {
            parts.position = ui.value("position");
            ui.remove("position");
        }
        QJsonObject display;
        for (const auto& key : dataUiKeys) {
            if (ui.contains(key)) {
                display.insert(key, ui.value(key));
                ui.remove(key);
            }
        }
        if (!display.isEmpty()) { parts.data.insert("ui_properties", display); }
        parts.rest.insert("ui_properties", ui);
    }
    return parts;
}
QJsonObject join(const QJsonValue& position, const QJsonObject& data, const QJsonObject& rest) {
    auto node = rest;
    for (auto it = data.begin(); it != data.end(); ++it) {
        if (it.key() != "ui_properties") { node.insert(it.key(), it.value()); }
    }
    const auto display = data.value("ui_properties").toObject();
    if (node.value("ui_properties").isObject() || !display.isEmpty() || !position.isUndefined()) {
        auto ui = node.value("ui_properties").toObject();
        for (auto it = display.begin(); it != display.end(); ++it) { ui.insert(it.key(), it.value()); }
        if (!position.isUndefined()) { ui.insert("position", position); }
        node.insert("ui_properties", ui);
    }
    return node;
}

// Field-level merge of one unit (mergeByFieldSpecs). Nodes merge position, the
// data group and the remaining fields separately. Edges merge as one value.
Slot mergeUnit(const QString& kind, const QJsonObject& base, const QJsonObject& local, const QJsonObject& remote) {
    if (kind != "node") { return resolve(base, local, remote); }
    const auto b = split(base), l = split(local), r = split(remote);
    const auto rest = resolve(b.rest, l.rest, r.rest);
    const auto position = resolve(b.position, l.position, r.position);
    const auto data = resolve(b.data, l.data, r.data);
    return {join(position.value, data.value.toObject(), rest.value.toObject()),
            rest.contested || position.contested || data.contested};
}

QString unitLabel(const QString& kind, const QJsonObject& unit) {
    if (kind == "edge") { return unit.value("source").toString() + QStringLiteral(" → ") + unit.value("target").toString(); }
    const auto title = unit.value("ui_properties").toObject().value("title").toString();
    return title.isEmpty() ? unit.value("id").toString() : title;
}

// The units each op touched (workflowMergeAdapter.unitsTouchedByOp).
struct Touches {
    QHash<QString, QSet<QString>> units;
    bool attributed = false;
    bool operator()(const QString& kind, const QString& id) const {
        // Ops no rule attributed merge by diff: every contested slot counts.
        return !attributed || units.value(kind).contains(id);
    }
};
Touches touchesFor(const QJsonArray& ops) {
    Touches touches;
    const auto add = [&](const QString& kind, const QString& id) {
        touches.units[kind].insert(id);
        touches.attributed = true;
    };
    const auto text = [](const QJsonObject& input, const char* key) {
        const auto value = input.value(QLatin1String(key));
        return value.isString() ? value.toString() : QString{};
    };
    for (const auto& value : ops) {
        const auto op = value.toObject();
        const auto tool = op.value("tool").toString();
        const auto input = op.value("input").toObject();
        QString id;
        for (const auto* key : {"id", "node_id", "source_node_id"}) {
            if (id.isEmpty()) { id = text(input, key); }
        }
        if (tool == "ui_add_node" || tool == "ui_delete_node" || tool == "ui_update_node_data"
            || tool == "ui_set_node_title" || tool == "ui_move_node") {
            if (!id.isEmpty()) { add("node", id); }
        } else if (tool == "ui_connect_nodes") {
            auto edge = text(input, "edge_id");
            if (edge.isEmpty()) { edge = text(input, "id"); }
            // A new edge has no stable ID yet. The web attributes it to a synthetic one.
            add("edge", edge.isEmpty() ? QStringLiteral("__new_edge__") : edge);
        } else if (tool == "ui_delete_edge") {
            auto edge = text(input, "edge_id");
            if (edge.isEmpty()) { edge = text(input, "id"); }
            if (edge.isEmpty()) { edge = id; }
            if (!edge.isEmpty()) { add("edge", edge); }
        }
    }
    return touches;
}

// mergeCollection: order follows the local draft, with remote-only units
// inserted at their remote index.
QJsonArray mergeCollection(const QString& kind, QString (*key)(const QJsonObject&), const QJsonArray& baseUnits,
                           const QJsonArray& localUnits, const QJsonArray& remoteUnits, const Touches& touches,
                           QList<GraphMergeConflict>& conflicts) {
    const auto base = byId(baseUnits, key);
    const auto remote = byId(remoteUnits, key);
    const auto conflict = [&](const QString& id, const QJsonObject& labelSource, const QJsonValue& external,
                              const QString& reason, const QJsonValue& local) {
        conflicts.append({kind, id, unitLabel(kind, labelSource), reason, external, local});
    };
    QJsonArray result;
    QSet<QString> placed;
    for (const auto& value : localUnits) {
        const auto local = value.toObject();
        const auto id = key(local);
        const auto b = base.constFind(id);
        const auto r = remote.constFind(id);
        const bool localChanged = b == base.cend() || b->item != local;
        if (r == remote.cend()) {
            if (b == base.cend()) {
                result.append(local); // Created locally. The server has never seen it.
                placed.insert(id);
                continue;
            }
            if (!localChanged) { continue; } // Remote delete of an untouched unit.
            if (touches(kind, id)) { conflict(id, local, QJsonValue::Null, "deleted", local); }
            result.append(local);
            placed.insert(id);
            continue;
        }
        if (b == base.cend()) {
            // Created on both sides. The local copy wins.
            if (local != r->item && touches(kind, id)) { conflict(id, local, r->item, "edited", local); }
            result.append(local);
            placed.insert(id);
            continue;
        }
        const bool remoteChanged = b->item != r->item;
        if (!localChanged || !remoteChanged) {
            result.append(localChanged ? local : r->item);
            placed.insert(id);
            continue;
        }
        // Both sides changed it. Uncontested fields merge. A unit no op touched keeps
        // the local value silently.
        const auto merged = mergeUnit(kind, b->item, local, r->item);
        result.append(merged.value);
        placed.insert(id);
        if (merged.contested && touches(kind, id)) { conflict(id, local, r->item, "edited", local); }
    }
    for (const auto& value : remoteUnits) {
        const auto unit = value.toObject();
        const auto id = key(unit);
        if (placed.contains(id)) { continue; }
        const auto b = base.constFind(id);
        if (b != base.cend()) {
            // Deleted locally. The deletion wins over a remote edit.
            if (b->item != unit && touches(kind, id)) {
                conflict(id, unit, unit, "deleted", QJsonValue(QJsonValue::Undefined));
            }
            continue;
        }
        result.insert(std::min(remote.value(id).index, result.size()), unit);
        placed.insert(id);
    }
    return result;
}

QStringList linkIds(const QJsonArray& links) {
    QStringList ids;
    for (const auto& value : links) { ids.append(value.toObject().value("id").toString()); }
    return ids;
}
// mergeGraphLinks: local links survive unless the remote deleted one the base
// had. Remote additions follow.
QJsonArray mergeLinks(const QJsonArray& base, const QJsonArray& local, const QJsonArray& remote) {
    const auto baseIdList = linkIds(base), remoteIdList = linkIds(remote), localIdList = linkIds(local);
    const QSet<QString> baseIds(baseIdList.begin(), baseIdList.end());
    const QSet<QString> remoteIds(remoteIdList.begin(), remoteIdList.end());
    const QSet<QString> localIds(localIdList.begin(), localIdList.end());
    QJsonArray merged;
    for (const auto& value : local) {
        const auto id = value.toObject().value("id").toString();
        if (!baseIds.contains(id) || remoteIds.contains(id)) { merged.append(value); }
    }
    for (const auto& value : remote) {
        const auto id = value.toObject().value("id").toString();
        if (!baseIds.contains(id) && !localIds.contains(id)) { merged.append(value); }
    }
    return merged;
}

// Root members outside the merge units merge per key. The local draft wins a contest.
QJsonObject mergeRootMembers(QJsonObject merged, const QJsonObject& base, const QJsonObject& local,
                             const QJsonObject& remote, const QSet<QString>& skipped) {
    QSet<QString> keys;
    for (const auto* side : {&base, &local, &remote}) {
        for (auto it = side->begin(); it != side->end(); ++it) { keys.insert(it.key()); }
    }
    for (const auto& key : keys) {
        if (skipped.contains(key)) { continue; }
        const auto slot = resolve(base.value(key), local.value(key), remote.value(key));
        if (slot.value.isUndefined()) {
            merged.remove(key);
        } else {
            merged.insert(key, slot.value);
        }
    }
    return merged;
}

GraphMergeResult replaced(const QJsonObject& local, const QJsonObject& remote) {
    return {local, {{"document", "document", "document", "replaced", remote, local}}};
}
} // namespace

GraphMergeResult mergeWorkflowGraphs(const QJsonObject& base, const QJsonObject& local, const QJsonObject& remote,
                                     const QJsonArray& ops) {
    // A write with no ops (another client's autosave, a restore) replaces the document.
    if (ops.isEmpty()) { return replaced(local, remote); }
    const auto touches = touchesFor(ops);
    QList<GraphMergeConflict> conflicts;
    auto edges = mergeCollection("edge", edgeKey, base.value("edges").toArray(), local.value("edges").toArray(),
                                 remote.value("edges").toArray(), touches, conflicts);
    const auto nodes = mergeCollection("node", nodeKey, base.value("nodes").toArray(), local.value("nodes").toArray(),
                                       remote.value("nodes").toArray(), touches, conflicts);
    // An edge whose endpoint no longer exists is dropped and listed.
    QSet<QString> nodeIds;
    for (const auto& value : nodes) { nodeIds.insert(nodeKey(value.toObject())); }
    QJsonArray connected;
    for (const auto& value : edges) {
        const auto edge = value.toObject();
        if (nodeIds.contains(edge.value("source").toString()) && nodeIds.contains(edge.value("target").toString())) {
            connected.append(edge);
        } else {
            conflicts.append({"edge", edgeKey(edge), unitLabel("edge", edge), "dangling", QJsonValue::Null,
                              QJsonValue(QJsonValue::Undefined)});
        }
    }
    auto merged = mergeRootMembers(local, base, local, remote, {"nodes", "edges", "links"});
    merged.insert("nodes", nodes);
    merged.insert("edges", connected);
    const auto links = mergeLinks(base.value("links").toArray(), local.value("links").toArray(),
                                  remote.value("links").toArray());
    if (!links.isEmpty() || local.contains("links")) {
        merged.insert("links", links);
    } else {
        merged.remove("links");
    }
    return {merged, conflicts};
}

GraphMergeResult mergeWorkflowSnapshots(const QJsonObject& base, const QJsonObject& local, const QJsonObject& remote,
                                        const QJsonArray& ops) {
    if (ops.isEmpty()) { return replaced(local, remote); }
    auto result = mergeWorkflowGraphs(base.value("graph").toObject(), local.value("graph").toObject(),
                                      remote.value("graph").toObject(), ops);
    auto merged = mergeRootMembers(local, base, local, remote, {"graph", "updated_at", "etag"});
    merged.insert("graph", result.graph);
    for (const auto* key : {"updated_at", "etag"}) {
        if (remote.contains(QLatin1String(key))) {
            merged.insert(QLatin1String(key), remote.value(QLatin1String(key)));
        } else {
            merged.remove(QLatin1String(key));
        }
    }
    result.graph = merged;
    return result;
}
} // namespace nodetool::node_editor
