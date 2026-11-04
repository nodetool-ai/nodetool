#include "RunOutputModel.h"
#include <QJsonArray>
#include <QJsonDocument>
#include <algorithm>
#include <cmath>

namespace nodetool::node_editor {
namespace {
constexpr qsizetype MaxRuns = 20;
constexpr qsizetype MaxEntries = 500;
constexpr qsizetype MaxText = 65536;
constexpr qsizetype MaxRunText = 4 * 1024 * 1024;
QString display(const QJsonValue &value) {
  if (value.isString()) {
    return value.toString();
  }
  const auto wrapped = QJsonDocument(QJsonArray{value}).toJson(QJsonDocument::Compact);
  return QString::fromUtf8(wrapped.mid(1, wrapped.size() - 2));
}
void collectMedia(const QJsonValue &value, QVariantList &media, int &visited, int depth = 0) {
  if (depth > 8 || visited >= 256 || media.size() >= 16) {
    return;
  }
  ++visited;
  if (value.isArray()) {
    for (const auto &child : value.toArray()) {
      if (visited >= 256 || media.size() >= 16) { break; }
      collectMedia(child, media, visited, depth + 1);
    }
  } else if (value.isObject()) {
    const auto object = value.toObject();
    auto kind = object["type"].toString();
    const auto mime = object["mime_type"].toString(object["content_type"].toString());
    if (kind != "image" && kind != "video" && kind != "audio") {
      kind = mime.section('/', 0, 0);
    }
    if (kind == "image" || kind == "video" || kind == "audio") {
      QJsonObject locator;
      for (const auto &key : {"type", "mime_type", "content_type", "uri", "asset_id", "data"}) {
        if (object.contains(key)) { locator[key] = object[key]; }
      }
      const bool validUri = locator.value("uri").isString() && !locator.value("uri").toString().isEmpty();
      const bool validId = locator.value("asset_id").isString() && !locator.value("asset_id").toString().isEmpty();
      bool validData = locator.value("data").isString() && !locator.value("data").toString().isEmpty();
      if (locator.value("data").isArray() && !locator.value("data").toArray().isEmpty()) {
        validData = true;
        for (const auto &byte : locator.value("data").toArray()) {
          if (!byte.isDouble() || byte.toDouble() < 0 || byte.toDouble() > 255 || std::floor(byte.toDouble()) != byte.toDouble()) {
            validData = false;
            break;
          }
        }
      }
      const auto bytes = QJsonDocument(locator).toJson(QJsonDocument::Compact).size();
      const auto existingBytes = QJsonDocument::fromVariant(media).toJson(QJsonDocument::Compact).size();
      if ((validUri || validId || validData) && bytes + existingBytes <= 2 * 1024 * 1024) {
        const QVariantMap item{{"kind", kind}, {"locator", locator.toVariantMap()}};
        if (!media.contains(item)) { media.append(item); }
      }
    }
    for (auto child = object.begin(); child != object.end(); ++child) {
      if (visited >= 256 || media.size() >= 16) { break; }
      if (child.key() != "data") { collectMedia(child.value(), media, visited, depth + 1); }
    }
  }
}
qsizetype entrySize(const QVariant &value) {
  const auto entry = value.toMap();
  return entry["text"].toString().size() + QJsonDocument::fromVariant(entry["media"]).toJson(QJsonDocument::Compact).size();
}
bool terminal(const QString &status) {
  return status == "completed" || status == "finished" || status == "failed" || status == "cancelled";
}
}
RunOutputModel::RunOutputModel(QObject *parent) : QObject(parent) {}
QVariantList RunOutputModel::runs() const {
  QVariantList result;
  for (const auto &run : m_runs) {
    result.append(QVariantMap{{"jobId", run.id}, {"status", run.status},
                             {"terminal", run.terminal}, {"truncated", run.truncated}});
  }
  return result;
}
QString RunOutputModel::selectedRunId() const { return m_selected; }
QVariantList RunOutputModel::entries() const {
  for (const auto &run : m_runs) {
    if (run.id == m_selected) {
      return run.entries;
    }
  }
  return {};
}
void RunOutputModel::beginRun(QString jobId) {
  if (jobId.isEmpty() || jobId.size() > 1024) {
    return;
  }
  for (const auto &run : m_runs) {
    if (run.id == jobId) {
      selectRun(jobId);
      return;
    }
  }
  if (m_runs.size() == MaxRuns) {
    m_runs.removeFirst();
  }
  Run run;
  run.id = jobId;
  m_runs.append(run);
  m_selected = jobId;
  emit changed();
}
void RunOutputModel::selectRun(QString jobId) {
  if (m_selected == jobId) {
    return;
  }
  for (const auto &run : m_runs) {
    if (run.id == jobId) {
      m_selected = jobId;
      emit changed();
      return;
    }
  }
}
void RunOutputModel::clear() {
  m_runs.removeIf([](const Run &run) { return run.terminal; });
  bool selectedRemains = false;
  for (auto &run : m_runs) {
    run.entries.clear();
    run.truncated = false;
    selectedRemains = selectedRemains || run.id == m_selected;
  }
  if (!selectedRemains) {
    m_selected = m_runs.isEmpty() ? QString() : m_runs.last().id;
  }
  emit changed();
}
void RunOutputModel::ingest(QString jobId, QJsonObject event) {
  auto found = std::find_if(m_runs.begin(), m_runs.end(), [&jobId](const Run &run) { return run.id == jobId; });
  if (found == m_runs.end() || event["job_id"].toString() != jobId) {
    return;
  }
  auto &run = *found;
  for (const auto &key : {"node_id", "node_name", "output_name", "status", "severity"}) {
    if (event[key].toString().size() > 1024) {
      return;
    }
  }
  const auto seq = event["job_seq"].toDouble();
  if (std::isfinite(seq) && seq > 0) {
    if (seq <= run.sequence) {
      return;
    }
    run.sequence = seq;
  }
  const auto type = event["type"].toString();
  const auto nodeId = event["node_id"].toString();
  QVariantMap entry{{"nodeId", nodeId}, {"nodeName", event["node_name"].toString()},
                    {"status", event["status"].toString()}, {"outputName", QString()},
                    {"text", QString()}, {"severity", QString()}, {"done", false}, {"truncated", false}};
  bool replace = false;
  if (type == "job_update" || type == "job_resumed") {
    const auto status = event["status"].toString();
    if (status.isEmpty() || (run.terminal && !terminal(status))) {
      return;
    }
    if (!run.terminal) {
      run.status = status;
      run.terminal = terminal(status);
    }
    entry["kind"] = "job";
    entry["status"] = run.status;
    entry["text"] = event["error"].toString(event["message"].toString());
    if (event["result"].isObject()) {
      entry["text"] = entry["text"].toString() + display(event["result"]);
    }
    replace = true;
  } else if (type == "node_update" && !nodeId.isEmpty()) {
    entry["kind"] = "status";
    entry["text"] = event["error"].toString();
    if (event["result"].isObject()) {
      entry["text"] = entry["text"].toString() + display(event["result"]);
    }
    replace = true;
  } else if (type == "output_update" && !nodeId.isEmpty() && event.contains("value")) {
    entry["kind"] = "output";
    entry["outputName"] = event["output_name"].toString();
    entry["text"] = display(event["value"]);
    entry["done"] = event["done"].toBool();
    replace = true;
  } else if (type == "log_update" && event["content"].isString()) {
    entry["kind"] = "log";
    entry["text"] = event["content"].toString();
    entry["severity"] = event["severity"].toString();
  } else {
    return;
  }
  QVariantList media;
  int visited = 0;
  if (type == "output_update") { collectMedia(event["value"], media, visited); }
  if (type == "node_update" || type == "job_update") { collectMedia(event["result"], media, visited); }
  entry["media"] = media;
  qsizetype index = -1;
  if (replace) {
    for (qsizetype i = 0; i < run.entries.size(); ++i) {
      const auto existing = run.entries[i].toMap();
      if (existing["kind"] == entry["kind"] && existing["nodeId"] == entry["nodeId"] && existing["outputName"] == entry["outputName"]) {
        index = i;
        if (type == "output_update" && event["disposition"] != "replace" && event["value"].isString()) {
          entry["text"] = existing["text"].toString() + entry["text"].toString();
          entry["truncated"] = existing["truncated"];
          if (media.isEmpty()) { entry["media"] = existing["media"]; }
        }
        break;
      }
    }
  }
  auto text = entry["text"].toString();
  if (text.size() > MaxText) {
    entry["text"] = text.left(MaxText) + "\n[Output truncated]";
    entry["truncated"] = true;
    run.truncated = true;
  }
  if (index >= 0) {
    run.entries[index] = entry;
  } else {
    if (run.entries.size() >= MaxEntries) {
      run.entries.removeFirst();
      run.truncated = true;
    }
    run.entries.append(entry);
  }
  qsizetype textSize = 0;
  for (const auto &value : run.entries) {
    textSize += entrySize(value);
  }
  while (textSize > MaxRunText && run.entries.size() > 1) {
    textSize -= entrySize(run.entries.first());
    run.entries.removeFirst();
    run.truncated = true;
  }
  if (run.truncated) {
    if (run.entries.first().toMap()["kind"] != "notice") {
      if (run.entries.size() >= MaxEntries) {
        run.entries.removeFirst();
      }
      run.entries.prepend(QVariantMap{{"kind", "notice"}, {"text", "Run output truncated to display limits"}, {"truncated", true}});
    }
  }
  emit changed();
}
}
