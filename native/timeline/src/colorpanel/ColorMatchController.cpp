#include "colorpanel/ColorMatchController.h"
#include "color/ColorMatch.h"
#include "export/ExportController.h"
#include "preview/effects/ClipEffects.h"
#include "model/TimelineModel.h"
#include <QJsonObject>
#include <QUuid>
#include <cmath>

namespace {
double snapped(double timeMs, double fps) {
    return fps > 0 ? std::floor(std::max(0.0, timeMs) * fps / 1000 + 1e-6) * 1000 / fps : std::max(0.0, timeMs);
}
bool hasPicture(const QJsonObject& clip) {
    const auto type = clip.value("mediaType").toString();
    return type == "video" || type == "image";
}
}

QJsonObject nt::colorpanel::isolatedClipDocument(const QJsonObject& snapshot, const QString& clipId, const QJsonArray& effects, bool trackEffects) {
    auto document = snapshot;
    QJsonObject clip;
    for (const auto& value : snapshot.value("clips").toArray()) {
        if (value.toObject().value("id").toString() == clipId) clip = value.toObject();
    }
    for (const auto* field : {"transform", "layout", "flexItem", "repeater", "opacity", "blendMode", "parentId", "hidden",
                              "transitionIn", "animations", "paramCurves", "animationLinks", "fadeInMs", "fadeOutMs", "temporalEcho",
                              "motionBlur", "borderRadius", "caption"}) {
        clip.remove(QLatin1String(field));
    }
    clip.insert("effects", effects);
    document.insert("clips", QJsonArray{clip});
    QJsonArray tracks;
    for (const auto& value : snapshot.value("tracks").toArray()) {
        auto track = value.toObject();
        if (track.value("id").toString() != clip.value("trackId").toString()) continue;
        track.insert("visible", true);
        track.remove("automation");
        if (!trackEffects) {
            // A track's key runs first, on pixels nothing has graded, so it stays in the picture.
            QJsonArray keys;
            for (const auto& effect : track.value("effects").toArray()) {
                if (effect.toObject().value("type") == "chromaKey") keys.append(effect);
            }
            track.insert("effects", keys);
        }
        tracks.append(track);
    }
    document.insert("tracks", tracks);
    return document;
}

