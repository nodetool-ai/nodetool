#include "ModelPickerController.h"
#include <QJsonDocument>
#include <QNetworkCookieJar>
#include <QNetworkReply>
#include <QUrlQuery>
namespace nodetool::node_editor {
ModelPickerController::ModelPickerController(QObject* parent) : QObject(parent), m_network(this) {}
void ModelPickerController::cancel() {
 ++m_epoch;
 m_pending = 0;
 for (auto* reply : m_network.findChildren<QNetworkReply*>()) { reply->abort(); }
}
QString ModelPickerController::identity() const {
 return m_origin.isEmpty() ? QString{} : m_origin.toString() + QChar(0x1f) + m_user;
}
void ModelPickerController::configure(const QUrl& origin, const QString& token, const QString& userId) {
 cancel();
 m_network.clearAccessCache();
 m_network.setCookieJar(new QNetworkCookieJar(&m_network));
 m_error.clear(); m_origin = QUrl{}; m_token.clear(); m_user.clear();
 const bool loopback = origin.host() == "localhost" || origin.host() == "127.0.0.1" || origin.host() == "::1";
 if (!origin.isEmpty() && ((origin.scheme() != "http" && origin.scheme() != "https") || origin.host().isEmpty() || !origin.userInfo().isEmpty() || origin.hasQuery() || origin.hasFragment() || (!origin.path().isEmpty() && origin.path() != "/") || (!token.isEmpty() && origin.scheme() == "http" && !loopback))) {
  m_error = tr("Connect using an HTTPS server origin, or local HTTP");
 } else if (!origin.isEmpty()) {
  m_origin = origin; m_token = token; m_user = userId;
 }
 for (auto* catalog : std::as_const(m_catalogs)) {
  catalog->setIdentity(identity());
  catalog->reload();
 }
 emit changed();
}
QObject* ModelPickerController::catalogFor(const QString& modelType, const QStringList& allowedProviders, const QStringList& tasks) {
 const auto key = QStringList{modelType, allowedProviders.join(','), tasks.join(',')}.join('|');
 if (auto* existing = m_catalogs.value(key)) { return existing; }
 auto* catalog = new nt::modelpicker::Catalog(this);
 const bool huggingFace = modelType.startsWith("hf.");
 catalog->setFilter(allowedProviders, tasks);
 if (huggingFace) { catalog->setHuggingFaceType(modelType); }
 catalog->setMode(huggingFace ? QStringLiteral("huggingface_model") : modelType);
 catalog->setIdentity(identity());
 catalog->setQuery([this](const QString& procedure, QJsonObject input, nt::modelpicker::Catalog::Completion done) {
  query(procedure, input, std::move(done));
 });
 m_catalogs.insert(key, catalog);
 return catalog;
}
void ModelPickerController::query(const QString& procedure, const QJsonObject& input, nt::modelpicker::Catalog::Completion done) {
 auto url = m_origin.resolved(QUrl("/trpc/" + procedure));
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
  const auto result = QJsonDocument::fromJson(reply->readAll()).object().value("result").toObject();
  if (reply->error() != QNetworkReply::NoError || status != 200 || !result.contains("data")) {
   done({}, tr("Could not load models (HTTP %1). Retry or check provider configuration.").arg(status));
  } else {
   done(result.value("data"), {});
  }
  emit changed();
 });
}
}
