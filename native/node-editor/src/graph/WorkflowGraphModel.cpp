#include "WorkflowGraphModel.h"
#include "properties/PropertyFields.h"
#include <QJsonArray>
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
void WorkflowGraphModel::project(const QJsonObject &snapshot,
                                 const QJsonArray &catalog, bool readOnly) {
  readOnly_ = readOnly;
  catalog_ = catalog;
  inputs_.clear();
  outputs_.clear();
  layouts_.clear();
  adjacency_.clear();
  nodes_.clear();
  auto graph =
      snapshot.contains("graph") ? snapshot["graph"].toObject() : snapshot;
  for (auto v : graph["nodes"].toArray()) {
    auto n = v.toObject();
    auto id = n["id"].toString();
    if (!ids_.contains(id)) {
      ids_[id] = newNodeId();
    }
    nodes_[ids_[id]] = n;
  }
  edges_ = graph["edges"].toArray();
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
          adjacency_[source].insert(connection);
          adjacency_[target].insert(connection);
        }
      }
    }
  }
  emit modelReset();
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
  const auto node = nodes_.value(id);
  const auto meta = metadata(id);
  const auto ui = node["ui_properties"].toObject();
  const auto typeOf = [](const QJsonObject &port) {
    const auto type = port["type"];
    return type.isString() ? type.toString() : type.toObject()["type"].toString();
  };
  NodeLayout result;
  result.unknown = meta.isEmpty();
  const auto type = node["type"].toString();
  result.title = ui["title"].toString(meta["title"].toString(type.section('.', -1)));
  const auto outputs = ports(id, PortType::Out);
  const auto primary = outputs.isEmpty() ? QString{} : typeOf(outputs[0].toObject());
  result.icon = typeIcon(primary);
  result.accent = typeColor(primary);
  QHash<QString, QVariantMap> fields;
  for (const auto &row : node_editor::propertyFields(node, meta, edges_)) {
    const auto map = row.toMap();
    fields.insert(map["name"].toString(), map);
  }
  QSet<QString> handleOnly;
  for (const auto &name : meta["input_fields"].toArray()) { handleOnly.insert(name.toString()); }
  const auto inputs = ports(id, PortType::In);
  result.inputY.resize(inputs.size());
  double y = nm::contentTop;
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
  if (!runtimeState(id).isEmpty()) { result.size.rheight() += nm::previewHeight + nm::rowHeight; }
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
  auto &cache = type == PortType::In ? inputs_ : outputs_;
  if (cache.contains(id)) {
    return cache.value(id);
  }
  const auto n = nodes_.value(id);
  QJsonArray result;
  for (auto v : catalog_) {
    auto m = v.toObject();
    if (m["node_type"] == n["type"] || m["type"] == n["type"]) {
      result = m[type == PortType::In ? "properties" : "outputs"].toArray();
      break;
    }
  }
  // Unknown nodes expose incident named ports without changing the saved
  // document.
  for (auto v : edges_) {
    auto e = v.toObject();
    auto key = type == PortType::In ? "target" : "source";
    auto handle = type == PortType::In ? "targetHandle" : "sourceHandle";
    if (e[key].toString() != resourceId(id)) {
      continue;
    }
    bool found = false;
    for (auto p : result) {
      if (p.toObject()["name"] == e[handle]) {
        found = true;
      }
    }
    if (!found) {
      result.append(QJsonObject{{"name", e[handle]}});
    }
  }
  cache.insert(id, result);
  return result;
}
QJsonObject WorkflowGraphModel::edge(ConnectionId c) const {
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
    auto p = n["ui_properties"].toObject()["position"].toObject();
    return QPointF(p["x"].toDouble(), p["y"].toDouble());
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
  if (r != NodeRole::Position || !nodeExists(id)) {
    return false;
  }
  auto p = v.toPointF();
  auto ui = nodes_[id]["ui_properties"].toObject();
  ui["position"] = QJsonObject{{"x", p.x()}, {"y", p.y()}};
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
