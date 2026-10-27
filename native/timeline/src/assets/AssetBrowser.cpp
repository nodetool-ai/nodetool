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
    if (m_thread) { m_thread->requestInterruption(); m_thread->wait(); }
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
}

void AssetBrowser::resetDocumentState() {
    m_settlements.clear();
    QSet<QString> paths;
    if (m_timeline) {
        for (const auto& clip : m_timeline->timeline().clips) {
            if (!clip.mediaPath.empty()) { paths.insert(QString::fromStdString(clip.mediaPath)); }
            if (!clip.audioPath.empty()) { paths.insert(QString::fromStdString(clip.audioPath)); }
        }
    }
    m_mediaProtection->reset(std::move(paths));
}

void AssetBrowser::protectDocumentMedia() {
    if (!m_timeline) { return; }
    for (const auto& clip : m_timeline->timeline().clips) {
        m_mediaProtection->protect(QString::fromStdString(clip.mediaPath));
        m_mediaProtection->protect(QString::fromStdString(clip.audioPath));
    }
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
    m_timeline->replaceClips(current.value("clips").toArray());
}

void AssetBrowser::request(std::function<Result(nt::server::ServerClient&)> work,
                           std::function<void(const Result&)> done) {
    if (!m_target) { return; }
    if (busy()) { m_requests.push_back({std::move(work), std::move(done)}); return; }
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
    connect(thread, &QThread::finished, this, [self, worker, result, done = std::move(done)] {
        if (!self) { return; }
        self->receive(*result);
        if (done) { done(*result); }
        self->m_thread.clear();
        if (worker) { worker->deleteLater(); }
        if (!self->m_requests.empty()) {
            auto next = std::move(self->m_requests.front());
            self->m_requests.pop_front();
            self->request(std::move(next.work), std::move(next.done));
        } else { self->importNext(); }
        emit self->stateChanged();
    });
    emit stateChanged();
    thread->start();
}

void AssetBrowser::receive(const Result& result) {
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

void AssetBrowser::refresh() {
    request([folder = m_folderId](nt::server::ServerClient& client) {
        QJsonObject input{{"page_size", 10000}};
        if (!folder.isEmpty()) { input.insert("parent_id", folder); }
        const auto response = client.query("assets.list", input);
        Result result = response.ok() ? Result{response.data.toObject().value("assets").toArray(), {}, true}
                                     : Result{{}, response.describe(), false};
        result.folder = folder;
        return result;
    });
}

void AssetBrowser::setFolderId(const QString& id) {
    if (id == m_folderId) { return; }
    m_folderId = id;
    m_assets = {};
    m_pending.clear();
    emit folderChanged();
    emit assetsChanged();
    refresh();
}

void AssetBrowser::openFolder(const QString& id) {
    if (id.isEmpty() || id == m_folderId) { return; }
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
        if (url.isLocalFile()) { m_files.push_back({url.toLocalFile(), fields, m_folderId}); }
    }
    importNext();
}

AssetBrowser::QueuedImport AssetBrowser::takeNextImport() {
    auto queued = std::move(m_files.front());
    m_files.pop_front();
    return queued;
}

void AssetBrowser::importNext() {
    if (busy() || m_files.empty()) { return; }
    const auto queued = takeNextImport();
    request([queued](nt::server::ServerClient& client) {
        const auto imported = nt::assets::importFile(client, queued.file, queued.fields);
        Result result = imported.ok() ? Result{QJsonArray{imported.asset}, imported.proxyError, false}
                                      : Result{{}, imported.error, false};
        result.folder = queued.folder;
        return result;
    });
}

void AssetBrowser::pollProxies() {
    if (busy() || m_pending.isEmpty()) { return; }
    QStringList ids;
    for (auto it = m_pending.begin(); it != m_pending.end();) {
        if (it.value() >= 360) { it = m_pending.erase(it); }
        else { ++it.value(); ids.append(it.key()); ++it; }
    }
    request([ids, folder = m_folderId](nt::server::ServerClient& client) {
        Result result;
        result.folder = folder;
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
