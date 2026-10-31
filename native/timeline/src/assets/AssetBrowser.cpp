#include "assets/AssetBrowser.h"
#include "assets/AssetClip.h"
#include "assets/AssetImport.h"
#include "assets/AssetDuration.h"
#include "assets/AssetAudio.h"
#include "assets/AssetDrop.h"
#include "assets/AssetMedia.h"
#include "edit/EditActions.h"
#include "model/TimelineModel.h"
#include "model/TrackWindowModel.h"
#include "server/ServerSource.h"
#include <QJsonDocument>
#include <QCryptographicHash>
#include <QFileInfo>
#include <QUuid>
#include <QDir>
#include <QSet>
#include <QScopedValueRollback>
#include <algorithm>
#include <memory>

AssetBrowser::AssetBrowser(QObject* parent) : QObject(parent), m_target(nt::server::serverSaveTarget()) {
    m_poll.setInterval(5000);
    connect(&m_poll, &QTimer::timeout, this, &AssetBrowser::pollProxies);
}

AssetBrowser::~AssetBrowser() {
    m_poll.stop();
    m_requests.clear();
    if (m_activeQueryCancel) { m_activeQueryCancel->store(true); }
    if (auto* thread = m_thread.data()) {
        disconnect(thread, nullptr, this, nullptr);
        thread->requestInterruption();
        if (!thread->wait(1000)) {
            // Work captures its inputs/result by value. A non-network task
            // may still be finishing; never delete a running child thread.
            thread->setParent(nullptr);
            connect(thread, &QThread::finished, thread, &QObject::deleteLater);
            if (thread->isFinished()) { thread->deleteLater(); }
        }
    }
}

TimelineModel* AssetBrowser::timeline() const { return m_timeline; }
void AssetBrowser::setTimeline(TimelineModel* model) {
    if (model == m_timeline) { return; }
    if (m_timeline) {
        disconnect(m_timeline, nullptr, this, nullptr);
        disconnect(m_timeline->undoStack(), nullptr, this, nullptr);
    }
    m_timeline = model;
    resetDocumentState();
    if (model) {
        connect(model, &TimelineModel::documentReplaced, this, &AssetBrowser::resetDocumentState);
        connect(model, &TimelineModel::clipsChanged, this, [this] {
            protectDocumentMedia();
            reconcileLinkedAudio();
        });
        connect(model->undoStack(), &QUndoStack::indexChanged, this, &AssetBrowser::reconcileLinkedAudio);
    }
    emit timelineChanged();
    emit libraryScopeChanged();
}

void AssetBrowser::resetDocumentState() {
    ++m_documentEpoch;
    m_thumbnails.clear(); m_originals.clear(); m_details.clear();
    emit thumbnailsChanged();
    m_settlements.clear();
    const auto project = projectId();
    if (m_libraryProject != project) {
        m_libraryProject = project;
        m_folderId.clear();
        m_folderPath.clear();
        m_pending.clear();
        ++m_queryGeneration;
        m_assets = {};
        emit filtersChanged();
        emit folderChanged();
        emit assetsChanged();
        if (m_hasQueried) { refresh(); }
    }
    emit libraryScopeChanged();
    m_mediaProtection->reset(m_timeline ? m_timeline->resolvedMediaPaths() : QSet<QString>{});
}

void AssetBrowser::protectDocumentMedia() {
    if (!m_timeline) { return; }
    m_mediaProtection->replaceCurrent(m_timeline->resolvedMediaPaths());
}

