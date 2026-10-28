#pragma once

#include "server/ServerClient.h"
#include <QObject>
#include <QVariantList>
#include <memory>

namespace nt::server {
class TimelineListController : public QObject {
    Q_OBJECT
    Q_PROPERTY(QVariantList documents READ documents NOTIFY changed)
    Q_PROPERTY(QVariantList projects READ projects NOTIFY changed)
    Q_PROPERTY(QString projectId READ projectId WRITE setProjectId NOTIFY changed)
    Q_PROPERTY(QString error READ error NOTIFY changed)
    Q_PROPERTY(bool busy READ busy NOTIFY changed)
    Q_PROPERTY(QVariantMap deleteTarget READ deleteTarget NOTIFY changed)
public:
    explicit TimelineListController(QObject* parent = nullptr);
    TimelineListController(QUrl server, QString token, QString instance, QObject* parent = nullptr);
    QVariantList documents() const { return m_documents; }
    QVariantList projects() const { return m_projects; }
    QString projectId() const { return m_projectId; }
    QString error() const { return m_error; }
    bool busy() const { return m_busy; }
    QVariantMap deleteTarget() const { return m_deleteTarget; }
    void setProjectId(const QString& id);
    Q_INVOKABLE void refresh();
    Q_INVOKABLE QVariantMap createTimeline();
    Q_INVOKABLE bool renameTimeline(const QString& id, const QString& name);
    Q_INVOKABLE void requestDelete(const QString& id);
    Q_INVOKABLE void cancelDelete();
    Q_INVOKABLE bool confirmDelete();
    Q_INVOKABLE QString openTimeline(const QString& id);
    static QString dateGroup(const QString& updatedAt);
signals:
    void changed();
    void openRequested(const QString& source);
private:
    bool begin();
    void finish(const QString& error = {});
    void reloadDocuments();
    QVariantMap find(const QString& id) const;
    QUrl m_server;
    std::unique_ptr<ServerClient> m_client;
    QVariantList m_documents;
    QVariantList m_projects;
    QString m_projectId;
    QString m_error;
    bool m_busy = false;
    QVariantMap m_deleteTarget;
};
}
