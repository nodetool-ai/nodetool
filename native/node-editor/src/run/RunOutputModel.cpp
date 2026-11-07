#include "RunOutputModel.h"
#include <QJsonArray>
#include <QJsonDocument>
#include <QCryptographicHash>
#include <QSet>
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
QVariantMap renderTree(const QJsonValue &value, int &budget, int depth = 0) {
  if (--budget < 0 || depth >= 8) { return {{"renderer", "text"}, {"text", "[Preview truncated]"}}; }
  const auto object = value.toObject();
  if (value.isArray() || (value.isObject() && object["type"].toString().isEmpty())) {
    QVariantList fields, children;
    if (value.isArray()) {
      for (const auto &child : value.toArray()) {
        if (budget <= 0) { break; }
        children.append(renderTree(child, budget, depth + 1));
      }
      return {{"renderer", "sequence"}, {"children", children}};
    }
    for (auto it = object.begin(); it != object.end() && budget > 0; ++it) {
      fields.append(QVariantMap{{"name", it.key().left(1024)}, {"output", renderTree(it.value(), budget, depth + 1)}});
    }
    return {{"renderer", "object"}, {"fields", fields}, {"text", budget <= 0 ? "[Preview truncated]" : ""}};
  }
  RunOutputModel model;
  model.beginRun("preview");
  model.ingest("preview", {{"type", "output_update"}, {"job_id", "preview"}, {"node_id", "preview"}, {"value", value}});
  return model.entries().last().toMap();
}
QString mediaKind(const QJsonObject &object) {
  auto kind = object["type"].toString();
  if (kind != "image" && kind != "video" && kind != "audio") { kind = object["mime_type"].toString(object["content_type"].toString()).section('/', 0, 0); }
  return kind == "image" || kind == "video" || kind == "audio" ? kind : QString{};
}
QString childPath(const QString &path, QString key) { return path + '/' + key.replace('~', "~0").replace('/', "~1"); }
void collectMedia(const QJsonValue &value, QVariantList &media, int &visited,
                  qsizetype &mediaBytes, bool &truncated, int depth = 0, const QString &path = "$") {
  if (depth > 8 || visited >= 4096 || media.size() >= 256) { truncated = true; return; }
  ++visited;
  if (value.isArray()) {
    const auto values = value.toArray();
    for (qsizetype i = 0; i < values.size(); ++i) { if (visited >= 4096 || media.size() >= 256) { truncated = true; break; } collectMedia(values[i], media, visited, mediaBytes, truncated, depth + 1, childPath(path, QString::number(i))); }
  } else if (value.isObject()) {
    const auto object = value.toObject();
    const auto kind = mediaKind(object);
    if (!kind.isEmpty()) {
      QJsonObject locator;
      for (const auto &key : {"type", "mime_type", "content_type", "uri", "asset_id", "data"}) { if (object.contains(key)) { locator[key] = object[key]; } }
      const bool validUri = locator.value("uri").isString() && !locator.value("uri").toString().isEmpty();
      const bool validId = locator.value("asset_id").isString() && !locator.value("asset_id").toString().isEmpty();
      bool validData = locator.value("data").isString() && !locator.value("data").toString().isEmpty();
      if (locator.value("data").isArray() && !locator.value("data").toArray().isEmpty()) {
        validData = true;
        for (const auto &byte : locator.value("data").toArray()) {
          if (!byte.isDouble() || byte.toDouble() < 0 || byte.toDouble() > 255 || std::floor(byte.toDouble()) != byte.toDouble()) { validData = false; break; }
        }
      }
      const auto encoded = QJsonDocument(locator).toJson(QJsonDocument::Compact);
      if (validUri || validId || validData) {
        if (mediaBytes + encoded.size() > 2 * 1024 * 1024) { truncated = true; return; }
        mediaBytes += encoded.size();
        media.append(QVariantMap{{"kind", kind}, {"locator", locator.toVariantMap()}, {"path", path},
          {"filename", object["filename"].toString(object["name"].toString())}});
        return;
      }
    }
    for (auto child = object.begin(); child != object.end(); ++child) {
      if (visited >= 4096 || media.size() >= 256) { truncated = true; break; }
      if (child.key() != "data") { collectMedia(child.value(), media, visited, mediaBytes, truncated, depth + 1, childPath(path, child.key())); }
    }
  }
}
void collectionParts(const QJsonValue &value, const QString &path,
    const QHash<QString, QVariantMap> &media, const QSet<QString> &parents,
    QVariantList &items, bool &truncated, int depth = 0) {
  if (depth > 8 || items.size() >= 256) { truncated = true; return; }
  if (media.contains(path)) { items.append(media.value(path)); return; }
  if (value.isArray()) {
    const auto array = value.toArray();
    for (qsizetype i = 0; i < array.size(); ++i) { if (items.size() >= 256) { truncated = true; break; } collectionParts(array[i], childPath(path, QString::number(i)), media, parents, items, truncated, depth + 1); }
    return;
  }
  if (value.isObject() && parents.contains(path)) {
    const auto object = value.toObject();
    for (auto child = object.begin(); child != object.end(); ++child) {
      if (items.size() >= 256) { truncated = true; break; }
      const auto next = childPath(path, child.key());
      if (parents.contains(next) || media.contains(next)) { collectionParts(child.value(), next, media, parents, items, truncated, depth + 1); }
      else {
        auto text = child.key() + ": " + display(child.value());
        if (text.size() > 4096) { text = text.left(4096) + " [Preview truncated]"; truncated = true; }
        items.append(QVariantMap{{"kind", "text"}, {"text", text}, {"itemKey", next}});
      }
    }
    return;
  }
  auto text = value.isObject() && !mediaKind(value.toObject()).isEmpty() ? QString("[Media preview omitted]") : display(value);
  if (text.size() > 4096) { text = text.left(4096) + " [Preview truncated]"; truncated = true; }
  items.append(QVariantMap{{"kind", "text"}, {"text", text}, {"itemKey", path}});
}
QVariantList collectionItems(const QJsonValue &value, QVariantList &media, bool &truncated) {
  QHash<QString, QVariantMap> paths;
  QHash<QByteArray, int> occurrences;
  QSet<QString> parents;
  for (auto &entry : media) {
    auto item = entry.toMap();
    const auto hash = QCryptographicHash::hash(QJsonDocument::fromVariant(item["locator"]).toJson(QJsonDocument::Compact), QCryptographicHash::Sha256).toHex();
    item["itemKey"] = "media:" + QString::fromLatin1(hash) + ':' + QString::number(occurrences[hash]++);
    entry = item;
    auto path = item["path"].toString();
    paths.insert(path, item);
    while (path.contains('/')) { path = path.left(path.lastIndexOf('/')); parents.insert(path); }
  }
  QVariantList items;
  collectionParts(value, "$", paths, parents, items, truncated);
  return items;
}
QString collectionCaption(const QVariantList &items) {
  QStringList captions;
  for (const auto &part : items) { const auto item = part.toMap(); captions.append(item["kind"] == "text" ? item["text"].toString() : '[' + item["kind"].toString() + ']'); }
  return captions.join('\n');
}
void appendCollection(QVariantMap &entry, const QVariantMap &existing) {
  const auto incoming = entry.value("items").toList();
  auto items = existing.value("items").toList();
  items.append(incoming);
  QVariantList retained, media;
  QHash<QByteArray, int> occurrences;
  qsizetype mediaBytes = 0;
  for (const auto &value : items) {
    auto item = value.toMap();
    if (retained.size() >= 256) { entry["truncated"] = true; break; }
    const bool isMedia = item.value("kind") != "text";
    const auto encoded = isMedia ? QJsonDocument::fromVariant(item["locator"]).toJson(QJsonDocument::Compact) : item["text"].toString().toUtf8();
    if (isMedia && mediaBytes + encoded.size() > 2 * 1024 * 1024) { entry["truncated"] = true; break; }
    const auto hash = QCryptographicHash::hash(encoded, QCryptographicHash::Sha256).toHex();
    item["itemKey"] = (isMedia ? "media:" : "text:") + QString::fromLatin1(hash) + ':' + QString::number(occurrences[hash]++);
    retained.append(item);
    if (isMedia) { mediaBytes += encoded.size(); media.append(item); }
  }
  entry["items"] = retained; entry["media"] = media;
  entry["text"] = collectionCaption(retained);
  if (entry["truncated"].toBool() || existing.value("truncated").toBool()) {
    entry["truncated"] = true;
    entry["previewNotice"] = "Additional output is omitted from this bounded display preview";
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
RunOutputModel::RunOutputModel(QObject *parent) : QObject(parent), m_collections(this) {}
void RunOutputModel::publish() {
  QVariantList groups;
  for (const auto &value : entries()) {
    const auto entry = value.toMap();
    if (entry.value("items").toList().isEmpty()) { continue; }
    const auto key = QJsonDocument::fromVariant(QVariantList{entry["kind"], entry["nodeId"], entry["outputName"]}).toJson(QJsonDocument::Compact);
    groups.append(QVariantMap{{"key", m_selected + ':' + QString::fromUtf8(key)}, {"items", entry["items"]},
      {"title", (entry["nodeName"].toString().isEmpty() ? entry["nodeId"].toString() : entry["nodeName"].toString()) + " · " + entry["outputName"].toString()}, {"notice", entry["previewNotice"].toString()}});
  }
  m_collections.setGroups(m_selected, groups);
  emit changed();
}
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
  m_pcm.reset(jobId);
  publish();
}
void RunOutputModel::selectRun(QString jobId) {
  if (m_selected == jobId) {
    return;
  }
  for (const auto &run : m_runs) {
    if (run.id == jobId) {
      m_selected = jobId;
      m_pcm.reset(jobId);
      publish();
      return;
    }
  }
}
void RunOutputModel::reset() {
  m_pcm.reset();
  m_runs.clear();
  m_selected.clear();
  publish();
}
void RunOutputModel::clear() {
  m_pcm.reset(m_selected);
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
  publish();
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
    if (jobId == m_selected && (status == "failed" || status == "cancelled")) { m_pcm.stop(); }
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
  qsizetype mediaBytes = 0;
  bool previewTruncated = false;
  const QJsonValue preview = type == "output_update" ? event["value"] : event["result"];
  if (type == "output_update" || type == "node_update" || type == "job_update") { collectMedia(preview, media, visited, mediaBytes, previewTruncated); }
  if (!media.isEmpty()) {
    entry["items"] = collectionItems(preview, media, previewTruncated);
    entry["text"] = collectionCaption(entry["items"].toList());
  }
  if (previewTruncated) {
    entry["previewNotice"] = "Additional output is omitted from this bounded display preview";
    entry["truncated"] = true;
    run.truncated = true;
  }
  if (type == "output_update") {
    const auto value = event["value"];
    const auto object = value.toObject();
    const auto tag = object["type"].toString();
    QString renderer = "generic";
    if (value.isString() || tag == "text") { renderer = "text"; }
    else if (tag == "chunk" && object["content_type"] == "tool_call") {
      renderer = "tool_call";
      const auto meta = object["content_metadata"].toObject();
      entry["toolName"] = meta["tool_name"].toString(object["content"].toString().section('(', 0, 0));
      entry["toolId"] = meta["tool_call_id"].toString();
      entry["toolArgs"] = display(meta.contains("args") ? meta["args"] : QJsonValue(QJsonObject{})).left(MaxText);
      const auto args = meta["args"];
      QStringList keys;
      if (args.isObject()) { keys = args.toObject().keys(); }
      else if (args.isArray()) {
        for (qsizetype i = 0; i < args.toArray().size(); ++i) { keys.append(QString::number(i)); }
      }
      entry["toolSummary"] = args.isObject() || args.isArray()
        ? "(" + keys.mid(0, 3).join(", ") + (keys.size() > 3 ? ", +" + QString::number(keys.size() - 3) : QString{}) + ")" : QString{};
      if (args.isObject() || args.isArray()) {
        entry["toolArgs"] = QString::fromUtf8(args.isObject() ? QJsonDocument(args.toObject()).toJson(QJsonDocument::Indented) : QJsonDocument(args.toArray()).toJson(QJsonDocument::Indented)).left(MaxText);
      }
    }
    else if (tag == "dataframe") { renderer = "dataframe"; }
    else if (tag == "image_comparison") { renderer = "image_comparison"; entry["comparison"] = object.toVariantMap(); }
    else if (tag == "plotly_config") { renderer = "plotly"; }
    else if (value.isObject() && tag.isEmpty()) { renderer = "object"; }
    if (value.isArray() && !value.toArray().isEmpty()) {
      const auto chunks = value.toArray();
      const bool textChunks = std::all_of(chunks.begin(), chunks.end(), [](const QJsonValue &part) {
        const auto chunk = part.toObject();
        const auto contentType = chunk["content_type"];
        return chunk["type"] == "chunk" && chunk["content"].isString()
          && (contentType.isUndefined() || contentType.isNull() || contentType == "" || contentType == "text");
      });
      if (textChunks) {
        renderer = "text";
        QString text;
        for (const auto &part : chunks) {
          const auto content = part.toObject()["content"].toString();
          text += content.left(std::max<qsizetype>(0, MaxText + 1 - text.size()));
          if (text.size() > MaxText) { break; }
        }
        entry["text"] = text;
      }
    }
    if (tag == "chunk" && object["content_type"] != "tool_call" && object["content_type"] != "audio") {
      renderer = "text"; entry["text"] = object["content"].toString().left(MaxText);
    }
    if (value.isArray() && renderer != "text") {
      int budget = 256;
      entry["children"] = renderTree(value, budget)["children"];
      renderer = "sequence";
    }
    QJsonArray audioChunks;
    if (tag == "chunk" && object["content_type"] == "audio") { audioChunks.append(object); }
    if (value.isArray()) {
      for (const auto &part : value.toArray()) {
        if (part.toObject()["type"] == "chunk" && part.toObject()["content_type"] == "audio") { audioChunks.append(part); }
      }
    }
    if (!audioChunks.isEmpty()) {
      if (!value.isArray() || audioChunks.size() == value.toArray().size()) { renderer = "pcm"; }
      if (jobId == m_selected && !run.terminal) {
        for (const auto &part : audioChunks) { m_pcm.append(jobId, part.toObject()); }
      }
      entry["text"] = "Streaming PCM audio";
    }
    entry["renderer"] = renderer;
    if (renderer == "text" && tag == "text") {
      if (!object.contains("text") && !object.contains("data") && !object.contains("value")) {
        entry["textUri"] = object["uri"].toString(); entry["text"] = "";
      }
      for (const auto key : {"text", "data", "value"}) {
        if (object[key].isString()) { entry["text"] = object[key].toString(); break; }
      }
    }
    if (renderer == "dataframe") {
      QVariantList columns, rows;
      for (const auto &column : object["columns"].toArray()) {
        columns.append(column.toObject()["name"].toString());
        if (columns.size() == 64) { break; }
      }
      const auto records = object["rows"].toArray();
      if (columns.isEmpty()) {
        for (const auto &record : records) {
          const auto fields = record.toObject();
          for (auto field = fields.begin(); field != fields.end(); ++field) {
            if (!columns.contains(field.key()) && columns.size() < 64) { columns.append(field.key()); }
          }
        }
      }
      const auto matrix = object["data"].toArray();
      const auto count = matrix.isEmpty() ? records.size() : matrix.size();
      for (qsizetype row = 0; row < std::min<qsizetype>(count, 1000); ++row) {
        QVariantList cells;
        const auto matrixRow = matrix.isEmpty() ? QJsonArray{} : matrix[row].toArray();
        const auto record = matrix.isEmpty() ? records[row].toObject() : QJsonObject{};
        for (qsizetype col = 0; col < columns.size(); ++col) {
          const auto cell = matrix.isEmpty() ? record[columns[col].toString()] : (col < matrixRow.size() ? matrixRow.at(col) : QJsonValue(QJsonValue::Null));
          cells.append(display(cell).left(4096));
        }
        rows.append(QVariantMap{{"cells", cells}});
      }
      entry["tableColumns"] = columns;
      entry["tableRows"] = rows;
      entry["tableNotice"] = QString("Read-only preview: %1 of %2 rows, up to 64 columns and 4096 characters per cell").arg(rows.size()).arg(count);
    }
    if (renderer == "object") {
      int budget = 256;
      const auto tree = renderTree(value, budget);
      entry["fields"] = tree["fields"];
      entry["objectNotice"] = tree["text"];

    }
  }
  entry["media"] = media;
  qsizetype index = -1;
  if (replace) {
    for (qsizetype i = 0; i < run.entries.size(); ++i) {
      const auto existing = run.entries[i].toMap();
      if (existing["kind"] == entry["kind"] && existing["nodeId"] == entry["nodeId"] && existing["outputName"] == entry["outputName"]) {
        index = i;
        if (type == "output_update" && event["disposition"] != "replace" && !existing.value("items").toList().isEmpty() && entry.value("items").toList().isEmpty()) {
          QVariantList parts;
          bool limited = false;
          collectionParts(preview, "$", {}, {}, parts, limited);
          entry["items"] = parts;
          if (limited) { entry["truncated"] = true; }
        }
        if (type == "output_update" && event["disposition"] != "replace" && !existing.value("items").toList().isEmpty() && !entry.value("items").toList().isEmpty()) {
          appendCollection(entry, existing);
          if (entry.value("truncated").toBool()) { run.truncated = true; }
        }
        if (type == "output_update" && event["disposition"] != "replace" && event["value"].isString() && existing.value("items").toList().isEmpty()) {
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
  publish();
}
}