void AssetBrowser::reconcileLinkedAudio() {
    if (!m_timeline || m_reconciling || m_settlements.isEmpty()) { return; }
    const QScopedValueRollback guard(m_reconciling, true);
    for (auto it = m_settlements.begin(); it != m_settlements.end();) {
        const auto clips = m_timeline->clipsJson();
        const auto audio = std::find_if(clips.begin(), clips.end(), [&it](const QJsonValue& value) {
            return value.toObject().value("id").toString() == it.key();
        });
        // Keep an untracked deletion at the current history cursor deleted.
        if (audio == clips.end() && m_timeline->undoStack()->index() == m_timeline->undoStack()->count()) {
            ++it;
            continue;
        }
        const auto settled = nt::assets::settleLinkedAudio(it->capturedDocument, it->payload);
        if (m_timeline->settleCommand(it->token, settled)) {
            it = m_settlements.erase(it);
            continue;
        }
        ++it;
    }
    // A later drop's captured document can still contain earlier placeholders.
    // Patch them after every command settlement has finished replacing it.
    auto current = m_timeline->timeline().raw;
    for (auto it = m_settlements.cbegin(); it != m_settlements.cend(); ++it) {
        const auto clips = current.value("clips").toArray();
        const bool generating = std::any_of(clips.begin(), clips.end(), [&it](const QJsonValue& value) {
            const auto clip = value.toObject();
            return clip.value("id").toString() == it.key() && clip.value("status").toString() == "generating";
        });
        if (generating) { current = nt::assets::settleLinkedAudio(current, it->payload); }
    }
    m_timeline->settleDocument(current);
}

void AssetBrowser::request(std::function<Result(nt::server::ServerClient&)> work,
                           std::function<void(const Result&)> done,
                           std::optional<quint64> documentEpoch,
                           std::shared_ptr<std::atomic_bool> queryCancel) {
    if (documentEpoch && *documentEpoch != m_documentEpoch) { return; }
    if (!m_target) { return; }
    if (busy()) {
        if (queryCancel) {
            if (m_activeQueryCancel) {
                m_activeQueryCancel->store(true);
                m_thread->requestInterruption();
            }
            std::erase_if(m_requests, [](const Request& queued) { return queued.queryCancel != nullptr; });
        }
        m_requests.push_back({std::move(work), std::move(done), documentEpoch, std::move(queryCancel)});
        return;
    }
    m_activeQueryCancel = std::move(queryCancel);
    auto result = std::make_shared<Result>();
    const auto target = *m_target;
    auto* thread = QThread::create([work = std::move(work), target, result] {
        nt::server::ServerClient client(target.server, target.token, 10000);
        client.setExpectedInstance(target.expectedInstance);
        *result = work(client);
    });
    thread->setParent(this);
    m_thread = thread;
    m_error.clear();
    const QPointer<AssetBrowser> self(this);
    const QPointer<QThread> worker(thread);
    connect(thread, &QThread::finished, this, [self, worker, result, done = std::move(done), documentEpoch] {
        if (!self) { return; }
        if (!documentEpoch || *documentEpoch == self->m_documentEpoch) {
            self->receive(*result);
            if (done) { done(*result); }
        }
        self->m_thread.clear();
        self->m_activeQueryCancel.reset();
        if (worker) { worker->deleteLater(); }
        std::erase_if(self->m_requests, [self](const Request& queued) {
            return queued.documentEpoch && *queued.documentEpoch != self->m_documentEpoch;
        });
        if (!self->m_requests.empty()) {
            auto next = std::move(self->m_requests.front());
            self->m_requests.pop_front();
            self->request(std::move(next.work), std::move(next.done), next.documentEpoch, std::move(next.queryCancel));
        } else { self->importNext(); }
        emit self->stateChanged();
    });
    emit stateChanged();
    thread->start();
}

void AssetBrowser::receive(const Result& result) {
    if (!result.display) { return; }
    if (result.queryGeneration && *result.queryGeneration != m_queryGeneration) { return; }
    if (result.folder && *result.folder != m_folderId) { return; }
    m_error = result.error;
    if (result.replace) { m_assets = result.assets; }
    else {
        QHash<QString, qsizetype> indices;
        indices.reserve(m_assets.size());
        for (qsizetype i = 0; i < m_assets.size(); ++i) {
            indices.insert(m_assets[i].toObject().value("id").toString(), i);
        }
        QJsonArray added;
        for (const auto& asset : result.assets) {
            const auto existing = indices.constFind(asset.toObject().value("id").toString());
            if (existing != indices.cend()) { m_assets[*existing] = asset; }
            else { added.append(asset); }
        }
        for (const auto& asset : m_assets) { added.append(asset); }
        m_assets = added;
    }
    for (const auto& value : result.assets) {
        const auto asset = value.toObject();
        const auto id = asset.value("id").toString();
        const auto status = asset.value("proxy_status").toString();
        if (status == "queued" || status == "running") {
            if (!m_pending.contains(id)) { m_pending.insert(id, 0); }
        } else { m_pending.remove(id); }
    }
    for (const auto& id : result.failedWatchIds) { m_pending.remove(id); }
    m_poll.start();
    if (m_pending.isEmpty()) { m_poll.stop(); }
    emit assetsChanged();
    emit stateChanged();
}

