#include "aiassist/CandidatePreview.h"
#include "server/ServerSource.h"
#include "assets/librarypreview/PreviewDuration.h"
#include "model/TimelineJson.h"
#include <QThread>
#include <QDir>
#include <QFileInfo>
#include <QJsonDocument>
#include <QJsonArray>
#include <cmath>
#include <utility>
namespace {
// The media of a review clip that plays a file on this machine in place.
nt::Clip localMedia(const QString& path, const QJsonObject& raw) {
    nt::Clip media;
    media.raw = raw;
    const auto type = raw.value("mediaType").toString();
    media.mediaType = type == "image" ? nt::MediaType::Image
        : type == "audio" ? nt::MediaType::Audio : nt::MediaType::Video;
    const auto file = path.toStdString();
    if (media.mediaType != nt::MediaType::Audio) { media.mediaPath = file; media.originalMediaPath = file; }
    if (media.mediaType != nt::MediaType::Image) { media.audioPath = file; }
    return media;
}
}
CandidatePreview::CandidatePreview(const nt::server::AssetCacheRoot& cache, QObject* parent) : CandidatePreview(parent) {
    setCacheRoot(cache);
}

CandidatePreview::CandidatePreview(QObject* parent) : TimelineMediaConsumer(parent), m_preview(new TimelineModel(this)),
    m_clock(new PlaybackClock(this)) {}
