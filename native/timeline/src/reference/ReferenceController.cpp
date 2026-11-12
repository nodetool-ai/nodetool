// Behaviour ported from FilmCraft (MIT), see licenses/FilmCraft-MIT.txt.
#include "reference/ReferenceController.h"
#include "ai/Take.h"
#include "assets/AssetMedia.h"
#include "export/ExportController.h"
#include "model/TimelineModel.h"
#include "server/ServerClient.h"
#include "server/ServerSource.h"
#include <QDir>
#include <QJsonArray>
#include <QThread>
#include <algorithm>
#include <cmath>
#include <vector>

namespace {
constexpr int kPausedIntervalMs = 16;
constexpr int kPlayingIntervalMs = 200;
constexpr double kFrameEpsilon = 1e-6;

std::vector<ReferenceController*>& liveInstances() {
    // native-rules #14: static mutable instance list
    static std::vector<ReferenceController*> instances;
    return instances;
}
double frameFloor(double timeMs, double fps) { return std::floor(timeMs * fps / 1000 + kFrameEpsilon); }
double frameCeil(double timeMs, double fps) { return std::ceil(timeMs * fps / 1000 - kFrameEpsilon); }
QString takeLabel(const QJsonObject& take, int index) {
    const auto label = take.value("label").toString();
    return label.isEmpty() ? ReferenceController::tr("Take %1").arg(index + 1) : label;
}
ReferenceController::TakeMediaResolver serverResolver(const std::shared_ptr<nt::assets::MediaProtection>& protection) {
    const auto target = nt::server::serverSaveTarget();
    if (!target) return {};
    return [target = *target, protection](const QString& assetId, const QJsonObject& clip) {
        nt::server::ServerClient client(target.server, target.token);
        const auto asset = client.getAsset(assetId);
        if (!asset.ok()) return nt::Clip{};
        const auto cacheRoot = QDir::cleanPath(QDir(target.backupDir).absoluteFilePath("../../.."));
        return nt::assets::resolveDroppedMedia(client, cacheRoot, asset.data.toObject(), clip, *protection, protection->generation());
    };
}
}

