#include "aiassist/TranscriptRequest.h"
#include "aiassist/AssistDocument.h"
#include "app/EditRegistry.h"
#include "edit/EditActions.h"
#include "server/ServerSource.h"
#include <QJsonDocument>
#include <QJsonArray>
#include <QSaveFile>
#include <QFile>
#include <QDir>
#include <QUuid>
#include <cmath>
#include <QCryptographicHash>
namespace {
const bool registered = nt::app::registerEdit("assist.applyTranscription", TranscriptRequest::applyCaption);
}
TranscriptRequest::TranscriptRequest(QObject* parent) : QObject(parent), m_transport(this) {
    connect(&m_transport, &nt::ai::GenerationTransport::readyChanged, this, &TranscriptRequest::changed);
    connect(&m_transport, &nt::ai::GenerationTransport::response, this, &TranscriptRequest::receive);
    connect(&m_transport, &nt::ai::GenerationTransport::error, this, [this](const QString& error) { m_error = error; emit changed(); });
    connect(&m_transport, &nt::ai::GenerationTransport::disconnected, this, [this]() {
        if (m_busy) { m_error = "Transcription disconnected. Start a new request to retry."; m_busy = false; emit changed(); }
    });
}
void TranscriptRequest::setTimeline(TimelineModel* model) {
    if (m_timeline == model) { return; }
    m_recoveryFile.clear();
    cancel();
    if (m_timeline) { disconnect(m_timeline, nullptr, this, nullptr); }
    m_timeline = model;
    if (model) { connect(model, &TimelineModel::documentReplaced, this, [this]() { m_recoveryFile.clear(); cancel(); }); }
    emit changed();
}
bool TranscriptRequest::open() {
    const auto target = nt::server::serverSaveTarget();
    if (!target || !m_timeline) { m_error = "Open a server timeline to transcribe media."; emit changed(); return false; }
    if (!target->expectedInstance.isEmpty()) { m_error = "Transcription requires a connection that supports server identity verification."; emit changed(); return false; }
    m_transport.configure(target->server, target->token);
    m_transport.open();
    m_recoveryFile = QDir(target->backupDir).filePath("transcript-" + QString::fromLatin1(QCryptographicHash::hash(m_timeline->timeline().raw.value("id").toString().toUtf8(), QCryptographicHash::Sha256).toHex()) + ".json");
    QFile recovery(m_recoveryFile);
    if (recovery.open(QIODevice::ReadOnly)) {
        const auto saved = QJsonDocument::fromJson(recovery.readAll()).object();
        if (saved.value("observed").toObject() == m_timeline->timeline().raw) {
            m_observed = saved.value("observed").toObject(); m_candidate = saved.value("candidate").toObject();
            m_clipId = saved.value("clipId").toString(); m_generation = m_timeline->documentGeneration();
        }
    }
    emit changed(); return true;
}
bool TranscriptRequest::submit(const QString& clipId, const QString& provider, const QString& model) {
    if (!m_timeline || !ready() || m_busy || provider.isEmpty() || model.isEmpty()) { return false; }
    const auto doc = m_timeline->timeline().raw;
    QStringList ids;
    for (const auto& value : doc.value("clips").toArray()) { ids.append(value.toObject().value("id").toString()); }
    const auto resolved = nt::aiassist::resolveId(clipId, ids);
    if (!resolved) { return false; }
    QJsonObject clip;
    for (const auto& value : doc.value("clips").toArray()) { if (value.toObject().value("id").toString() == *resolved) { clip = value.toObject(); } }
    const auto type = clip.value("mediaType").toString();
    if ((type != "audio" && type != "video") || clip.value("currentAssetId").toString().isEmpty()) { return false; }
    if (clip.contains("timeRemap") || clip.value("reverse").toBool()) { m_error = "Transcribe before applying reverse or time remapping."; emit changed(); return false; }
    nt::edit::EditDoc editable;
    for (const auto& value : doc.value("clips").toArray()) { editable.clips.push_back(value.toObject()); }
    for (const auto& value : doc.value("tracks").toArray()) { const auto track = value.toObject(); editable.tracks.push_back({track.value("id").toString(), track.value("type").toString(), track.value("locked").toBool()}); }
    if (nt::edit::lockedUserTargetIds(editable).contains(*resolved)) { m_error = "Unlock the clip before transcribing."; emit changed(); return false; }
    m_observed = doc; m_generation = m_timeline->documentGeneration(); m_clipId = *resolved;
    if (!m_recoveryFile.isEmpty()) { QFile::remove(m_recoveryFile); }
    m_requestId = QUuid::createUuid().toString(QUuid::Id128); m_busy = true; m_candidate = {}; m_error.clear();
    if (!m_transport.send("transcribe_audio", {{"provider", provider}, {"model", model}, {"asset_id", clip.value("currentAssetId")}}, m_requestId)) { m_busy = false; m_error = "Could not send transcription request."; }
    emit changed(); return m_busy;
}
void TranscriptRequest::receive(const QJsonObject& frame) {
    if (!m_busy || frame.value("request_id").toString() != m_requestId) { return; }
    m_busy = false;
    if (frame.value("error").isObject()) { m_error = frame.value("error").toObject().value("message").toString(); }
    else {
        m_candidate = frame.value("result").toObject();
        if (!m_candidate.value("words").isArray()) { m_candidate = {}; m_error = "Transcription returned no word timings."; emit changed(); return; }
        for (const auto& value : m_observed.value("clips").toArray()) {
            const auto clip = value.toObject();
            if (clip.value("id").toString() != m_clipId) { continue; }
            const double offset = clip.value("inPointMs").toDouble();
            const double speed = clip.value("speedMultiplier").toDouble(1);
            const double duration = clip.value("durationMs").toDouble();
            if (!std::isfinite(speed) || speed <= 0) { m_candidate = {}; m_error = "Invalid clip speed."; break; }
            QJsonArray local;
            for (const auto& entry : m_candidate.value("words").toArray()) {
                auto word = entry.toObject();
                const double start = (word.value("startMs").toDouble() - offset) / speed;
                const double end = (word.value("endMs").toDouble() - offset) / speed;
                if (end <= 0 || (duration > 0 && start >= duration)) { continue; }
                word.insert("startMs", std::max(0.0, start));
                word.insert("endMs", duration > 0 ? std::min(duration, end) : end);
                local.append(word);
            }
            m_candidate.insert("words", local);
            break;
        }
        persist();
    }
    emit changed();
}
QJsonObject TranscriptRequest::applyCaption(QJsonObject document, const QJsonObject& payload) {
    const auto id = payload.value("clipId").toString();
    nt::edit::EditDoc editable;
    for (const auto& value : document.value("clips").toArray()) { editable.clips.push_back(value.toObject()); }
    for (const auto& value : document.value("tracks").toArray()) { const auto track = value.toObject(); editable.tracks.push_back({track.value("id").toString(), track.value("type").toString(), track.value("locked").toBool()}); }
    if (nt::edit::lockedUserTargetIds(editable).contains(id)) { return document; }
    QJsonArray words;
    for (const auto& value : payload.value("words").toArray()) {
        const auto word = value.toObject();
        if (!word.value("word").isString() || !word.value("startMs").isDouble() || !word.value("endMs").isDouble()) { continue; }
        if (!std::isfinite(word.value("startMs").toDouble()) || !std::isfinite(word.value("endMs").toDouble())) { continue; }
        words.append(QJsonObject{{"word", word.value("word")}, {"startMs", word.value("startMs")}, {"endMs", word.value("endMs")}});
    }
    auto clips = document.value("clips").toArray();
    for (qsizetype i = 0; i < clips.size(); ++i) {
        auto clip = clips.at(i).toObject();
        if (clip.value("id").toString() != id) { continue; }
        clip.insert("caption", QJsonObject{{"words", words}}); clips[i] = clip; document.insert("clips", clips); return document;
    }
    return document;
}
bool TranscriptRequest::apply() {
    if (!m_timeline || m_generation != m_timeline->documentGeneration() || !nt::aiassist::acceptsResult(m_observed, m_timeline->timeline().raw)) { m_error = "The timeline changed. Transcribe the current clip again."; emit changed(); return false; }
    auto payload = m_candidate; payload.insert("clipId", m_clipId);
    if (m_candidate.isEmpty() || !m_timeline->applyEdit("assist.applyTranscription", payload)) { return false; }
    m_candidate = {}; QFile::remove(m_recoveryFile); emit changed(); return true;
}
void TranscriptRequest::cancel() { if (!m_recoveryFile.isEmpty()) { QFile::remove(m_recoveryFile); } m_busy = false; m_candidate = {}; m_requestId.clear(); m_transport.close(); emit changed(); }
void TranscriptRequest::persist() {
    if (m_recoveryFile.isEmpty()) { return; }
    QSaveFile file(m_recoveryFile);
    if (!file.open(QIODevice::WriteOnly)) { m_error = file.errorString(); return; }
    const auto bytes = QJsonDocument(QJsonObject{{"observed", m_observed}, {"candidate", m_candidate}, {"clipId", m_clipId}}).toJson();
    if (file.write(bytes) != bytes.size() || !file.commit()) { m_error = file.errorString(); }
}
