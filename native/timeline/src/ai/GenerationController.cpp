#include "ai/GenerationController.h"
#include "ai/Take.h"
#include "ai/WorkflowInputs.h"
#include "ai/WorkflowCost.h"
#include "ai/ClipRequests.h"
#include "ai/Extension.h"
#include "ai/WorkflowGeneration.h"
#include "audio/AppAudio.h"
#include "app/EditRegistry.h"
#include "assets/AssetMedia.h"
#include "assets/AssetDuration.h"
#include "edit/ClipOps.h"
#include "model/TimelineModel.h"
#include "model/TimelineJson.h"
#include "playback/PlaybackClock.h"
#include "preview/FfmpegSource.h"
#include "server/ServerClient.h"
#include "server/AssetCache.h"
#include "server/ServerSource.h"
#include <QCryptographicHash>
#include <QDateTime>
#include <QCoreApplication>
#include <QDir>
#include <QFile>
#include <QFileInfo>
#include <QJsonDocument>
#include <QJSValue>
#include <QImageReader>
#include <QLockFile>
#include <QSaveFile>
#include <QRegularExpression>
#include <QSet>
#include <QThread>
#include <QUuid>
#include <algorithm>
#include <cmath>

namespace {
QString id() { return QUuid::createUuid().toString(QUuid::Id128); }
QJsonObject insertClip(QJsonObject raw, const QJsonObject& payload) {
    auto tracks = raw.value("tracks").toArray();
    const auto type = payload.value("mediaType").toString() == u"image"
        ? QStringLiteral("video") : payload.value("mediaType").toString();
    QString trackId;
    bool foundType = false;
    for (const auto& v : tracks) {
        const auto track = v.toObject();
        if (track.value("type").toString() != type) continue;
        foundType = true;
        if (!track.value("locked").toBool()) { trackId = track.value("id").toString(); break; }
    }
    if (trackId.isEmpty() && foundType) return raw;
    if (trackId.isEmpty()) {
        trackId = nt::edit::newId();
        tracks.append(QJsonObject{{"id", trackId}, {"type", type}, {"name", type == "video" ? "Video" : "Audio"},
            {"index", tracks.size()}, {"visible", true}, {"locked", false}});
        raw.insert("tracks", tracks);
    }
    auto clip = payload;
    clip.insert("trackId", trackId);
    auto clips = raw.value("clips").toArray();
    clips.append(clip);
    raw.insert("clips", clips);
    return raw;
}
QJsonObject insertImageVideo(QJsonObject raw, const QJsonObject& payload) {
    auto clip = payload.value("clip").toObject();
    auto tracks = raw.value("tracks").toArray();
    QList<QJsonObject> ordered;
    for (const auto& value : tracks) ordered.append(value.toObject());
    std::stable_sort(ordered.begin(), ordered.end(), [](const auto& a, const auto& b) {
        return a.value("index").toInt() < b.value("index").toInt();
    });
    int slot = 0;
    for (int i = 0; i < ordered.size(); ++i) if (ordered[i].value("id") == payload.value("sourceTrackId")) { slot = i; break; }
    QString trackId;
    if (slot > 0) {
        const auto above = ordered[slot - 1];
        bool occupied = false;
        const double start = clip.value("startMs").toDouble(), end = start + clip.value("durationMs").toDouble();
        for (const auto& value : raw.value("clips").toArray()) {
            const auto other = value.toObject();
            if (other.value("trackId") == above.value("id") && other.value("startMs").toDouble() < end &&
                other.value("startMs").toDouble() + other.value("durationMs").toDouble() > start) { occupied = true; break; }
        }
        if (above.value("type") == "video" && !above.value("locked").toBool() && above.value("visible").toBool(true) && !occupied)
            trackId = above.value("id").toString();
    }
    if (trackId.isEmpty()) {
        trackId = nt::edit::newId();
        ordered.insert(slot, QJsonObject{{"id", trackId}, {"type", "video"}, {"name", "Video"}, {"visible", true}, {"locked", false}});
        tracks = {};
        for (int i = 0; i < ordered.size(); ++i) { auto track = ordered[i]; track.insert("index", i); tracks.append(track); }
        raw.insert("tracks", tracks);
    }
    clip.insert("trackId", trackId);
    auto clips = raw.value("clips").toArray(); clips.append(clip); raw.insert("clips", clips);
    return raw;
}
const bool registered = nt::app::registerEdit("ai.insertGeneration", insertClip);
const bool imageRegistered = nt::app::registerEdit("ai.insertImageVideo", insertImageVideo);
bool clipLocked(const TimelineModel& model, const QJsonObject& clip) {
    if (clip.value("locked").toBool()) return true;
    const auto document = model.timeline().raw;
    for (const auto& value : document.value("tracks").toArray()) {
        const auto track = value.toObject();
        if (track.value("id") == clip.value("trackId")) return track.value("locked").toBool();
    }
    return true;
}
QString pendingPrefix(const nt::server::SaveTarget& target) {
    return nt::server::safePathPart(target.timelineId) + QStringLiteral(".ai-generation-");
}
QString pendingPath(const nt::server::SaveTarget& target, const QString& requestId) {
    const auto part = requestId.startsWith(QStringLiteral("request:candidate:variation:"))
        ? QString::fromLatin1(QCryptographicHash::hash(requestId.toUtf8(), QCryptographicHash::Sha256).toHex())
        : nt::server::safePathPart(requestId);
    return QDir(target.backupDir).filePath(pendingPrefix(target) + part + QStringLiteral(".json"));
}
bool activeRecoveryExists(const nt::server::SaveTarget& target) {
    const QDir folder(target.backupDir);
    for (const auto& name : folder.entryList({pendingPrefix(target) + QStringLiteral("*.json")}, QDir::Files)) {
        QFile file(folder.filePath(name));
        if (!file.open(QIODevice::ReadOnly)) return true;
        QJsonParseError parseError;
        const auto document = QJsonDocument::fromJson(file.readAll(), &parseError);
        if (parseError.error != QJsonParseError::NoError || !document.isObject()) return true;
        const auto state = document.object().value("state").toString();
        if (state == "pending" || state == "queued" || state == "running" || state == "recovering" || state == "cancelling") return true;
    }
    return false;
}
}

