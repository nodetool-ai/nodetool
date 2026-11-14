#include "GenerationRowsModel.h"

#include "GenerationActivity.h"

namespace nodetool::node_editor {

GenerationRowsModel::GenerationRowsModel(QObject *parent) : QAbstractListModel(parent) {}

GenerationRowsModel::~GenerationRowsModel() { disconnect(connection_); }

int GenerationRowsModel::rowCount(const QModelIndex &parent) const { return parent.isValid() ? 0 : int(rows_.size()); }

QVariant GenerationRowsModel::data(const QModelIndex &index, int role) const {
  if (!index.isValid() || index.row() >= rows_.size() || role != RowRole) { return {}; }
  return rows_[index.row()];
}

QHash<int, QByteArray> GenerationRowsModel::roleNames() const { return {{RowRole, "row"}}; }

void GenerationRowsModel::setActivity(GenerationActivity *activity) {
  if (activity_ == activity) { return; }
  disconnect(connection_);
  activity_ = activity;
  if (activity_) { connection_ = connect(activity_, &GenerationActivity::rowsChanged, this, &GenerationRowsModel::sync); }
  emit activityChanged();
  sync();
}

void GenerationRowsModel::setFilter(const QString &filter) {
  if (filter_ == filter) { return; }
  filter_ = filter;
  emit filterChanged();
  sync();
}

void GenerationRowsModel::sync() {
  QStringList ids;
  QList<QVariantMap> rows;
  if (activity_) {
    for (const auto &value : activity_->rows()) {
      auto row = value.toMap();
      if (filter_ != QStringLiteral("all") && row.value("status").toString() != filter_) { continue; }
      ids.append(row.value("id").toString());
      rows.append(std::move(row));
    }
  }
  // Remove the rows that left, from the end so the indexes stay valid.
  for (auto i = ids_.size() - 1; i >= 0; --i) {
    if (ids.contains(ids_[i])) { continue; }
    beginRemoveRows({}, int(i), int(i));
    ids_.removeAt(i);
    rows_.removeAt(i);
    endRemoveRows();
  }
  // Move or insert each wanted row into its place, then update the ones whose fields changed.
  for (qsizetype i = 0; i < ids.size(); ++i) {
    if (i < ids_.size() && ids_[i] == ids[i]) {
      if (rows_[i] != rows[i]) {
        rows_[i] = rows[i];
        emit dataChanged(index(int(i)), index(int(i)), {RowRole});
      }
      continue;
    }
    const auto from = ids_.indexOf(ids[i], i);
    if (from > i) {
      beginMoveRows({}, int(from), int(from), {}, int(i));
      ids_.move(from, i);
      rows_.move(from, i);
      endMoveRows();
      if (rows_[i] != rows[i]) {
        rows_[i] = rows[i];
        emit dataChanged(index(int(i)), index(int(i)), {RowRole});
      }
    } else {
      beginInsertRows({}, int(i), int(i));
      ids_.insert(i, ids[i]);
      rows_.insert(i, rows[i]);
      endInsertRows();
    }
  }
}

}  // namespace nodetool::node_editor