ReferenceController::ReferenceController(QObject* parent)
    : QObject(parent), m_protection(std::make_shared<nt::assets::MediaProtection>()) {
    liveInstances().push_back(this);
    m_timer.setSingleShot(true);
    connect(&m_timer, &QTimer::timeout, this, &ReferenceController::followPlayhead);
}
ReferenceController::~ReferenceController() {
    std::erase(liveInstances(), this);
    if (m_capture && m_requestId > 0) m_capture->cancel(m_requestId);
}
ReferenceController* ReferenceController::forOwner(const QObject* owner) {
    if (!owner) return nullptr;
    for (auto* instance : liveInstances()) {
        if (instance->m_owner == owner) return instance;
    }
    return nullptr;
}
void ReferenceController::setCapture(FrameCapture* capture) {
    if (m_capture == capture) return;
    if (m_capture) {
        if (m_requestId > 0) m_capture->cancel(m_requestId);
        disconnect(m_capture, nullptr, this, nullptr);
    }
    m_requestId = 0;
    m_capture = capture;
    if (capture) connect(capture, &FrameCapture::timelineChanged, this, &ReferenceController::observeModel);
    observeModel();
    emit inputsChanged();
}
void ReferenceController::setClock(PlaybackClock* clock) {
    if (m_clock == clock) return;
    if (m_clock) disconnect(m_clock, nullptr, this, nullptr);
    m_clock = clock;
    m_following = false;
    syncFollowing();
    emit inputsChanged();
}
void ReferenceController::setOwner(QObject* owner) {
    if (m_owner == owner) return;
    m_owner = owner;
    emit inputsChanged();
}
void ReferenceController::observeModel() {
    if (m_observed == model() && m_observed) return;
    if (m_observed) disconnect(m_observed, nullptr, this, nullptr);
    m_observed = model();
    m_hadContent = hasContent();
    clear();
    if (m_observed) {
        m_generation = m_observed->documentGeneration();
        connect(m_observed, &TimelineModel::timelineChanged, this, &ReferenceController::documentChanged);
        connect(m_observed, &TimelineModel::previewChanged, this, &ReferenceController::documentChanged);
        connect(m_observed, &TimelineModel::clipsChanged, this, &ReferenceController::documentChanged);
    }
    emit takesChanged();
}
void ReferenceController::clear() {
    m_timer.stop();
    if (m_capture && m_requestId > 0) m_capture->cancel(m_requestId);
    m_requestId = 0;
    ++m_run;
    m_target.reset();
    m_inFlight = false;
    m_captureAgain = false;
    m_dirty = false;
    m_stale = false;
    m_error.clear();
    m_doneTime = -1;
    m_image = {};
    m_imageTimeMs = -1;
    m_imageTakeId.clear();
    emit stateChanged();
    emit imageChanged();
}
void ReferenceController::documentChanged() {
    if (m_observed && m_observed->documentGeneration() != m_generation) {
        m_generation = m_observed->documentGeneration();
        m_hadContent = hasContent();
        clear();
        emit takesChanged();
        // Something shows the reference, so it starts over on the new document's playhead.
        if (m_shownInPanel || m_shownInView) matchPlayhead();
        return;
    }
    ++m_documentSerial;
    if (m_hadContent != hasContent()) {
        m_hadContent = hasContent();
        emit stateChanged();
    }
    if (m_shownInPanel && !takeClipId().isEmpty()) emit takesChanged();
    if (m_ganged) {
        markDirty();
        return;
    }
    if (!m_target) return;
    // No picture yet, as on a timeline that was empty: this edit may bring the first one. It waits
    // a turn, because one edit sends several of these signals and the capture's snapshot must
    // be of the finished edit.
    if (m_image.isNull() && m_error.isEmpty()) {
        m_captureAgain = m_inFlight;
        QTimer::singleShot(0, this, [this] {
            if (m_target && m_image.isNull() && !m_inFlight && m_error.isEmpty()) requestCapture();
        });
        return;
    }
    if (!m_stale) {
        m_stale = true;
        emit stateChanged();
    }
}
void ReferenceController::setShownInPanel(bool shown) {
    if (m_shownInPanel == shown) return;
    m_shownInPanel = shown;
    emit shownChanged();
    syncFollowing();
    if (shown && !m_target && !m_ganged) matchPlayhead();
}
void ReferenceController::setShownInView(bool shown) {
    if (m_shownInView == shown) return;
    m_shownInView = shown;
    emit shownChanged();
    syncFollowing();
    if (shown && !m_target && !m_ganged) matchPlayhead();
}
// Only a ganged reference that something shows listens to the clock. A parked one has no
// connection at all, so playback does not call into this class.
void ReferenceController::syncFollowing() {
    const bool follow = m_ganged && m_clock && (m_shownInPanel || m_shownInView);
    if (follow == m_following) {
        if (follow) markDirty();
        return;
    }
    m_following = follow;
    if (follow) {
        connect(m_clock, &PlaybackClock::timeChanged, this, &ReferenceController::markDirty);
        connect(m_clock, &PlaybackClock::playingChanged, this, &ReferenceController::markDirty);
        markDirty();
    } else {
        m_timer.stop();
        if (m_clock) disconnect(m_clock, nullptr, this, nullptr);
    }
}
void ReferenceController::setGanged(bool ganged) {
    if (m_ganged == ganged) return;
    m_ganged = ganged;
    if (ganged) {
        m_stale = false;
        // Always a fresh capture: the frame showing may be a take at this same time.
        m_doneTime = -1;
    } else {
        // Parks on the frame it shows.
        m_timer.stop();
        m_dirty = false;
    }
    if (ganged && m_target) {
        m_target->description.clear();
        m_target->clipId.clear();
        m_target->takeId.clear();
    }
    emit stateChanged();
    emit takesChanged();
    syncFollowing();
}
void ReferenceController::markDirty() {
    if (!m_following || !m_clock) return;
    m_dirty = true;
    if (m_inFlight || m_timer.isActive()) return;
    m_timer.start(m_clock->playing() ? kPlayingIntervalMs : kPausedIntervalMs);
}
void ReferenceController::followPlayhead() {
    if (!m_following || !m_dirty || m_inFlight || !m_clock || !model()) return;
    m_dirty = false;
    const double rate = fps();
    const double end = model()->contentEndMs();
    double time = std::max(0.0, m_clock->currentTimeMs());
    if (rate > 0) time = std::clamp(frameFloor(time, rate), 0.0, std::max(0.0, frameCeil(end, rate) - 1)) * 1000 / rate;
    if (time == m_doneTime && m_documentSerial == m_doneSerial) return;
    if (!m_target) m_target = Target{};
    m_target->timeMs = time;
    requestCapture();
}
bool ReferenceController::hasContent() const {
    return model() && !model()->timeline().clips.empty();
}
double ReferenceController::fps() const {
    if (model() && model()->fps() > 0) return model()->fps();
    return m_clock ? m_clock->fps() : 0;
}
void ReferenceController::setTarget(Target target) {
    m_ganged = false;
    m_timer.stop();
    m_dirty = false;
    syncFollowing();
    m_target = std::move(target);
    emit stateChanged();
    emit takesChanged();
    requestCapture();
}
void ReferenceController::matchPlayhead() {
    parkAt(m_clock ? m_clock->currentTimeMs() : 0);
}
void ReferenceController::parkAt(double timeMs) {
    const auto* timeline = model();
    if (!timeline || !std::isfinite(timeMs)) return;
    const double rate = fps();
    const double end = timeline->contentEndMs();
    double time = std::max(0.0, timeMs);
    if (rate > 0) time = std::clamp(frameFloor(time, rate), 0.0, std::max(0.0, frameCeil(end, rate) - 1)) * 1000 / rate;
    else time = std::min(time, end);
    setTarget({time, {}, {}, {}});
}
void ReferenceController::stepFrames(int frames) {
    const auto* timeline = model();
    if (!timeline) return;
    const double rate = fps();
    if (rate <= 0) return;
    if (!m_target) {
        matchPlayhead();
        return;
    }
    double low = 0;
    double high = std::max(0.0, frameCeil(timeline->contentEndMs(), rate) - 1);
    if (!m_target->takeId.isEmpty()) {
        const auto* clip = timeline->findClip(m_target->clipId);
        if (clip) {
            low = frameCeil(clip->startMs, rate);
            high = std::max(low, frameCeil(clip->endMs(), rate) - 1);
        }
    }
    const double frame = std::clamp(frameFloor(m_target->timeMs, rate) + frames, low, high);
    auto next = *m_target;
    next.timeMs = frame * 1000 / rate;
    // A clip's first frame or a marker is that time only. A take stays the take.
    if (next.takeId.isEmpty()) next.description.clear();
    setTarget(std::move(next));
}
bool ReferenceController::useClipFrame(const QString& clipId, bool last) {
    const auto* timeline = model();
    const auto* clip = timeline ? timeline->findClip(clipId) : nullptr;
    if (!clip || clip->mediaType == nt::MediaType::Audio) return false;
    const double rate = fps();
    double time = clip->startMs;
    if (rate > 0) {
        const double first = frameCeil(clip->startMs, rate);
        const double final = frameCeil(clip->endMs(), rate) - 1;
        time = (last ? std::max(first, final) : first) * 1000 / rate;
    }
    const auto name = QString::fromStdString(clip->name.empty() ? clip->id : clip->name);
    setTarget({time, (last ? tr("Last frame of %1") : tr("First frame of %1")).arg(name), {}, {}});
    return true;
}
void ReferenceController::useMarker(double timeMs, const QString& label) {
    parkAt(timeMs);
    if (!m_target) return;
    m_target->description = label.isEmpty() ? tr("Marker") : tr("Marker: %1").arg(label);
    emit stateChanged();
}
bool ReferenceController::useTake(const QString& clipId, const QString& takeId) {
    const auto* timeline = model();
    const auto* clip = timeline ? timeline->findClip(clipId) : nullptr;
    if (!clip) return false;
    const auto versions = clip->raw.value("versions").toArray();
    QString id = takeId;
    if (id.isEmpty()) {
        // The take after the one showing, so the menu item walks through them.
        const auto available = takesOf(clip->raw);
        if (available.isEmpty()) return false;
        qsizetype next = 0;
        if (m_target && m_target->clipId == clipId) {
            for (qsizetype i = 0; i < available.size(); ++i) {
                if (available[i].toMap().value("value").toString() == m_target->takeId) next = (i + 1) % available.size();
            }
        }
        id = available[next].toMap().value("value").toString();
    }
    QString label;
    for (int i = 0; i < versions.size(); ++i) {
        if (versions[i].toObject().value("id").toString() == id) label = takeLabel(versions[i].toObject(), i);
    }
    if (label.isEmpty()) return false;
    const double rate = fps();
    const double playhead = m_clock ? m_clock->currentTimeMs() : -1;
    double time = clip->startMs;
    if (playhead >= clip->startMs && playhead < clip->endMs()) time = rate > 0 ? frameFloor(playhead, rate) * 1000 / rate : playhead;
    else if (rate > 0) time = frameCeil(clip->startMs, rate) * 1000 / rate;
    const auto name = QString::fromStdString(clip->name.empty() ? clip->id : clip->name);
    setTarget({time, tr("%1, %2").arg(label, name), clipId, id});
    return true;
}
void ReferenceController::refresh() {
    if (m_ganged) {
        m_doneTime = -1;
        markDirty();
    } else if (m_target) {
        requestCapture();
    } else {
        matchPlayhead();
    }
}
void ReferenceController::requestCapture() {
    if (!m_capture || !model() || !m_target) return;
    if (m_inFlight) {
        m_captureAgain = true;
        return;
    }
    if (!hasContent()) {
        m_stale = false;
        emit stateChanged();
        if (!m_image.isNull()) {
            m_image = {};
            m_imageTimeMs = -1;
            m_imageTakeId.clear();
            emit imageChanged();
        }
        return;
    }
    m_inFlight = true;
    m_stale = false;
    m_doneSerial = m_documentSerial;
    m_error.clear();
    emit stateChanged();
    ++m_captures;
    const Target target = *m_target;
    const quint64 run = ++m_run;
    if (!target.takeId.isEmpty()) {
        startTake(target);
        return;
    }
    m_requestId = m_capture->captureSequence(target.timeMs, [self = QPointer(this), run, target](const FrameCaptureResult& result) {
        if (self && run == self->m_run) self->captured(result, target);
    });
}
void ReferenceController::startTake(const Target& target) {
    const auto* clip = model()->findClip(target.clipId);
    if (!clip) {
        failed(tr("The clip with this take is no longer on the timeline."), target);
        return;
    }
    const auto projection = nt::ai::applyTake(clip->raw, target.takeId);
    if (!projection.error.isEmpty()) {
        failed(projection.error, target);
        return;
    }
    auto resolver = m_resolver ? m_resolver : serverResolver(m_protection);
    if (!resolver) {
        failed(tr("Open a timeline from the server to compare takes."), target);
        return;
    }
    const quint64 run = m_run;
    // native-rules #1: std::shared_ptr without a comment saying why unique ownership is impossible
    auto media = std::make_shared<nt::Clip>();
    // native-rules #13: worker is not interrupted or joined when the owner is destroyed
    auto* thread = QThread::create([resolver = std::move(resolver), media, assetId = projection.clip.value("currentAssetId").toString(), raw = projection.clip] {
        *media = resolver(assetId, raw);
    });
    connect(thread, &QThread::finished, thread, &QObject::deleteLater);
    // On this object's thread, and not at all once it is gone.
    connect(thread, &QThread::finished, this, [this, run, target, media] {
        if (run != m_run) return;
        const auto* current = model() ? model()->findClip(target.clipId) : nullptr;
        const auto projected = current ? nt::ai::applyTake(current->raw, target.takeId) : nt::ai::TakeResult{};
        if (!current || !projected.error.isEmpty()) {
            failed(current ? projected.error : tr("The clip with this take is no longer on the timeline."), target);
            return;
        }
        const auto& picture = media->originalMediaPath.empty() ? media->mediaPath : media->originalMediaPath;
        if (picture.empty()) {
            failed(tr("This take's media could not be loaded. Check the connection to the server and refresh."), target);
            return;
        }
        auto document = nt::exporting::exportSnapshot(*model());
        auto clips = document.value("clips").toArray();
        for (qsizetype i = 0; i < clips.size(); ++i) {
            if (clips[i].toObject().value("id").toString() != target.clipId) continue;
            auto json = projected.clip;
            json.insert("mediaPath", QString::fromStdString(picture));
            json.insert("originalMediaPath", QString::fromStdString(picture));
            if (media->audioPath.empty()) json.remove("audioPath");
            else json.insert("audioPath", QString::fromStdString(media->audioPath));
            clips.replace(i, json);
        }
        document.insert("clips", clips);
        m_requestId = m_capture->captureDocument(document, target.timeMs, [self = QPointer(this), run, target](const FrameCaptureResult& result) {
            if (self && run == self->m_run) self->captured(result, target);
        });
    });
    thread->start();
}
void ReferenceController::captured(const FrameCaptureResult& result, const Target& target) {
    m_requestId = 0;
    if (result.cancelled) {
        finishFlight();
        return;
    }
    if (!result.ok()) {
        failed(result.error, target);
        return;
    }
    // A take's frame must not appear under a later choice of something else.
    if (m_target && m_target->takeId == target.takeId) {
        m_image = result.image;
        m_imageTimeMs = target.timeMs;
        m_imageTakeId = target.takeId;
        m_doneTime = target.timeMs;
        emit imageChanged();
    }
    finishFlight();
}
void ReferenceController::failed(const QString& error, const Target& target) {
    m_requestId = 0;
    // A frame that says a different time from the picture is worse than no picture.
    if (!m_image.isNull() && (m_imageTimeMs != target.timeMs || m_imageTakeId != target.takeId)) {
        m_image = {};
        m_imageTimeMs = -1;
        m_imageTakeId.clear();
        emit imageChanged();
    }
    // A failed capture is not repeated until something changes.
    m_doneTime = target.timeMs;
    m_error = error;
    finishFlight();
}
void ReferenceController::finishFlight() {
    m_inFlight = false;
    emit stateChanged();
    if (m_captureAgain) {
        m_captureAgain = false;
        requestCapture();
    } else if (m_dirty && m_following && m_clock) {
        m_timer.start(m_clock->playing() ? kPlayingIntervalMs : kPausedIntervalMs);
    }
}
QString ReferenceController::takeClipId() const {
    return !m_takeClipId.isEmpty() ? m_takeClipId : m_target ? m_target->clipId : QString();
}
void ReferenceController::setTakeClipId(const QString& clipId) {
    if (m_takeClipId == clipId) return;
    m_takeClipId = clipId;
    emit takesChanged();
}
QVariantList ReferenceController::takes() const {
    const auto id = takeClipId();
    const auto* clip = model() && !id.isEmpty() ? model()->findClip(id) : nullptr;
    return clip ? takesOf(clip->raw) : QVariantList{};
}
QVariantList ReferenceController::takesOf(const QJsonObject& clip) {
    QVariantList out;
    const auto active = clip.value("activeTakeId").toString();
    const auto asset = clip.value("currentAssetId").toString();
    const auto versions = clip.value("versions").toArray();
    for (int i = 0; i < versions.size(); ++i) {
        const auto take = versions[i].toObject();
        const auto id = take.value("id").toString();
        if (id == active || take.value("assetId").toString() == asset) continue;
        if (!nt::ai::applyTake(clip, id).error.isEmpty()) continue;
        out.append(QVariantMap{{"value", id}, {"label", takeLabel(take, i)}});
    }
    return out;
}