QString AssetBrowser::projectId() const {
    return m_timeline ? m_timeline->timeline().raw.value("projectId").toString() : QString{};
}

QString AssetBrowser::libraryScope() const {
    if (!m_target) { return {}; }
    const QJsonArray identity{m_target->server.toString(QUrl::FullyEncoded), m_target->token, projectId()};
    return QString::fromLatin1(QCryptographicHash::hash(QJsonDocument(identity).toJson(QJsonDocument::Compact),
        QCryptographicHash::Sha256).toHex());
}

QVariantList AssetBrowser::breadcrumbs() const {
    QVariantList result{QVariantMap{{"id", ""}, {"name", "Library"}}};
    for (const auto& id : m_folderPath) {
        if (!id.isEmpty()) { result.append(QVariantMap{{"id", id}, {"name", m_folderNames.value(id, id)}}); }
    }
    if (!m_folderId.isEmpty()) {
        result.append(QVariantMap{{"id", m_folderId}, {"name", m_folderNames.value(m_folderId, m_folderId)}});
    }
    return result;
}

void AssetBrowser::setSearchText(const QString& value) {
    if (m_searchText == value) { return; }
    m_searchText = value; emit filtersChanged(); refresh();
}
void AssetBrowser::setTypeFilter(const QString& value) {
    if (!QStringList{"", "image", "video", "audio", "folder", "other"}.contains(value) || m_typeFilter == value) { return; }
    m_typeFilter = value; emit filtersChanged(); refresh();
}
void AssetBrowser::setTagFilter(const QString& value) {
    if (m_tagFilter == value) { return; }
    m_tagFilter = value; emit filtersChanged(); refresh();
}
void AssetBrowser::setFavoritesOnly(bool value) {
    if (m_favoritesOnly == value) { return; }
    m_favoritesOnly = value; emit filtersChanged(); refresh();
}

void AssetBrowser::refresh() {
    m_hasQueried = true;
    const auto generation = ++m_queryGeneration;
    m_pending.clear();
    m_poll.stop();
    m_assets = {};
    emit assetsChanged();
    const auto cancelled = std::make_shared<std::atomic_bool>(false);
    request([cancelled, folder = m_folderId, search = m_searchText.trimmed(), type = m_typeFilter,
             tag = m_tagFilter.trimmed(), favorites = m_favoritesOnly, project = projectId(), generation](nt::server::ServerClient& client) {
        Result result;
        result.replace = true;
        result.queryGeneration = generation;
        QJsonArray candidates;
        QString cursor;
        QSet<QString> cursors;
        do {
            if (cancelled->load()) { return result; }
            QJsonObject input{{"query", search}, {"page_size", 1000}};
            if (!project.isEmpty()) { input.insert("project_id", project); }
            if (!cursor.isEmpty()) { input.insert("cursor", cursor); }
            const auto response = client.query("assets.search", input);
            if (!response.ok()) { result.error = response.describe(); return result; }
            const auto page = response.data.toObject();
            for (const auto& asset : page.value("assets").toArray()) { candidates.append(asset); }
            cursor = page.value("next_cursor").toString();
            if (!cursor.isEmpty() && cursors.contains(cursor)) {
                result.error = "The server repeated an asset page. Refresh the library to try again.";
                return result;
            }
            cursors.insert(cursor);
        } while (!cursor.isEmpty() && !cancelled->load() && !QThread::currentThread()->isInterruptionRequested());
        const bool global = !search.isEmpty() || favorites || !tag.isEmpty() || !type.isEmpty();
        QSet<QString> seen;
        for (const auto& value : candidates) {
            const auto asset = value.toObject();
            const auto id = asset.value("id").toString();
            if (id.isEmpty() || seen.contains(id)) { continue; }
            seen.insert(id);
            if (!project.isEmpty() && asset.value("project_id").toString() != project) { continue; }
            if (!global) {
                const auto parent = asset.value("parent_id").toString();
                if (folder.isEmpty() ? (!parent.isEmpty() && parent != asset.value("user_id").toString()) : parent != folder) { continue; }
            }
            if (!search.isEmpty() && !asset.value("name").toString().contains(search, Qt::CaseInsensitive)) { continue; }
            if (favorites && !asset.value("favorite").toBool()) { continue; }
            if (!tag.isEmpty()) {
                bool found = false;
                for (const auto& entry : asset.value("metadata").toObject().value("tags").toArray()) {
                    if (entry.toString().compare(tag, Qt::CaseInsensitive) == 0) { found = true; break; }
                }
                if (!found) { continue; }
            }
            auto mediaType = nt::assets::assetMediaType(asset);
            if (asset.value("content_type").toString() == "folder") { mediaType = "folder"; }
            if (mediaType.isEmpty()) { mediaType = "other"; }
            if (!type.isEmpty() && mediaType != type) { continue; }
            result.assets.append(asset);
        }
        return result;
    }, {}, {}, cancelled);
}

