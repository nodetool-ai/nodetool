#pragma once
#include <QAbstractListModel>
#include <QHash>
#include <QJsonArray>
#include <QJsonObject>
#include <QTimer>
#include <QSet>
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
  void setChild(const QString &, QAbstractItemModel *, int count);
  Q_INVOKABLE void toggleExpanded(int row);
  Q_INVOKABLE void setFeedback(int row, const QString &text);
  Q_INVOKABLE void toggleCall(int row, const QString &id);

private:
  QHash<QString, QAbstractItemModel *> m_children;
  QHash<QString, int> m_counts;
  QHash<QString, bool> m_treeExpanded;
  QJsonArray m_parts;
  QSet<QString> m_expanded;
  QHash<QString, QString> m_feedback;
  QHash<QString, bool> m_thoughtExpanded;
  QHash<QString, qint64> m_thoughtStarts;
  QHash<QString, qint64> m_thoughtDurations;
  QString expansionKey(int row) const;
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
    StatusRole,
    DisplayTextRole
  };
  explicit MessageModel(QObject *parent = nullptr)
      : QAbstractListModel(parent) {}
  int rowCount(const QModelIndex &parent = {}) const override;
  QVariant data(const QModelIndex &, int) const override;
  QHash<int, QByteArray> roleNames() const override;
  QString upsert(const QJsonObject &message);
  void appendChunk(const QString &text, bool done, bool thinking = false);
  void finishThinking();
  bool reduceNested(const QJsonObject &event);
  void addPart(const QJsonObject &part);
  bool addResolvedPart(const QString &messageId, const QJsonObject &part);
  void importHistory(const QJsonArray &, bool prepend = false);
  QJsonArray snapshot() const;
  void clear();

private:
  MessageModel *child(const QString &key);
  void attachChildren(PartModel *) const;
  void treeRow(const QString &id, const QString &label, const QString &status, const QString &body = {}, bool expanded = false);
  QHash<QString, MessageModel *> m_children;
  QHash<QString, int> m_childCounts;
  QJsonArray m_nestedEvents;
  QSet<QString> m_eventIds;
  QHash<QString, QString> m_stepTasks;
  QHash<QString, QString> m_callSteps;
  int callOwner(const QString &id) const;
  QHash<QString, QList<qsizetype>> m_partOffsets;
  QHash<QString, QJsonObject> m_results;
  QHash<QString, QJsonObject> m_resultMessages;
  QList<QJsonObject> m_rows;
  QHash<QString, QList<QJsonObject>> m_groupSources;
  QHash<QString, int> m_indices;
  QList<QString> m_projectionKeys;
  mutable QHash<QString, PartModel *> m_partModels;
  void refreshParts(int row);
  void releaseParts(const QString &key);
  QTimer *m_frameTimer = nullptr;
  int m_dirtyRow = -1;
};
} // namespace nt::chat
