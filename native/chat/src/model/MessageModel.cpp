#include "MessageModel.h"
#include <QDateTime>
#include <QJsonDocument>
#include <QRegularExpression>
#include <QSet>
#include <QUrl>
#include <QUuid>
#include <algorithm>
#include <cmath>
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
QString formatToolName(QString name) {
  const auto match = QRegularExpression("^mcp__[^_]+(?:_[^_]+)*__(.+)$").match(name);
  if (match.hasMatch()) { name = match.captured(1); }
  name.remove(QRegularExpression("^(ui_|tool_)"));
  auto words = name.split('_');
  for (auto &word : words) {
    if (!word.isEmpty()) { word[0] = word[0].toUpper(); }
  }
  return words.join(' ');
}
QString toolKind(QString name) {
  name.replace(QRegularExpression("([a-z0-9])([A-Z])"), "\\1_\\2");
  const auto segments = name.toLower().split(QRegularExpression("[^a-z0-9]+"), Qt::SkipEmptyParts);
  const QList<QPair<QString, QStringList>> kinds{
    {"plan", {"plan"}}, {"search", {"search", "grep", "glob", "lookup", "query"}},
    {"page", {"browser", "crawl", "scrape", "fetch", "http", "url", "download", "visit"}},
    {"write", {"write", "edit", "save", "update", "create", "delete", "upload"}},
    {"read", {"read", "open", "cat", "list"}},
    {"run", {"run", "exec", "execute", "bash", "shell", "command", "script"}}};
  for (const auto &[kind, words] : kinds) {
    for (const auto &word : words) {
      if (segments.contains(word)) { return kind; }
    }
  }
  return "generic";
}
QString toolDetail(const QJsonObject &args, bool shortUrl = false) {
  for (const auto key : {"url", "uri", "path", "file", "filename", "target", "query", "q", "objective"}) {
    auto value = args[key].toString().trimmed();
    if (value.isEmpty()) { continue; }
    if (QString(key) == "url" || QString(key) == "uri") {
      const QUrl url(value);
      if (url.isValid() && !url.scheme().isEmpty()) {
        auto host = url.host();
        if (host.startsWith("www.")) { host.remove(0, 4); }
        return host + (shortUrl ? QString() :
          (url.path() == "/" ? QString() : url.path()) + (url.hasQuery() ? "?" + url.query() : QString()));
      }
    }
    return value;
  }
  return {};
}
QString countLabel(const QString &name, int count) {
  const auto kind = toolKind(name);
  if (kind == "plan") { return count == 1 ? "Wrote a plan" : QString("Wrote %1 plans").arg(count); }
  if (kind == "search") { return QString("Ran %1 %2").arg(count).arg(count == 1 ? "search" : "searches"); }
  if (kind == "page") { return QString("Opened %1 %2").arg(count).arg(count == 1 ? "page" : "pages"); }
  if (kind == "read") { return QString("Read %1 %2").arg(count).arg(count == 1 ? "item" : "items"); }
  if (kind == "write") { return QString("Made %1 %2").arg(count).arg(count == 1 ? "edit" : "edits"); }
  return (kind == "run" ? "Ran " : "") + formatToolName(name) + (count == 1 ? QString() : QString(" %1 times").arg(count));
}
bool groupable(const QString &name) {
  static const QSet<QString> separate{"execute_code", "run_subtask", "run_search", "ask_user", "request_secret", "create_plan"};
  return !name.isEmpty() && !separate.contains(name);
}
QString mergeableName(const QJsonObject &message) {
  if (message["role"] != "assistant") { return {}; }
  const auto content = message["content"];
  if (content.isString() && !content.toString().trimmed().isEmpty()) { return {}; }
  if (content.isObject() || content.isBool() || content.isDouble()) { return {}; }
  for (const auto &value : content.toArray()) {
    if (!value.isObject()) { continue; }
    const auto block = value.toObject();
    if (block["type"] != "text" || !block["text"].toString().trimmed().isEmpty()) { return {}; }
  }
  if (!message["parts"].toArray().isEmpty()) { return {}; }
  const auto calls = message["tool_calls"].toArray();
  if (calls.isEmpty()) { return {}; }
  const auto name = calls.first().toObject()["name"].toString();
  if (!groupable(name)) { return {}; }
  for (const auto &call : calls) {
    if (call.toObject()["name"] != name) { return {}; }
  }
  return name;
}
QString durationLabel(qint64 ms) {
  if (ms < 0) { return {}; }
  if (ms < 1000) { return QString::number(ms) + "ms"; }
  const auto seconds = std::round(ms / 100.0) / 10.0;
  if (seconds < 60) { return QString::number(seconds, 'f', seconds == std::floor(seconds) ? 0 : 1) + "s"; }
  const auto whole = qRound64(ms / 1000.0);
  return QString("%1m %2s").arg(whole / 60).arg(whole % 60, 2, 10, QLatin1Char('0'));
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
  const auto detail = toolDetail(args.toObject());
  const auto kind = toolKind(name);
  auto label = formatToolName(name);
  if (kind == "plan") label = detail.isEmpty() ? "Wrote a plan" : "Planned";
  else if (kind == "search") label = detail.isEmpty() ? "Ran 1 search" : "Searched";
  else if (kind == "page") label = detail.isEmpty() ? "Opened 1 page" : "Opened page";
  else if (kind == "write" && !detail.isEmpty()) label = "Edited";
  else if (kind == "read" && !detail.isEmpty()) label = "Read";
  part["label"] = label + (detail.isEmpty() ? QString() : " " + detail);
  part["tool"] = true;
  const auto result = part.value("result");
  const bool failed = part["is_error"].toBool() ||
                      result.toObject()["error"].isString() ||
                      result.toObject()["is_error"].toBool();
  part["displayStatus"] = failed                    ? "Failed"
                          : part.contains("result") ? "Done"
                                                    : "Running";
  const auto start = QDateTime::fromString(part["started_at"].toString(), Qt::ISODateWithMs);
  const auto end = QDateTime::fromString(part["result_created_at"].toString(), Qt::ISODateWithMs);
  if (part.contains("result") && start.isValid() && end.isValid()) {
    part["durationMs"] = start.msecsTo(end);
    part["duration"] = durationLabel(start.msecsTo(end));
  }
  part["args"] = args;
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
    projected.insert("started_at", m["created_at"]);
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
      QJsonArray calls;
      QStringList preview;
      QSet<QString> seen;
      QString status = "Done";
      QString shared = group["message"].toString().trimmed();
      bool sameMessage = !shared.isEmpty();
      const auto kind = toolKind(name);
      bool listed = end - first <= 4 && (kind == "page" || kind == "read" || kind == "write");
      int completed = 0;
      qint64 duration = -1;
      for (auto i = first; i < end; ++i) {
        const auto item = displayed[i].toObject();
        calls.append(item);
        sameMessage = sameMessage && item["message"].toString().trimmed() == shared;
        const auto args = item["args"].toObject();
        bool location = false;
        for (const auto key : {"url", "uri", "path", "file", "filename"}) {
          location = location || !args[key].toString().trimmed().isEmpty();
        }
        listed = listed && location;
        const auto value = toolDetail(args, true);
        if (!value.isEmpty() && !seen.contains(value)) { preview.append(value); seen.insert(value); }
        if (item.contains("result")) { ++completed; }
        if (item.contains("durationMs")) { duration = std::max(duration, item["durationMs"].toInteger()); }
        if (item["displayStatus"] == "Failed") { status = "Failed"; }
        else if (status != "Failed" && item["displayStatus"] == "Running") { status = "Running"; }
      }
      if (listed) {
        for (const auto &call : calls) { grouped.append(call); }
        first = end;
        continue;
      }
      const auto headline = sameMessage ? shared : countLabel(name, calls.size());
      if (preview.size() == 1 && headline.contains(preview.first())) { preview.clear(); }
      group["label"] = headline;
      group["preview"] = preview.mid(0, 3).join(" · ") + (preview.size() > 3 ? QString(" +%1").arg(preview.size() - 3) : QString());
      group["count"] = calls.size();
      group["duration"] = completed == calls.size() ? durationLabel(duration) : QString();
      group["progress"] = completed < calls.size() ? QString("%1/%2").arg(completed).arg(calls.size()) : QString();
      group["calls"] = calls;
      group["displayStatus"] = status;
      group["argumentsText"] = QString();
      group["resultText"] = QString();
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
    auto data = part.toObject().toVariantMap();
    if (data.value("tool").toBool()) {
      data["expanded"] = m_expanded.contains(expansionKey(index.row()));
      auto calls = data.value("calls").toList();
      for (auto &value : calls) {
        auto call = value.toMap();
        call["expanded"] = m_expanded.contains("call:" + call["tool_call_id"].toString());
        value = call;
      }
      data["calls"] = calls;
    }
    return data;
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
QString PartModel::expansionKey(int row) const {
  const auto part = m_parts[row].toObject();
  const auto call = part["tool_call_id"].toString();
  return (part["grouped"].toBool() ? "group:" : "call:") +
         (call.isEmpty() ? QString::number(row) : call);
}
void PartModel::toggleExpanded(int row) {
  if (row < 0 || row >= m_parts.size()) {
    return;
  }
  const auto key = expansionKey(row);
  if (!m_expanded.remove(key)) {
    m_expanded.insert(key);
  }
  emit dataChanged(index(row), index(row), {ModelDataRole});
}
void PartModel::toggleCall(int row, const QString &id) {
  if (row < 0 || row >= m_parts.size()) { return; }
  const auto key = "call:" + id;
  if (!m_expanded.remove(key)) { m_expanded.insert(key); }
  emit dataChanged(index(row), index(row), {ModelDataRole});
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
  const auto mergeName = mergeableName(message);
  if (!m_indices.contains(id) && !mergeName.isEmpty() && !m_rows.isEmpty() &&
      mergeableName(m_rows.last()) == mergeName) {
    const int row = m_rows.size() - 1;
    const auto owner = m_projectionKeys[row];
    if (!m_groupSources.contains(owner)) { m_groupSources[owner] = {m_rows[row]}; }
    m_groupSources[owner].append(message);
    auto calls = m_rows[row]["tool_calls"].toArray();
    for (const auto &call : message["tool_calls"].toArray()) { calls.append(call); }
    m_rows[row]["tool_calls"] = calls;
    m_indices[key] = row;
    refreshParts(row);
    emit dataChanged(index(row), index(row), {PartsRole});
    return owner;
  }
  if (!id.isEmpty() && m_indices.contains(id)) {
    const auto i = m_indices.value(id);
    const auto owner = m_projectionKeys[i];
    if (m_groupSources.contains(owner)) {
      auto &sources = m_groupSources[owner];
      QJsonArray calls;
      for (auto &source : sources) {
        if (source["id"] == id) { source = message; }
        for (const auto &call : source["tool_calls"].toArray()) { calls.append(call); }
      }
      m_rows[i] = sources.first();
      m_rows[i]["tool_calls"] = calls;
    } else {
      m_rows[i] = message;
    }
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
      for (const auto &value : m_rows[candidate]["tool_calls"].toArray()) {
        const auto call = value.toObject();
        if (call["id"] == incomingCall || call["tool_call_id"] == incomingCall) { found = true; break; }
      }
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
  auto calls = row["tool_calls"].toArray();
  for (int i = 0; i < calls.size(); ++i) {
    auto call = calls[i].toObject();
    if (!incomingCall.isEmpty() && (call["id"] == incomingCall || call["tool_call_id"] == incomingCall)) {
      for (auto it = part.begin(); it != part.end(); ++it) { call[it.key()] = it.value(); }
      calls[i] = call;
      row["tool_calls"] = calls;
      refreshParts(targetRow);
      emit dataChanged(index(targetRow), index(targetRow), {PartsRole});
      return;
    }
  }
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
  for (int i = 0; i < m_rows.size(); ++i) {
    const auto key = m_projectionKeys[i];
    if (m_groupSources.contains(key)) {
      for (const auto &source : m_groupSources.value(key)) { out.append(source); }
    } else { out.append(m_rows[i]); }
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
  m_groupSources.clear();
  endResetModel();
}
} // namespace nt::chat
