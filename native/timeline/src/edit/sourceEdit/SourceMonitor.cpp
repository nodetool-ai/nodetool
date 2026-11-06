#include "SourceMonitor.h"
#include "SourceRange.h"
#include "assets/AssetClip.h"
#include "assets/librarypreview/PreviewDuration.h"
#include "model/TimelineJson.h"
#include "preview/FfmpegSource.h"
#include "server/ServerSource.h"
#include <QCoreApplication>
#include <QDir>
#include <QJsonArray>
#include <QJsonDocument>
#include <QThread>
#include <algorithm>
#include <cmath>
#include <utility>

SourceMonitor::SourceMonitor(QObject* parent) : QObject(parent), m_model(new TimelineModel(this)),
    m_clock(new PlaybackClock(this)), m_protection(std::make_shared<nt::assets::MediaProtection>()),
    m_silent(std::make_shared<const nt::Timeline>()) {
    connect(m_clock, &PlaybackClock::playingChanged, this, [this] {
        if (m_clock->playing()) {
            if (!m_stoppingOther) { stopProgram(); }
            ensureAudio();
        } else if (m_ready && m_durationMs > 0 && m_clock->time() >= m_durationMs) {
            seek(m_durationMs);
        }
        updateAudio();
    });
    connect(m_clock, &PlaybackClock::rateChanged, this, &SourceMonitor::updateAudio);
}
SourceMonitor::~SourceMonitor() {
    if (m_worker) { m_worker->requestInterruption(); m_worker->wait(); }
    m_clock->pause(); m_audio.reset();
}
void SourceMonitor::setProgramClock(PlaybackClock* clock) {
    if (m_programClock == clock || clock == m_clock) { return; }
    if (m_programClock) { disconnect(m_programClock, nullptr, this, nullptr); }
    m_programClock = clock;
    if (clock) {
        connect(clock, &PlaybackClock::playingChanged, this, [this] {
            if (!m_stoppingOther && m_programClock && m_programClock->playing() && m_clock->playing()) {
                m_stoppingOther = true; m_clock->shuttleStop(); m_stoppingOther = false;
            }
        });
        // Program sounds during a scrub without playing, and one monitor owns the sound.
        connect(clock, &PlaybackClock::scrubRequested, this, [this] { if (m_clock->playing()) { m_clock->shuttleStop(); } });
        connect(clock, &QObject::destroyed, this, &SourceMonitor::programClockChanged);
        if (clock->playing() && m_clock->playing()) { m_clock->shuttleStop(); }
    }
    emit programClockChanged();
}
void SourceMonitor::close() {
    ++m_serial; m_clock->pause(); m_audio.reset(); m_model->close();
    if (m_worker) { m_worker->requestInterruption(); }
    m_pending.reset(); m_protection->reset({});
    m_ready = false; m_busy = false; m_error.clear(); m_mediaType.clear();
    m_mediaPath.clear(); m_audioPath.clear(); m_hasVideo = false; m_hasAudio = false;
    m_durationMs = 0; m_frameRate = 30; m_frameSize = {};
    m_clock->setDurationMs(0); m_clock->seek(0); m_clock->setRate(1);
    updateAudio(); emit changed();
}
void SourceMonitor::open(const QVariantMap& asset, double cueMs) { startOpen({asset, {}, {}, cueMs, false}); }
void SourceMonitor::openLocal(const QVariantMap& asset, const QString& mediaPath, const QString& audioPath, double cueMs) {
    startOpen({asset, mediaPath, audioPath, cueMs, true});
}
void SourceMonitor::startOpen(const Request& request) {
    close();
    m_mediaType = nt::assets::assetMediaType(QJsonObject::fromVariantMap(request.asset));
    m_hasVideo = m_mediaType == "video";
    m_hasAudio = m_mediaType == "video" || m_mediaType == "audio";
    const auto target = nt::server::serverSaveTarget();
    if (!request.local && !target) { m_error = "Connect to a server to preview this asset."; emit changed(); return; }
    if (m_mediaType != "video" && m_mediaType != "audio" && m_mediaType != "image") {
        m_error = "This file could not be opened."; emit changed(); return;
    }
    m_busy = true;
    if (m_worker) { m_pending = request; emit changed(); return; }
    const auto serial = m_serial;
    const auto protection = m_protection;
    const auto generation = protection->generation();
    const auto type = m_mediaType;
    const QPointer<SourceMonitor> self(this);
    auto* worker = QThread::create([self, request, target, serial, protection, generation, type] {
        const auto interrupted = [] { return QThread::currentThread()->isInterruptionRequested(); };
        auto asset = QJsonObject::fromVariantMap(request.asset);
        QJsonObject clip{{"id", "sourceClip"}, {"trackId", "sourceTrack"}, {"name", asset.value("name").toString("Source")},
            {"mediaType", type}, {"sourceType", "imported"}, {"status", "generated"}, {"startMs", 0},
            {"currentAssetId", asset.value("id")}, {"muted", false}};
        nt::Clip media;
        if (request.local) {
            media.raw = clip;
            media.mediaType = type == "audio" ? nt::MediaType::Audio : type == "image" ? nt::MediaType::Image : nt::MediaType::Video;
            media.mediaPath = request.mediaPath.toStdString(); media.audioPath = request.audioPath.toStdString();
            protection->protect(request.mediaPath, generation); protection->protect(request.audioPath, generation);
        } else if (!interrupted()) {
            nt::server::ServerClient client(target->server, target->token, 10000);
            client.setExpectedInstance(target->expectedInstance);
            const auto result = client.getAsset(asset.value("id").toString());
            if (result.ok() && !interrupted()) {
                const auto fetched = result.data.toObject();
                for (auto it = fetched.begin(); it != fetched.end(); ++it) { asset.insert(it.key(), it.value()); }
                const auto cacheRoot = QDir::cleanPath(QDir(target->backupDir).absoluteFilePath("../../.."));
                media = nt::assets::resolveDroppedMedia(client, cacheRoot, asset, clip, *protection, generation);
            }
        }
        if (interrupted()) { return; }
        const auto path = type == "audio" && !media.audioPath.empty() ? media.audioPath : media.mediaPath;
        const auto facts = nt::assets::previewMediaFacts(path, type, asset, interrupted);
        const auto videoFacts = type == "video" ? nt::probeMedia(path) : nt::MediaFacts{};
        bool hasAudio = facts.hasAudio;
        if (type == "video" && !media.audioPath.empty() && media.audioPath != path) {
            hasAudio = nt::assets::probePreviewMedia(media.audioPath, interrupted).hasAudio;
        }
        const double assetDuration = asset.value("duration").toDouble() * 1000;
        const double duration = facts.durationMs > 0 ? facts.durationMs : std::isfinite(assetDuration) && assetDuration > 0 ? assetDuration : 0;
        const double fps = std::isfinite(videoFacts.frameRate) && videoFacts.frameRate > 0 ? videoFacts.frameRate : 30;
        if (!self || interrupted()) { return; }
        QMetaObject::invokeMethod(self, [self, serial, request, clip, media, path, facts, videoFacts, hasAudio, duration, fps, type]() mutable {
            if (!self || self->m_serial != serial) { return; }
            if (!videoFacts.rejection.empty()) { self->m_error = "This video cannot be previewed: " + QString::fromStdString(videoFacts.rejection) + '.'; }
            else if (!facts.readable) { self->m_error = "This file could not be opened."; }
            else if (type != "image" && duration <= 0) { self->m_error = "This file has no readable duration."; }
            if (!self->m_error.isEmpty()) { emit self->changed(); return; }
            self->m_mediaPath = QString::fromStdString(path);
            self->m_audioPath = hasAudio ? QString::fromStdString(media.audioPath.empty() ? path : media.audioPath) : QString{};
            self->m_hasVideo = type == "image" || facts.hasVideo; self->m_hasAudio = hasAudio;
            self->m_frameRate = fps; self->m_durationMs = duration; self->m_frameSize = facts.size;
            if (type != "image") {
                clip.insert("durationMs", duration); clip.insert("width", facts.size.width()); clip.insert("height", facts.size.height());
                const QJsonObject raw{{"id", "source"}, {"name", "Source"}, {"fps", fps}, {"width", facts.size.width()},
                    {"height", facts.size.height()}, {"durationMs", duration}, {"clips", QJsonArray{clip}},
                    {"tracks", QJsonArray{QJsonObject{{"id", "sourceTrack"}, {"type", type == "audio" ? "audio" : "video"}, {"index", 0}}}}};
                auto parsed = nt::parseTimelineJson(QJsonDocument(raw).toJson());
                if (!parsed.timeline) { self->m_error = "This file could not be opened."; emit self->changed(); return; }
                self->m_model->setTimeline(std::move(*parsed.timeline));
                self->m_model->registerMedia(media);
                self->m_clock->setDurationMs(duration); self->m_clock->setFps(fps);
                self->seek(request.cueMs);
            }
            self->m_protection->replaceCurrent({self->m_mediaPath, self->m_audioPath});
            self->m_ready = true; emit self->changed(); emit self->opened();
        }, Qt::QueuedConnection);
    });
    worker->setParent(this); m_worker = worker;
    connect(worker, &QThread::finished, this, [this, worker] {
        if (m_worker != worker) { return; }
        m_worker = nullptr;
        const auto pending = std::exchange(m_pending, std::nullopt);
        if (pending) { startOpen(*pending); }
        else { m_busy = false; emit changed(); }
    });
    connect(worker, &QThread::finished, worker, &QObject::deleteLater);
    worker->start(); emit changed();
}
void SourceMonitor::ensureAudio() {
    if (m_audio || !m_ready || !m_hasAudio) { return; }
    auto audio = std::make_unique<nt::audio::AppAudio>(); audio->setRecordSeconds(m_recordSeconds);
    auto mode = QCoreApplication::instance()->property("timelineAudioMode").toString();
    if (mode.isEmpty()) { mode = "none"; }
    QString error;
    if (!audio->start(mode, 0, *m_model, *m_clock, &error)) {
        disconnect(m_model, nullptr, m_clock, nullptr);
        qWarning().noquote() << "Source audio:" << error; return;
    }
    m_audio = std::move(audio);
}
void SourceMonitor::silence() { if (auto* engine = audioEngineForTest()) { engine->setTimeline(m_silent); } }
void SourceMonitor::updateAudio() {
    if (auto* engine = audioEngineForTest()) { engine->setTimeline(m_clock->rate() == 1 ? m_model->snapshot() : m_silent); }
    const bool value = audible();
    if (m_audible != value) { m_audible = value; emit audibleChanged(); }
}
void SourceMonitor::stopProgram() {
    if (m_programClock && m_programClock->playing()) {
        m_stoppingOther = true; m_programClock->shuttleStop(); m_stoppingOther = false;
    }
}
double SourceMonitor::lastFrameMs() const {
    return std::max(0.0, std::ceil(m_durationMs * m_frameRate / 1000 - 1e-6) - 1) * 1000 / m_frameRate;
}
void SourceMonitor::togglePlay() {
    if (!m_ready || m_mediaType == "image") { return; }
    if (m_clock->playing()) { pause(); return; }
    stopProgram();
    // Playback rests on the last frame, and Play there starts over.
    if (m_clock->time() >= lastFrameMs()) { m_clock->seek(0); }
    m_clock->setRate(1); ensureAudio(); updateAudio(); m_clock->play();
}
void SourceMonitor::shuttle(int direction) {
    if (!m_ready || m_mediaType == "image" || (direction != -1 && direction != 1)) { return; }
    stopProgram();
    if (direction == 1 && !m_clock->playing() && m_clock->time() >= lastFrameMs()) { m_clock->seek(0); }
    ensureAudio(); silence(); m_clock->shuttle(direction); updateAudio();
}
void SourceMonitor::shuttleStop() { m_clock->shuttleStop(); }
void SourceMonitor::pause() { m_clock->pause(); }
void SourceMonitor::stepFrames(int frames) {
    if (!m_ready || m_mediaType == "image") { return; }
    pause();
    const double frame = nt::sourceedit::frameDurationMs(m_frameRate);
    const double last = std::round(lastFrameMs() * m_frameRate / 1000);
    const double current = std::floor(m_clock->time() * m_frameRate / 1000 + 1e-6);
    m_clock->seek(std::clamp(current + frames, 0.0, last) * frame);
}
void SourceMonitor::seek(double ms) {
    if (!std::isfinite(ms) || m_mediaType == "image") { return; }
    m_clock->seek(std::clamp(ms, 0.0, lastFrameMs()));
}
