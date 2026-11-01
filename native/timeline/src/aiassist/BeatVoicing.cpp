#include "aiassist/BeatVoicing.h"
#include "preview/FfmpegSource.h"
#include "aiassist/TranscriptBeats.h"
#include "aiassist/AssistDocument.h"
#include "app/EditRegistry.h"
#include "server/ServerClient.h"
#include "server/ServerSource.h"
#include <QDateTime>
#include <QCryptographicHash>
#include <QLockFile>
#include <QDir>
#include <QFile>
#include <QFileInfo>
#include <cmath>
#include <QSaveFile>
#include <QJsonDocument>
#include <QJsonArray>
#include <QUuid>
namespace {
const bool registeredBeatTake = nt::app::registerEdit("assist.applyBeatTake", nt::aiassist::applyTranscriptBeatTake);
QString requestId() { return QUuid::createUuid().toString(QUuid::Id128); }
}
BeatVoicing::BeatVoicing(QObject* parent) : QObject(parent), m_transport(this), m_timeout(this), m_poll(this) {
    m_poll.setInterval(3000);
    connect(&m_poll, &QTimer::timeout, this, &BeatVoicing::lookup);
    m_timeout.setSingleShot(true);
    connect(&m_timeout, &QTimer::timeout, this, [this] {
        if (m_state == "transcribing") { persist({}); }
        else if (busy()) { fail("Speech request timed out. Check existing takes before retrying."); }
    });
    connect(&m_transport, &nt::ai::GenerationTransport::readyChanged, this, [this] {
        if (m_transport.ready() && m_state == "recovering" && current()) { lookup(); m_poll.start(); }
        if (m_transport.ready() && m_state == "connecting" && current()) {
            m_state = "generating";
            if (!m_transport.send("generate_media", m_plan.request, m_requestId)) { fail("Could not send the speech request."); }
            emit changed();
        }
    });
    connect(&m_transport, &nt::ai::GenerationTransport::response, this, &BeatVoicing::receive);
    connect(&m_transport, &nt::ai::GenerationTransport::error, this, [this](const QString& error) {
        if (m_state == "transcribing") { persist({}); } else if (busy()) { fail(error); }
    });
    connect(&m_transport, &nt::ai::GenerationTransport::disconnected, this, [this] {
        if (m_state == "transcribing") { persist({}); }
        else if (busy() && m_state != "saving") { fail("Connection lost. Check the beat before retrying to avoid recording the line twice."); }
    });
}
BeatVoicing::~BeatVoicing() {
    if (m_worker) { m_worker->requestInterruption(); m_worker->wait(); }
}
void BeatVoicing::setTimeline(TimelineModel* timeline) {
    if (m_timeline == timeline) { return; }
    cancel();
    if (m_timeline) { disconnect(m_timeline, nullptr, this, nullptr); }
    m_timeline = timeline;
    m_target = nt::server::serverSaveTarget();
    if (m_timeline) { connect(m_timeline, &TimelineModel::documentReplaced, this, [this] { cancel(); m_target = nt::server::serverSaveTarget(); }); }
    emit changed();
}
bool BeatVoicing::current() const {
    return m_timeline && m_generation == m_timeline->documentGeneration();
}
void BeatVoicing::fail(const QString& error) { m_timeout.stop(); m_poll.stop(); m_error = error; m_state = "failed"; emit changed(); }
void BeatVoicing::voice(const QString& clipId, const QString& provider, const QString& model, const QString& voice) {
    if (busy() || m_worker || !m_timeline) { return; }
    QStringList ids;
    for (const auto& value : m_timeline->clipsJson()) { ids.append(value.toObject().value("id").toString()); }
    const auto resolvedId = nt::aiassist::resolveId(clipId, ids);
    if (!resolvedId) { fail("Choose an unambiguous voiceover beat."); return; }
    QJsonObject observed;
    for (const auto& value : m_timeline->clipsJson()) { if (value.toObject().value("id").toString() == *resolvedId) { observed = value.toObject(); break; } }
    if (observed.isEmpty() || observed.value("bindingKind").toString() != "text-to-audio") { fail("Choose a voiceover beat."); return; }
    m_observedClip = observed;
    m_candidate = {};
    m_candidateMedia.reset();
    const QString lineId = *resolvedId;
    const QJsonObject voiceBinding{{"provider", provider}, {"model", model}, {"voice", voice}};
    const QJsonObject line{{"id", lineId}, {"text", observed.value("prompt")}, {"voiceOverride", voiceBinding}};
    const QJsonObject section{{"lines", QJsonArray{line}}};
    const QJsonObject scriptDocument{{"sections", QJsonArray{section}}};
    const QJsonObject script{{"id", m_timeline->timeline().raw.value("id")}, {"document", scriptDocument}};
    m_plan = nt::aiassist::planScriptVoice(script, lineId);
    if (!m_plan.error.isEmpty()) { fail(m_plan.error); return; }
    if (!m_target) { m_target = nt::server::serverSaveTarget(); }
    if (!m_timeline || !m_target) { fail("Open a server timeline to voice this beat."); return; }
    if (!m_target->expectedInstance.isEmpty()) { fail("Speech generation is unavailable for a server that requires instance verification."); return; }
    if (!QDir().mkpath(m_target->backupDir)) { fail("Could not save speech recovery data."); return; }
    const QDir recoveryFolder(m_target->backupDir);
    const auto lockKey = QCryptographicHash::hash((m_plan.scriptId + QChar(u'\0') + lineId).toUtf8(), QCryptographicHash::Sha256).toHex();
    QLockFile submissionLock(recoveryFolder.filePath(QStringLiteral("beat-voice-submission-") + QString::fromLatin1(lockKey) + QStringLiteral(".lock")));
    submissionLock.setStaleLockTime(0);
    if (!submissionLock.tryLock(0)) { fail("Another editor is starting this voiceover beat."); return; }
    for (const auto& name : recoveryFolder.entryList({QStringLiteral("beat-voice-*.json")}, QDir::Files)) {
        QFile pending(recoveryFolder.filePath(name));
        if (!pending.open(QIODevice::ReadOnly)) { continue; }
        const auto data = QJsonDocument::fromJson(pending.readAll()).object();
        if (data.value("scriptId") == script.value("id") && data.value("lineId").toString() == lineId) {
            fail("An interrupted voicing exists for this line. Recover it before recording again."); return;
        }
    }
    ++m_epoch;
    m_generation = m_timeline->documentGeneration();
    m_lineId = lineId;
    m_requestId = requestId();
    m_generationRequestId = m_requestId;
    m_assetId.clear();
    m_generationResult = {};
    m_transcription = {};
    m_error.clear();
    m_checkpoint.clear();
    if (!checkpoint()) { fail("Could not save speech recovery data."); return; }
    m_state = "prepared";
    m_transport.configure(m_target->server, m_target->token);
    m_state = "connecting";
    m_timeout.start(600000);
    m_transport.open();
    emit changed();
}
void BeatVoicing::cancel() {
    bool cancellationSent = false;
    if ((m_state == "generating" || m_state == "recovering") && m_transport.ready()) {
        cancellationSent = m_transport.send("cancel_generation", {{"request_ids", QJsonArray{m_generationRequestId}}}, requestId());
    }
    ++m_epoch;
    m_timeout.stop();
    m_poll.stop();
    if (m_worker) { m_worker->requestInterruption(); }
    m_candidate = {};
    m_candidateMedia.reset();
    m_observedClip = {};
    m_state = "cancelled";
    // Keep the socket until the cancellation frame leaves. Replies are ignored in this state.
    if (!cancellationSent) { m_transport.close(); }
    emit changed();
}
void BeatVoicing::receive(const QJsonObject& message) {
    if (!busy() || !current() || message.value("request_id").toString() != m_requestId) { return; }
    if (message.value("error").isObject()) {
        if (m_state == "transcribing") { persist({}); }
        else { fail(message.value("error").toObject().value("message").toString()); }
        return;
    }
    const auto result = message.value("result").toObject();
    if (m_state == "recovering") {
        for (const auto& value : result.value("generations").toArray()) {
            const auto row = value.toObject();
            if (row.value("request_id").toString() != m_generationRequestId) { continue; }
            const auto status = row.value("status").toString();
            if (status == "completed") {
                m_poll.stop();
                m_state = "generating";
                receive({{"request_id", m_requestId}, {"result", row}});
            } else if (status == "failed" || status == "cancelled" || status == "interrupted" || status == "needs_attention") {
                QFile::remove(m_checkpoint); m_checkpoint.clear();
                fail(row.value("error").toString().isEmpty() ? QStringLiteral("The interrupted voicing did not complete.") : row.value("error").toString());
            }
            return;
        }
        return;
    }
    if (m_state == "generating") {
        const auto assets = result.value("asset_ids").toArray();
        if (assets.isEmpty() || assets.first().toString().isEmpty()) { fail("Speech generation returned no audio asset."); return; }
        m_generationResult = result;
        m_assetId = assets.first().toString();
        if (!checkpoint()) { fail("Could not save speech recovery data. Audio remains in the library."); return; }
        m_state = "transcribing";
        m_timeout.start(120000);
        m_requestId = requestId();
        if (!m_transport.send("transcribe_audio", {{"provider", "openai"}, {"model", "whisper-1"}, {"asset_id", m_assetId}}, m_requestId)) { persist({}); }
        emit changed();
    } else if (m_state == "transcribing") { persist(result); }
}
void BeatVoicing::persist(const QJsonObject& transcription) {
    if (!current() || !m_target || m_worker || m_assetId.isEmpty()) { return; }
    m_timeout.stop();
    m_transcription = transcription;
    if (!checkpoint()) { fail("Could not save the take recovery data."); return; }
    m_state = "saving";
    const auto epoch = m_epoch;
    const auto target = *m_target;
    const auto assetId = m_assetId;
    const auto lineId = m_lineId;
    const auto generationId = m_generationRequestId;
    const auto prompt = m_plan.line.value("text");
    auto mediaClip = m_observedClip;
    mediaClip.insert("currentAssetId", assetId);
    const auto resolver = m_mediaResolver;
    const auto protection = m_mediaProtection;
    const auto mediaGeneration = protection->generation();
    const auto createdAt = QDateTime::currentDateTimeUtc().toString(Qt::ISODateWithMs);
    const QPointer<BeatVoicing> self(this);
    auto worker = QThread::create([self, target, assetId, lineId, generationId, transcription, prompt, createdAt, epoch, mediaClip, resolver, protection, mediaGeneration] {
        nt::server::ServerClient client(target.server, target.token);
        const auto asset = client.getAsset(assetId);
        nt::Clip media;
        if (asset.ok() && resolver && !QThread::currentThread()->isInterruptionRequested()) {
            const auto cacheRoot = QDir::cleanPath(QDir(target.backupDir).absoluteFilePath("../../.."));
            media = resolver(client, cacheRoot, asset.data.toObject(), mediaClip, *protection, mediaGeneration);
        }
        const auto path = QString::fromStdString(media.audioPath.empty() ? media.mediaPath : media.audioPath);
        const bool resolved = asset.ok() && !path.isEmpty() && QFileInfo::exists(path);
        double duration = asset.ok() ? asset.data.toObject().value("duration").toDouble() * 1000 : 0;
        if (resolved && (!std::isfinite(duration) || duration <= 0)) {
            const auto facts = nt::probeMedia(path.toStdString());
            duration = facts.opened && std::isfinite(facts.durationSec) && facts.durationSec > 0 ? facts.durationSec * 1000 : 0;
        }
        QJsonArray words;
        for (const auto& value : transcription.value("words").toArray()) {
            const auto word = value.toObject();
            if (word.value("word").isString() && word.value("startMs").isDouble() && word.value("endMs").isDouble()) {
                words.append(QJsonObject{{"word", word.value("word")}, {"startMs", word.value("startMs")}, {"endMs", word.value("endMs")}});
            }
        }
        const QJsonObject candidate{{"clipId", lineId}, {"assetId", assetId}, {"durationMs", duration}, {"words", words},
            {"versionId", generationId}, {"createdAt", createdAt}, {"promptSnapshot", prompt}};
        if (!self) { return; }
        QMetaObject::invokeMethod(self, [self, candidate, epoch, resolved, media] {
            if (!self || self->m_epoch != epoch || !self->current()) { return; }
            if (!resolved) { self->fail("The generated audio could not be resolved. Recover the take to retry."); return; }
            self->m_candidate = candidate;
            self->m_candidateMedia = media;
            self->m_state = "completed";
            self->m_error.clear();
            emit self->changed();
        }, Qt::QueuedConnection);
    });
    worker->setParent(this);
    m_worker = worker;
    connect(worker, &QThread::finished, this, [this, worker] { if (m_worker == worker) { m_worker = nullptr; } worker->deleteLater(); emit changed(); });
    worker->start();
    emit changed();
}
bool BeatVoicing::apply() {
    if (!current() || m_candidate.isEmpty() || !m_candidateMedia || busy()) { return false; }
    const auto path = QString::fromStdString(m_candidateMedia->audioPath.empty() ? m_candidateMedia->mediaPath : m_candidateMedia->audioPath);
    if (path.isEmpty() || !QFileInfo::exists(path)) { fail("The generated audio is unavailable. Recover the take to resolve it again."); return false; }
    QJsonObject clip;
    for (const auto& value : m_timeline->clipsJson()) { if (value.toObject().value("id").toString() == m_lineId) { clip = value.toObject(); break; } }
    if (clip.isEmpty() || clip != m_observedClip) { fail("The beat changed. Recover the take after reviewing the beat."); return false; }
    if (!m_timeline->applyEdit("assist.applyBeatTake", m_candidate)) { fail("The beat cannot accept this take."); return false; }
    m_timeline->registerMedia(*m_candidateMedia);
    if (!m_checkpoint.isEmpty()) { QFile::remove(m_checkpoint); m_checkpoint.clear(); }
    m_candidate = {};
    m_candidateMedia.reset();
    m_state = "applied";
    emit changed();
    emit applied(m_lineId);
    return true;
}

