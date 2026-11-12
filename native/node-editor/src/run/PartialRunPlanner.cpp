#include "PartialRunPlanner.h"
#include <QJsonDocument>
#include <algorithm>
#include <array>
#include <charconv>
#include <cmath>
#include <cstdint>
namespace nodetool::node_editor {
namespace {
bool groupNode(const QJsonObject &node) {
  const auto type = node["type"].toString();
  return type == "group" || type == "nodetool.workflows.base_node.Group" || type == "nodetool.workflows.Group";
}
bool editorNode(const QJsonObject &node) {
  const auto type = node["type"].toString();
  return groupNode(node) || type == "comment" || type == "nodetool.workflows.base_node.Comment" || type == "nodetool.workflows.Comment";
}
QString hash(const QString &text) {
  std::uint32_t first = 0xdeadbeef, second = 0x41c6ce57;
  for (const auto character : text) {
    first = (first ^ character.unicode()) * 2654435761u;
    second = (second ^ character.unicode()) * 1597334677u;
  }
  first = (first ^ (first >> 16)) * 2246822507u;
  first ^= (second ^ (second >> 13)) * 3266489909u;
  second = (second ^ (second >> 16)) * 2246822507u;
  second ^= (first ^ (first >> 13)) * 3266489909u;
  return QStringLiteral("%1%2").arg(second, 8, 16, QLatin1Char('0')).arg(first, 8, 16, QLatin1Char('0'));
}
QString primitive(const QJsonValue &value) {
  if (!value.isDouble()) {
    const auto bytes = QJsonDocument(QJsonArray{value}).toJson(QJsonDocument::Compact);
    return QString::fromUtf8(bytes.mid(1, bytes.size() - 2));
  }
  const auto number = value.toDouble();
  std::array<char, 64> buffer{};
  const auto converted = std::to_chars(buffer.data(), buffer.data() + buffer.size(), number, std::chars_format::general);
  auto text = QString::fromLatin1(buffer.data(), converted.ptr - buffer.data());
  if (number == 0) { return QStringLiteral("0"); }
  const auto separator = text.indexOf('e');
  if (separator < 0) { return text; }
  const auto exponent = text.mid(separator + 1).toInt();
  const auto mantissa = text.left(separator);
  if (std::abs(number) >= 1e-6 && std::abs(number) < 1e21) {
    auto digits = mantissa; const bool negative = digits.startsWith('-');
    if (negative) { digits.remove(0, 1); }
    auto point = digits.indexOf('.'); if (point < 0) { point = digits.size(); } else { digits.remove(point, 1); }
    point += exponent;
    if (point <= 0) { digits = "0." + QString(-point, '0') + digits; }
    else if (point >= digits.size()) { digits += QString(point - digits.size(), '0'); }
    else { digits.insert(point, '.'); }
    return negative ? '-' + digits : digits;
  }
  return mantissa + 'e' + (exponent >= 0 ? QStringLiteral("+") : QString{}) + QString::number(exponent);
}
QString canonical(const QJsonValue &value) {
  if (value.isUndefined() || value.isNull()) { return QStringLiteral("null"); }
  if (value.isArray()) {
    QStringList parts;
    for (const auto &item : value.toArray()) { parts.append(canonical(item)); }
    return '[' + parts.join(',') + ']';
  }
  if (value.isObject()) {
    const auto object = value.toObject();
    auto asset = object["asset_id"];
    if (asset.isNull() || asset.isUndefined()) { asset = object["assetId"]; }
    if (asset.isNull() || asset.isUndefined()) { asset = object["uri"]; }
    if (asset.isString() && !asset.toString().isEmpty()) { return QStringLiteral("asset:") + asset.toString(); }
    auto keys = object.keys(); std::sort(keys.begin(), keys.end());
    QStringList parts;
    for (const auto &key : keys) { parts.append(primitive(key) + ':' + canonical(object[key])); }
    return '{' + parts.join(',') + '}';
  }
  return primitive(value);
}
QString config(const QJsonObject &node, const QSet<QString> &fed = {}) {
  auto properties = node["data"].toObject(); auto dynamic = node["dynamic_properties"].toObject();
  for (const auto &key : fed) { properties.remove(key); dynamic.remove(key); }
  return canonical(QJsonObject{{"p", properties}, {"d", dynamic}});
}
QString joined(const QStringList &parts) { return parts.join(QChar(0)); }
QStringList selected(const QJsonObject &node) {
  QStringList result;
  for (const auto &value : node["ui_properties"].toObject()["selected_generations"].toArray()) { if (value.isString()) { result.append(value.toString()); } }
  return result;
}
QJsonValue liveValue(const QJsonObject &node, const QString &handle) {
  const auto dynamic = node["dynamic_properties"].toObject(), properties = node["data"].toObject();
  if (!handle.isEmpty() && dynamic.contains(handle)) { return dynamic[handle]; }
  if (dynamic.contains("value")) { return dynamic["value"]; }
  if (!handle.isEmpty() && properties.contains(handle)) { return properties[handle]; }
  return properties.contains("value") ? properties["value"] : QJsonValue(QJsonValue::Undefined);
}
}
PartialRunPlanner::PartialRunPlanner(QJsonObject snapshot, QJsonArray metadata,
                                     ExecutionGenerations generations, qint64 now)
    : snapshot_(std::move(snapshot)), generations_(std::move(generations)), now_(now) {
  const auto graph = snapshot_["graph"].toObject();
  if (!graph["nodes"].isArray() || !graph["edges"].isArray()) { error_ = "Workflow requires graph nodes and edges"; return; }
  for (const auto &value : metadata) { const auto entry = value.toObject(); metadata_.insert(entry["node_type"].toString(entry["type"].toString()), entry); }
  for (const auto &value : graph["nodes"].toArray()) {
    const auto node = value.toObject(); const auto id = node["id"].toString();
    if (id.isEmpty() || nodes_.contains(id)) { error_ = "Invalid or duplicate node ID"; return; }
    nodes_.insert(id, node);
  }
  QHash<QString, QString> parents;
  for (auto it = nodes_.cbegin(); it != nodes_.cend(); ++it) {
    const auto rawParent = it.value()["parent_id"];
    if (!rawParent.isUndefined() && !rawParent.isNull() && !rawParent.isString()) { error_ = "Run selected requires string parent IDs"; return; }
    const auto parent = rawParent.toString();
    if (!parent.isEmpty() && (!nodes_.contains(parent) || !groupNode(nodes_.value(parent)))) {
      error_ = "Run selected requires existing group parents"; return;
    }
    parents.insert(it.key(), parent);
    children_[parent].append(it.key());
  }
  QSet<QString> complete;
  for (auto it = parents.cbegin(); it != parents.cend(); ++it) {
    QSet<QString> path; auto current = it.key();
    while (!current.isEmpty() && !complete.contains(current)) {
      if (path.contains(current)) { error_ = "Run selected refuses cyclic group parents"; return; }
      path.insert(current); current = parents.value(current);
    }
    complete.unite(path);
  }
  for (const auto &value : graph["edges"].toArray()) {
    const auto edge = value.toObject();
    if (!nodes_.contains(edge["source"].toString()) || !nodes_.contains(edge["target"].toString())) { error_ = "Run selected requires edges with existing endpoints"; return; }
    if (editorNode(nodes_.value(edge["source"].toString())) || editorNode(nodes_.value(edge["target"].toString()))) { continue; }
    signatureInbound_[edge["target"].toString()].append(edge);
    if (nodes_.value(edge["source"].toString())["ui_properties"].toObject()["bypassed"].toBool() || nodes_.value(edge["target"].toString())["ui_properties"].toObject()["bypassed"].toBool()) { continue; }
    inbound_[edge["target"].toString()].append(edge);
  }
}
void PartialRunPlanner::preferJob(const QString &jobId) { preferredJob_ = jobId; signatures_.clear(); decisions_.clear(); }
PartialRunPlanner::Kind PartialRunPlanner::kind(const QString &id) const {
  const auto node = nodes_.value(id); const auto type = node["type"].toString();
  if (node["ui_properties"].toObject()["bypassed"].toBool()) { return Kind::Computed; }
  if (type.startsWith("nodetool.constant.") || type.startsWith("nodetool.input.")) { return Kind::Constant; }
  return metadata_.value(type)["auto_save_asset"].toBool() ? Kind::Generative : Kind::Computed;
}
const ExecutionGeneration *PartialRunPlanner::generation(const QString &id, bool matching) {
  const auto found = generations_.constFind(id);
  if (found == generations_.cend()) { return nullptr; }
  const auto &history = *found;
  const QJsonValue pinned = nodes_.value(id)["ui_properties"].toObject()["selected_generation"];
  const auto signature = matching ? inputSignature(id) : QString{};
  if (!matching && !preferredJob_.isEmpty()) {
    for (auto entry = history.crbegin(); entry != history.crend(); ++entry) { if (entry->jobId == preferredJob_) { return &*entry; } }
  }
  if (!matching && pinned.isString()) {
    for (const auto &entry : history) { if (entry.id == pinned.toString()) { return &entry; } }
    return nullptr;
  }
  for (auto entry = history.crbegin(); entry != history.crend(); ++entry) {
    if (!matching || entry->inputSignature == signature) { return &*entry; }
  }
  return nullptr;
}
QString PartialRunPlanner::identity(const QString &id) {
  if (!nodes_.contains(id)) { return hash(joined({"missing", id})); }
  if (kind(id) == Kind::Constant) { return hash(joined({"const", nodes_.value(id)["type"].toString(), config(nodes_.value(id))})); }
  if (kind(id) == Kind::Generative) {
    const auto current = generation(id);
    if (!preferredJob_.isEmpty() && current && current->jobId == preferredJob_) { return current->id; }
    const auto pins = selected(nodes_.value(id));
    if (pins.size() >= 2) { return hash(joined(QStringList{"multiselect"} + pins)); }
    return current ? current->id : QString::fromUtf8("∅");
  }
  return inputSignature(id);
}
QString PartialRunPlanner::inputSignature(const QString &id) {
  if (signatures_.contains(id)) { return signatures_.value(id); }
  if (hashing_.contains(id)) { return QStringLiteral("cycle:") + id; }
  if (!nodes_.contains(id)) { return hash(joined({"missing", id})); }
  hashing_.insert(id);
  QStringList upstream; QSet<QString> fed;
  for (const auto &edge : signatureInbound_.value(id)) {
    const auto handle = edge["targetHandle"].toString(); if (handle.isEmpty()) { continue; }
    fed.insert(handle);
    upstream.append(handle + '=' + identity(edge["source"].toString()) + '@' + edge["sourceHandle"].toString());
  }
  std::sort(upstream.begin(), upstream.end());
  const auto node = nodes_.value(id);
  const auto signature = hash(joined({"v1", node["type"].toString(), config(node, fed), node["ui_properties"].toObject()["bypassed"].toBool() ? "true" : "false", upstream.join('|')}));
  hashing_.remove(id); signatures_.insert(id, signature); return signature;
}
PartialRunPlanner::Decision PartialRunPlanner::decide(const QString &id) {
  if (forced_.contains(id)) { return Decision::Run; }
  if (decisions_.contains(id)) { return decisions_.value(id); }
  if (deciding_.contains(id)) { return Decision::Run; }
  deciding_.insert(id);
  const auto compute = [&] {
    if (kind(id) == Kind::Constant) { return Decision::Reuse; }
    if (kind(id) == Kind::Generative) {
      const auto pins = selected(nodes_.value(id));
      if (pins.size() >= 2) {
        for (const auto &entry : generations_.value(id)) { if (pins.contains(entry.id)) { return Decision::Replay; } }
        return Decision::Block;
      }
      return generation(id) ? Decision::Reuse : Decision::Block;
    }
    if (preview_ && generation(id)) { return Decision::Reuse; }
    bool upstreamRuns = false;
    for (const auto &edge : signatureInbound_.value(id)) {
      const auto decision = decide(edge["source"].toString());
      if (decision == Decision::Block) { return Decision::Block; }
      upstreamRuns = upstreamRuns || decision == Decision::Run || decision == Decision::Replay;
    }
    const auto cached = generation(id, true);
    const auto type = nodes_.value(id)["type"].toString();
    const auto ttl = type == "nodetool.control.Reroute" ? QJsonValue("forever") : metadata_.value(type)["cache_ttl"];
    const bool fresh = cached && (ttl == "forever" || (ttl.isDouble() && ttl.toDouble() > 0 && now_ >= cached->createdAt && now_ - cached->createdAt < ttl.toDouble() * 1000));
    return !upstreamRuns && fresh ? Decision::Reuse : Decision::Run;
  };
  const auto decision = compute(); deciding_.remove(id); decisions_.insert(id, decision); return decision;
}
QJsonValue PartialRunPlanner::output(const ExecutionGeneration &entry, const QString &handle) const {
  if (!handle.isEmpty() && entry.outputs.contains(handle)) { return entry.outputs[handle]; }
  if (entry.outputs.size() == 1) { return entry.outputs.begin().value(); }
  return entry.outputs.isEmpty() ? QJsonValue(QJsonValue::Undefined) : QJsonValue(entry.outputs);
}
QString PartialRunPlanner::title(const QString &id) const {
  const auto node = nodes_.value(id); return node["ui_properties"].toObject()["title"].toString(metadata_.value(node["type"].toString())["title"].toString(id));
}
PartialRunPlan PartialRunPlanner::plan(const QStringList &targets) {
  PartialRunPlan result;
  const auto fail = [&](const QString &error) { result.error = error; return result; };
  if (!error_.isEmpty()) { return fail(error_); }
  if (targets.isEmpty()) { return fail("Select nodes to run"); }
  QSet<QString> included, expanded; QStringList pending;
  QStringList expand = targets;
  while (!expand.isEmpty()) {
    const auto id = expand.takeLast();
    if (!nodes_.contains(id)) { return fail("Unknown selected node ID: " + id); }
    if (expanded.contains(id)) { continue; }
    expanded.insert(id);
    const auto node = nodes_.value(id);
    if (groupNode(node)) { expand.append(children_.value(id)); continue; }
    if (editorNode(node)) { continue; }
    if (!node["ui_properties"].toObject()["bypassed"].toBool()) { included.insert(id); pending.append(id); }
  }
  if (included.isEmpty()) { return fail("Selection contains no enabled runnable nodes. Select runnable nodes or a group containing them."); }
  forced_ = included; decisions_.clear();
  struct Inlined { QJsonObject edge; QJsonValue value; };
  QList<Inlined> inlined;
  QJsonArray replayNodes, replayEdges; QSet<QString> replayIds;
  while (!pending.isEmpty()) {
    const auto target = pending.takeLast();
    for (const auto &edge : inbound_.value(target)) {
      const auto source = edge["source"].toString(); if (included.contains(source)) { continue; }
      const auto handle = edge["targetHandle"].toString();
      const auto type = nodes_.value(source)["type"].toString();
      const bool data = edge["edge_type"].toString().isEmpty() || edge["edge_type"] == "data";
      const auto decision = decide(source);
      if (decision == Decision::Block && kind(source) == Kind::Generative) {
        if (!result.blocked.contains(source)) { result.blocked.append(source); } continue;
      }
      if (data && !handle.isEmpty() && decision == Decision::Replay) {
        QJsonArray values;
        const auto pins = selected(nodes_.value(source));
        for (const auto &pin : pins) {
          for (const auto &entry : generations_.value(source)) {
            if (entry.id != pin) { continue; }
            if (!entry.inputSignature.isEmpty() && entry.inputSignature != inputSignature(source) && !result.stale.contains(source)) { result.stale.append(source); }
            const auto value = output(entry, edge["sourceHandle"].toString());
            if (value.isArray()) { for (const auto &item : value.toArray()) { if (!item.isNull()) { values.append(item); } } }
            else if (!value.isUndefined() && !value.isNull()) { values.append(value); }
            break;
          }
        }
        if (values.isEmpty()) { if (!result.blocked.contains(source)) { result.blocked.append(source); } continue; }
        const auto replayId = "replay:" + source + ':' + edge["sourceHandle"].toString() + "->" + target + ':' + handle;
        if (!replayIds.contains(replayId)) {
          if (nodes_.contains(replayId)) { return fail("Replay node ID collides with an existing node"); }
          replayIds.insert(replayId);
          replayNodes.append(QJsonObject{{"id", replayId}, {"type", "nodetool.control.ForEach"}, {"data", QJsonObject{{"input_list", values}, {"limit", -1}}}});
          replayEdges.append(QJsonObject{{"id", replayId + "->" + target + ':' + handle}, {"source", replayId}, {"sourceHandle", "output"}, {"target", target}, {"targetHandle", handle}});
        }
        if (!result.reused.contains(source)) { result.reused.append(source); }
        continue;
      }
      if (data && !handle.isEmpty() && decision == Decision::Reuse) {
        QJsonValue value(QJsonValue::Undefined);
        if (kind(source) == Kind::Constant) { value = liveValue(nodes_.value(source), edge["sourceHandle"].toString()); }
        else if (const auto cached = generation(source, kind(source) == Kind::Computed)) { value = output(*cached, edge["sourceHandle"].toString()); }
        else if (const auto current = preview_ ? generation(source) : nullptr) {
          value = output(*current, edge["sourceHandle"].toString());
          if (!result.stale.contains(source)) { result.stale.append(source); }
        }
        if (!value.isUndefined()) {
          inlined.append({edge, value});
          if (!result.reused.contains(source)) { result.reused.append(source); }
          if (kind(source) == Kind::Generative) {
            const auto cached = generation(source);
            if (cached && !cached->inputSignature.isEmpty() && cached->inputSignature != inputSignature(source) && !result.stale.contains(source)) { result.stale.append(source); }
          }
          continue;
        }
        if (kind(source) == Kind::Generative) { if (!result.blocked.contains(source)) { result.blocked.append(source); } continue; }
      }
      // Missing/replay values on a control dependency cannot execute an
      // unselected generator as a side effect.
      if (kind(source) == Kind::Generative) { if (!result.blocked.contains(source)) { result.blocked.append(source); } continue; }
      if (metadata_.value(type).isEmpty() && kind(source) != Kind::Constant) { return fail("Load metadata for upstream node " + source); }
      included.insert(source); pending.append(source);
    }
  }
  if (!result.blocked.isEmpty()) {
    QStringList names; for (const auto &id : result.blocked) { names.append(title(id)); }
    return fail("Missing usable generation for generative upstream " + names.join(", ") + ". Select a completed generation or explicitly include these nodes to run them.");
  }
  QSet<QString> liveHandles;
  for (const auto &value : snapshot_["graph"].toObject()["edges"].toArray()) {
    const auto edge = value.toObject();
    if (included.contains(edge["source"].toString()) && included.contains(edge["target"].toString())) { liveHandles.insert(joined({edge["target"].toString(), edge["targetHandle"].toString()})); }
  }
  // A connected live input replaces authored property defaults in the kernel.
  // Preserve cached list contributors as ordinary constant edges instead of
  // putting their values in a default that would be silently discarded.
  QSet<QString> replayHandles;
  for (const auto &value : replayEdges) { const auto edge = value.toObject(); replayHandles.insert(joined({edge["target"].toString(), edge["targetHandle"].toString()})); }
  QHash<QString, QJsonArray> cachedFeeders;
  QHash<QString, QJsonObject> cachedEdges;
  QSet<QString> feederIds;
  for (const auto &entry : inlined) {
    const auto source = entry.edge["source"].toString();
    const auto target = entry.edge["target"].toString();
    const auto handle = entry.edge["targetHandle"].toString();
    if (included.contains(source)) { continue; }
    if (replayHandles.contains(joined({target, handle}))) { return fail("Cached and replay values feed the same input. Select all contributing upstream nodes explicitly."); }
    if (!liveHandles.contains(joined({target, handle}))) { continue; }
    const auto node = nodes_.value(target);
    auto input = node["dynamic_inputs"].toObject()[handle].toObject();
    for (const auto &item : metadata_.value(node["type"].toString())["properties"].toArray()) {
      const auto property = item.toObject(); if (property["name"] == handle) { input = property; break; }
    }
    if (input["type"].toObject()["type"] != "list") {
      return fail("Cached and live values feed the same input. Explicitly select all contributing upstream nodes before running this selection.");
    }
    const auto edgeKey = canonical(entry.edge);
    const auto feederId = "cached:" + hash(edgeKey);
    if (nodes_.contains(feederId) || feederIds.contains(feederId)) { return fail("Cached feeder node ID collides with an existing node"); }
    feederIds.insert(feederId);
    cachedFeeders[source].append(QJsonObject{{"id",feederId},{"type","nodetool.input.ValueInput"},{"data",QJsonObject{{"value",entry.value}}}});
    auto edge = entry.edge; edge["source"] = feederId; edge["sourceHandle"] = "output";
    cachedEdges.insert(edgeKey, edge);
  }
  QHash<QString, QHash<QString, QJsonArray>> overrides;
  for (const auto &entry : inlined) { if (!included.contains(entry.edge["source"].toString()) && !cachedEdges.contains(canonical(entry.edge))) { overrides[entry.edge["target"].toString()][entry.edge["targetHandle"].toString()].append(entry.value); } }
  QJsonArray plannedNodes, plannedEdges;
  const auto graph = snapshot_["graph"].toObject();
  for (const auto &value : graph["nodes"].toArray()) {
    auto node = value.toObject(); const auto id = node["id"].toString();
    for (const auto &feeder : cachedFeeders.value(id)) { plannedNodes.append(feeder); }
    if (!included.contains(id)) { continue; }
    auto properties = node["data"].toObject(), dynamic = node["dynamic_properties"].toObject();
    const auto changes = overrides.value(id);
    for (auto entry = changes.cbegin(); entry != changes.cend(); ++entry) {
      const auto values = entry.value(); QJsonValue value = values.last();
      if (values.size() > 1) {
        auto input = node["dynamic_inputs"].toObject()[entry.key()].toObject();
        for (const auto &item : metadata_.value(node["type"].toString())["properties"].toArray()) { const auto property = item.toObject(); if (property["name"] == entry.key()) { input = property; break; } }
        const auto type = input["type"].toObject(); const auto arguments = type["type_args"].toArray();
        if (type["type"] == "list" && arguments.size() == 1 && arguments.first().toObject()["type"] != "any") { value = values; }
      }
      if (dynamic.contains(entry.key())) { dynamic[entry.key()] = value; } else { properties[entry.key()] = value; }
    }
    if (!changes.isEmpty()) { node["data"] = properties; if (node.contains("dynamic_properties")) { node["dynamic_properties"] = dynamic; } }
    plannedNodes.append(node); result.executed.append(id); result.signatures.insert(id, inputSignature(id));
  }
  for (const auto &value : graph["edges"].toArray()) {
    const auto edge = value.toObject(); const auto feeder = cachedEdges.constFind(canonical(edge));
    if (feeder != cachedEdges.cend()) { plannedEdges.append(*feeder); }
    else if (included.contains(edge["source"].toString()) && included.contains(edge["target"].toString())) { plannedEdges.append(edge); }
  }
  for (const auto &node : replayNodes) { plannedNodes.append(node); }
  for (const auto &edge : replayEdges) { plannedEdges.append(edge); }
  result.reused.removeIf([&](const auto &id) { return included.contains(id); });
  result.stale.removeIf([&](const auto &id) { return included.contains(id); });
  auto plannedGraph = graph; plannedGraph["nodes"] = plannedNodes; plannedGraph["edges"] = plannedEdges;
  if (graph["links"].isArray()) {
    QJsonArray links;
    for (const auto &value : graph["links"].toArray()) { const auto edge = value.toObject(); if (included.contains(edge["source"].toString()) && included.contains(edge["target"].toString())) { links.append(edge); } }
    plannedGraph["links"] = links;
  }
  result.snapshot = snapshot_; result.snapshot["graph"] = plannedGraph; result.ok = true; return result;
}
void ExecutionGenerationStore::clear() { submissions_.clear(); workflows_.clear(); persisted_.clear(); order_.clear(); bytes_ = 0; }
void ExecutionGenerationStore::replacePersisted(const QString &workflowId, const ExecutionGenerations &generations) {
  if (generations.isEmpty()) { persisted_.remove(workflowId); } else { persisted_.insert(workflowId, generations); }
}
ExecutionGenerations ExecutionGenerationStore::generations(const QString &workflowId) const {
  auto result = persisted_.value(workflowId);
  const auto live = workflows_.value(workflowId);
  for (auto node = live.cbegin(); node != live.cend(); ++node) {
    QHash<QString, int> persistedSlots;
    for (const auto &entry : result.value(node.key())) { if (!entry.jobId.isEmpty()) { ++persistedSlots[entry.jobId]; } }
    for (const auto &entry : node.value()) {
      const auto index = entry.id == entry.jobId ? 0 : entry.id.mid(entry.jobId.size()+1).toInt();
      if (entry.jobId.isEmpty() || index >= persistedSlots.value(entry.jobId)) { result[node.key()].append(entry); }
    }
  }
  return result;
}
void ExecutionGenerationStore::submitted(const QString &jobId, const QJsonObject &snapshot, const QJsonArray &metadata, const QStringList &executed) {
  Submission submission; submission.snapshot = snapshot; submission.metadata = metadata;
  for (const auto &id : executed) { submission.executed.insert(id); }
  submissions_.insert(jobId, submission);
}
void ExecutionGenerationStore::ingest(const QString &jobId, const QJsonObject &event, qint64 now) {
  auto submission = submissions_.find(jobId);
  if (submission == submissions_.end()) { return; }
  if (event["type"] == "job_update" || event["type"] == "job_resumed") {
    const auto status = event["status"].toString();
    if (status == "completed" || status == "finished" || status == "failed" || status == "cancelled") { submissions_.erase(submission); }
    return;
  }
  const auto nodeId = event["node_id"].toString(); if (!submission->executed.contains(nodeId)) { return; }
  if (event["type"] == "node_update") {
    const auto status = event["status"].toString();
    if (status == "running" || status == "starting" || status == "booting") { submission->activeAt[nodeId] = now; }
    return;
  }
  if (event["type"] != "generation_complete" || !event["outputs"].isObject()) { return; }
  const auto outputs = event["outputs"].toObject();
  // An execution cache is lossless. Oversized values cause a cache miss, never
  // preview truncation masquerading as the real output.
  if (QJsonDocument(outputs).toJson(QJsonDocument::Compact).size() > 8 * 1024 * 1024) { return; }
  auto &workflow = workflows_[submission->snapshot["id"].toString()];
  const auto indexValue = event["index"];
  if (!indexValue.isUndefined() && (!indexValue.isDouble() || indexValue.toDouble() < 0 || std::floor(indexValue.toDouble()) != indexValue.toDouble() || indexValue.toDouble() > 1000000)) { return; }
  const auto index = indexValue.isUndefined() ? submission->indices.value(nodeId) : indexValue.toInt();
  submission->indices[nodeId] = std::max(submission->indices.value(nodeId), index + 1);
  const auto generationId = index == 0 ? jobId : jobId + '#' + QString::number(index);
  auto &history = workflow[nodeId];
  if (std::any_of(history.cbegin(), history.cend(), [&](const auto &entry) { return entry.id == generationId; })) { return; }
  PartialRunPlanner planner(submission->snapshot, submission->metadata, workflow, now); planner.preferJob(jobId);
  history.append({generationId, jobId, index == 0 ? submission->activeAt.value(nodeId, now) : now, outputs, planner.inputSignature(nodeId)});
  // Eviction invalidates reuse, without destroying the active submission stamp.
  bytes_ += QJsonDocument(outputs).toJson(QJsonDocument::Compact).size();
  order_.append({submission->snapshot["id"].toString(), nodeId, generationId});
  while (bytes_ > 64 * 1024 * 1024 || order_.size() > 512) {
    const auto old = order_.takeFirst(); auto &entries = workflows_[old.workflow][old.node];
    for (auto entry = entries.begin(); entry != entries.end(); ++entry) {
      if (entry->id == old.generation) { bytes_ -= QJsonDocument(entry->outputs).toJson(QJsonDocument::Compact).size(); entries.erase(entry); break; }
    }
  }

}
}
