#include "ThreadModel.h"
namespace nt::chat {
int ThreadModel::rowCount(const QModelIndex &p) const {
  return p.isValid() ? 0 : static_cast<int>(m_rows.size());
}
QHash<int, QByteArray> ThreadModel::roleNames() const {
  return {
      {ThreadIdRole, "threadId"}, {TitleRole, "title"}, {StatusRole, "status"}};
}
QVariant ThreadModel::data(const QModelIndex &i, int role) const {
  if (!i.isValid() || i.row() < 0 || i.row() >= m_rows.size()) {
    return {};
  }
  const auto &m = m_rows[i.row()];
  switch (role) {
  case ThreadIdRole:
    return m["id"].toString();
  case TitleRole:
    return m["title"].toString("New conversation");
  case StatusRole:
    return m["status"].toString("idle");
  default:
    return {};
  }
}
void ThreadModel::upsert(const QJsonObject &m) {
  const auto id = m["id"].toString();
  if (id.isEmpty()) {
    return;
  }
  for (int i = 0; i < m_rows.size(); ++i) {
    if (m_rows[i]["id"] == id) {
      m_rows[i] = m;
      emit dataChanged(index(i), index(i));
      return;
    }
  }
  if (m_rows.size() >= 500) {
    return;
  }
  beginInsertRows({}, rowCount(), rowCount());
  m_rows.append(m);
  endInsertRows();
}
void ThreadModel::setStatus(const QString &id, const QString &status) {
  auto row = get(id);
  if (!row.isEmpty()) {
    row["status"] = status;
    upsert(row);
  }
}
QJsonObject ThreadModel::get(const QString &id) const {
  for (const auto &row : m_rows) {
    if (row["id"] == id) {
      return row;
    }
  }
  return {};
}
void ThreadModel::clear() {
  beginResetModel();
  m_rows.clear();
  endResetModel();
}
} // namespace nt::chat
