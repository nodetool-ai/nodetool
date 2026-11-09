#include "colorpanel/ScopesController.h"
#include "model/TimelineModel.h"
#include <QThread>
#include <cmath>
#include <utility>

namespace {
constexpr int kPausedIntervalMs = 16;
constexpr std::array<float, 3> kLumaColour{0.82f, 0.95f, 0.82f};
}

ScopesController::ScopesController(QObject* parent) : QObject(parent) {
    m_pool.setMaxThreadCount(1);
    m_timer.setSingleShot(true);
    connect(&m_timer, &QTimer::timeout, this, &ScopesController::requestFrame);
}
ScopesController::~ScopesController() {
    m_timer.stop();
    if (m_capture && m_requestId > 0) m_capture->cancel(m_requestId);
    m_pool.waitForDone();
}
void ScopesController::setCapture(FrameCapture* capture) {
    if (m_capture == capture) return;
    if (m_capture) {
        if (m_requestId > 0) m_capture->cancel(m_requestId);
        disconnect(m_capture, nullptr, this, nullptr);
    }
    m_requestId = 0;
    m_capture = capture;
    if (capture) {
        const auto observe = [this] {
            if (m_observed) disconnect(m_observed, nullptr, this, nullptr);
            m_observed = m_capture ? m_capture->timeline() : nullptr;
            if (m_observed) {
                connect(m_observed, &TimelineModel::timelineChanged, this, &ScopesController::documentChanged);
                connect(m_observed, &TimelineModel::previewChanged, this, &ScopesController::documentChanged);
                connect(m_observed, &TimelineModel::clipsChanged, this, &ScopesController::documentChanged);
            }
            documentChanged();
        };
        connect(capture, &FrameCapture::timelineChanged, this, observe);
        observe();
    }
    emit inputsChanged();
}
void ScopesController::setClock(PlaybackClock* clock) {
    if (m_clock == clock) return;
    if (m_clock) disconnect(m_clock, nullptr, this, nullptr);
    m_clock = clock;
    if (clock) {
        // A plain slot that sets a flag, so a frame of playback costs nothing here.
        connect(clock, &PlaybackClock::timeChanged, this, &ScopesController::markDirty);
        connect(clock, &PlaybackClock::playingChanged, this, &ScopesController::markDirty);
    }
    emit inputsChanged();
    markDirty();
}
void ScopesController::setActive(bool active) {
    if (m_active == active) return;
    m_active = active;
    if (!active) {
        m_timer.stop();
        if (m_capture && m_requestId > 0) m_capture->cancel(m_requestId);
        m_requestId = 0;
    }
    emit activeChanged();
    markDirty();
}
void ScopesController::setScopes(const QStringList& scopes) {
    if (m_scopes == scopes) return;
    m_scopes = scopes;
    emit scopesChanged();
    // The frame is the same, so only the computing is left.
    if (!m_lastFrame.isNull()) compute(m_lastFrame, m_lastFrameTime);
}
void ScopesController::documentChanged() {
    ++m_documentSerial;
    markDirty();
}
void ScopesController::markDirty() {
    if (!m_active || !m_capture || !m_clock) return;
    m_dirty = true;
    if (m_requestId > 0 || m_timer.isActive()) return;
    m_timer.start(m_clock->playing() ? m_playingIntervalMs : kPausedIntervalMs);
}
void ScopesController::requestFrame() {
    if (!m_active || !m_capture || !m_clock || m_requestId > 0 || !m_dirty) return;
    m_dirty = false;
    double time = std::max(0.0, m_clock->currentTimeMs());
    double key = time;
    const double fps = m_clock->fps();
    if (fps > 0) {
        const double frame = std::floor(time * fps / 1000 + 1e-6);
        key = frame;
        time = frame * 1000 / fps;
    }
    if (key == m_doneKey && m_documentSerial == m_doneSerial) return;
    m_inFlightKey = key;
    m_inFlightSerial = m_documentSerial;
    // The capture outlives this controller, and its callback can arrive after a cancel.
    m_requestId = m_capture->captureSequence(time, [self = QPointer(this)](const FrameCaptureResult& result) {
        if (!self || result.requestId != self->m_requestId) return;
        self->m_requestId = 0;
        if (result.ok()) {
            self->m_doneKey = self->m_inFlightKey;
            self->m_doneSerial = self->m_inFlightSerial;
            self->setError({});
            self->compute(result.image, result.timeMs);
        } else if (!result.cancelled) {
            self->setError(result.error);
        }
        // A failure waits for the next change, so a missing file is not retried in a loop.
        if (self->m_dirty && self->m_active && self->m_clock) {
            self->m_timer.start(self->m_clock->playing() ? self->m_playingIntervalMs : kPausedIntervalMs);
        }
    });
}
void ScopesController::compute(const QImage& frame, double timeMs) {
    m_lastFrame = frame;
    m_lastFrameTime = timeMs;
    m_nextFrame = frame;
    m_nextFrameTime = timeMs;
    if (!m_computing) startCompute();
}
void ScopesController::startCompute() {
    if (m_nextFrame.isNull()) return;
    m_computing = true;
    // native-rules #12: lambda captures raw this and runs on a pool thread
    m_pool.start([this, frame = std::exchange(m_nextFrame, {}), timeMs = m_nextFrameTime, scopes = m_scopes] {
        Images images;
        images.timeMs = timeMs;
        images.thread = QThread::currentThreadId();
        const auto signal = nt::scopes::decimate(frame);
        const auto matrix = nt::scopes::Matrix::Bt709;
        if (scopes.contains(QStringLiteral("waveform"))) images.waveform = nt::scopes::paintWaveform(nt::scopes::waveformLuma(signal, matrix), {kLumaColour});
        if (scopes.contains(QStringLiteral("parade"))) images.parade = nt::scopes::paintParade(nt::scopes::paradeRgb(signal));
        if (scopes.contains(QStringLiteral("vectorscope"))) images.vectorscope = nt::scopes::paintVectorscope(nt::scopes::vectorscope(signal, matrix));
        if (scopes.contains(QStringLiteral("histogram"))) images.histogram = nt::scopes::paintHistogram(nt::scopes::histogram(signal, matrix));
        QMetaObject::invokeMethod(this, [this, images = std::move(images)] { finishCompute(images); }, Qt::QueuedConnection);
    });
}
void ScopesController::finishCompute(const Images& images) {
    m_computing = false;
    ++m_computedFrames;
    m_lastComputeThread = images.thread;
    m_images = images;
    emit imagesChanged();
    startCompute();
}
QVariantList ScopesController::vectorTargets() const {
    QVariantList out;
    for (const auto& target : nt::scopes::targets(nt::scopes::Matrix::Bt709, 0.75f)) {
        out.append(QVariantMap{{"name", target.name},
                               {"x", 0.5 + target.cb / nt::scopes::kVectorExtent / 2},
                               {"y", 0.5 - target.cr / nt::scopes::kVectorExtent / 2}});
    }
    return out;
}
void ScopesController::setError(const QString& error) {
    if (m_error == error) return;
    m_error = error;
    emit errorChanged();
}
void ScopesController::readNumbers(double timeMs, const nt::scopes::NumbersOptions& options, NumbersCallback callback) {
    if (!m_capture) {
        callback(QJsonObject{{QStringLiteral("error"), QStringLiteral("Open a timeline before reading scopes.")}});
        return;
    }
    m_capture->captureSequence(timeMs, [self = QPointer(this), options, callback = std::move(callback)](const FrameCaptureResult& result) mutable {
        if (!self) return;
        if (!result.ok()) {
            callback(QJsonObject{{QStringLiteral("error"), result.cancelled ? QStringLiteral("The frame capture was cancelled.") : result.error}});
            return;
        }
        // native-rules #12: lambda captures a raw owner pointer and runs on a pool thread
        self->m_pool.start([owner = self.data(), frame = result.image, timeMs = result.timeMs, options, callback = std::move(callback)]() mutable {
            auto numbers = nt::scopes::readNumbers(nt::scopes::decimate(frame), options);
            numbers.insert(QStringLiteral("timeMs"), timeMs);
            QMetaObject::invokeMethod(owner, [callback = std::move(callback), numbers = std::move(numbers)] { callback(numbers); }, Qt::QueuedConnection);
        });
    });
}
