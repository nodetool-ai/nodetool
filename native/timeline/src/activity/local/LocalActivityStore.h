#pragma once
#include <QHash>
#include <QJsonObject>
#include <QObject>
#include <QPointer>
#include <QSet>
#include <QVariantList>

namespace nt::activity {
QString localScope(const QJsonObject& document);
class LocalActivityStore : public QObject {
    Q_OBJECT
public:
    explicit LocalActivityStore(QString root, QObject* parent = nullptr);
    static LocalActivityStore& instance();
    QVariantList rows(const QString& scope);
    QString error() const { return m_error; }
    QString begin(const QString& scope, const QString& title, QObject* cancellationTarget, const QString& output = {});
    void progress(const QString& id, const QString& phase, double ratio);
    void finish(const QString& id, bool success, bool cancelled, const QString& error);
    bool cancel(const QString& id);
signals:
    void changed();
private:
    void load(const QString& scope);
    void save(const QString& scope);
    QString path(const QString& scope) const;
    QString m_root;
    QString m_error;
    QSet<QString> m_unreadableScopes;
    QHash<QString, QVariantList> m_rows;
    QHash<QString, QString> m_scopes;
    QHash<QString, QPointer<QObject>> m_targets;
};
}
