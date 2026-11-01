#include "entities/EntityLibrary.h"
#include "ai/catalog/ModelCatalog.h"
#include "server/ServerClient.h"
#include "server/ServerSource.h"
#include <QJsonArray>
#include <QPointer>
#include <QThread>

namespace {
constexpr auto markerKey = "nodetool_entity";
nt::server::SaveTarget targetFor(const QUrl& server, const QString& token) {
    auto target = nt::server::serverSaveTarget().value_or(nt::server::SaveTarget{});
    if (!server.isEmpty()) {
        // An explicit test server is independent of the open document's write proof.
        if (server != target.server || token != target.token) target = {};
        target.server = server;
        target.token = token;
    }
    return target;
}
QString serverError(const nt::server::QueryResult& result) {
    return result.error.message.isEmpty() ? QStringLiteral("The server did not answer.") : result.error.message;
}
QString projectFor(nt::server::ServerClient& client, QString project, const QString& timeline, QString& error) {
    if (project.isEmpty() && !timeline.isEmpty()) {
        const auto result = client.getTimeline(timeline);
        if (!result.ok()) error = serverError(result);
        else project = result.data.toObject().value("projectId").toString();
    }
    return project.isEmpty() ? QStringLiteral("default") : project;
}
bool validMarker(const QJsonObject& asset) {
    return !nt::ai::catalogEntities(QJsonArray{asset}).isEmpty();
}
QString imageUrl(nt::server::ServerClient& client, const QJsonObject& asset) {
    auto path = asset.value("thumb_url").toString();
    if (path.isEmpty()) path = asset.value("get_url").toString();
    return path.isEmpty() ? QString{} : client.resolve(path).toString();
}
}
EntityLibrary::EntityLibrary(QObject* parent) : QObject(parent) {}
QString EntityLibrary::removedName() const {
    if (m_removed.isEmpty()) return {};
    const auto name = m_removed.last().marker.value("name").toString();
    return name.isEmpty() ? QStringLiteral("Untitled") : name;
}
void EntityLibrary::clearActionError() {
    if (m_actionError.isEmpty()) return;
    m_actionError.clear();
    emit changed();
}
void EntityLibrary::ensureLoaded() { if (!m_loaded) reload(); }
bool EntityLibrary::configured() const { return !targetFor(m_server, m_token).server.isEmpty(); }
void EntityLibrary::reset() {
    ++m_scopeEpoch;
    m_loaded = false;
    ++m_revision;
    ++m_imagesRevision;
    m_loading = m_imagesLoading = false;
    if (!m_entities.isEmpty()) { m_entities.clear(); emit entitiesChanged(); }
    if (!m_images.isEmpty()) { m_images.clear(); emit imagesChanged(); }
    if (!m_imageUrls.isEmpty()) { m_imageUrls.clear(); emit imageUrlsChanged(); }
    m_listedMarkers.clear();
    m_removed.clear();
    m_removing.clear();
    m_saving = false;
    m_error.clear();
    m_imagesError.clear();
    m_saveError.clear();
    m_actionError.clear();
    emit changed();
}
void EntityLibrary::configure(const QUrl& server, const QString& token) {
    m_server = server;
    m_token = token;
    reset();
    reload();
}
void EntityLibrary::setProjectId(const QString& id) {
    if (m_projectId == id) return;
    m_projectId = id;
    reset();
    reload();
}
void EntityLibrary::reload() { m_loaded = true; load(false); }
void EntityLibrary::loadImages() { load(true); }
void EntityLibrary::load(bool images) {
    const auto revision = images ? ++m_imagesRevision : ++m_revision;
    auto& error = images ? m_imagesError : m_error;
    auto& loading = images ? m_imagesLoading : m_loading;
    error.clear();
    const auto target = targetFor(m_server, m_token);
    loading = !target.server.isEmpty();
    if (!loading) error = QStringLiteral("Open a server timeline to use entities.");
    emit changed();
    if (!loading) return;
    const auto project = m_projectId;
    const QPointer<EntityLibrary> guard(this);
    auto* worker = QThread::create([guard, target, project, revision, images] {
        nt::server::ServerClient client(target.server, target.token);
        QString error;
        const auto scope = projectFor(client, project, target.timelineId, error);
        QVariantList rows;
        QVariantMap urls;
        QHash<QString, QJsonObject> markers;
        if (error.isEmpty()) {
            const auto response = client.query("assets.search", {{"query", ""}, {"page_size", images ? 500 : 1000}, {"project_id", scope}});
            if (!response.ok()) error = serverError(response);
            else {
                const auto assets = response.data.toObject().value("assets").toArray();
                QSet<QString> seen;
                for (const auto& value : assets) {
                    const auto asset = value.toObject();
                    const auto id = asset.value("id").toString();
                    if (validMarker(asset)) markers.insert(id, asset.value("metadata").toObject().value(markerKey).toObject());
                    seen.insert(id);
                    urls.insert(id, imageUrl(client, asset));
                    if (images && asset.value("content_type").toString().startsWith("image/")) {
                        rows.append(QVariantMap{{"id", id}, {"name", asset.value("name").toString()},
                            {"url", urls.value(id)}, {"isEntity", validMarker(asset)}});
                    }
                }
                const auto entities = nt::ai::catalogEntities(assets);
                std::vector<std::pair<QString, QJsonObject>> calls;
                for (const auto& value : entities) {
                    const auto id = value.toMap().value("referenceAssetId").toString();
                    if (!seen.contains(id)) { seen.insert(id); urls.insert(id, QString{}); calls.emplace_back("assets.get", QJsonObject{{"id", id}}); }
                }
                for (const auto& result : client.queryAll(calls)) {
                    if (!result.ok()) continue;
                    const auto asset = result.data.toObject();
                    urls.insert(asset.value("id").toString(), imageUrl(client, asset));
                }
                if (!images) rows = entities;
            }
        }
        if (!error.isEmpty()) error = (images ? QStringLiteral("Could not load images. ") : QStringLiteral("Could not load entities. ")) + error;
        if (!guard) return;
        QMetaObject::invokeMethod(guard, [guard, revision, images, rows, urls, markers, error] {
            if (!guard || revision != (images ? guard->m_imagesRevision : guard->m_revision)) return;
            if (images) { guard->m_imagesError = error; guard->m_imagesLoading = false; }
            else { guard->m_error = error; guard->m_loading = false; }
            if (error.isEmpty()) {
                if (images) {
                    if (guard->m_images != rows) { guard->m_images = rows; emit guard->imagesChanged(); }
                } else {
                    guard->m_listedMarkers = markers;
                    if (guard->m_entities != rows) { guard->m_entities = rows; emit guard->entitiesChanged(); }
                }
                auto nextUrls = images ? guard->m_imageUrls : QVariantMap{};
                for (auto it = urls.begin(); it != urls.end(); ++it) nextUrls.insert(it.key(), it.value());
                if (guard->m_imageUrls != nextUrls) { guard->m_imageUrls = nextUrls; emit guard->imageUrlsChanged(); }
            }
            emit guard->changed();
        }, Qt::QueuedConnection);
    });
    connect(worker, &QThread::finished, worker, &QObject::deleteLater);
    worker->start();
}
void EntityLibrary::save(const QVariantMap& draft) {
    if (m_saving) return;
    m_saveError.clear();
    const auto kind = draft.value("kind").toString();
    if (draft.value("name").toString().trimmed().isEmpty() ||
        draft.value("descriptor").toString().trimmed().isEmpty() ||
        draft.value("referenceAssetId").toString().isEmpty() ||
        (kind != "character" && kind != "location" && kind != "style" && kind != "prop")) {
        m_saveError = QStringLiteral("Choose an image, kind, name and descriptor.");
        emit changed();
        return;
    }
    write(draft, Write::Save);
}
void EntityLibrary::remove(const QString& id) {
    if (id.isEmpty() || m_removing.contains(id)) return;
    write({{"id", id}}, Write::Remove);
}
void EntityLibrary::undoRemove() {
    if (m_removed.isEmpty() || m_removing.contains(m_removed.last().id)) return;
    write({{"id", m_removed.last().id}}, Write::Restore);
}
void EntityLibrary::dismissRemoved() {
    if (m_removed.isEmpty()) return;
    m_removed.clear();
    emit changed();
}
void EntityLibrary::write(const QVariantMap& draft, Write mode) {
    const bool removing = mode != Write::Save;
    const auto target = targetFor(m_server, m_token);
    auto& error = removing ? m_actionError : m_saveError;
    error.clear();
    if (target.server.isEmpty()) { error = QStringLiteral("Open a server timeline to edit entities."); emit changed(); return; }
    const bool creating = draft.value("id").toString().isEmpty();
    const auto id = creating ? draft.value("referenceAssetId").toString() : draft.value("id").toString();
    if (removing) m_removing.insert(id);
    else m_saving = true;
    emit changed();
    const auto project = m_projectId;
    const auto restoring = mode == Write::Restore ? m_removed.last().marker : QJsonObject{};
    const auto epoch = m_scopeEpoch;
    const bool hasBaseline = mode == Write::Save && !creating && m_listedMarkers.contains(id);
    const auto baseline = m_listedMarkers.value(id);
    const QPointer<EntityLibrary> guard(this);
    auto* worker = QThread::create([guard, target, project, draft, id, creating, removing, mode, restoring, epoch, hasBaseline, baseline] {
        nt::server::ServerClient client(target.server, target.token);
        client.setExpectedInstance(target.expectedInstance);
        QString error;
        QVariantMap entity;
        const auto scope = creating ? projectFor(client, project, target.timelineId, error) : QString{};
        const auto prefix = mode == Write::Remove ? QStringLiteral("Could not remove this entity. ") :
            mode == Write::Restore ? QStringLiteral("Could not restore this entity. ") : QStringLiteral("Could not save this entity. ");
        if (!error.isEmpty()) error = prefix + error;
        bool stale = false;
        QJsonObject writtenMarker;
        QJsonValue firstMarker;
        QJsonObject removedMarker;
        for (int attempt = 0; attempt < 3 && error.isEmpty(); ++attempt) {
            const auto fresh = client.getAsset(id);
            if (!fresh.ok()) { error = prefix + serverError(fresh); break; }
            const auto asset = fresh.data.toObject();
            const auto previous = asset.value("metadata").isObject() ? asset.value("metadata") : QJsonValue(QJsonValue::Null);
            auto metadata = previous.toObject();
            const auto marker = metadata.value(markerKey);
            if (attempt == 0) firstMarker = hasBaseline ? QJsonValue(baseline) : marker;
            if (marker != firstMarker) { stale = true; error = QStringLiteral("This entity changed elsewhere. Reload it and try again."); break; }
            if (!removing && creating && validMarker(asset)) { error = QStringLiteral("That image is already used by another entity."); break; }
            if (!removing && !creating && !validMarker(asset)) { error = QStringLiteral("This entity was removed. Reload and try again."); break; }
            if (mode == Write::Restore && validMarker(asset)) { error = QStringLiteral("This image is already an entity again."); break; }
            if (mode == Write::Remove) { removedMarker = marker.toObject(); metadata.remove(markerKey); }
            else if (mode == Write::Restore) metadata.insert(markerKey, restoring);
            else {
                auto next = marker.toObject();
                for (const auto& key : {"kind", "name", "descriptor"}) next.insert(key, draft.value(key).toString().trimmed());
                QJsonArray tags;
                QSet<QString> seen;
                for (const auto& tag : draft.value("tags").toStringList()) {
                    const auto trimmed = tag.trimmed();
                    if (!trimmed.isEmpty() && !seen.contains(trimmed)) { seen.insert(trimmed); tags.append(trimmed); }
                }
                next.insert("tags", tags);
                const auto voice = draft.value("voiceId").toString().trimmed();
                next.insert("voice_id", draft.value("kind") == "character" && !voice.isEmpty() ? QJsonValue(voice) : QJsonValue(QJsonValue::Null));
                const auto reference = draft.value("referenceAssetId").toString();
                if (reference != id) next.insert("reference_asset_id", reference);
                else next.remove("reference_asset_id");
                metadata.insert(markerKey, next);
            }
            const auto updated = client.mutate("assets.update", {{"id", id}, {"expected_metadata", previous}, {"metadata", metadata}});
            if (!updated.ok()) {
                if (updated.error.code == "CONFLICT" || updated.error.apiCode == "ALREADY_EXISTS") {
                    if (attempt == 2) error = QStringLiteral("Asset metadata changed repeatedly. Reload and try again.");
                    continue;
                }
                error = prefix + serverError(updated);
                break;
            }
            auto updatedAsset = updated.data.toObject();
            auto currentProject = updatedAsset.value("project_id").toString();
            if (currentProject.isEmpty()) currentProject = QStringLiteral("default");
            if (creating && !removing && scope != currentProject) {
                const auto filed = client.mutate("projects.assignDocument", {{"projectId", scope}, {"type", "entity"}, {"ref", id}});
                if (!filed.ok()) {
                    client.mutate("assets.update", {{"id", id}, {"expected_metadata", metadata}, {"metadata", previous.toObject()}});
                    error = prefix + serverError(filed);
                    break;
                }
            }
            writtenMarker = metadata.value(markerKey).toObject();
            updatedAsset.insert("id", id);
            updatedAsset.insert("metadata", metadata);
            const auto rows = nt::ai::catalogEntities(QJsonArray{updatedAsset});
            if (!rows.isEmpty()) entity = rows.first().toMap();
            break;
        }
        if (!guard) return;
        QMetaObject::invokeMethod(guard, [guard, id, mode, removing, entity, removedMarker, writtenMarker, error, epoch, stale] {
            if (!guard || epoch != guard->m_scopeEpoch) return;
            if (removing) { guard->m_removing.remove(id); guard->m_actionError = error; }
            else { guard->m_saving = false; guard->m_saveError = error; }
            if (error.isEmpty() && mode == Write::Remove) guard->m_removed.append({id, removedMarker});
            if (error.isEmpty() && mode == Write::Restore) {
                for (auto i = guard->m_removed.size(); i-- > 0;) {
                    if (guard->m_removed[i].id == id) { guard->m_removed.removeAt(i); break; }
                }
            }
            if (error.isEmpty() && mode == Write::Save) guard->m_listedMarkers.insert(id, writtenMarker);
            emit guard->changed();
            if (stale) guard->reload();
            if (error.isEmpty()) {
                if (mode == Write::Remove) emit guard->removed(id);
                else if (mode == Write::Save) emit guard->saved(entity);
                guard->reload();
            }
        }, Qt::QueuedConnection);
    });
    connect(worker, &QThread::finished, worker, &QObject::deleteLater);
    worker->start();
}
