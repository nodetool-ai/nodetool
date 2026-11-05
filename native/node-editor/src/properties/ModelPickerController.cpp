#include "ModelPickerController.h"
#include <QJsonDocument>
#include <QJsonObject>
#include <QNetworkReply>
#include <QNetworkCookieJar>
#include <QUrlQuery>
namespace nodetool::node_editor {
ModelPickerController::ModelPickerController(QObject* parent) : QObject(parent), m_network(this) {}
QVariantList ModelPickerController::models() const { return m_models.toVariantList(); }
void ModelPickerController::cancel() {
 ++m_epoch;
 m_pending = 0;
 for (auto* reply : m_network.findChildren<QNetworkReply*>()) { reply->abort(); }
 emit changed();
}
void ModelPickerController::configure(const QUrl& origin, const QString& token, const QString& userId) {
 cancel();
 m_network.clearAccessCache();
 m_network.setCookieJar(new QNetworkCookieJar(&m_network));
 m_models = {}; m_error.clear(); m_origin = QUrl{}; m_token.clear(); m_user.clear();
 if (origin.isEmpty()) { emit changed(); return; }
 const bool loopback = origin.host() == "localhost" || origin.host() == "127.0.0.1" || origin.host() == "::1";
 if ((origin.scheme() != "http" && origin.scheme() != "https") || origin.host().isEmpty() || !origin.userInfo().isEmpty() || origin.hasQuery() || origin.hasFragment() || (!origin.path().isEmpty() && origin.path() != "/") || (!token.isEmpty() && origin.scheme() == "http" && !loopback)) {
  m_error = tr("Connect using an HTTPS server origin, or local HTTP"); emit changed(); return;
 }
 m_origin = origin; m_token = token; m_user = userId;
 refresh();
}
void ModelPickerController::query(const QString& procedure, const QJsonObject& input, std::function<void(QJsonArray)> done) {
 auto url = m_origin.resolved(QUrl("/trpc/models." + procedure));
 QUrlQuery parameters; parameters.addQueryItem("input", QString::fromUtf8(QJsonDocument(input).toJson(QJsonDocument::Compact))); url.setQuery(parameters);
 QNetworkRequest request(url);
 request.setTransferTimeout(30000);
 request.setAttribute(QNetworkRequest::RedirectPolicyAttribute, QNetworkRequest::ManualRedirectPolicy);
 if (!m_token.isEmpty()) { request.setRawHeader("Authorization", "Bearer " + m_token.toUtf8()); }
 request.setRawHeader("x-user-id", m_user.toUtf8());
 ++m_pending;
 auto* reply = m_network.get(request);
 const auto epoch = m_epoch;
 connect(reply, &QNetworkReply::readyRead, this, [reply] { if (reply->bytesAvailable() > 16 * 1024 * 1024) { reply->abort(); } });
 connect(reply, &QNetworkReply::finished, this, [this, reply, epoch, done = std::move(done)] {
  reply->deleteLater();
  if (epoch != m_epoch) { return; }
  --m_pending;
  const auto status = reply->attribute(QNetworkRequest::HttpStatusCodeAttribute).toInt();
  const auto response = QJsonDocument::fromJson(reply->readAll()).object();
  const auto data = response.value("result").toObject().value("data");
  if (reply->error() != QNetworkReply::NoError || status != 200 || !data.isArray()) {
   m_error = tr("Could not load models (HTTP %1). Retry or check provider configuration.").arg(status);
  } else { done(data.toArray()); }
  emit changed();
 });
}
void ModelPickerController::refresh() {
 cancel(); m_models = {}; m_error.clear();
 if (m_origin.isEmpty()) { m_error = tr("Connect to a server to select a model"); emit changed(); return; }
 query("providers", {}, [this](QJsonArray providers) {
  for (const auto& entry : providers) {
   const auto provider = entry.toObject();
   if (!provider.value("capabilities").toArray().contains("generate_message")) { continue; }
   const auto id = provider.value("provider").toString();
   if (id.isEmpty()) { continue; }
   query("llmByProvider", {{"provider", id}}, [this, id](QJsonArray models) {
    for (const auto& entry : models) {
     auto model = entry.toObject();
     if (model.value("id").toString().isEmpty()) { continue; }
     model.insert("provider", id); m_models.append(model);
    }
   });
  }
 });
 emit changed();
}
}
