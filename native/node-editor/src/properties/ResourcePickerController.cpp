#include "ResourcePickerController.h"
#include <QJsonArray>
#include <QJsonDocument>
#include <QJsonObject>
#include <QNetworkCookieJar>
#include <QUrlQuery>
#include <QSet>
#include <QHttpMultiPart>
#include <memory>
namespace nodetool::node_editor {
ResourcePickerController::ResourcePickerController(QObject* parent) : QObject(parent), m_network(this) {}
void ResourcePickerController::cancel(const QString& key) {
 m_serials.remove(key);
 const auto reply = m_replies.take(key);
 if (reply) { reply->abort(); }
}
void ResourcePickerController::configure(const QUrl& origin, const QString& token, const QString& userId) {
 const auto keys = m_serials.keys(); for (const auto& key : keys) { cancel(key); }
 m_network.clearAccessCache(); m_network.setCookieJar(new QNetworkCookieJar(&m_network));
 m_origin = QUrl{}; m_token.clear(); m_user.clear();
 const bool local = origin.host() == "localhost" || origin.host() == "127.0.0.1" || origin.host() == "::1";
 if ((origin.scheme() == "http" || origin.scheme() == "https") && !origin.host().isEmpty() && origin.userInfo().isEmpty() && !origin.hasQuery() && !origin.hasFragment() && (origin.path().isEmpty() || origin.path() == "/") && (token.isEmpty() || origin.scheme() == "https" || local)) {
  m_origin = origin; m_token = token; m_user = userId;
 }
 emit cleared();
}
void ResourcePickerController::query(const QString& key, const QString& procedure, const QJsonObject& input, std::function<void(QJsonObject, int)> done) {
 cancel(key);
 if (key.isEmpty() || m_origin.isEmpty()) { emit failed(key, tr("Connect to a secure server to choose a resource")); return; }
 const auto serial = ++m_next; m_serials.insert(key, serial);
 auto url = m_origin.resolved(QUrl("/trpc/" + procedure));
 QUrlQuery parameters; parameters.addQueryItem("input", QString::fromUtf8(QJsonDocument(input).toJson(QJsonDocument::Compact))); url.setQuery(parameters);
 QNetworkRequest request(url); request.setTransferTimeout(30000);
 request.setAttribute(QNetworkRequest::RedirectPolicyAttribute, QNetworkRequest::ManualRedirectPolicy);
 if (!m_token.isEmpty()) { request.setRawHeader("Authorization", "Bearer " + m_token.toUtf8()); }
 request.setRawHeader("x-user-id", m_user.toUtf8());
 auto* reply = m_network.get(request); m_replies.insert(key, reply);
 connect(reply, &QNetworkReply::readyRead, this, [reply] { if (reply->bytesAvailable() > 32 * 1024 * 1024) { reply->abort(); } });
 connect(reply, &QNetworkReply::finished, this, [this, reply, key, serial, done = std::move(done)] {
  reply->deleteLater(); if (m_serials.value(key) != serial) { return; }
  m_serials.remove(key); m_replies.remove(key);
  const auto status = reply->attribute(QNetworkRequest::HttpStatusCodeAttribute).toInt();
  // Missing and unauthorized targets are both unavailable to this caller.
  if (status == 404 || status == 403) { done({}, status); return; }
  const auto data = QJsonDocument::fromJson(reply->readAll()).object().value("result").toObject().value("data");
  if (reply->error() != QNetworkReply::NoError || status != 200 || (!data.isObject() && !data.isArray())) { emit failed(key, tr("Could not load resources (HTTP %1). Retry after checking the server.").arg(status)); return; }
  done(data.isArray() ? QJsonObject{{"models", data}} : data.toObject(), status);
 });
}
void ResourcePickerController::workflows(const QString& key, const QString& cursor) {
 QJsonObject input{{"limit", 100}}; if (!cursor.isEmpty()) { input.insert("cursor", cursor); }
 query(key, "workflows.list", input, [this, key, cursor](QJsonObject data, int status) {
  if (status != 200 || !data.value("workflows").isArray() || (!data.value("next").isNull() && !data.value("next").isString())) { emit failed(key, tr("Server returned an invalid workflow page")); return; }
  const auto next = data.value("next").toString();
  if (!cursor.isEmpty() && cursor == next) { emit failed(key, tr("Server repeated its workflow page cursor")); return; }
  QVariantList rows;
  for (const auto& entry : data.value("workflows").toArray()) {
   const auto row = entry.toObject();
   if (row.value("id").toString().isEmpty() || !row.value("name").isString()) { emit failed(key, tr("Server returned an invalid workflow row")); return; }
   rows.append(QVariantMap{{"id", row.value("id").toString()}, {"name", row.value("name").toString()}});
  }
  emit listed(key, rows, next);
 });
}
void ResourcePickerController::collections(const QString& key) {
 query(key, "collections.list", {}, [this, key](QJsonObject data, int status) {
  if (status != 200 || !data.value("collections").isArray()) { emit failed(key, tr("Server returned an invalid collection list")); return; }
  QVariantList rows;
  for (const auto& entry : data.value("collections").toArray()) {
   const auto row = entry.toObject();
   if (row.value("name").toString().isEmpty()) { emit failed(key, tr("Server returned an invalid collection name")); return; }
   rows.append(QVariantMap{{"name", row.value("name").toString()}, {"count", row.value("count").toVariant()}});
  }
  emit collectionsListed(key, rows);
 });
}
void ResourcePickerController::applications(const QString& key) {
 query(key, "applications.list", {}, [this, key](QJsonObject data, int status) {
  // query() wraps an array result as {"models": [...]}.
  if (status != 200 || !data.value("models").isArray()) { emit failed(key, tr("Server returned an invalid app list")); return; }
  QVariantList rows;
  for (const auto& entry : data.value("models").toArray()) {
   const auto row = entry.toObject();
   if (row.value("id").toString().isEmpty() || !row.value("name").isString()) { emit failed(key, tr("Server returned an invalid app row")); return; }
   rows.append(QVariantMap{{"id", row.value("id").toString()}, {"name", row.value("name").toString()}});
  }
  emit listed(key, rows, QString{});
 });
}
void ResourcePickerController::verifyWorkflow(const QString& key, const QString& id) {
 if (id.isEmpty()) { cancel(key); emit verified(key, id, false); return; }
 query(key, "workflows.get", {{"id", id}}, [this, key, id](QJsonObject data, int status) {
  if (status == 403 || status == 404) { emit verified(key, id, false); return; }
  if (data.value("id").toString().isEmpty()) { emit failed(key, tr("Server returned an invalid workflow reference")); return; }
  emit verified(key, id, true);
 });
}
void ResourcePickerController::remaining(const QString& key, const QString& kind, const QString& projectId) {
    QString procedure;
    QJsonObject input;
    QString field;
    if (kind == "font") {
        procedure = "fonts.list";
        field = "fonts";
    } else if (kind == "folder") {
        procedure = "assets.list";
        input = {{"content_type", "folder"}, {"project_id", projectId}};
        field = "assets";
    } else if (kind == "entity" || kind == "entity_list") {
        procedure = "assets.search";
        input = {{"query", ""}, {"page_size", 1000}, {"project_id", projectId}};
        field = "assets";
    } else {
        emit failed(key, tr("Unsupported resource picker"));
        return;
    }
    query(key, procedure, input, [this, key, kind, field](QJsonObject data, int status) {
        if (status != 200 || !data.value(field).isArray()) {
            emit failed(key, tr("Server returned an invalid resource list"));
            return;
        }
        QVariantList rows;
        for (const auto& entry : data.value(field).toArray()) {
            auto row = entry.toObject();
            if (kind == "entity" || kind == "entity_list") {
                const auto asset = row;
                row = asset.value("metadata").toObject().value("nodetool_entity").toObject();
                const QSet<QString> kinds{"character", "location", "style", "prop"};
                if (!kinds.contains(row.value("kind").toString())) {
                    continue;
                }
                row.insert("type", "entity");
                row.insert("id", asset.value("id"));
                row.insert("project_id", asset.value("project_id").toString("default"));
                row.insert("created_at", asset.value("created_at"));
                const auto referenceId = row.value("reference_asset_id").toString(asset.value("id").toString());
                row.insert("reference_images", QJsonArray{QJsonObject{{"type", "image"}, {"asset_id", referenceId}, {"uri", "asset://" + referenceId}}});
                row.remove("reference_asset_id");
                for (const auto& nullable : {"voice_id", "lora", "palette"}) {
                    if (!row.contains(nullable)) {
                        row.insert(nullable, QJsonValue::Null);
                    }
                }
            }
            if (!row.value("name").isString() || (kind != "font" && row.value("id").toString().isEmpty())) {
                emit failed(key, tr("Server returned an invalid resource row"));
                return;
            }
            rows.append(row.toVariantMap());
        }
        emit remainingListed(key, rows);
    });
}

void ResourcePickerController::mediaConstraints(const QString& key, bool video, const QString& provider, const QString& id) {
    query(key, video ? "models.videoByProvider" : "models.imageByProvider", {{"provider", provider}}, [this, key, id](QJsonObject data, int) {
        for (const auto& entry : data.value("models").toArray()) {
            const auto row = entry.toObject();
            if (row.value("id") == id) {
                emit constraintsListed(key, row.toVariantMap());
                return;
            }
        }
        emit constraintsListed(key, {});
    });
}

void ResourcePickerController::createFolder(const QString& key, const QString& parentId, const QString& name) {
    cancel(key);
    if (m_origin.isEmpty() || key.isEmpty() || name.trimmed().isEmpty()) {
        emit failed(key, tr("Connect to a server and enter a folder name"));
        return;
    }
    const auto serial = ++m_next;
    m_serials.insert(key, serial);
    auto multipart = std::make_unique<QHttpMultiPart>(QHttpMultiPart::FormDataType);
    QHttpPart metadata;
    metadata.setHeader(QNetworkRequest::ContentDispositionHeader, "form-data; name=\"json\"");
    metadata.setBody(QJsonDocument(QJsonObject{{"parent_id", parentId}, {"content_type", "folder"}, {"name", name}}).toJson(QJsonDocument::Compact));
    multipart->append(metadata);
    QNetworkRequest request(m_origin.resolved(QUrl("/api/assets/")));
    request.setTransferTimeout(30000);
    request.setAttribute(QNetworkRequest::RedirectPolicyAttribute, QNetworkRequest::ManualRedirectPolicy);
    request.setRawHeader("x-user-id", m_user.toUtf8());
    if (!m_token.isEmpty()) {
        request.setRawHeader("Authorization", "Bearer " + m_token.toUtf8());
    }
    auto* reply = m_network.post(request, multipart.get());
    multipart.release()->setParent(reply);
    m_replies.insert(key, reply);
    connect(reply, &QNetworkReply::finished, this, [this, key, serial, reply] {
        reply->deleteLater();
        if (m_serials.value(key) != serial) {
            return;
        }
        m_serials.remove(key);
        m_replies.remove(key);
        const auto data = QJsonDocument::fromJson(reply->readAll()).object();
        if (reply->error() != QNetworkReply::NoError || data.value("id").toString().isEmpty()) {
            emit failed(key, tr("Could not create folder. Check the server and retry."));
            return;
        }
        emit folderCreated(key);
    });
}

void ResourcePickerController::verifyAsset(const QString& key, const QString& id) {
    query(key, "assets.get", {{"id", id}}, [this, key, id](QJsonObject data, int status) {
        emit verified(key, id, status == 200 && data.value("id") == id);
    });
}

}