void AssetBrowser::setFolderId(const QString& id) {
    if (id == m_folderId) { return; }
    const auto ancestor = m_folderPath.indexOf(id);
    if (id.isEmpty()) { m_folderPath.clear(); }
    else if (ancestor >= 0) { m_folderPath = m_folderPath.mid(0, ancestor); }
    m_folderId = id;
    m_assets = {};
    m_pending.clear();
    emit folderChanged();
    emit assetsChanged();
    refresh();
}

void AssetBrowser::openFolder(const QString& id) {
    if (id == m_folderId) { return; }
    if (id.isEmpty()) { setFolderId({}); return; }
    for (const auto& value : m_assets) {
        const auto asset = value.toObject();
        if (asset.value("id").toString() == id) { m_folderNames.insert(id, asset.value("name").toString()); break; }
    }
    m_folderPath.append(m_folderId);
    setFolderId(id);
}

void AssetBrowser::goUp() {
    setFolderId(m_folderPath.isEmpty() ? QString{} : m_folderPath.takeLast());
}

void AssetBrowser::importFiles(const QList<QUrl>& urls) {
    if (!configured()) { return; }
    QJsonObject fields;
    if (!m_folderId.isEmpty()) { fields.insert("parent_id", m_folderId); }
    if (m_timeline) {
        const auto raw = QJsonDocument::fromJson(m_timeline->documentJson()).object();
        if (!raw.value("projectId").toString().isEmpty()) { fields.insert("project_id", raw.value("projectId")); }
    }
    for (const auto& url : urls) {
        if (url.isLocalFile()) {
            const auto id = QUuid::createUuid().toString(QUuid::Id128);
            const QueuedImport queued{url.toLocalFile(), fields, m_folderId, id};
            m_files.push_back(queued);
            m_imports.insert(id, queued);
            m_transfers.append(QVariantMap{{"id", id}, {"name", QFileInfo(queued.file).fileName()}, {"status", "queued"}, {"error", ""}});
        }
    }
    emit transfersChanged();
    importNext();
}

AssetBrowser::QueuedImport AssetBrowser::takeNextImport() {
    auto queued = std::move(m_files.front());
    m_files.pop_front();
    return queued;
}

void AssetBrowser::importNext() {
    if (!configured() || busy() || m_files.empty()) { return; }
    const auto queued = takeNextImport();
    transferState(queued.id, "running");
    const auto documentEpoch = m_documentEpoch;
    request([queued](nt::server::ServerClient& client) {
        const auto imported = nt::assets::importFile(client, queued.file, queued.fields);
        Result result = imported.ok() ? Result{QJsonArray{imported.asset}, imported.proxyError, false}
                                      : Result{{}, imported.error, false};
        result.folder = queued.folder;
        result.display = false;
        return result;
    }, [this, queued, documentEpoch](const Result& result) {
        transferState(queued.id, result.assets.isEmpty() ? "failed" : "complete", result.error);
        if (documentEpoch == m_documentEpoch && m_files.empty()) { refresh(); }
    });
}