GenerationController::GenerationController(QObject* parent) : QObject(parent), m_transport(this), m_poll(this), m_reconnect(this), m_previewTimeline(new TimelineModel(this)), m_previewClock(new PlaybackClock(this)), m_mediaProtection(std::make_shared<nt::assets::MediaProtection>()), m_workflow(new nt::ai::WorkflowGeneration(&m_transport, this)) {
    if (QCoreApplication::instance()) {
        const auto configuredMode = QCoreApplication::instance()->property("timelineAudioMode").toString();
        if (!configuredMode.isEmpty()) m_previewAudioMode = configuredMode;
    }
    m_poll.setInterval(3000);
    m_reconnect.setSingleShot(true);
    connect(&m_reconnect, &QTimer::timeout, this, [this] { if (busy()) open(); });
    connect(&m_poll, &QTimer::timeout, this, &GenerationController::lookup);
    connect(&m_transport, &nt::ai::GenerationTransport::response, this, &GenerationController::receive);
    connect(&m_transport, &nt::ai::GenerationTransport::readyChanged, this, [this] {
        emit changed();
        if (m_transport.ready()) { m_reconnect.stop(); m_reconnectAttempts = 0; }
        if (m_transport.ready() && !m_job.isEmpty() && busy()) {
            if (m_job.value("operation") == "workflow") recoverWorkflow();
            else { lookup(); m_poll.start(); }
        }
    });
    connect(m_workflow, &nt::ai::WorkflowGeneration::statusChanged, this, [this](const QString& status, const QString& error) {
        if (m_job.value("operation") != "workflow") return;
        if (status == "completed") { m_state = "recovering"; emit changed(); return; }
        m_state = status; m_error = error; save(); emit changed();
    });
    connect(m_workflow, &nt::ai::WorkflowGeneration::candidate, this, [this](const QJsonObject& context, const QString& assetId) {
        if (m_job.value("operation") != "workflow" || context.value("jobId") != m_job.value("requestId") || assetId.isEmpty()) return;
        auto candidate = m_job; candidate.insert("id", m_job.value("requestId")); candidate.insert("assetId", assetId);
        candidate.insert("status", "success"); candidate.insert("label", "Workflow take");
        bool known = false; for (const auto& entry : m_candidates) if (entry.toObject().value("id") == candidate.value("id")) known = true;
        if (!known) m_candidates.append(candidate);
        m_state = "completed"; save(); emit changed();
    });
    connect(&m_transport, &nt::ai::GenerationTransport::error, this, &GenerationController::setError);
    connect(&m_transport, &nt::ai::GenerationTransport::disconnected, this, [this] {
        m_poll.stop();
        if (busy()) {
            m_state = "recovering"; emit changed();
            if (m_target && m_target->expectedInstance.isEmpty() && m_reconnectAttempts < 5) {
                const int delay = std::min(30000, 1000 << m_reconnectAttempts++); m_reconnect.start(delay);
            }
        }
    });
}
GenerationController::~GenerationController() {
    stopPreview();
    if (m_worker) { m_worker->requestInterruption(); m_worker->wait(); }
    if (m_workflowInputWorker) { m_workflowInputWorker->requestInterruption(); m_workflowInputWorker->wait(); }
    if (m_workflowCostWorker) { m_workflowCostWorker->requestInterruption(); m_workflowCostWorker->wait(); }
}
void GenerationController::resetMediaProtection() {
    m_recoverWorkflowAfterWorker = false;
    QSet<QString> paths;
    if (m_timeline) {
        for (const auto& clip : m_timeline->timeline().clips) {
            if (!clip.mediaPath.empty()) paths.insert(QString::fromStdString(clip.mediaPath));
            if (!clip.audioPath.empty()) paths.insert(QString::fromStdString(clip.audioPath));
        }
    }
    m_mediaProtection->reset(paths);
    m_loadedPreviewKey.clear(); m_previewKey.clear();
    stopPreview();
}
TimelineModel* GenerationController::timeline() const { return m_timeline; }
void GenerationController::setTimeline(TimelineModel* timeline) {
    if (m_timeline == timeline) return;
    if (m_timeline) disconnect(m_timeline, nullptr, this, nullptr);
    m_transport.close(); m_poll.stop(); m_reconnect.stop(); m_reconnectAttempts = 0; m_workflow->reset();
    m_timeline = timeline;
    ++m_workflowCostRevision; m_workflowCostHasInputs = false; m_workflowCostPending = false;
    ++m_workflowInputsRevision; m_workflowInputClipId.clear(); m_workflowInputWorkflowId.clear();
    m_workflowInputDocument = {}; m_workflowInputsError.clear(); m_workflowCostLabel.clear(); m_workflowCostDetail.clear(); m_workflowInputsLoading = false;
    emit workflowInputsChanged();
    resetMediaProtection();
    m_job = {}; m_candidates = {}; m_previews.clear(); m_state.clear(); m_error.clear();
    m_target = nt::server::serverSaveTarget();
    if (m_timeline) {
        m_generation = m_timeline->documentGeneration();
        connect(m_timeline, &TimelineModel::clipsChanged, this, &GenerationController::changed);
        connect(m_timeline, &TimelineModel::clipsChanged, this, &GenerationController::workflowInputsChanged);
        connect(m_timeline, &TimelineModel::clipsChanged, this, &GenerationController::syncWorkflowCost);
        connect(m_timeline, &TimelineModel::documentReplaced, this, [this] {
            m_transport.close(); m_poll.stop(); m_reconnect.stop(); m_reconnectAttempts = 0; m_workflow->reset();
            m_generation = m_timeline->documentGeneration();
            ++m_workflowCostRevision; m_workflowCostHasInputs = false; m_workflowCostPending = false;
            ++m_workflowInputsRevision; m_workflowInputClipId.clear(); m_workflowInputWorkflowId.clear();
            m_workflowInputDocument = {}; m_workflowInputsError.clear(); m_workflowCostLabel.clear(); m_workflowCostDetail.clear(); m_workflowInputsLoading = false;
            emit workflowInputsChanged();
            resetMediaProtection();
            m_job = {}; m_candidates = {}; m_previews.clear(); m_state.clear();
            m_target = nt::server::serverSaveTarget();
            restore(); emit changed();
            if (busy()) QTimer::singleShot(0, this, [this] { if (busy()) open(); });
        });
        restore();
        if (busy()) QTimer::singleShot(0, this, [this] { if (busy()) open(); });
    }
    emit timelineChanged(); emit changed();
}
QVariantList GenerationController::workflowInputs() const {
    if (!m_timeline || m_workflowInputDocument.isEmpty() || m_workflowInputClipId.isEmpty()) return {};
    for (const auto& value : m_timeline->clipsJson()) {
        const auto clip = value.toObject();
        if (clip.value("id").toString() == m_workflowInputClipId && clip.value("workflowId").toString() == m_workflowInputWorkflowId)
            return nt::ai::workflowInputs(m_workflowInputDocument, clip.value("paramOverrides").toObject()).toVariantList();
    }
    return {};
}
void GenerationController::loadWorkflowInputs(const QString& clipId) {
    if (!m_timeline || !m_target) { m_workflowInputClipId = clipId; m_workflowInputsError = "Open a server timeline to load workflow inputs."; emit workflowInputsChanged(); return; }
    if (!canonicalizeTarget()) { m_workflowInputClipId = clipId; m_workflowInputsError = m_error; emit workflowInputsChanged(); return; }
    QJsonObject clip;
    for (const auto& value : m_timeline->clipsJson()) if (value.toObject().value("id") == clipId) { clip = value.toObject(); break; }
    const auto workflowId = clip.value("workflowId").toString();
    if (workflowId.isEmpty()) {
        ++m_workflowCostRevision; m_workflowCostHasInputs = false; m_workflowCostPending = false;
        ++m_workflowInputsRevision; m_workflowInputClipId.clear(); m_workflowInputWorkflowId.clear();
        m_workflowInputDocument = {}; m_workflowCostLabel.clear(); m_workflowCostDetail.clear();
        m_workflowInputsLoading = false; m_workflowInputsError.clear(); emit workflowInputsChanged(); return;
    }
    if (m_workflowInputClipId == clipId && m_workflowInputWorkflowId == workflowId &&
        (m_workflowInputsLoading || !m_workflowInputDocument.isEmpty())) return;
    const auto revision = ++m_workflowInputsRevision;
    ++m_workflowCostRevision; m_workflowCostHasInputs = false; m_workflowCostPending = false;
    m_workflowInputClipId = clipId; m_workflowInputWorkflowId = workflowId;
    m_workflowInputDocument = {}; m_workflowInputsError.clear(); m_workflowCostLabel.clear(); m_workflowCostDetail.clear();
    m_workflowInputsLoading = true; emit workflowInputsChanged();
    if (m_workflowInputWorker) return;
    const auto target = *m_target; const auto model = m_timeline; const auto generation = model->documentGeneration();
    const QPointer<GenerationController> self(this);
    auto* worker = QThread::create([self, target, model, generation, workflowId, clipId, revision] {
        nt::server::ServerClient client(target.server, target.token);
        client.setExpectedInstance(target.expectedInstance);
        const auto result = client.query("workflows.get", {{"id", workflowId}});
        if (!self) return;
        QMetaObject::invokeMethod(self, [self, model, generation, workflowId, clipId, revision, result] {
            if (!self || !model || self->m_timeline != model || model->documentGeneration() != generation ||
                self->m_workflowInputsRevision != revision || self->m_workflowInputClipId != clipId) return;
            bool matches = false;
            for (const auto& value : model->clipsJson()) {
                const auto current = value.toObject();
                if (current.value("id") == clipId && current.value("workflowId") == workflowId) { matches = true; break; }
            }
            if (!matches) { self->loadWorkflowInputs(clipId); return; }
            if (!result.ok()) { self->m_workflowInputsLoading = false; self->m_workflowInputsError = result.describe(); }
            else if (result.data.toObject().value("id").toString() != workflowId) { self->m_workflowInputsLoading = false; self->m_workflowInputsError = "The loaded workflow does not match the clip."; }
            else {
                self->m_workflowInputsLoading = false; self->m_workflowInputDocument = result.data.toObject();
                self->syncWorkflowCost();
            }
            emit self->workflowInputsChanged();
        }, Qt::QueuedConnection);
    });
    m_workflowInputWorker = worker;
    connect(worker, &QThread::finished, this, [this, worker, revision] {
        if (m_workflowInputWorker == worker) m_workflowInputWorker = nullptr;
        if (m_workflowInputsLoading && m_workflowInputsRevision != revision) {
            const auto pending = m_workflowInputClipId; m_workflowInputClipId.clear(); loadWorkflowInputs(pending);
        }
    });
    connect(worker, &QThread::finished, worker, &QObject::deleteLater);
    worker->start();
}
void GenerationController::syncWorkflowCost() {
    if (!m_timeline || !m_target || m_workflowInputClipId.isEmpty() || m_workflowInputDocument.isEmpty()) return;
    QJsonObject clip;
    for (const auto& value : m_timeline->clipsJson()) {
        const auto current = value.toObject();
        if (current.value("id").toString() == m_workflowInputClipId) { clip = current; break; }
    }
    if (clip.isEmpty() || clip.value("workflowId").toString() != m_workflowInputWorkflowId) {
        const auto clipId = m_workflowInputClipId;
        loadWorkflowInputs(clipId);
        return;
    }
    const auto inputs = clip.value("paramOverrides").toObject();
    if (m_workflowCostHasInputs && inputs == m_workflowCostInputs) return;
    m_workflowCostInputs = inputs; m_workflowCostHasInputs = true; m_workflowCostPending = true;
    ++m_workflowCostRevision;
    m_workflowCostLabel.clear(); m_workflowCostDetail = QStringLiteral("Estimating cost…");
    emit workflowInputsChanged();
    startWorkflowCost();
}
void GenerationController::startWorkflowCost() {
    if (!m_workflowCostPending || m_workflowCostWorker || !m_target || !m_timeline || m_workflowInputDocument.isEmpty()) return;
    m_workflowCostPending = false;
    const auto revision = m_workflowCostRevision;
    const auto inputs = m_workflowCostInputs;
    const auto target = *m_target;
    const auto model = m_timeline;
    const auto generation = model->documentGeneration();
    const auto clipId = m_workflowInputClipId;
    const auto workflowId = m_workflowInputWorkflowId;
    const QPointer<GenerationController> self(this);
    auto* worker = QThread::create([self, target, model, generation, clipId, workflowId, revision, inputs] {
        nt::server::ServerClient client(target.server, target.token);
        client.setExpectedInstance(target.expectedInstance);
        const auto cost = nt::ai::estimateWorkflowCost(client, workflowId, inputs);
        if (!self) return;
        QMetaObject::invokeMethod(self, [self, model, generation, clipId, workflowId, revision, inputs, cost] {
            if (!self || !model || self->m_timeline != model || model->documentGeneration() != generation ||
                self->m_workflowCostRevision != revision || self->m_workflowInputClipId != clipId ||
                self->m_workflowInputWorkflowId != workflowId || self->m_workflowCostInputs != inputs) return;
            self->m_workflowCostLabel = cost.available ? (cost.lowerBound ? QStringLiteral("From ") : QString()) + cost.label : QString();
            self->m_workflowCostDetail = cost.error.isEmpty() ? cost.detail : QStringLiteral("Price unavailable.");
            if (cost.available) {
                if (!self->m_workflowCostDetail.isEmpty()) self->m_workflowCostDetail += QLatin1Char(' ');
                self->m_workflowCostDetail += QStringLiteral("Based on the saved workflow; input changes may affect the final cost.");
            }
            emit self->workflowInputsChanged();
        }, Qt::QueuedConnection);
    });
    m_workflowCostWorker = worker;
    connect(worker, &QThread::finished, this, [this, worker] {
        if (m_workflowCostWorker == worker) m_workflowCostWorker = nullptr;
        startWorkflowCost();
    });
    connect(worker, &QThread::finished, worker, &QObject::deleteLater);
    worker->start();
}
bool GenerationController::setWorkflowInput(const QString& clipId, const QString& name, const QVariant& value) {
    if (!m_timeline || clipId != m_workflowInputClipId || m_workflowInputDocument.isEmpty() || name.isEmpty()) return false;
    const auto definitions = workflowInputs();
    bool found = false;
    for (const auto& entry : definitions) if (entry.toMap().value("name").toString() == name) { found = true; break; }
    if (!found) return false;
    auto clips = m_timeline->clipsJson();
    for (int i = 0; i < clips.size(); ++i) {
        auto clip = clips[i].toObject();
        if (clip.value("id") != clipId || clip.value("workflowId").toString() != m_workflowInputWorkflowId) continue;
        if (clipLocked(*m_timeline, clip)) { setError("Unlock the clip and track first."); return false; }
        auto overrides = clip.value("paramOverrides").toObject();
        const auto converted = value.metaType() == QMetaType::fromType<QJSValue>() ? value.value<QJSValue>().toVariant() : value;
        const auto next = QJsonValue::fromVariant(converted);
        if (next.isUndefined()) return false;
        const auto nextStatus = !clip.value("lastGeneratedHash").toString().isEmpty()
            ? QJsonValue(QStringLiteral("stale")) : clip.value("status");
        if (overrides.contains(name) && overrides.value(name) == next && clip.value("status") == nextStatus) return false;
        overrides.insert(name, next); clip.insert("paramOverrides", overrides);
        if (!nextStatus.isUndefined()) clip.insert("status", nextStatus);
        clips.replace(i, clip);
        return m_timeline->commitEdit("Change workflow input", m_timeline->clipsJson(), clips) != 0;
    }
    return false;
}

