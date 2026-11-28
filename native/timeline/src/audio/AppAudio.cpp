#include "audio/AppAudio.h"
#include "audio/loudness/AppReadout.h"

#include "model/TimelineSource.h"
#include "model/TimelineTypes.h"
#include "playback/PlaybackClock.h"

#include <QFile>
#include <QJsonArray>
#include <QJsonDocument>
#include <QJsonObject>
#include <QTimer>

#include <algorithm>
#include <cstdio>
#include <vector>

namespace nt::audio {

int engineRateFor(const Timeline& timeline) {
    return timeline.raw.value(QStringLiteral("music")).isObject() ? kMusicEngineRate : 0;
}

// UI thread. The connection context owns the state used by its deferred read.
class AppAudio::UpdateTimer final : public QTimer {
public:
    AudioEngine engine;
    std::uint64_t appliedRevision = 0;
    QMetaObject::Connection schedule;
};

AppAudio::AppAudio() = default;

AudioEngine* AppAudio::engine() { return m_update ? &m_update->engine : nullptr; }

bool AppAudio::start(const QString& mode, double latencyMs, TimelineSource& source, PlaybackClock& clock, QString* error) {
    m_mode = mode;
    if (mode == u"none") return true;
    if (mode != u"null" && mode != u"system") {
        if (error) *error = QStringLiteral("--audio takes none, null or system");
        return false;
    }
    m_latencyMs = latencyMs;
    m_source = &source;
    m_clock = &clock;
    if (m_followDocumentRate) {
        if (const auto snapshot = source.snapshot()) m_systemRate = engineRateFor(*snapshot);
        m_documentGeneration = source.documentGeneration();
        // The context is this object's own, so its destruction ends the connection.
        m_documentConnection = QObject::connect(&source, &TimelineSource::sourceChanged, &m_documentContext, [this]() {
            if (!m_source) return;
            const quint64 generation = m_source->documentGeneration();
            if (generation == m_documentGeneration) return;
            m_documentGeneration = generation;
            const auto snapshot = m_source->snapshot();
            QString why;
            if (!setSystemRate(snapshot ? engineRateFor(*snapshot) : 0, &why)) {
                std::fprintf(stderr, "error: audio: %s\n", qPrintable(why));
            }
        });
    }
    QString why;
    if (openEngine(&why)) return true;
    // A music project asks for 48 kHz. A device that refuses it plays at its
    // own rate, as setSystemRate falls back, instead of failing the launch.
    if (mode == u"system" && m_systemRate > 0) {
        const int refused = m_systemRate;
        m_systemRate = 0;
        if (openEngine(nullptr)) {
            std::fprintf(stderr, "warning: audio: cannot open the device at %d Hz (%s), playing at its own rate\n",
                         refused, qPrintable(why));
            return true;
        }
        m_systemRate = refused;
    }
    if (error) *error = why;
    QObject::disconnect(m_documentConnection);
    return false;
}

bool AppAudio::setSystemRate(int hz, QString* error) {
    hz = std::max(0, hz);
    const bool started = m_source && m_mode == u"system";
    // After a failed reopen there is no engine, and any later call tries again.
    if (hz == m_systemRate && (m_update || !started)) return true;
    const int previous = m_systemRate;
    m_systemRate = hz;
    if (!started) return true;
    closeEngine();
    QString why;
    if (openEngine(&why)) return true;
    // Keep the audio on: the rate that ran before, then the device's own rate.
    std::vector<int> tried{hz};
    for (const int fallback : {previous, 0}) {
        if (std::find(tried.begin(), tried.end(), fallback) != tried.end()) continue;
        tried.push_back(fallback);
        m_systemRate = fallback;
        if (openEngine(nullptr)) {
            if (error) {
                *error = QStringLiteral("cannot open the device at %1 Hz (%2), playing at %3")
                             .arg(hz)
                             .arg(why)
                             .arg(fallback > 0 ? QStringLiteral("%1 Hz").arg(fallback) : QStringLiteral("its own rate"));
            }
            return false;
        }
    }
    m_systemRate = hz;
    if (error) *error = why;
    return false;
}

bool AppAudio::openEngine(QString* error) {
    if (!m_source || !m_clock) {
        if (error) *error = QStringLiteral("the timeline or the clock is gone");
        return false;
    }
    TimelineSource& source = *m_source;
    AudioEngine::Options options;
    options.recordSeconds = m_recordSeconds;
    if (m_mode == u"null") {
        options.backend = AudioEngine::Backend::Null;
        options.sampleRate = 48000;
        options.simulatedLatencySec = m_latencyMs / 1000.0;
    } else {
        options.backend = AudioEngine::Backend::System;
        options.sampleRate = m_systemRate;  // 0: the device's own rate (D24)
    }
    if (m_publishLoudness) options.loudness = &appLoudnessReadout();
    m_update = std::make_unique<UpdateTimer>();
    const auto initial = source.snapshot();
    m_update->engine.setTimeline(initial);
    m_update->appliedRevision = initial ? initial->revision : 0;
    // A new snapshot applies from the next play or seek. TimelineModel raises sourceChanged
    // with each timelineChanged, which follows every clipsChanged, and with each previewChanged,
    // once per drag step. Clip and track edits (gain, mute, effects) all reach clipsChanged on
    // settle. Build one plan per event-loop turn, and only for a new revision.
    m_update->setSingleShot(true);
    m_update->setInterval(0);
    const QPointer<UpdateTimer> update(m_update.get());
    const QPointer<TimelineSource> watched(&source);
    QObject::connect(m_update.get(), &QTimer::timeout, m_update.get(), [update, watched]() {
        if (!update || !watched) {
            return;
        }
        const auto snapshot = watched->snapshot();
        // A host-controlled snapshot read can close the audio synchronously.
        if (!update) {
            return;
        }
        const std::uint64_t revision = snapshot ? snapshot->revision : 0;
        if (snapshot && revision == update->appliedRevision) {
            return;
        }
        update->appliedRevision = revision;
        update->engine.setTimelineAsync(snapshot);
    });
    m_update->schedule = QObject::connect(&source, &TimelineSource::sourceChanged, m_update.get(),
                                          qOverload<>(&QTimer::start));
    std::string why;
    AudioEngine& engine = m_update->engine;
    if (!(m_startEngine ? m_startEngine(engine, options, &why) : engine.start(options, &why))) {
        if (error) *error = QString::fromStdString(why);
        m_update.reset();
        return false;
    }
    m_attachedClock = m_clock;
    m_clock->setAudioFeed(&engine.feed());
    const AudioEngine::Stats s = engine.stats();
    std::fprintf(stderr, "audio: %s backend, device \"%s\", %.0f Hz, output latency %.1f ms\n", s.backend.c_str(),
                 s.deviceName.c_str(), s.sampleRate, s.outputLatencySec * 1000.0);
    return true;
}

void AppAudio::detachUpdate() {
    QObject::disconnect(m_update->schedule);
    m_update->stop();
    m_update->disconnect();
    if (m_attachedClock) m_attachedClock->setAudioFeed(nullptr);
    m_attachedClock = nullptr;
}

void AppAudio::closeEngine() {
    if (!m_update) return;
    detachUpdate();
    m_update->engine.stop();
    m_update.reset();
}

AppAudio::~AppAudio() {
    QObject::disconnect(m_documentConnection);
    if (!m_update) return;
    detachUpdate();
    const AudioEngine::Stats s = m_update->engine.stats();
    m_update->engine.stop();
    m_update.reset();
    if (m_reportPath.isEmpty()) return;
    QJsonArray failures;
    for (const auto& f : s.failures) failures.append(QString::fromStdString(f));
    const QJsonObject report{
        {QStringLiteral("mode"), m_mode},
        {QStringLiteral("backend"), QString::fromStdString(s.backend)},
        {QStringLiteral("device"), QString::fromStdString(s.deviceName)},
        {QStringLiteral("sampleRate"), s.sampleRate},
        {QStringLiteral("outputLatencyMs"), s.outputLatencySec * 1000.0},
        {QStringLiteral("coreAudio"),
         QJsonObject{{QStringLiteral("ok"), s.coreAudio.ok},
                     {QStringLiteral("deviceFrames"), static_cast<qint64>(s.coreAudio.deviceFrames)},
                     {QStringLiteral("safetyFrames"), static_cast<qint64>(s.coreAudio.safetyFrames)},
                     {QStringLiteral("streamFrames"), static_cast<qint64>(s.coreAudio.streamFrames)},
                     {QStringLiteral("bufferFrames"), static_cast<qint64>(s.coreAudio.bufferFrames)}}},
        {QStringLiteral("callbacks"), static_cast<qint64>(s.callbacks)},
        {QStringLiteral("framesRendered"), static_cast<qint64>(s.framesRendered)},
        {QStringLiteral("underruns"), static_cast<qint64>(s.underruns)},
        {QStringLiteral("waitBlocks"), static_cast<qint64>(s.waitBlocks)},
        {QStringLiteral("lateStarts"), static_cast<qint64>(s.lateStarts)},
        {QStringLiteral("loopWraps"), static_cast<qint64>(s.loopWraps)},
        {QStringLiteral("loopMisses"), static_cast<qint64>(s.loopMisses)},
        {QStringLiteral("playStartMs"), s.lastPlayStartMs},
        {QStringLiteral("sessions"), static_cast<qint64>(s.sessions)},
        {QStringLiteral("playedSeconds"), s.sampleRate > 0 ? static_cast<double>(s.playedFrames) / s.sampleRate : 0.0},
        {QStringLiteral("openFailures"), static_cast<qint64>(s.openFailures)},
        {QStringLiteral("decodeErrors"), static_cast<qint64>(s.decodeErrors)},
        {QStringLiteral("sourcesOpened"), static_cast<qint64>(s.sourcesOpened)},
        {QStringLiteral("sourcesEvicted"), static_cast<qint64>(s.sourcesEvicted)},
        {QStringLiteral("failures"), failures}};
    QFile f(m_reportPath);
    if (f.open(QIODevice::WriteOnly)) f.write(QJsonDocument(report).toJson(QJsonDocument::Compact));
}

}  // namespace nt::audio
