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

#include <cstdio>

namespace nt::audio {

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
    AudioEngine::Options options;
    options.recordSeconds = m_recordSeconds;
    if (mode == u"null") {
        options.backend = AudioEngine::Backend::Null;
        options.sampleRate = 48000;
        options.simulatedLatencySec = latencyMs / 1000.0;
    } else if (mode == u"system") {
        options.backend = AudioEngine::Backend::System;
        options.sampleRate = 0;  // the device's own rate (D24)
    } else {
        if (error) *error = QStringLiteral("--audio takes none, null or system");
        return false;
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
    if (!m_update->engine.start(options, &why)) {
        if (error) *error = QString::fromStdString(why);
        m_update.reset();
        return false;
    }
    m_clock = &clock;
    clock.setAudioFeed(&m_update->engine.feed());
    const AudioEngine::Stats s = m_update->engine.stats();
    std::fprintf(stderr, "audio: %s backend, device \"%s\", %.0f Hz, output latency %.1f ms\n", s.backend.c_str(),
                 s.deviceName.c_str(), s.sampleRate, s.outputLatencySec * 1000.0);
    return true;
}

AppAudio::~AppAudio() {
    if (!m_update) return;
    QObject::disconnect(m_update->schedule);
    m_update->stop();
    m_update->disconnect();
    if (m_clock) m_clock->setAudioFeed(nullptr);
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
