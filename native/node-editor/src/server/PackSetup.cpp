#include "PackSetup.h"
#include <QJsonDocument>
#include <QJsonObject>
#include <QNetworkReply>
#include <QUrlQuery>
#include <QSettings>
#include <QDesktopServices>

namespace nodetool::node_editor {
namespace {
#include "PackMapping.inc"
QString keyFor(const QString &id) {
    for (const auto &mapping : mappings) {
        if (id == QLatin1String(mapping.id)) {
            return QLatin1String(mapping.key);
        }
    }
    return {};
}
}
PackSetup::PackSetup(QObject *parent) : QObject(parent) {
    enabledCategories_ = QSettings().value("catalog/optionalCategories").toStringList();
    showNodesWithoutKey_ = QSettings().value("catalog/showNodesWithoutKey", false).toBool();
    secretTimer_.setInterval(30000);
    connect(&secretTimer_, &QTimer::timeout, this, &PackSetup::refreshSecrets);
}
QVariantList PackSetup::packs() const {
    QVariantList result;
    for (const auto &value : packs_) {
        auto pack = value.toObject().toVariantMap();
        const auto id = pack["id"].toString();
        const auto key = keyFor(id);
        pack["requiredKey"] = key;
        pack["pending"] = pending_.contains(id);
        bool configured = false;
        for (const auto &secret : secrets_) {
            const auto row = secret.toObject();
            configured |= row["key"] == key && row["is_configured"].toBool();
        }
        pack["keySet"] = configured;
        result.append(pack);
    }
    return result;
}
void PackSetup::configure(const QUrl &origin, const QString &token, const QString &user) {
    if (origin_ == origin && token_ == token && user_ == user) {
        return;
    }
    ++epoch_;
    origin_ = origin;
    token_ = token;
    user_ = user;
    packs_ = {};
    secrets_ = {};
    secretsLoaded_ = false;
    pending_.clear();
    error_.clear();
    secretTimer_.stop();
    emit changed();
    if (!origin_.isEmpty()) {
        refresh();
        refreshSecrets();
        secretTimer_.start();
    }
}
void PackSetup::request(const QString &route, const QJsonObject &body, bool mutation,
                        std::function<void(QJsonObject)> done) {
    if (origin_.isEmpty()) {
        return;
    }
    auto url = origin_;
    url.setPath("/trpc/" + route);
    if (!mutation) {
        QUrlQuery query;
        query.addQueryItem("input", QString::fromUtf8(QJsonDocument(body).toJson(QJsonDocument::Compact)));
        url.setQuery(query);
    }
    QNetworkRequest request(url);
    request.setHeader(QNetworkRequest::ContentTypeHeader, "application/json");
    request.setRawHeader("Authorization", "Bearer " + token_.toUtf8());
    request.setRawHeader("X-User-Id", user_.toUtf8());
    auto *reply = mutation ? network_.post(request, QJsonDocument(body).toJson(QJsonDocument::Compact)) : network_.get(request);
    const auto epoch = epoch_;
    connect(reply, &QNetworkReply::finished, this, [this, reply, epoch, body, mutation, done] {
        reply->deleteLater();
        if (epoch != epoch_) {
            return;
        }
        if (mutation) {
            pending_.remove(body["id"].toString());
        }
        const auto response = QJsonDocument::fromJson(reply->readAll()).object();
        if (reply->error() != QNetworkReply::NoError || response.contains("error")) {
            error_ = tr("Could not update packs. Check the server connection and permissions, then retry.");
            emit changed();
            return;
        }
        done(response["result"].toObject()["data"].toObject());
        emit changed();
    });
}
QStringList PackSetup::configuredKeys() const {
    QStringList keys;
    for (const auto &secret : secrets_) {
        const auto row = secret.toObject();
        if (row["is_configured"].toBool()) {
            keys.append(row["key"].toString());
        }
    }
    return keys;
}
QStringList PackSetup::secretKeys() const {
    QStringList keys;
    for (const auto &secret : secrets_) { keys.append(secret.toObject()["key"].toString()); }
    return keys;
}
void PackSetup::setShowNodesWithoutKey(bool show) {
    if (showNodesWithoutKey_ == show) {
        return;
    }
    showNodesWithoutKey_ = show;
    QSettings().setValue("catalog/showNodesWithoutKey", show);
    emit changed();
}
void PackSetup::openProviderSettings() {
    if (!origin_.isEmpty()) {
        QDesktopServices::openUrl(origin_.resolved(QUrl("/settings?tab=1")));
    }
}
void PackSetup::refresh() {
    request("packs.listBuiltins", {}, false, [this](const QJsonObject &data) {
        packs_ = data["packs"].toArray();
        sync();
    });
}
void PackSetup::refreshSecrets() {
    request("settings.secrets.list", {}, false, [this](const QJsonObject &data) {
        const auto secrets = data["secrets"].toArray();
        secretsLoaded_ = true;
        if (secrets_ != secrets) {
            secrets_ = secrets;
            sync();
        }
    });
}
void PackSetup::setNodeTypes(const QStringList &types) {
    if (nodeTypes_ == types) {
        return;
    }
    nodeTypes_ = types;
    sync();
}
void PackSetup::sync() {
    QSet<QString> used;
    for (const auto &type : nodeTypes_) {
        const auto head = type.section('.', 0, 0);
        for (const auto &mapping : mappings) {
            if (!mapping.required && mapping.namespaces.contains(head)) {
                used.insert(QLatin1String(mapping.id));
                break;
            }
        }
    }
    for (const auto &value : packs()) {
        const auto pack = value.toMap();
        if (!pack["required"].toBool() && !pack["enabled"].toBool()
            && (pack["keySet"].toBool() || used.contains(pack["id"].toString()))) {
            setEnabled(pack["id"].toString(), true);
        }
    }
}
void PackSetup::setEnabled(const QString &id, bool enabled) {
    if (pending_.contains(id)) {
        return;
    }
    bool allowed = false;
    for (const auto &value : packs_) {
        const auto pack = value.toObject();
        allowed |= pack["id"] == id && !pack["required"].toBool() && pack["enabled"].toBool() != enabled;
    }
    if (!allowed) {
        return;
    }
    pending_.insert(id);
    error_.clear();
    emit changed();
    request("packs.setBuiltinEnabled", {{"id", id}, {"enabled", enabled}}, true, [this](const QJsonObject &data) {
        packs_ = data["packs"].toArray();
        emit registryRefreshRequested();
        sync();
    });
}
}

