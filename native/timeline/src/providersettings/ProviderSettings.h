#pragma once
#include "server/ServerSource.h"
#include <QObject>
#include <QJsonArray>
#include <QTimer>
#include <QVariantList>
#include <QtQmlIntegration/qqmlintegration.h>
#include <functional>

class ProviderSettings : public QObject {
    Q_OBJECT
    QML_ELEMENT
    Q_PROPERTY(QVariantList fields READ fields NOTIFY fieldsChanged)
    Q_PROPERTY(QVariantList providers READ providers NOTIFY fieldsChanged)
    Q_PROPERTY(QStringList groups READ groups NOTIFY fieldsChanged)
    Q_PROPERTY(QString selectedGroup READ selectedGroup NOTIFY fieldsChanged)
    Q_PROPERTY(bool busy READ busy NOTIFY changed)
    Q_PROPERTY(bool dirty READ dirty NOTIFY changed)
    Q_PROPERTY(QString message READ message NOTIFY changed)
    Q_PROPERTY(QString testMessage READ testMessage NOTIFY changed)
public:
    using Call = std::function<nt::server::QueryResult(bool, const QString&, const QJsonObject&)>;
    explicit ProviderSettings(QObject* parent = nullptr);
    QVariantList fields() const;
    QVariantList providers() const { return m_providers; }
    QStringList groups() const { return m_groups; }
    QString selectedGroup() const { return m_group; }
    bool busy() const { return m_busy; }
    bool dirty() const { return !m_drafts.isEmpty(); }
    QString message() const { return m_message; }
    QString testMessage() const { return m_testMessage; }
    Q_INVOKABLE void reload();
    Q_INVOKABLE void draft(const QString& key, const QString& value);
    Q_INVOKABLE void selectGroup(const QString& group);
    Q_INVOKABLE void save();
    Q_INVOKABLE void remove(const QString& key);
    Q_INVOKABLE void test(const QString& key);
    Q_INVOKABLE void checkModels();
    Q_INVOKABLE void discard();
    // Dependency injection uses the same operation/input boundary as ServerClient.
    void setCallForTest(Call call) { m_call = std::move(call); }
    void setTargetForTest(const nt::server::SaveTarget& target);
signals:
    void changed();
    void fieldsChanged();
    void draftsCleared();
private:
    using Completion = std::function<void(const nt::server::QueryResult&)>;
    void request(bool write, const QString& procedure, const QJsonObject& input, Completion done);
    bool syncContext();
    std::optional<nt::server::SaveTarget> currentTarget() const;
    QJsonObject definition(const QString& key) const;
    std::optional<nt::server::SaveTarget> m_target, m_testTarget;
    Call m_call;
    QTimer m_contextTimer;
    quint64 m_epoch = 0;
    bool m_busy = false;
    QJsonArray m_settings;
    QJsonObject m_secrets;
    QMap<QString, QStringList> m_groupKeys;
    QMap<QString, QString> m_providerIds;
    QMap<QString, QString> m_drafts;
    QVariantList m_providers;
    QStringList m_groups;
    QString m_group, m_message, m_testMessage;
};