void AssetBrowser::pollProxies() {
    if (busy() || m_pending.isEmpty()) { return; }
    QStringList ids;
    for (auto it = m_pending.begin(); it != m_pending.end();) {
        if (it.value() >= 360) { it = m_pending.erase(it); }
        else { ++it.value(); ids.append(it.key()); ++it; }
    }
    request([ids, folder = m_folderId, generation = m_queryGeneration](nt::server::ServerClient& client) {
        Result result;
        result.folder = folder;
        result.queryGeneration = generation;
        for (const auto& id : ids) {
            if (QThread::currentThread()->isInterruptionRequested()) { break; }
            const auto fresh = client.getAsset(id);
            if (fresh.ok()) { result.assets.append(fresh.data); }
            else { result.failedWatchIds.append(id); result.error = fresh.describe(); }
        }
        return result;
    });
}

QString AssetBrowser::mediaType(const QVariantMap& asset) const { return nt::assets::assetMediaType(QJsonObject::fromVariantMap(asset)); }
void AssetBrowser::requestThumbnail(const QString& assetId) {
    if (!m_target || assetId.isEmpty() || m_thumbnails.contains(assetId)) { return; }
    m_thumbnails.insert(assetId, QString{});
    request([assetId](nt::server::ServerClient& client) {
        Result result;
        result.display = false;
        const auto asset = client.getAsset(assetId);
        if (asset.ok()) { result.assets.append(asset.data); }
        return result;
    }, [this, assetId](const Result& result) {
        const auto asset = result.assets.isEmpty() ? QJsonObject{} : result.assets.first().toObject();
        auto path = asset.value("thumb_url").toString();
        if (path.isEmpty() && asset.value("content_type").toString().startsWith("image/")) {
            path = asset.value("get_url").toString();
        }
        if (path.isEmpty()) { m_thumbnails.remove(assetId); }
        else { m_thumbnails.insert(assetId, mediaUrl(path).toString()); }
        const auto original = asset.value("get_url").toString();
        if (!original.isEmpty()) { m_originals.insert(assetId, mediaUrl(original).toString()); }
        if (!asset.isEmpty()) {
            m_details.insert(assetId, QVariantMap{{"name", asset.value("name").toString()},
                {"kind", asset.value("metadata").toObject().value("nodetool_entity").toObject().value("kind").toString()}});
        }
        emit thumbnailsChanged();
    }, m_documentEpoch);
}

QUrl AssetBrowser::mediaUrl(const QString& path) const {
    if (path.isEmpty() || !m_target) { return {}; }
    return m_target->server.resolved(QUrl(path));
}

QString AssetBrowser::trackAt(TrackWindowModel* rows, double contentY) const {
    if (!rows || !rows->tracks()) { return {}; }
    const auto& tops = rows->rowTops();
    const auto& heights = rows->rowHeights();
    const auto next = std::upper_bound(tops.begin(), tops.end(), contentY);
    if (next == tops.begin()) { return {}; }
    const auto index = static_cast<size_t>(std::distance(tops.begin(), next) - 1);
    if (contentY >= tops[index] + heights[index]) { return {}; }
    const auto* track = rows->tracks()->trackAt(static_cast<int>(index));
    return track ? QString::fromStdString(track->id) : QString{};
}

bool AssetBrowser::canDrop(const QVariantMap& asset, const QString& trackId) const {
    const auto type = mediaType(asset);
    if (!m_timeline || type.isEmpty() || asset.value("id").toString().isEmpty()) { return false; }
    if (trackId.isEmpty()) { return true; }
    for (int i = 0; i < m_timeline->tracks()->rowCount(); ++i) {
        const auto* track = m_timeline->tracks()->trackAt(i);
        if (track && QString::fromStdString(track->id) == trackId) {
            return !track->locked && nt::edit::clipFitsTrack(type, track->raw.value("type").toString());
        }
    }
    return false;
}

