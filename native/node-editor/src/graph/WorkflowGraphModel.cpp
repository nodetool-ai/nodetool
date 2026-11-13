#include "properties/CodeInference.h"
#include "WorkflowGraphModel.h"
#include "CardBodies.h"
#include "CardMedia.h"
#include "CatalogCategories.h"
#include "document/ChildPorts.h"
#include "document/ConnectionTypes.h"
#include "properties/PropertyFields.h"
#include "ModelLabels.h"
#include "ImageSizePresets.h"
#include <QFont>
#include <algorithm>
#include <cmath>
#include <QFontMetricsF>
#include <QJsonArray>
#include <QJsonDocument>
#include <QUrl>
#include <QSet>
#include <QUuid>
#include <QtNodes/NodeData>
#include <QtNodes/NodeStyle>
#include <QtNodes/StyleCollection>
#include <tuple>
using namespace QtNodes;
namespace nodetool {
WorkflowGraphModel::WorkflowGraphModel(QObject *p) {
  setParent(p);
  runningClock_.start();
  runningTimer_.setSingleShot(true);
  connect(&runningTimer_, &QTimer::timeout, this, &WorkflowGraphModel::settleRunning);
}
NodeId WorkflowGraphModel::newNodeId() { return next_++; }
QString WorkflowGraphModel::resourceId(NodeId id) const {
  return nodes_.value(id)["id"].toString();
}
namespace {
// A card shows only the metadata's inline fields as rows, as web NodeContent.tsx
// and resolveInlineFieldNames do. Metadata without inline_fields shows none. Other
// properties stay in the inspector until an edge targets them, which retains
// their canonical endpoint. Body policy separately decides whether to draw it.
// Model properties show a
// model chip instead, as web resolveModelChipNames does.
// The web edits a list or dictionary table on the card only for the constant
// List and Dict nodes (ListProperty.tsx, DictProperty.tsx). StringListProperty
// edits any list of strings, and JSONProperty and RecordTypeProperty edit on
// every card. Other lists and dictionaries show their label alone.
bool inlineStructured(const QVariantMap &field) {
    const auto kind = field["kind"].toString();
    if (kind == "json" || kind == "record_type") { return true; }
    const auto nodeType = field["nodeType"].toString();
    if (kind == "dict") { return nodeType == "nodetool.constant.Dict"; }
    if (kind != "list") { return false; }
    if (nodeType == "nodetool.constant.List") { return true; }
    const auto args = field["dataType"].toMap()["type_args"].toList();
    return args.size() == 1 && args.first().toMap()["type"].toString() == "str";
}
// WorkflowProperty, WorkflowListProperty and CollectionProperty are selects on the card.
bool inlineResource(const QString &kind) { return kind == "workflow" || kind == "workflow_list" || kind == "collection"; }
QString compactJson(const QJsonValue &value) {
    if (value.isString()) { return value.toString(); }
    if (value.isObject()) { return QString::fromUtf8(QJsonDocument(value.toObject()).toJson(QJsonDocument::Compact)); }
    if (value.isArray()) { return QString::fromUtf8(QJsonDocument(value.toArray()).toJson(QJsonDocument::Compact)); }
    return value.isNull() || value.isUndefined() ? QStringLiteral("null") : value.toVariant().toString();
}
// The painted text of an inline structured or resource field. Empty means unset.
QString inlineSummary(const QVariantMap &field) {
    const auto kind = field["kind"].toString();
    const auto value = QJsonValue::fromVariant(field["value"]);
    QStringList lines;
    if (kind == "json") { return value.toObject().value("data").toString(); }
    if (kind == "record_type") {
        for (const auto &column : value.toObject().value("columns").toArray()) {
            lines.append(QStringLiteral("%1 (%2)").arg(column.toObject().value("name").toString(), column.toObject().value("data_type").toString()));
        }
        return lines.join('\n');
    }
    if (kind == "workflow" || kind == "collection") {
        const auto reference = value.toObject();
        return reference.value(kind == "collection" ? "name" : reference.contains("name") ? "name" : "id").toString();
    }
    if (kind == "workflow_list") {
        for (const auto &entry : value.toArray()) { lines.append(entry.toObject().value("id").toString()); }
        return lines.join(QStringLiteral(", "));
    }
    if (kind == "dict") {
        const auto object = value.toObject();
        for (auto it = object.begin(); it != object.end(); ++it) { lines.append(it.key() + QStringLiteral(": ") + compactJson(it.value())); }
        return lines.join('\n');
    }
    for (const auto &entry : value.toArray()) { lines.append(compactJson(entry)); }
    // A string list reads as its chips on one line, a constant List as table rows.
    return lines.join(field["nodeType"].toString() == "nodetool.constant.List" ? QStringLiteral("\n") : QStringLiteral(", "));
}
// The data type the web's List and Dict constants start their select on, read
// from the first value as detectTypeFromList and detectTypeFromDict do.
QString constantTableType(const QVariantMap &field) {
    const auto value = QJsonValue::fromVariant(field["value"]);
    QJsonValue first;
    if (value.isArray() && !value.toArray().isEmpty()) { first = value.toArray().first(); }
    else if (value.isObject() && !value.toObject().isEmpty()) { first = *value.toObject().begin(); }
    if (!first.isDouble()) { return QStringLiteral("string"); }
    return first.toDouble() == std::trunc(first.toDouble()) ? QStringLiteral("int") : QStringLiteral("float");
}
// The columns and first rows a dataframe card shows where the web draws its
// ColumnsManager and DataTable. The card cannot edit cells.
QString dataframeSummary(const QVariantMap &frame) {
    QStringList lines;
    QStringList names;
    for (const auto &column : frame["columns"].toList()) {
        const auto map = column.toMap();
        names.append(QStringLiteral("%1 (%2)").arg(map["name"].toString(), map["data_type"].toString()));
    }
    if (!names.isEmpty()) { lines.append(names.join(QStringLiteral(" | "))); }
    const auto rows = frame["data"].toList();
    for (int i = 0; i < rows.size() && i < 4; ++i) {
        QStringList cells;
        for (const auto &cell : rows[i].toList()) { cells.append(cell.toString()); }
        lines.append(cells.join(QStringLiteral(" | ")));
    }
    return lines.join('\n');
}
bool cardField(const QJsonObject &metadata, const QJsonObject &ui, const QJsonObject &declaration) {
    const auto name = declaration["name"];
    return metadata["inline_fields"].toArray().contains(name) || ui["exposed_inputs_labeled"].toArray().contains(name);
}
QString contentInputLabel(const QJsonObject &metadata) {
    // getDynamicInputLabel in web/src/components/node_types/contentCardRegistry.ts.
    static const QSet<QString> templates{
        QStringLiteral("nodetool.agents.Agent"), QStringLiteral("nodetool.agents.Summarizer"),
        QStringLiteral("nodetool.agents.Extractor"), QStringLiteral("nodetool.agents.Classifier"),
        QStringLiteral("openai.agents.RealtimeAgent"), QStringLiteral("mistral.text.ChatComplete")};
    if (templates.contains(metadata["node_type"].toString())) { return QObject::tr("Add another variable"); }
    const auto outputs = metadata["outputs"].toArray();
    auto primary = outputs.first().toObject();
    const auto named = metadata["primary_output"].toString();
    for (const auto &entry : outputs) {
        if (!named.isEmpty() && entry.toObject()["name"] == named) { primary = entry.toObject(); break; }
    }
    const auto type = primary["type"].toObject();
    auto name = type["type"].toString();
    if (name == "list" && type["type_args"].toArray().first().toObject()["type"] == "image") { name = "image"; }
    if (name == "image" || name == "image_mask" || name == "mask") { return QObject::tr("Add another image input"); }
    if (name == "video") { return QObject::tr("Add another video input"); }
    if (name == "audio") { return QObject::tr("Add another audio input"); }
    if (name == "str" || name == "text") { return QObject::tr("Add another text input"); }
    return QObject::tr("Add another input");
}
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
  if (reset) {
    catalogIndex_.clear();
    for (int i = 0; i < catalog.size(); ++i) {
      const auto entry = catalog[i].toObject();
      // The first entry naming a type wins, as the scan it replaces did.
      for (const auto key : {"node_type", "type"}) {
        const auto type = entry[key];
        if (type.isString() && !catalogIndex_.contains(type.toString())) { catalogIndex_.insert(type.toString(), i); }
      }
    }
  }
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
  const auto graphVariables = graphVariableNames(rawNodes);
  const bool variablesChanged = graphVariables != graphVariables_;
  graphVariables_ = graphVariables;
  QHash<QString, int> inputNames;
  for (const auto &value : rawNodes) {
    const auto node = value.toObject();
    if (node["type"].toString().startsWith(QStringLiteral("nodetool.input."))) {
      ++inputNames[node["data"].toObject()["name"].toString()];
    }
  }
  // Renaming one input can add or clear the warning on every other input.
  const bool inputNamesChanged = inputNames != inputNames_;
  inputNames_ = inputNames;
  if (reset) {
    inputs_.clear();
    outputs_.clear();
    layouts_.clear();
    nodes_ = nodes;
    edges_ = edges;
    incident_ = incident;
    deriveProjection(rawNodes);
    cardMedia_.retain(QSet<QString>(ids_.keyBegin(), ids_.keyEnd()));
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
    // A renamed Set Variable node changes the cards that offer its name.
    if (!samePresentation(*previous, it.value()) || incident_.value(resource) != incident.value(resource)
        || (variablesChanged && readsGraphVariables(cardBodyFor(it.value()["type"].toString(), {})))
        || (inputNamesChanged && it.value()["type"].toString().startsWith(QStringLiteral("nodetool.input.")))) {
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
  cardMedia_.retain(QSet<QString>(ids_.keyBegin(), ids_.keyEnd()));
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
  stackingOrder_.clear();
  for (int i = 0; i < rawNodes.size(); ++i) {
    stackingOrder_.insert(ids_.value(rawNodes[i].toObject()["id"].toString()), i);
  }
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
QJsonObject WorkflowGraphModel::catalogEntry(const QJsonValue &type) const {
  const auto found = type.isString() ? catalogIndex_.constFind(type.toString()) : catalogIndex_.cend();
  return found == catalogIndex_.cend() ? QJsonObject{} : catalog_[*found].toObject();
}
QJsonObject WorkflowGraphModel::metadata(NodeId id) const { return catalogEntry(nodes_.value(id).value("type")); }
void WorkflowGraphModel::setRuntimeModel(node_editor::NodeRuntimeModel *runtime) {
  if (runtime_ == runtime) { return; }
  if (runtime_) { disconnect(runtime_, nullptr, this, nullptr); }
  runtime_ = runtime;
  previews_.clear();
  runningShown_.clear();
  runningSince_.clear();
  runningTimer_.stop();
  if (runtime_) {
    connect(runtime_, &node_editor::NodeRuntimeModel::nodeChanged, this, [this](const QString &id) { refreshRuntimeNode(id); emit runtimeChanged(); });
    // Previews stay across a run change. EditorWindow::syncRuntimePreviews
    // replaces or removes each one, so a card keeps its image until the next loads.
    connect(runtime_, &node_editor::NodeRuntimeModel::projectionChanged, this, [this] {
      for (auto it = ids_.cbegin(); it != ids_.cend(); ++it) { refreshRuntimeNode(it.key()); }
      emit runtimeChanged();
    });
  }
  emit runtimeChanged();
}
void WorkflowGraphModel::refreshRuntimeNode(const QString &id) {
  trackRunning(id);
  const auto found = ids_.constFind(id);
  if (found == ids_.cend()) { return; }
  layouts_.remove(*found);
  emit nodeUpdated(*found);
}
void WorkflowGraphModel::trackRunning(const QString &id) {
  const auto found = ids_.constFind(id);
  const auto status = found == ids_.cend() ? QString() : runtimeState(*found)["status"].toString();
  const bool live = status == "running" || status == "loading" || status == "queued";
  if (found == ids_.cend()) { runningShown_.remove(id); }
  if (live == runningShown_.contains(id)) {
    runningSince_.remove(id);
    return;
  }
  // A change back and forth restarts the wait, because the entry above is removed.
  if (!runningSince_.contains(id)) { runningSince_.insert(id, runningClock_.elapsed()); }
  if (!runningTimer_.isActive()) { runningTimer_.start(runningDelayMs); }
}
void WorkflowGraphModel::settleRunning() {
  const auto now = runningClock_.elapsed();
  qint64 next = -1;
  bool changed = false;
  for (auto it = runningSince_.begin(); it != runningSince_.end();) {
    const auto wait = runningDelayMs - (now - it.value());
    if (wait > 0) {
      next = next < 0 ? wait : std::min(next, wait);
      ++it;
      continue;
    }
    const auto id = it.key();
    it = runningSince_.erase(it);
    if (!runningShown_.remove(id)) { runningShown_.insert(id); }
    changed = true;
    if (const auto found = ids_.constFind(id); found != ids_.cend()) { emit nodeUpdated(*found); }
  }
  if (next >= 0) { runningTimer_.start(int(next)); }
  if (changed) { emit runtimeChanged(); }
}
void WorkflowGraphModel::setRuntimePreview(const QString &nodeId, const QImage &image) {
  if (!ids_.contains(nodeId)) { return; }
  if (image.isNull()) { previews_.remove(nodeId); }
  else { previews_[nodeId] = image.scaled(512, 512, Qt::KeepAspectRatio, Qt::SmoothTransformation); }
  refreshRuntimeNode(nodeId);
  emit runtimeChanged();
}
QImage WorkflowGraphModel::runtimePreview(NodeId id) const { return previews_.value(resourceId(id)); }
bool WorkflowGraphModel::hasRuntimeOutput(NodeId id) const {
    // A constant or a content card already shows its value. A run leaves the card as it is.
    const auto type = nodes_.value(id)["type"].toString();
    const auto body = cardBodyFor(type, metadata(id));
    if (type.startsWith(QStringLiteral("nodetool.constant.")) || body == CardBody::Content || body == CardBody::ConstantString) {
        return false;
    }
    const auto state = runtimeState(id);
    // The List Generator lists its own items and a Collection shows its tiles. Only an error still shows below them.
    if (body == CardBody::ListGenerator || body == CardBody::Collection) {
        return !state["error"].toString().isEmpty();
    }
    for (const auto *key : {"error", "text"}) {
        if (!state[key].toString().isEmpty()) {
            return true;
        }
    }
    return state["result"].isObject() || previews_.contains(resourceId(id));
}
void WorkflowGraphModel::setCardMedia(const QString &nodeId, const QString &property, int index, const CardMediaItem &item) {
  if (!ids_.contains(nodeId)) { return; }
  cardMedia_.set(nodeId, property, index, item);
  refreshRuntimeNode(nodeId);
}
void WorkflowGraphModel::clearCardMedia() {
  cardMedia_.clear();
  for (auto it = ids_.cbegin(); it != ids_.cend(); ++it) { layouts_.remove(*it); emit nodeUpdated(*it); }
}
void WorkflowGraphModel::setConfiguredSecrets(const QStringList &keys, bool known, const QStringList &secretKeys) {
  const QSet<QString> configured(keys.cbegin(), keys.cend());
  const QSet<QString> listed(secretKeys.cbegin(), secretKeys.cend());
  if (configured == configuredSecrets_ && known == secretsKnown_ && listed == secretKeys_) { return; }
  configuredSecrets_ = configured;
  secretsKnown_ = known;
  secretKeys_ = listed;
  for (auto it = ids_.cbegin(); it != ids_.cend(); ++it) {
    const auto meta = metadata(*it);
    if (!catalogKeyGate(meta["namespace"].toString(meta["node_type"].toString())).isEmpty()
        || !meta["required_settings"].toArray().isEmpty()) {
      layouts_.remove(*it);
      emit nodeUpdated(*it);
    }
  }
}
void WorkflowGraphModel::setCanvasMediaNodes(const QSet<QString> &nodes) {
  if (canvasMediaNodes_ == nodes) { return; }
  const auto affected = canvasMediaNodes_ | nodes;
  canvasMediaNodes_ = nodes;
  for (const auto &id : affected) { refreshRuntimeNode(id); }
}
QRectF WorkflowGraphModel::canvasPlaybackRect(NodeId id) const {
  if (!canvasMediaNodes_.contains(resourceId(id)) || collapsed(id)) { return {}; }
  const auto size = layout(id).size;
  constexpr auto inset = node_metrics::padding + node_metrics::borderWidth;
  return QRectF(inset, size.height() - node_metrics::playbackHeight - node_metrics::rowHeight,
                size.width() - 2 * inset, node_metrics::playbackHeight);
}
QRectF WorkflowGraphModel::canvasResultRect(NodeId id) const {
  if (!nodeExists(id) || collapsed(id) || isGroup(id) || isComment(id) || isReroute(id)) { return {}; }
  const auto playback = canvasPlaybackRect(id);
  if (!playback.isEmpty()) { return playback; }
  const auto &card = layout(id);
  constexpr auto inset = node_metrics::padding + node_metrics::borderWidth;
  if (!card.resultRect.isEmpty()) {
    return card.resultRect.adjusted(node_metrics::padding, node_metrics::padding,
                                   -node_metrics::padding, -node_metrics::padding);
  }
  const auto bottomBand = card.progressBand ? node_metrics::progressHeight : 0;
  return QRectF(inset, card.size.height() - bottomBand - node_metrics::previewHeight - node_metrics::rowHeight,
                card.size.width() - 2 * inset, node_metrics::previewHeight - node_metrics::padding);
}
QJsonObject WorkflowGraphModel::runtimeState(NodeId id) const {
  return runtime_ ? runtime_->nodeState(resourceId(id)) : QJsonObject{};
}
QJsonObject WorkflowGraphModel::runtimeEdgeState(ConnectionId id) const {
  return runtime_ ? runtime_->edgeState(edge(id)["id"].toString()) : QJsonObject{};
}
bool WorkflowGraphModel::isControlWire(ConnectionId id) const {
  const auto original = edge(id);
  return original["edge_type"] == "control" || original["type"] == "control" || original["data"].toObject()["edge_type"] == "control";
}
bool WorkflowGraphModel::runtimeWireFlowing(ConnectionId id) const {
  if (isControlWire(id)) { return false; }
  const auto source = runtimeState(id.outNodeId)["status"].toString();
  return runtimeEdgeState(id)["status"] == "message_sent" || source == "running" || source == "starting" || source == "booting";
}
node_editor::UntakenBranch WorkflowGraphModel::untakenBranch() const {
  if (!runtime_) { return {}; }
  QHash<QString, QString> types;
  for (auto it = nodes_.cbegin(); it != nodes_.cend(); ++it) { types.insert(it.value()["id"].toString(), it.value()["type"].toString()); }
  return node_editor::findUntakenBranch(types, edges_, [this](const QString &edgeId) { return runtime_->edgeState(edgeId); });
}
bool WorkflowGraphModel::runtimeConnected() const { return !runtime_ || runtime_->connected(); }
namespace {
// collapsed.css: a collapsed card is a 40 px strip as wide as its header, at
// least 140 px and never wider than the expanded card. Sockets sit on the
// strip's midline and nothing else draws.
NodeLayout collapsedLayout(NodeLayout layout, const QJsonObject &ui) {
  namespace nm = node_metrics;
  QFont font(QStringLiteral("Inter"));
  font.setPixelSize(nm::fontTitle);
  const double inset = nm::borderWidth + nm::padding;
  const double badge = ui["bypassed"].toBool() ? nm::disabledBadgeWidth : 0;
  const double natural = 2 * inset + nm::titleOffset + QFontMetricsF(font).horizontalAdvance(layout.title) + badge;
  const int width = int(std::ceil(std::min<double>(layout.size.width(), std::max<double>(nm::collapsedMinimumWidth, natural))));
  layout.collapsed = true;
  layout.size = QSize(width, nm::collapsedHeight);
  layout.minimumSize = layout.size;
  layout.rows.clear();
  layout.resultRect = {};
  layout.body = CardBody::Generic;
  layout.subgraph = false;
  layout.addOutput = false;
  layout.runningProgress = false;
  layout.progressBand = false;
  layout.inputY.fill(nm::collapsedHeight / 2.0);
  layout.outputY.fill(nm::collapsedHeight / 2.0);
  return layout;
}
}
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
  result.title = meta["title"].toString(type.section('.', -1));
  // A blank stored title follows the metadata, as resolveCodeNodeTitle does.
  if (type == "nodetool.code.Code" && !ui["title"].toString().trimmed().isEmpty()) { result.title = ui["title"].toString(); }
  // Input nodes show their input name, as web resolveNodeHeaderTitle does.
  if (type.startsWith("nodetool.input.")) {
      const auto name = node["data"].toObject()["name"].toString().trimmed();
      if (!name.isEmpty()) {
          result.title = name;
      }
  }
  const auto outputs = ports(id, PortType::Out);
  const auto primary = outputs.isEmpty() ? QString{} : typeOf(outputs[0].toObject());
  result.body = cardBodyFor(type, meta);
  // The header icon follows the metadata types, as BaseNode, OutputNode and PreviewNode choose iconType.
  const auto iconType = meta.isEmpty() ? primary : headerIconType(result.body, meta);
  result.typeIcon = webTypeIcon(iconType);
  result.icon = typeIcon(iconType);
  result.accent = typeColor(primary);
  // DynamicSchemaNodeShell: the model joins the title, and the provider color
  // edges the card at 25 percent and selects it at full strength.
  const auto provider = schemaProvider(type);
  if (!provider.label.isEmpty()) {
      const auto detail = schemaTitleDetail(provider, ui);
      if (!detail.isEmpty()) { result.title += QStringLiteral(" · ") + detail; }
      result.accent = provider.accent;
      result.edge = provider.accent;
      result.edge.setAlpha(0x40);
  }
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
  for (const auto &port : meta["properties"].toArray()) {
      if (!cardField(meta, ui, port.toObject())) {
          handleOnly.insert(port.toObject()["name"].toString());
      }
  }
  const auto inputs = ports(id, PortType::In);
  result.inputY.resize(inputs.size());
  const auto width = ui["width"].toDouble();
  const auto addRenameControls = [&] {
      if (!meta["supports_dynamic_inputs"].toBool()) { return; }
      const auto values = node["dynamic_properties"].toObject();
      const auto declarations = node["dynamic_inputs"].toObject();
      QSet<QString> staticInputs;
      for (const auto &entry : meta["properties"].toArray()) { staticInputs.insert(entry.toObject()["name"].toString()); }
      QFont font(QStringLiteral("Inter"));
      font.setPixelSize(nm::fontLabel);
      const QFontMetricsF metrics(font);
      QFont chipFont(QStringLiteral("JetBrains Mono"));
      chipFont.setPixelSize(nm::fontValue);
      const QFontMetricsF chipMetrics(chipFont);
      QSet<QString> connected;
      for (const auto &value : edges_) {
          const auto edge = value.toObject();
          if (edge["target"] == node["id"]) { connected.insert(edge["targetHandle"].toString()); }
      }
      // PropertyInput.tsx offers the chip only on an unconnected input of a node
      // whose inputs the user owns (isSchemaDrivenDynamicNode in dynamicSlotTypes.ts).
      const auto nodeType = node["type"].toString();
      const auto data = node["data"].toObject();
      const bool schemaDriven = nodeType.startsWith("fal.") || nodeType.startsWith("kie.") || nodeType.startsWith("replicate.")
          || nodeType.startsWith("comfy.") || nodeType == "nodetool.workflows.workflow_node.Workflow"
          || nodeType == "nodetool.workflows.subgraph.Subgraph" || data.contains("endpoint_id") || data.contains("model_id");
      for (auto &row : result.rows) {
          if (row.port < 0 || row.port >= inputs.size() || row.bare || !portVisible(id, PortType::In, row.port)) { continue; }
          const auto name = inputs[row.port].toObject()["name"].toString();
          if (!values.contains(name) && !declarations.contains(name)) { continue; }
          if (staticInputs.contains(name)) { continue; }
          row.propertyName = name;
          const auto top = row.kind == NodeRowKind::Handle ? row.y - nm::rowHeight / 2.0 : row.y;
          const auto left = nm::borderWidth + nm::padding;
          const auto labelWidth = std::min(metrics.horizontalAdvance(row.label), (result.size.width() - 2 * left) / 2.0);
          row.renameLabelRect = QRectF(left, top, labelWidth, nm::rowHeight);
          row.renameButtonRect = QRectF(row.renameLabelRect.right() + nm::micro, top, nm::iconSize, nm::rowHeight);
          if (readOnly_) { continue; }
          // slotTypeLabel in dynamicSlotTypes.ts: list[T] for a one-argument list.
          const auto raw = declarations.value(name);
          auto declared = raw.isObject() ? raw.toObject().value("type") : raw;
          const auto type = declared.isObject() ? declared.toObject() : QJsonObject{{"type", declared.toString()}};
          const auto args = type.value("type_args").toArray();
          auto key = type.value("type").toString();
          if (key == "list" && args.size() == 1) { key = "list[" + args.first().toObject().value("type").toString() + "]"; }
          row.typeChip = key.isEmpty() ? QStringLiteral("any") : key;
          auto x = row.renameButtonRect.right() + nm::micro;
          if (!connected.contains(name) && !schemaDriven) {
              const auto chipWidth = chipMetrics.horizontalAdvance(row.typeChip) + 2 * nm::chipPadding;
              row.typeChipRect = QRectF(x, top + (nm::rowHeight - nm::chipHeight) / 2.0, chipWidth, nm::chipHeight);
              x = row.typeChipRect.right() + nm::micro;
          }
          row.removeButtonRect = QRectF(x, top, nm::iconSize, nm::rowHeight);
      }
  };
  if (!result.unknown && drawsOwnHandles(result.body)) {
      result.outputY.resize(outputs.size());
      for (int i = 0; i < outputs.size(); ++i) {
          result.outputY[i] = nm::contentTop + nm::rowHeight / 2.0 + i * nm::handleRowStep;
      }
      for (auto &position : result.inputY) {
          position = nm::contentTop + nm::rowHeight / 2.0;
      }
      result.size.setWidth(width > 0 ? int(width) : nm::defaultWidth);
      layoutBespokeBody(result, {node, meta, inputs, int(outputs.size()), fields, dimensionLinks_.contains(resourceId(id)),
                                 graphVariables_, previewTabs_.value(resourceId(id)), runtimeState(id),
                                 expandedListItems_.value(resourceId(id)), &cardMedia_});
      if (canvasMediaNodes_.contains(resourceId(id))) {
          result.size.rheight() += nm::playbackHeight + nm::rowHeight;
      } else if (result.resultRect.isEmpty() && hasRuntimeOutput(id)) {
          result.size.rheight() += nm::previewHeight + nm::rowHeight;
      }
      result.progressBand = runtimeState(id)["status"] == "running" && runtimeState(id)["total"].toDouble() > 0;
      if (result.progressBand) {
          result.size.rheight() += nm::progressHeight;
      }
      // A Preview card resizes freely above the web's 80 px minimum. Other bodies keep their controls.
      // A body such as Compare Images sets a wider minimum than the 150 px corner limit.
      result.minimumSize = QSize(std::max(150, result.minimumSize.width()),
                                 result.body == CardBody::Preview ? nm::outputPlaceholderHeight : result.size.height() - result.flexHeight);
      result.size.setHeight(std::max(result.size.height(), ui["height"].toInt()));
      addRenameControls();
      if (ui["collapsed"].toBool()) { result = collapsedLayout(result, ui); }
      return *layouts_.insert(id, result);
  }
  double y = nm::contentTop;
  const auto warning = result.unknown ? tr("Node metadata unavailable. Check runtimes and packs.") : meta["native_dependency_warning"].toString();
  if (!warning.isEmpty()) {
    NodeRow row; row.kind = NodeRowKind::Label; row.label = warning; row.y = y + nm::rowHeight / 2.0; row.height = nm::rowHeight;
    result.rows.append(row); y += nm::rowHeight;
  }
  {
    // BaseNode.tsx draws ApiKeyValidation and InputNodeNameWarning above the body.
    const double bandWidth = (width > 0 ? width : double(nm::defaultWidth)) - 2.0 * nm::borderWidth;
    const auto band = [&](const QString &text) {
      NodeRow row;
      row.kind = NodeRowKind::Label;
      row.warning = true;
      row.label = text;
      row.rect = QRectF(nm::borderWidth, y, bandWidth, nm::warningBandHeight);
      row.y = row.rect.center().y();
      row.height = row.rect.height();
      result.rows.append(row);
      y = row.rect.bottom();
    };
    const auto gate = catalogKeyGate(meta["namespace"].toString(meta["node_type"].toString()));
    if (secretsKnown_ && !gate.isEmpty() && !configuredSecrets_.contains(gate)) {
      band(tr("%1 is missing!").arg(catalogSecretDisplayName(gate)));
      NodeRow connect;
      connect.kind = NodeRowKind::Action;
      connect.action = QStringLiteral("connectProvider");
      connect.value = gate;
      connect.warning = true;
      connect.label = tr("Connect provider");
      connect.rect = QRectF(nm::warningButtonInset, y, bandWidth + 2.0 * nm::borderWidth - 2.0 * nm::warningButtonInset, nm::warningButtonHeight);
      connect.y = connect.rect.center().y();
      connect.height = connect.rect.height();
      result.rows.append(connect);
      y = connect.rect.bottom() + nm::chipGap;
    }
    // RequiredSettingsWarning: required settings the server lists as secrets
    // and reports unset. The provider key band above already names its gate.
    QStringList missing;
    if (secretsKnown_) {
      for (const auto &value : meta["required_settings"].toArray()) {
        const auto key = value.toString();
        if (key != gate && secretKeys_.contains(key) && !configuredSecrets_.contains(key)) { missing.append(key); }
      }
    }
    if (!missing.isEmpty()) {
      band(missing.size() == 1 ? tr("Required setting %1 is not configured!").arg(missing.first())
                               : tr("Required settings %1 are not configured!").arg(missing.join(QStringLiteral(", "))));
      NodeRow configure;
      configure.kind = NodeRowKind::Action;
      configure.action = QStringLiteral("connectProvider");
      configure.value = missing.first();
      configure.warning = true;
      configure.label = tr("Configure in settings");
      configure.rect = QRectF(nm::warningButtonInset, y, bandWidth + 2.0 * nm::borderWidth - 2.0 * nm::warningButtonInset, nm::warningButtonHeight);
      configure.y = configure.rect.center().y();
      configure.height = configure.rect.height();
      result.rows.append(configure);
      y = configure.rect.bottom() + nm::chipGap;
    }
    if (node["type"].toString().startsWith(QStringLiteral("nodetool.input."))) {
      const auto name = node["data"].toObject()["name"].toString();
      if (name.trimmed().isEmpty()) {
        band(tr("Name required"));
      } else if (inputNames_.value(name) > 1) {
        band(tr("Duplicate name"));
      }
    }
  }
  // The shell's wrapped text: 13 px on 1.45 em lines for Text, 11 px on 1.4 em for Caption.
  const auto wrappedText = [](const QString &text, int pixels, double lineHeight, double textWidth) {
      QFont font(QStringLiteral("Inter"));
      font.setPixelSize(pixels);
      const QFontMetricsF metrics(font);
      const auto bounds = metrics.boundingRect(QRectF(0, 0, std::max(1.0, textWidth), 1e6), Qt::TextWordWrap, text);
      return std::max(1.0, std::round(bounds.height() / metrics.lineSpacing())) * pixels * lineHeight;
  };
  // A provider node without a schema explains how to load one. The web reads
  // dynamic_inputs, which its loader refetches; native has no loader, so a
  // stored dynamic property also counts as a loaded schema.
  if (!provider.label.isEmpty() && node["dynamic_inputs"].toObject().isEmpty() && node["dynamic_properties"].toObject().isEmpty()) {
      const auto left = double(nm::borderWidth + nm::schemaHintPaddingX);
      const auto textWidth = (width > 0 ? width : double(nm::defaultWidth)) - 2 * left;
      y += nm::schemaHintPaddingY;
      for (const auto &[text, pixels, lineHeight] : {std::tuple{provider.description, nm::fontLabel, 1.45},
                                                      std::tuple{provider.instructions, nm::fontValue, 1.4}}) {
          NodeRow hint;
          hint.kind = NodeRowKind::Label;
          hint.label = text;
          hint.bare = true;
          hint.wrap = true;
          hint.placeholder = true;
          hint.textSize = pixels;
          hint.rect = QRectF(left, y, textWidth, wrappedText(text, pixels, lineHeight, textWidth));
          hint.y = y;
          hint.height = hint.rect.height();
          result.rows.append(hint);
          y = hint.rect.bottom();
      }
      y += nm::schemaHintPaddingY;
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
    if (!handleOnly.contains(port["name"].toString()) || !portVisible(id, PortType::In, i)) { continue; }
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
    // The empty state follows the primary output, as getContentCardVariant does.
    QString variant;
    const auto primaryName = meta["primary_output"].toString();
    for (const auto &value : meta["outputs"].toArray()) {
        const auto output = value.toObject();
        if (primaryName.isEmpty() || output["name"] == primaryName) {
            const auto declared = output["type"].toObject();
            variant = declared["type"].toString();
            if (variant == "list" && declared["type_args"].toArray().first().toObject()["type"] == "image") {
                variant = "image";
            }
            break;
        }
    }
    if (variant == "image") {
        row.icon = "image";
        row.value = tr("Run to generate");
    } else if (variant == "video") {
        row.icon = "movie";
        row.value = tr("Run to generate video");
    } else if (variant == "str" || variant == "text") {
        row.icon = "textFields";
        row.value = tr("Run to generate text");
    } else if (variant == "audio") {
        row.icon = "equalizer";
        row.value = tr("Run to generate audio");
    } else if (variant == "model_3d" || variant == "asset_3d") {
        row.icon = "none";
        row.value = tr("Run to generate 3D");
    } else {
        row.icon = "none";
        row.value = tr("Run model");
    }
    row.y = nm::contentPreviewTop;
    row.height = std::max<double>(nm::previewHeight - (nm::contentPreviewTop - nm::contentTop), y - row.y);
    result.rows.append(row);
    y = row.y + row.height + nm::micro;
    // The content card body pads 4 px below its preview, inside the card border.
    end = y + nm::micro + nm::borderWidth;
  } else if (anyHandle) {
    y += nm::padding + nm::borderWidth;
    end = y;
  }
  const auto cardWidth = width > 0 ? width : double(nm::defaultWidth);
  const auto inset = double(nm::borderWidth + nm::padding);
  // Model chips sit under a content card's preview and after a generic card's rows.
  const auto chipNames = modelChipNames(meta, ui);
  // The field's button text from ModelProperty.tsx: the model name and its
  // provider's display name. The stored value stands in for the catalog entry,
  // which the card does not load.
  const auto fillModelChip = [](NodeRow &chip, const QVariantMap &field) {
      const auto model = field["value"].toMap();
      auto provider = model.value("provider").toString();
      if (provider == "empty") {
          provider.clear();
      }
      const auto allowed = field["allowedProviders"].toStringList();
      if (provider.isEmpty() && field["value"].typeId() == QMetaType::QString && !allowed.isEmpty()) {
          provider = allowed.first();
      }
      const auto details = model.value("name").toString().isEmpty() ? QVariantMap{} : model;
      const auto text = nt::modelpicker::fieldLabel(field["modelType"].toString(), field["value"], details, provider);
      chip.value = text.label;
      chip.typeName = text.secondary;
      chip.placeholder = !text.active;
  };
  const auto addModelChips = [&] {
      for (const auto &name : chipNames) {
          const auto field = fields.value(name);
          if (field.isEmpty() || field["connected"].toBool()) {
              continue;
          }
          NodeRow chip;
          chip.kind = NodeRowKind::ModelChip;
          chip.propertyName = name;
          chip.label = field["label"].toString();
          // One chip drops its label, as NodeModelChips does.
          chip.bare = chipNames.size() == 1;
          if (!chip.bare) {
              chip.y = y;
              y += nm::rowHeight;
          }
          chip.rect = QRectF(inset, y, cardWidth - 2 * inset, nm::modelChipHeight);
          chip.y = chip.bare ? y : chip.y;
          chip.fieldY = y;
          chip.height = nm::modelChipHeight;
          fillModelChip(chip, field);
          result.rows.append(chip);
          y = chip.rect.bottom();
          end = y + nm::micro + nm::borderWidth;
      }
  };
  if (contentCard) {
      addModelChips();
  }
  bool first = true;
  for (int i = 0; i < inputs.size(); ++i) {
    const auto port = inputs[i].toObject();
    const auto name = port["name"].toString();
    if (handleOnly.contains(name)) { continue; }
    // The control handle sits at the top center of the card and has no row.
    if (name == "__control__") { continue; }
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
    // DataframeProperty.tsx has no label row either.
    const bool documentDropZone = kind == "document" && (type == QStringLiteral("nodetool.constant.Document") || type == QStringLiteral("nodetool.input.DocumentInput"));
    const bool bareField = (contentCard && kind == "choice" && !connected) || (kind == "dataframe" && !connected) || (documentDropZone && !connected);
    // A constant Image, Video or Audio card hides its value label (special_nodes.css).
    const bool bareMedia = !connected && kind == "media" && cardMediaBare(type);
    row.bare = bareField || bareMedia;
    result.inputY[i] = y + (bareField ? nm::fieldHeight : nm::rowHeight) / 2.0;
    if (!row.bare) { y += nm::rowHeight; }
    const auto hasValue = value.isValid() && !value.isNull();
    if (!connected && (kind == "text" || kind == "multiline" || kind == "choice")) {
      row.kind = kind == "multiline" ? NodeRowKind::Multiline : NodeRowKind::Field;
      row.choice = kind == "choice";
      // SelectProperty.tsx reads an unset or empty value as its "Select…" placeholder.
      const bool selectEmpty = field["optionsFromNode"].toBool() && (!hasValue || value.toString().isEmpty());
      row.placeholder = !hasValue || selectEmpty;
      row.value = selectEmpty ? tr("Select\u2026") : hasValue ? value.toString() : tr("Not set");
      row.fieldY = y;
      row.height = kind == "multiline" ? nm::multilineFieldHeight : nm::fieldHeight;
      y += row.height;
    } else if (!connected && (kind == "number" || kind == "integer")) {
      row.kind = NodeRowKind::Number;
      row.value = hasValue ? value.toString() : tr("Not set");
      if (type == QStringLiteral("nodetool.input.IntegerInput")) {
        row.kind = NodeRowKind::Field;
        row.fieldY = y;
        row.height = nm::integerFieldHeight;
        y += row.height + nm::integerFieldBottomGap;
      }
    } else if (!connected && kind == "boolean") {
      row.kind = NodeRowKind::Toggle;
      row.checked = value.toBool();
    } else if (!connected && kind == "dataframe") {
      // DataframeProperty.tsx: an Add column button, a drop zone, then the
      // columns and a table once the frame holds data.
      const auto frame = value.toMap();
      NodeRow add;
      add.kind = NodeRowKind::Action;
      add.action = QStringLiteral("addColumn");
      add.propertyName = name;
      add.label = tr("Add column");
      add.bare = true;
      QFont font(QStringLiteral("Inter"));
      font.setPixelSize(nm::fontValue);
      add.rect = QRectF(inset, y, QFontMetricsF(font).horizontalAdvance(add.label) + 2 * nm::chipPadding, nm::dataframeButtonHeight);
      add.y = y;
      add.height = add.rect.height();
      result.rows.append(add);
      y = add.rect.bottom() + nm::inlineRowGap;
      row.kind = NodeRowKind::DropZone;
      row.label.clear();
      row.typeName = QStringLiteral("dataframe");
      row.placeholder = true;
      row.value = tr("Drop CSV or Excel file").toUpper();
      row.options = {tr("Supported: CSV, XLSX, XLS")};
      row.icon = QStringLiteral("uploadFile");
      row.rect = QRectF(inset, y, cardWidth - 2 * inset, nm::dataframeDropHeight);
      row.fieldY = row.rect.y();
      row.height = row.rect.height();
      y = row.rect.bottom() + nm::inlineRowGap;
      const auto table = dataframeSummary(frame);
      if (!table.isEmpty()) {
        result.rows.append(row);
        row = NodeRow{};
        row.kind = NodeRowKind::Multiline;
        row.bare = true;
        row.value = table;
        row.rect = QRectF(inset, y, cardWidth - 2 * inset, nm::dataframeTableHeight);
        row.y = y;
        row.fieldY = y;
        row.height = row.rect.height();
        y = row.rect.bottom();
      }
    } else if (!connected && kind == "document_ref") {
      // DocumentPickerProperty.tsx: the label, then the select with the open button beside it.
      const auto documentKind = field["dataType"].toMap()["type"].toString();
      const auto reference = value.toMap();
      NodeRow caption;
      caption.kind = NodeRowKind::Label;
      caption.label = row.label;
      caption.textSize = nm::fontLabel;
      caption.y = row.y;
      caption.height = nm::rowHeight;
      caption.rect = QRectF(inset, row.y, cardWidth - 2 * inset, nm::rowHeight);
      result.rows.append(caption);
      const double buttonSize = nm::fieldHeight;
      row.kind = NodeRowKind::Field;
      row.choice = true;
      row.bare = true;
      row.rect = QRectF(inset, y, cardWidth - 2 * inset - buttonSize - nm::chipGap, nm::fieldHeight);
      row.fieldY = y;
      row.height = nm::fieldHeight;
      // The web select shows the document's name. The card knows the name only
      // once the stored reference carries it, so a chosen document reads as untitled.
      if (!reference.value("id").toString().isEmpty()) {
        row.value = !reference.value("name").toString().isEmpty() ? reference.value("name").toString()
            : documentKind == QStringLiteral("timeline") ? tr("Untitled video") : tr("Untitled %1").arg(documentKind);
      }
      NodeRow open;
      open.kind = NodeRowKind::Action;
      open.action = QStringLiteral("openDocument");
      open.propertyName = name;
      open.value = documentKind;
      open.icon = documentKind == QStringLiteral("timeline") ? QStringLiteral("movie")
          : documentKind == QStringLiteral("sketch") ? QStringLiteral("brush")
          : documentKind == QStringLiteral("storyboard") ? QStringLiteral("viewCarousel") : QStringLiteral("document");
      open.rect = QRectF(row.rect.right() + nm::chipGap, y, buttonSize, buttonSize);
      open.y = y;
      open.height = buttonSize;
      result.rows.append(open);
      y += nm::fieldHeight;
    } else if (!connected && kind == "entity") {
      // EntityProperty.tsx: the label, then a chip for the picked entity.
      const auto entity = value.toMap();
      const double chipWidth = cardWidth - 2 * inset;
      NodeRow chip;
      chip.kind = NodeRowKind::Action;
      chip.action = QStringLiteral("entityChip");
      chip.propertyName = name;
      chip.bare = true;
      chip.label = entity.value("name").toString().isEmpty() ? tr("Untitled") : entity.value("name").toString();
      QFont chipFont(QStringLiteral("Inter"));
      chipFont.setPixelSize(nm::fontValue);
      chip.rect = QRectF(inset, y, std::min(chipWidth, QFontMetricsF(chipFont).horizontalAdvance(chip.label) + 2.0 * nm::chipPadding), nm::chipHeight + nm::chipGap);
      chip.y = y;
      chip.height = chip.rect.height();
      result.rows.append(chip);
      y = chip.rect.bottom();
    } else if (!connected && kind == "image_size") {
      // ImageSizeProperty.tsx: W and H boxes 4 px under the label, then the
      // name of the preset that matches the size. The real editor, with its
      // swap, lock and preset controls, opens over the strip on a click.
      const auto size = value.toMap();
      const auto width = size.contains("width") ? size.value("width").toInt() : 1024;
      const auto height = size.contains("height") ? size.value("height").toInt() : 1024;
      row.kind = NodeRowKind::ImageSize;
      row.options = {QStringLiteral("W"), QStringLiteral("H")};
      row.optionValues = {width, height};
      row.value = imageSizePresetCaption(width, height);
      row.rect = QRectF(inset, y + 2 * nm::micro, cardWidth - 2 * inset, nm::controlHeight);
      const auto boxWidth = 70.0;
      row.parts = {QRectF(row.rect.x(), row.rect.y(), boxWidth, row.rect.height()),
                   QRectF(row.rect.x() + boxWidth + nm::chipGap * 2, row.rect.y(), boxWidth, row.rect.height())};
      row.fieldY = row.rect.y();
      row.height = row.rect.height();
      y = row.rect.bottom() + (row.value.isEmpty() ? 0 : nm::imageSizeCaptionHeight);
    } else if (!connected && kind == "model") {
      // An inline model field, such as a model constant's value, is a label
      // above the model button. The button paints its own label.
      row.kind = NodeRowKind::ModelChip;
      row.bare = false;
      row.rect = QRectF(inset, y, cardWidth - 2 * inset, nm::modelChipHeight);
      row.fieldY = y;
      row.height = nm::modelChipHeight;
      fillModelChip(row, field);
      y += row.height;
    } else if (!connected && (inlineResource(kind) || inlineStructured(field))) {
      const auto nodeType = field["nodeType"].toString();
      const bool constantTable = (nodeType == QStringLiteral("nodetool.constant.List") && kind == "list")
          || (nodeType == QStringLiteral("nodetool.constant.Dict") && kind == "dict");
      const auto summary = inlineSummary(field);
      row.kind = inlineResource(kind) ? NodeRowKind::Field : NodeRowKind::Multiline;
      row.choice = inlineResource(kind);
      // JSONProperty.tsx shows an empty editor and StringListProperty.tsx the
      // prompt "Enter values…" for an unset value.
      row.placeholder = summary.isEmpty() && kind != "json";
      row.value = !summary.isEmpty() || kind == "json" ? summary : kind == "list" && !constantTable ? tr("Enter values\u2026") : tr("Not set");
      if (constantTable) {
        // ListProperty.tsx and DictProperty.tsx: a "Data type" select above the table.
        NodeRow type;
        type.kind = NodeRowKind::Field;
        type.choice = true;
        type.label = tr("Data type");
        type.y = row.y;
        type.fieldY = y;
        type.height = nm::fieldHeight;
        type.value = constantTableType(field);
        result.rows.append(type);
        y += nm::fieldHeight + nm::inlineRowGap;
        row.bare = true;
        row.y = y;
      }
      row.fieldY = y;
      row.height = row.choice ? nm::fieldHeight : nm::multilineFieldHeight;
      y += row.height;
    } else if (!connected && ((kind == "document" && documentDropZone) || kind == "model3d")) {
      // PropertyDropzone.tsx shows the Document constant's drop zone without a label.
      // Model3DProperty.tsx keeps the label above its zone.
      const bool model3d = kind == "model3d";
      const auto reference = value.toMap();
      const auto uri = reference.value("uri").toString();
      row.kind = NodeRowKind::DropZone;
      row.typeName = model3d ? QStringLiteral("model_3d") : QStringLiteral("document");
      if (!model3d) { row.label.clear(); }
      row.placeholder = uri.isEmpty() && reference.value("asset_id").toString().isEmpty();
      row.value = !row.placeholder ? (QUrl(uri).fileName().isEmpty() ? reference.value("asset_id").toString() : QUrl(uri).fileName())
          : model3d ? tr("Drop 3D model (GLB, GLTF)").toUpper() : tr("Click or drop %1").arg(row.typeName).toUpper();
      row.icon = model3d ? QStringLiteral("none") : QStringLiteral("document");
      row.rect = QRectF(inset, y + nm::dropZoneGap, cardWidth - 2 * inset, nm::dropZoneHeight);
      row.fieldY = row.rect.y();
      row.height = row.rect.height();
      y = row.rect.bottom() + nm::inlineRowGap;
    } else if (!connected && (kind == "media" || kind == "media_list")) {
      // A media value is a drop zone that shows its media, as the web image,
      // audio and video properties and their lists.
      y = layoutCardMedia(row, {resourceId(id), type, name, field["mediaType"].toString(), value, kind == "media_list"},
                          y, inset, cardWidth, cardMedia_);
    }
    if (row.conditionalUnavailable) { y += nm::rowHeight; }
    result.rows.append(row);
    end = y;
  }
  if (!contentCard) {
      if (!chipNames.isEmpty() && !first) {
          y += nm::inlineRowGap;
      }
      addModelChips();
  }
  // NodePropertyForm on generic cards and the content card's footer strip.
  const auto addAction = [&](const QString &action, const QString &label, bool right) {
      NodeRow add;
      add.kind = NodeRowKind::Action;
      add.action = action;
      add.label = label;
      QFont font(QStringLiteral("Inter"));
      font.setPixelSize(nm::fontLabel);
      const auto buttonWidth = QFontMetricsF(font).horizontalAdvance(add.label) + nm::iconSize + 4 * nm::chipPadding;
      const auto x = !contentCard && right ? cardWidth - inset - buttonWidth : inset;
      add.rect = QRectF(x, y + nm::actionGap, buttonWidth, nm::actionHeight);
      add.y = add.rect.y();
      add.height = add.rect.height();
      result.rows.append(add);
      y = add.rect.bottom();
      end = y + nm::micro + nm::borderWidth;
  };
  // A provider node's inputs follow its schema, so the shell offers no add buttons.
  if (!result.unknown && meta["supports_dynamic_inputs"].toBool() && !result.subgraph && provider.label.isEmpty()) {
      addAction(contentCard ? QStringLiteral("addContentInput") : QStringLiteral("addInput"), contentCard ? contentInputLabel(meta) : tr("Add input"), false);
  }
  if (!result.unknown && meta["supports_dynamic_outputs"].toBool() && !result.subgraph && provider.label.isEmpty()) {
      addAction(QStringLiteral("addOutput"), tr("Add output"), true);
  }
  // The provider footer: a rule and the caption 2 px below the inputs, at the
  // bottom of the shell's 120 px content column.
  if (!provider.label.isEmpty()) {
      const auto height = nm::borderWidth + 2.0 * nm::schemaFooterPadding + nm::fontValue * 1.4;
      const auto top = std::max(end + nm::schemaFooterPadding, nm::borderWidth + nm::headerHeight + nm::schemaContentMinimum - height);
      NodeRow footer;
      footer.kind = NodeRowKind::Label;
      footer.label = schemaFooter(provider, ui);
      footer.bare = true;
      footer.checked = true;
      footer.rect = QRectF(nm::borderWidth, top, (width > 0 ? width : double(nm::defaultWidth)) - 2 * nm::borderWidth, height);
      footer.y = top;
      footer.height = height;
      result.rows.append(footer);
      // The size below adds the card padding, and the footer meets the bottom border.
      end = footer.rect.bottom() + nm::borderWidth - nm::padding;
  }
  result.outputY.resize(outputs.size());
  // The control handle sits at the bottom center of the card, so it takes no output row.
  int slot = 0;
  for (int i = 0; i < outputs.size(); ++i) {
    if (outputs[i].toObject()["name"] == "__control__") { continue; }
    result.outputY[i] = nm::contentTop + nm::rowHeight / 2.0 + slot++ * nm::handleRowStep;

  }
  // A card without a body row keeps the header and one empty handle row.
  const auto minimum = nm::contentTop + nm::rowHeight + nm::padding + nm::borderWidth;
  result.size = QSize(width > 0 ? int(width) : nm::defaultWidth,
                      int(std::ceil(std::max<double>(end, minimum) + nm::padding)));
  if (canvasMediaNodes_.contains(resourceId(id))) { result.size.rheight() += nm::playbackHeight + nm::rowHeight; }
  else if (hasRuntimeOutput(id)) { result.size.rheight() += nm::previewHeight + nm::rowHeight; }
    result.runningProgress = result.subgraph && runtimeState(id)["status"] == "running" && runtimeState(id)["total"].toDouble() > 0;
    if (result.runningProgress) { result.size.rheight() += nm::handleRowStep; }
    result.progressBand = !result.subgraph && runtimeState(id)["status"] == "running" && runtimeState(id)["total"].toDouble() > 0;
    if (result.progressBand) {
        result.size.rheight() += nm::progressHeight;
    }
    result.addOutput = result.subgraph && meta["supports_dynamic_outputs"].toBool();
    if (result.addOutput) { result.size.rheight() += nm::handleRowStep; }
    if (result.subgraph) { result.size.rheight() += nm::handleRowStep; }
  result.minimumSize = QSize(150, result.size.height());
  result.size.setHeight(std::max(result.size.height(), ui["height"].toInt()));
  stretchCardMedia(result, type);
  addRenameControls();
  if (ui["collapsed"].toBool()) { result = collapsedLayout(result, ui); }
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
  if (const auto metadata = catalogEntry(n["type"]); !metadata.isEmpty()) {
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
      // A bespoke body draws its own fixed handles and controls, as rendersExposedInputHandles.
      const auto body = cardBodyFor(n["type"].toString(), metadata);
      const bool bespoke = drawsOwnHandles(body);
      if (type == PortType::In && bespoke && !bespokeHandle(body, metadata, name.toString()) && !connectedInputs.contains(name.toString())) {
        names.insert(declaration["name"].toString());
        continue;
      }
      if (type == PortType::In && !bespoke && !handleOnly && !connectedInputs.contains(name.toString()) &&
          (!cardField(metadata, ui, declaration) || !node_editor::propertyConditionSatisfied(declaration, n["data"].toObject()))) {
        names.insert(declaration["name"].toString());
        continue;
      }
      append(declaration);
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
    // A bespoke select offers its body's choices, such as Get Variable's Set Variable names.
    for (const auto &row : layout(id).rows) {
      if (row.propertyName != name || !row.choice || row.optionValues.isEmpty() || row.kind != NodeRowKind::Field) { continue; }
      QVariantList options;
      for (int i = 0; i < row.optionValues.size(); ++i) { options.append(QVariantMap{{"label", row.options.value(i)}, {"value", row.optionValues[i]}}); }
      auto choice = field;
      choice["kind"] = QStringLiteral("choice");
      choice["options"] = options;
      return choice;
    }
    const auto kind = field["kind"].toString();
    if (kind == "text" || kind == "multiline" || kind == "number" || kind == "integer" || kind == "choice" || kind == "boolean" || kind == "model"
        || kind == "image_size" || kind == "document_ref" || inlineResource(kind) || inlineStructured(field)) { return field; }
  }
  return {};
}
void WorkflowGraphModel::setPreviewTab(NodeId id, const QString &tab) {
    const auto resource = resourceId(id);
    if (resource.isEmpty() || previewTabs_.value(resource) == tab) {
        return;
    }
    previewTabs_.insert(resource, tab);
    refreshRuntimeNode(resource);
}
void WorkflowGraphModel::toggleListItem(NodeId id, int index) {
    const auto resource = resourceId(id);
    if (resource.isEmpty() || index < 0) {
        return;
    }
    auto &expanded = expandedListItems_[resource];
    if (!expanded.remove(index)) {
        expanded.insert(index);
    }
    refreshRuntimeNode(resource);
}
void WorkflowGraphModel::setDimensionsLinked(NodeId id, bool linked) {
    const auto resource = resourceId(id);
    if (resource.isEmpty() || dimensionsLinked(id) == linked) {
        return;
    }
    const auto data = nodes_.value(id)["data"].toObject();
    const auto meta = metadata(id);
    double width = 0;
    double height = 0;
    for (const auto &value : meta["properties"].toArray()) {
        const auto property = value.toObject();
        if (property["name"] == "width") {
            width = data.value("width").toDouble(property["default"].toDouble());
        } else if (property["name"] == "height") {
            height = data.value("height").toDouble(property["default"].toDouble());
        }
    }
    // ResizeImageBody records the ratio when the lock closes and only while both sides are set.
    if (linked) {
        dimensionLinks_.insert(resource, width > 0 && height > 0 ? width / height : 0.0);
    } else {
        dimensionLinks_.remove(resource);
    }
    refreshRuntimeNode(resource);
}
QJsonObject WorkflowGraphModel::propertyCommand(NodeId id, const QString &name, const QJsonValue &value) const {
    const auto resource = resourceId(id);
    QJsonObject command{{"op", "setProperty"}, {"id", resource}, {"name", name}, {"value", value}};
    const auto aspect = dimensionLinks_.value(resource);
    const auto body = layout(id).body;
    if (aspect <= 0 || (name != "width" && name != "height") || !value.isDouble()
        || (body != CardBody::ResizeImage && body != CardBody::Resize)) {
        return command;
    }
    const auto mode = nodes_.value(id)["data"].toObject().value("mode").toString(QStringLiteral("dimensions"));
    // ResizeBody keeps each side at least 1, and ResizeImageBody allows 0 in its Dimensions mode.
    const auto minimum = body == CardBody::ResizeImage && mode == QStringLiteral("dimensions") ? 0.0 : 1.0;
    const auto entered = std::max(minimum, std::round(value.toDouble()));
    const auto other = std::max(minimum, std::round(name == "width" ? entered / aspect : entered * aspect));
    const auto otherName = name == "width" ? QStringLiteral("height") : QStringLiteral("width");
    return {{"op", "batch"}, {"commands", QJsonArray{
        QJsonObject{{"op", "setProperty"}, {"id", resource}, {"name", name}, {"value", entered}},
        QJsonObject{{"op", "setProperty"}, {"id", resource}, {"name", otherName}, {"value", other}}}}};
}
QJsonObject WorkflowGraphModel::addDataframeColumnCommand(NodeId id, const QString &name) const {
    const auto data = nodes_.value(id)["data"].toObject();
    QJsonObject frame = data.contains(name) ? data.value(name).toObject() : QJsonObject{};
    if (!data.contains(name)) {
        for (const auto &declared : metadata(id)["properties"].toArray()) {
            if (declared.toObject()["name"] == name) { frame = declared.toObject()["default"].toObject(); }
        }
    }
    if (!frame.contains("type")) { frame["type"] = QStringLiteral("dataframe"); }
    auto columns = frame["columns"].toArray();
    QSet<QString> taken;
    for (const auto &column : columns) { taken.insert(column.toObject()["name"].toString()); }
    int index = 1;
    while (taken.contains(QStringLiteral("Column %1").arg(index))) { ++index; }
    columns.append(QJsonObject{{"name", QStringLiteral("Column %1").arg(index)}, {"data_type", "string"}, {"description", ""}});
    frame["columns"] = columns;
    return propertyCommand(id, name, frame);
}
int WorkflowGraphModel::dropZoneAt(NodeId id, const QPointF &point) const {
    if (readOnly_ || !nodeExists(id)) {
        return -1;
    }
    const auto &rows = layout(id).rows;
    for (int i = 0; i < rows.size(); ++i) {
        // A list's zone appends files, which the canvas does not do yet. A Collection's zone does.
        if (rows[i].kind == NodeRowKind::DropZone && (!rows[i].mediaList || layout(id).body == CardBody::Collection)
            && rows[i].rect.contains(point)) {
            return i;
        }
    }
    return -1;
}
bool WorkflowGraphModel::portVisible(NodeId id, PortType side, PortIndex index) const {
  if (side == PortType::None) { return false; }
  const auto declarations = ports(id, side);
  if (index >= unsigned(declarations.size())) { return false; }
  const auto name = declarations[int(index)].toObject()["name"].toString();
  if (name == "__control__" || isReroute(id)) { return true; }
  const auto node = nodes_.value(id);
  const auto meta = metadata(id);
  const auto body = cardBodyFor(node["type"].toString(), meta);
  if (side == PortType::Out) { return body != CardBody::Output; }
  if (drawsOwnHandles(body)) {
    return bespokeHandle(body, meta, name)
        || (body == CardBody::Prompt && (node["dynamic_properties"].toObject().contains(name)
            || node["dynamic_inputs"].toObject().contains(name)));
  }
  if (body == CardBody::Content) {
    const auto ui = node["ui_properties"].toObject();
    if (ui["exposed_inputs_hidden"].toArray().contains(name)) { return false; }
    return cardField(meta, ui, declarations[int(index)].toObject())
        || meta["input_fields"].toArray().contains(name) || ui["exposed_inputs"].toArray().contains(name)
        || node["dynamic_inputs"].toObject().contains(name) || node["dynamic_properties"].toObject().contains(name);
  }
  return true;
}

bool WorkflowGraphModel::wireVisible(ConnectionId id) const {
  return (id.outNodeId == InvalidNodeId || portVisible(id.outNodeId, PortType::Out, id.outPortIndex))
      && (id.inNodeId == InvalidNodeId || portVisible(id.inNodeId, PortType::In, id.inPortIndex));
}

QRectF WorkflowGraphModel::inlineFieldRect(NodeId id, const QString &name) const {
  const auto &card = layout(id);
  const auto inset = node_metrics::borderWidth + node_metrics::padding;
  for (const auto &row : card.rows) {
    // An action button names its property but is not that property's editor.
    if (row.propertyName != name || name.isEmpty() || row.kind == NodeRowKind::Action) { continue; }
    // Bespoke controls carry their bounds. Sliders, mode switches and drop zones take pointer input on the canvas.
    if (row.kind == NodeRowKind::Slider || row.kind == NodeRowKind::Segmented || row.kind == NodeRowKind::DropZone) { return {}; }
    if (!row.rect.isEmpty()) { return row.rect; }
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
bool WorkflowGraphModel::collapsed(NodeId id) const {
  return !isGroup(id) && !isComment(id) && !isReroute(id) && nodes_.value(id)["ui_properties"].toObject()["collapsed"].toBool();
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
