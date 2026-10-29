#include "ai/catalog/ModelCatalogController.h"
#include "ai/catalog/ModelCatalog.h"
#include "server/ServerClient.h"
#include "server/ServerSource.h"
#include <QPointer>
#include <QSettings>
#include <QThread>
#include <QTimer>

ModelCatalogController::ModelCatalogController(QObject* parent) : QObject(parent) {
    QTimer::singleShot(0, this, &ModelCatalogController::reload);
}
void ModelCatalogController::configure(const QUrl& server, const QString& token) {
    m_server = server;
    m_token = token;
    reload();
}
void ModelCatalogController::setMode(const QString& mode) {
    if (mode == m_mode || nt::ai::catalogProcedure(mode).isEmpty()) return;
    m_mode = mode;
    reload();
}
void ModelCatalogController::setModelScope(const QString& scope) {
    if ((scope != "local" && scope != "worker") || m_modelScope == scope) return;
    m_modelScope = scope;
    if (m_mode == "huggingface_model") reload(); else emit changed();
}
QVariantMap ModelCatalogController::constraints() const {
    return nt::ai::catalogConstraints(m_selected);
}
void ModelCatalogController::selectModel(const QString& id, const QString& provider) {
    for (const auto& item : m_models) {
        const auto model = item.toMap();
        if (model.value("id") != id || model.value("provider") != provider) continue;
        m_selected = model;
        QSettings settings;
        settings.setValue("generation/" + m_mode + "/model", id);
        settings.setValue("generation/" + m_mode + "/provider", provider);
        emit changed();
        return;
    }
}
void ModelCatalogController::restoreSelection() {
    QSettings settings;
    const auto id = settings.value("generation/" + m_mode + "/model").toString();
    const auto provider = settings.value("generation/" + m_mode + "/provider").toString();
    for (const auto& item : m_models) {
        const auto model = item.toMap();
        if (model.value("id") == id && model.value("provider") == provider) {
            m_selected = model;
            return;
        }
    }
}
void ModelCatalogController::reload() {
    const auto revision = ++m_revision;
    m_models.clear();
    m_selected.clear();
    m_error.clear();
    auto server = m_server;
    auto token = m_token;
    if (server.isEmpty()) {
        if (const auto target = nt::server::serverSaveTarget()) {
            server = target->server;
            token = target->token;
        }
    }
    if (server.isEmpty()) {
        m_loading = false;
        m_error = QStringLiteral("Open a server timeline to select generation models.");
        emit changed();
        return;
    }
    m_loading = true;
    emit changed();
    const auto mode = m_mode;
    const auto scope = m_modelScope;
    const QPointer<ModelCatalogController> guard(this);
    auto* worker = QThread::create([guard, server, token, mode, scope, revision] {
        nt::server::ServerClient client(server, token);
        QVariantList models;
        if (mode == "huggingface_model") {
            const auto result = client.query("models.huggingfaceByType", {{"model_type", "hf.model"}, {"scope", scope}});
            const auto entries = result.ok() ? nt::ai::catalogModels(result.data.toArray(), "huggingface", mode) : QVariantList{};
            const auto error = result.ok() ? QString() : result.describe();
            if (!guard) return;
            QMetaObject::invokeMethod(guard, [guard, revision, entries, error] {
                if (!guard || guard->m_revision != revision) return;
                guard->m_models = entries; guard->m_error = error; guard->m_loading = false;
                guard->restoreSelection(); emit guard->changed();
            }, Qt::QueuedConnection);
            return;
        }
        const auto providers = client.query(QStringLiteral("models.providers"), {});
        QStringList errors;
        if (!providers.ok()) errors.append(providers.describe());
        std::vector<std::pair<QString, QJsonObject>> calls;
        QStringList names;
        for (const auto& value : providers.data.toArray()) {
            const auto provider = value.toObject();
            if (!nt::ai::catalogProviderMatches(mode, provider.value("capabilities").toArray())) continue;
            const auto name = provider.value("provider").toString();
            if (name.isEmpty()) continue;
            names.append(name);
            calls.emplace_back(nt::ai::catalogProcedure(mode), QJsonObject{{"provider", name}});
        }
        const auto results = client.queryAll(calls);
        for (size_t i = 0; i < results.size(); ++i) {
            if (!results[i].ok()) { errors.append(names[static_cast<qsizetype>(i)] + ": " + results[i].describe()); continue; }
            models.append(nt::ai::catalogModels(results[i].data.toArray(), names[static_cast<qsizetype>(i)], mode));
        }
        if (!guard) return;
        QMetaObject::invokeMethod(guard, [guard, revision, models, errors] {
            if (!guard || guard->m_revision != revision) return;
            guard->m_models = models;
            guard->m_error = errors.join('\n');
            guard->m_loading = false;
            guard->restoreSelection();
            emit guard->changed();
        }, Qt::QueuedConnection);
    });
    connect(worker, &QThread::finished, worker, &QObject::deleteLater);
    worker->start();
}