bool AssetBrowser::drop(const QVariantMap& asset, const QString& trackId, double startMs, const QString& mode, double snapMs) {
    if (!m_timeline) { return false; }
    const auto type = mediaType(asset);
    m_error.clear();
    bool videoTrack = trackId.isEmpty();
    if (type.isEmpty()) { m_error = "Cannot import \"" + asset.value("name").toString() + "\": unsupported media type."; }
    for (int i = 0; i < m_timeline->tracks()->rowCount(); ++i) {
        const auto* track = m_timeline->tracks()->trackAt(i);
        if (!track || QString::fromStdString(track->id) != trackId) { continue; }
        videoTrack = track->raw.value("type").toString() == "video";
        if (track->locked) { m_error = "This track is locked."; }
        else if (!nt::edit::clipFitsTrack(type, track->raw.value("type").toString())) {
            m_error = "Cannot drop " + type + " asset onto this " + track->raw.value("type").toString() +
                " track — use " + (type == "audio" ? "an audio" : "a video or overlay") + " track.";
        }
    }
    bool applied = false;
    if (m_error.isEmpty()) {
        const auto rawAsset = QJsonObject::fromVariantMap(asset);
        const QJsonObject payload{{"asset", rawAsset}, {"trackId", trackId},
            {"startMs", startMs}, {"mode", mode}, {"snapMs", snapMs}};
        const auto duration = rawAsset.value("duration");
        if (type == "video" && videoTrack && (duration.isNull() || duration.isUndefined()) &&
            !rawAsset.value("get_url").toString().isEmpty() && m_target) {
            if (busy()) {
                m_error = "Wait for the current import to finish, then drop the asset again.";
            } else {
                const QPointer<AssetBrowser> self(this);
                const auto model = m_timeline;
                const auto generation = model->documentGeneration();
                request([rawAsset, folder = m_folderId](nt::server::ServerClient& client) {
                    Result result{QJsonArray{nt::assets::withProbedVideoDuration(client, rawAsset)}, {}, false};
                    result.folder = folder;
                    return result;
                }, [self, model, generation, payload](const Result& result) {
                    if (!self || !model || self->m_timeline != model || model->documentGeneration() != generation) { return; }
                    auto resolved = payload;
                    resolved.insert("asset", result.assets.first());
                    self->applyDrop(resolved);
                });
                applied = true;
            }
        } else {
            applied = applyDrop(payload);
        }
    }
    emit stateChanged();
    return applied;
}

bool AssetBrowser::applyDrop(const QJsonObject& payload) {
    const auto model = m_timeline;
    if (!model) { return false; }
    const auto generation = model->documentGeneration();
    QSet<QString> existing;
    for (const auto& value : model->clipsJson()) { existing.insert(value.toObject().value("id").toString()); }
    QSet<QString> existingTracks;
    for (const auto& value : model->timeline().raw.value("tracks").toArray()) {
        existingTracks.insert(value.toObject().value("id").toString());
    }
    const auto token = model->applyEdit("assets.dropAsset", payload);
    if (!token) { return false; }
    const auto capturedResult = model->timeline().raw;
    const auto clips = model->clipsJson();
    for (const auto& value : clips) {
        const auto clip = value.toObject();
        const auto id = clip.value("id").toString();
        if (!existing.contains(id)) { queueMedia(payload.value("asset").toObject(), clip, model, generation); }
        if (!existing.contains(id) && clip.value("mediaType").toString() == "audio" &&
            clip.value("status").toString() == "generating") {
            const auto trackId = clip.value("trackId").toString();
            queueLinkedAudio(payload.value("asset").toObject(), id, model, generation, token,
                capturedResult, existingTracks.contains(trackId) ? QString{} : trackId);
        }
    }
    return true;
}

void AssetBrowser::resolveClipMedia(const QVariantMap& asset, const QString& clipId) {
    if (!m_timeline) { return; }
    for (const auto& value : m_timeline->clipsJson()) {
        const auto clip = value.toObject();
        if (clip.value("id").toString() == clipId) {
            queueMedia(QJsonObject::fromVariantMap(asset), clip, m_timeline, m_timeline->documentGeneration());
            return;
        }
    }
}

