#include "player/TimelinePlayerController.h"

#include "audio/AudioEngine.h"
#include "model/StaticTimelineSource.h"
#include "model/TimelineTypes.h"
#include "playback/PlaybackClock.h"
#include "player/PlaybackArbiter.h"

#include <QQmlEngine>
#include <QQuickWindow>
#include <QSGRendererInterface>

#include <algorithm>
#include <cmath>
#include <string>
#include <utility>

PlaybackArbiter::PlaybackArbiter(QQmlEngine& engine) : QObject(&engine) {}

PlaybackArbiter& PlaybackArbiter::of(QQmlEngine& engine) {
    if (auto* found = engine.findChild<PlaybackArbiter*>(QString(), Qt::FindDirectChildrenOnly)) {
        return *found;
    }
    // Parented to the engine, which deletes it.
    return *new PlaybackArbiter(engine);
}

void PlaybackArbiter::claim(TimelinePlayerController& player) {
    if (m_playing && m_playing != &player) {
        m_playing->yieldPlayback();
    }
    m_playing = &player;
}

TimelinePlayerController::TimelinePlayerController(QObject* parent)
    : QObject(parent), m_clock(std::make_unique<PlaybackClock>()), m_source(std::make_unique<StaticTimelineSource>()) {
    connect(m_clock.get(), &PlaybackClock::playingChanged, this, &TimelinePlayerController::playingChanged);
    connect(m_clock.get(), &PlaybackClock::timeChanged, this, &TimelinePlayerController::clockTimeChanged);
}

TimelinePlayerController::~TimelinePlayerController() {
    // The engine's callback and worker read the feed and the leased files:
    // stop them before anything they reach goes away.
    m_clock->pause();
    closeAudio(false);
    if (m_loading && m_loader) {
        m_loader->cancel();
    }
}

void TimelinePlayerController::classBegin() { m_complete = false; }

void TimelinePlayerController::componentComplete() {
    // A QML item gets its window after its components complete, so the first
    // load waits one event-loop turn. Qt drops the call if this object goes
    // first.
    QMetaObject::invokeMethod(this, &TimelinePlayerController::start, Qt::QueuedConnection);
}

void TimelinePlayerController::start() {
    m_complete = true;
    reload(true);
}

void TimelinePlayerController::loaderDestroyed() {
    m_loading = false;
    reload(true);
}

void TimelinePlayerController::refreshAvailability() { reload(false); }

void TimelinePlayerController::clockTimeChanged() {
    emit positionMsChanged();
    updateFrame();
}

void TimelinePlayerController::setTimelineId(const QString& id) {
    if (id == m_timelineId) {
        return;
    }
    m_timelineId = id;
    emit timelineIdChanged();
    reload(true);
}

void TimelinePlayerController::setLoader(nt::TimelineDocumentLoader* loader) {
    if (loader == m_loader) {
        return;
    }
    const QPointer previous = m_loader;
    const bool wasLoading = std::exchange(m_loading, false);
    if (previous) {
        disconnect(previous, nullptr, this, nullptr);
        if (wasLoading) {
            previous->cancel();
        }
    }
    m_loader = loader;
    if (m_loader) {
        connect(m_loader, &nt::TimelineDocumentLoader::loaded, this, &TimelinePlayerController::loaded);
        connect(m_loader, &nt::TimelineDocumentLoader::failed, this, &TimelinePlayerController::failed);
        connect(m_loader, &QObject::destroyed, this, &TimelinePlayerController::loaderDestroyed);
    }
    emit loaderChanged();
    reload(true);
}

void TimelinePlayerController::setWindow(QQuickWindow* window) {
    if (window == m_window) {
        return;
    }
    if (m_window) {
        disconnect(m_window, nullptr, this, nullptr);
    }
    m_window = window;
    if (m_window) {
        // The renderer interface reports the backend before the scene graph
        // starts. Ask again once it runs (the render thread emits it), and
        // when the window goes.
        connect(m_window, &QQuickWindow::sceneGraphInitialized, this, &TimelinePlayerController::refreshAvailability,
                Qt::QueuedConnection);
        connect(m_window, &QObject::destroyed, this, &TimelinePlayerController::refreshAvailability);
    }
    emit windowChanged();
    reload(false);
}

void TimelinePlayerController::setAudioMode(AudioMode mode) {
    if (mode == m_audioMode) {
        return;
    }
    // The next play opens the engine for the new mode.
    m_clock->pause();
    closeAudio();
    m_audioMode = mode;
    emit audioModeChanged();
}

void TimelinePlayerController::setPlaybackVisible(bool visible) {
    if (visible == m_playbackVisible) {
        return;
    }
    m_playbackVisible = visible;
    if (!visible) {
        yieldPlayback();
    }
    emit playbackVisibleChanged();
}

bool TimelinePlayerController::playing() const { return m_clock->playing(); }

double TimelinePlayerController::positionMs() const { return m_clock->time(); }

TimelineSource* TimelinePlayerController::source() const { return m_source.get(); }

bool TimelinePlayerController::graphicsUnavailable() const {
    // QQuickWindow::rendererInterface() never returns null, and its
    // graphicsApi() works before the scene graph is initialized.
    return m_window && m_window->rendererInterface()->graphicsApi() == QSGRendererInterface::Software;
}

