#include "aiassist/ScriptVoicing.h"
#include "aiassist/VoicingDuration.h"
#include "server/ServerClient.h"
#include "server/ServerSource.h"
#include <QDateTime>
#include <QCryptographicHash>
#include <QLockFile>
#include <QDir>
#include <QFile>
#include <QSaveFile>
#include <QJsonDocument>
#include <QJsonArray>
#include <QUuid>
namespace {
QString requestId() { return QUuid::createUuid().toString(QUuid::Id128); }
}
ScriptVoicing::ScriptVoicing(QObject* parent) : QObject(parent), m_transport(this), m_timeout(this), m_poll(this) {
    m_poll.setInterval(3000);
    connect(&m_poll, &QTimer::timeout, this, &ScriptVoicing::lookup);
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
    connect(&m_transport, &nt::ai::GenerationTransport::response, this, &ScriptVoicing::receive);
    connect(&m_transport, &nt::ai::GenerationTransport::error, this, [this](const QString& error) {
        if (m_state == "transcribing") { persist({}); } else if (busy()) { fail(error); }
    });
    connect(&m_transport, &nt::ai::GenerationTransport::disconnected, this, [this] {
        if (m_state == "transcribing") { persist({}); }
        else if (busy() && m_state != "saving") { fail("Connection lost. Check the script before retrying to avoid recording the line twice."); }
    });
}
ScriptVoicing::~ScriptVoicing() {
    if (m_worker) { m_worker->requestInterruption(); m_worker->wait(); }
}
void ScriptVoicing::setTimeline(TimelineModel* timeline) {
    if (m_timeline == timeline) { return; }
    cancel();
    if (m_timeline) { disconnect(m_timeline, nullptr, this, nullptr); }
    m_timeline = timeline;
    m_target = nt::server::serverSaveTarget();
    if (m_timeline) { connect(m_timeline, &TimelineModel::documentReplaced, this, [this] { cancel(); m_target = nt::server::serverSaveTarget(); }); }
    emit changed();
}
bool ScriptVoicing::current() const {
    return m_timeline && m_generation == m_timeline->documentGeneration();
}
void ScriptVoicing::fail(const QString& error) { m_timeout.stop(); m_poll.stop(); m_error = error; m_state = "failed"; emit changed(); }
void ScriptVoicing::voice(const QJsonObject& script, const QString& lineId) {
    if (busy() || m_worker) { return; }
    m_plan = nt::aiassist::planScriptVoice(script, lineId);
    if (!m_plan.error.isEmpty()) { fail(m_plan.error); return; }
    if (!m_target) { m_target = nt::server::serverSaveTarget(); }
    if (!m_timeline || !m_target) { fail("Open a server timeline to voice a script line."); return; }
    if (!m_target->expectedInstance.isEmpty()) { fail("Speech generation is unavailable for a server that requires instance verification."); return; }
    if (!QDir().mkpath(m_target->backupDir)) { fail("Could not save speech recovery data."); return; }
    const QDir recoveryFolder(m_target->backupDir);
    const auto lockKey = QCryptographicHash::hash((m_plan.scriptId + QChar(u'\0') + lineId).toUtf8(), QCryptographicHash::Sha256).toHex();
    QLockFile submissionLock(recoveryFolder.filePath(QStringLiteral("script-voice-submission-") + QString::fromLatin1(lockKey) + QStringLiteral(".lock")));
    submissionLock.setStaleLockTime(0);
    if (!submissionLock.tryLock(0)) { fail("Another editor is starting this script line."); return; }
    for (const auto& name : recoveryFolder.entryList({QStringLiteral("script-voice-*.json")}, QDir::Files)) {
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
void ScriptVoicing::cancel() {
    bool cancellationSent = false;
    if ((m_state == "generating" || m_state == "recovering") && m_transport.ready()) {
        cancellationSent = m_transport.send("cancel_generation", {{"request_ids", QJsonArray{m_generationRequestId}}}, requestId());
    }
    ++m_epoch;
    m_timeout.stop();
    m_poll.stop();
    if (m_worker) { m_worker->requestInterruption(); }
    m_state = "cancelled";
    // Keep the socket until the cancellation frame leaves. Replies are ignored in this state.
    if (!cancellationSent) { m_transport.close(); }
    emit changed();
}
void ScriptVoicing::receive(const QJsonObject& message) {
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
void ScriptVoicing::persist(const QJsonObject& transcription) {
    if (!current() || !m_target || m_worker || m_assetId.isEmpty()) { return; }
    m_timeout.stop();
    m_state = "saving";
    const auto epoch = m_epoch;
    const auto target = *m_target;
    const auto plan = m_plan;
    const auto assetId = m_assetId;
    const auto lineId = m_lineId;
    const auto generated = m_generationResult;
    const auto takeId = m_generationRequestId;
    const auto createdAt = QDateTime::currentDateTimeUtc().toString(Qt::ISODateWithMs);
    const QPointer<ScriptVoicing> self(this);
    auto worker = QThread::create([self, target, plan, assetId, lineId, generated, transcription, takeId, createdAt, epoch] {
        nt::server::ServerClient client(target.server, target.token);
        client.setExpectedInstance(target.expectedInstance);
        auto asset = client.getAsset(assetId);
        const double duration = asset.ok() ? nt::aiassist::voicingDurationMs(client, asset.data.toObject()) : 0;
        const auto take = nt::aiassist::scriptVoiceTake(plan, assetId, duration, transcription, takeId, createdAt, generated);
        nt::server::QueryResult saved;
        saved.error.message = "Could not save the new take.";
        for (int attempt = 0; attempt < 3 && !QThread::currentThread()->isInterruptionRequested(); ++attempt) {
            const auto loaded = client.query("scripts.get", {{"id", plan.scriptId}});
            if (!loaded.ok()) { saved = loaded; break; }
            const auto original = loaded.data.toObject();
            const auto updated = nt::aiassist::appendScriptTake(original, lineId, take);
            if (updated == original) {
                bool alreadySaved = false;
                for (const auto& section : original.value("document").toObject().value("sections").toArray()) {
                    for (const auto& line : section.toObject().value("lines").toArray()) {
                        if (line.toObject().value("id").toString() == lineId && line.toObject().value("currentTakeId").toString() == takeId) { alreadySaved = true; }
                    }
                }
                if (alreadySaved) { saved = loaded; }
                else { saved.error.message = "The script line was deleted. The generated audio remains in the library."; }
                break;
            }
            if (QThread::currentThread()->isInterruptionRequested()) { break; }
            saved = client.mutate("scripts.update", {{"id", plan.scriptId}, {"baseUpdatedAt", original.value("updatedAt")}, {"document", updated.value("document")}});
            if (saved.ok() || (saved.error.apiCode != "ALREADY_EXISTS" && saved.error.code != "CONFLICT")) { break; }
        }
        if (!self) { return; }
        QMetaObject::invokeMethod(self, [self, saved, epoch, scriptId = plan.scriptId] {
            if (!self || self->m_epoch != epoch || !self->current()) { return; }
            if (!saved.ok()) { self->fail(saved.describe()); return; }
            if (!self->m_checkpoint.isEmpty()) { QFile::remove(self->m_checkpoint); self->m_checkpoint.clear(); }
            self->m_state = "completed";
            self->m_error.clear();
            emit self->changed();
            emit self->saved(scriptId);
        }, Qt::QueuedConnection);
    });
    worker->setParent(this);
    m_worker = worker;
    connect(worker, &QThread::finished, this, [this, worker] { if (m_worker == worker) { m_worker = nullptr; } worker->deleteLater(); emit changed(); });
    worker->start();
    emit changed();
}

bool ScriptVoicing::checkpoint() {
    if (!m_target || !QDir().mkpath(m_target->backupDir)) { return false; }
    m_checkpoint = QDir(m_target->backupDir).filePath(QStringLiteral("script-voice-") + m_generationRequestId + QStringLiteral(".json"));
    const QJsonObject data{{"scriptId", m_plan.scriptId}, {"lineId", m_lineId}, {"timelineId", m_target->timelineId},
        {"requestId", m_generationRequestId}, {"line", m_plan.line}, {"voice", m_plan.voice}, {"request", m_plan.request}, {"assetId", m_assetId}, {"generation", m_generationResult}};
    QSaveFile file(m_checkpoint);
    const auto bytes = QJsonDocument(data).toJson();
    return file.open(QIODevice::WriteOnly) && file.write(bytes) == bytes.size() && file.commit();
}
void ScriptVoicing::recover(const QJsonObject& script, const QString& lineId) {
    if (busy() || m_worker || !m_timeline) { return; }
    if (!m_target) { m_target = nt::server::serverSaveTarget(); }
    if (!m_target) { fail("Open a server timeline to recover a take."); return; }
    if (!m_target->expectedInstance.isEmpty()) { fail("Speech recovery is unavailable for a server that requires instance verification."); return; }
    const QDir folder(m_target->backupDir);
    for (const auto& name : folder.entryList({QStringLiteral("script-voice-*.json")}, QDir::Files)) {
        QFile file(folder.filePath(name));
        if (!file.open(QIODevice::ReadOnly)) { continue; }
        const auto data = QJsonDocument::fromJson(file.readAll()).object();
        if (data.value("scriptId") != script.value("id") || data.value("lineId").toString() != lineId || data.value("timelineId").toString() != m_target->timelineId) { continue; }
        ++m_epoch;
        m_generation = m_timeline->documentGeneration();
        m_plan = {};
        m_plan.scriptId = data.value("scriptId").toString();
        m_plan.line = data.value("line").toObject();
        m_plan.voice = data.value("voice").toObject();
        m_plan.request = data.value("request").toObject();
        m_lineId = lineId;
        m_assetId = data.value("assetId").toString();
        m_generationRequestId = data.value("requestId").toString();
        m_generationResult = data.value("generation").toObject();
        m_checkpoint = file.fileName();
        if (!m_assetId.isEmpty()) { persist({}); }
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

void ScriptVoicing::lookup() {
    if (m_state != "recovering" || !current() || !m_transport.ready()) { return; }
    m_requestId = requestId();
    m_transport.send("lookup_generations", {{"request_ids", QJsonArray{m_generationRequestId}}}, m_requestId);
}
