#include "audio/AppAudio.h"

#include "model/TimelineModel.h"
#include "playback/PlaybackClock.h"

#include <QFile>
#include <QJsonArray>
#include <QJsonDocument>
#include <QJsonObject>
#include <QObject>

#include <cstdio>

namespace nt::audio {

bool AppAudio::start(const QString& mode, double latencyMs, TimelineModel& model, PlaybackClock& clock, QString* error) {
    m_mode = mode;
    if (mode == u"none") return true;
    AudioEngine::Options options;
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
    m_engine = std::make_unique<AudioEngine>();
    m_engine->setTimeline(model.snapshot());
    // A new snapshot applies from the next play or seek.
    AudioEngine* engine = m_engine.get();
    const auto update = [engine, &model]() { engine->setTimeline(model.snapshot()); };
    m_connections[0] = QObject::connect(&model, &TimelineModel::timelineChanged, &clock, update);
    m_connections[1] = QObject::connect(&model, &TimelineModel::clipsChanged, &clock, update);
    std::string why;
    if (!m_engine->start(options, &why)) {
        if (error) *error = QString::fromStdString(why);
        m_engine.reset();
        return false;
    }
    m_clock = &clock;
    clock.setAudioFeed(&m_engine->feed());
    const AudioEngine::Stats s = m_engine->stats();
    std::fprintf(stderr, "audio: %s backend, device \"%s\", %.0f Hz, output latency %.1f ms\n", s.backend.c_str(),
                 s.deviceName.c_str(), s.sampleRate, s.outputLatencySec * 1000.0);
    return true;
}

AppAudio::~AppAudio() {
    if (!m_engine) return;
    for (const auto& c : m_connections) QObject::disconnect(c);
    if (m_clock) m_clock->setAudioFeed(nullptr);
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