namespace nodetool::node_editor {
namespace {
// Port of web/src/config/optionalNodePacks.ts. Visibility never changes registration.
const QJsonArray categoryCatalog = QJsonDocument::fromJson(R"categories([{"id": "documents", "label": "Documents", "description": "Rasterize a PDF.", "namespaces": ["lib.pdf"]}, {"id": "imaging", "label": "Image & graphics", "description": "Pixel-level image processing — filters, effects, masks, warps — plus SVG and charts.", "namespaces": ["lib.image", "lib.svg", "lib.charts"]}, {"id": "audio_dsp", "label": "Audio processing", "description": "Low-level audio analysis and signal-processing utilities.", "namespaces": ["lib.audio"]}, {"id": "web", "label": "Web & scraping", "description": "Headless browser and media download.", "namespaces": ["lib.browser", "lib.video.download"]}, {"id": "data_stores", "label": "Files, Cloud & Databases", "description": "Local filesystem and SQLite.", "namespaces": ["lib.os", "lib.sqlite"]}, {"id": "integrations", "label": "Integrations & messaging", "description": "Discord / Telegram message triggers.", "namespaces": ["messaging"]}, {"id": "text_data", "label": "Text & data utilities", "description": "Image grid slicing.", "namespaces": ["lib.grid"]}, {"id": "developer", "label": "Developer tools", "description": "Run code, ComfyUI, and internal test nodes.", "namespaces": ["nodetool.code", "lib.comfy", "nodetool.test"]}])categories").array();
}
QVariantList PackSetup::categories() const {
    const auto &enabled = enabledCategories_;
    QVariantList result;
    for (const auto &value : categoryCatalog) {
        auto row = value.toObject().toVariantMap();
        row["enabled"] = enabled.contains(row["id"].toString());
        result.append(row);
    }
    return result;
}
void PackSetup::setCategory(const QString &id, bool enabled) {
    auto ids = enabledCategories_;
    ids.removeAll(id);
    if (enabled) {
        ids.append(id);
    }
    enabledCategories_ = ids;
    QSettings().setValue("catalog/optionalCategories", ids);
    emit changed();
}
void PackSetup::setAllCategories(bool enabled) {
    QStringList ids;
    if (enabled) {
        for (const auto &value : categoryCatalog) {
            ids.append(value.toObject()["id"].toString());
        }
    }
    enabledCategories_ = ids;
    QSettings().setValue("catalog/optionalCategories", ids);
    emit changed();
}
bool PackSetup::namespaceVisible(const QString &name) const {
    for (const auto &value : categoryCatalog) {
        const auto category = value.toObject();
        for (const auto &entry : category["namespaces"].toArray()) {
            const auto prefix = entry.toString();
            if (name == prefix || name.startsWith(prefix + '.')) {
                return enabledCategories_.contains(category["id"].toString());
            }
        }
    }
    return true;
}
}
