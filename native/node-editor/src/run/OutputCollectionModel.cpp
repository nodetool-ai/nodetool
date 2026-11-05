#include "OutputCollectionModel.h"
#include <algorithm>
namespace nodetool::node_editor {
int OutputCollectionModel::rowCount(const QModelIndex &parent) const { return parent.isValid() ? 0 : groups_.size(); }
QHash<int, QByteArray> OutputCollectionModel::roleNames() const {
  return {{Qt::UserRole, "collectionKey"}, {Qt::UserRole + 1, "collectionItems"}, {Qt::UserRole + 2, "collectionTitle"}, {Qt::UserRole + 3, "collectionNotice"}};
}
QVariant OutputCollectionModel::data(const QModelIndex &index, int role) const {
  if (!index.isValid() || index.row() < 0 || index.row() >= groups_.size()) { return {}; }
  const auto group = groups_[index.row()].toMap();
  switch (role) {
  case Qt::UserRole: return group.value("key");
  case Qt::UserRole + 1: return group.value("items");
  case Qt::UserRole + 2: return group.value("title");
  case Qt::UserRole + 3: return group.value("notice");
  default: return {};
  }
}
void OutputCollectionModel::setGroups(const QString &scope, const QVariantList &groups) {
  if (scope_ == scope && groups_ == groups) { return; }
  bool compatible = scope_ == scope;
  const auto common = std::min(groups_.size(), groups.size());
  for (qsizetype i = 0; compatible && i < common; ++i) { compatible = groups_[i].toMap().value("key") == groups[i].toMap().value("key"); }
  if (!compatible) {
    beginResetModel(); scope_ = scope; groups_ = groups; endResetModel(); return;
  }
  if (groups.size() < groups_.size()) {
    beginRemoveRows({}, groups.size(), groups_.size() - 1);
    groups_ = groups_.mid(0, groups.size());
    endRemoveRows();
  }
  for (qsizetype i = 0; i < common; ++i) {
    if (groups_[i] != groups[i]) { groups_[i] = groups[i]; emit dataChanged(index(i), index(i)); }
  }
  if (groups.size() > groups_.size()) {
    const auto first = groups_.size();
    beginInsertRows({}, first, groups.size() - 1);
    for (qsizetype i = first; i < groups.size(); ++i) { groups_.append(groups[i]); }
    endInsertRows();
  }
}
}
