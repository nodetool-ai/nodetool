#pragma once
#include <QObject>
#include <QAbstractItemModel>
#include <QVariantList>
#include <QVariantMap>
namespace nodetool::node_editor {
class MediaGalleryModel : public QObject {
  Q_OBJECT
  Q_PROPERTY(QVariantList items READ items WRITE setItems NOTIFY itemsChanged)
  Q_PROPERTY(QAbstractItemModel *gridModel READ gridModel CONSTANT)
  Q_PROPERTY(QVariantMap selected READ selected NOTIFY selectedChanged)
  Q_PROPERTY(int count READ count NOTIFY itemsChanged)
  Q_PROPERTY(int currentIndex READ currentIndex NOTIFY currentIndexChanged)
  Q_PROPERTY(bool singleView READ singleView NOTIFY viewChanged)
public:
  explicit MediaGalleryModel(QObject *parent = nullptr);
  QVariantList items() const { return items_; }
  void setItems(const QVariantList &items);
  QAbstractItemModel *gridModel() const { return grid_; }
  QVariantMap selected() const;
  int count() const { return static_cast<int>(items_.size()); }
  int currentIndex() const { return selected_; }
  bool singleView() const { return expanded_ || count() <= 1; }
  Q_INVOKABLE void open(int index);
  Q_INVOKABLE void showGrid();
signals:
  void itemsChanged();
  void selectedChanged();
  void currentIndexChanged();
  void viewChanged();
private:
  QAbstractItemModel *grid_;
  QVariantList items_;
  int selected_ = 0;
  bool expanded_ = false;
};
}