ColorMatchController::ColorMatchController(QObject* parent) : QObject(parent) { m_pool.setMaxThreadCount(1); }
ColorMatchController::~ColorMatchController() {
    if (m_cancel) m_cancel->store(true);
    if (m_capture && m_requestId > 0) m_capture->cancel(m_requestId);
    m_pool.waitForDone();
}
void ColorMatchController::setCapture(FrameCapture* capture) {
    if (m_capture == capture) return;
    cancel();
    m_capture = capture;
    emit inputsChanged();
}
void ColorMatchController::setClock(PlaybackClock* clock) {
    if (m_clock == clock) return;
    m_clock = clock;
    emit inputsChanged();
}
void ColorMatchController::setClipId(const QString& clipId) {
    if (m_clipId == clipId) return;
    m_clipId = clipId;
    // The message was about the shot that was selected before.
    if (!busy() && (!m_error.isEmpty() || !m_status.isEmpty())) {
        m_error.clear();
        m_status.clear();
        emit stateChanged();
    }
    emit inputsChanged();
}
void ColorMatchController::setProtectSkin(bool protect) {
    if (m_protectSkin == protect) return;
    m_protectSkin = protect;
    emit inputsChanged();
}
QJsonObject ColorMatchController::findClip(const QString& id) const {
    if (!m_capture || !m_capture->timeline() || id.isEmpty()) return {};
    for (const auto& value : m_capture->timeline()->clipsJson()) {
        if (value.toObject().value("id").toString() == id) return value.toObject();
    }
    return {};
}
QJsonObject ColorMatchController::trackOf(const QJsonObject& clip) const {
    if (!m_capture || !m_capture->timeline()) return {};
    for (const auto& value : m_capture->timeline()->timeline().raw.value("tracks").toArray()) {
        const auto track = value.toObject();
        if (track.value("id") == clip.value("trackId")) return track;
    }
    return {};
}
void ColorMatchController::finish(const QString& error, const QString& status) {
    m_step = Step::Idle;
    m_requestId = 0;
    m_cancel.reset();
    m_error = error;
    m_status = status;
    emit stateChanged();
}
void ColorMatchController::useFrameAtPlayhead() {
    if (busy()) return;
    if (!m_capture || !m_capture->timeline() || !m_clock) {
        finish(tr("Open a timeline before choosing a reference."));
        return;
    }
    const double time = snapped(m_clock->currentTimeMs(), m_clock->fps());
    m_step = Step::Reference;
    m_error.clear();
    m_status.clear();
    emit stateChanged();
    const int run = ++m_run;
    m_requestId = m_capture->captureSequence(time, [self = QPointer(this), run](const FrameCaptureResult& result) {
        if (self && run == self->m_run) self->capturedReference(result, {}, {});
    });
}
void ColorMatchController::useSelectedShot() {
    if (busy()) return;
    const auto clip = findClip(m_clipId);
    if (clip.isEmpty() || !hasPicture(clip)) {
        finish(tr("Select a video or image clip to use as the reference."));
        return;
    }
    const double start = clip.value("startMs").toDouble();
    const double end = start + clip.value("durationMs").toDouble();
    const double time = snapped((start + end) / 2, m_clock ? m_clock->fps() : 0);
    m_step = Step::Reference;
    m_error.clear();
    m_status.clear();
    emit stateChanged();
    const int run = ++m_run;
    const auto document = nt::colorpanel::isolatedClipDocument(nt::exporting::exportSnapshot(*m_capture->timeline()), m_clipId, clip.value("effects").toArray());
    m_requestId = m_capture->captureDocument(document, time,
        [self = QPointer(this), run, name = clip.value("name").toString(), id = m_clipId](const FrameCaptureResult& result) {
            if (self && run == self->m_run) self->capturedReference(result, name, id);
        });
}
void ColorMatchController::capturedReference(const FrameCaptureResult& result, const QString& clipName, const QString& clipId) {
    if (result.cancelled) {
        finish({});
        return;
    }
    if (!result.ok()) {
        finish(result.error);
        return;
    }
    m_reference = result.image;
    m_referenceClipName = clipName;
    m_referenceClipId = clipId;
    m_referenceTimeMs = result.timeMs;
    emit referenceChanged();
    finish({});
}
void ColorMatchController::clearReference() {
    if (m_reference.isNull()) return;
    m_reference = {};
    m_referenceClipName.clear();
    m_referenceClipId.clear();
    m_referenceTimeMs = -1;
    emit referenceChanged();
}
void ColorMatchController::match() {
    if (busy()) return;
    if (m_reference.isNull()) {
        finish(tr("Choose a reference frame or shot first."));
        return;
    }
    const auto clip = findClip(m_clipId);
    if (clip.isEmpty() || !hasPicture(clip)) {
        finish(tr("Select a video or image clip to match."));
        return;
    }
    if (clip.value("locked").toBool() || trackOf(clip).value("locked").toBool()) {
        finish(tr("Unlock the clip and its track to match it."));
        return;
    }
    const auto unmodelled = nt::color::colorEffectAfterCorrection(clip.value("effects").toArray());
    if (!unmodelled.isEmpty()) {
        finish(tr("Match cannot see through the %1 effect after the wheels. Move it before them or turn it off.").arg(unmodelled));
        return;
    }
    const double start = clip.value("startMs").toDouble();
    const double end = start + clip.value("durationMs").toDouble();
    const bool sameShot = m_referenceClipId.isEmpty() ? (m_referenceTimeMs >= start && m_referenceTimeMs < end) : m_referenceClipId == m_clipId;
    if (sameShot) {
        finish(tr("The reference is inside this clip. Choose a frame from another shot."));
        return;
    }
    const double playhead = m_clock ? m_clock->currentTimeMs() : -1;
    const double time = snapped(playhead >= start && playhead < end ? playhead : (start + end) / 2, m_clock ? m_clock->fps() : 0);
    m_targetId = m_clipId;
    m_targetClip = clip;
    m_targetTrackEffects = trackOf(clip).value("effects").toArray();
    m_step = Step::Current;
    m_error.clear();
    m_status.clear();
    emit stateChanged();
    const int run = ++m_run;
    const auto document = nt::colorpanel::isolatedClipDocument(nt::exporting::exportSnapshot(*m_capture->timeline()), m_targetId,
        nt::color::probeEffects(clip.value("effects").toArray()), false);
    m_requestId = m_capture->captureDocument(document, time, [self = QPointer(this), run](const FrameCaptureResult& result) {
        if (self && run == self->m_run) self->capturedCurrent(result);
    });
}
void ColorMatchController::capturedCurrent(const FrameCaptureResult& result) {
    m_requestId = 0;
    if (result.cancelled) {
        finish({});
        return;
    }
    if (!result.ok()) {
        finish(result.error);
        return;
    }
    m_step = Step::Solving;
    m_cancel = std::make_shared<std::atomic_bool>(false);
    const int run = m_run;
    // native-rules #12: lambda captures raw this and runs on a pool thread
    m_pool.start([this, run, current = result.image, reference = m_reference, effects = m_targetClip.value("effects").toArray(),
                  track = nt::effects::convertTrackEffects(m_targetTrackEffects), skin = m_protectSkin, cancel = m_cancel] {
        nt::color::MatchInput input;
        // FrameCapture's frame-server route is RGBA8, independently of export diagnostics.
        input.workingFormat = nt::WorkingFormat::Rgba8;
        input.current = current;
        input.reference = reference;
        input.effects = effects;
        input.trackEffects = track;
        input.protectSkin = skin;
        input.cancelled = [cancel] { return cancel->load(); };
        auto output = nt::color::solveMatch(input);
        QMetaObject::invokeMethod(this, [this, run, output = std::move(output)] {
            if (run == m_run) solved(output);
        }, Qt::QueuedConnection);
    });
}
void ColorMatchController::solved(const nt::color::MatchResult& result) {
    if (result.wasCancelled) {
        finish({});
        return;
    }
    if (!result.ok) {
        finish(result.error);
        return;
    }
    const auto clip = findClip(m_targetId);
    // The whole clip, because media, timing and crop all change the picture that was solved for.
    const auto track = trackOf(clip);
    if (clip.isEmpty() || clip != m_targetClip || track.value("effects").toArray() != m_targetTrackEffects || track.value("locked").toBool()) {
        finish(tr("The clip changed while matching. Run Match again."));
        return;
    }
    const auto effects = nt::color::applyMatchToEffects(clip.value("effects").toArray(), result, QUuid::createUuid().toString(QUuid::WithoutBraces));
    auto* model = m_capture ? m_capture->timeline() : nullptr;
    if (!model || !model->applyEdit(QStringLiteral("patchClip"), QJsonObject{{"clipId", m_targetId}, {"patch", QJsonObject{{"effects", effects}}}})) {
        finish(tr("Match could not change this clip."));
        return;
    }
    m_differenceBefore = result.differenceBefore;
    m_differenceAfter = result.differenceAfter;
    finish({}, tr("Color difference went from %1 to %2.").arg(result.differenceBefore * 100, 0, 'f', 1).arg(result.differenceAfter * 100, 0, 'f', 1));
    emit matched();
}
void ColorMatchController::cancel() {
    if (!busy()) return;
    ++m_run;
    if (m_cancel) m_cancel->store(true);
    if (m_capture && m_requestId > 0) m_capture->cancel(m_requestId);
    finish({});
}