void TimelinePlayerController::reload(bool force) {
    if (!m_complete) {
        return;
    }
    const bool unavailable = graphicsUnavailable();
    if (!force && unavailable == (m_status == Status::Unavailable)) {
        return;
    }
    const QPointer self(this);
    const QPointer loader = m_loader;
    const QString id = m_timelineId;
    const QUuid request = m_request = QUuid::createUuid();
    const auto current = [&] { return self && m_request == request; };
    if (std::exchange(m_loading, false) && loader) {
        loader->cancel();
        if (!current()) {
            return;
        }
    }
    m_clock->pause();
    if (!current()) {
        return;
    }
    closeAudio();
    if (!current()) {
        return;
    }
    m_source->clear();
    if (!current()) {
        return;
    }
    m_durationMs = 0.0;
    m_fps = 30.0;
    m_clock->setDurationMs(0.0);
    if (!current()) {
        return;
    }
    m_clock->seek(0.0);
    if (!current()) {
        return;
    }
    emit documentChanged();
    if (!current()) {
        return;
    }
    if (unavailable) {
        setStatus(Status::Unavailable);
        return;
    }
    if (id.isEmpty()) {
        setStatus(Status::Idle);
        return;
    }
    if (!loader) {
        setStatus(Status::Error, tr("No timeline loader is set."));
        return;
    }
    setStatus(Status::Loading);
    if (current() && loader && loader == m_loader && id == m_timelineId) {
        m_loading = true;
        loader->load(id, request);
    }
}

void TimelinePlayerController::loaded(const QString& id, const QUuid& request,
                                      const std::shared_ptr<const nt::Timeline>& doc,
                                      const std::shared_ptr<void>& mediaLeases) {
    if (!m_loading || request != m_request || id != m_timelineId) {
        return;
    }
    m_loading = false;
    if (!doc) {
        setStatus(Status::Error, tr("The timeline is empty."));
        return;
    }
    double end = doc->durationMs;
    for (const auto& clip : doc->clips) {
        end = std::max(end, clip.endMs());
    }
    m_durationMs = std::isfinite(end) ? std::max(0.0, end) : 0.0;
    m_fps = std::isfinite(doc->fps) && doc->fps > 0.0 ? doc->fps : 30.0;
    m_source->setTimeline(*doc, mediaLeases);
    m_clock->setFps(m_fps);
    m_clock->setDurationMs(m_durationMs);
    m_clock->seek(0.0);
    const QPointer self(this);
    emit documentChanged();
    if (self && request == m_request) {
        setStatus(Status::Ready);
    }
}

void TimelinePlayerController::failed(const QString& id, const QUuid& request, QString message) {
    if (!m_loading || request != m_request || id != m_timelineId) {
        return;
    }
    m_loading = false;
    setStatus(Status::Error, message.isEmpty() ? tr("The timeline could not be loaded.") : std::move(message));
}

void TimelinePlayerController::setStatus(Status status, const QString& error) {
    if (status == m_status && error == m_error) {
        return;
    }
    m_status = status;
    m_error = error;
    emit statusChanged();
}

void TimelinePlayerController::updateFrame() {
    // Frame k starts at k * 1000 / fps. The tolerance keeps a seek to that
    // time on frame k despite rounding.
    const int frame = static_cast<int>(std::floor(m_clock->time() * m_fps / 1000.0 + 1e-6));
    if (frame == m_frame) {
        return;
    }
    m_frame = frame;
    emit frameChanged();
}

void TimelinePlayerController::play() {
    if (!m_playbackVisible || m_status != Status::Ready || m_clock->playing()) {
        return;
    }
    if (QQmlEngine* engine = qmlEngine(this)) {
        PlaybackArbiter::of(*engine).claim(*this);
    }
    if (m_audioMode != AudioMode::Off && !m_audio && !openAudio()) {
        qWarning("TimelinePlayerController: audio did not open, playing without it");
    }
    if (m_playbackVisible) {
        m_clock->play();
    }
}

void TimelinePlayerController::pause() {
    m_clock->pause();
}

void TimelinePlayerController::yieldPlayback() {
    m_clock->pause();
    closeAudio();
}

void TimelinePlayerController::toggle() {
    if (m_clock->playing()) {
        pause();
    } else {
        play();
    }
}

void TimelinePlayerController::seek(double ms) {
    if (m_status != Status::Ready || !std::isfinite(ms)) {
        return;
    }
    m_clock->seek(std::clamp(ms, 0.0, m_durationMs));
}

void TimelinePlayerController::stepFrames(int frames) {
    if (m_status != Status::Ready) {
        return;
    }
    pause();
    const double target = (static_cast<double>(m_frame) + frames) * 1000.0 / m_fps;
    seek(target);
}

bool TimelinePlayerController::openAudio() {
    nt::audio::AudioEngine::Options options;
    if (m_audioMode == AudioMode::Null) {
        options.backend = nt::audio::AudioEngine::Backend::Null;
        options.sampleRate = 48000;
    } else {
        options.backend = nt::audio::AudioEngine::Backend::System;
        options.sampleRate = 0;  // the device's own rate
    }
    auto engine = std::make_unique<nt::audio::AudioEngine>();
    engine->setTimeline(m_source->snapshot());
    std::string why;
    if (!engine->start(options, &why)) {
        qWarning("TimelinePlayerController: %s", why.c_str());
        return false;
    }
    m_audio = std::move(engine);
    m_clock->setAudioFeed(&m_audio->feed());
    emit audioEnabledChanged();
    return true;
}

void TimelinePlayerController::closeAudio(bool notify) {
    if (!m_audio) {
        return;
    }
    m_clock->setAudioFeed(nullptr);
    m_audio->stop();
    m_audio.reset();
    if (notify) {
        emit audioEnabledChanged();
    }
}
