#pragma once
#include <QAbstractListModel>
#include <QPointer>
#include <QStringList>
#include <QVariantMap>

namespace nodetool::node_editor {

class GenerationActivity;

// The Generations panel's grid model: GenerationActivity::rows with the panel's
// filter applied. A change to the rows inserts, removes, moves or updates only
// the rows that differ, so a tile keeps its delegate and its loaded thumbnail
// while other generations start, progress and finish.
//
// UI thread only. QML creates one per panel and sets a non-owning activity.
class GenerationRowsModel : public QAbstractListModel {
  Q_OBJECT
  Q_PROPERTY(GenerationActivity *activity READ activity WRITE setActivity NOTIFY activityChanged)
  // all, generating or failed.
  Q_PROPERTY(QString filter READ filter WRITE setFilter NOTIFY filterChanged)
public:
  enum Role { RowRole = Qt::UserRole + 1 };
  explicit GenerationRowsModel(QObject *parent = nullptr);
  ~GenerationRowsModel() override;

  int rowCount(const QModelIndex &parent = {}) const override;
  QVariant data(const QModelIndex &index, int role) const override;
  QHash<int, QByteArray> roleNames() const override;

  GenerationActivity *activity() const { return activity_; }
  void setActivity(GenerationActivity *activity);
  QString filter() const { return filter_; }
  void setFilter(const QString &filter);

signals:
  void activityChanged();
  void filterChanged();

private:
  void sync();
  QPointer<GenerationActivity> activity_;
  QMetaObject::Connection connection_;
  QString filter_ = QStringLiteral("all");
  QStringList ids_;
  QList<QVariantMap> rows_;
};

}  // namespace nodetool::node_editor