QVariantList GenerationController::candidates() const {
    // A clip move changes no take: reuse the list while the takes revision stays the same.
    const quint64 takesRevision = m_timeline ? m_timeline->takesRevision() : 0;
    if (m_candidatesCache && m_candidatesCache->candidates == m_candidates && m_candidatesCache->timeline == m_timeline &&
        m_candidatesCache->takesRevision == takesRevision) {
        return m_candidatesCache->result;
    }
    auto entries = m_candidates;
    const auto key = [](const QJsonValue& value) {
        if (value.isString()) return QStringLiteral("s:") + value.toString();
        if (value.isUndefined()) return QStringLiteral("u:");
        return QString::number(static_cast<int>(value.type())) + QLatin1Char(':') +
            QString::fromUtf8(QJsonDocument(QJsonArray{value}).toJson(QJsonDocument::Compact));
    };
    QHash<QPair<QString, QString>, int> seenTake;
    QHash<QPair<QString, QString>, int> seenAsset;
    const auto remember = [&](const QJsonObject& item, int index) {
        const auto clip = key(item.value("clipId"));
        const auto takeKey = qMakePair(clip, key(item.value("id")));
        const auto assetKey = qMakePair(clip, key(item.value("assetId")));
        if (!seenTake.contains(takeKey)) seenTake.insert(takeKey, index);
        if (!seenAsset.contains(assetKey)) seenAsset.insert(assetKey, index);
    };
    for (int i = 0; i < entries.size(); ++i) remember(entries[i].toObject(), i);
    if (m_timeline) {
        for (const auto& value : m_timeline->clipsJson()) {
            const auto clip = value.toObject();
            for (const auto& value : clip.value("versions").toArray()) {
                auto version = value.toObject();
                const auto clipKey = key(clip.value("id"));
                const auto takeKey = qMakePair(clipKey, key(version.value("id")));
                const auto assetKey = qMakePair(clipKey, key(version.value("assetId")));
                const int byTake = seenTake.value(takeKey, -1);
                const int assetIndex = seenAsset.value(assetKey, -1);
                const int byAsset = assetIndex >= 0 && !entries[assetIndex].toObject().value("recorded").toBool() ? assetIndex : -1;
                const int index = byTake < 0 ? byAsset : byAsset < 0 ? byTake : std::min(byTake, byAsset);
                if (index >= 0) {
                    auto item = entries[index].toObject();
                    item.insert("id", version.value("id"));
                    if (version.contains("label")) item.insert("label", version.value("label"));
                    else item.remove("label");
                    item.insert("recorded", true);
                    entries.replace(index, item);
                    remember(item, index);
                    continue;
                }
                version.insert("clipId", clip.value("id"));
                version.insert("recorded", true);
                if (!version.contains("label")) version.insert("label", "Previous take");
                entries.append(version);
                remember(version, entries.size() - 1);
            }
        }
    }
    QSet<QString> clipIds;
    if (m_timeline) {
        for (const auto& value : m_timeline->clipsJson()) clipIds.insert(value.toObject().value("id").toString());
    }
    for (int i = 0; i < entries.size(); ++i) {
        auto item = entries[i].toObject();
        item.insert("clipMissing", !clipIds.contains(item.value("clipId").toString()));
        entries.replace(i, item);
    }
    m_candidatesCache = CandidatesCache{m_candidates, m_timeline, takesRevision, entries.toVariantList()};
    return m_candidatesCache->result;
}
bool GenerationController::canonicalizeTarget() {
    if (!m_target || !m_timeline) { setError("Open a server timeline to generate media."); return false; }
    const auto canonical = m_timeline->timeline().raw.value("id").toString();
    const auto supplied = m_target->timelineId;
    if (!canonical.isEmpty() && supplied == canonical) return true;
    const auto isHex = [](QChar c) { return (c >= u'0' && c <= u'9') || (c >= u'a' && c <= u'f'); };
    if (canonical.size() == 32 && supplied.size() == 12 &&
        std::all_of(canonical.cbegin(), canonical.cend(), isHex) && canonical.startsWith(supplied)) {
        m_target->timelineId = canonical;
        return true;
    }
    setError("The server timeline does not match the open document.");
    return false;
}
void GenerationController::open() {
    if (!canonicalizeTarget()) { m_transport.close(); return; }
    if (!m_target->expectedInstance.isEmpty()) { setError("Generation is unavailable for a server that requires instance verification."); return; }
    if (!m_transport.ready()) { m_transport.configure(m_target->server, m_target->token); m_transport.open(); }
}
void GenerationController::submit(const QString& mode, const QString& provider, const QString& model,
                                  const QString& prompt, double duration, const QString& aspect,
                                  const QString& resolution, const QString& voice, const QVariantList& references,
                                  double startMs, const QVariantList& entities) {
    if (!m_timeline || !m_target || !ready() || busy() || prompt.trimmed().isEmpty() ||
        provider.trimmed().isEmpty() || model.trimmed().isEmpty() || !std::isfinite(duration) || duration <= 0 || !std::isfinite(startMs) ||
        (mode != "video" && mode != "audio" && mode != "music")) {
        setError("Choose a model and enter a prompt before generating."); return;
    }
    if (!m_target->expectedInstance.isEmpty()) {
        setError("Generation is unavailable for a server that requires instance verification."); return;
    }
    if (!QDir().mkpath(m_target->backupDir)) { setError("Could not create generation recovery folder."); return; }
    QLockFile submissionLock(QDir(m_target->backupDir).filePath(pendingPrefix(*m_target) + QStringLiteral("submission.lock")));
    submissionLock.setStaleLockTime(0);
    if (!submissionLock.tryLock(0)) { setError("Another editor is starting a generation."); return; }
    if (activeRecoveryExists(*m_target)) { setError("A generation is already in progress for this timeline."); return; }
    const auto clipId = nt::edit::newId();
    const auto requestId = id();
    const auto mediaType = mode == "video" ? "video" : "audio";
    const auto kind = mode == "video" ? "text-to-video" : mode == "music" ? "text-to-music" : "text-to-audio";
    QJsonArray refIds;
    QJsonArray entityIds;
    QStringList cast;
    for (const auto& value : entities) {
        const auto entity = value.toString().trimmed();
        if (!entity.isEmpty()) { entityIds.append(entity); cast.append(QStringLiteral("entity://") + entity); }
    }
    QJsonArray refImages;
    for (const auto& value : references) {
        const auto ref = value.toString().trimmed();
        if (!ref.isEmpty()) { refIds.append(ref); refImages.append(QJsonObject{{"type", "image"}, {"asset_id", ref}}); }
    }
    QJsonObject clip{{"id", clipId}, {"name", prompt.trimmed().left(40)}, {"startMs", std::max(0.0, startMs)},
        {"durationMs", duration * 1000}, {"mediaType", mediaType}, {"sourceType", "generated"},
        {"bindingKind", kind}, {"prompt", prompt.trimmed()}, {"provider", provider}, {"model", model},
        {"status", "draft"}, {"locked", false}, {"versions", QJsonArray{}}};
    if (mode == "video") { clip.insert("aspectRatio", aspect); clip.insert("resolution", resolution); if (!refIds.isEmpty()) clip.insert("referenceImageIds", refIds); if (!entityIds.isEmpty()) clip.insert("referenceEntityIds", entityIds); }
    if (mode == "audio" && !voice.isEmpty()) clip.insert("voice", voice);
    if (!m_timeline->applyEdit("ai.insertGeneration", clip)) { setError("Unlock a matching track to generate media."); return; }
    emit clipInserted(clipId);
    m_generation = m_timeline->documentGeneration();
    m_job = {{"requestId", requestId}, {"clipId", clipId}, {"mode", mode}, {"provider", provider}, {"model", model},
             {"prompt", prompt.trimmed()}, {"durationMs", duration * 1000}, {"clip", clip},
             {"startedAt", QDateTime::currentDateTimeUtc().toString(Qt::ISODateWithMs)}};
    m_state = "pending"; m_error.clear();
    if (!save()) { m_state = "failed"; emit changed(); return; }
    QJsonObject data{{"mode", mode}, {"provider", provider}, {"model", model}, {"prompt", prompt.trimmed()}, {"variations", 1},
        {"timeline_context", QJsonObject{{"sequence_id", m_target->timelineId}, {"target_clip_id", clipId}}}};
    if (mode == "video") {
        data.insert("aspect_ratio", aspect); data.insert("resolution", resolution); data.insert("duration", duration);
        if (!cast.isEmpty()) data.insert("prompt", prompt.trimmed() + QStringLiteral("\n\nCast: ") + cast.join(QStringLiteral(", ")) + QStringLiteral("."));
    }
    if (mode == "music") data.insert("duration", duration);
    if (mode == "audio" && !voice.isEmpty()) data.insert("voice", voice);
    if (!refImages.isEmpty() && mode == "video") { data.insert("reference_images", refImages); data.insert("capability", "reference_to_video"); }
    if (!m_transport.send("generate_media", data, requestId)) { m_state = "failed"; m_error = "Could not send generation request."; save(); }
    else { m_state = "running"; m_poll.start(); save(); }
    emit changed();
}
void GenerationController::recoverWorkflow() {
    if (!m_target || !m_timeline || !ready() || m_worker) return;
    const auto context = m_job.value("workflowContext").toObject();
    if (!m_workflow->recover(context)) { setError("Could not reconnect to the workflow job."); return; }
    const auto target = *m_target; const auto model = m_timeline; const auto generation = model->documentGeneration();
    const QPointer<GenerationController> self(this);
    auto* thread = QThread::create([self, target, model, generation, context] {
        nt::server::ServerClient client(target.server, target.token);
        const auto result = client.query("jobs.get", {{"id", context.value("jobId")}});
        if (!self) return;
        QMetaObject::invokeMethod(self, [self, model, generation, context, result] {
            if (!self || !model || self->m_timeline != model || model->documentGeneration() != generation ||
                self->m_job.value("workflowContext").toObject() != context || self->m_job.value("cancelRequested").toBool()) return;
            if (result.ok()) self->m_workflow->applyJobSnapshot(context, result.data.toObject());
        }, Qt::QueuedConnection);
    });
    m_worker = thread;
    connect(thread, &QThread::finished, this, [this, thread] { if (m_worker == thread) {
            m_worker = nullptr; emit changed();
            if (m_recoverWorkflowAfterWorker) { m_recoverWorkflowAfterWorker = false; recoverWorkflow(); }
        } });
    connect(thread, &QThread::finished, thread, &QObject::deleteLater); thread->start();
}
void GenerationController::lookup() {
    if (m_job.isEmpty() || !m_transport.ready()) return;
    m_transport.send("lookup_generations", {{"request_ids", QJsonArray{m_job.value("requestId")}}}, id());
}
void GenerationController::restoreClip(const QString& clipId) {
    if (!m_timeline || !m_target) return;
    for (const auto& value : m_timeline->clipsJson()) {
        if (value.toObject().value("id") == clipId) { setError("The clip already exists."); return; }
    }
    QJsonObject clip;
    if (m_job.value("clipId") == clipId) clip = m_job.value("clip").toObject();
    if (clip.isEmpty()) {
        for (const auto& value : m_candidates) {
            const auto item = value.toObject();
            if (item.value("clipId") == clipId) { clip = item.value("clip").toObject(); break; }
        }
    }
    if (clip.isEmpty() || clip.value("id") != clipId) { setError("No saved clip is available to restore."); return; }
    if (!m_timeline->applyEdit("ai.insertGeneration", clip)) { setError("Unlock a matching track to restore the clip."); return; }
    emit clipInserted(clipId);
    emit changed();
}
void GenerationController::submitWorkflow(const QString& clipId) {
    if (!m_timeline || !m_target || !ready() || busy() || m_resolving || m_worker) { setError("Wait for the current request."); return; }
    if (!m_target->expectedInstance.isEmpty()) { setError("Generation is unavailable for a server that requires instance verification."); return; }
    QJsonObject clip;
    for (const auto& value : m_timeline->clipsJson()) if (value.toObject().value("id") == clipId) { clip = value.toObject(); break; }
    const auto workflowId = clip.value("workflowId").toString();
    if (clip.isEmpty() || clipLocked(*m_timeline, clip) || workflowId.isEmpty()) { setError("Choose an unlocked workflow-bound clip."); return; }
    const auto target = *m_target; const auto model = m_timeline; const auto generation = model->documentGeneration();
    const QPointer<GenerationController> self(this); m_resolving = true; emit changed();
    auto* thread = QThread::create([self, target, model, generation, clip, clipId, workflowId] {
        nt::server::ServerClient client(target.server, target.token);
        const auto result = client.query("workflows.get", {{"id", workflowId}});
        if (!self) return;
        QMetaObject::invokeMethod(self, [self, model, generation, clip, clipId, result] {
            if (!self) { return; }
            self->m_resolving = false;
            if (!model || self->m_timeline != model || model->documentGeneration() != generation) return;
            QJsonObject current; for (const auto& value : model->clipsJson()) if (value.toObject().value("id") == clipId) { current = value.toObject(); break; }
            if (current != clip || clipLocked(*model, current)) { self->setError("The clip changed while loading its workflow."); return; }
            if (!result.ok()) { self->setError(result.describe()); return; }
            if (!self->m_target || !QDir().mkpath(self->m_target->backupDir)) { self->setError("Could not create generation recovery folder."); return; }
            QLockFile lock(QDir(self->m_target->backupDir).filePath(pendingPrefix(*self->m_target) + QStringLiteral("submission.lock")));
            lock.setStaleLockTime(0);
            if (!lock.tryLock(0) || activeRecoveryExists(*self->m_target)) { self->setError("A generation is already in progress for this timeline."); return; }
            const auto jobId = id(); QString error;
            if (!self->m_workflow->prepare(self->m_target->timelineId, jobId, result.data.toObject(), clip, &error)) { self->setError(error); return; }
            const auto context = self->m_workflow->context();
            const auto updatedAt = result.data.toObject().value("updated_at").toString(result.data.toObject().value("updatedAt").toString());
            self->m_job = {{"requestId", jobId}, {"clipId", clipId}, {"operation", "workflow"}, {"clip", clip},
                {"workflowContext", context}, {"workflowUpdatedAt", updatedAt}, {"durationMs", clip.value("durationMs")}, {"startedAt", QDateTime::currentDateTimeUtc().toString(Qt::ISODateWithMs)}};
            self->m_generation = generation; self->m_state = "pending"; self->m_error.clear();
            if (!self->save()) { self->m_state = "failed"; emit self->changed(); return; }
            if (!self->m_workflow->start()) { self->m_state = "failed"; self->m_error = "Could not start workflow."; self->save(); }
            emit self->changed();
        }, Qt::QueuedConnection);
    });
    m_worker = thread;
    connect(thread, &QThread::finished, this, [this, thread] { if (m_worker == thread) {
            m_worker = nullptr; emit changed();
            if (m_recoverWorkflowAfterWorker) { m_recoverWorkflowAfterWorker = false; recoverWorkflow(); }
        } });
    connect(thread, &QThread::finished, thread, &QObject::deleteLater); thread->start();
}
void GenerationController::submitLineDelivery(const QString& clipId, const QVariantMap& options) {
    if (!m_timeline || !m_target || !ready() || busy() || m_resolving || m_worker) { setError("Wait for the current request."); return; }
    QJsonObject clip;
    for (const auto& value : m_timeline->clipsJson()) if (value.toObject().value("id") == clipId) { clip = value.toObject(); break; }
    const auto scriptId = clip.value("scriptId").toString(), lineId = clip.value("scriptLineId").toString();
    if (clip.isEmpty() || clipLocked(*m_timeline, clip) || clip.value("mediaType") != "audio" || scriptId.isEmpty() || lineId.isEmpty()) {
        setError("Choose an unlocked audio clip linked to a script line."); return;
    }
    const auto target = *m_target; const auto model = m_timeline; const auto generation = model->documentGeneration();
    const QPointer<GenerationController> self(this);
    m_resolving = true; emit changed();
    auto* thread = QThread::create([self, target, model, generation, clip, clipId, scriptId, lineId, options] {
        nt::server::ServerClient client(target.server, target.token);
        const auto result = client.query("scripts.get", {{"id", scriptId}});
        if (!self) return;
        QMetaObject::invokeMethod(self, [self, model, generation, clip, clipId, scriptId, lineId, options, result] {
            if (!self) return;
            self->m_resolving = false;
            if (!model || self->m_timeline != model || model->documentGeneration() != generation) return;
            QJsonObject current;
            for (const auto& value : model->clipsJson()) if (value.toObject().value("id") == clipId) { current = value.toObject(); break; }
            if (current != clip) { self->setError("The clip changed while loading its script."); return; }
            if (!result.ok()) { self->setError(result.describe()); return; }
            const auto script = result.data.toObject(); const auto document = script.value("document").toObject();
            if (script.value("id").toString() != scriptId) { self->setError("Script identity does not match the clip."); return; }
            QJsonObject line, cast;
            for (const auto& section : document.value("sections").toArray()) {
                for (const auto& value : section.toObject().value("lines").toArray()) {
                    if (value.toObject().value("id").toString() == lineId) { line = value.toObject(); break; }
                }
            }
            if (line.isEmpty()) { self->setError("The linked script line no longer exists."); return; }
            for (const auto& value : document.value("cast").toArray()) {
                if (value.toObject().value("id") == line.value("speakerId")) { cast = value.toObject(); break; }
            }
            auto input = QJsonObject::fromVariantMap(options);
            input.insert("scriptId", scriptId); input.insert("line", line);
            if (!cast.isEmpty()) input.insert("castMember", cast);
            const auto setup = document.value("setup").toObject();
            if (setup.contains("language")) input.insert("language", setup.value("language"));
            if (setup.contains("pace")) input.insert("pace", setup.value("pace"));
            self->submitLineDeliveryContext(clipId, input.toVariantMap());
        }, Qt::QueuedConnection);
    });
    m_worker = thread;
    connect(thread, &QThread::finished, this, [this, thread] { if (m_worker == thread) {
            m_worker = nullptr; emit changed();
            if (m_recoverWorkflowAfterWorker) { m_recoverWorkflowAfterWorker = false; recoverWorkflow(); }
        } });
    connect(thread, &QThread::finished, thread, &QObject::deleteLater);
    thread->start();
}
void GenerationController::submitLineDeliveryContext(const QString& clipId, const QVariantMap& input) {
    if (!m_timeline || !m_target || !ready() || busy()) { setError("Open a server timeline and wait for the current generation."); return; }
    if (!m_target->expectedInstance.isEmpty()) { setError("Generation is unavailable for a server that requires instance verification."); return; }
    QJsonObject clip;
    for (const auto& value : m_timeline->clipsJson()) if (value.toObject().value("id") == clipId) { clip = value.toObject(); break; }
    const auto context = QJsonObject::fromVariantMap(input);
    if (clip.isEmpty() || clipLocked(*m_timeline, clip) || clip.value("mediaType") != "audio" ||
        clip.value("scriptId").toString().isEmpty() || clip.value("scriptId") != context.value("scriptId") ||
        clip.value("scriptLineId").toString().isEmpty() || clip.value("scriptLineId") != context.value("line").toObject().value("id")) {
        setError("Choose an unlocked audio clip linked to this script line."); return;
    }
    const auto request = nt::ai::lineDeliveryRequest(context);
    if (!request.ok()) { setError(request.error); return; }
    if (!QDir().mkpath(m_target->backupDir)) { setError("Could not create generation recovery folder."); return; }
    QLockFile submissionLock(QDir(m_target->backupDir).filePath(pendingPrefix(*m_target) + QStringLiteral("submission.lock")));
    submissionLock.setStaleLockTime(0);
    if (!submissionLock.tryLock(0)) { setError("Another editor is starting a generation."); return; }
    if (activeRecoveryExists(*m_target)) { setError("A generation is already in progress for this timeline."); return; }
    const auto requestId = id(); const auto snapshot = request.snapshot; const auto data = request.data;
    m_job = {{"requestId", requestId}, {"clipId", clipId}, {"operation", "line-delivery"}, {"clip", clip}, {"snapshot", snapshot},
             {"provider", data.value("provider")}, {"model", data.value("model")}, {"prompt", data.value("prompt")},
             {"durationMs", clip.value("durationMs")}, {"startedAt", QDateTime::currentDateTimeUtc().toString(Qt::ISODateWithMs)}};
    m_generation = m_timeline->documentGeneration(); m_state = "pending"; m_error.clear();
    if (!save()) { m_state = "failed"; emit changed(); return; }
    if (!m_transport.send("generate_media", data, requestId)) { m_state = "failed"; m_error = "Could not send generation request."; }
    else { m_state = "running"; m_poll.start(); }
    save(); emit changed();
}
void GenerationController::regenerate(const QString& clipId) {
    regeneratePrepared(clipId, id());
}

