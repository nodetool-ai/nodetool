#include "MediaGalleryModel.h"
#include <QAbstractListModel>
#include <algorithm>
namespace nodetool::node_editor {
namespace {
class GalleryItemsModel final : public QAbstractListModel {
public:
  explicit GalleryItemsModel(QObject *parent) : QAbstractListModel(parent) {}
  int rowCount(const QModelIndex &parent = {}) const override { return parent.isValid() ? 0 : static_cast<int>(items_.size()); }
  QHash<int, QByteArray> roleNames() const override { return {{Qt::UserRole, "galleryItem"}}; }
  QVariant data(const QModelIndex &index, int role) const override {
    if (!index.isValid() || index.row() < 0 || index.row() >= items_.size() || role != Qt::UserRole) { return {}; }
    return items_[index.row()];
  }
  void setItems(const QVariantList &items) {
    const auto common = std::min(items.size(), items_.size());
    bool compatible = true;
    for (qsizetype i = 0; compatible && i < common; ++i) { compatible = items[i].toMap().value("itemKey") == items_[i].toMap().value("itemKey"); }
    if (!compatible) { beginResetModel(); items_ = items; endResetModel(); return; }
    if (items.size() < items_.size()) { beginRemoveRows({}, items.size(), items_.size() - 1); items_ = items_.mid(0, items.size()); endRemoveRows(); }
    for (qsizetype i = 0; i < common; ++i) { if (items_[i] != items[i]) { items_[i] = items[i]; emit dataChanged(index(i), index(i)); } }
    if (items.size() > items_.size()) {
      const auto first = items_.size(); beginInsertRows({}, first, items.size() - 1);
      for (qsizetype i = first; i < items.size(); ++i) { items_.append(items[i]); }
      endInsertRows();
    }
  }
private:
  QVariantList items_;
};
}
MediaGalleryModel::MediaGalleryModel(QObject *parent) : QObject(parent), grid_(new GalleryItemsModel(this)) {}
QVariantMap MediaGalleryModel::selected() const { return selected_ >= 0 && selected_ < count() ? items_[selected_].toMap() : QVariantMap{}; }
void MediaGalleryModel::setItems(const QVariantList &items) {
  if (items_ == items) { return; }
  const auto oldSelection = selected();
  const auto oldIndex = selected_;
  const auto oldView = singleView();
  const bool first = items_.isEmpty();
  items_ = items;
  if (first) { expanded_ = count() <= 1; }
  const auto key = oldSelection.value("itemKey");
  selected_ = std::clamp(selected_, 0, std::max(0, count() - 1));
  if (key.isValid()) {
    for (qsizetype i = 0; i < items_.size(); ++i) { if (items_[i].toMap().value("itemKey") == key) { selected_ = static_cast<int>(i); break; } }
  }
  static_cast<GalleryItemsModel *>(grid_)->setItems(items_);
  emit itemsChanged();
  if (oldSelection != selected()) { emit selectedChanged(); }
  if (oldIndex != selected_) { emit currentIndexChanged(); }
  if (oldView != singleView()) { emit viewChanged(); }
}
void MediaGalleryModel::open(int index) {
  if (index < 0 || index >= count()) { return; }
  const bool changed = index != selected_;
  const auto wasSingle = singleView();
  selected_ = index;
  expanded_ = true;
  if (changed) { emit selectedChanged(); emit currentIndexChanged(); }
  if (wasSingle != singleView()) { emit viewChanged(); }
}
void MediaGalleryModel::showGrid() {
  const auto wasSingle = singleView(); expanded_ = false;
  if (wasSingle != singleView()) { emit viewChanged(); }
}
}
