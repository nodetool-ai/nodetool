#include "midi/SamplerHelper.h"

#include "midi/MultisampleSampler.h"
#include "midi/SamplerEdits.h"

#include <QDir>
#include <QFileInfo>
#include <QMetaObject>
#include <QThreadPool>
#include <QUrl>

#include <algorithm>
#include <array>
#include <atomic>
#include <cmath>
#include <mutex>
#include <string>

namespace {
// timeline_qml is linked with WHOLE_ARCHIVE into every QML host and into
// tst_assistantcommands, so registering here makes sampler.* edits available
// everywhere AssistantCommandTable is audited or run.
[[maybe_unused]] const bool samplerEditsRegistered = [] {
    nt::midi::registerSamplerEdits();
    return true;
}();

constexpr int kWaveformPeakBuckets = 160;

QString localPathFromUrlOrString(const QString& pathOrUrl) {
    const QUrl url(pathOrUrl);
    if (url.isLocalFile()) {
        return url.toLocalFile();
    }
    return pathOrUrl;
}

QVariantList computeNormalizedPeaks(std::span<const float> interleavedStereo) {
    QVariantList peaks;
    const std::size_t frames = interleavedStereo.size() / 2;
    if (frames == 0) return peaks;
    peaks.reserve(kWaveformPeakBuckets);
    float maxPeak = 0.0f;
    std::array<float, kWaveformPeakBuckets> raw{};
    for (int b = 0; b < kWaveformPeakBuckets; ++b) {
        const std::size_t start = (static_cast<std::size_t>(b) * frames) / kWaveformPeakBuckets;
        const std::size_t end = std::max(start + 1, ((static_cast<std::size_t>(b + 1)) * frames) / kWaveformPeakBuckets);
        const std::size_t clampedEnd = std::min(end, frames);
        float p = 0.0f;
        for (std::size_t f = start; f < clampedEnd; ++f) {
            const float l = std::isfinite(interleavedStereo[f * 2]) ? std::abs(interleavedStereo[f * 2]) : 0.0f;
            const float r = std::isfinite(interleavedStereo[f * 2 + 1]) ? std::abs(interleavedStereo[f * 2 + 1]) : 0.0f;
            const float m = 0.5f * (l + r);
            if (m > p) p = m;
        }
        raw[static_cast<std::size_t>(b)] = p;
        if (p > maxPeak) maxPeak = p;
    }
    const float scale = maxPeak > 1.0e-6f ? (1.0f / maxPeak) : 1.0f;
    for (float v : raw) {
        peaks.append(static_cast<double>(std::clamp(v * scale, 0.0f, 1.0f)));
    }
    return peaks;
}

}  // namespace