void AssetBrowser::queueMedia(const QJsonObject& asset, const QJsonObject& clip,
                             QPointer<TimelineModel> model, quint64 generation) {
    const auto type = clip.value("mediaType").toString();
    if (!m_target || (type != "video" && type != "image" && type != "audio") ||
        clip.value("currentAssetId").toString() != asset.value("id").toString()) { return; }
    // ServerSource places backups at <cacheRoot>/<serverKey>/<userKey>/timelines.
    const auto cacheRoot = QDir::cleanPath(QDir(m_target->backupDir).absoluteFilePath("../../.."));
    protectDocumentMedia();
    const auto mediaGeneration = m_mediaProtection->generation();
    const QPointer<AssetBrowser> self(this);
    request([asset, clip, cacheRoot, protection = m_mediaProtection, mediaGeneration](nt::server::ServerClient& client) {
        Result result;
        if (protection->generation() == mediaGeneration && !QThread::currentThread()->isInterruptionRequested()) {
            result.media = nt::assets::resolveDroppedMedia(client, cacheRoot, asset, clip, *protection, mediaGeneration);
        }
        return result;
    }, [self, model, generation](const Result& result) {
        if (!self || !model || self->m_timeline != model || model->documentGeneration() != generation) { return; }
        if (result.media) { model->registerMedia(*result.media); }
    });
}

void AssetBrowser::queueLinkedAudio(const QJsonObject& asset, const QString& audioClipId,
                                   QPointer<TimelineModel> model, quint64 generation, quint64 token,
                                   const QJsonObject& capturedResult, const QString& createdAudioTrackId) {
    const QPointer<AssetBrowser> self(this);
    const auto settle = [self, model, generation, audioClipId, token, capturedResult, createdAudioTrackId](const Result& result) {
        if (!self || !model || self->m_timeline != model || model->documentGeneration() != generation) { return; }
        auto payload = result.settlement;
        payload.insert("audioClipId", audioClipId);
        payload.insert("createdAudioTrackId", createdAudioTrackId);
        const auto settled = nt::assets::settleLinkedAudio(capturedResult, payload);
        self->m_settlements.insert(audioClipId, {token, payload, capturedResult});
        self->reconcileLinkedAudio();
        if (payload.value("outcome").toString() == "audio") {
            for (const auto& value : settled.value("clips").toArray()) {
                const auto clip = value.toObject();
                if (clip.value("id").toString() == audioClipId) {
                    self->queueMedia(payload.value("asset").toObject(), clip, model, generation);
                    break;
                }
            }
        }
    };
    if (!m_target) {
        Result result;
        result.settlement = {{"outcome", "failed"}};
        settle(result);
        return;
    }
    request([asset](nt::server::ServerClient& client) {
        Result result;
        result.settlement = nt::assets::extractLinkedAudio(client, asset);
        return result;
    }, settle);
}

void AssetBrowser::updateAsset(const QJsonObject& fields) {
    if (fields.value("id").toString().isEmpty()) { return; }
    request([fields](nt::server::ServerClient& client) {
        auto update = fields;
        if (update.contains("parent_id") && update.value("parent_id").toString().isEmpty()) {
            const auto fresh = client.getAsset(update.value("id").toString());
            if (!fresh.ok()) { return Result{{}, fresh.describe(), false}; }
            const auto owner = fresh.data.toObject().value("user_id").toString();
            if (owner.isEmpty()) { return Result{{}, "Cannot move this asset: the server returned no owner.", false}; }
            update.insert("parent_id", owner);
        }
        const auto response = client.mutate("assets.update", update);
        return response.ok() ? Result{} : Result{{}, response.describe(), false};
    }, [this, fields](const Result& result) {
        if (!result.error.isEmpty()) { return; }
        if (fields.contains("name")) {
            m_folderNames.insert(fields.value("id").toString(), fields.value("name").toString());
            emit folderChanged();
        }
        refresh();
    }, m_documentEpoch);
}

