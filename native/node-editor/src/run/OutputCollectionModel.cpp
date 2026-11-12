#include "OutputCollectionModel.h"
#include <algorithm>
#include <QHash>
#include <QSet>
namespace nodetool::node_editor {
int OutputCollectionModel::rowCount(const QModelIndex &parent) const { return parent.isValid() ? 0 : groups_.size(); }
QHash<int, QByteArray> OutputCollectionModel::roleNames() const {
  return {{Qt::UserRole, "collectionKey"}, {Qt::UserRole + 1, "collectionItems"}, {Qt::UserRole + 2, "collectionTitle"}, {Qt::UserRole + 3, "collectionNotice"}, {Qt::UserRole + 4, "richEntry"}};
}
QVariant OutputCollectionModel::data(const QModelIndex &index, int role) const {
  if (!index.isValid() || index.row() < 0 || index.row() >= groups_.size()) { return {}; }
  const auto group = groups_[index.row()].toMap();
  switch (role) {
  case Qt::UserRole: return group.value("key");
  case Qt::UserRole + 1: return group.value("items");
  case Qt::UserRole + 2: return group.value("title");
  case Qt::UserRole + 3: return group.value("notice");
  case Qt::UserRole + 4: return group.value("entry");
  default: return {};
  }
}
void OutputCollectionModel::setGroups(const QString &scope, const QVariantList &groups) {
  if (scope_ == scope && groups_ == groups) { return; }
  auto reset = [&] {
    beginResetModel(); scope_ = scope; groups_ = groups; endResetModel();
  };
  if (scope_ != scope) { reset(); return; }
  auto key = [](const QVariant &value) { return value.toMap().value("key").toString(); };
  QHash<QString, qsizetype> positions;
  for (qsizetype i = 0; i < groups.size(); ++i) {
    const auto id = key(groups[i]);
    if (positions.contains(id)) { reset(); return; }
    positions.insert(id, i);
  }
  QSet<QString> previous;
  qsizetype last = -1;
  for (const auto &value : groups_) {
    const auto id = key(value);
    if (previous.contains(id)) { reset(); return; }
    previous.insert(id);
    const auto found = positions.constFind(id);
    if (found != positions.cend()) {
      if (found.value() < last) { reset(); return; }
      last = found.value();
    }
  }
  // Remove contiguous history ranges backwards. Retained rows keep their
  // indexes, delegates, focus and pointer grabs across sparse updates.
  qsizetype cursor = groups_.size();
  while (cursor > 0) {
    if (positions.contains(key(groups_[cursor - 1]))) { --cursor; continue; }
    const auto end = cursor;
    while (cursor > 0 && !positions.contains(key(groups_[cursor - 1]))) { --cursor; }
    beginRemoveRows({}, cursor, end - 1);
    groups_.remove(cursor, end - cursor);
    endRemoveRows();
  }
  cursor = 0;
  while (cursor < groups.size()) {
    if (cursor < groups_.size() && key(groups_[cursor]) == key(groups[cursor])) {
      if (groups_[cursor] != groups[cursor]) { groups_[cursor] = groups[cursor]; emit dataChanged(index(cursor), index(cursor)); }
      ++cursor;
      continue;
    }
    const bool retainedAhead = cursor < groups_.size();
    const auto retainedKey = retainedAhead ? key(groups_[cursor]) : QString{};
    auto end = cursor;
    while (end < groups.size() && (!retainedAhead || key(groups[end]) != retainedKey)) { ++end; }
    beginInsertRows({}, cursor, end - 1);
    groups_.insert(cursor, end - cursor, QVariant{});
    for (auto i = cursor; i < end; ++i) { groups_[i] = groups[i]; }
    endInsertRows();
    cursor = end;
  }
}
}
