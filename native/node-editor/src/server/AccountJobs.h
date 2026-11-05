#pragma once
#include <QObject>
#include <QJsonArray>
#include <QNetworkAccessManager>
#include <QSharedPointer>
#include <QSet>
#include <functional>

namespace nodetool::node_editor {
// One authenticated query cache shared by every tab using these credentials.
class AccountJobs final : public QObject {
    Q_OBJECT
public:
    static QSharedPointer<AccountJobs> acquire(const QUrl &base, const QString &token, const QString &user);
    AccountJobs(QUrl base, QString token);
    QJsonArray rows() const { return m_rows; }
    void refresh(bool staleOnly = false);
    void cancel(const QString &id);
    bool stopping(const QString &id) const { return m_stopping.contains(id); }
signals:
    void changed();
    void cancelled(QString id, QString status);
    void errorOccurred(QString message);
private:
    void request(const QString &procedure, const QJsonObject &input, bool mutation,
                 std::function<void(QJsonObject, QString)> callback);
    QNetworkAccessManager m_network;
    QUrl m_base;
    QString m_token;
    QJsonArray m_rows;
    QSet<QString> m_stopping;
    qint64 m_updated = 0;
    bool m_loading = false;
    bool m_again = false;
};
}
