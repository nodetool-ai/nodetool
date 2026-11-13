#include "audio/AppAudio.h"
#include "audio/loudness/AppReadout.h"

#include "model/TimelineModel.h"
#include "playback/PlaybackClock.h"

#include <QFile>
#include <QJsonArray>
#include <QJsonDocument>
#include <QJsonObject>
#include <QObject>

#include <algorithm>
#include <cstdio>
#include <vector>

namespace nt::audio {

int engineRateFor(const Timeline& timeline) {
    return timeline.raw.value(QStringLiteral("music")).isObject() ? kMusicEngineRate : 0;
}

bool AppAudio::start(const QString& mode, double latencyMs, TimelineModel& model, PlaybackClock& clock, QString* error) {
    m_mode = mode;
    if (mode == u"none") return true;
    if (mode != u"null" && mode != u"system") {
        if (error) *error = QStringLiteral("--audio takes none, null or system");
        return false;
    }
    m_latencyMs = latencyMs;
    m_model = &model;
    m_clock = &clock;
    if (m_followDocumentRate) {
        if (const auto snapshot = model.snapshot()) m_systemRate = engineRateFor(*snapshot);
        // The context is this object's own, so its destruction ends the connection.
        m_documentConnection = QObject::connect(&model, &TimelineModel::documentReplaced, &m_documentContext, [this]() {
            const auto snapshot = m_model->snapshot();
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
    const bool started = m_model && m_mode == u"system";
    // After a failed reopen there is no engine, and any later call tries again.
    if (hz == m_systemRate && (m_engine || !started)) return true;
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
    TimelineModel& model = *m_model;
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
    m_engine = std::make_unique<AudioEngine>();
    m_engine->setTimeline(model.snapshot());
    // A new snapshot applies from the next play or seek. One edit fires clipsChanged and
    // timelineChanged back to back, and a drag fires previewChanged per step. Clip and
    // track edits (gain, mute, effects) all reach clipsChanged on settle, so listen to
    // clipsChanged and previewChanged only, and build one plan per event-loop turn.
    AudioEngine* engine = m_engine.get();
    m_timer = std::make_unique<QTimer>();
    m_timer->setSingleShot(true);
    m_timer->setInterval(0);
    std::uint64_t* applied = &m_appliedRevision;
    QObject::connect(m_timer.get(), &QTimer::timeout, m_timer.get(), [engine, &model, applied]() {
        const auto snapshot = model.snapshot();
        const std::uint64_t revision = snapshot ? snapshot->revision : 0;
        if (snapshot && revision == *applied) return;
        *applied = revision;
        engine->setTimelineAsync(snapshot);
    });
    m_appliedRevision = model.snapshot() ? model.snapshot()->revision : 0;
    QTimer* timer = m_timer.get();
    const auto schedule = [timer]() { timer->start(); };
    m_connections[0] = QObject::connect(&model, &TimelineModel::clipsChanged, timer, schedule);
    m_connections[1] = QObject::connect(&model, &TimelineModel::previewChanged, timer, schedule);
    std::string why;
    if (!(m_startEngine ? m_startEngine(*m_engine, options, &why) : m_engine->start(options, &why))) {
        if (error) *error = QString::fromStdString(why);
        for (const auto& c : m_connections) QObject::disconnect(c);
        m_timer.reset();
        m_engine.reset();
        return false;
    }
    m_attachedClock = m_clock;
    m_clock->setAudioFeed(&m_engine->feed());
    const AudioEngine::Stats s = m_engine->stats();
    std::fprintf(stderr, "audio: %s backend, device \"%s\", %.0f Hz, output latency %.1f ms\n", s.backend.c_str(),
                 s.deviceName.c_str(), s.sampleRate, s.outputLatencySec * 1000.0);
    return true;
}

void AppAudio::closeEngine() {
    for (const auto& c : m_connections) QObject::disconnect(c);
    if (m_attachedClock) m_attachedClock->setAudioFeed(nullptr);
    m_attachedClock = nullptr;
    if (m_engine) m_engine->stop();
    m_engine.reset();
    m_timer.reset();
}

AppAudio::~AppAudio() {
    if (!m_engine) return;
    for (const auto& c : m_connections) QObject::disconnect(c);
    if (m_attachedClock) m_attachedClock->setAudioFeed(nullptr);
    const AudioEngine::Stats s = m_engine->stats();
    m_engine->stop();
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
