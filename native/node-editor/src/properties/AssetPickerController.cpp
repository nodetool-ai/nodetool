#include "AssetPickerController.h"
#include <QFile>
#include <QFileInfo>
#include <QHttpMultiPart>
#include <QJsonArray>
#include <QJsonDocument>
#include <QJsonObject>
#include <QMimeDatabase>
#include <QNetworkCookieJar>
#include <QUrlQuery>
#include <memory>
namespace nodetool::node_editor {
AssetPickerController::AssetPickerController(QObject* parent) : QObject(parent), m_network(this) {}
void AssetPickerController::cancel(const QString& key) {
 m_serials.remove(key);
 const auto reply = m_replies.take(key);
 if (reply) { reply->abort(); }
}
quint64 AssetPickerController::begin(const QString& key) { cancel(key); const auto serial = ++m_next; m_serials.insert(key, serial); return serial; }
bool AssetPickerController::current(const QString& key, quint64 serial) const { return m_serials.value(key) == serial; }
void AssetPickerController::configure(const QUrl& origin, const QString& token, const QString& userId) {
 const auto keys = m_serials.keys();
 for (const auto& key : keys) { cancel(key); }
 m_network.clearAccessCache(); m_network.setCookieJar(new QNetworkCookieJar(&m_network));
 m_origin = QUrl{}; m_token.clear(); m_user.clear();
 const bool loopback = origin.host() == "localhost" || origin.host() == "127.0.0.1" || origin.host() == "::1";
 if ((origin.scheme() == "http" || origin.scheme() == "https") && !origin.host().isEmpty() && origin.userInfo().isEmpty() && !origin.hasQuery() && !origin.hasFragment() && (origin.path().isEmpty() || origin.path() == "/") && (token.isEmpty() || origin.scheme() == "https" || loopback)) {
  m_origin = origin; m_token = token; m_user = userId;
 }
 emit cleared();
}
bool AssetPickerController::ready(const QString& key, const QString& kind) {
    if (key.isEmpty() || (kind != "image" && kind != "audio" && kind != "video" && kind != "asset" && kind != "document")) {
        emit failed(key, tr("Choose a supported media type"));
        return false;
    }
 if (m_origin.isEmpty()) { emit failed(key, tr("Connect to a secure server to choose media")); return false; }
 return true;
}
QNetworkRequest AssetPickerController::request(const QUrl& url) const {
 QNetworkRequest result(url); result.setTransferTimeout(30000);
 result.setAttribute(QNetworkRequest::RedirectPolicyAttribute, QNetworkRequest::ManualRedirectPolicy);
 if (!m_token.isEmpty()) { result.setRawHeader("Authorization", "Bearer " + m_token.toUtf8()); }
 result.setRawHeader("x-user-id", m_user.toUtf8()); return result;
}
void AssetPickerController::search(const QString& key, const QString& kind, const QString& text, const QString& cursor) {
 const auto serial = begin(key);
 if (!ready(key, kind)) { return; }
 QJsonObject input{{"query", text}, {"page_size", 100}};
 if (kind != "asset") { input.insert("content_type", kind); }
 if (!cursor.isEmpty()) { input.insert("cursor", cursor); }
 auto url = m_origin.resolved(QUrl("/trpc/assets.search"));
 QUrlQuery parameters; parameters.addQueryItem("input", QString::fromUtf8(QJsonDocument(input).toJson(QJsonDocument::Compact))); url.setQuery(parameters);
 auto* reply = m_network.get(request(url)); m_replies.insert(key, reply);
 connect(reply, &QNetworkReply::readyRead, this, [reply] { if (reply->bytesAvailable() > 16 * 1024 * 1024) { reply->abort(); } });
 connect(reply, &QNetworkReply::finished, this, [this, reply, key, serial, kind] {
  reply->deleteLater(); if (!current(key, serial)) { return; } m_replies.remove(key); m_serials.remove(key);
  const auto status = reply->attribute(QNetworkRequest::HttpStatusCodeAttribute).toInt();
  const auto data = QJsonDocument::fromJson(reply->readAll()).object().value("result").toObject().value("data").toObject();
  if (reply->error() != QNetworkReply::NoError || status != 200 || !data.value("assets").isArray()) { emit failed(key, tr("Could not load assets (HTTP %1). Retry the search.").arg(status)); return; }
  QVariantList rows;
  for (const auto& entry : data.value("assets").toArray()) {
   const auto asset = entry.toObject();
        if (asset.value("id").toString().isEmpty() || ((kind == "asset" || kind == "document") ? asset.value("content_type").toString().isEmpty() || asset.value("content_type") == "folder" : !asset.value("content_type").toString().startsWith(kind + "/"))) {
            continue;
        }
   rows.append(asset.toVariantMap());
  }
  emit listed(key, rows, data.value("next_cursor").toString());
 });
}
void AssetPickerController::describe(const QString& key, const QString& id) {
    const auto serial = begin(key);
    if (!ready(key, "asset")) { return; }
    auto url = m_origin.resolved(QUrl("/trpc/assets.get"));
    QUrlQuery query;
    query.addQueryItem("input", QString::fromUtf8(QJsonDocument(QJsonObject{{"id", id}}).toJson(QJsonDocument::Compact)));
    url.setQuery(query);
    auto* reply = m_network.get(request(url));
    m_replies.insert(key, reply);
    connect(reply, &QNetworkReply::finished, this, [this, reply, key, serial] {
        reply->deleteLater();
        if (!current(key, serial)) { return; }
        m_replies.remove(key);
        m_serials.remove(key);
        auto asset = QJsonDocument::fromJson(reply->readAll()).object().value("result").toObject().value("data").toObject();
        if (!asset.value("thumb_url").toString().isEmpty()) {
            asset.insert("thumb_url", m_origin.resolved(QUrl(asset.value("thumb_url").toString())).toString());
        }
        if (reply->error() == QNetworkReply::NoError) { emit described(key, asset.toVariantMap()); }
    });
}
void AssetPickerController::upload(const QString& key, const QString& kind, const QUrl& url, const QString& workflowId) {
 const auto serial = begin(key);
 if (!ready(key, kind)) { return; }
 if (!url.isLocalFile()) { emit failed(key, tr("Choose a local file to upload")); return; }
 const auto mime = QMimeDatabase{}.mimeTypeForFile(url.toLocalFile()).name();
    if (kind != "asset" && kind != "document" && !mime.startsWith(kind + "/")) {
        emit failed(key, tr("Choose an %1 file").arg(kind));
        return;
    }
 auto multipart = std::make_unique<QHttpMultiPart>(QHttpMultiPart::FormDataType);
 auto* file = new QFile(url.toLocalFile(), multipart.get());
 if (!file->open(QIODevice::ReadOnly)) { emit failed(key, tr("Could not read the selected file")); return; }
 QHttpPart metadata; metadata.setHeader(QNetworkRequest::ContentDispositionHeader, "form-data; name=\"json\"");
 QJsonObject fields{{"name", QFileInfo(*file).fileName()}, {"content_type", mime}, {"parent_id", m_user}};
 if (!workflowId.isEmpty()) { fields.insert("workflow_id", workflowId); }
 metadata.setBody(QJsonDocument(fields).toJson(QJsonDocument::Compact));
 multipart->append(metadata);
 QHttpPart data; data.setHeader(QNetworkRequest::ContentTypeHeader, mime);
 // The user filename is metadata. A fixed multipart filename avoids header injection.
 data.setHeader(QNetworkRequest::ContentDispositionHeader, "form-data; name=\"file\"; filename=\"upload\""); data.setBodyDevice(file); multipart->append(data);
 auto* reply = m_network.post(request(m_origin.resolved(QUrl("/api/assets"))), multipart.get());
 multipart.release()->setParent(reply); m_replies.insert(key, reply);
 connect(reply, &QNetworkReply::uploadProgress, this, [this, key, serial](qint64 sent, qint64 total) { if (current(key, serial)) { emit progress(key, sent, total); } });
 connect(reply, &QNetworkReply::readyRead, this, [reply] { if (reply->bytesAvailable() > 1024 * 1024) { reply->abort(); } });
 connect(reply, &QNetworkReply::finished, this, [this, reply, key, serial, kind] {
  reply->deleteLater(); if (!current(key, serial)) { return; } m_replies.remove(key); m_serials.remove(key);
  const auto status = reply->attribute(QNetworkRequest::HttpStatusCodeAttribute).toInt();
  const auto asset = QJsonDocument::fromJson(reply->readAll()).object();
  const auto id = asset.value("id").toString();
    if (reply->error() != QNetworkReply::NoError || status < 200 || status >= 300 || id.isEmpty() || ((kind == "asset" || kind == "document") ? asset.value("content_type").toString().isEmpty() || asset.value("content_type") == "folder" : !asset.value("content_type").toString().startsWith(kind + "/"))) {
        emit failed(key, tr("Upload failed (HTTP %1). Choose the file again to retry.").arg(status));
        return;
    }
  emit uploaded(key, {{"type", kind}, {"asset_id", id}, {"uri", "asset://" + id}});
 });
}
}