void GenerationController::regeneratePrepared(const QString& clipId, const QString& requestId) {
    static const QRegularExpression canonicalId(QStringLiteral("^[0-9a-f]{32}$"));
    if (requestId.size() != 32 || !canonicalId.match(requestId).hasMatch()) { setError("Invalid generation request ID."); return; }
    regenerateRequest(clipId, requestId, {});
}

void GenerationController::regenerateProductionPrepared(const QString& clipId, const QVariantMap& compiled) {
    const auto production = QJsonObject::fromVariantMap(compiled);
    const auto identity = production.value("identity").toObject();
    const auto snapshot = production.value("snapshot").toObject();
    const auto batchId = identity.value("batchId").toString();
    const auto index = identity.value("variationIndex").toInt();
    const auto variation = QStringLiteral("variation:") + batchId + QStringLiteral(":timeline_clip:") + clipId + QLatin1Char(':') + QString::number(index);
    const auto candidate = QStringLiteral("candidate:") + variation;
    const auto request = QStringLiteral("request:") + candidate;
    if (batchId.trimmed().isEmpty() || clipId.trimmed().isEmpty() || index < 1 || index > 3 ||
        identity.value("destinationKind") != "timeline_clip" || identity.value("destinationId") != clipId ||
        identity.value("variationId") != variation || identity.value("candidateId") != candidate || identity.value("requestId") != request) {
        setError("Invalid production candidate identity."); return;
    }
    for (const auto* field : {"batchId", "destinationKind", "destinationId", "variationIndex", "variationId", "candidateId", "requestId"}) {
        if (snapshot.value(field) != identity.value(field)) { setError("Production snapshot does not match its candidate."); return; }
    }
    if (snapshot.value("schemaVersion").toInt() != 1 || snapshot.value("prompt").toString().trimmed().isEmpty() ||
        snapshot.value("provider").toString().isEmpty() || snapshot.value("model").toString().isEmpty()) {
        setError("Invalid production generation snapshot."); return;
    }
    regenerateRequest(clipId, request, production);
}

