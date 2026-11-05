#include "DocumentPickerController.h"
#include <QDesktopServices>
#include <QJsonArray>
#include <QJsonDocument>
#include <QJsonObject>
#include <QNetworkCookieJar>
#include <QUrlQuery>

namespace nodetool::node_editor {
namespace {
QString procedure(const QString& kind) {
    if (kind == "sketch" || kind == "timeline") { return kind; }
    if (kind == "script") { return "scripts"; }
    if (kind == "storyboard") { return "storyboards"; }
    return {};
}
}
DocumentPickerController::DocumentPickerController(QObject* parent) : QObject(parent), network_(this) {}
void DocumentPickerController::cancel(const QString& key) {
    epochs_.remove(key);
    const auto reply = replies_.take(key);
    if (reply) { reply->abort(); }
}
void DocumentPickerController::configure(const QUrl& origin, const QString& token, const QString& user) {
    for (const auto& key : epochs_.keys()) { cancel(key); }
    network_.clearAccessCache();
    network_.setCookieJar(new QNetworkCookieJar(&network_));
    origin_ = QUrl{};
    token_.clear();
    user_.clear();
    const bool local = origin.host() == "localhost" || origin.host() == "127.0.0.1" || origin.host() == "::1";
    if ((origin.scheme() == "http" || origin.scheme() == "https") && !origin.host().isEmpty() && origin.userInfo().isEmpty() && !origin.hasQuery() && !origin.hasFragment() && (origin.path().isEmpty() || origin.path() == "/") && (token.isEmpty() || origin.scheme() == "https" || local)) {
        origin_ = origin;
        token_ = token;
        user_ = user;
    }
    emit cleared();
}
void DocumentPickerController::load(const QString& key, const QString& kind) {
    request(key, kind);
}
void DocumentPickerController::request(const QString& key, const QString& kind) {
    cancel(key);
    if (key.isEmpty() || origin_.isEmpty() || procedure(kind).isEmpty()) {
        emit failed(key, tr("Connect to a server to choose a supported document."));
        return;
    }
    const auto epoch = ++nextEpoch_;
    epochs_.insert(key, epoch);
    auto url = origin_.resolved(QUrl("/trpc/" + procedure(kind) + ".list"));
    QUrlQuery query;
    query.addQueryItem("input", "{}");
    url.setQuery(query);
    QNetworkRequest request(url);
    request.setTransferTimeout(30000);
    request.setAttribute(QNetworkRequest::RedirectPolicyAttribute, QNetworkRequest::ManualRedirectPolicy);
    request.setHeader(QNetworkRequest::ContentTypeHeader, "application/json");
    if (!token_.isEmpty()) { request.setRawHeader("Authorization", "Bearer " + token_.toUtf8()); }
    request.setRawHeader("x-user-id", user_.toUtf8());
    auto* reply = network_.get(request);
    replies_.insert(key, reply);
    connect(reply, &QNetworkReply::readyRead, this, [reply] {
        if (reply->bytesAvailable() > 32 * 1024 * 1024) { reply->abort(); }
    });
    connect(reply, &QNetworkReply::finished, this, [this, reply, key, epoch] {
        reply->deleteLater();
        if (epochs_.value(key) != epoch) { return; }
        epochs_.remove(key);
        replies_.remove(key);
        const auto status = reply->attribute(QNetworkRequest::HttpStatusCodeAttribute).toInt();
        const auto data = QJsonDocument::fromJson(reply->readAll()).object().value("result").toObject().value("data");
        if (reply->error() != QNetworkReply::NoError || status != 200 || !data.isArray()) {
            emit failed(key, tr("Could not load document (HTTP %1). Retry after checking the server.").arg(status));
            return;
        }
        const auto rows = data.toArray();
        for (const auto& row : rows) {
            if (row.toObject().value("id").toString().isEmpty()) {
                emit failed(key, tr("Server returned an invalid document reference."));
                return;
            }
        }
        emit listed(key, rows.toVariantList());
    });
}
QUrl DocumentPickerController::targetUrl(const QString& kind, const QString& id) const {
    if (origin_.isEmpty() || procedure(kind).isEmpty() || id.isEmpty()) { return {}; }
    const QString prefix = kind == "script" || kind == "storyboard" ? "/studio/" : "/";
    return origin_.resolved(QUrl(prefix + kind + "/" + QString::fromLatin1(QUrl::toPercentEncoding(id))));
}
bool DocumentPickerController::open(const QString& kind, const QString& id) {
    const auto url = targetUrl(kind, id);
    return !url.isEmpty() && QDesktopServices::openUrl(url);
}
}
