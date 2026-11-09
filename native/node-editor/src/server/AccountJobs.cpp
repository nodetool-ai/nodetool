#include "AccountJobs.h"
#include <QDateTime>
#include <QJsonDocument>
#include <QJsonObject>
#include <QNetworkReply>
#include <QUrlQuery>
#include <utility>

namespace nodetool::node_editor {
QSharedPointer<AccountJobs> AccountJobs::acquire(const QUrl &base, const QString &token, const QString &user) {
    // native-rules #14: function-static mutable cache of AccountJobs, shared across tabs
    static QHash<QString, QWeakPointer<AccountJobs>> caches;
    for (auto it = caches.begin(); it != caches.end();) {
        if (it.value().isNull()) {
            it = caches.erase(it);
        } else {
            ++it;
        }
    }
    const auto key = base.toString() + '\n' + user + '\n' + token;
    auto cache = caches.value(key).toStrongRef();
    if (!cache) {
        cache = QSharedPointer<AccountJobs>::create(base, token);
        caches.insert(key, cache.toWeakRef());
    }
    return cache;
}
AccountJobs::AccountJobs(QUrl base, QString token)
    : m_network(this), m_base(std::move(base)), m_token(std::move(token)) {}

void AccountJobs::request(const QString &procedure, const QJsonObject &input, bool mutation,
                          std::function<void(QJsonObject, QString)> callback) {
    auto url = m_base.resolved(QUrl("/trpc/" + procedure));
    const auto bytes = QJsonDocument(input).toJson(QJsonDocument::Compact);
    if (!mutation) {
        QUrlQuery query;
        query.addQueryItem("input", QString::fromUtf8(bytes));
        url.setQuery(query);
    }
    QNetworkRequest request(url);
    request.setTransferTimeout(30000);
    request.setAttribute(QNetworkRequest::RedirectPolicyAttribute, QNetworkRequest::ManualRedirectPolicy);
    request.setRawHeader("Authorization", "Bearer " + m_token.toUtf8());
    request.setHeader(QNetworkRequest::ContentTypeHeader, "application/json");
    auto reply = mutation ? m_network.post(request, bytes) : m_network.get(request);
    connect(reply, &QNetworkReply::finished, this, [reply, callback = std::move(callback)] {
        const auto bytes = reply->readAll();
        const auto envelope = QJsonDocument::fromJson(bytes).object();
        auto data = envelope["result"].toObject()["data"].toObject();
        if (data["json"].isObject()) {
            data = data["json"].toObject();
        }
        QString error;
        if (reply->error() != QNetworkReply::NoError || envelope.contains("error") || !envelope.contains("result") || bytes.size() > 32 * 1024 * 1024) {
            error = envelope["error"].toObject()["message"].toString(reply->errorString());
        }
        reply->deleteLater();
        callback(data, error);
    });
}
void AccountJobs::refresh(bool staleOnly) {
    if (staleOnly && m_updated > 0 && QDateTime::currentMSecsSinceEpoch() - m_updated < 10000) {
        return;
    }
    if (m_loading) {
        m_again |= !staleOnly;
        return;
    }
    m_loading = true;
    request("jobs.list", {{"limit", 20}}, false, [this](QJsonObject data, QString error) {
        m_loading = false;
        if (error.isEmpty()) {
            m_rows = data["jobs"].toArray();
            m_updated = QDateTime::currentMSecsSinceEpoch();
            emit changed();
            QSet<QString> workflows;
            for (const auto &entry : m_rows) {
                const auto row = entry.toObject();
                if (row["name"].toString().isEmpty()) {
                    workflows.insert(row["workflow_id"].toString());
                }
            }
            for (const auto &id : workflows) {
                request("workflows.get", {{"id", id}}, false, [this, id](QJsonObject workflow, QString error) {
                    if (!error.isEmpty()) {
                        return;
                    }
                    for (qsizetype i = 0; i < m_rows.size(); ++i) {
                        auto row = m_rows[i].toObject();
                        if (row["workflow_id"] == id && row["name"].toString().isEmpty()) {
                            row["name"] = workflow["name"].toString("Untitled");
                            m_rows[i] = row;
                        }
                    }
                    emit changed();
                });
            }
        }
        if (std::exchange(m_again, false)) {
            refresh();
        }
    });
}
void AccountJobs::cancel(const QString &id) {
    if (m_stopping.contains(id)) {
        return;
    }
    m_stopping.insert(id);
    emit changed();
    request("jobs.cancel", {{"id", id}}, true, [this, id](QJsonObject data, QString error) {
        m_stopping.remove(id);
        if (!error.isEmpty()) {
            emit errorOccurred("Could not cancel job: " + error);
        } else {
            emit cancelled(id, data["status"].toString());
            for (qsizetype i = 0; i < m_rows.size(); ++i) {
                auto row = m_rows[i].toObject();
                if (row["id"] == id) {
                    row["status"] = data["status"];
                    m_rows[i] = row;
                }
            }
        }
        emit changed();
        refresh();
    });
}
}