void GenerationController::regenerateRequest(const QString& clipId, const QString& requestId, const QJsonObject& production) {
    if (!m_timeline || !m_target || !ready() || busy()) { setError("Open a server timeline and wait for the current generation."); return; }
    if (!m_target->expectedInstance.isEmpty()) { setError("Generation is unavailable for a server that requires instance verification."); return; }
    QJsonObject clip;
    for (const auto& value : m_timeline->clipsJson()) if (value.toObject().value("id") == clipId) { clip = value.toObject(); break; }
    if (clip.isEmpty() || clipLocked(*m_timeline, clip)) { setError("Choose an unlocked clip on an unlocked track."); return; }
    const auto originalClip = clip;
    if (!production.isEmpty()) {
        const auto snapshot = production.value("snapshot").toObject();
        for (const auto* field : {"prompt", "provider", "model"}) clip.insert(field, snapshot.value(field));
        if (snapshot.value("requestedDurationMs").isDouble()) clip.insert("durationMs", snapshot.value("requestedDurationMs"));
        if (production.value("referenceAssetIds").isArray()) clip.insert("referenceImageIds", production.value("referenceAssetIds"));
    }
    const auto kind = clip.value("bindingKind").toString();
    const auto mode = kind == "text-to-image" ? QStringLiteral("image") : kind == "image-to-image" ? QStringLiteral("image_edit") :
                      (kind == "text-to-video" || kind == "image-to-video") ? QStringLiteral("video") : kind == "text-to-music" ? QStringLiteral("music") :
                      kind == "text-to-audio" ? QStringLiteral("audio") : QString();
    const auto provider = clip.value("provider").toString(), model = clip.value("model").toString(), prompt = clip.value("prompt").toString().trimmed();
    if (mode.isEmpty() || provider.isEmpty() || model.isEmpty() || prompt.isEmpty()) { setError("This clip does not have a replayable generation recipe."); return; }
    QJsonObject source;
    if (kind == "image-to-image" || kind == "image-to-video") {
        const auto sourceId = clip.value("sourceClipId").toString();
        for (const auto& value : m_timeline->clipsJson()) if (value.toObject().value("id").toString() == sourceId) { source = value.toObject(); break; }
        if (source.isEmpty() || source.value("mediaType") != "image" || source.value("currentAssetId").toString().isEmpty()) {
            setError("Resolve the source image before generating."); return;
        }
    }
    if (!QDir().mkpath(m_target->backupDir)) { setError("Could not create generation recovery folder."); return; }
    QLockFile submissionLock(QDir(m_target->backupDir).filePath(pendingPrefix(*m_target) + QStringLiteral("submission.lock")));
    submissionLock.setStaleLockTime(0);
    if (!submissionLock.tryLock(0)) { setError("Another editor is starting a generation."); return; }
    if (activeRecoveryExists(*m_target)) { setError("A generation is already in progress for this timeline."); return; }
    if (QFile::exists(pendingPath(*m_target, requestId))) { setError("This generation request already exists."); return; }
    for (const auto& value : m_timeline->clipsJson()) {
        for (const auto& version : value.toObject().value("versions").toArray()) {
            if (version.toObject().value("requestId").toString() == requestId) { setError("This generation request already exists."); return; }
        }
    }
    m_job = {{"requestId", requestId}, {"clipId", clipId}, {"operation", "regenerate"}, {"clip", originalClip}, {"mode", mode},
             {"provider", provider}, {"model", model}, {"prompt", prompt}, {"durationMs", originalClip.value("durationMs")},
             {"startedAt", QDateTime::currentDateTimeUtc().toString(Qt::ISODateWithMs)}};
    if (!source.isEmpty()) m_job.insert("sourceClip", source);
    if (!production.isEmpty()) m_job.insert("production", production);
    m_generation = m_timeline->documentGeneration(); m_state = "pending"; m_error.clear();
    if (!save()) { m_state = "failed"; emit changed(); return; }
    QJsonObject data{{"mode", mode}, {"provider", provider}, {"model", model}, {"prompt", prompt}, {"variations", 1},
        {"timeline_context", QJsonObject{{"sequence_id", m_target->timelineId}, {"target_clip_id", clipId}}}};
    if (!source.isEmpty()) {
        data.insert("source_asset_id", source.value("currentAssetId"));
        data.insert("timeline_context", QJsonObject{{"sequence_id", m_target->timelineId}, {"source_clip_id", source.value("id")}, {"target_clip_id", clipId}});
    }
    if (mode == "video" || mode == "music") {
        const double seconds = clip.value("durationMs").toDouble() / 1000;
        data.insert("duration", kind == "image-to-video" ? std::max(1.0, std::ceil(seconds - 1e-6)) : std::round(seconds));
    }
    if (mode == "audio" && clip.contains("voice")) data.insert("voice", clip.value("voice"));
    if (mode == "video" || mode == "image" || mode == "image_edit") {
        if (mode == "image" || mode == "image_edit") {
            if (clip.contains("width")) data.insert("width", clip.value("width"));
            if (clip.contains("height")) data.insert("height", clip.value("height"));
        }
        for (const auto& fields : {std::pair{"seed", "seed"}, {"negativePrompt", "negative_prompt"},
                                   {"strength", "strength"}, {"numInferenceSteps", "num_inference_steps"}}) {
            if (clip.contains(fields.first) && !clip.value(fields.first).isNull()) data.insert(fields.second, clip.value(fields.first));
        }
        if (clip.contains("aspectRatio")) data.insert("aspect_ratio", clip.value("aspectRatio"));
        if (clip.contains("resolution")) data.insert("resolution", clip.value("resolution"));
        if (kind == "text-to-video") {
            QJsonArray images; for (const auto& image : clip.value("referenceImageIds").toArray()) images.append(QJsonObject{{"type", "image"}, {"asset_id", image}});
            if (!images.isEmpty()) { data.insert("reference_images", images); data.insert("capability", "reference_to_video"); }
            QStringList cast; for (const auto& entity : clip.value("referenceEntityIds").toArray()) cast.append(QStringLiteral("entity://") + entity.toString());
            if (!cast.isEmpty()) data.insert("prompt", prompt + QStringLiteral("\n\nCast: ") + cast.join(QStringLiteral(", ")) + QStringLiteral("."));
        }
    }
    if (!m_transport.send("generate_media", data, requestId)) { m_state = "failed"; m_error = "Could not send generation request."; }
    else { m_state = "running"; m_poll.start(); }
    save(); emit changed();
}
void GenerationController::submitExtension(const QString& clipId, const QVariantMap& model, const QVariantMap& options) {
    if (!m_timeline || !m_target || !ready() || busy()) { setError("Open a server timeline and wait for the current generation."); return; }
    if (!m_target->expectedInstance.isEmpty()) { setError("Generation is unavailable for a server that requires instance verification."); return; }
    QJsonObject clip;
    for (const auto& value : m_timeline->clipsJson()) if (value.toObject().value("id") == clipId) { clip = value.toObject(); break; }
    if (clip.isEmpty() || clipLocked(*m_timeline, clip)) { setError("Choose an unlocked clip on an unlocked track."); return; }
    const auto requestId = id();
    const auto request = nt::ai::extensionRequest(m_target->timelineId, requestId, clip, QJsonObject::fromVariantMap(model), QJsonObject::fromVariantMap(options));
    if (!request.ok()) { setError(request.error); return; }
    if (!QDir().mkpath(m_target->backupDir)) { setError("Could not create generation recovery folder."); return; }
    QLockFile submissionLock(QDir(m_target->backupDir).filePath(pendingPrefix(*m_target) + QStringLiteral("submission.lock")));
    submissionLock.setStaleLockTime(0);
    if (!submissionLock.tryLock(0)) { setError("Another editor is starting a generation."); return; }
    if (activeRecoveryExists(*m_target)) { setError("A generation is already in progress for this timeline."); return; }
    const auto snapshot = request.snapshot;
    m_job = {{"requestId", requestId}, {"clipId", clipId}, {"operation", "extension"}, {"clip", clip}, {"snapshot", snapshot},
             {"provider", snapshot.value("provider")}, {"model", snapshot.value("model")}, {"prompt", snapshot.value("prompt")},
             {"durationMs", clip.value("durationMs")}, {"startedAt", QDateTime::currentDateTimeUtc().toString(Qt::ISODateWithMs)}};
    m_generation = m_timeline->documentGeneration(); m_state = "pending"; m_error.clear();
    if (!save()) { m_state = "failed"; emit changed(); return; }
    auto data = request.data;
    data.insert("timeline_context", QJsonObject{{"sequence_id", m_target->timelineId}, {"source_clip_id", clipId}, {"target_clip_id", clipId}});
    if (!m_transport.send("generate_media", data, requestId)) { m_state = "failed"; m_error = "Could not send generation request."; }
    else { m_state = "running"; m_poll.start(); }
    save(); emit changed();
}
void GenerationController::submitImageToVideo(const QString& clipId, const QVariantMap& model, const QVariantMap& options) {
    if (!m_timeline || !m_target || !ready() || busy()) { setError("Open a server timeline and wait for the current generation."); return; }
    if (!m_target->expectedInstance.isEmpty()) { setError("Generation is unavailable for a server that requires instance verification."); return; }
    QJsonObject source;
    for (const auto& value : m_timeline->clipsJson()) if (value.toObject().value("id") == clipId) { source = value.toObject(); break; }
    if (source.isEmpty() || clipLocked(*m_timeline, source)) { setError("Choose an unlocked image clip."); return; }
    const auto targetId = nt::edit::newId();
    auto parameters = QJsonObject::fromVariantMap(options); parameters.insert("targetClipId", targetId);
    if (parameters.value("width").toDouble() <= 0 || parameters.value("height").toDouble() <= 0) {
        for (const auto& loaded : m_timeline->timeline().clips) {
            if (QString::fromStdString(loaded.id) != clipId || loaded.mediaPath.empty()) continue;
            const auto size = QImageReader(QString::fromStdString(loaded.mediaPath)).size();
            if (size.isValid()) { parameters.insert("width", size.width()); parameters.insert("height", size.height()); }
            break;
        }
    }
    if (parameters.value("width").toDouble() <= 0 || parameters.value("height").toDouble() <= 0) {
        setError("Resolve the source image before generating video."); return;
    }
    const auto request = nt::ai::imageToVideoRequest(m_target->timelineId, source, QJsonObject::fromVariantMap(model), parameters);
    if (!request.ok()) { setError(request.error); return; }
    if (!QDir().mkpath(m_target->backupDir)) { setError("Could not create generation recovery folder."); return; }
    QLockFile submissionLock(QDir(m_target->backupDir).filePath(pendingPrefix(*m_target) + QStringLiteral("submission.lock")));
    submissionLock.setStaleLockTime(0);
    if (!submissionLock.tryLock(0)) { setError("Another editor is starting a generation."); return; }
    if (activeRecoveryExists(*m_target)) { setError("A generation is already in progress for this timeline."); return; }
    const auto snapshot = request.snapshot;
    QJsonObject clip{{"id", targetId}, {"name", source.value("name").toString() + QStringLiteral(" video")},
        {"startMs", source.value("startMs")}, {"durationMs", snapshot.value("clipDurationMs")}, {"mediaType", "video"},
        {"sourceType", "generated"}, {"bindingKind", "image-to-video"}, {"sourceClipId", clipId},
        {"prompt", snapshot.value("prompt")}, {"provider", snapshot.value("provider")}, {"model", snapshot.value("model")},
        {"status", "draft"}, {"locked", false}, {"versions", QJsonArray{}}};
    if (snapshot.contains("aspectRatio")) clip.insert("aspectRatio", snapshot.value("aspectRatio"));
    if (snapshot.contains("resolution")) clip.insert("resolution", snapshot.value("resolution"));
    if (!m_timeline->applyEdit("ai.insertImageVideo", {{"clip", clip}, {"sourceTrackId", source.value("trackId")}})) {
        setError("Could not place the generated video."); return;
    }
    emit clipInserted(targetId);
    const auto requestId = id();
    m_job = {{"requestId", requestId}, {"clipId", targetId}, {"operation", "image-to-video"}, {"clip", clip},
             {"sourceClip", source}, {"snapshot", snapshot}, {"provider", snapshot.value("provider")}, {"model", snapshot.value("model")},
             {"prompt", snapshot.value("prompt")}, {"durationMs", snapshot.value("clipDurationMs")},
             {"startedAt", QDateTime::currentDateTimeUtc().toString(Qt::ISODateWithMs)}};
    m_generation = m_timeline->documentGeneration(); m_state = "pending"; m_error.clear();
    if (!save()) { m_state = "failed"; emit changed(); return; }
    if (!m_transport.send("generate_media", request.data, requestId)) { m_state = "failed"; m_error = "Could not send generation request."; }
    else { m_state = "running"; m_poll.start(); }
    save(); emit changed();
}
void GenerationController::submitMediaEdit(const QString& clipId, const QVariantMap& options) {
    if (!m_timeline || !m_target || !ready() || busy()) { setError("Open a server timeline and wait for the current generation."); return; }
    if (!m_target->expectedInstance.isEmpty()) { setError("Generation is unavailable for a server that requires instance verification."); return; }
    QJsonObject clip;
    for (const auto& value : m_timeline->clipsJson()) {
        if (value.toObject().value("id") == clipId) { clip = value.toObject(); break; }
    }
    if (clip.isEmpty() || clipLocked(*m_timeline, clip)) { setError("Choose an unlocked clip on an unlocked track."); return; }
    const auto request = nt::ai::mediaEditRequest(m_target->timelineId, clip, QJsonObject::fromVariantMap(options));
    if (!request.ok()) { setError(request.error); return; }
    if (!QDir().mkpath(m_target->backupDir)) { setError("Could not create generation recovery folder."); return; }
    QLockFile submissionLock(QDir(m_target->backupDir).filePath(pendingPrefix(*m_target) + QStringLiteral("submission.lock")));
    submissionLock.setStaleLockTime(0);
    if (!submissionLock.tryLock(0)) { setError("Another editor is starting a generation."); return; }
    if (activeRecoveryExists(*m_target)) { setError("A generation is already in progress for this timeline."); return; }
    const auto requestId = id();
    const auto snapshot = request.snapshot;
    m_job = {{"requestId", requestId}, {"clipId", clipId}, {"operation", "edit"}, {"clip", clip}, {"snapshot", snapshot},
             {"provider", snapshot.value("provider")}, {"model", snapshot.value("model")},
             {"prompt", snapshot.value("instruction")}, {"durationMs", clip.value("durationMs")},
             {"startedAt", QDateTime::currentDateTimeUtc().toString(Qt::ISODateWithMs)}};
    m_generation = m_timeline->documentGeneration(); m_state = "pending"; m_error.clear();
    if (!save()) { m_state = "failed"; emit changed(); return; }
    auto data = request.data;
    data.insert("timeline_context", QJsonObject{{"sequence_id", m_target->timelineId}, {"source_clip_id", clipId}, {"target_clip_id", clipId}});
    if (!m_transport.send("generate_media", data, requestId)) { m_state = "failed"; m_error = "Could not send generation request."; }
    else { m_state = "running"; m_poll.start(); }
    save(); emit changed();
}
void GenerationController::playPreview() {
    if (m_loadedPreviewKey.isEmpty()) return;
    if (m_previewClock->playing()) { m_previewClock->pause(); return; }
    if (!m_previewAudio) {
        auto audio = std::make_unique<nt::audio::AppAudio>();
        QString error;
        if (!audio->start(m_previewAudioMode, 0, *m_previewTimeline, *m_previewClock, &error)) { setError(error); return; }
        m_previewAudio = std::move(audio);
    }
    m_previewClock->play();
}
void GenerationController::stopPreview() {
    m_previewClock->pause();
    m_previewAudio.reset();
}
void GenerationController::cancel() {
    if (!busy() || m_job.isEmpty()) return;
    if (m_job.value("operation") == "workflow") {
        if (m_worker || !m_target || !m_timeline) { setError("Wait for the current request before cancelling."); return; }
        const auto input = m_workflow->beginCancel();
        if (input.isEmpty()) { setError("This workflow cannot be cancelled now."); return; }
        m_job.insert("cancelRequested", true); m_state = "cancelling"; save(); emit changed();
        const auto target = *m_target; const auto model = m_timeline; const auto generation = model->documentGeneration();
        const auto context = m_job.value("workflowContext").toObject(); const QPointer<GenerationController> self(this);
        auto* thread = QThread::create([self, target, model, generation, input, context] {
            nt::server::ServerClient client(target.server, target.token); client.setExpectedInstance(target.expectedInstance);
            const auto response = client.mutate("jobs.cancel", input);
            if (!self) return;
            QMetaObject::invokeMethod(self, [self, model, generation, context, response] {
                if (!self || !model || self->m_timeline != model || model->documentGeneration() != generation ||
                    self->m_job.value("workflowContext").toObject() != context) return;
                if (!self->m_workflow->finishCancel(response.ok(), response.data.toObject(), response.describe())) {
                    self->m_job.remove("cancelRequested"); self->m_state = "recovering"; self->save();
                    self->m_recoverWorkflowAfterWorker = true; emit self->changed();
                }
            }, Qt::QueuedConnection);
        });
        m_worker = thread;
        connect(thread, &QThread::finished, this, [this, thread] { if (m_worker == thread) {
            m_worker = nullptr; emit changed();
            if (m_recoverWorkflowAfterWorker) { m_recoverWorkflowAfterWorker = false; recoverWorkflow(); }
        } });
        connect(thread, &QThread::finished, thread, &QObject::deleteLater); thread->start(); return;
    }
    m_cancelRequestId = id();
    if (!m_transport.send("cancel_generation", {{"request_ids", QJsonArray{m_job.value("requestId")}}}, m_cancelRequestId)) {
        setError("Could not send cancellation. Reconnect and try again."); return;
    }
    m_job.insert("cancelRequested", true);
    m_state = "cancelling"; save(); emit changed();
}
void GenerationController::receive(const QJsonObject& message) {
    if (m_job.isEmpty() || !busy() || m_job.value("operation") == "workflow") return;
    QJsonObject outcome;
    if (message.value("request_id").toString() == m_cancelRequestId && !m_cancelRequestId.isEmpty()) {
        m_cancelRequestId.clear();
        if (message.value("error").isObject()) {
            m_job.remove("cancelRequested"); m_state = "recovering";
            m_error = message.value("error").toObject().value("message").toString();
        }
        lookup(); save(); emit changed(); return;
    }
    if (message.value("request_id") == m_job.value("requestId")) {
        if (m_job.value("cancelRequested").toBool()) { lookup(); return; }
        if (message.value("error").isObject()) { m_state = "failed"; m_error = message.value("error").toObject().value("message").toString(); }
        else { outcome = message.value("result").toObject(); m_state = "completed"; }
    } else if (message.value("command").toString() == "lookup_generations") {
        for (const auto& v : message.value("result").toObject().value("generations").toArray()) {
            const auto row = v.toObject();
            if (row.value("request_id") != m_job.value("requestId")) continue;
            const auto status = row.value("status").toString();
            if (status == "completed") { outcome = row; m_state = status; }
            else if (status == "failed" || status == "cancelled" || status == "interrupted" || status == "needs_attention") {
                m_state = status; m_error = row.value("error").toString();
            } else { m_state = status; }
            break;
        }
    } else return;
    if (m_state == "completed") {
        const auto assets = outcome.value("asset_ids").toArray();
        if (assets.isEmpty() || assets.first().toString().isEmpty()) { m_state = "failed"; m_error = "Generation returned no asset."; }
        else {
            auto candidate = m_job;
            candidate.insert("id", m_job.value("requestId")); candidate.insert("assetId", assets.first());
            candidate.insert("status", "success"); candidate.insert("label", "Generated take");
            candidate.insert("generationId", outcome.value("generation_id"));
            bool known = false;
            for (const auto& entry : m_candidates) {
                const auto previous = entry.toObject();
                if (previous.value("id") == candidate.value("id")) { known = true; break; }
            }
            if (!known) m_candidates.append(candidate);
        }
    }
    if (!busy()) m_poll.stop();
    save(); emit changed();
}
void GenerationController::setError(const QString& error) { m_error = error; emit changed(); }
bool GenerationController::save() {
    if (!canonicalizeTarget()) return false;
    QDir().mkpath(m_target->backupDir);
    const auto requestId = m_job.value("requestId").toString();
    if (requestId.isEmpty()) return false;
    QJsonArray ownCandidates;
    for (const auto& entry : m_candidates) {
        if (entry.toObject().value("requestId").toString() == requestId) ownCandidates.append(entry);
    }
    QSaveFile file(pendingPath(*m_target, requestId));
    if (!file.open(QIODevice::WriteOnly) || file.write(QJsonDocument(QJsonObject{{"job", m_job}, {"state", m_state}, {"candidates", ownCandidates}}).toJson()) < 0 || !file.commit()) {
        m_error = "Could not save generation recovery data.";
        return false;
    }
    return true;
}
void GenerationController::restore() {
    if (!m_target) return;
    if (!canonicalizeTarget()) return;
    const QDir folder(m_target->backupDir);
    const auto names = folder.entryList({pendingPrefix(*m_target) + QStringLiteral("*.json")}, QDir::Files, QDir::Name);
    for (const auto& name : names) {
        QFile file(folder.filePath(name));
        if (!file.open(QIODevice::ReadOnly)) continue;
        const auto object = QJsonDocument::fromJson(file.readAll()).object();
        for (const auto& entry : object.value("candidates").toArray()) m_candidates.append(entry);
        const auto status = object.value("state").toString();
        if (status == "pending" || status == "queued" || status == "running" || status == "recovering" || status == "cancelling") {
            m_job = object.value("job").toObject(); m_state = "recovering";
        } else if (m_job.isEmpty()) {
            m_job = object.value("job").toObject(); m_state = status;
        }
    }
}
QJsonObject GenerationController::candidate(const QString& clipId, const QString& takeId) const {
    for (const auto& v : m_candidates) { const auto c = v.toObject(); if (c.value("clipId") == clipId && c.value("id") == takeId) return c; }
    for (const auto& v : candidates()) {
        const auto c = QJsonObject::fromVariantMap(v.toMap());
        if (c.value("clipId") == clipId && c.value("id") == takeId) return c;
    }
    return {};
}
void GenerationController::renameTake(const QString& clipId, const QString& takeId, const QString& label) {
    if (!m_timeline) return;
    auto clips = m_timeline->clipsJson();
    for (int i = 0; i < clips.size(); ++i) {
        const auto clip = clips[i].toObject();
        if (clip.value("id") != clipId) continue;
        if (clipLocked(*m_timeline, clip)) { setError("Unlock the clip and track first."); return; }
        const auto result = nt::ai::renameTake(clip, takeId, label);
        if (!result.error.isEmpty()) { setError(result.error); return; }
        clips.replace(i, result.clip);
        m_timeline->commitEdit("Rename take", m_timeline->clipsJson(), clips);
        emit changed(); return;
    }
}
void GenerationController::deleteTake(const QString& clipId, const QString& takeId) {
    if (!m_timeline) return;
    QJsonObject selected;
    for (const auto& value : candidates()) {
        const auto item = QJsonObject::fromVariantMap(value.toMap());
        if (item.value("clipId") == clipId && item.value("id") == takeId) { selected = item; break; }
    }
    if (selected.isEmpty()) { setError("Take not found."); return; }
    auto clips = m_timeline->clipsJson();
    int clipIndex = -1;
    for (int i = 0; i < clips.size(); ++i) if (clips[i].toObject().value("id") == clipId) { clipIndex = i; break; }
    const bool recorded = selected.value("recorded").toBool();
    nt::ai::TakeResult result;
    if (recorded) {
        if (clipIndex < 0) { setError("The clip no longer exists."); return; }
        const auto clip = clips[clipIndex].toObject();
        if (clipLocked(*m_timeline, clip)) { setError("Unlock the clip and track first."); return; }
        result = nt::ai::deleteTake(clip, takeId);
        if (!result.error.isEmpty()) { setError(result.error); return; }
    }
    const auto requestId = selected.value("requestId").toString();
    const auto assetId = selected.value("assetId").toString();
    if (!requestId.isEmpty() && m_target) {
        if (!canonicalizeTarget()) return;
        const auto path = pendingPath(*m_target, requestId);
        QFile record(path);
        if (record.exists()) {
            if (!record.open(QIODevice::ReadOnly)) { setError("Could not read the saved candidate."); return; }
            QJsonParseError parseError;
            const auto document = QJsonDocument::fromJson(record.readAll(), &parseError);
            record.close();
            if (parseError.error != QJsonParseError::NoError || !document.isObject()) { setError("The saved candidate is invalid."); return; }
            auto saved = document.object();
            QJsonArray remaining;
            for (const auto& value : saved.value("candidates").toArray()) {
                const auto item = value.toObject();
                if (item.value("clipId") == clipId && item.value("requestId").toString() == requestId &&
                    item.value("assetId").toString() == assetId) continue;
                remaining.append(value);
            }
            saved.insert("candidates", remaining);
            QSaveFile output(path);
            const auto bytes = QJsonDocument(saved).toJson(QJsonDocument::Compact);
            if (!output.open(QIODevice::WriteOnly) || output.write(bytes) != bytes.size() || !output.commit()) {
                setError("Could not save the candidate deletion."); return;
            }
        }
    }
    for (int i = m_candidates.size() - 1; i >= 0; --i) {
        const auto item = m_candidates[i].toObject();
        if (item.value("clipId") == clipId && item.value("assetId").toString() == assetId &&
            (requestId.isEmpty() ? item.value("id").toString() == takeId : item.value("requestId").toString() == requestId)) m_candidates.removeAt(i);
    }
    if (recorded) {
        clips.replace(clipIndex, result.clip);
        m_timeline->commitEdit("Delete take", m_timeline->clipsJson(), clips);
    }
    stopPreview();
    m_previews.remove(clipId + ':' + takeId);
    emit changed();
}

