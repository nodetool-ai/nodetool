#include "ai/catalog/EntityReferenceController.h"
#include "ai/catalog/ModelCatalog.h"
#include "server/ServerClient.h"
#include "server/ServerSource.h"
#include <QHash>
#include <QPointer>
#include <QSet>
#include <QThread>
#include <QTimer>

EntityReferenceController::EntityReferenceController(QObject* parent) : QObject(parent) {
    QTimer::singleShot(0, this, &EntityReferenceController::reload);
}
void EntityReferenceController::configure(const QUrl& server, const QString& token) {
    m_server = server;
    m_token = token;
    clear();
    reload();
}
void EntityReferenceController::setProjectId(const QString& id) {
    if (id == m_projectId) return;
    m_projectId = id;
    clear();
    reload();
}
void EntityReferenceController::clear() {
    m_selectedIds.clear();
    emit changed();
}
QVariantList EntityReferenceController::selectedEntities() const {
    QHash<QString, QVariant> byId;
    for (const auto& entity : m_entities) byId.insert(entity.toMap().value("id").toString(), entity);
    QVariantList result;
    for (const auto& id : m_selectedIds) {
        if (byId.contains(id.toString())) result.append(byId.value(id.toString()));
    }
    return result;
}
void EntityReferenceController::toggleEntity(const QString& id) {
    if (m_selectedIds.contains(id)) {
        m_selectedIds.removeAll(id);
        emit changed();
        return;
    }
    for (const auto& entity : m_entities) {
        if (entity.toMap().value("id").toString() == id) {
            m_selectedIds.append(id);
            emit changed();
            return;
        }
    }
}
void EntityReferenceController::reload() {
    const auto revision = ++m_revision;
    auto server = m_server;
    auto token = m_token;
    QString timelineId;
    if (server.isEmpty()) {
        if (const auto target = nt::server::serverSaveTarget()) {
            server = target->server;
            token = target->token;
            timelineId = target->timelineId;
        }
    }
    m_error.clear();
    if (server.isEmpty()) {
        m_entities.clear();
        m_selectedIds.clear();
        m_loading = false;
        m_error = QStringLiteral("Open a server timeline to choose entities.");
        emit changed();
        return;
    }
    m_loading = true;
    emit changed();
    const auto project = m_projectId;
    const QPointer<EntityReferenceController> guard(this);
    auto* worker = QThread::create([guard, server, token, timelineId, project, revision] {
        nt::server::ServerClient client(server, token);
        QString scopedProject = project;
        QString error;
        if (scopedProject.isEmpty() && !timelineId.isEmpty()) {
            const auto timeline = client.getTimeline(timelineId);
            if (!timeline.ok()) error = timeline.describe();
            else scopedProject = timeline.data.toObject().value("projectId").toString();
        }
        if (scopedProject.isEmpty()) scopedProject = QStringLiteral("default");
        QVariantList entities;
        if (error.isEmpty()) {
            const auto result = client.query(QStringLiteral("assets.search"),
                {{"query", ""}, {"page_size", 1000}, {"project_id", scopedProject}});
            if (!result.ok()) error = result.describe();
            else entities = nt::ai::catalogEntities(result.data.toObject().value("assets").toArray());
        }
        if (!guard) return;
        QMetaObject::invokeMethod(guard, [guard, revision, entities, error] {
            if (!guard || guard->m_revision != revision) return;
            guard->m_entities = entities;
            QSet<QString> available;
            for (const auto& entity : entities) available.insert(entity.toMap().value("id").toString());
            for (auto it = guard->m_selectedIds.begin(); it != guard->m_selectedIds.end();) {
                if (!available.contains(it->toString())) it = guard->m_selectedIds.erase(it);
                else ++it;
            }
            guard->m_error = error;
            guard->m_loading = false;
            emit guard->changed();
        }, Qt::QueuedConnection);
    });
    connect(worker, &QThread::finished, worker, &QObject::deleteLater);
    worker->start();
}
