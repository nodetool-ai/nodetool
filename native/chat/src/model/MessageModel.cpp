#include "MessageModel.h"
#include <QDateTime>
#include <QJsonDocument>
#include <QRegularExpression>
#include <QSet>
#include <QUrl>
#include <QUuid>
#include <algorithm>
namespace nt::chat {
namespace {
QString textOf(const QJsonValue &value) {
  if (value.isString()) {
    return value.toString();
  }
  QString text;
  for (const auto &part : value.toArray()) {
    const auto p = part.toObject();
    if (p["type"] == "text") {
      text += p["text"].toString();
    }
  }
  return text;
}
QString displayJson(const QJsonValue &value) {
  if (value.isString()) {
    return value.toString();
  }
  if (value.isUndefined() || value.isNull()) {
    return {};
  }
  if (value.isObject()) {
    return QString::fromUtf8(
        QJsonDocument(value.toObject()).toJson(QJsonDocument::Indented));
  }
  if (value.isArray()) {
    return QString::fromUtf8(
        QJsonDocument(value.toArray()).toJson(QJsonDocument::Indented));
  }
  auto encoded =
      QJsonDocument(QJsonArray{value}).toJson(QJsonDocument::Compact);
  return QString::fromUtf8(encoded.mid(1, encoded.size() - 2));
}
QJsonObject presentPart(QJsonObject part) {
  const auto type = part["type"].toString();
  if (type != "tool_call" && type != "tool_call_update" &&
      type != "tool_result_update") {
    if (!part.contains("text") && !part.contains("actionId")) {
      part["text"] = "Content details\n" + displayJson(part);
    }
    return part;
  }
  auto args = part.value("args");
  if (args.isString()) {
    const auto parsed = QJsonDocument::fromJson(args.toString().toUtf8());
    if (parsed.isObject()) {
      args = parsed.object();
    }
  }
  const auto name = part["name"].toString();
  auto words = name;
  words.replace(QRegularExpression("([a-z0-9])([A-Z])"), "\\1_\\2");
  const auto segments = words.toLower().split(QRegularExpression("[^a-z0-9]+"),
                                              Qt::SkipEmptyParts);
  auto label = words;
  label.replace('_', ' ');
  if (!label.isEmpty()) {
    label[0] = label[0].toUpper();
  }
  QString detail;
  for (const auto key : {"url", "uri", "path", "file", "filename", "target",
                         "query", "q", "objective"}) {
    detail = args.toObject()[key].toString().trimmed();
    if (!detail.isEmpty()) {
      if (QString(key) == "url" || QString(key) == "uri") {
        const QUrl url(detail);
        if (!url.host().isEmpty()) {
          auto host = url.host();
          if (host.startsWith("www.")) {
            host.remove(0, 4);
          }
          detail = host + (url.path() == "/" ? QString() : url.path()) +
                   (url.hasQuery() ? "?" + url.query() : QString());
        }
      }
      break;
    }
  }
  const auto has = [&segments](const QStringList &keys) {
    return std::any_of(
        keys.cbegin(), keys.cend(),
        [&segments](const QString &key) { return segments.contains(key); });
  };
  if (has({"plan"})) {
    label = detail.isEmpty() ? "Wrote a plan" : "Planned";
  } else if (has({"search", "grep", "glob", "lookup", "query"})) {
    label = detail.isEmpty() ? "Ran 1 search" : "Searched";
  } else if (has({"browser", "crawl", "scrape", "fetch", "http", "url",
                  "download", "visit"})) {
    label = detail.isEmpty() ? "Opened 1 page" : "Opened page";
  } else if (has({"write", "edit", "save", "update", "create", "delete",
                  "upload"}) &&
             !detail.isEmpty()) {
    label = "Edited";
  } else if (has({"read", "open", "cat", "list"}) && !detail.isEmpty()) {
    label = "Read";
  }
  part["label"] = label + (detail.isEmpty() ? QString() : " " + detail);
  part["tool"] = true;
  const auto result = part.value("result");
  const bool failed = part["is_error"].toBool() ||
                      result.toObject()["error"].isString() ||
                      result.toObject()["is_error"].toBool();
  part["displayStatus"] = failed                    ? "Failed"
                          : part.contains("result") ? "Done"
                                                    : "Running";
  part["argumentsText"] = displayJson(args);
  part["resultText"] = displayJson(result);
  if (name == "execute_code") {
    part["code"] = args.toObject()["code"];
    part["language"] = "javascript";
    if (!args.toObject()["title"].toString().isEmpty()) {
      part["label"] = args.toObject()["title"];
    }
    auto other = args.toObject();
    other.remove("code");
    other.remove("title");
    part["argumentsText"] = other.isEmpty() ? QString() : displayJson(other);
  }
  return part;
}
QJsonArray projectedParts(const QJsonObject &m) {
  auto parts = m["parts"].toArray();
  bool hasToolCalls = false;
  for (const auto &value : m["tool_calls"].toArray()) {
    const auto call = value.toObject();
    const auto function = call["function"].toObject();
    const auto name = function["name"].toString(call["name"].toString());
    if (name.isEmpty()) {
      continue;
    }
    hasToolCalls = true;
    const auto args =
        function.contains("arguments") ? function["arguments"] : call["args"];
    const auto argsText =
        args.isString()
            ? args.toString()
            : QString::fromUtf8(QJsonDocument(QJsonArray{args})
                                    .toJson(QJsonDocument::Compact));
    auto projected = call;
    projected.insert("type", "tool_call");
    projected.insert("args", args);
    projected.insert("name", name);
    projected.insert("tool_call_id",
                     call["id"].toString(call["tool_call_id"].toString()));
    projected.insert("payload", call);
    projected.insert("text", name + "\n" + argsText);
    parts.append(projected);
  }
  if (m["content"].isArray()) {
    for (auto p : m["content"].toArray()) {
      if (p.toObject()["type"] != "text") {
        parts.append(p);
      }
    }
  } else if (!m["content"].isString() &&
             !(hasToolCalls &&
               (m["content"].isNull() || m["content"].isUndefined()))) {
    const auto content = m["content"];
    const auto encoded =
        content.isObject()
            ? QString::fromUtf8(QJsonDocument(content.toObject())
                                    .toJson(QJsonDocument::Compact))
            : QString("null");
    parts.append(
        QJsonObject{{"type", "unsupported"},
                    {"text", "Unsupported message content: " + encoded}});
  }
  QJsonArray displayed;
  for (const auto &part : parts) {
    displayed.append(presentPart(part.isObject()
                                     ? part.toObject()
                                     : QJsonObject{{"type", "unsupported"},
                                                   {"text", displayJson(part)},
                                                   {"payload", part}}));
  }
  QJsonArray grouped;
  const QSet<QString> separate{"execute_code", "run_subtask",    "run_search",
                               "ask_user",     "request_secret", "create_plan"};
  for (qsizetype first = 0; first < displayed.size();) {
    auto group = displayed[first].toObject();
    const auto name = group.value("name").toString();
    qsizetype end = first + 1;
    if (group.value("tool").toBool() && !name.isEmpty() &&
        !separate.contains(name)) {
      while (end < displayed.size() &&
             displayed[end].toObject()["tool"].toBool() &&
             displayed[end].toObject()["name"] == name) {
        ++end;
      }
    }
    if (end - first > 1) {
      QString details;
      QString status = "Done";
      for (auto i = first; i < end; ++i) {
        const auto item = displayed[i].toObject();
        details += item["label"].toString() + " · " +
                   item["displayStatus"].toString() + "\nArguments\n" +
                   item["argumentsText"].toString() + "\nResult\n" +
                   item["resultText"].toString() + "\n";
        if (item["displayStatus"] == "Failed") {
          status = "Failed";
        } else if (status != "Failed" && item["displayStatus"] == "Running") {
          status = "Running";
        }
      }
      const auto label = group.value("label").toString();
      const auto count = end - first;
      group["label"] =
          label.startsWith("Searched") || label == "Ran 1 search"
              ? QString("Ran %1 searches").arg(count)
          : label.startsWith("Opened") ? QString("Opened %1 pages").arg(count)
          : label.startsWith("Read")   ? QString("Read %1 items").arg(count)
          : label.startsWith("Edited") ? QString("Made %1 edits").arg(count)
          : label.startsWith("Planned") || label == "Wrote a plan"
              ? QString("Wrote %1 plans").arg(count)
              : QString("%1 %2 times").arg(label).arg(count);
      group["displayStatus"] = status;
      group["argumentsText"] = QString();
      group["resultText"] = details;
      group["grouped"] = true;
    }
    grouped.append(group);
    first = end;
  }
  return grouped;
}
} // namespace
int PartModel::rowCount(const QModelIndex &parent) const {
  return parent.isValid() ? 0 : m_parts.size();
}
QVariant PartModel::data(const QModelIndex &index, int role) const {
  if (!index.isValid() || index.row() < 0 || index.row() >= m_parts.size() ||
      role != ModelDataRole) {
    return {};
  }
  const auto part = m_parts[index.row()];
  if (part.isObject()) {
    return part.toObject().toVariantMap();
  }
  return QVariantMap{
      {"type", "unsupported"},
      {"text",
       QString::fromUtf8(
           QJsonDocument(QJsonArray{part}).toJson(QJsonDocument::Compact))}};
}
QHash<int, QByteArray> PartModel::roleNames() const {
  return {{ModelDataRole, "modelData"}};
}
void PartModel::setParts(const QJsonArray &parts) {
  const auto shared = std::min(m_parts.size(), parts.size());
  for (qsizetype i = 0; i < shared; ++i) {
    if (m_parts[i] != parts[i]) {
      m_parts[i] = parts[i];
      emit dataChanged(index(i), index(i), {ModelDataRole});
    }
  }
  if (parts.size() < m_parts.size()) {
    beginRemoveRows({}, parts.size(), m_parts.size() - 1);
    while (m_parts.size() > parts.size()) {
      m_parts.removeLast();
    }
    endRemoveRows();
  } else if (parts.size() > m_parts.size()) {
    const auto first = m_parts.size();
    beginInsertRows({}, first, parts.size() - 1);
    for (auto i = first; i < parts.size(); ++i) {
      m_parts.append(parts[i]);
    }
    endInsertRows();
  }
}
void MessageModel::refreshParts(int row) {
  const auto key = m_projectionKeys[row];
  if (auto *model = m_partModels.value(key, nullptr)) {
    model->setParts(projectedParts(m_rows[row]));
  }
}
void MessageModel::releaseParts(const QString &key) {
  if (auto *model = m_partModels.take(key)) {
    model->deleteLater();
  }
}
int MessageModel::rowCount(const QModelIndex &p) const {
  return p.isValid() ? 0 : static_cast<int>(m_rows.size());
}
QHash<int, QByteArray> MessageModel::roleNames() const {
  return {{MessageIdRole, "messageId"}, {RoleRole, "role"},
          {TextRole, "text"},           {TimestampRole, "timestamp"},
          {PartsRole, "parts"},         {StatusRole, "status"}};
}
QVariant MessageModel::data(const QModelIndex &i, int role) const {
  if (!i.isValid() || i.row() < 0 || i.row() >= m_rows.size()) {
    return {};
  }
  const auto &m = m_rows[i.row()];
  switch (role) {
  case MessageIdRole:
    return m["id"].toString();
  case RoleRole:
    return m["role"].toString();
  case TextRole:
    return textOf(m["content"]);
  case TimestampRole:
    return m["created_at"].toString();
  case PartsRole: {
    const auto key = m_projectionKeys[i.row()];
    auto *parts = m_partModels.value(key, nullptr);
    if (!parts) {
      parts = new PartModel(const_cast<MessageModel *>(this));
      m_partModels[key] = parts;
      parts->setParts(projectedParts(m));
    }
    return QVariant::fromValue(static_cast<QAbstractItemModel *>(parts));
  }
  case StatusRole:
    return m["status"].toString();
  default:
    return {};
  }
}
QString MessageModel::upsert(const QJsonObject &message) {
  const auto id = message["id"].toString();
  const auto key =
      id.isEmpty() ? "projection:" + QUuid::createUuid().toString(QUuid::Id128)
                   : id;
  if (!id.isEmpty() && m_indices.contains(id)) {
    const auto i = m_indices.value(id);
    m_rows[i] = message;
    refreshParts(i);
    emit dataChanged(index(i), index(i));
    return id;
  }
  if (!message["temporary"].toBool() && message["role"] == "assistant" &&
      !m_rows.isEmpty() && m_rows.last()["temporary"].toBool()) {
    const auto i = rowCount() - 1;
    const auto oldKey = m_projectionKeys.last();
    m_indices.remove(oldKey);
    auto row = message;
    if (!row.contains("parts")) {
      row["parts"] = m_rows.last()["parts"];
    }
    m_rows[i] = row;
    m_projectionKeys[i] = key;
    if (auto *model = m_partModels.take(oldKey)) {
      m_partModels[key] = model;
    }
    m_indices[key] = i;
    refreshParts(i);
    emit dataChanged(index(i), index(i));
    return key;
  }
  if (m_rows.size() >= 10000) {
    beginRemoveRows({}, 0, 0);
    const auto oldKey = m_projectionKeys.takeFirst();
    m_indices.remove(oldKey);
    releaseParts(oldKey);
    m_rows.removeFirst();
    for (auto it = m_indices.begin(); it != m_indices.end(); ++it) {
      --it.value();
    }
    endRemoveRows();
  }
  beginInsertRows({}, rowCount(), rowCount());
  m_rows.append(message);
  m_projectionKeys.append(key);
  m_indices[key] = rowCount() - 1;
  endInsertRows();
  return key;
}
void MessageModel::appendChunk(const QString &text, bool done) {
  if (m_rows.isEmpty() || m_rows.last()["role"] != "assistant" ||
      m_rows.last()["status"] != "streaming") {
    upsert({{"id", QUuid::createUuid().toString(QUuid::Id128)},
            {"role", "assistant"},
            {"content", ""},
            {"status", "streaming"},
            {"temporary", true},
            {"created_at",
             QDateTime::currentDateTimeUtc().toString(Qt::ISODate)}});
  }
  auto &row = m_rows.last();
  const auto old = textOf(row["content"]);
  if (old.size() + text.size() <= 4 * 1024 * 1024) {
    if (row["content"].isArray()) {
      auto content = row["content"].toArray();
      if (!text.isEmpty()) {
        if (!content.isEmpty() && content.last().toObject()["type"] == "text") {
          auto tail = content.last().toObject();
          tail["text"] = tail["text"].toString() + text;
          content[content.size() - 1] = tail;
        } else {
          content.append(QJsonObject{{"type", "text"}, {"text", text}});
        }
      }
      row["content"] = content;
    } else {
      row["content"] = old + text;
    }
  }
  row["status"] = done ? "complete" : "streaming";
  m_dirtyRow = rowCount() - 1;
  if (!m_frameTimer) {
    m_frameTimer = new QTimer(this);
    m_frameTimer->setSingleShot(true);
    m_frameTimer->setInterval(16);
    connect(m_frameTimer, &QTimer::timeout, this, [this] {
      if (m_dirtyRow >= 0 && m_dirtyRow < rowCount()) {
        emit dataChanged(index(m_dirtyRow), index(m_dirtyRow),
                         {TextRole, StatusRole});
      }
      m_dirtyRow = -1;
    });
  }
  if (done) {
    m_frameTimer->stop();
    emit dataChanged(index(m_dirtyRow), index(m_dirtyRow),
                     {TextRole, StatusRole});
    m_dirtyRow = -1;
  } else if (!m_frameTimer->isActive()) {
    m_frameTimer->start();
  }
}
bool MessageModel::addResolvedPart(const QString &id, const QJsonObject &part) {
  if (!m_indices.contains(id)) {
    return false;
  }
  const auto i = m_indices.value(id);
  auto parts = m_rows[i]["parts"].toArray();
  for (const auto &old : parts) {
    if (old.toObject()["image"] == part["image"]) {
      return false;
    }
  }
  parts.append(part);
  m_rows[i]["parts"] = parts;
  refreshParts(i);
  emit dataChanged(index(i), index(i), {PartsRole});
  return true;
}
void MessageModel::addPart(const QJsonObject &part) {
  if (m_rows.isEmpty() || m_rows.last()["role"] != "assistant") {
    upsert({{"id", QUuid::createUuid().toString(QUuid::Id128)},
            {"role", "assistant"},
            {"content", ""}});
  }
  int targetRow = rowCount() - 1;
  const auto incomingCall = part["tool_call_id"].toString();
  if (!incomingCall.isEmpty()) {
    for (int candidate = rowCount() - 1; candidate >= 0; --candidate) {
      bool found = false;
      for (const auto &existing : m_rows[candidate]["parts"].toArray()) {
        if (existing.toObject()["tool_call_id"] == incomingCall) {
          found = true;
          break;
        }
      }
      if (found) {
        targetRow = candidate;
        break;
      }
    }
  }
  auto &row = m_rows[targetRow];
  auto parts = row["parts"].toArray();
  const auto action = part["actionId"].toString();
  const auto call = part["tool_call_id"].toString();
  bool replaced = false;
  for (int i = 0; i < parts.size(); ++i) {
    auto p = parts[i].toObject();
    if ((!action.isEmpty() && p["actionId"] == action) ||
        (!call.isEmpty() && p["tool_call_id"] == call)) {
      for (auto it = part.begin(); it != part.end(); ++it) {
        p[it.key()] = it.value();
      }
      parts[i] = p;
      replaced = true;
      break;
    }
  }
  if (!replaced && parts.size() < 1000) {
    parts.append(part);
  }
  row["parts"] = parts;
  refreshParts(targetRow);
  emit dataChanged(index(targetRow), index(targetRow), {PartsRole});
}
void MessageModel::importHistory(const QJsonArray &rows, bool prepend) {
  if (!prepend) {
    clear();
    for (const auto &row : rows) {
      if (row.isObject()) {
        upsert(row.toObject());
      }
    }
    return;
  }
  QList<QJsonObject> fresh;
  QSet<QString> pageIds;
  for (const auto &value : rows) {
    const auto row = value.toObject();
    const auto id = row["id"].toString();
    bool exists = m_indices.contains(id) || pageIds.contains(id);
    if (!exists && fresh.size() + m_rows.size() < 10000) {
      fresh.append(row);
      if (!id.isEmpty()) {
        pageIds.insert(id);
      }
    }
  }
  if (fresh.isEmpty()) {
    return;
  }
  beginInsertRows({}, 0, static_cast<int>(fresh.size()) - 1);
  m_rows = fresh + m_rows;
  QList<QString> newKeys;
  for (const auto &row : fresh) {
    const auto id = row["id"].toString();
    newKeys.append(id.isEmpty() ? "projection:" +
                                      QUuid::createUuid().toString(QUuid::Id128)
                                : id);
  }
  m_projectionKeys = newKeys + m_projectionKeys;
  m_indices.clear();
  for (int i = 0; i < m_rows.size(); ++i) {
    m_indices[m_projectionKeys[i]] = i;
  }
  endInsertRows();
}
QJsonArray MessageModel::snapshot() const {
  QJsonArray out;
  for (const auto &row : m_rows) {
    out.append(row);
  }
  return out;
}
void MessageModel::clear() {
  if (m_frameTimer) {
    m_frameTimer->stop();
  }
  m_dirtyRow = -1;
  if (m_rows.isEmpty()) {
    return;
  }
  beginResetModel();
  for (auto *model : m_partModels) {
    model->deleteLater();
  }
  m_partModels.clear();
  m_rows.clear();
  m_projectionKeys.clear();
  m_indices.clear();
  endResetModel();
}
} // namespace nt::chat
