#pragma once
#include <QObject>
#include <QJsonArray>
#include <QNetworkAccessManager>
#include <QSharedPointer>
#include <QHash>
#include <QSet>
#include <functional>

namespace nodetool::node_editor {
// One authenticated query cache shared by every tab using these credentials:
// the account's recent jobs and the outputs of each completed one.
//
// UI thread only.
class AccountJobs final : public QObject {
    Q_OBJECT
public:
    static QSharedPointer<AccountJobs> acquire(const QUrl &base, const QString &token, const QString &user);
    AccountJobs(QUrl base, QString token);
    QJsonArray rows() const { return m_rows; }
    void refresh(bool staleOnly = false);
    void cancel(const QString &id);
    bool stopping(const QString &id) const { return m_stopping.contains(id); }
    // The assets a completed job saved ({id, name, content_type, get_url,
    // thumb_url}), as the web JobItem's useJobAssets lists them. Empty until
    // loaded.
    QJsonArray outputs(const QString &id) const { return m_outputs.value(id); }
    // Why the last jobs.list failed, or empty after a successful one.
    QString error() const { return m_error; }
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
    void loadOutputs();
    QJsonArray m_rows;
    // A completed job's outputs do not change, so each job is listed once.
    QHash<QString, QJsonArray> m_outputs;
    QSet<QString> m_outputsRequested;
    QString m_error;
    QSet<QString> m_stopping;
    qint64 m_updated = 0;
    bool m_loading = false;
    bool m_again = false;
};
}