CandidatePreview::~CandidatePreview() {
    if (m_worker) { m_worker->requestInterruption(); m_worker->wait(); }
}
void CandidatePreview::setTimeline(TimelineModel* model) {
    if (m_timeline == model) { return; }
    close();
    if (m_timeline) { disconnect(m_timeline, nullptr, this, nullptr); }
    m_timeline = model;
    if (model) {
        connect(model, &TimelineModel::documentReplaced, this, &CandidatePreview::close);
        connect(model, &QObject::destroyed, this, &CandidatePreview::close);
    }
    emit timelineChanged();
    emit changed();
}
void CandidatePreview::close() {
    ++m_serial; m_clock->pause(); m_audio.reset(); m_preview->close(); m_ready = false;
    mediaProtection()->reset({});
    if (m_worker) { m_worker->requestInterruption(); }
    m_pending.reset(); m_loading = false;
    m_error.clear();
    m_clock->setDurationMs(0); m_clock->seek(0);
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
    if (assetId.isEmpty()) { return false; }
    return start(PendingPreview{assetId, {}, mediaType, durationMs});
}
bool CandidatePreview::previewFile(const QString& localPath, const QString& mediaType, double durationMs) {
    if (localPath.isEmpty() || !QFileInfo(localPath).isFile()) { return false; }
    return start(PendingPreview{{}, QFileInfo(localPath).absoluteFilePath(), mediaType, durationMs});
}
bool CandidatePreview::previewUrl(const QUrl& url, const QString& mediaType, double durationMs) {
    return url.isLocalFile() && previewFile(url.toLocalFile(), mediaType, durationMs);
}
bool CandidatePreview::start(const PendingPreview& request) {
    const auto& [assetId, localPath, mediaType, durationMs] = request;
    // A local file needs no server.
    const auto target = localPath.isEmpty() ? nt::server::serverSaveTarget() : decltype(nt::server::serverSaveTarget()){};
    if (!m_timeline || (localPath.isEmpty() && !target) ||
        (mediaType != "image" && mediaType != "video" && mediaType != "audio") ||
        !std::isfinite(durationMs) || durationMs < 0) { return false; }
    close();
    m_loading = true;
    if (m_worker) {
        m_pending = request;
        emit changed();
        return true;
    }
    const auto model = m_timeline;
    const auto generation = model->documentGeneration();
    const auto serial = m_serial;
    const QPointer<CandidatePreview> self(this);
    const auto protection = mediaProtection();
    const auto protectionGeneration = protection->generation();
    auto* worker = QThread::create([self, model, generation, serial, target, protection, protectionGeneration, assetId, localPath, mediaType, durationMs]() {
        const bool local = !localPath.isEmpty();
        std::optional<nt::server::ServerClient> client;
        if (!local) {
            client.emplace(target->server, target->token, 10000);
            client->setExpectedInstance(target->expectedInstance);
        }
        const auto result = local ? nt::server::QueryResult{} : client->getAsset(assetId);
        QJsonObject asset = result.data.toObject();
        QJsonObject raw{{"id", "review"}, {"name", "Candidate review"}, {"fps", 30}, {"width", asset.value("width").toInt(1920)},
            {"height", asset.value("height").toInt(1080)}, {"durationMs", durationMs},
            {"tracks", QJsonArray{QJsonObject{{"id", "reviewTrack"}, {"type", mediaType == "audio" ? "audio" : "video"}, {"index", 0}}}}};
        QJsonObject clip{{"id", "reviewClip"}, {"trackId", "reviewTrack"}, {"name", "Candidate"}, {"mediaType", mediaType},
            {"sourceType", "imported"}, {"startMs", 0}, {"durationMs", durationMs}, {"currentAssetId", assetId}, {"status", "generated"}, {"muted", false}};
        raw.insert("clips", QJsonArray{clip});
        nt::Clip media;
        if (local) {
            media = localMedia(localPath, clip);
        } else if (result.ok() && !QThread::currentThread()->isInterruptionRequested()) {
            media = nt::assets::resolveDroppedMedia(*client, asset, clip, *protection, protectionGeneration);
        }
        const auto path = mediaType == "audio" ? media.audioPath : media.mediaPath;
        if (QThread::currentThread()->isInterruptionRequested()) { return; }
        const auto facts = nt::assets::previewMediaFacts(path, mediaType, asset,
            [] { return QThread::currentThread()->isInterruptionRequested(); });
        raw.insert("width", facts.size.width()); raw.insert("height", facts.size.height());
        clip.insert("width", facts.size.width()); clip.insert("height", facts.size.height());
        const double resolvedDuration = facts.durationMs > 0 ? facts.durationMs : durationMs > 0 ? durationMs : mediaType == "image" ? 5000 : 0;
        raw.insert("durationMs", resolvedDuration);
        clip.insert("durationMs", resolvedDuration);
        raw.insert("clips", QJsonArray{clip});
        if (!self || QThread::currentThread()->isInterruptionRequested()) { return; }
        QMetaObject::invokeMethod(self, [self, model, generation, serial, raw, media, result, local, mediaType, resolvedDuration, readable = facts.readable]() {
            if (!self || self->m_serial != serial || self->m_timeline != model || !model || model->documentGeneration() != generation) { return; }
            const auto path = mediaType == "audio" ? media.audioPath : media.mediaPath;
            if (!readable || resolvedDuration <= 0 || (!local && !result.ok()) || path.empty() || !QFileInfo::exists(QString::fromStdString(path))) { self->m_error = "Media could not be loaded. Retry the preview."; emit self->changed(); return; }
            const auto parsed = nt::parseTimelineJson(QJsonDocument(raw).toJson());
            if (!parsed.timeline) { self->m_error = parsed.error; emit self->changed(); return; }
            self->m_preview->setTimeline(*parsed.timeline);
            self->m_preview->registerMedia(media);
            self->m_clock->setDurationMs(resolvedDuration); self->m_clock->seek(0);
            self->m_error.clear(); self->m_ready = true; emit self->changed();
        }, Qt::QueuedConnection);
    });
    worker->setParent(this);
    m_worker = worker;
    connect(worker, &QThread::finished, this, [this, worker]() {
        if (m_worker != worker) { return; }
        m_worker = nullptr;
        const auto pending = std::exchange(m_pending, std::nullopt);
        if (pending) {
            if (!start(*pending)) {
                m_loading = false;
                emit changed();
            }
        } else {
            m_loading = false;
            emit changed();
        }
    });
    connect(worker, &QThread::finished, worker, &QObject::deleteLater);
    worker->start(); emit changed(); return true;
}
