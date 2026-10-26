#include "assets/AssetBrowser.h"
#include "assets/AssetClip.h"
#include "assets/AssetImport.h"
#include "assets/AssetDuration.h"
#include "edit/EditActions.h"
#include "model/TimelineModel.h"
#include "model/TrackWindowModel.h"
#include "server/ServerSource.h"
#include <QJsonDocument>
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
    m_timeline = model;
    emit timelineChanged();
}

void AssetBrowser::request(std::function<Result(nt::server::ServerClient&)> work,
                           std::function<void(const Result&)> done) {
    if (!m_target || busy()) { return; }
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
        self->m_thread.clear();
        self->receive(*result);
        if (done) { done(*result); }
        if (worker) { worker->deleteLater(); }
        self->importNext();
    });
    emit stateChanged();
    thread->start();
}

void AssetBrowser::receive(const Result& result) {
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
    request([](nt::server::ServerClient& client) {
        const auto response = client.query("assets.list", {{"page_size", 10000}});
        return response.ok() ? Result{response.data.toObject().value("assets").toArray(), {}, true}
                             : Result{{}, response.describe(), false};
    });
}

void AssetBrowser::importFiles(const QList<QUrl>& urls) {
    if (!configured()) { return; }
    for (const auto& url : urls) {
        if (url.isLocalFile()) { m_files.append(url.toLocalFile()); }
    }
    importNext();
}

void AssetBrowser::importNext() {
    if (busy() || m_files.isEmpty()) { return; }
    const auto file = m_files.takeFirst();
    QJsonObject fields;
    if (m_timeline) {
        const auto raw = QJsonDocument::fromJson(m_timeline->documentJson()).object();
        if (!raw.value("projectId").toString().isEmpty()) { fields.insert("project_id", raw.value("projectId")); }
    }
    request([file, fields](nt::server::ServerClient& client) {
        const auto imported = nt::assets::importFile(client, file, fields);
        return imported.ok() ? Result{QJsonArray{imported.asset}, imported.proxyError, false}
                             : Result{{}, imported.error, false};
    });
}

void AssetBrowser::pollProxies() {
    if (busy() || m_pending.isEmpty()) { return; }
    QStringList ids;
    for (auto it = m_pending.begin(); it != m_pending.end();) {
        if (it.value() >= 360) { it = m_pending.erase(it); }
        else { ++it.value(); ids.append(it.key()); ++it; }
    }
    request([ids](nt::server::ServerClient& client) {
        Result result;
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
                request([rawAsset](nt::server::ServerClient& client) {
                    return Result{QJsonArray{nt::assets::withProbedVideoDuration(client, rawAsset)}, {}, false};
                }, [self, model, generation, payload](const Result& result) {
                    if (!self || !model || self->m_timeline != model || model->documentGeneration() != generation) { return; }
                    auto resolved = payload;
                    resolved.insert("asset", result.assets.first());
                    model->applyEdit("assets.dropAsset", resolved);
                });
                applied = true;
            }
        } else {
            applied = m_timeline->applyEdit("assets.dropAsset", payload);
        }
    }
    emit stateChanged();
    return applied;
}
