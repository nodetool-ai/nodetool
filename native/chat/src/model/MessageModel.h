#pragma once
#include <QAbstractListModel>
#include <QHash>
#include <QJsonArray>
#include <QJsonObject>
#include <QTimer>
namespace nt::chat {
class PartModel : public QAbstractListModel {
  Q_OBJECT
public:
  enum Role { ModelDataRole = Qt::UserRole + 1 };
  explicit PartModel(QObject *parent = nullptr) : QAbstractListModel(parent) {}
  int rowCount(const QModelIndex &parent = {}) const override;
  QVariant data(const QModelIndex &, int role) const override;
  QHash<int, QByteArray> roleNames() const override;
  void setParts(const QJsonArray &);

private:
  QJsonArray m_parts;
};
class MessageModel : public QAbstractListModel {
  Q_OBJECT
public:
  enum Role {
    MessageIdRole = Qt::UserRole + 1,
    RoleRole,
    TextRole,
    TimestampRole,
    PartsRole,
    StatusRole
  };
  explicit MessageModel(QObject *parent = nullptr)
      : QAbstractListModel(parent) {}
  int rowCount(const QModelIndex &parent = {}) const override;
  QVariant data(const QModelIndex &, int) const override;
  QHash<int, QByteArray> roleNames() const override;
  QString upsert(const QJsonObject &message);
  void appendChunk(const QString &text, bool done);
  void addPart(const QJsonObject &part);
  bool addResolvedPart(const QString &messageId, const QJsonObject &part);
  void importHistory(const QJsonArray &, bool prepend = false);
  QJsonArray snapshot() const;
  void clear();

private:
  QList<QJsonObject> m_rows;
  QHash<QString, int> m_indices;
  QList<QString> m_projectionKeys;
  mutable QHash<QString, PartModel *> m_partModels;
  void refreshParts(int row);
  void releaseParts(const QString &key);
  QTimer *m_frameTimer = nullptr;
  int m_dirtyRow = -1;
};
} // namespace nt::chat
