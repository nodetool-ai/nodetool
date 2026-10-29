#include "aiassist/ShotWorkflow.h"
#include "aiassist/ShotPlan.h"
#include "aiassist/AssistDocument.h"
#include "aiassist/LinkedWorkflow.h"
#include "app/EditRegistry.h"
#include "edit/speed/TimeRemap.h"
#include "edit/EditActions.h"
#include "server/ServerSource.h"
#include "server/ServerClient.h"
#include <QDateTime>
#include <QCryptographicHash>
#include <QLockFile>
#include <QDir>
#include <QFile>
#include <QFileInfo>
#include <QJsonDocument>
#include <QProcess>
#include <QSaveFile>
#include <QTemporaryDir>
#include <QUuid>
#include <algorithm>
#include <cmath>
#include <atomic>
namespace {
QString id() { return QUuid::createUuid().toString(QUuid::Id128); }
QJsonObject acceptanceSnapshot(const QJsonObject& raw, const QJsonObject& payload) {
    nt::edit::EditDoc document;
    for (const auto& value : raw.value("clips").toArray()) { document.clips.push_back(value.toObject()); }
    for (const auto& value : raw.value("tracks").toArray()) {
        const auto track = value.toObject();
        document.tracks.push_back({track.value("id").toString(), track.value("type").toString(), track.value("locked").toBool()});
    }
    const auto locked = nt::edit::lockedUserTargetIds(document);
    QJsonArray clips; QJsonObject locks;
    for (const auto& clip : document.clips) {
        const auto media = clip.value("mediaType").toString();
        const auto element = clip.value("storyboardElementId").toString();
        if (clip.value("storyboardBoardId") != payload.value("boardId") || clip.value("storyboardShotId") != payload.value("shotId") ||
            !clip.value("scriptLineId").toString().isEmpty() || (media != "video" && media != "audio") ||
            (!element.isEmpty() && element != "$source" && element != "$source-audio")) { continue; }
        clips.append(clip); locks.insert(clip.value("id").toString(), locked.contains(clip.value("id").toString()));
    }
    return {{"clips", clips}, {"locks", locks}};
}
struct AcceptanceGuard {
    std::atomic_bool current{true};
    QMetaObject::Connection changed;
    QMetaObject::Connection destroyed;
    ~AcceptanceGuard() { QObject::disconnect(changed); QObject::disconnect(destroyed); }
};
const bool registered = [] {
    nt::app::registerEdit("shot.link", nt::aiassist::linkShot);
    nt::app::registerEdit("shot.insertDerived", nt::aiassist::insertDerivedClip);
    nt::app::registerEdit("shot.accept", nt::aiassist::syncStoryboardShot);
    return true;
}();
}
ShotWorkflow::ShotWorkflow(QObject* parent) : QObject(parent), m_protection(std::make_shared<nt::assets::MediaProtection>()), m_transport(this), m_poll(this) {
    m_poll.setInterval(3000);
    connect(&m_poll, &QTimer::timeout, this, &ShotWorkflow::lookup);
    connect(&m_transport, &nt::ai::GenerationTransport::response, this, &ShotWorkflow::receive);
    connect(&m_transport, &nt::ai::GenerationTransport::readyChanged, this, [this] {
        if (m_transport.ready() && current()) {
            if (m_state == "connecting") { m_state = "rendering"; if (!m_transport.send("generate_media", m_request, m_requestId)) { fail("Could not send shot render."); } }
            else if (m_state == "recovering") { lookup(); m_poll.start(); }
        }
        emit changed();
    });
    connect(&m_transport, &nt::ai::GenerationTransport::disconnected, this, [this] {
        if (m_state == "rendering") { m_state = "recovering"; m_error = "Connection lost. Recover this render before starting another."; emit changed(); }
    });
    connect(&m_transport, &nt::ai::GenerationTransport::error, this, [this](const QString& error) {
        if (m_state == "connecting") { QFile::remove(m_checkpoint); m_checkpoint.clear(); fail(error); }
        else if (busy()) { m_error = error; emit changed(); }
    });
}
ShotWorkflow::~ShotWorkflow() { if (m_worker) { m_worker->requestInterruption(); m_worker->wait(); } }
bool ShotWorkflow::busy() const { return m_worker || m_state == "connecting" || m_state == "rendering" || m_state == "recovering" || m_state == "saving" || m_state == "queued" || m_state == "deriving"; }
bool ShotWorkflow::current() const { return m_timeline && m_timeline->documentGeneration() == m_generation; }
void ShotWorkflow::setTimeline(TimelineModel* timeline) {
    if (timeline == m_timeline) { return; }
    cancel(); m_checkpoint.clear(); if (m_timeline) { disconnect(m_timeline, nullptr, this, nullptr); }
    m_timeline = timeline;
    resetProtection();
    if (!m_call || !m_target) { m_target = nt::server::serverSaveTarget(); }
    if (timeline) { connect(timeline, &TimelineModel::documentReplaced, this, [this] { cancel(); m_checkpoint.clear(); m_board = {}; m_candidate = {}; resetProtection(); if (!m_call || !m_target) { m_target = nt::server::serverSaveTarget(); } emit changed(); }); }
    emit changed();
}
void ShotWorkflow::resetProtection() {
    QSet<QString> paths;
    if (m_timeline) { for (const auto& clip : m_timeline->timeline().clips) { if (!clip.mediaPath.empty()) { paths.insert(QString::fromStdString(clip.mediaPath)); } if (!clip.audioPath.empty()) { paths.insert(QString::fromStdString(clip.audioPath)); } } }
    m_protection->reset(paths);
}
void ShotWorkflow::fail(const QString& error) { m_poll.stop(); m_state = "failed"; m_error = error; emit changed(); }
QVariantList ShotWorkflow::candidates(const QJsonObject& board, const QString& shotId, const QString& kind) const {
    QVariantList result;
    QStringList ids; for (const auto& value : board.value("document").toObject().value("shots").toArray()) { ids.append(value.toObject().value("id").toString()); }
    const auto resolved = nt::aiassist::resolveId(shotId, ids); if (!resolved) { return result; }
    for (const auto& value : board.value("document").toObject().value("shots").toArray()) {
        const auto shot = value.toObject(); if (shot.value("id").toString() != *resolved) { continue; }
        const QString key = kind == "image" ? "keyframe" : "clip"; auto versions = shot.value(key + "_versions").toArray();
        if (!shot.contains(key + "_versions") && shot.value(key).isObject()) { versions.append(shot.value(key)); }
        for (qsizetype i = 0; i < versions.size(); ++i) { auto candidate = versions.at(i).toObject(); candidate.insert("versionIndex", static_cast<int>(i)); candidate.insert("selected", candidate.value("asset_id") == shot.value(key).toObject().value("asset_id")); result.append(candidate.toVariantMap()); }
        break;
    }
    return result;
}
bool ShotWorkflow::checkpoint() {
    if (!m_target || !QDir().mkpath(m_target->backupDir)) { return false; }
    if (m_checkpoint.isEmpty()) { m_checkpoint = QDir(m_target->backupDir).filePath("shot-render-" + m_requestId + ".json"); }
    QSaveFile file(m_checkpoint);
    const auto bytes = QJsonDocument(QJsonObject{{"board", m_board}, {"shotId", m_shotId}, {"kind", m_kind}, {"request", m_request}, {"renderInputs", m_renderInputs}, {"requestId", m_requestId}, {"candidate", m_candidate}, {"requests", m_requests}, {"productionCandidates", m_productionCandidates}, {"requestIndex", m_requestIndex}, {"dispatched", m_dispatched}, {"stopQueue", m_stopQueue}}).toJson(QJsonDocument::Compact);
    return file.open(QIODevice::WriteOnly) && file.write(bytes) == bytes.size() && file.commit();
}
void ShotWorkflow::render(const QJsonObject& board, const QString& shotId, const QString& kind, const QJsonObject& model) {
    if (busy()) { return; }
    if (!m_call || !m_target) { m_target = nt::server::serverSaveTarget(); }
    if (!m_timeline || !m_target || !m_target->expectedInstance.isEmpty()) { fail("Open an authenticated server timeline without an instance pin to render shots."); return; }
    const bool hasReviewedRequest = model.contains("reviewedRequest") || model.contains("reviewedRequests");
    const auto reviewedRequests = model.contains("reviewedRequests") ? model.value("reviewedRequests").toArray() : QJsonArray{model.value("reviewedRequest")};
    auto selectedModel = model; selectedModel.remove("reviewedRequest"); selectedModel.remove("reviewedRequests"); selectedModel.remove("productionBatchId");
    const auto plan = nt::aiassist::planShotRender(board, shotId, kind, selectedModel);
    const bool resolvesEntityPrompt = plan.error == "Describe the shot before rendering." &&
        !board.value("document").toObject().value("entityIds").toArray().isEmpty();
    if (!plan.error.isEmpty() && plan.error != "Reference rendering needs persisted reference images." && !resolvesEntityPrompt) { fail(plan.error); return; }
    const QDir folder(m_target->backupDir);
    for (const auto& name : folder.entryList({"shot-render-*.json"}, QDir::Files)) {
        QFile file(folder.filePath(name)); if (!file.open(QIODevice::ReadOnly)) { continue; }
        const auto pending = QJsonDocument::fromJson(file.readAll()).object();
        if (pending.value("board").toObject().value("id") == board.value("id") && pending.value("shotId").toString() == plan.shotId) { fail("Recover the interrupted shot render before starting another."); return; }
    }
    m_checkpoint.clear();
    ++m_epoch; m_generation = m_timeline->documentGeneration(); m_board = board;
    auto document = m_board.value("document").toObject(); auto shots = document.value("shots").toArray();
    for (qsizetype i = 0; i < shots.size(); ++i) { auto shot = shots.at(i).toObject(); if (shot.value("id").toString() == plan.shotId) { shot.insert(kind == "image" ? "still_model" : "clip_model", selectedModel); shots[i] = shot; break; } }
    document.insert("shots", shots); m_board.insert("document", document);
    m_shotId = plan.shotId; m_kind = kind; m_request = plan.request; m_renderInputs = plan.renderInputs; m_requestId = id(); m_candidate = {}; m_error.clear(); m_requests = {}; m_productionCandidates = {}; m_requestIndex = 0; m_dispatched = false; m_stopQueue = false;
    const auto epoch = m_epoch; const auto generation = m_generation; const auto timeline = m_timeline;
    const auto target = *m_target; const auto call = m_call; const auto boardSnapshot = board; const auto shot = plan.shot; const QPointer<ShotWorkflow> guard(this);
    auto runtimeModel = selectedModel; runtimeModel.insert("productionBatchId", id());
    m_state = "planning";
    auto* worker = QThread::create([guard, epoch, generation, timeline, target, call, boardSnapshot, shot, kind, runtimeModel, hasReviewedRequest, reviewedRequests] {
        nt::server::ServerClient server(target.server, target.token);
        const auto fresh = call ? call(false, "storyboards.get", {{"id", boardSnapshot.value("id")}}) : server.query("storyboards.get", {{"id", boardSnapshot.value("id")}});
        QString error; std::optional<double> duration; nt::aiassist::ShotRenderPlan enrichedPlan;
        if (!fresh.ok()) { error = fresh.describe(); }
        else if (fresh.data.toObject().value("updatedAt") != boardSnapshot.value("updatedAt")) { error = "The storyboard changed. Reload it before rendering."; }
        else {
            QJsonArray library;
            const auto cast = boardSnapshot.value("document").toObject().value("entityIds").toArray();
            if (!cast.isEmpty()) {
                const QJsonObject search{{"query", ""}, {"page_size", 1000}, {"project_id", boardSnapshot.value("projectId").toString("default")}};
                const auto assets = call ? call(false, "assets.search", search) : server.query("assets.search", search);
                if (!assets.ok()) { error = assets.describe(); }
                else {
                    library = nt::aiassist::shotEntityLibrary(assets.data.toObject().value("assets").toArray());
                }
            }
            const auto scriptId = boardSnapshot.value("document").toObject().value("screenplay").toObject().value("script_id").toString();
            if (error.isEmpty() && kind == "video" && !scriptId.isEmpty()) {
                const auto script = call ? call(false, "scripts.get", {{"id", scriptId}}) : server.query("scripts.get", {{"id", scriptId}});
                if (!script.ok()) { error = script.describe(); }
                else { duration = nt::aiassist::linkedShotRenderSeconds(shot, script.data.toObject()); }
            }
            if (error.isEmpty()) { enrichedPlan = nt::aiassist::planShotRender(boardSnapshot, shot.value("id").toString(), kind, runtimeModel, library, duration); error = enrichedPlan.error; }
        }
        if (!guard) { return; }
        QMetaObject::invokeMethod(guard, [guard, epoch, generation, timeline, error, duration, enrichedPlan, hasReviewedRequest, reviewedRequests] {
            if (!guard || epoch != guard->m_epoch || !timeline || guard->m_timeline != timeline || generation != timeline->documentGeneration()) { return; }
            if (!error.isEmpty()) { guard->fail(error); return; }
            guard->m_request = enrichedPlan.request; guard->m_renderInputs = enrichedPlan.renderInputs;
            if (hasReviewedRequest && enrichedPlan.requests != reviewedRequests) {
                guard->fail("Review the updated shot request before rendering. Its inputs changed after approval.");
                return;
            }
            guard->m_requests = enrichedPlan.requests; guard->m_productionCandidates = enrichedPlan.productionCandidates;
            guard->selectQueuedRequest();
            guard->startRender();
        }, Qt::QueuedConnection);
    });
    m_worker = worker;
    connect(worker, &QThread::finished, this, [this, worker] { if (m_worker == worker) { m_worker = nullptr; emit changed(); } });
    connect(worker, &QThread::finished, worker, &QObject::deleteLater); worker->start(); emit changed();
}
void ShotWorkflow::selectQueuedRequest() {
    if (m_requestIndex < 0 || m_requestIndex >= m_requests.size()) { return; }
    m_request = m_requests.at(m_requestIndex).toObject();
    const auto identity = (m_requestIndex < m_productionCandidates.size() ? m_productionCandidates.at(m_requestIndex) : QJsonValue{}).toObject().value("identity").toObject();
    m_requestId = identity.value("requestId").toString(m_requestId);
    m_candidate = {}; m_dispatched = false;
}
void ShotWorkflow::startRender() {
    if (!current() || !m_target) { return; }
    if (!QDir().mkpath(m_target->backupDir)) { fail("Could not create shot recovery folder."); return; }
    const QDir folder(m_target->backupDir);
    const auto key = QCryptographicHash::hash((m_board.value("id").toString() + ':' + m_shotId).toUtf8(), QCryptographicHash::Sha256).toHex();
    QLockFile lock(folder.filePath("shot-submission-" + QString::fromLatin1(key) + ".lock")); lock.setStaleLockTime(0);
    if (!lock.tryLock(0)) { fail("Another editor is starting this shot render."); return; }
    for (const auto& name : folder.entryList({"shot-render-*.json"}, QDir::Files)) {
        QFile file(folder.filePath(name)); if (file.fileName() == m_checkpoint) { continue; } if (!file.open(QIODevice::ReadOnly)) { continue; }
        const auto pending = QJsonDocument::fromJson(file.readAll()).object();
        if (pending.value("board").toObject().value("id") == m_board.value("id") && pending.value("shotId").toString() == m_shotId) { fail("Recover the interrupted shot render before starting another."); return; }
    }
    m_dispatched = true;
    if (!checkpoint()) { fail("Could not save shot recovery data."); return; }
    if (m_transport.ready()) {
        m_state = "rendering";
        if (!m_transport.send("generate_media", m_request, m_requestId)) { fail("Could not send shot render."); }
    } else { m_state = "connecting"; m_transport.configure(m_target->server, m_target->token); m_transport.open(); }
    emit changed();
}
void ShotWorkflow::lookup() { if (current() && m_transport.ready() && !m_requestId.isEmpty()) { m_lookupId = id(); m_transport.send("lookup_generations", {{"request_ids", QJsonArray{m_requestId}}}, m_lookupId); } }
void ShotWorkflow::recover(const QJsonObject& board, const QString& shotId, const QString& kind) {
    if (m_worker || m_state == "rendering" || m_state == "connecting") { return; }
    if (!m_call || !m_target) { m_target = nt::server::serverSaveTarget(); } if (!m_timeline || !m_target || !m_target->expectedInstance.isEmpty()) { fail("Open a server timeline to recover this render."); return; }
    QStringList authorized;
    for (const auto& value : board.value("document").toObject().value("shots").toArray()) { authorized.append(value.toObject().value("id").toString()); }
    const auto resolved = nt::aiassist::resolveId(shotId, authorized);
    if (!resolved) { fail("The shot is missing or ambiguous."); return; }
    m_checkpoint.clear();
    const QDir folder(m_target->backupDir);
    for (const auto& name : folder.entryList({"shot-render-*.json"}, QDir::Files)) {
        QFile file(folder.filePath(name)); if (!file.open(QIODevice::ReadOnly)) { continue; }
        const auto pending = QJsonDocument::fromJson(file.readAll()).object();
        if (pending.value("board").toObject().value("id") != board.value("id") || pending.value("shotId").toString() != *resolved || pending.value("kind").toString() != kind) { continue; }
        ++m_epoch; m_generation = m_timeline->documentGeneration(); m_board = board; m_shotId = *resolved; m_kind = kind; m_request = pending.value("request").toObject(); m_renderInputs = pending.value("renderInputs").toObject(); m_requestId = pending.value("requestId").toString(); m_checkpoint = file.fileName(); m_candidate = pending.value("candidate").toObject();
        m_requests = pending.value("requests").toArray(); if (m_requests.isEmpty()) { m_requests.append(m_request); }
        m_productionCandidates = pending.value("productionCandidates").toArray(); m_requestIndex = pending.value("requestIndex").toInt();
        m_dispatched = pending.value("dispatched").toBool(true); m_stopQueue = pending.value("stopQueue").toBool();
        if (!m_candidate.isEmpty()) { persist(nt::aiassist::appendShotCandidate(m_board, m_shotId, m_kind, m_candidate)); return; }
        if (!m_dispatched && !m_stopQueue) { startRender(); return; }
        m_state = "recovering"; m_transport.configure(m_target->server, m_target->token); m_transport.open(); emit changed(); return;
    }
    fail("No interrupted render exists for this shot.");
}
void ShotWorkflow::receive(const QJsonObject& frame) {
    if (!current() || (m_state != "rendering" && m_state != "recovering")) { return; }
    QJsonObject outcome;
    if (frame.value("request_id").toString() == m_requestId) {
        if (frame.value("error").isObject()) {
            m_stopQueue = true; m_requests = {}; m_productionCandidates = {}; m_dispatched = false;
            if (!m_checkpoint.isEmpty()) { QFile::remove(m_checkpoint); m_checkpoint.clear(); }
            fail(frame.value("error").toObject().value("message").toString());
            return;
        }
        outcome = frame.value("result").toObject();
    } else if (frame.value("request_id").toString() == m_lookupId) {
        for (const auto& value : frame.value("result").toObject().value("generations").toArray()) {
            const auto row = value.toObject(); if (row.value("request_id").toString() != m_requestId) { continue; }
            const auto status = row.value("status").toString();
            if (status == "completed") { outcome = row; m_poll.stop(); }
            else if (status == "failed" || status == "cancelled" || status == "interrupted" || status == "needs_attention") { QFile::remove(m_checkpoint); fail(row.value("error").toString("Shot generation did not complete.")); }
            break;
        }
        if (outcome.isEmpty()) { return; }
    } else { return; }
    const auto assets = outcome.value("asset_ids").toArray(); if (assets.isEmpty() || assets.first().toString().isEmpty()) { fail("Shot generation returned no stored asset."); return; }
    m_candidate = {{"type", m_kind}, {"asset_id", assets.first()}, {"uri", "asset://" + assets.first().toString()}, {"requestId", m_requestId}, {"candidateId", m_requestId}, {"render_inputs", m_renderInputs},
        {"metadata", QJsonObject{{"request", m_request}, {"generatedAt", QDateTime::currentDateTimeUtc().toString(Qt::ISODateWithMs)}}}};
    if (m_requestIndex < m_productionCandidates.size()) {
        const auto production = m_productionCandidates.at(m_requestIndex).toObject(); const auto identity = production.value("identity").toObject();
        for (auto it = identity.begin(); it != identity.end(); ++it) { m_candidate.insert(it.key(), it.value()); }
        m_candidate.insert("productionSnapshot", production.value("snapshot"));
    }
    if (!checkpoint()) { fail("The generated asset is in the library, but recovery data could not be saved."); return; }
    persist(nt::aiassist::appendShotCandidate(m_board, m_shotId, m_kind, m_candidate));
}
void ShotWorkflow::persist(const QJsonObject& board, const QJsonObject& localEdit) {
    if (!current() || !m_target || m_worker || board.value("updatedAt").toString().isEmpty()) { fail("Reload the storyboard before saving this change."); return; }
    const auto protection = m_protection; const auto mediaGeneration = protection->generation(); const auto resolver = m_mediaResolver;
    QJsonArray mediaClips;
    QJsonObject expectedAcceptance;
    std::shared_ptr<AcceptanceGuard> acceptance;
    if (localEdit.value("edit").toString() == "shot.accept") {
        const auto payload = localEdit.value("payload").toObject();
        expectedAcceptance = acceptanceSnapshot(m_timeline->timeline().raw, payload);
        acceptance = std::make_shared<AcceptanceGuard>();
        const std::weak_ptr<AcceptanceGuard> weak = acceptance;
        const QPointer<TimelineModel> model = m_timeline;
        acceptance->changed = connect(model, &TimelineModel::timelineChanged, this, [weak, model, payload, expectedAcceptance] {
            if (const auto state = weak.lock(); state && (!model || acceptanceSnapshot(model->timeline().raw, payload) != expectedAcceptance)) {
                state->current.store(false);
            }
        });
        acceptance->destroyed = connect(model, &QObject::destroyed, this, [weak] {
            if (const auto state = weak.lock()) { state->current.store(false); }
        });
        const auto after = nt::aiassist::syncStoryboardShot(m_timeline->timeline().raw, localEdit.value("payload").toObject());
        const auto assetId = localEdit.value("payload").toObject().value("assetId");
        QHash<QString, QJsonObject> before;
        for (const auto& value : m_timeline->clipsJson()) { before.insert(value.toObject().value("id").toString(), value.toObject()); }
        for (const auto& value : after.value("clips").toArray()) { const auto raw = value.toObject(); if (raw.value("currentAssetId") == assetId && raw != before.value(raw.value("id").toString())) { mediaClips.append(raw); } }
    }
    const auto target = *m_target; const auto call = m_call; const auto candidate = m_candidate; const auto shotId = m_shotId; const auto kind = m_kind; const auto generation = m_generation; const auto epoch = m_epoch; const auto model = m_timeline; const QPointer<ShotWorkflow> guard(this);
    m_state = "saving"; emit changed();
    auto* worker = QThread::create([guard, target, call, board, candidate, shotId, kind, generation, epoch, model, localEdit, mediaClips, resolver, protection, mediaGeneration, expectedAcceptance, acceptance] {
        nt::server::ServerClient server(target.server, target.token); server.setExpectedInstance(target.expectedInstance);
        std::vector<nt::Clip> resolvedMedia;
        nt::server::QueryResult mediaError;
        for (const auto& value : mediaClips) {
            const auto raw = value.toObject(); const auto assetId = raw.value("currentAssetId").toString();
            const auto asset = call ? call(false, "assets.get", {{"id", assetId}}) : server.getAsset(assetId);
            if (!asset.ok()) { mediaError = asset; break; }
            const auto root = QDir::cleanPath(QDir(target.backupDir).absoluteFilePath("../../.."));
            auto media = resolver ? resolver(server, root, asset.data.toObject(), raw, *protection, mediaGeneration)
                : nt::assets::resolveDroppedMedia(server, root, asset.data.toObject(), raw, *protection, mediaGeneration);
            const auto path = QString::fromStdString(raw.value("mediaType") == "audio" ? media.audioPath : media.mediaPath);
            if (path.isEmpty() || !QFileInfo::exists(path)) { mediaError.error = {"Selected shot media could not be resolved", "MEDIA_UNAVAILABLE", {}, 0}; break; }
            resolvedMedia.push_back(std::move(media));
        }
        auto document = board.value("document").toObject();
        if (!candidate.value("asset_id").toString().isEmpty()) {
            const auto asset = call ? call(false, "assets.get", {{"id", candidate.value("asset_id")}}) : server.getAsset(candidate.value("asset_id").toString());
            if (asset.ok() && asset.data.toObject().value("duration").toDouble() > 0) {
                auto shots = document.value("shots").toArray(); const auto versionsKey = kind == "image" ? "keyframe_versions" : "clip_versions";
                for (qsizetype i = 0; i < shots.size(); ++i) {
                    auto shot = shots.at(i).toObject(); if (shot.value("id").toString() != shotId) { continue; }
                    auto versions = shot.value(versionsKey).toArray();
                    for (qsizetype j = 0; j < versions.size(); ++j) { auto version = versions.at(j).toObject(); if (version.value("asset_id") == candidate.value("asset_id")) { version.insert("duration", asset.data.toObject().value("duration")); versions[j] = version; } }
                    shot.insert(versionsKey, versions); shots[i] = shot;
                }
                document.insert("shots", shots);
            }
        }
        const QJsonObject input{{"id", board.value("id")}, {"baseUpdatedAt", board.value("updatedAt")}, {"document", document}};
        const auto response = acceptance && !acceptance->current.load()
            ? nt::server::QueryResult{{}, {"The linked shot clips changed. Select the take again.", "STALE_DOCUMENT", {}, 0}}
            : !mediaError.ok() ? mediaError : QThread::currentThread()->isInterruptionRequested()
            ? nt::server::QueryResult{{}, {"Shot save cancelled", "CANCELLED", {}, 0}}
            : call ? call(true, "storyboards.update", input) : server.mutate("storyboards.update", input);
        if (!guard) { return; }
        QMetaObject::invokeMethod(guard, [guard, response, generation, epoch, model, localEdit, resolvedMedia, expectedAcceptance, acceptance] {
            if (!guard || epoch != guard->m_epoch || !model || guard->m_timeline != model || generation != model->documentGeneration()) { return; }
            if (!response.ok()) { guard->fail(response.describe()); return; }
            guard->m_board = response.data.toObject();
            if (acceptance && (!acceptance->current.load() || acceptanceSnapshot(model->timeline().raw, localEdit.value("payload").toObject()) != expectedAcceptance)) {
                guard->fail("The linked shot clips changed while saving. Your timeline edits were kept. Reload the storyboard before selecting a take again.");
                return;
            }
            if (!localEdit.isEmpty()) {
                model->applyEdit(localEdit.value("edit").toString(), localEdit.value("payload").toObject());
                for (const auto& media : resolvedMedia) { model->registerMedia(media); }
            }
            if (localEdit.isEmpty() && !guard->m_stopQueue && guard->m_requestIndex + 1 < guard->m_requests.size()) {
                ++guard->m_requestIndex; guard->selectQueuedRequest();
                if (!guard->checkpoint()) { guard->fail("Could not save the remaining shot requests."); return; }
                guard->m_state = "queued"; emit guard->saved(guard->m_board); emit guard->changed();
                QTimer::singleShot(0, guard, [guard] { if (guard && guard->m_state == "queued" && !guard->m_stopQueue) { guard->startRender(); } });
                return;
            }
            if (!guard->m_checkpoint.isEmpty()) { QFile::remove(guard->m_checkpoint); guard->m_checkpoint.clear(); }
            guard->m_requests = {}; guard->m_productionCandidates = {};
            guard->m_state = "completed"; guard->m_error.clear(); emit guard->saved(guard->m_board); emit guard->changed();
        }, Qt::QueuedConnection);
    });
    m_worker = worker;
    connect(worker, &QThread::finished, this, [this, worker] { if (m_worker == worker) { m_worker = nullptr; emit changed(); } });
    connect(worker, &QThread::finished, worker, &QObject::deleteLater); worker->start();
}
void ShotWorkflow::accept(const QJsonObject& board, const QString& shotId, const QString& kind, int index) {
    if (busy() || !m_timeline) { return; }
    if (!m_call || !m_target) { m_target = nt::server::serverSaveTarget(); } if (!m_target) { fail("Open a server timeline to select a shot take."); return; }
    if (!m_checkpoint.isEmpty()) { fail("Recover the pending shot render before selecting another take."); return; }
    QStringList ids; for (const auto& value : board.value("document").toObject().value("shots").toArray()) { ids.append(value.toObject().value("id").toString()); }
    const auto resolved = nt::aiassist::resolveId(shotId, ids); if (!resolved) { fail("The shot is missing or ambiguous."); return; }
    const auto next = nt::aiassist::acceptShotCandidate(board, *resolved, kind, index); if (next == board) { return; }
    m_candidate = {}; m_shotId = *resolved; m_kind = kind;
    QJsonObject shot; for (const auto& value : next.value("document").toObject().value("shots").toArray()) { if (value.toObject().value("id").toString() == *resolved) { shot = value.toObject(); break; } }
    ++m_epoch; m_generation = m_timeline->documentGeneration();
    const auto media = shot.value(kind == "image" ? "keyframe" : "clip").toObject();
    QJsonObject localEdit;
    if (kind == "video") { localEdit = {{"edit", "shot.accept"}, {"payload", QJsonObject{{"boardId", board.value("id")}, {"shotId", shot.value("id")}, {"assetId", media.value("asset_id")}, {"durationMs", media.value("duration").toDouble()*1000}}}}; }
    persist(next, localEdit);
}
bool ShotWorkflow::link(const QJsonObject& board, const QString& clipId, const QString& shotId) {
    if (!m_timeline || busy()) { return false; }
    QStringList ids; for (const auto& value : board.value("document").toObject().value("shots").toArray()) { ids.append(value.toObject().value("id").toString()); }
    const auto resolved = nt::aiassist::resolveId(shotId, ids); if (!resolved) { return false; }
    return m_timeline->applyEdit("shot.link", {{"clipId", clipId}, {"boardId", board.value("id")}, {"shotId", *resolved}}) != 0;
}
bool ShotWorkflow::unlink(const QString& clipId) { return m_timeline && !busy() && m_timeline->applyEdit("shot.link", {{"clipId", clipId}, {"unlink", true}}) != 0; }
void ShotWorkflow::cancel() {
    if ((m_state == "rendering" || m_state == "recovering") && m_transport.ready()) { m_transport.send("cancel_generation", {{"request_ids", QJsonArray{m_requestId}}}, id()); }
    m_stopQueue = true;
    if (!m_checkpoint.isEmpty()) {
        if (!m_dispatched) { QFile::remove(m_checkpoint); m_checkpoint.clear(); m_requests = {}; m_productionCandidates = {}; }
        else { checkpoint(); }
    }
    ++m_epoch; m_poll.stop(); if (m_worker) { m_worker->requestInterruption(); } m_state = "cancelled"; emit changed();
}
void ShotWorkflow::derive(const QJsonObject& board, const QString& clipId, int frameCount, const QString& action) {
    if (busy() || !m_timeline) { return; }
    if (!m_call || !m_target) { m_target = nt::server::serverSaveTarget(); } if (!m_target) { fail("Open a server timeline to derive a shot."); return; }
    QStringList ids; for (const auto& value : m_timeline->clipsJson()) { ids.append(value.toObject().value("id").toString()); }
    const auto resolved = nt::aiassist::resolveId(clipId, ids); if (!resolved) { fail("The source clip is missing or ambiguous."); return; }
    const auto snapshot = m_timeline->snapshot();
    const auto found = std::find_if(snapshot->clips.begin(), snapshot->clips.end(), [&resolved](const auto& clip) { return clip.id == resolved->toStdString(); });
    const auto* typed = found == snapshot->clips.end() ? nullptr : &*found;
    if (!typed || typed->mediaType != nt::MediaType::Video || typed->mediaPath.empty() || typed->raw.value("currentAssetId").toString().isEmpty() || typed->raw.value("storyboardBoardId") != board.value("id")) {
        fail("Choose a storyboard video clip whose footage is loaded."); return;
    }
    const auto source = typed->raw;
    if (!nt::aiassist::shotClipEditable(m_timeline->timeline().raw, *resolved)) { fail("Unlock the source clip and its linked tracks before deriving a shot."); return; }
    const auto sourcePath = QString::fromStdString(typed->mediaPath);
    const int count = std::clamp(frameCount, 1, 8); QJsonArray times;
    for (int i = 0; i < count; ++i) {
        const double timelineMs = typed->startMs + (i + 0.5) * typed->durationMs / count;
        const double rate = typed->speedBaked ? 1 : std::max(0.0001, typed->speedMultiplier);
        times.append(std::round(nt::speed::clipRemapSourceMs(*typed, timelineMs).value_or(std::max(0.0, (timelineMs - typed->startMs) * rate + typed->inPointMs))));
    }
    const auto newShotId = id();
    if (nt::aiassist::deriveShot(board, source, {}, action, newShotId) == board) { fail("The source shot is not on this storyboard."); return; }
    ++m_epoch; m_generation = m_timeline->documentGeneration(); m_state = "deriving"; m_error.clear();
    const auto epoch = m_epoch; const auto generation = m_generation; const auto model = m_timeline; const auto target = *m_target; const QPointer<ShotWorkflow> guard(this);
    auto* worker = QThread::create([guard, epoch, generation, model, target, board, source, sourcePath, times, action, newShotId] {
        nt::server::QueryResult response; QJsonObject updated; QString error; QJsonArray references;
        nt::server::ServerClient server(target.server, target.token); server.setExpectedInstance(target.expectedInstance);
        QTemporaryDir folder;
        if (!folder.isValid()) { error = "Could not create a temporary frame folder."; }
        for (qsizetype i = 0; error.isEmpty() && i < times.size(); ++i) {
            if (QThread::currentThread()->isInterruptionRequested()) { error = "Shot derivation cancelled."; break; }
            const auto path = QDir(folder.path()).filePath(QString("frame-%1.png").arg(i));
            QProcess ffmpeg;
            ffmpeg.start("ffmpeg", {"-v", "error", "-nostdin", "-ss", QString::number(times.at(i).toDouble()/1000, 'f', 6), "-i", sourcePath, "-an", "-frames:v", "1", "-y", path});
            if (!ffmpeg.waitForStarted(5000) || !ffmpeg.waitForFinished(30000) || ffmpeg.exitStatus() != QProcess::NormalExit || ffmpeg.exitCode() != 0) {
                ffmpeg.kill(); ffmpeg.waitForFinished(1000); error = "Could not decode a source reference frame."; break;
            }
            if (QThread::currentThread()->isInterruptionRequested()) { error = "Shot derivation cancelled."; break; }
            const auto uploaded = server.upload({{"name", QString("Derived shot frame %1").arg(i+1)}, {"content_type", "image/png"}, {"project_id", board.value("projectId")}}, path, "image/png");
            if (!uploaded.ok()) { error = uploaded.describe(); break; }
            const auto asset = uploaded.data.toObject().value("id").toString();
            if (asset.isEmpty()) { error = "A reference upload returned no asset id."; break; }
            references.append(QJsonObject{{"kind", "style"}, {"asset_id", asset}, {"label", QString("Source at %1s").arg(times.at(i).toDouble()/1000, 0, 'f', 1)}});
        }
        if (error.isEmpty() && QThread::currentThread()->isInterruptionRequested()) { error = "Shot derivation cancelled."; }
        if (error.isEmpty()) {
            updated = nt::aiassist::deriveShot(board, source, references, action, newShotId);
            response = server.mutate("storyboards.update", {{"id", board.value("id")}, {"baseUpdatedAt", board.value("updatedAt")}, {"document", updated.value("document")}});
            if (!response.ok()) { error = response.describe(); }
        }
        if (!guard) { return; }
        QMetaObject::invokeMethod(guard, [guard, epoch, generation, model, source, newShotId, response, error] {
            if (!guard || guard->m_epoch != epoch || !model || guard->m_timeline != model || model->documentGeneration() != generation) { return; }
            if (!error.isEmpty()) { guard->fail(error); return; }
            guard->m_board = response.data.toObject();
            QJsonObject current;
            for (const auto& value : model->clipsJson()) { if (value.toObject().value("id") == source.value("id")) { current = value.toObject(); break; } }
            if (current != source) { guard->m_state = "completed"; guard->m_error = "The source clip changed. The derived shot is saved on the storyboard."; }
            else {
                QJsonObject shot;
                for (const auto& value : guard->m_board.value("document").toObject().value("shots").toArray()) { if (value.toObject().value("id").toString() == newShotId) { shot = value.toObject(); break; } }
                if (!model->applyEdit("shot.insertDerived", {{"source", source}, {"shotId", newShotId}, {"name", shot.value("slug")}})) { guard->m_error = "The derived shot is saved. Unlock the source track before adding it to the cut."; }
                guard->m_state = "completed";
            }
            emit guard->saved(guard->m_board); emit guard->changed();
        }, Qt::QueuedConnection);
    });
    m_worker = worker;
    connect(worker, &QThread::finished, this, [this, worker] { if (m_worker == worker) { m_worker = nullptr; emit changed(); } });
    connect(worker, &QThread::finished, worker, &QObject::deleteLater); worker->start(); emit changed();
}
