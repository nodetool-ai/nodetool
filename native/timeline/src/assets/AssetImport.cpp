#include "assets/AssetImport.h"
#include <QFileInfo>
#include <QMimeDatabase>

namespace nt::assets {
ImportResult importFile(nt::server::ServerClient& client, const QString& file, const QJsonObject& fields) {
    const QFileInfo info(file);
    if (!info.isFile() || !info.isReadable()) { return {{}, "Cannot read " + file, {}, false}; }
    const auto contentType = QMimeDatabase().mimeTypeForFile(file).name();
    QJsonObject json{{"name", info.fileName()}, {"content_type", contentType}};
    for (const auto& key : {QStringLiteral("workflow_id"), QStringLiteral("parent_id"), QStringLiteral("project_id")}) {
        if (!fields.value(key).toString().isEmpty()) { json.insert(key, fields.value(key)); }
    }
    const auto uploaded = client.upload(json, file, contentType);
    if (!uploaded.ok()) { return {{}, uploaded.describe(), {}, false}; }
    ImportResult result;
    result.asset = uploaded.data.toObject();
    const auto id = result.asset.value("id").toString();
    if (id.isEmpty()) { result.error = "Upload response has no asset id"; return result; }
    if (result.asset.value("content_type").toString().startsWith("video/")) {
        const auto proxy = client.mutate("assets.ensureProxy", {{"id", id}});
        result.proxyAvailable = proxy.ok();
        if (!proxy.ok()) { result.proxyError = proxy.describe(); }
        const auto fresh = client.getAsset(id);
        if (fresh.ok()) { result.asset = fresh.data.toObject(); }
        else { result.proxyError = fresh.describe(); }
    }
    return result;
}
}
