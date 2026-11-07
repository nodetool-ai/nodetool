#include "SetupController.h"
#include <QJsonDocument>
#include <QNetworkReply>
#include <QUrlQuery>
namespace nodetool::node_editor {
void SetupController::configure(const QUrl &origin, const QString &token,
                                const QString &user) {
    ++identityEpoch_;
    firstWorkflowEligible_ = false;
    ++epoch_;
    origin_ = origin;
    token_ = token;
    user_ = user;
    packs_ = {};
    templates_ = {};
    statuses_ = {};
    last_.clear();
    state_.clear();
    error_.clear();
    emit changed();
    if (!origin.isEmpty()) {
        refresh();
        request(
            "workflows.list", {{"limit", 1}}, false,
            [this](const QJsonObject &data) {
                if (data["workflows"].isArray()) {
                    firstWorkflowEligible_ =
                        data["workflows"].toArray().isEmpty();
                }
            },
            true);
    }
}
void SetupController::request(const QString &route, const QJsonObject &body,
                              bool mutation,
                              std::function<void(QJsonObject)> done,
                              bool identityOnly) {
    if (origin_.isEmpty()) {
        state_ = "failed";
        error_ = tr("Connect to a server to check dependencies.");
        emit changed();
        return;
    }
    auto url = origin_;
    url.setPath("/trpc/" + (route.contains('.') ? route : "packs." + route));
    if (!mutation) {
        QUrlQuery query;
        query.addQueryItem(
            "input", QString::fromUtf8(
                         QJsonDocument(body).toJson(QJsonDocument::Compact)));
        url.setQuery(query);
    }
    QNetworkRequest request(url);
    request.setHeader(QNetworkRequest::ContentTypeHeader, "application/json");
    if (!token_.isEmpty()) {
        request.setRawHeader("Authorization", "Bearer " + token_.toUtf8());
    }
    request.setRawHeader("X-User-Id", user_.toUtf8());
    auto reply = mutation ? network_.post(request, QJsonDocument(body).toJson(
                                                       QJsonDocument::Compact))
                          : network_.get(request);
    const auto epoch = identityOnly ? identityEpoch_ : epoch_;
    connect(reply, &QNetworkReply::finished, this,
            [this, reply, epoch, done, identityOnly] {
                reply->deleteLater();
                if (epoch != (identityOnly ? identityEpoch_ : epoch_)) {
                    return;
                }
                const auto response =
                    QJsonDocument::fromJson(reply->readAll()).object();
                if (reply->error() != QNetworkReply::NoError ||
                    response.contains("error")) {
                    if (identityOnly) {
                        return;
                    }
                    state_ = "failed";
                    error_ = tr("Could not update dependencies. Check the "
                                "server connection and retry.");
                    emit changed();
                    return;
                }
                done(response["result"].toObject()["data"].toObject());
                emit changed();
            });
}
void SetupController::refresh() {
    ++epoch_;
    last_.clear();
    state_ = "loading";
    error_.clear();
    emit changed();
    request("runtimeStatuses", {}, false, [this](const QJsonObject &data) {
        statuses_ = {};
        for (auto value : data["statuses"].toArray()) {
            const auto item = value.toObject();
            statuses_[item["id"].toString()] = item["installed"];
        }
        request("listBuiltins", {}, false, [this](const QJsonObject &data) {
            packs_ = data["packs"].toArray();
            state_ = "ready";
        });
    });
}
void SetupController::enable(const QString &id) {
    if (state_ == "installing") {
        return;
    }
    bool allowed = false;
    for (auto value : packs_) {
        const auto pack = value.toObject();
        if (pack["id"] == id && !pack["enabled"].toBool()) {
            allowed = true;
        }
    }
    if (!allowed) {
        return;
    }
    ++epoch_;
    last_ = id;
    state_ = "installing";
    error_.clear();
    emit changed();
    request("setBuiltinEnabled", {{"id", id}, {"enabled", true}}, true,
            [this](const QJsonObject &data) {
                packs_ = data["packs"].toArray();
                state_ = "installed";
                emit registryRefreshRequested();
            });
}
void SetupController::cancel() {
    ++epoch_;
    state_ = "cancelled";
    error_ = tr("Stopped waiting. A pack operation already accepted by the "
                "server may still finish. Refresh to check its status.");
    emit changed();
}
} // namespace nodetool::node_editor

void nodetool::node_editor::SetupController::browseTemplates() {
    ++epoch_;
    last_.clear();
    state_ = "loading";
    error_.clear();
    emit changed();
    request("workflows.examples", {}, false, [this](const QJsonObject &data) {
        templates_ = data["workflows"].toArray();
        state_ = "templates";
    });
}
void nodetool::node_editor::SetupController::chooseTemplate(int index) {
    if (index < 0 || index >= templates_.size()) {
        return;
    }
    const auto item = templates_[index].toObject();
    ++epoch_;
    state_ = "loading";
    emit changed();
    const auto id = item["id"].toString();
    const auto seed = id.endsWith(".json", Qt::CaseInsensitive)
                          ? id.left(id.size() - 5)
                          : item["name"].toString();
    QJsonObject body{{"name", item["name"]},
                     {"access", "private"},
                     {"graph", QJsonObject{{"nodes", QJsonArray{}},
                                           {"edges", QJsonArray{}}}},
                     {"from_example_name", seed}};
    body["from_example_package"] = item["package_name"].isString()
                                       ? item["package_name"]
                                       : QJsonValue("nodetool-base");
    request(
        "workflows.create", body, true,
        [this](const QJsonObject &workflow) { emit templateChosen(workflow); });
}