QUrl GenerationController::previewUrl(const QString& clipId, const QString& takeId) {
    const auto key = clipId + ':' + takeId;
    if (m_previewKey != key) { m_previewKey = key; m_previewClock->pause(); }
    if (m_loadedPreviewKey != key && !m_resolving) resolve(clipId, takeId, false);
    return m_loadedPreviewKey == key ? m_previews.value(key) : QUrl{};
}
void GenerationController::apply(const QString& clipId, const QString& takeId) { resolve(clipId, takeId, true); }
void GenerationController::applyExtension(const QString& clipId, const QString& takeId, const QString& timing) {
    resolve(clipId, takeId, true, timing);
}
void GenerationController::resolve(const QString& clipId, const QString& takeId, bool applyResult, const QString& timing) {
    if (m_resolving || m_worker || !m_target || !m_timeline) return;
    const auto take = candidate(clipId, takeId);
    bool generatedCandidate = false;
    for (const auto& value : m_candidates) {
        const auto item = value.toObject();
        if (item.value("clipId") == clipId && item.value("id") == takeId) { generatedCandidate = true; break; }
    }
    if (take.isEmpty()) { setError("Candidate not found."); return; }
    QJsonObject rawClip;
    for (const auto& v : m_timeline->clipsJson()) if (v.toObject().value("id") == clipId) rawClip = v.toObject();
    if (rawClip.isEmpty()) { setError("The clip no longer exists."); return; }
    const auto model = m_timeline; const auto generation = m_timeline->documentGeneration();
    const auto target = *m_target; const auto assetId = take.value("assetId").toString();
    const auto sourceClip = rawClip;
    rawClip.insert("currentAssetId", assetId);
    m_resolving = true; emit changed();
    const QPointer<GenerationController> self(this);
    const auto protection = m_mediaProtection;
    const auto mediaGeneration = protection->generation();
    auto* thread = QThread::create([self, model, generation, target, take, sourceClip, rawClip, clipId, takeId, assetId, applyResult, generatedCandidate, protection, mediaGeneration, timing] {
        nt::server::ServerClient client(target.server, target.token);
        auto result = client.getAsset(assetId);
        nt::Clip media;
        double baselineDurationMs = 0;
        if ((take.value("operation") == "edit" || take.value("operation") == "extension" || take.value("operation") == "regenerate" || take.value("operation") == "line-delivery" || take.value("operation") == "workflow") && applyResult && !sourceClip.value("currentAssetId").toString().isEmpty()) {
            const auto sourceId = sourceClip.value("currentAssetId").toString();
            const auto sourceAsset = client.getAsset(sourceId);
            if (sourceAsset.ok()) {
                const auto probed = nt::assets::withProbedVideoDuration(client, sourceAsset.data.toObject());
                baselineDurationMs = probed.value("duration").toDouble() * 1000;
            }
        }
        if (result.ok()) {
            result.data = nt::assets::withProbedVideoDuration(client, result.data.toObject());
            const auto cacheRoot = QDir::cleanPath(QDir(target.backupDir).absoluteFilePath("../../.."));
            media = nt::assets::resolveDroppedMedia(client, cacheRoot, result.data.toObject(), rawClip, *protection, mediaGeneration);
            if (rawClip.value("mediaType") == "audio" && !media.audioPath.empty() &&
                result.data.toObject().value("duration").toDouble() <= 0) {
                const auto facts = nt::probeMedia(media.audioPath);
                if (facts.opened && std::isfinite(facts.durationSec) && facts.durationSec > 0) {
                    auto asset = result.data.toObject(); asset.insert("duration", facts.durationSec); result.data = asset;
                }
            }
        }
        if (!self) return;
        QMetaObject::invokeMethod(self, [self, model, generation, take, sourceClip, rawClip, clipId, takeId, assetId, applyResult, generatedCandidate, result, media, baselineDurationMs, timing] {
            if (!self) return;
            auto* const controller = self.data();
            controller->m_resolving = false;
            if (!model || controller->m_timeline != model || model->documentGeneration() != generation) return;
            const QString path = QString::fromStdString(rawClip.value("mediaType").toString() == "audio" ? media.audioPath : media.mediaPath);
            if (!result.ok() || path.isEmpty() || !QFileInfo::exists(path)) { controller->setError("Candidate media could not be resolved."); return; }
            auto clips = model->clipsJson();
            for (int i = 0; i < clips.size(); ++i) {
                auto clip = clips[i].toObject();
                if (clip.value("id") != clipId) continue;
                const bool mediaEdit = take.value("operation") == "edit";
                const bool extension = take.value("operation") == "extension" || take.value("source") == "extended";
                const auto extensionSnapshot = take.value("snapshot").isObject() ? take.value("snapshot").toObject()
                    : take.value("paramOverridesSnapshot").toObject().value("extension").toObject();
                const bool replay = take.value("operation") == "regenerate";
                const bool lineDelivery = take.value("operation") == "line-delivery";
                const bool workflow = take.value("operation") == "workflow";
                bool staleImageSource = false;
                if (take.value("operation") == "image-to-video" || (take.value("operation") == "regenerate" && take.value("sourceClip").isObject())) {
                    const auto expected = take.value("sourceClip").toObject();
                    bool found = false;
                    for (const auto& value : clips) {
                        const auto source = value.toObject();
                        if (source.value("id") != expected.value("id")) continue;
                        found = true;
                        for (const auto* field : {"currentAssetId", "startMs", "durationMs", "mediaType"}) {
                            if (source.value(field) != expected.value(field)) staleImageSource = true;
                        }
                        break;
                    }
                    if (!found) staleImageSource = true;
                }
                const auto submittedClip = take.value("clip").toObject();
                bool staleEdit = false;
                if (mediaEdit || (extension && generatedCandidate) || replay || lineDelivery || workflow) {
                    for (const auto* field : {"currentAssetId", "trackId", "startMs", "durationMs", "inPointMs", "outPointMs", "speedMultiplier", "speedBaked", "timeRemap", "scriptId", "scriptLineId", "workflowId", "selectedOutputNodeId", "paramOverrides", "dependencyHash",
                                              "seed", "negativePrompt", "strength", "numInferenceSteps", "aspectRatio", "resolution",
                                              "referenceImageIds", "referenceEntityIds", "voice"}) {
                        if (clip.value(field) != submittedClip.value(field)) { staleEdit = true; break; }
                    }
                }
                if (applyResult && (clipLocked(*model, clip) || clip.value("trackId") != sourceClip.value("trackId") ||
                    clip.value("currentAssetId") != sourceClip.value("currentAssetId") || staleEdit || staleImageSource ||
                    (generatedCandidate && !mediaEdit && !extension && !lineDelivery && !workflow && (clip.value("sourceType") != "generated" ||
                    clip.value("provider") != take.value("provider") || clip.value("model") != take.value("model") ||
                    clip.value("prompt") != take.value("prompt") || clip.value("durationMs") != take.value("durationMs"))))) {
                    controller->setError("The clip changed after generation. Review the current clip before applying."); return;
                }
                const auto key = clipId + ':' + takeId;
                controller->m_previews.insert(key, QUrl::fromLocalFile(path));
                if (!applyResult && controller->m_previewKey != key) { emit controller->changed(); return; }
                auto previewClip = rawClip;
                if (!generatedCandidate && !extension) {
                    const auto projection = nt::ai::applyTake(clip, takeId);
                    if (!projection.error.isEmpty()) { controller->setError(projection.error); return; }
                    previewClip = projection.clip;
                }
                previewClip.insert("startMs", 0);
                if (extension) {
                    const double durationMs = result.data.toObject().value("duration").toDouble() * 1000;
                    const double rate = extensionSnapshot.value("source").toObject().value("rate").toDouble();
                    if (!std::isfinite(durationMs) || durationMs <= 0 || !std::isfinite(rate) || rate <= 0) {
                        controller->setError("Extension preview duration or source rate is invalid."); return;
                    }
                    previewClip.insert("inPointMs", 0); previewClip.insert("outPointMs", durationMs);
                    previewClip.insert("speedMultiplier", rate); previewClip.insert("speedBaked", false);
                    previewClip.insert("durationMs", durationMs / rate); previewClip.remove("timeRemap");
                }
                if (mediaEdit) {
                    previewClip.insert("inPointMs", 0); previewClip.insert("outPointMs", result.data.toObject().value("duration").toDouble() * 1000);
                    previewClip.insert("speedMultiplier", 1); previewClip.insert("speedBaked", true); previewClip.remove("timeRemap");
                }
                QJsonObject neutralClip{{"id", previewClip.value("id")}, {"trackId", "reviewTrack"},
                    {"name", "Candidate"}, {"mediaType", previewClip.value("mediaType")},
                    {"sourceType", "imported"}, {"startMs", 0}, {"durationMs", previewClip.value("durationMs")},
                    {"currentAssetId", assetId}, {"status", "generated"}, {"muted", false}};
                for (const auto* field : {"inPointMs", "outPointMs", "speedMultiplier", "speedBaked", "timeRemap"}) {
                    if (previewClip.contains(field)) neutralClip.insert(field, previewClip.value(field));
                }
                const auto document = model->timeline().raw;
                const auto trackType = neutralClip.value("mediaType") == "audio" ? QStringLiteral("audio") : QStringLiteral("video");
                QJsonObject previewDocument{{"id", "review"}, {"name", "Candidate review"},
                    {"fps", document.value("fps")}, {"width", document.value("width")}, {"height", document.value("height")},
                    {"durationMs", neutralClip.value("durationMs")},
                    {"tracks", QJsonArray{QJsonObject{{"id", "reviewTrack"}, {"type", trackType}, {"index", 0}, {"visible", true}, {"muted", false}}}},
                    {"clips", QJsonArray{neutralClip}}};
                const auto parsed = nt::parseTimelineJson(QJsonDocument(previewDocument).toJson(QJsonDocument::Compact));
                if (parsed.timeline) {
                    controller->m_previewClock->pause(); controller->m_previewClock->seek(0);
                    controller->m_previewTimeline->setTimeline(*parsed.timeline);
                    auto previewMedia = media;
                    previewMedia.raw = neutralClip;
                    controller->m_previewTimeline->registerMedia(previewMedia);
                    controller->m_previewClock->setDurationMs(previewClip.value("durationMs").toDouble());
                    controller->m_loadedPreviewKey = key;
                }
                if (applyResult) {
                    const double seconds = result.data.toObject().value("duration").toDouble();
                    QJsonObject version{{"id", takeId}, {"assetId", assetId}, {"status", "success"},
                        {"createdAt", take.value("startedAt")}, {"workflowUpdatedAt", take.value("startedAt")},
                        {"jobId", takeId}, {"dependencyHash", ""}, {"paramOverridesSnapshot", QJsonObject{}},
                        {"provider", take.value("provider")}, {"model", take.value("model")}, {"prompt", take.value("prompt")}};
                    if (seconds > 0) version.insert("durationMs", seconds * 1000);
                    if (!mediaEdit && !extension && !lineDelivery && !workflow) {
                        const auto submitted = take.value("clip").toObject();
                        QJsonObject params;
                        for (const auto* field : {"prompt", "provider", "model", "strength", "numInferenceSteps", "width", "height",
                                                  "voice", "aspectRatio", "resolution", "negativePrompt", "seed", "referenceImageIds", "referenceEntityIds"}) {
                            if (submitted.contains(field) && !submitted.value(field).isNull()) params.insert(field, submitted.value(field));
                        }
                        version.insert("requestId", takeId);
                        if (submitted.value("bindingKind") == "text-to-video") {
                            params.insert("durationMs", take.value("durationMs"));
                            if (submitted.contains("referenceImageIds")) params.insert("referenceAssetIds", submitted.value("referenceImageIds"));
                            const auto prompt = take.value("prompt").toString().trimmed();
                            const auto provider = take.value("provider").toString().trimmed();
                            const auto modelName = take.value("model").toString().trimmed();
                            const auto aspect = submitted.value("aspectRatio").toString().trimmed();
                            const auto resolution = submitted.value("resolution").toString().trimmed();
                            if (!prompt.isEmpty() && !provider.isEmpty() && !modelName.isEmpty() &&
                                take.value("durationMs").toDouble() > 0 && (!aspect.isEmpty() || !resolution.isEmpty())) {
                                QJsonObject recipe{{"schemaVersion", 1}, {"task", "text_to_video"}, {"prompt", prompt},
                                    {"provider", provider}, {"model", modelName}, {"durationMs", take.value("durationMs")}};
                                if (!aspect.isEmpty()) recipe.insert("aspectRatio", aspect);
                                if (!resolution.isEmpty()) recipe.insert("resolution", resolution);
                                const auto negative = submitted.value("negativePrompt").toString().trimmed();
                                if (!negative.isEmpty()) recipe.insert("negativePrompt", negative);
                                for (const auto* field : {"width", "height", "strength", "numInferenceSteps", "seed"}) {
                                    const auto value = submitted.value(field);
                                    if (!value.isDouble() || !std::isfinite(value.toDouble())) continue;
                                    if ((QString::fromLatin1(field) == u"width" || QString::fromLatin1(field) == u"height" ||
                                         QString::fromLatin1(field) == u"numInferenceSteps") && value.toDouble() <= 0) continue;
                                    if ((QString::fromLatin1(field) == u"seed" || QString::fromLatin1(field) == u"numInferenceSteps") &&
                                        std::floor(value.toDouble()) != value.toDouble()) continue;
                                    recipe.insert(field, value);
                                }
                                const auto references = submitted.value("referenceImageIds").toArray();
                                bool validReferences = !references.isEmpty();
                                for (const auto& reference : references) if (!reference.isString() || reference.toString().trimmed().isEmpty()) validReferences = false;
                                if (validReferences) recipe.insert("referenceAssetIds", references);
                                version.insert("source", "generated");
                                version.insert("generationRecipe", recipe);
                            }
                        }
                        version.insert("paramOverridesSnapshot", params);
                    }
                    const auto production = take.value("production").toObject();
                    if (!production.isEmpty()) {
                        version.insert("id", id());
                        const auto identity = production.value("identity").toObject();
                        const auto snapshot = production.value("snapshot").toObject();
                        for (const auto* field : {"candidateId", "batchId", "requestId", "variationId", "variationIndex"}) version.insert(field, identity.value(field));
                        version.insert("productionSnapshot", snapshot);
                        QJsonObject params{{"prompt", snapshot.value("prompt")}, {"provider", snapshot.value("provider")},
                            {"model", snapshot.value("model")}, {"referenceAssetIds", production.value("referenceAssetIds").toArray()}};
                        version.insert("paramOverridesSnapshot", params);
                        if (snapshot.value("requestedDurationMs").isDouble()) version.insert("durationMs", snapshot.value("requestedDurationMs"));
                    }
                    auto versions = clip.value("versions").toArray();
                    if (mediaEdit || extension || replay || lineDelivery || workflow) {
                        auto metadata = extension ? extensionSnapshot : take.value("snapshot").toObject(); metadata.insert("requestId", takeId);
                        if (mediaEdit) { version.insert("mediaEdit", metadata); version.insert("source", "video_to_video"); }
                        else if (extension) { version.insert("source", "extended"); version.insert("paramOverridesSnapshot", QJsonObject{{"extension", metadata}}); }
                        else if (workflow) {
                            const auto context = take.value("workflowContext").toObject();
                            version.insert("dependencyHash", context.value("dependencyHash").toString());
                            version.insert("paramOverridesSnapshot", context.value("paramOverrides").toObject());
                            if (!take.value("workflowUpdatedAt").toString().isEmpty()) version.insert("workflowUpdatedAt", take.value("workflowUpdatedAt"));
                        }
                        else if (lineDelivery) {
                            version.insert("source", "generated"); version.insert("lineDelivery", metadata);
                            version.insert("paramOverridesSnapshot", QJsonObject{{"sourceContext", metadata.value("sourceContext")},
                                {"instructions", metadata.value("instructions")}, {"speed", metadata.value("speed")}});
                        }
                        const auto sourceAsset = clip.value("currentAssetId").toString();
                        bool sourceRecorded = false;
                        for (const auto& entry : versions) {
                            if (entry.toObject().value("assetId").toString() == sourceAsset) { sourceRecorded = true; break; }
                        }
                        if (!sourceAsset.isEmpty() && !sourceRecorded) {
                            if ((!std::isfinite(baselineDurationMs) || baselineDurationMs <= 0) && clip.value("mediaType") == "video") {
                                controller->setError("Original media duration could not be resolved; the original take cannot be preserved."); return;
                            }
                            const auto originalDurationMs = std::isfinite(baselineDurationMs) && baselineDurationMs > 0
                                ? baselineDurationMs : clip.value("durationMs").toDouble();
                            const auto baselineId = QString::fromLatin1(QCryptographicHash::hash(
                                (clipId + QStringLiteral(":baseline:") + sourceAsset).toUtf8(), QCryptographicHash::Sha256).toHex().left(32));
                            QJsonObject mapping;
                            for (const auto* field : {"inPointMs", "outPointMs", "speedMultiplier", "speedBaked"}) {
                                if (clip.contains(field)) mapping.insert(field, clip.value(field));
                            }
                            versions.append(QJsonObject{{"id", baselineId}, {"assetId", sourceAsset}, {"status", "success"},
                                {"createdAt", take.value("startedAt")}, {"workflowUpdatedAt", take.value("startedAt")},
                                {"jobId", ""}, {"dependencyHash", clip.value("dependencyHash").toString()},
                                {"paramOverridesSnapshot", clip.value("paramOverrides").toObject()}, {"durationMs", originalDurationMs},
                                {"source", clip.value("sourceType")}, {"sourceMapping", mapping}});
                            version.insert("parentTakeId", baselineId);
                        }
                    }
                    bool alreadyPresent = false;
                    for (const auto& entry : versions) {
                        const auto existing = entry.toObject();
                        if (existing.value("id") == takeId || existing.value("jobId") == takeId ||
                            (!take.value("generationId").toString().isEmpty() &&
                             (existing.value("id") == take.value("generationId") || existing.value("jobId") == take.value("generationId"))) ||
                            existing.value("assetId") == assetId) { alreadyPresent = true; version = existing; break; }
                    }
                    if (!alreadyPresent) versions.append(version);
                    clip.insert("versions", versions);
                    if (extension) {
                        if (timing.isEmpty()) { controller->setError("Choose an extension timing mode."); return; }
                        clips.replace(i, clip);
                        QSet<QString> lockedTracks;
                        for (const auto& entry : model->timeline().raw.value("tracks").toArray()) {
                            const auto track = entry.toObject(); if (track.value("locked").toBool()) lockedTracks.insert(track.value("id").toString());
                        }
                        const auto extended = nt::ai::applyExtension(clips, extensionSnapshot.value("source").toObject(), version.value("id").toString(),
                            extensionSnapshot.value("direction").toString(), extensionSnapshot.value("addedSourceDurationMs").toDouble(), timing, lockedTracks);
                        if (!extended.ok()) { controller->setError(extended.error); return; }
                        model->registerMedia(media); model->commitEdit("Apply extension", model->clipsJson(), extended.clips);
                        emit controller->changed(); return;
                    }
                    const auto applied = nt::ai::applyTake(clip, version.value("id").toString());
                    if (!applied.error.isEmpty()) { controller->setError(applied.error); return; }
                    auto appliedClip = applied.clip;
                    if (generatedCandidate && !mediaEdit && !lineDelivery && !workflow) appliedClip.insert("status", "generated");
                    if (generatedCandidate && !lineDelivery && clip.value("mediaType") == "audio" && seconds > 0 &&
                        clip.value("speedMultiplier").toDouble(1) == 1 && !clip.contains("timeRemap") &&
                        !clip.contains("inPointMs") && !clip.contains("outPointMs")) {
                        appliedClip.insert("durationMs", std::round(seconds * 1000));
                    }
                    clips.replace(i, appliedClip);
                    model->registerMedia(media);
                    model->commitEdit("Apply generated take", model->clipsJson(), clips);
                }
                emit controller->changed(); return;
            }
            controller->setError("The clip no longer exists.");
        }, Qt::QueuedConnection);
    });
    m_worker = thread;
    connect(thread, &QThread::finished, this, [this, thread] { if (m_worker == thread) {
            m_worker = nullptr; emit changed();
            if (m_recoverWorkflowAfterWorker) { m_recoverWorkflowAfterWorker = false; recoverWorkflow(); }
        } });
    connect(thread, &QThread::finished, thread, &QObject::deleteLater);
    thread->start();
}
