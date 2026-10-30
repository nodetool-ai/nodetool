#include "MessageModel.h"
#include <QDateTime>
#include <QJsonDocument>
#include <QSet>
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
    parts.append(QJsonObject{
        {"type", "tool_call"},
        {"tool_call_id", call["id"].toString(call["tool_call_id"].toString())},
        {"name", name},
        {"args", args},
        {"payload", call},
        {"text", name + "\n" + argsText}});
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
  return parts;
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
  auto &row = m_rows.last();
  auto parts = row["parts"].toArray();
  const auto action = part["actionId"].toString();
  const auto call = part["tool_call_id"].toString();
  bool replaced = false;
  for (int i = 0; i < parts.size(); ++i) {
    auto p = parts[i].toObject();
    if ((!action.isEmpty() && p["actionId"] == action) ||
        (!call.isEmpty() && p["tool_call_id"] == call)) {
      parts[i] = part;
      replaced = true;
      break;
    }
  }
  if (!replaced && parts.size() < 1000) {
    parts.append(part);
  }
  row["parts"] = parts;
  refreshParts(rowCount() - 1);
  emit dataChanged(index(rowCount() - 1), index(rowCount() - 1), {PartsRole});
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