namespace nt::midi {

struct SamplerHelper::AsyncState {
    std::atomic<bool> cancelled{false};
    // Guards `owner` so `QMetaObject::invokeMethod(..., Qt::QueuedConnection)` on a
    // worker thread establishes a strict happens-before edge before `~QObject()`.
    std::mutex mutex;
    SamplerHelper* owner = nullptr;
};

SamplerHelper::SamplerHelper(QObject* parent)
    : QObject(parent), state_(std::make_shared<AsyncState>()) {
    state_->owner = this;
}

SamplerHelper::~SamplerHelper() {
    state_->cancelled.store(true, std::memory_order_release);
    std::lock_guard<std::mutex> lock(state_->mutex);
    state_->owner = nullptr;
}

QVariantList SamplerHelper::loopModes() const {
    return {
        QVariantMap{{QStringLiteral("value"), QStringLiteral("oneShot")}, {QStringLiteral("label"), QStringLiteral("One-Shot")}},
        QVariantMap{{QStringLiteral("value"), QStringLiteral("sustain")}, {QStringLiteral("label"), QStringLiteral("Loop")}},
    };
}

QString SamplerHelper::noteName(int midiNote) const {
    static constexpr std::array<const char*, 12> kNames{
        "C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B",
    };
    const int clamped = std::clamp(midiNote, 0, 127);
    const int pitchClass = clamped % 12;
    const int octave = (clamped / 12) - 2;  // NodeTool convention: C3 = 60
    return QString::fromLatin1(kNames[static_cast<std::size_t>(pitchClass)]) + QString::number(octave);
}

bool SamplerHelper::isSupportedAudioFile(const QString& pathOrUrl) const {
    const QString local = localPathFromUrlOrString(pathOrUrl);
    const QString ext = QFileInfo(local).suffix().toLower();
    return ext == u"wav" || ext == u"aif" || ext == u"aiff" || ext == u"flac" || ext == u"mp3" ||
           ext == u"ogg" || ext == u"m4a";
}

void SamplerHelper::analyzeAudioFile(const QString& requestId, const QString& pathOrUrl, const QString& projectDir) {
    auto state = state_;
    const QString local = localPathFromUrlOrString(pathOrUrl);
    QThreadPool::globalInstance()->start([state = std::move(state), requestId, local, projectDir]() {
        if (state->cancelled.load(std::memory_order_acquire)) return;

        QVariantMap result;
        QString resolvedPath = local;
        const QFileInfo fi(local);
        if (fi.isRelative() && !projectDir.isEmpty()) {
            resolvedPath = QDir(projectDir).filePath(local);
        }

        std::string decodeError;
        std::size_t totalFrames = 0;
        const auto isCancelled = [&state]() { return state->cancelled.load(std::memory_order_acquire); };
        const auto decoded = decodeAudioFileToStereo(
            resolvedPath.toStdString(), 48000.0, &decodeError, kMaxAnalysisFrames, isCancelled, &totalFrames);
        if (state->cancelled.load(std::memory_order_acquire)) return;

        if (!decoded || decoded->empty()) {
            result.insert(QStringLiteral("ok"), false);
            result.insert(QStringLiteral("error"),
                          QString::fromStdString(decodeError.empty() ? "decode failed" : decodeError));
        } else {
            const int rootNote = detectRootMidiNote(decoded->interleavedStereo, decoded->sampleRate, 60);
            if (state->cancelled.load(std::memory_order_acquire)) return;
            QString storedPath = local;
            if (!projectDir.isEmpty()) {
                const QString rel = QDir(projectDir).relativeFilePath(QFileInfo(resolvedPath).absoluteFilePath());
                if (!rel.startsWith(u"..") && !QFileInfo(rel).isAbsolute()) {
                    storedPath = rel;
                }
            }
            const std::size_t durationFrames = std::max(totalFrames, decoded->frameCount());
            result.insert(QStringLiteral("ok"), true);
            result.insert(QStringLiteral("name"), QFileInfo(resolvedPath).completeBaseName());
            result.insert(QStringLiteral("mediaPath"), storedPath);
            result.insert(QStringLiteral("rootNote"), rootNote);
            result.insert(QStringLiteral("peaks"), computeNormalizedPeaks(decoded->interleavedStereo));
            result.insert(QStringLiteral("analyzedFrames"), static_cast<qint64>(decoded->frameCount()));
            result.insert(QStringLiteral("durationSec"), static_cast<double>(durationFrames) / decoded->sampleRate);
        }

        std::lock_guard<std::mutex> lock(state->mutex);
        if (state->owner == nullptr || state->cancelled.load(std::memory_order_acquire)) {
            return;
        }
        QMetaObject::invokeMethod(
            state->owner,
            [state, requestId, result]() {
                if (state->cancelled.load(std::memory_order_acquire)) return;
                SamplerHelper* target = nullptr;
                {
                    std::lock_guard<std::mutex> uiLock(state->mutex);
                    target = state->owner;
                }
                if (target) {
                    emit target->fileAnalyzed(requestId, result);
                }
            },
            Qt::QueuedConnection);
    });
}

}  // namespace nt::midi
