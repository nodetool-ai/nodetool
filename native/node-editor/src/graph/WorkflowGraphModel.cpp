#include "properties/CodeInference.h"
#include "WorkflowGraphModel.h"
#include "document/ChildPorts.h"
#include "document/ConnectionTypes.h"
#include "properties/PropertyFields.h"
#include <QJsonArray>
#include <QSet>
#include <QUuid>
#include <QtNodes/NodeData>
#include <QtNodes/NodeStyle>
#include <QtNodes/StyleCollection>
using namespace QtNodes;
namespace nodetool {
WorkflowGraphModel::WorkflowGraphModel(QObject *p) { setParent(p); }
NodeId WorkflowGraphModel::newNodeId() { return next_++; }
QString WorkflowGraphModel::resourceId(NodeId id) const {
  return nodes_.value(id)["id"].toString();
}
namespace {
// Position alone moves an item. Every other field can change the card.
bool samePresentation(QJsonObject before, QJsonObject after) {
  if (before == after) { return true; }
  auto beforeUi = before.take("ui_properties").toObject();
  auto afterUi = after.take("ui_properties").toObject();
  beforeUi.remove("position");
  afterUi.remove("position");
  return before == after && beforeUi == afterUi;
}
QSet<QString> changedDisplayNodes(const QHash<QString, QString> &before, const QHash<QString, QString> &after, bool keyed) {
  QSet<QString> result;
  const auto node = [keyed](const QString &key) { return keyed ? key.section(QChar(0), 0, 0) : key; };
  for (auto it = before.cbegin(); it != before.cend(); ++it) {
    if (after.value(it.key()) != it.value()) { result.insert(node(it.key())); }
  }
  for (auto it = after.cbegin(); it != after.cend(); ++it) {
    if (!before.contains(it.key())) { result.insert(node(it.key())); }
  }
  return result;
}
} // namespace
void WorkflowGraphModel::invalidateNode(NodeId id) {
  inputs_.remove(id);
  outputs_.remove(id);
  layouts_.remove(id);
}
void WorkflowGraphModel::project(const QJsonObject &snapshot,
                                 const QJsonArray &catalog, bool readOnly) {
  emit projectionAboutToChange();
  const bool wrapped = snapshot.contains("graph");
  const auto graph = wrapped ? snapshot["graph"].toObject() : snapshot;
  const auto workflowId = wrapped ? snapshot["id"].toString() : QString{};
  // Items cache read-only flags, and every card reads the catalog, so a change
  // of either, another workflow, or the first projection rebuilds the scene.
  const bool reset = !projected_ || readOnly != readOnly_ || workflowId != workflowId_ || catalog != catalog_;
  projected_ = true;
  workflowId_ = workflowId;
  readOnly_ = readOnly;
  catalog_ = catalog;
  const auto rawNodes = graph["nodes"].toArray();
  QHash<NodeId, QJsonObject> nodes;
  for (const auto &v : rawNodes) {
    const auto n = v.toObject();
    const auto id = n["id"].toString();
    if (!ids_.contains(id)) { ids_[id] = newNodeId(); }
    nodes[ids_[id]] = n;
  }
  const auto edges = graph["edges"].toArray();
  QHash<QString, QJsonArray> incident;
  for (const auto &v : edges) {
    const auto e = v.toObject();
    const auto source = e["source"].toString(), target = e["target"].toString();
    incident[source].append(e);
    if (target != source) { incident[target].append(e); }
  }
  if (reset) {
    inputs_.clear();
    outputs_.clear();
    layouts_.clear();
    nodes_ = nodes;
    edges_ = edges;
    incident_ = incident;
    deriveProjection(rawNodes);
    emit modelReset();
    emit projectionChanged();
    return;
  }
  QVector<NodeId> removed, created, updated;
  for (auto it = nodes_.cbegin(); it != nodes_.cend(); ++it) {
    if (!nodes.contains(it.key())) { removed.append(it.key()); }
  }
  for (auto it = nodes.cbegin(); it != nodes.cend(); ++it) {
    const auto previous = nodes_.constFind(it.key());
    if (previous == nodes_.cend()) { created.append(it.key()); continue; }
    const auto resource = it.value()["id"].toString();
    if (!samePresentation(*previous, it.value()) || incident_.value(resource) != incident.value(resource)) {
      updated.append(it.key());
    }
  }
  for (const auto id : removed) { invalidateNode(id); }
  for (const auto id : created) { invalidateNode(id); }
  for (const auto id : updated) { invalidateNode(id); }
  const auto previousPositions = positions_;
  const auto previousDisplay = displayTypes_;
  std::unordered_set<ConnectionId> previousConnections;
  for (const auto &entry : edgeByConnection_) { previousConnections.insert(entry.first); }
  nodes_ = nodes;
  edges_ = edges;
  incident_ = incident;
  deriveProjection(rawNodes);
  // Reroute and forward wire colors follow types resolved across the graph.
  auto repaint = changedDisplayNodes(previousDisplay.sources, displayTypes_.sources, true);
  repaint.unite(changedDisplayNodes(previousDisplay.rerouteHandles, displayTypes_.rerouteHandles, false));
  QSet<NodeId> changed(updated.cbegin(), updated.cend());
  for (const auto &resource : repaint) {
    const auto id = ids_.value(resource, InvalidNodeId);
    if (nodes_.contains(id) && previousPositions.contains(id)) { changed.insert(id); }
  }
  // Removal runs before creation, so a wire never outlives an end node and a
  // new wire always finds both items.
  for (const auto &connection : previousConnections) {
    if (!edgeByConnection_.contains(connection)) { emit connectionDeleted(connection); }
  }
  for (const auto id : removed) { emit nodeDeleted(id); }
  for (const auto id : created) { emit nodeCreated(id); }
  for (const auto id : changed) { emit nodeUpdated(id); }
  for (auto it = previousPositions.cbegin(); it != previousPositions.cend(); ++it) {
    const auto next = positions_.constFind(it.key());
    if (next != positions_.cend() && *next != it.value()) { emit nodePositionUpdated(it.key()); }
  }
  for (const auto &entry : edgeByConnection_) {
    if (!previousConnections.contains(entry.first)) { emit connectionCreated(entry.first); }
  }
  emit projectionChanged();
}
void WorkflowGraphModel::deriveProjection(const QJsonArray &rawNodes) {
  adjacency_.clear();
  edgeByConnection_.clear();
  positions_.clear();
  depths_.clear();
  children_.clear();
  QVector<NodeId> pending;
  for (auto it = nodes_.cbegin(); it != nodes_.cend(); ++it) {
    const auto parent = ids_.value(it.value()["parent_id"].toString(), InvalidNodeId);
    if (nodeExists(parent) && isGroup(parent) && parent != it.key()) {
      children_[parent].append(it.key());
    } else { pending.append(it.key()); }
  }
  for (qsizetype i = 0; i < pending.size(); ++i) {
    const auto id = pending[i];
    const auto local = nodes_.value(id)["ui_properties"].toObject()["position"].toObject();
    const auto parent = ids_.value(nodes_.value(id)["parent_id"].toString(), InvalidNodeId);
    positions_[id] = QPointF(local["x"].toDouble(), local["y"].toDouble()) + positions_.value(parent);
    depths_[id] = positions_.contains(parent) ? depths_.value(parent) + 1 : 0;
    pending += children_.value(id);
  }
  // Invalid cycles remain visible at their local coordinates, without recursion.
  for (auto it = nodes_.cbegin(); it != nodes_.cend(); ++it) {
    if (positions_.contains(it.key())) { continue; }
    const auto local = it.value()["ui_properties"].toObject()["position"].toObject();
    positions_[it.key()] = QPointF(local["x"].toDouble(), local["y"].toDouble());
  }
  displayTypes_=resolveForwardDisplayTypes(rawNodes,edges_,catalog_);
  for (auto v : edges_) {
    auto e = v.toObject();
    auto source = ids_.value(e["source"].toString(), InvalidNodeId),
         target = ids_.value(e["target"].toString(), InvalidNodeId);
    if (!nodeExists(source) || !nodeExists(target)) {
      continue;
    }
    auto out = ports(source, PortType::Out), in = ports(target, PortType::In);
    for (int x = 0; x < out.size(); ++x) {
      for (int y = 0; y < in.size(); ++y) {
        if (out[x].toObject()["name"] == e["sourceHandle"] &&
            in[y].toObject()["name"] == e["targetHandle"]) {
          ConnectionId connection{source, unsigned(x), target, unsigned(y)};
          edgeByConnection_.try_emplace(connection,e);
          adjacency_[source].insert(connection);
          adjacency_[target].insert(connection);
        }
      }
    }
  }
}
QJsonObject WorkflowGraphModel::metadata(NodeId id) const {
  const QJsonValue type = nodes_.value(id).value("type");
  for (const auto &v : catalog_) {
    const auto m = v.toObject();
    if (m["node_type"] == type || m["type"] == type) { return m; }
  }
  return {};
}
void WorkflowGraphModel::setRuntimeModel(node_editor::NodeRuntimeModel *runtime) {
  if (runtime_ == runtime) { return; }
  if (runtime_) { disconnect(runtime_, nullptr, this, nullptr); }
  runtime_ = runtime;
  previews_.clear();
  runtimeJob_ = runtime_ ? runtime_->selectedRunId() : QString{};
  if (runtime_) {
    connect(runtime_, &node_editor::NodeRuntimeModel::nodeChanged, this, [this](const QString &id) { refreshRuntimeNode(id); emit runtimeChanged(); });
    connect(runtime_, &node_editor::NodeRuntimeModel::projectionChanged, this, [this] {
      if (runtimeJob_ != runtime_->selectedRunId()) {
        runtimeJob_ = runtime_->selectedRunId();
        previews_.clear();
      }
      for (auto it = ids_.cbegin(); it != ids_.cend(); ++it) { refreshRuntimeNode(it.key()); }
      emit runtimeChanged();
    });
  }
  emit runtimeChanged();
}
void WorkflowGraphModel::refreshRuntimeNode(const QString &id) {
  const auto found = ids_.constFind(id);
  if (found == ids_.cend()) { return; }
  layouts_.remove(*found);
  emit nodeUpdated(*found);
}
void WorkflowGraphModel::setRuntimePreview(const QString &nodeId, const QImage &image) {
  if (!ids_.contains(nodeId)) { return; }
  if (image.isNull()) { previews_.remove(nodeId); }
  else { previews_[nodeId] = image.scaled(512, 512, Qt::KeepAspectRatio, Qt::SmoothTransformation); }
  refreshRuntimeNode(nodeId);
  emit runtimeChanged();
}
QImage WorkflowGraphModel::runtimePreview(NodeId id) const { return previews_.value(resourceId(id)); }
void WorkflowGraphModel::setCanvasMediaNodes(const QSet<QString> &nodes) {
  if (canvasMediaNodes_ == nodes) { return; }
  const auto affected = canvasMediaNodes_ | nodes;
  canvasMediaNodes_ = nodes;
  for (const auto &id : affected) { refreshRuntimeNode(id); }
}
QRectF WorkflowGraphModel::canvasPlaybackRect(NodeId id) const {
  if (!canvasMediaNodes_.contains(resourceId(id))) { return {}; }
  const auto size = layout(id).size;
  constexpr auto inset = node_metrics::padding + node_metrics::borderWidth;
  return QRectF(inset, size.height() - node_metrics::playbackHeight - node_metrics::rowHeight,
                size.width() - 2 * inset, node_metrics::playbackHeight);
}
QJsonObject WorkflowGraphModel::runtimeState(NodeId id) const {
  return runtime_ ? runtime_->nodeState(resourceId(id)) : QJsonObject{};
}
QJsonObject WorkflowGraphModel::runtimeEdgeState(ConnectionId id) const {
  return runtime_ ? runtime_->edgeState(edge(id)["id"].toString()) : QJsonObject{};
}
bool WorkflowGraphModel::runtimeConnected() const { return !runtime_ || runtime_->connected(); }
const NodeLayout &WorkflowGraphModel::layout(NodeId id) const {
  namespace nm = node_metrics;
  if (const auto cached = layouts_.constFind(id); cached != layouts_.cend()) { return *cached; }
  ++layoutBuilds_;
  const auto node = nodes_.value(id);
  const auto meta = metadata(id);
  const auto ui = node["ui_properties"].toObject();
  const auto typeOf = [](const QJsonObject &port) {
    const auto type = port["type"];
    return type.isString() ? type.toString() : type.toObject()["type"].toString();
  };
  NodeLayout result;
  result.unknown = meta.isEmpty();
  if (isReroute(id)) {
    result.size=QSize(node_metrics::rerouteWidth,node_metrics::rerouteHeight);
    result.minimumSize=result.size;result.unknown=false;
    result.inputY={node_metrics::rerouteHeight/2.0};result.outputY=result.inputY;
    return *layouts_.insert(id,result);
  }
  if (isGroup(id) || isComment(id)) {
    const auto data = node["data"].toObject();
    result.title = isGroup(id) ? data["headline"].toString() : QString{};
    if (isGroup(id) && result.title.isEmpty()) result.title = "Group";
    result.accent = QColor(data[isGroup(id) ? "group_color" : "comment_color"].toString());
    const auto minimumWidth = isGroup(id) ? 200 : 30;
    const auto minimumHeight = isGroup(id) ? 200 : 40;
    result.minimumSize = QSize(minimumWidth, minimumHeight);
    result.size = QSize(std::max(minimumWidth, ui["width"].toInt(isGroup(id) ? 400 : 300)),
                        std::max(minimumHeight, ui["height"].toInt(isGroup(id) ? 300 : 160)));
    return *layouts_.insert(id, result);
  }
  const auto type = node["type"].toString();
  // Ordinary ui titles are below-card notes in the web editor. Code nodes use
  // the same field as their header title and have no note surface.
  result.title = type == "nodetool.code.Code" ? ui["title"].toString(meta["title"].toString(type.section('.', -1)))
      : meta["title"].toString(type.section('.', -1));
  const auto outputs = ports(id, PortType::Out);
  const auto primary = outputs.isEmpty() ? QString{} : typeOf(outputs[0].toObject());
  result.icon = typeIcon(primary);
  result.accent = typeColor(primary);
    result.subgraph = type == "nodetool.workflows.subgraph.Subgraph";
    if (result.subgraph) {
        result.icon = "accountTree";
        result.title = node["data"].toObject()["title"].toString(result.title);
        const auto count = node_editor::childGraph(node)["nodes"].toArray().size();
        result.childCount = count == 0 ? tr("empty") : count == 1 ? tr("1 inner node") : tr("%1 inner nodes").arg(count);
    }
  for (const auto *key : {"outputs", "properties"}) {
    for (const auto &port : meta[key].toArray()) {
      const auto color = typeColor(typeOf(port.toObject()));
      if (!result.runningColors.contains(color)) { result.runningColors.append(color); }
    }
  }
  if (result.runningColors.isEmpty()) { result.runningColors.append(typeColor("any")); }
  while (result.runningColors.size() < 5) { result.runningColors.append(result.runningColors.last()); }
  result.runningColors.resize(5);
  QHash<QString, QVariantMap> fields;
  for (const auto &row : node_editor::propertyFields(node, meta, edges_)) {
    const auto map = row.toMap();
    fields.insert(map["name"].toString(), map);
  }
  QSet<QString> handleOnly;
  for (const auto &name : meta["input_fields"].toArray()) { handleOnly.insert(name.toString()); }
  for (const auto &name : ui["exposed_inputs"].toArray()) { handleOnly.insert(name.toString()); }
  for (const auto &key : {"exposed_inputs_hidden", "exposed_inputs_labeled"}) {
    for (const auto &name : ui[key].toArray()) { handleOnly.remove(name.toString()); }
  }
  const auto inputs = ports(id, PortType::In);
  result.inputY.resize(inputs.size());
  double y = nm::contentTop;
  const auto warning = result.unknown ? tr("Node metadata unavailable. Check runtimes and packs.") : meta["native_dependency_warning"].toString();
  if (!warning.isEmpty()) {
    NodeRow row; row.kind = NodeRowKind::Label; row.label = warning; row.y = y + nm::rowHeight / 2.0; row.height = nm::rowHeight;
    result.rows.append(row); y += nm::rowHeight;
  }
  const auto titleOf = [&](const QJsonObject &port) {
    return port["title"].toString(displayName(port["name"].toString()));
  };
  // A content card overlays its handle column on the preview, and the other
  // bodies reserve a band for it above their inline rows.
  const bool contentCard = meta["body"] == "content_card";
  bool anyHandle = false;
  for (int i = 0; i < inputs.size(); ++i) {
    const auto port = inputs[i].toObject();
    if (!handleOnly.contains(port["name"].toString())) { continue; }
    NodeRow row;
    row.kind = NodeRowKind::Handle;
    row.label = titleOf(port);
    row.typeName = typeOf(port);
    row.port = i;
    row.y = y + nm::rowHeight / 2.0;
    result.inputY[i] = row.y;
    result.rows.append(row);
    y += nm::handleRowStep;
    anyHandle = true;
  }
  if (anyHandle) { y -= nm::handleRowStep - nm::rowHeight; }
  double end = y;
  if (contentCard) {
    NodeRow row;
    row.kind = NodeRowKind::Preview;
    row.value = tr("Run to generate");
    row.y = nm::contentTop;
    row.height = std::max<double>(nm::previewHeight, y - nm::contentTop);
    result.rows.append(row);
    y = row.y + row.height + nm::micro;
    end = y - nm::micro;
  } else if (anyHandle) {
    y += nm::padding + nm::borderWidth;
    end = y;
  }
  bool first = true;
  for (int i = 0; i < inputs.size(); ++i) {
    const auto port = inputs[i].toObject();
    const auto name = port["name"].toString();
    if (handleOnly.contains(name)) { continue; }
    if (!first) { y += nm::inlineRowGap; }
    first = false;
    const auto field = fields.value(name);
    const auto kind = field["kind"].toString();
    const auto connected = field["connected"].toBool();
    auto value = field["value"];
    NodeRow row;
    row.propertyName = name;
    row.conditionalUnavailable = field["conditionalUnavailable"].toBool();
    row.label = titleOf(port);
    row.typeName = typeOf(port);
    row.port = i;
    row.y = y;
    // A content card shows its choice field without a label row.
    const bool bareField = contentCard && kind == "choice" && !connected;
    row.bare = bareField;
    result.inputY[i] = y + (bareField ? nm::fieldHeight : nm::rowHeight) / 2.0;
    if (!bareField) { y += nm::rowHeight; }
    const auto hasValue = value.isValid() && !value.isNull();
    if (!connected && (kind == "text" || kind == "multiline" || kind == "choice")) {
      row.kind = kind == "multiline" ? NodeRowKind::Multiline : NodeRowKind::Field;
      row.choice = kind == "choice";
      row.placeholder = !hasValue;
      row.value = hasValue ? value.toString() : tr("Not set");
      row.fieldY = y;
      row.height = kind == "multiline" ? nm::multilineFieldHeight : nm::fieldHeight;
      y += row.height;
    } else if (!connected && (kind == "number" || kind == "integer")) {
      row.kind = NodeRowKind::Number;
      row.value = hasValue ? value.toString() : tr("Not set");
    } else if (!connected && kind == "boolean") {
      row.kind = NodeRowKind::Toggle;
      row.checked = value.toBool();
    }
    if (row.conditionalUnavailable) { y += nm::rowHeight; }
    result.rows.append(row);
    end = y;
  }
  result.outputY.resize(outputs.size());
  for (int i = 0; i < outputs.size(); ++i) {
    result.outputY[i] = nm::contentTop + nm::rowHeight / 2.0 + i * nm::handleRowStep;
    end = std::max(end, result.outputY[i] + nm::rowHeight / 2.0 + (i == outputs.size() - 1 ? nm::padding + nm::borderWidth : 0));
  }
  const auto width = ui["width"].toDouble();
  // A card without a body row keeps the header and one empty handle row.
  const auto minimum = nm::contentTop + nm::rowHeight + nm::padding + nm::borderWidth;
  result.size = QSize(width > 0 ? int(width) : nm::defaultWidth,
                      int(std::ceil(std::max<double>(end, minimum) + nm::padding)));
  if (canvasMediaNodes_.contains(resourceId(id))) { result.size.rheight() += nm::playbackHeight + nm::rowHeight; }
  else if (!runtimeState(id).isEmpty()) { result.size.rheight() += nm::previewHeight + nm::rowHeight; }
    result.runningProgress = result.subgraph && runtimeState(id)["status"] == "running" && runtimeState(id)["total"].toDouble() > 0;
    if (result.runningProgress) { result.size.rheight() += nm::handleRowStep; }
    result.addOutput = result.subgraph && meta["supports_dynamic_outputs"].toBool();
    if (result.addOutput) { result.size.rheight() += nm::handleRowStep; }
    if (result.subgraph) { result.size.rheight() += nm::handleRowStep; }
  result.minimumSize = QSize(150, result.size.height());
  result.size.setHeight(std::max(result.size.height(), ui["height"].toInt()));
  return *layouts_.insert(id, result);
}
std::unordered_set<NodeId> WorkflowGraphModel::allNodeIds() const {
  std::unordered_set<NodeId> result;
  for (auto i = nodes_.cbegin(); i != nodes_.cend(); ++i) {
    result.insert(i.key());
  }
  return result;
}
QJsonArray WorkflowGraphModel::ports(NodeId id, PortType type) const {
  if (isReroute(id)) {
    return QJsonArray{QJsonObject{{"name",type==PortType::In ? "input_value" : "output"},{"type",QJsonObject{{"type","any"}}}}};
  }
  if (isGroup(id) || isComment(id)) { return {}; }
  auto &cache = type == PortType::In ? inputs_ : outputs_;
  if (cache.contains(id)) {
    return cache.value(id);
  }
  const auto n = node_editor::withChildPorts(node_editor::withVisibleCodePorts(nodes_.value(id)), catalog_);
  QJsonArray result;
  QSet<QString> names;
  const auto append = [&result, &names](QJsonObject port) {
    const auto name = port["name"].toString();
    if (name.isEmpty() || names.contains(name)) { return; }
    names.insert(name);
    result.append(port);
  };
  for (const auto &value : catalog_) {
    const auto metadata = value.toObject();
    if (metadata["node_type"] == n["type"] || metadata["type"] == n["type"]) {
      QSet<QString> connectedInputs;
      if (type == PortType::In) {
        for (const auto &value : edges_) {
          const auto edge = value.toObject();
          if (edge["target"] == n["id"]) { connectedInputs.insert(edge["targetHandle"].toString()); }
        }
      }
      for (const auto &port : metadata[type == PortType::In ? "properties" : "outputs"].toArray()) {
        const auto declaration = port.toObject();
        const auto name = declaration["name"];
        if (n["type"] == "nodetool.workflows.subgraph.Subgraph" && name == "graph") { continue; }
        const auto ui = n["ui_properties"].toObject();
        const bool handleOnly = (metadata["input_fields"].toArray().contains(name) || ui["exposed_inputs"].toArray().contains(name)) &&
            !ui["exposed_inputs_hidden"].toArray().contains(name) && !ui["exposed_inputs_labeled"].toArray().contains(name);
        if (type == PortType::In && !handleOnly && !connectedInputs.contains(name.toString()) &&
            !node_editor::propertyConditionSatisfied(declaration, n["data"].toObject())) {
          names.insert(declaration["name"].toString());
          continue;
        }
        append(declaration);
      }
      break;
    }
  }
  const auto declarations = n[type == PortType::In ? "dynamic_inputs" : "dynamic_outputs"].toObject();
  for (auto it = declarations.begin(); it != declarations.end(); ++it) {
    auto port = it.value().toObject();
    port["name"] = it.key();
    port["type"] = node_editor::normalizedDynamicPortType(it.value());
    append(port);
  }
    if (type == PortType::Out && n["type"] == "nodetool.workflows.subgraph.Subgraph") {
        const auto authored = nodes_.value(id)["dynamic_outputs"].toObject();
        for (auto it = authored.begin(); it != authored.end(); ++it) {
            append(QJsonObject{{"name", it.key()}, {"type", node_editor::normalizedDynamicPortType(it.value())}});
        }
    }
  if (type == PortType::In) {
    const auto properties = n["dynamic_properties"].toObject();
    const auto outputDeclarations = n["dynamic_outputs"].toObject();
    for (auto it = properties.begin(); it != properties.end(); ++it) {
      if (n["type"] != "nodetool.code.Code" && outputDeclarations.contains(it.key())) { continue; }
      append(QJsonObject{{"name", it.key()}, {"type", "any"}});
    }
  }
  // Unknown incident names remain available without changing the document.
  for (const auto &value : edges_) {
    const auto edge = value.toObject();
    const auto key = type == PortType::In ? "target" : "source";
    const auto handle = type == PortType::In ? "targetHandle" : "sourceHandle";
    if (edge[key].toString() == resourceId(id)) {
      append(QJsonObject{{"name", edge[handle]}});
    }
  }
  cache.insert(id, result);
  return result;
}
QJsonObject WorkflowGraphModel::edge(ConnectionId c) const {
  if (const auto found=edgeByConnection_.find(c);found!=edgeByConnection_.end()) { return found->second; }

  auto out = ports(c.outNodeId, PortType::Out),
       in = ports(c.inNodeId, PortType::In);
  if (c.outPortIndex >= unsigned(out.size()) ||
      c.inPortIndex >= unsigned(in.size())) {
    return {};
  }
  return {{"source", resourceId(c.outNodeId)},
          {"target", resourceId(c.inNodeId)},
          {"sourceHandle", out[c.outPortIndex].toObject()["name"]},
          {"targetHandle", in[c.inPortIndex].toObject()["name"]}};
}
std::unordered_set<ConnectionId>
WorkflowGraphModel::allConnectionIds(NodeId id) const {
  return adjacency_.value(id);
}
std::unordered_set<ConnectionId>
WorkflowGraphModel::connections(NodeId n, PortType p, PortIndex i) const {
  auto all = allConnectionIds(n);
  std::erase_if(all, [=](auto c) {
    return p == PortType::In ? (c.inNodeId != n || c.inPortIndex != i)
                             : (c.outNodeId != n || c.outPortIndex != i);
  });
  return all;
}
bool WorkflowGraphModel::connectionExists(ConnectionId c) const {
  return allConnectionIds(c.outNodeId).contains(c);
}
bool WorkflowGraphModel::nodeExists(NodeId n) const {
  return nodes_.contains(n);
}
NodeId WorkflowGraphModel::addNode(QString const type) {
  QJsonObject n{{"id", QUuid::createUuid().toString(QUuid::Id128)},
                {"type", type},
                {"ui_properties",
                 QJsonObject{{"position", QJsonObject{{"x", 0}, {"y", 0}}}}},
                {"data", QJsonObject{}}};
  for (auto v : catalog_) {
    auto m = v.toObject();
    if (m["node_type"].toString(m["type"].toString()) == type) {
      QJsonObject data;
      for (auto p : m["properties"].toArray()) {
        auto property = p.toObject();
        if (property.contains("default")) {
          data[property["name"].toString()] = property["default"];
        }
      }
      n["data"] = data;
    }
  }
  if (commit) {
    commit({{"op", "addNode"}, {"node", n}});
  }
  return InvalidNodeId;
}
bool WorkflowGraphModel::connectionPossible(ConnectionId c) const {
  if (validateConnection) {
    auto candidate = edge(c);
    return !candidate.isEmpty() && validateConnection(candidate);
  }
  if (edge(c).isEmpty() || connectionExists(c) || c.inNodeId == c.outNodeId ||
      !connections(c.inNodeId, PortType::In, c.inPortIndex).empty()) {
    return false;
  }
  auto a =
      portData(c.outNodeId, PortType::Out, c.outPortIndex, PortRole::DataType)
          .value<NodeDataType>();
  auto b = portData(c.inNodeId, PortType::In, c.inPortIndex, PortRole::DataType)
               .value<NodeDataType>();
  return !a.id.isEmpty() && !b.id.isEmpty() &&
         (a.id == b.id || a.id == "any" || b.id == "any");
}
void WorkflowGraphModel::addConnection(ConnectionId c) {
  if (connectionPossible(c) && commit) {
    auto e = edge(c);
    e["id"] = QUuid::createUuid().toString(QUuid::Id128);
    commit({{"op", "addEdge"}, {"edge", e}});
  }
}
bool WorkflowGraphModel::isGroup(NodeId id) const {
  const auto type = nodes_.value(id)["type"].toString();
  return type == "nodetool.workflows.base_node.Group" || type == "nodetool.workflows.Group";
}
bool WorkflowGraphModel::isReroute(NodeId id) const { return nodes_.value(id)["type"]=="nodetool.control.Reroute"; }
QString WorkflowGraphModel::rerouteHandleType(NodeId id) const { return displayTypes_.rerouteHandles.value(resourceId(id),"any"); }
QString WorkflowGraphModel::effectiveSourceType(NodeId id, PortIndex port) const {
  const auto output=ports(id,PortType::Out);
  if (port>=unsigned(output.size())) { return "any"; }
  return displayTypes_.sources.value(displayPortKey(resourceId(id),output[port].toObject()["name"].toString()),"any");
}
QColor WorkflowGraphModel::wirePortColor(ConnectionId id, PortType side) const {
  const auto source=effectiveSourceType(id.outNodeId,id.outPortIndex);
  if (side==PortType::Out) { return typeColor(source); }
  const auto input=ports(id.inNodeId,PortType::In);
  if (id.inPortIndex>=unsigned(input.size())) { return typeColor("any"); }
  const auto port=input[id.inPortIndex].toObject();
  if (forwardDisplayInput(nodes_.value(id.inNodeId)["type"].toString(),port["name"].toString())) { return typeColor(source); }
  const auto raw=port["type"];return typeColor(raw.isString() ? raw.toString() : raw.toObject()["type"].toString());
}
bool WorkflowGraphModel::isComment(NodeId id) const {
  const auto type = nodes_.value(id)["type"].toString();
  return type == "nodetool.workflows.base_node.Comment" || type == "nodetool.workflows.Comment";
}
QVariantMap WorkflowGraphModel::inlineDescriptor(NodeId id, const QString &name) const {
  if (readOnly_ || !nodeExists(id) || inlineFieldRect(id, name).isEmpty()) { return {}; }
  for (const auto &value : node_editor::propertyFields(nodes_.value(id), metadata(id), edges_)) {
    const auto field = value.toMap();
    if (field["name"].toString() != name || !field["editable"].toBool() || field["connected"].toBool()) { continue; }
    const auto kind = field["kind"].toString();
    if (kind == "text" || kind == "multiline" || kind == "number" || kind == "integer" || kind == "choice" || kind == "boolean") { return field; }
  }
  return {};
}
QRectF WorkflowGraphModel::inlineFieldRect(NodeId id, const QString &name) const {
  const auto &card = layout(id);
  const auto inset = node_metrics::borderWidth + node_metrics::padding;
  for (const auto &row : card.rows) {
    if (row.propertyName != name || name.isEmpty()) { continue; }
    if (row.kind == NodeRowKind::Field || row.kind == NodeRowKind::Multiline) { return QRectF(inset, row.fieldY, card.size.width() - 2 * inset, row.height); }
    if (row.kind == NodeRowKind::Number) { return QRectF(card.size.width() / 2.0, row.y, card.size.width() / 2.0 - inset, node_metrics::rowHeight); }
    if (row.kind == NodeRowKind::Toggle) { return QRectF(card.size.width() - inset - 32, row.y, 32, node_metrics::rowHeight); }
  }
  return {};
}
QVector<NodeId> WorkflowGraphModel::descendants(NodeId id) const {
  QVector<NodeId> result = children_.value(id);
  QSet<NodeId> visited{id};
  for (qsizetype i = 0; i < result.size(); ++i) {
    if (visited.contains(result[i])) { continue; }
    visited.insert(result[i]);
    for (const auto child : children_.value(result[i])) {
      if (!visited.contains(child)) { result.append(child); }
    }
  }
  return result;
}
void WorkflowGraphModel::moveDescendants(const QHash<NodeId, QPointF> &before) {
  QVector<NodeId> pending;
  QSet<NodeId> visited;
  for (auto it = nodes_.cbegin(); it != nodes_.cend(); ++it) {
    const auto parent = ids_.value(it.value()["parent_id"].toString(), InvalidNodeId);
    if (!nodeExists(parent) || !isGroup(parent)) { pending.append(it.key()); }
  }
  for (qsizetype i = 0; i < pending.size(); ++i) {
    const auto id = pending[i];
    if (visited.contains(id)) { continue; }
    visited.insert(id);
    const auto parent = ids_.value(nodes_.value(id)["parent_id"].toString(), InvalidNodeId);
    const auto inherited = positions_.value(parent) - before.value(parent);
    // QtNodes already moves selected descendants. Only inherit when this item
    // did not move itself, so a parent and child selection never doubles motion.
    if (before.contains(parent) && positions_.value(id) == before.value(id) && !inherited.isNull()) {
      positions_[id] += inherited;
      emit nodePositionUpdated(id);
    }
    pending += children_.value(id);
  }
}
QJsonValue WorkflowGraphModel::comment(NodeId id) const { return nodes_.value(id)["data"].toObject()["comment"]; }
bool WorkflowGraphModel::bypassed(NodeId id) const {
  return nodes_.value(id)["ui_properties"].toObject()["bypassed"].toBool();
}
QVariant WorkflowGraphModel::nodeData(NodeId id, NodeRole r) const {
  auto n = nodes_.value(id);
  switch (r) {
  case NodeRole::Style:
    return QtNodes::StyleCollection::nodeStyle().toJson().toVariantMap();
  case NodeRole::Caption:
    return nodes_.contains(id) ? layout(id).title : QString();
  case NodeRole::Type:
    return n["type"].toString();
  case NodeRole::CaptionVisible:
    return true;
  case NodeRole::Position: {
    return positions_.value(id);
  }
  case NodeRole::InPortCount:
    return unsigned(ports(id, PortType::In).size());
  case NodeRole::OutPortCount:
    return unsigned(ports(id, PortType::Out).size());
  case NodeRole::Size:
    return nodes_.contains(id) ? layout(id).size : QSize();
  default:
    return {};
  }
}
bool WorkflowGraphModel::setNodeData(NodeId id, NodeRole r, QVariant v) {
  if (readOnly_ || !nodeExists(id)) { return false; }
  if (r == NodeRole::Size) {
    if (isReroute(id)) { return false; }
    const auto size = v.toSize();
    if (size.width() <= 0 || size.height() <= 0) { return false; }
    auto ui = nodes_[id]["ui_properties"].toObject();
    ui["width"] = size.width();
    ui["height"] = size.height();
    nodes_[id]["ui_properties"] = ui;
    layouts_.remove(id);
    emit nodeUpdated(id);
    return true;
  }
  if (r != NodeRole::Position) { return false; }
  const auto p = v.toPointF();
  const auto delta = p - positions_.value(id);
  if (delta.isNull()) { return true; }
  positions_[id] = p;
  auto ui = nodes_[id]["ui_properties"].toObject();
  const auto parent = ids_.value(nodes_.value(id)["parent_id"].toString(), InvalidNodeId);
  const auto local = p - positions_.value(parent);
  ui["position"] = QJsonObject{{"x", local.x()}, {"y", local.y()}};
  nodes_[id]["ui_properties"] = ui;
  emit nodePositionUpdated(id);
  return true;
}
QVariant WorkflowGraphModel::portData(NodeId id, PortType p, PortIndex i,
                                      PortRole r) const {
  auto list = ports(id, p);
  if (i >= unsigned(list.size())) {
    return {};
  }
  auto port = list[i].toObject();
  if (r == PortRole::CaptionVisible) {
    return true;
  }
  if (r == PortRole::Caption) {
    return port["title"].toString(displayName(port["name"].toString()));
  }
  if (r == PortRole::ConnectionPolicyRole) {
    return QVariant::fromValue(p == PortType::In ? ConnectionPolicy::One
                                                 : ConnectionPolicy::Many);
  }
  if (r == PortRole::DataType) {
    auto type = port["type"].toString();
    if (type.isEmpty()) {
      type = port["type"].toObject()["type"].toString();
    }
    return QVariant::fromValue(NodeDataType{type, type});
  }
  return {};
}
bool WorkflowGraphModel::deleteConnection(ConnectionId c) {
  auto wanted = edge(c);
  for (auto v : edges_) {
    auto e = v.toObject();
    if (e["source"] == wanted["source"] && e["target"] == wanted["target"] &&
        e["sourceHandle"] == wanted["sourceHandle"] &&
        e["targetHandle"] == wanted["targetHandle"]) {
      return commit && commit({{"op", "removeEdge"}, {"id", e["id"]}});
    }
  }
  return false;
}
bool WorkflowGraphModel::deleteNode(NodeId id) {
  return commit &&
         commit({{"op", "removeNodes"}, {"ids", QJsonArray{resourceId(id)}}});
}
} // namespace nodetool
