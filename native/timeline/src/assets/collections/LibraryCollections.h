#pragma once

#include <QObject>
#include <QStringList>
#include <QVariantList>
#include <QtQmlIntegration/qqmlintegration.h>

class LibraryCollections : public QObject {
  Q_OBJECT
  QML_ELEMENT
  Q_PROPERTY(QString scope READ scope WRITE setScope NOTIFY scopeChanged)
  Q_PROPERTY(QString selectedId READ selectedId WRITE setSelectedId NOTIFY
                 selectedIdChanged)
  Q_PROPERTY(
      QVariantList collections READ collections NOTIFY collectionsChanged)
  Q_PROPERTY(QStringList assetIds READ assetIds NOTIFY assetIdsChanged)
  Q_PROPERTY(QString error READ error NOTIFY errorChanged)
public:
  explicit LibraryCollections(QObject *parent = nullptr);
  QString scope() const { return m_scope; }
  void setScope(const QString &scope);
  QString selectedId() const { return m_selectedId; }
  void setSelectedId(const QString &id);
  QVariantList collections() const;
  QStringList assetIds() const;
  QString error() const { return m_error; }
  Q_INVOKABLE QString create(const QString &name);
  Q_INVOKABLE bool rename(const QString &id, const QString &name);
  Q_INVOKABLE bool remove(const QString &id);
  Q_INVOKABLE bool addAssets(const QString &id, const QStringList &assetIds);
  Q_INVOKABLE bool removeAssets(const QString &id, const QStringList &assetIds);
signals:
  void scopeChanged();
  void selectedIdChanged();
  void collectionsChanged();
  void assetIdsChanged();
  void errorChanged();

private:
  struct Collection {
    QString id;
    QString name;
    QStringList assetIds;
  };
  bool commit(const QList<Collection> &collections);
  bool changeAssets(const QString &id, const QStringList &ids, bool adding);
  void setError(const QString &error);
  QString settingsKey() const;
  QString m_scope;
  QString m_selectedId;
  QString m_error;
  QList<Collection> m_collections;
};
