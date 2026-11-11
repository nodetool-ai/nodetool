#include "NodeRuntimeModel.h"
#include <QJsonArray>
#include <QJsonDocument>
#include <cmath>
#include <algorithm>

namespace nodetool::node_editor {
namespace {
bool terminal(const QString &status) {
  return status == "completed" || status == "finished" || status == "failed" || status == "cancelled" || status == "timed_out" || status == "error";
}
constexpr qsizetype TextLimit = 65536;
constexpr qsizetype ValueBudget = 131072;
constexpr qsizetype CollectionLimit = 128;
QJsonValue bounded(const QJsonValue &value, qsizetype &budget, bool &truncated, int depth = 0) {
  if (budget <= 0 || depth > 8) { truncated = true; return "[Preview truncated]"; }
  if (value.isString()) {
    const auto source = value.toString();
    const auto length = std::min({source.size(), TextLimit, budget});
    budget -= length;
    if (length < source.size()) {
      truncated = true;
      if (source.startsWith("asset://") || source.startsWith("data:") || source.startsWith("https://") || source.startsWith("http://")) {
        return "[Preview locator omitted: exceeds display limits]";
      }
    }
    return source.left(length);
  }
  if (value.isObject()) {
    QJsonObject result;
    auto object = value.toObject();
    const auto mediaType = object.value("type").toString();
    const bool media = mediaType == "image" || mediaType == "video" || mediaType == "audio";
    bool omittedMedia = false;
    if (media) {
      for (const auto &key : {"uri", "url", "asset_id", "data", "base64"}) {
        if ((object.value(key).isString() && object.value(key).toString().size() > std::min(TextLimit, budget)) || object.value(key).isArray() || object.value(key).isObject()) {
          object.remove(key);
          omittedMedia = true;
          truncated = true;
        }
      }
      if (omittedMedia) {
        bool hasLocator = false;
        for (const auto &key : {"uri", "url", "asset_id", "data", "base64"}) {
          hasLocator = hasLocator || (object.value(key).isString() && !object.value(key).toString().isEmpty());
        }
        if (!hasLocator) { return QJsonObject{{"type", "preview_omitted"}, {"reason", "Media exceeds preview display limits"}}; }
        object["preview_notice"] = "Oversized media omitted from preview";
      }
    }
    auto keys = object.keys();
    const auto priority = [&object](const QString &key) {
      if (key == "type" || key == "uri" || key == "url" || key == "asset_id" || key == "mime_type") { return 0; }
      if (object[key].isObject() || object[key].isArray()) { return 1; }
      return 2;
    };
    std::stable_sort(keys.begin(), keys.end(), [&priority](const QString &a, const QString &b) { return priority(a) < priority(b); });
    for (const auto &sourceKey : keys) {
      if (result.size() >= CollectionLimit || budget <= 0) { truncated = true; break; }
      const auto key = sourceKey.left(1024);
      if (key != sourceKey) { truncated = true; }
      budget -= key.size() + 8;
      const auto item = object[sourceKey];
      if (media && (key == "uri" || key == "url" || key == "asset_id" || key == "data" || key == "base64") && item.isString()) {
        if (item.toString().size() > budget) {
          truncated = true;
          return QJsonObject{{"type", "preview_omitted"}, {"reason", "Media exceeds preview display limits"}};
        }
        budget -= item.toString().size();
        result[key] = item;
      } else {
        result[key] = bounded(item, budget, truncated, depth + 1);
      }
    }
    return result;
  }
  if (value.isArray()) {
    QJsonArray result;
    for (const auto &item : value.toArray()) {
      if (result.size() >= CollectionLimit || budget <= 0) { truncated = true; break; }
      budget -= 8;
      result.append(bounded(item, budget, truncated, depth + 1));
    }
    return result;
  }
  budget -= 16;
  return value;
}
QJsonValue previewValue(const QJsonValue &value, bool &truncated) {
  qsizetype budget = ValueBudget;
  return bounded(value, budget, truncated);
}
QString text(const QJsonValue &value) {
  if (value.isString()) { return value.toString(); }
  if (value.isUndefined() || value.isNull()) { return {}; }
  const auto bytes = QJsonDocument(QJsonArray{value}).toJson(QJsonDocument::Compact);
  return QString::fromUtf8(bytes.mid(1, bytes.size() - 2));
}
}
NodeRuntimeModel::NodeRuntimeModel(QObject *parent) : QObject(parent) {}
QJsonObject NodeRuntimeModel::nodeState(const QString &nodeId) const {
  const auto run = runs_.constFind(selected_);
  if (run == runs_.cend()) { return {}; }
  auto state = run->nodes.value(nodeId);
  if (run->truncated) {
    state["truncated"] = true;
    state["notice"] = "Run preview truncated to display limits";
    state["text"] = state["text"].toString() + "\n[Run preview truncated to display limits]";
  }
  return state;
}
QJsonObject NodeRuntimeModel::edgeState(const QString &edgeId) const {
  const auto run = runs_.constFind(selected_);
  return run == runs_.cend() ? QJsonObject{} : run->edges.value(edgeId);
}
void NodeRuntimeModel::beginRun(QString jobId) {
  if (jobId.isEmpty() || jobId.size() > 1024) { return; }
  if (!runs_.contains(jobId)) {
    // Retain active runs even when the completed history reaches its bound.
    while (order_.size() >= 20) {
      auto old = std::find_if(order_.begin(), order_.end(), [this](const QString &id) { return runs_[id].terminal; });
      if (old == order_.end()) { break; }
      runs_.remove(*old);
      order_.erase(old);
    }
    runs_.insert(jobId, {});
    order_.append(jobId);
  }
  selectRun(jobId);
}
void NodeRuntimeModel::selectRun(QString jobId) {
  // The output panel selects no run after a server, workflow or file change, so the
  // canvas stops projecting the previous run.
  if (!runs_.contains(jobId)) { jobId.clear(); }
  if (selected_ == jobId) { return; }
  selected_ = jobId;
  emit projectionChanged();
}
void NodeRuntimeModel::reset() {
  runs_.clear();
  order_.clear();
  if (selected_.isEmpty()) { return; }
  selected_.clear();
  emit projectionChanged();
}
void NodeRuntimeModel::setConnected(bool connected) {
  if (connected_ == connected) { return; }
  connected_ = connected;
  emit projectionChanged();
}
void NodeRuntimeModel::ingest(QString jobId, const QJsonObject event) {
  auto found = runs_.find(jobId);
  if (found == runs_.end() || event["job_id"].toString() != jobId) { return; }
  const auto type = event["type"].toString();
  if (type != "node_update" && type != "node_progress" && type != "output_update" && type != "generation_complete" && type != "edge_update" && type != "job_update" && type != "job_resumed") { return; }
  auto &run = *found;
  // A null sequence, as on a `job_resumed` reply, is no sequence.
  const auto stamp = event.value("job_seq");
  if (!stamp.isUndefined() && !stamp.isNull()) {
    const auto sequence = stamp.toDouble();
    if (!std::isfinite(sequence) || sequence <= 0 || sequence <= run.sequence) { return; }
    run.sequence = sequence;
  }
  if (type == "job_resumed" && event["status"] == "unknown") {
    // The server lost the run. As settleLostRun in web/src/stores/workflowUpdates.ts
    // does, drop its statuses, progress and edge reports. Results stay.
    if (run.terminal) { return; }
    run.terminal = true;
    run.terminalStatus.clear();
    for (auto it = run.nodes.begin(); it != run.nodes.end(); ++it) {
      for (const auto *key : {"status", "progress", "total"}) { it.value().remove(QLatin1String(key)); }
    }
    run.edges.clear();
    if (selected_ == jobId) { emit projectionChanged(); }
    return;
  }
  // A "finished" reply with frames to replay is followed by the run's own terminal
  // job_update, which carries the real outcome.
  if (type == "job_resumed" && event["replay_count"].toDouble() > 0) { return; }
  if (type == "job_update" || type == "job_resumed") {
    if (run.terminal || !terminal(event["status"].toString())) { return; }
    run.terminal = true;
    run.terminalStatus = event["status"].toString();
    for (auto it = run.nodes.begin(); it != run.nodes.end(); ++it) {
      if (!terminal(it.value()["status"].toString())) {
        it.value()["status"] = event["status"];
      }
    }
    // Edge reports stay for the finished run: the canvas still marks the
    // untaken branch of an If or Switch after the run ends.
    if (selected_ == jobId) { emit projectionChanged(); }
    return;
  }
  if (type == "edge_update") {
    if (run.terminal) { return; }
    const auto id = event["edge_id"].toString();
    if (id.isEmpty() || id.size() > 1024) { return; }
    const auto status = event["status"].toString();
    if (status.size() > 1024) { run.truncated = true; }
    const QJsonObject state{{"status", status.left(1024)},
                            {"counter", event["counter"].isDouble() ? event["counter"] : QJsonValue{}}};
    if (run.edges.value(id) == state) { return; }
    if (!run.edges.contains(id) && run.edges.size() >= 10000) {
      run.edges.erase(run.edges.begin());
      run.truncated = true;
    }
    run.edges[id] = state;
    if (selected_ == jobId) { emit projectionChanged(); }
    return;
  }
  // Late node frames of a cancelled run are dropped, as handleNodeUpdate does on the web.
  if (type == "node_update" && run.terminalStatus == "cancelled") { return; }
  const auto id = event["node_id"].toString();
  if (id.isEmpty() || id.size() > 1024) { return; }
  if (!run.nodes.contains(id) && run.nodes.size() >= 10000) {
    if (!run.truncated) {
      run.truncated = true;
      if (selected_ == jobId) { emit projectionChanged(); }
    }
    return;
  }
  auto state = run.nodes.value(id);
  const bool stopped = run.terminal || terminal(state["status"].toString());
  bool truncated = state["truncated"].toBool();
  if (run.terminal && state["status"].toString().isEmpty() && !run.terminalStatus.isEmpty()) { state["status"] = run.terminalStatus; }
  if (type == "node_update") {
    if (!stopped) {
      const auto status = event["status"].toString();
      if (status.size() > 1024) { truncated = true; }
      state["status"] = status.left(1024);
    }
    if (event["error"].isString() && !event["error"].toString().isEmpty()) {
      state["error"] = previewValue(event["error"], truncated);
    }
    if (event["result"].isObject()) { state["result"] = previewValue(event["result"], truncated); }
  } else if (type == "node_progress") {
    if (stopped) { return; }
    const auto progress = event["progress"].toDouble(-1), total = event["total"].toDouble(-1);
    if (!std::isfinite(progress) || !std::isfinite(total) || progress < 0 || total < 0) { return; }
    state["progress"] = progress;
    state["total"] = total;
    if (state["status"].toString().isEmpty()) { state["status"] = "running"; }
  } else if (type == "generation_complete") {
    state["result"] = previewValue(event["outputs"].toObject(), truncated);
  } else {
    const auto name = event["output_name"].toString();
    if (!event.contains("value") || name.size() > 1024) { return; }
    auto outputs = state["outputs"].toObject();
    auto value = event["value"];
    if (value.isString() && event["disposition"] != "replace") {
      value = outputs[name].toString() + value.toString();
    }
    value = previewValue(value, truncated);
    if (!outputs.contains(name) && outputs.size() >= CollectionLimit) {
      outputs.erase(outputs.begin());
      truncated = true;
    }
    outputs[name] = value;
    state["outputs"] = previewValue(outputs, truncated);
    const auto display = text(value);
    if (display.size() > TextLimit) { truncated = true; }
    state["text"] = display.left(TextLimit);
    state["done"] = event["done"].toBool();
  }
  if (truncated) {
    state["truncated"] = true;
    state["notice"] = "Preview truncated to display limits";
    const auto error = state["error"].toString();
    if (!error.isEmpty()) { state["error"] = error.left(TextLimit) + "\n[Preview truncated to display limits]"; }
    auto display = state["text"].toString();
    if (display.isEmpty()) { display = text(state["result"]).left(TextLimit); }
    state["text"] = display.left(TextLimit) + "\n[Preview truncated to display limits]";
  }
  if (state == run.nodes.value(id)) { return; }
  run.nodes[id] = state;
  if (selected_ == jobId) { emit nodeChanged(id); }
}
}
