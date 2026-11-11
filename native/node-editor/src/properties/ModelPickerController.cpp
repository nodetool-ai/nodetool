#include "ModelPickerController.h"
#include "CatalogRules.h"
#include "ModelLabels.h"
#include "document/WorkflowDocument.h"
#include "graph/NodeCreation.h"
#include "PropertyFields.h"
#include <QCryptographicHash>
#include <QSettings>
#include <QTimer>
#include <limits>
#include <QDesktopServices>
#include <QJsonArray>
#include <QJsonDocument>
#include <QNetworkCookieJar>
#include <QNetworkReply>
#include <QUrlQuery>
namespace nodetool::node_editor {
ModelPickerController::ModelPickerController(QObject* parent) : QObject(parent), m_network(this) {}
void ModelPickerController::cancel() {
 ++m_epoch;
 m_pending = 0;
 m_rankedKeys.clear();
 m_recommendedKeys.clear();
 m_recommendationsRequested = false;
 m_recommendationsLoaded = false;
 for (auto* reply : m_network.findChildren<QNetworkReply*>()) { reply->abort(); }
 // Downloads belong to the account that started them.
 if (m_downloadSocket) {
     m_downloadSocket->disconnect(this);
     m_downloadSocket->abort();
     m_downloadSocket->deleteLater();
 }
 m_queuedCommands.clear();
 m_downloads.clear();
 m_requestedRows.clear();
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
  catalog->setDownloadState({}, {});
  catalog->setIdentity(identity());
  catalog->reload();
 }
 if (m_document) { fillWorkflowDefaults(m_document, m_metadata); }
 emit changed();
}
QObject* ModelPickerController::catalogFor(const QString& modelType, const QStringList& allowedProviders, const QStringList& tasks, const QString& nodeType) {
 const auto defaultContext = modelType == "image_model" && nodeType == "nodetool.image.Upscale" ? QStringLiteral("image_model:upscale")
     : modelType == "image_model" && nodeType == "nodetool.image.RemoveBackground" ? QStringLiteral("image_model:remove_background") : modelType;
 const auto recommendations = nt::modelpicker::detail::catalogRecommendationProcedure(nodeType, modelType);
 const auto key = QStringList{modelType, allowedProviders.join(','), tasks.join(','), recommendations, defaultContext}.join('|');
 if (auto* existing = m_catalogs.value(key)) { return existing; }
 auto* catalog = new nt::modelpicker::Catalog(this);
 const bool huggingFace = modelType.startsWith("hf.");
 catalog->setDefaultContext(defaultContext);
 catalog->setFilter(allowedProviders, tasks);
 catalog->setRecommendationProcedure(recommendations);
 if (huggingFace) { catalog->setHuggingFaceType(modelType); }
 catalog->setMode(huggingFace ? QStringLiteral("huggingface_model") : modelType);
 catalog->setIdentity(identity());
 catalog->setMutation([this](const QString& procedure, QJsonValue input, nt::modelpicker::Catalog::Completion done) {
     mutate(procedure, input, std::move(done));
 });
 catalog->setDownloadHandler({
     [this](const QString& rowKey, const QVariantList& targets, const QString& type) {
         startDownload(rowKey, targets, type);
     },
     [this](const QString& id) {
         cancelDownload(id);
     }});
 catalog->setDownloadState(m_downloads, m_requestedRows);
 catalog->setQuery([this](const QString& procedure, QJsonObject input, nt::modelpicker::Catalog::Completion done) {
  query(procedure, input, std::move(done));
 });
 m_catalogs.insert(key, catalog);
 return catalog;
}
void ModelPickerController::fillWorkflowDefaults(WorkflowDocument* document, const QJsonArray& metadata) {
    const bool reset = m_document != document || m_documentReplaced;
    disconnect(m_documentConnection);
    disconnect(m_documentChangedConnection);
    m_document = document;
    m_metadata = metadata;
    ++m_documentEpoch;
    if (!document) { return; }
    if (reset) {
        m_documentBaseline.clear();
        m_touchedProperties.clear();
        m_documentReplaced = false;
    }
    QSet<QString> modelNodeTypes;
    static const QSet<QString> types{"language_model", "image_model", "embedding_model", "tts_model", "asr_model", "video_model"};
    for (const auto& entry : metadata) {
        const auto descriptor = entry.toObject();
        for (const auto& property : descriptor.value("properties").toArray()) {
            if (types.contains(scalarPropertyType(property.toObject()))) {
                modelNodeTypes.insert(descriptor.value("node_type").toString(descriptor.value("type").toString()));
            }
        }
    }
    for (const auto& value : document->nodes()) {
        const auto node = value.toObject();
        const auto id = node.value("id").toString();
        if (modelNodeTypes.contains(node.value("type").toString()) && !m_documentBaseline.contains(id)) {
            m_documentBaseline.insert(id, node.value("data").toObject());
        }
    }
    m_documentConnection = connect(document, &WorkflowDocument::replaced, this, [this] {
        ++m_documentEpoch;
        m_documentReplaced = true;
    });
    m_documentChangedConnection = connect(document, &WorkflowDocument::changed, this, [this] {
        if (!m_document || m_documentReplaced) { return; }
        for (auto baseline = m_documentBaseline.begin(); baseline != m_documentBaseline.end(); ++baseline) {
            const auto id = baseline.key();
            const auto node = m_document->node(id);
            const auto current = node.value("data").toObject();
            const auto previous = baseline.value();
            for (auto it = current.begin(); it != current.end(); ++it) {
                if (it.value() != previous.value(it.key())) { m_touchedProperties[id].insert(it.key()); }
            }
            for (auto it = previous.begin(); it != previous.end(); ++it) {
                if (!current.contains(it.key())) { m_touchedProperties[id].insert(it.key()); }
            }
            baseline.value() = current;
        }
    });
    if (m_origin.isEmpty()) { return; }
    if (!m_recommendationsRequested) {
        m_recommendationsRequested = true;
        query("models.recommended", {{"check_servers", false}}, [this](QJsonValue value, QString) {
            for (const auto& entry : value.toArray()) {
                const auto model = entry.toObject();
                m_recommendedKeys.append(model.value("provider").toString() + ":" + model.value("id").toString());
            }
            m_recommendationsLoaded = true;
            applyWorkflowDefaults();
        });
    }
    for (const auto& entry : metadata) {
        for (const auto& value : entry.toObject().value("properties").toArray()) {
            const auto type = scalarPropertyType(value.toObject());
            if (!types.contains(type) || m_defaultCatalogs.contains(type)) { continue; }
            auto* catalog = qobject_cast<nt::modelpicker::Catalog*>(catalogFor(type, {}, {}));
            m_defaultCatalogs.insert(type, catalog);
            connect(catalog, &nt::modelpicker::Catalog::changed, this, [this] {
                const auto epoch = m_documentEpoch;
                QTimer::singleShot(0, this, [this, epoch] {
                    if (epoch == m_documentEpoch) { applyWorkflowDefaults(); }
                });
            });
        }
    }
    applyWorkflowDefaults();
}
void ModelPickerController::applyWorkflowDefaults() {
    if (!m_document || m_documentReplaced || m_origin.isEmpty() || m_document->isReadOnly()) { return; }
    QJsonObject defaults;
    const auto account = QString::fromLatin1(QCryptographicHash::hash(identity().toUtf8(), QCryptographicHash::Sha256).toHex());
    QSettings settings(QSettings::IniFormat, QSettings::UserScope, "NodeTool", "ModelPicker");
    for (auto it = m_defaultCatalogs.cbegin(); it != m_defaultCatalogs.cend(); ++it) {
        auto* catalog = it.value();
        if (!catalog->loaded() || catalog->loading()) { continue; }
        const auto pinned = settings.value("modelPicker/" + account + "/" + it.key() + "/default").toString();
        QVariantMap selected;
        QVariantMap local;
        // Domain priority from protocol/nodetool-models.ts, in source order.
        const QStringList curated{"nodetool:nodetool/director", "nodetool:nodetool/flux-schnell",
            "nodetool:nodetool/nano-banana", "nodetool:nodetool/seedream", "nodetool:nodetool/hailuo-fast",
            "nodetool:nodetool/kling-turbo", "nodetool:nodetool/kling-standard", "nodetool:nodetool/kokoro"};
        const auto preferred = curated + m_rankedKeys + m_recommendedKeys;
        const auto rank = [&preferred](const QVariantMap& model) {
            const auto index = preferred.indexOf(model.value("provider").toString() + ":" + model.value("id").toString());
            return index < 0 ? std::numeric_limits<int>::max() : index;
        };
        for (const auto& value : catalog->models()) {
            const auto model = value.toMap();
            const auto id = model.value("id").toString();
            const auto provider = model.value("provider").toString();
            if (!pinned.isEmpty()) {
                if (provider + QChar(0x1f) + id == pinned) { selected = {{"provider", provider}, {"id", id}, {"name", model.value("name")}}; break; }
                continue;
            }
            if (!m_recommendationsLoaded) { continue; }
            if (it.key() != "language_model" && it.key() != "image_model" && it.key() != "tts_model") { continue; }
            if (id.isEmpty() || !catalog->hasAvailable(id, provider)) { continue; }
            if (it.key() == "image_model") {
                const auto tasks = model.value("supported_tasks").toStringList();
                if (!tasks.isEmpty() && !tasks.contains("text_to_image")) { continue; }
            }
            if (nt::modelpicker::isLocalProvider(provider)) {
                if (local.isEmpty() || (it.key() == "language_model" && rank(model) < rank(local))) { local = model; }
            } else if (selected.isEmpty() || (it.key() == "language_model" && rank(model) < rank(selected))) { selected = model; }
        }
        if (selected.isEmpty() && !pinned.isEmpty()) {
            const auto separator = pinned.indexOf(QChar(0x1f));
            if (separator > 0 && separator < pinned.size() - 1) {
                selected = {{"provider", pinned.left(separator)}, {"id", pinned.mid(separator + 1)}};
            }
        }
        if (selected.isEmpty() && pinned.isEmpty()) { selected = local; }
        if (!selected.isEmpty()) {
            const auto tasksKey = "modelPicker/" + account + "/" + it.key() + "/defaultTasks";
            if (!pinned.isEmpty() && settings.contains(tasksKey)) {
                selected.insert("supported_tasks", settings.value(tasksKey).toStringList());
            }
            if (selected.value("name").toString().isEmpty()) { selected.insert("name", selected.value("id")); }
            defaults.insert(it.key(), QJsonObject::fromVariantMap(selected));
            if (pinned.isEmpty()) {
                catalog->setDefault(selected.value("id").toString(), selected.value("provider").toString());
                if (selected.contains("supported_tasks")) {
                    settings.setValue(tasksKey, selected.value("supported_tasks").toStringList());
                }
            }
        }
    }
    // Task pins are optional overrides. Reuse the global image catalog and never
    // seed task defaults or fetch a catalog for each node type.
    for (const auto& task : {QStringLiteral("upscale"), QStringLiteral("remove_background")}) {
        const auto key = "image_model:" + task;
        const auto pinned = settings.value("modelPicker/" + account + "/" + key + "/default").toString();
        const auto separator = pinned.indexOf(QChar(0x1f));
        if (separator > 0 && separator < pinned.size() - 1) {
            defaults.insert(key, QJsonObject{{"provider", pinned.left(separator)}, {"id", pinned.mid(separator + 1)}, {"name", pinned.mid(separator + 1)}});
        }
    }
    QHash<QString, QJsonObject> changes;
    QHash<QString, QJsonObject> metadata;
    for (const auto& value : m_metadata) {
        const auto entry = value.toObject();
        metadata.insert(entry.value("node_type").toString(entry.value("type").toString()), entry);
    }
    for (const auto& value : m_document->nodes()) {
        const auto node = value.toObject();
        const auto descriptor = metadata.value(node.value("type").toString());
        if (descriptor.isEmpty()) { continue; }
        const auto current = node.value("data").toObject();
        auto overrides = current;
        for (const auto& property : descriptor.value("properties").toArray()) {
            const auto declaration = property.toObject();
            const auto name = declaration.value("name").toString();
            if (m_defaultCatalogs.contains(scalarPropertyType(declaration)) && !overrides.contains(name)) {
                overrides.insert(name, QJsonValue::Null);
            }
        }
        nodetool::NodeCreationOptions options;
        options.defaultModels = defaults;
        const auto filled = nodetool::createNativeNode(descriptor, {}, {}, overrides, options).value("data").toObject();
        QJsonObject patch;
        for (const auto& property : descriptor.value("properties").toArray()) {
            const auto declaration = property.toObject();
            const auto name = declaration.value("name").toString();
            if (m_touchedProperties.value(node.value("id").toString()).contains(name)
                || !m_defaultCatalogs.contains(scalarPropertyType(declaration)) || filled.value(name) == current.value(name)) { continue; }
            const auto allowed = modelAllowedProviders(declaration);
            if (!allowed.isEmpty() && !allowed.contains(filled.value(name).toObject().value("provider"))) { continue; }
            if (!validatePropertyValue(declaration, filled.value(name)).isEmpty()) { continue; }
            patch.insert(name, filled.value(name));
        }
        if (!patch.isEmpty()) { changes.insert(node.value("id").toString(), patch); }
    }
    m_document->applyPropertyDefaults(changes);
}
void ModelPickerController::openProviderSettings(const QString& provider) {
    if (m_origin.isEmpty()) {
        return;
    }
    const auto url = m_origin.resolved(QUrl(QStringLiteral("/settings?tab=1")));
    emit providerSettingsRequested(url, provider);
    QDesktopServices::openUrl(url);
}
QNetworkRequest ModelPickerController::request(const QUrl& url) const {
    QNetworkRequest request(url);
    request.setTransferTimeout(30000);
    request.setAttribute(QNetworkRequest::RedirectPolicyAttribute, QNetworkRequest::ManualRedirectPolicy);
    request.setHeader(QNetworkRequest::ContentTypeHeader, "application/json");
    if (!m_token.isEmpty()) {
        request.setRawHeader("Authorization", "Bearer " + m_token.toUtf8());
    }
    request.setRawHeader("x-user-id", m_user.toUtf8());
    return request;
}
void ModelPickerController::query(const QString& procedure, const QJsonObject& input, nt::modelpicker::Catalog::Completion done) {
 auto url = m_origin.resolved(QUrl("/trpc/" + procedure));
 QUrlQuery parameters; parameters.addQueryItem("input", QString::fromUtf8(QJsonDocument(input).toJson(QJsonDocument::Compact))); url.setQuery(parameters);
 ++m_pending;
 finish(m_network.get(request(url)), m_epoch, [this, procedure, done = std::move(done)](QJsonValue value, QString error) mutable {
     if (procedure == "models.rankedKeys" && error.isEmpty()) {
         m_rankedKeys.clear();
         for (const auto& entry : value.toArray()) { if (entry.isString()) { m_rankedKeys.append(entry.toString()); } }
     }
     done(value, error);
 });
}
void ModelPickerController::mutate(const QString& procedure, const QJsonValue& input, nt::modelpicker::Catalog::Completion done) {
    const auto body = input.isArray() ? QJsonDocument(input.toArray()) : QJsonDocument(input.toObject());
    ++m_pending;
    finish(m_network.post(request(m_origin.resolved(QUrl("/trpc/" + procedure))), body.toJson(QJsonDocument::Compact)), m_epoch, std::move(done));
}
void ModelPickerController::finish(QNetworkReply* reply, quint64 epoch, nt::modelpicker::Catalog::Completion done) {
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
// handleModelDownload and startDownload in the web: a row remembers its click,
// skips a repository another row is already downloading, and sends one
// start_download per repository. Ollama tags go through models.pullOllamaModel.
void ModelPickerController::startDownload(const QString& rowKey, const QVariantList& targets, const QString& modelType) {
    static const QSet<QString> active{"running", "progress", "start", "pending"};
    if (m_origin.isEmpty()) {
        return;
    }
    if (!m_requestedRows.contains(rowKey)) {
        m_requestedRows.append(rowKey);
    }
    for (const auto& entry : targets) {
        const auto target = entry.toMap();
        const auto id = target.value("id").toString();
        if (active.contains(m_downloads.value(id).toMap().value("status").toString())) {
            continue;
        }
        const auto type = target.value("model_type").toString().isEmpty() ? modelType : target.value("model_type").toString();
        m_downloads.insert(id, QVariantMap{{"status", "pending"}, {"downloaded_bytes", 0}, {"total_bytes", 0}, {"model_type", type}});
        if (type == "llama_model") {
            const auto epoch = m_epoch;
            mutate(QStringLiteral("models.pullOllamaModel"), QJsonObject{{"model", id}}, [this, id, epoch](QJsonValue value, QString error) {
                if (epoch != m_epoch) {
                    return;
                }
                const auto result = value.toObject();
                const bool failed = !error.isEmpty() || result.value("status").toString() == "unavailable";
                updateDownload(id, {{"status", failed ? "error" : "completed"}, {"message", error.isEmpty() ? result.value("message").toVariant() : QVariant(error)}});
            });
            continue;
        }
        const auto path = target.value("path").toString();
        QJsonObject command{{"command", "start_download"}, {"repo_id", target.value("repo_id").toString()},
                            {"model_type", type}, {"scope", "local"}};
        // A single file downloads as an allow list of that file.
        if (!path.isEmpty()) {
            command.insert("path", path);
            command.insert("allow_patterns", QJsonArray{path});
            command.insert("ignore_patterns", QJsonArray{});
        } else {
            command.insert("path", QJsonValue::Null);
            command.insert("allow_patterns", QJsonValue::fromVariant(target.value("allow_patterns")));
            command.insert("ignore_patterns", QJsonValue::fromVariant(target.value("ignore_patterns")));
        }
        sendDownloadCommand(command);
    }
    publishDownloads();
}
void ModelPickerController::cancelDownload(const QString& id) {
    if (!m_downloads.contains(id)) {
        return;
    }
    sendDownloadCommand({{"command", "cancel_download"}, {"id", id}});
    updateDownload(id, {{"status", "cancelled"}});
}
void ModelPickerController::sendDownloadCommand(const QJsonObject& command) {
    const auto bytes = QJsonDocument(command).toJson(QJsonDocument::Compact);
    if (m_downloadSocket && m_downloadSocket->state() == QAbstractSocket::ConnectedState) {
        m_downloadSocket->sendTextMessage(QString::fromUtf8(bytes));
        return;
    }
    m_queuedCommands.append(bytes);
    if (m_downloadSocket) {
        return;
    }
    auto url = m_origin;
    url.setScheme(m_origin.scheme() == "https" ? "wss" : "ws");
    url.setPath(QStringLiteral("/ws/download"));
    QNetworkRequest handshake(url);
    if (!m_token.isEmpty()) {
        handshake.setRawHeader("Authorization", "Bearer " + m_token.toUtf8());
    }
    handshake.setRawHeader("x-user-id", m_user.toUtf8());
    auto* socket = new QWebSocket(QString{}, QWebSocketProtocol::VersionLatest, this);
    m_downloadSocket = socket;
    connect(socket, &QWebSocket::connected, this, [this, socket] {
        for (const auto& queued : std::as_const(m_queuedCommands)) {
            socket->sendTextMessage(QString::fromUtf8(queued));
        }
        m_queuedCommands.clear();
    });
    connect(socket, &QWebSocket::textMessageReceived, this, &ModelPickerController::receiveDownloadFrame);
    // A lost socket fails the downloads still waiting for their first frame,
    // as the web store does, so a row never spins forever.
    connect(socket, &QWebSocket::disconnected, this, [this, socket] {
        if (m_downloadSocket != socket) {
            return;
        }
        m_downloadSocket = nullptr;
        m_queuedCommands.clear();
        socket->deleteLater();
        for (auto it = m_downloads.begin(); it != m_downloads.end(); ++it) {
            auto download = it.value().toMap();
            if (download.value("status").toString() == "pending") {
                download.insert("status", "error");
                download.insert("message", tr("Failed to connect to download service"));
                it.value() = download;
            }
        }
        publishDownloads();
    });
    socket->open(handshake);
}
// The JSON progress frames of /ws/download, keyed like the web store.
void ModelPickerController::receiveDownloadFrame(const QString& text) {
    const auto frame = QJsonDocument::fromJson(text.toUtf8()).object();
    const auto repo = frame.value("repo_id").toString();
    const auto status = frame.value("status").toString();
    const auto message = frame.value("error").toString().isEmpty() ? frame.value("message").toString() : frame.value("error").toString();
    if (repo.isEmpty()) {
        if (status != "error") {
            return;
        }
        for (auto it = m_downloads.begin(); it != m_downloads.end(); ++it) {
            if (it.value().toMap().value("status").toString() == "pending") {
                auto download = it.value().toMap();
                download.insert("status", "error");
                download.insert("message", message.isEmpty() ? tr("Download failed") : message);
                it.value() = download;
            }
        }
        publishDownloads();
        return;
    }
    const auto path = frame.value("path").toString();
    const auto id = path.isEmpty() ? repo : repo + "/" + path;
    // A dismissed or cancelled row stays dismissed.
    if (!m_downloads.contains(id) || m_downloads.value(id).toMap().value("status").toString() == "cancelled") {
        return;
    }
    static const QSet<QString> statuses{"pending", "idle", "running", "completed", "cancelled", "error", "start", "progress"};
    QVariantMap update{{"downloaded_bytes", frame.value("downloaded_bytes").toDouble()},
                       {"total_bytes", frame.value("total_bytes").toDouble()}, {"message", message}};
    if (statuses.contains(status)) {
        update.insert("status", status);
    }
    updateDownload(id, update);
}
void ModelPickerController::updateDownload(const QString& id, const QVariantMap& update) {
    if (!m_downloads.contains(id)) {
        return;
    }
    auto download = m_downloads.value(id).toMap();
    for (auto it = update.begin(); it != update.end(); ++it) {
        download.insert(it.key(), it.value());
    }
    m_downloads.insert(id, download);
    publishDownloads();
    // A finished download can change any model list, so every catalog reloads.
    if (update.value("status").toString() == "completed") {
        for (auto* catalog : std::as_const(m_catalogs)) {
            if (catalog->loaded()) {
                catalog->reload();
            }
        }
    }
}
void ModelPickerController::publishDownloads() {
    for (auto* catalog : std::as_const(m_catalogs)) {
        catalog->setDownloadState(m_downloads, m_requestedRows);
    }
}
}
