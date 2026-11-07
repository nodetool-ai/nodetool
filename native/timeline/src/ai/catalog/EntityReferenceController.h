#pragma once
#include <QObject>
#include <QUrl>
#include <QVariantList>
#include <QtQmlIntegration/qqmlintegration.h>

class EntityReferenceController : public QObject {
    Q_OBJECT
    QML_ELEMENT
    Q_PROPERTY(QString projectId READ projectId WRITE setProjectId NOTIFY changed)
    Q_PROPERTY(QVariantList entities READ entities NOTIFY changed)
    Q_PROPERTY(QVariantList selectedEntities READ selectedEntities NOTIFY changed)
    Q_PROPERTY(QVariantList selectedIds READ selectedIds NOTIFY changed)
    Q_PROPERTY(bool loading READ loading NOTIFY changed)
    Q_PROPERTY(QString error READ error NOTIFY changed)
public:
    explicit EntityReferenceController(QObject* parent = nullptr);
    QString projectId() const { return m_projectId; }
    void setProjectId(const QString& id);
    QVariantList entities() const { return m_entities; }
    QVariantList selectedEntities() const;
    QVariantList selectedIds() const { return m_selectedIds; }
    bool loading() const { return m_loading; }
    QString error() const { return m_error; }
    Q_INVOKABLE void configure(const QUrl& server, const QString& token = {});
    Q_INVOKABLE void reload();
    Q_INVOKABLE void toggleEntity(const QString& id);
    Q_INVOKABLE void clear();
signals:
    void changed();
private:
    QString m_projectId;
    QUrl m_server;
    QString m_token;
    QVariantList m_entities;
    QVariantList m_selectedIds;
    QString m_error;
    bool m_loading = false;
    quint64 m_revision = 0;
};