void AssetBrowser::createFolder(const QString& name) {
    if (name.trimmed().isEmpty()) { return; }
    request([name = name.trimmed(), folder = m_folderId, project = projectId()](nt::server::ServerClient& client) {
        QJsonObject fields{{"name", name}, {"content_type", "folder"}, {"parent_id", folder}};
        if (!project.isEmpty()) { fields.insert("project_id", project); }
        const auto response = client.createAsset(fields);
        return response.ok() ? Result{} : Result{{}, response.describe(), false};
    }, [this](const Result& result) { if (result.error.isEmpty()) { refresh(); } }, m_documentEpoch);
}

void AssetBrowser::renameAsset(const QString& id, const QString& name) {
    if (name.trimmed().isEmpty()) { return; }
    updateAsset({{"id", id}, {"name", name.trimmed()}});
}

void AssetBrowser::moveAsset(const QString& id, const QString& parentId) {
    updateAsset({{"id", id}, {"parent_id", parentId}});
}

void AssetBrowser::deleteAsset(const QString& id) {
    if (id.isEmpty()) { return; }
    request([id](nt::server::ServerClient& client) {
        const auto response = client.mutate("assets.delete", {{"id", id}});
        return response.ok() ? Result{} : Result{{}, response.describe(), false};
    }, [this](const Result& result) { if (result.error.isEmpty()) { refresh(); } }, m_documentEpoch);
}

void AssetBrowser::setFavorite(const QString& id, bool favorite) {
    updateAsset({{"id", id}, {"favorite", favorite}});
}

void AssetBrowser::setAssetTags(const QString& id, const QStringList& tags) {
    if (id.isEmpty()) { return; }
    QJsonArray normalized;
    QSet<QString> seen;
    for (const auto& tag : tags) {
        const auto trimmed = tag.trimmed();
        if (!trimmed.isEmpty() && !seen.contains(trimmed)) { normalized.append(trimmed); seen.insert(trimmed); }
    }
    request([id, normalized](nt::server::ServerClient& client) {
        for (int attempt = 0; attempt < 3; ++attempt) {
            const auto fresh = client.getAsset(id);
            if (!fresh.ok()) { return Result{{}, fresh.describe(), false}; }
            const auto previous = fresh.data.toObject().value("metadata");
            auto metadata = previous.toObject();
            metadata.insert("tags", normalized);
            const auto response = client.mutate("assets.update", {{"id", id}, {"metadata", metadata},
                {"expected_metadata", previous.isObject() ? previous : QJsonValue(QJsonValue::Null)}});
            if (response.ok()) { return Result{}; }
            if (response.error.code != "CONFLICT" && response.error.apiCode != "ALREADY_EXISTS") { return Result{{}, response.describe(), false}; }
        }
        return Result{{}, "Asset metadata changed repeatedly. Try saving the tags again.", false};
    }, [this](const Result& result) { if (result.error.isEmpty()) { refresh(); } }, m_documentEpoch);
}

void AssetBrowser::transferState(const QString& id, const QString& status, const QString& error) {
    for (auto& value : m_transfers) {
        auto row = value.toMap();
        if (row.value("id").toString() != id) { continue; }
        row.insert("status", status);
        row.insert("error", error);
        value = row;
        emit transfersChanged();
        return;
    }
}

void AssetBrowser::retryImport(const QString& id) {
    for (const auto& value : m_transfers) {
        const auto row = value.toMap();
        if (row.value("id").toString() == id && row.value("status").toString() == "failed" && m_imports.contains(id)) {
            m_files.push_back(m_imports.value(id));
            transferState(id, "queued");
            importNext();
            return;
        }
    }
}

void AssetBrowser::clearFinishedTransfers() {
    for (auto it = m_transfers.begin(); it != m_transfers.end();) {
        const auto row = it->toMap();
        const auto status = row.value("status").toString();
        if (status == "complete" || status == "failed") {
            m_imports.remove(row.value("id").toString());
            it = m_transfers.erase(it);
        } else { ++it; }
    }
    emit transfersChanged();
}
