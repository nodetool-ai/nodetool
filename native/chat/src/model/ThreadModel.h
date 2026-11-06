#pragma once
#include <QAbstractListModel>
#include <QJsonObject>
namespace nt::chat {
class ThreadModel : public QAbstractListModel {
  Q_OBJECT
public:
  enum Role { ThreadIdRole = Qt::UserRole + 1, TitleRole, StatusRole };
  explicit ThreadModel(QObject *parent = nullptr)
      : QAbstractListModel(parent) {}
  int rowCount(const QModelIndex &parent = {}) const override;
  QVariant data(const QModelIndex &, int) const override;
  QHash<int, QByteArray> roleNames() const override;
  void upsert(const QJsonObject &);
  void setStatus(const QString &, const QString &);
  QJsonObject get(const QString &) const;
  void clear();

private:
  QList<QJsonObject> m_rows;
};
} // namespace nt::chat
