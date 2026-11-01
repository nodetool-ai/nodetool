#include "ai/catalog/ModelCatalogController.h"
#include "server/ServerClient.h"
#include "server/ServerSource.h"
#include <QPointer>
#include <QSettings>
#include <QThread>
#include <QTimer>

ModelCatalogController::ModelCatalogController(QObject* parent) : Catalog(parent) {
    const QPointer<ModelCatalogController> guard(this);
    setQuery([guard](const QString& procedure, QJsonObject input, Completion done) {
        if (!guard) return;
        const auto server = guard->m_server;
        const auto token = guard->m_token;
        auto* worker = QThread::create([guard, server, token, procedure, input, done = std::move(done)]() mutable {
            nt::server::ServerClient client(server, token);
            const auto result = client.query(procedure, input);
            if (!guard) return;
            QMetaObject::invokeMethod(guard, [guard, done = std::move(done), data = result.data,
                                              error = result.ok() ? QString{} : result.describe()]() mutable {
                if (guard) done(data, error);
            }, Qt::QueuedConnection);
        });
        QObject::connect(worker, &QThread::finished, worker, &QObject::deleteLater);
        worker->start();
    });
    connect(this, &Catalog::changed, this, [this] {
        if (loading() || !selectedModelId().isEmpty() || models().isEmpty()) return;
        QSettings legacy;
        const auto prefix = "generation/" + mode() + "/";
        const auto id = legacy.value(prefix + "model").toString();
        const auto provider = legacy.value(prefix + "provider").toString();
        if (id.isEmpty() || provider.isEmpty()) return;
        for (const auto& entry : models()) {
            const auto model = entry.toMap();
            if (model.value("id") == id && model.value("provider") == provider) {
                selectModel(id, provider);
                legacy.remove(prefix + "model");
                legacy.remove(prefix + "provider");
                return;
            }
        }
    });
    QTimer::singleShot(0, this, &ModelCatalogController::reload);
}
void ModelCatalogController::configure(const QUrl& server, const QString& token) {
    m_explicit = true;
    m_server = server;
    m_token = token;
    setIdentity(server.toString(QUrl::RemoveUserInfo) + QChar(0x1f) + token);
    Catalog::reload();
}
void ModelCatalogController::reload() {
    if (!m_explicit) {
        if (const auto target = nt::server::serverSaveTarget()) {
            if (m_server != target->server || m_token != target->token) {
                m_server = target->server;
                m_token = target->token;
                setIdentity(m_server.toString(QUrl::RemoveUserInfo) + QChar(0x1f) + m_token);
            }
        } else {
            m_server = QUrl{};
            m_token.clear();
            setIdentity({});
        }
    }
    Catalog::reload();
}
