#pragma once
#include "ai/GenerationTransport.h"
#include <QVariantList>
#include <QVariantMap>
#include <QtQmlIntegration/qqmlintegration.h>

class EntityAssist : public QObject {
    Q_OBJECT
    QML_ELEMENT
    Q_PROPERTY(bool generating READ generating NOTIFY changed)
    Q_PROPERTY(QString generateError READ generateError NOTIFY changed)
    Q_PROPERTY(QStringList takes READ takes NOTIFY changed)
    Q_PROPERTY(bool assisting READ assisting NOTIFY changed)
    Q_PROPERTY(QString assistError READ assistError NOTIFY changed)
    Q_PROPERTY(QString proposal READ proposal NOTIFY changed)
    Q_PROPERTY(QVariantList quickActions READ quickActions CONSTANT)
public:
    explicit EntityAssist(QObject* parent = nullptr);
    ~EntityAssist() override;
    bool generating() const { return !m_referenceId.isEmpty(); }
    QString generateError() const { return m_generateError; }
    QStringList takes() const { return m_takes; }
    bool assisting() const { return !m_assistId.isEmpty(); }
    QString assistError() const { return m_assistError; }
    QString proposal() const { return m_proposal; }
    QVariantList quickActions() const;
    Q_INVOKABLE void configure(const QUrl& server, const QString& token = {});
    void setReferenceTimeout(int milliseconds) { m_referenceTimeout.setInterval(milliseconds); }
    Q_INVOKABLE void generateReference(const QVariantMap& request);
    Q_INVOKABLE void chooseTake(const QString& id);
    Q_INVOKABLE void cancelReference();
    Q_INVOKABLE void assist(const QVariantMap& request);
    Q_INVOKABLE void cancelAssist();
    Q_INVOKABLE void clearProposal();
    Q_INVOKABLE QString assistContext(const QString& kind, const QString& name) const;
    Q_INVOKABLE QVariantList referenceViews(const QString& kind) const;
    Q_INVOKABLE QString referencePrompt(const QString& kind, const QString& name, const QString& descriptor, const QString& viewId) const;
signals:
    void changed();
    void referenceReady(const QString& id);
private:
    bool prepare();
    void open();
    void lookup();
    void connectionLost();
    void sendPending();
    void receive(const QJsonObject& message);
    void fail(const QString& error);
    nt::ai::GenerationTransport m_transport;
    QTimer m_referenceTimeout, m_recoveryPoll;
    QUrl m_server;
    QString m_token, m_referenceId, m_lookupId, m_assistId, m_generateError, m_assistError, m_proposal;
    QJsonObject m_referenceRequest, m_assistRequest;
    QStringList m_takes;
    bool m_explicit = false;
};
