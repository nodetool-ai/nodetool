#pragma once
#include <QAbstractListModel>
#include <QVariantList>
namespace nodetool::node_editor {
class OutputCollectionModel final : public QAbstractListModel {
  Q_OBJECT
public:
  explicit OutputCollectionModel(QObject *parent = nullptr) : QAbstractListModel(parent) {}
  int rowCount(const QModelIndex &parent = {}) const override;
  QVariant data(const QModelIndex &index, int role) const override;
  QHash<int, QByteArray> roleNames() const override;
  void setGroups(const QString &scope, const QVariantList &groups);
private:
  QString scope_;
  QVariantList groups_;
};
}
