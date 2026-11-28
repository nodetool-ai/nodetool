#pragma once

// QML singleton exposing off-thread audio file analysis (waveform peaks +
// pitch detection), MIDI note formatting, and loop mode options for
// SamplerPanel.qml. Also registers `sampler.*` document edits on startup.
//
// Ownership: created and owned by the QML engine as a singleton (or test stack).
// Thread affinity: public properties/invokables run on the UI thread only;
// `analyzeAudioFile()` dispatches capped decode + peak extraction + pitch
// detection to `QThreadPool::globalInstance()`, synchronized against destruction
// via a shared mutex-guarded cancellation state (`state_`) so worker threads
// never race with `~SamplerHelper()` (native/AGENTS.md rules 1, 10-13).

#include <QObject>
#include <QString>
#include <QVariantList>
#include <QVariantMap>
#include <QtQmlIntegration/qqmlintegration.h>

#include <cstddef>
#include <memory>

namespace nt::midi {

class SamplerHelper : public QObject {
    Q_OBJECT
    QML_ELEMENT
    QML_SINGLETON
    Q_PROPERTY(QVariantList loopModes READ loopModes CONSTANT)

public:
    // Cap decoded frames for peaks + pitch detection to 15 seconds @ 48 kHz.
    static constexpr std::size_t kMaxAnalysisFrames = 48000U * 15U;

    explicit SamplerHelper(QObject* parent = nullptr);
    ~SamplerHelper() override;

    [[nodiscard]] QVariantList loopModes() const;
    Q_INVOKABLE QString noteName(int midiNote) const;
    Q_INVOKABLE bool isSupportedAudioFile(const QString& pathOrUrl) const;
    Q_INVOKABLE void analyzeAudioFile(const QString& requestId, const QString& pathOrUrl,
                                      const QString& projectDir = {});

signals:
    void fileAnalyzed(const QString& requestId, const QVariantMap& result);

private:
    struct AsyncState;
    // Shared between SamplerHelper (UI thread) and in-flight QThreadPool worker
    // tasks; unique ownership is impossible because worker runnables may finish
    // after SamplerHelper is destroyed.
    std::shared_ptr<AsyncState> state_;
};

}  // namespace nt::midi