bool BeatVoicing::checkpoint() {
    if (!m_target || !QDir().mkpath(m_target->backupDir)) { return false; }
    m_checkpoint = QDir(m_target->backupDir).filePath(QStringLiteral("beat-voice-") + m_generationRequestId + QStringLiteral(".json"));
    const QJsonObject data{{"scriptId", m_plan.scriptId}, {"lineId", m_lineId}, {"timelineId", m_target->timelineId},
        {"requestId", m_generationRequestId}, {"observedClip", m_observedClip}, {"line", m_plan.line}, {"voice", m_plan.voice}, {"request", m_plan.request}, {"assetId", m_assetId}, {"generation", m_generationResult}, {"transcription", m_transcription}};
    QSaveFile file(m_checkpoint);
    const auto bytes = QJsonDocument(data).toJson();
    return file.open(QIODevice::WriteOnly) && file.write(bytes) == bytes.size() && file.commit();
}
void BeatVoicing::recover(const QString& clipId) {
    if (!m_timeline) { return; }
    QStringList ids;
    for (const auto& value : m_timeline->clipsJson()) { ids.append(value.toObject().value("id").toString()); }
    const auto resolved = nt::aiassist::resolveId(clipId, ids);
    if (!resolved) { fail("Choose an unambiguous voiceover beat."); return; }
    const QString lineId = *resolved;
    const QJsonObject script{{"id", m_timeline ? m_timeline->timeline().raw.value("id") : QJsonValue{}}};
    if (busy() || m_worker || !m_timeline) { return; }
    if (!m_target) { m_target = nt::server::serverSaveTarget(); }
    if (!m_target) { fail("Open a server timeline to recover a take."); return; }
    if (!m_target->expectedInstance.isEmpty()) { fail("Speech recovery is unavailable for a server that requires instance verification."); return; }
    const QDir folder(m_target->backupDir);
    for (const auto& name : folder.entryList({QStringLiteral("beat-voice-*.json")}, QDir::Files)) {
        QFile file(folder.filePath(name));
        if (!file.open(QIODevice::ReadOnly)) { continue; }
        const auto data = QJsonDocument::fromJson(file.readAll()).object();
        if (data.value("scriptId") != script.value("id") || data.value("lineId").toString() != lineId || data.value("timelineId").toString() != m_target->timelineId) { continue; }
        ++m_epoch;
        m_generation = m_timeline->documentGeneration();
        m_candidate = {};
        m_candidateMedia.reset();
        m_plan = {};
        m_plan.scriptId = data.value("scriptId").toString();
        m_plan.line = data.value("line").toObject();
        m_plan.voice = data.value("voice").toObject();
        m_plan.request = data.value("request").toObject();
        m_lineId = lineId;
        m_observedClip = data.value("observedClip").toObject();
        m_assetId = data.value("assetId").toString();
        m_generationRequestId = data.value("requestId").toString();
        m_generationResult = data.value("generation").toObject();
        m_transcription = data.value("transcription").toObject();
        m_checkpoint = file.fileName();
        if (!m_assetId.isEmpty()) { persist(m_transcription); }
        else if (!m_generationRequestId.isEmpty()) {
            m_state = "prepared";
            m_transport.configure(m_target->server, m_target->token);
            m_state = "recovering";
            m_transport.open();
            m_timeout.start(600000);
            emit changed();
        } else { fail("The recovery record has no generation request id."); }
        return;
    }
    fail("No interrupted take is available for this line.");
}

void BeatVoicing::lookup() {
    if (m_state != "recovering" || !current() || !m_transport.ready()) { return; }
    m_requestId = requestId();
    m_transport.send("lookup_generations", {{"request_ids", QJsonArray{m_generationRequestId}}}, m_requestId);
}
