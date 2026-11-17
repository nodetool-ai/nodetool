#include "StoryDocumentSource.h"
#include <QJsonDocument>
#include <QNetworkReply>
#include <QUrlQuery>

namespace nodetool::node_editor {
StoryDocumentSource::StoryDocumentSource(QString kind, QUrl origin, QString token, QString user, QObject *parent)
    : QObject(parent), network_(this), kind_(std::move(kind)), origin_(std::move(origin)), token_(std::move(token)), user_(std::move(user)) {}
QString StoryDocumentSource::name() const {
  return result_.toMap().value("name").toString();
}
bool StoryDocumentSource::load(const QString &id) {
  return !id.isEmpty() && call(kind_ + ".get", {{"id", id}}, false);
}
bool StoryDocumentSource::saveStoryboard(const QJsonObject &storyboard) {
  if (kind_ != "storyboards" || storyboard.value("updatedAt").toString().isEmpty()) { return false; }
  QJsonObject input{{"id", storyboard.value("id")}, {"document", storyboard.value("document")}, {"baseUpdatedAt", storyboard.value("updatedAt")}};
  if (!storyboard.value("name").toString().trimmed().isEmpty()) { input.insert("name", storyboard.value("name")); }
  return call("storyboards.update", input, true);
}
bool StoryDocumentSource::saveScript(const QJsonObject &script) {
  if (kind_ != "scripts" || script.value("updatedAt").toString().isEmpty()) { return false; }
  return call("scripts.update", {{"id", script.value("id")}, {"document", script.value("document")}, {"baseUpdatedAt", script.value("updatedAt")}}, true);
}
bool StoryDocumentSource::call(const QString &procedure, const QJsonObject &input, bool mutation) {
  if (busy_ || !origin_.isValid()) { return false; }
  auto url = origin_.resolved(QUrl("/trpc/" + procedure));
  const auto bytes = QJsonDocument(input).toJson(QJsonDocument::Compact);
  if (!mutation) {
    QUrlQuery query;
    query.addQueryItem("input", QString::fromUtf8(bytes));
    url.setQuery(query);
  }
  QNetworkRequest request(url);
  request.setTransferTimeout(30000);
  request.setAttribute(QNetworkRequest::RedirectPolicyAttribute, QNetworkRequest::ManualRedirectPolicy);
  request.setRawHeader("Authorization", "Bearer " + token_.toUtf8());
  request.setRawHeader("x-user-id", user_.toUtf8());
  request.setHeader(QNetworkRequest::ContentTypeHeader, "application/json");
  auto *reply = mutation ? network_.post(request, bytes) : network_.get(request);
  busy_ = true;
  error_.clear();
  emit changed();
  connect(reply, &QNetworkReply::readyRead, this, [reply] { if (reply->bytesAvailable() > 32 * 1024 * 1024) { reply->abort(); } });
  connect(reply, &QNetworkReply::finished, this, [this, reply] {
    reply->deleteLater();
    const auto envelope = QJsonDocument::fromJson(reply->readAll()).object();
    auto data = envelope["result"].toObject()["data"].toObject();
    if (data["json"].isObject()) { data = data["json"].toObject(); }
    busy_ = false;
    if (reply->error() != QNetworkReply::NoError || envelope.contains("error") || data.isEmpty()) {
      error_ = envelope["error"].toObject()["message"].toString(reply->errorString());
    } else {
      result_ = data.toVariantMap();
    }
    emit changed();
  });
  return true;
}
} // namespace nodetool::node_editor
