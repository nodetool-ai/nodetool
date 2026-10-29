#include "aiassist/CandidatePreview.h"
#include "server/ServerSource.h"
#include "assets/AssetDuration.h"
#include "model/TimelineJson.h"
#include <QThread>
#include <QDir>
#include <QFileInfo>
#include <QJsonDocument>
#include <QJsonArray>
#include <cmath>
CandidatePreview::CandidatePreview(QObject* parent) : QObject(parent), m_preview(new TimelineModel(this)),
    m_clock(new PlaybackClock(this)), m_protection(std::make_shared<nt::assets::MediaProtection>()) {}
CandidatePreview::~CandidatePreview() {
    if (m_worker) { m_worker->requestInterruption(); m_worker->wait(); }
}
void CandidatePreview::setTimeline(TimelineModel* model) {
    if (m_timeline == model) { return; }
    close();
    if (m_timeline) { disconnect(m_timeline, nullptr, this, nullptr); }
    m_timeline = model;
    if (model) { connect(model, &TimelineModel::documentReplaced, this, &CandidatePreview::close); }
    emit changed();
}
void CandidatePreview::close() {
    ++m_serial; m_clock->pause(); m_audio.reset(); m_preview->close(); m_ready = false;
    m_protection->reset({});
    if (m_worker) { m_worker->requestInterruption(); }
    emit changed();
}
void CandidatePreview::setAudioMode(const QString& mode) {
    if ((mode != "none" && mode != "null" && mode != "system") || mode == m_audioMode) { return; }
    m_clock->pause(); m_audio.reset(); m_audioMode = mode; emit changed();
}
void CandidatePreview::togglePlay() {
    if (!m_ready) { return; }
    if (m_clock->playing()) { m_clock->pause(); return; }
    if (!m_audio) {
        auto audio = std::make_unique<nt::audio::AppAudio>();
        QString error;
        if (!audio->start(m_audioMode, 0, *m_preview, *m_clock, &error)) { m_error = error; emit changed(); return; }
        m_audio = std::move(audio);
    }
    m_clock->play();
}
bool CandidatePreview::preview(const QString& assetId, const QString& mediaType, double durationMs) {
    const auto target = nt::server::serverSaveTarget();
    if (!m_timeline || !target || m_worker || assetId.isEmpty() ||
        (mediaType != "image" && mediaType != "video" && mediaType != "audio") ||
        !std::isfinite(durationMs) || durationMs <= 0) { return false; }
    close();
    const auto model = m_timeline;
    const auto generation = model->documentGeneration();
    const auto serial = m_serial;
    const QPointer<CandidatePreview> self(this);
    const auto protection = m_protection;
    const auto protectionGeneration = protection->generation();
    auto* worker = QThread::create([self, model, generation, serial, target, protection, protectionGeneration, assetId, mediaType, durationMs]() {
        nt::server::ServerClient client(target->server, target->token);
        const auto result = client.getAsset(assetId);
        QJsonObject asset = result.data.toObject();
        QJsonObject raw{{"id", "review"}, {"name", "Candidate review"}, {"fps", 30}, {"width", asset.value("width").toInt(1920)},
            {"height", asset.value("height").toInt(1080)}, {"durationMs", durationMs},
            {"tracks", QJsonArray{QJsonObject{{"id", "reviewTrack"}, {"type", mediaType == "audio" ? "audio" : "video"}, {"index", 0}}}}};
        const QJsonObject clip{{"id", "reviewClip"}, {"trackId", "reviewTrack"}, {"name", "Candidate"}, {"mediaType", mediaType},
            {"sourceType", "imported"}, {"startMs", 0}, {"durationMs", durationMs}, {"currentAssetId", assetId}, {"status", "generated"}, {"muted", false}};
        raw.insert("clips", QJsonArray{clip});
        nt::Clip media;
        if (result.ok() && !QThread::currentThread()->isInterruptionRequested()) {
            const auto cacheRoot = QDir::cleanPath(QDir(target->backupDir).absoluteFilePath("../../.."));
            media = nt::assets::resolveDroppedMedia(client, cacheRoot, asset, clip, *protection, protectionGeneration);
        }
        if (!self) { return; }
        QMetaObject::invokeMethod(self, [self, model, generation, serial, raw, media, result, mediaType, durationMs]() {
            if (!self || self->m_serial != serial || self->m_timeline != model || !model || model->documentGeneration() != generation) { return; }
            const auto path = mediaType == "audio" ? media.audioPath : media.mediaPath;
            if (!result.ok() || path.empty() || !QFileInfo::exists(QString::fromStdString(path))) { self->m_error = "Candidate media could not be loaded."; emit self->changed(); return; }
            const auto parsed = nt::parseTimelineJson(QJsonDocument(raw).toJson());
            if (!parsed.timeline) { self->m_error = parsed.error; emit self->changed(); return; }
            self->m_preview->setTimeline(*parsed.timeline);
            self->m_preview->registerMedia(media);
            self->m_clock->setDurationMs(durationMs); self->m_clock->seek(0);
            self->m_error.clear(); self->m_ready = true; emit self->changed();
        }, Qt::QueuedConnection);
    });
    m_worker = worker;
    connect(worker, &QThread::finished, this, [this, worker]() { if (m_worker == worker) { m_worker = nullptr; emit changed(); } });
    connect(worker, &QThread::finished, worker, &QObject::deleteLater);
    worker->start(); emit changed(); return true;
}
