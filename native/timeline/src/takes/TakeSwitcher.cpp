// Behaviour ported from FilmCraft (https://github.com/storytold/filmcraft), crates/engine/src/multicam.rs, MIT.
// See licenses/FilmCraft-MIT.txt.
#include "takes/TakeSwitcher.h"

#include "assets/AssetMedia.h"
#include "edit/ClipGestureController.h"
#include "edit/EditActions.h"
#include "edit/targeting/TargetingEdits.h"
#include "edit/targeting/TrackTargeting.h"
#include "model/TimelineModel.h"
#include "playback/PlaybackClock.h"
#include "server/ServerClient.h"
#include "server/ServerSource.h"

#include <QDir>
#include <QJsonArray>
#include <QUndoStack>
#include <algorithm>

using namespace nt::takes;

namespace {
constexpr int MESSAGE_MS = 6000;

QJsonArray toArray(const nt::edit::ClipList& clips) {
    QJsonArray array;
    for (const auto& clip : clips) { array.append(clip); }
    return array;
}
const QJsonObject* findClip(const nt::edit::ClipList& clips, const QString& id) {
    const auto it = std::ranges::find_if(clips, [&](const QJsonObject& clip) { return nt::edit::clipId(clip) == id; });
    return it == clips.end() ? nullptr : &*it;
}
// A frame edge, so a cut made during playback lands where a frame starts.
double frameEdge(double timeMs, double fps) { return nt::edit::frameStepMs(timeMs, 0, fps); }

// Fetches a take's file through the server the editor is connected to.
nt::Clip resolveFromServer(const QJsonObject& rawClip, const QString& assetId,
                           const std::shared_ptr<nt::assets::MediaProtection>& protection) {
    const auto target = nt::server::serverSaveTarget();
    if (!target) { return {}; }
    nt::server::ServerClient client(target->server, target->token, 10000);
    client.setExpectedInstance(target->expectedInstance);
    const auto asset = client.getAsset(assetId);
    if (!asset.ok()) { return {}; }
    const auto cacheRoot = QDir::cleanPath(QDir(target->backupDir).absoluteFilePath("../../.."));
    return nt::assets::resolveDroppedMedia(client, cacheRoot, asset.data.toObject(), rawClip, *protection, protection->generation());
}
}

TakeSwitcher::TakeSwitcher(TimelineModel* model) : QObject(model), m_model(model) {
    setObjectName(QStringLiteral("takeSwitcher"));
    m_messageTimer.setSingleShot(true);
    m_messageTimer.setInterval(MESSAGE_MS);
    connect(&m_messageTimer, &QTimer::timeout, this, [this] { setMessage({}); });
    auto protection = std::make_shared<nt::assets::MediaProtection>();
    m_resolver = [protection](const QJsonObject& rawClip, const QString& assetId) {
        return resolveFromServer(rawClip, assetId, protection);
    };
}

TakeSwitcher::~TakeSwitcher() {
    if (m_worker) {
        m_worker->requestInterruption();
        m_worker->wait();
        delete m_worker;
    }
}

TakeSwitcher* TakeSwitcher::forTimeline(TimelineModel* model) {
    if (!model) { return nullptr; }
    auto* existing = model->findChild<TakeSwitcher*>(QStringLiteral("takeSwitcher"), Qt::FindDirectChildrenOnly);
    return existing ? existing : new TakeSwitcher(model);
}

void TakeSwitcher::setMessage(const QString& message) {
    if (message.isEmpty()) { m_messageTimer.stop(); } else { m_messageTimer.start(); }
    if (m_message == message) { return; }
    m_message = message;
    emit messageChanged();
}

Lookup TakeSwitcher::lookup(const ClipGestureController& gestures, double timeMs) const {
    Lookup result;
    result.selection = gestures.selection();
    result.timeMs = frameEdge(timeMs, m_model->fps());
    const auto doc = gestures.editDoc();
    result.targetedTracks = nt::targeting::targetedTrackIds(doc, nt::targeting::TrackTargeting::current().state());
    std::vector<nt::Track> tracks = m_model->timeline().tracks;
    std::ranges::stable_sort(tracks, [](const nt::Track& a, const nt::Track& b) { return a.index < b.index; });
    for (const auto& track : tracks) { result.tracksTopDown.append(QString::fromStdString(track.id)); }
    return result;
}

bool TakeSwitcher::press(ClipGestureController& gestures, int number, bool cut, bool autoRepeat) {
    // A held key is one press, or a pass would cut on every repeat.
    if (autoRepeat) { return true; }
    // A press asks again for media that failed before.
    m_failed.clear();
    const int index = number - 1 + (m_openGrids > 0 ? m_page * PAGE_SIZE : 0);
    auto* clock = gestures.clock();
    const double timeMs = clock ? clock->currentTimeMs() : 0.0;
    if (m_recording && clock && clock->playing()) { return cutClip(gestures, index, timeMs, true); }
    return cut ? cutClip(gestures, index, timeMs, false) : switchClips(gestures, index, timeMs);
}

bool TakeSwitcher::switchClips(ClipGestureController& gestures, int index, double timeMs) {
    auto doc = gestures.editDoc();
    const auto targets = switchTargets(doc, lookup(gestures, timeMs));
    if (targets.isEmpty()) {
        setMessage(QStringLiteral("No clip with takes here. Select one, or move the playhead over one."));
        return true;
    }
    const auto before = m_model->clipsJson();
    QString refused;
    int switched = 0;
    for (const auto& id : targets) {
        const auto edit = switchTake(doc, id, index);
        if (!edit.error.isEmpty()) {
            if (refused.isEmpty()) { refused = edit.error; }
            continue;
        }
        if (edit.changed) {
            doc.clips = edit.clips;
            ++switched;
        }
        if (const auto* clip = findClip(doc.clips, id)) { ensureMedia(*clip); }
    }
    if (switched > 0) { m_model->commitEdit(QStringLiteral("Switch take"), before, toArray(doc.clips)); }
    const bool partial = switched > 0 && !refused.isEmpty();
    setMessage(partial ? QStringLiteral("Switched %1 of %2 clips. %3").arg(switched).arg(targets.size()).arg(refused) : refused);
    return true;
}

bool TakeSwitcher::cutClip(ClipGestureController& gestures, int index, double timeMs, bool live) {
    const auto doc = gestures.editDoc();
    const auto at = lookup(gestures, timeMs);
    const auto id = cutTarget(doc, at);
    if (id.isEmpty()) {
        setMessage(QStringLiteral("No clip with takes at the playhead."));
        return true;
    }
    const auto edit = cutToTake(doc, id, at.timeMs, index, !live);
    setMessage(edit.error);
    if (!edit.error.isEmpty() || !edit.changed) { return true; }
    const auto before = m_model->clipsJson();
    const auto after = toArray(edit.clips);
    if (live) {
        commitPass(before, after);
    } else {
        m_model->commitEdit(QStringLiteral("Cut to take"), before, after);
    }
    if (const auto* clip = findClip(edit.clips, edit.resultId)) { ensureMedia(*clip); }
    // The next press applies to the part that is playing, not to the part before it.
    if (at.selection.contains(id) && edit.resultId != id) {
        auto selection = at.selection;
        selection[selection.indexOf(id)] = edit.resultId;
        gestures.setSelection(selection);
    }
    return true;
}

// One undo entry per pass. The pass amends its own command, so an autosave
// between two cuts, which moves the undo stack's clean mark, cannot split it.
void TakeSwitcher::commitPass(const QJsonArray& before, const QJsonArray& after) {
    auto* stack = m_model->undoStack();
    if (m_passToken != 0 && stack->index() == stack->count()) {
        auto document = m_model->timeline().raw;
        document.insert(QStringLiteral("clips"), after);
        if (m_model->settleCommand(m_passToken, document)) { return; }
    }
    m_passToken = m_model->commitEdit(QStringLiteral("Record takes"), before, after);
}

void TakeSwitcher::endPass() { m_passToken = 0; }

void TakeSwitcher::toggleRecording(ClipGestureController& gestures) {
    m_recording = !m_recording;
    endPass();
    if (m_clock) { disconnect(m_clock, nullptr, this, nullptr); }
    m_clock = m_recording ? gestures.clock() : nullptr;
    if (m_clock) {
        connect(m_clock, &PlaybackClock::playingChanged, this, [this] {
            if (m_clock && !m_clock->playing()) { endPass(); }
        });
        const auto doc = gestures.editDoc();
        const auto id = cutTarget(doc, lookup(gestures, m_clock->currentTimeMs()));
        if (const auto* clip = findClip(doc.clips, id)) { ensureMedia(*clip); }
    }
    emit recordingChanged();
}

void TakeSwitcher::setPage(int page) { m_page = std::max(0, page); }

void TakeSwitcher::gridClosed() {
    m_openGrids = std::max(0, m_openGrids - 1);
    if (m_openGrids == 0) { m_page = 0; }
}

void TakeSwitcher::ensureMedia(const QJsonObject& clip) {
    for (const auto& take : selectableTakes(clip)) {
        const auto assetId = take.value(u"assetId").toString();
        const bool audio = clip.value(u"mediaType").toString() == u"audio";
        if (m_failed.contains(assetId) || assetId == m_resolving || !mediaPath(assetId, audio).isEmpty() ||
            std::ranges::any_of(m_mediaQueue, [&](const MediaRequest& request) { return request.assetId == assetId; })) {
            continue;
        }
        auto raw = clip;
        raw.insert(QStringLiteral("currentAssetId"), assetId);
        m_mediaQueue.append({assetId, raw});
    }
    resolveNext();
}

void TakeSwitcher::resolveNext() {
    if (m_worker || m_mediaQueue.isEmpty()) { return; }
    const auto request = m_mediaQueue.takeFirst();
    m_resolving = request.assetId;
    const auto resolver = m_resolver;
    const QPointer<TakeSwitcher> self(this);
    auto* thread = QThread::create([self, resolver, request] {
        const auto media = resolver(request.rawClip, request.assetId);
        if (!self) { return; }
        QMetaObject::invokeMethod(self, [self, request, media] {
            if (!self) { return; }
            self->m_resolving.clear();
            if (media.mediaPath.empty() && media.audioPath.empty()) {
                self->m_failed.insert(request.assetId);
                const auto clips = self->m_model->clipsJson();
                for (const auto& value : clips) {
                    if (value.toObject().value(u"currentAssetId").toString() == request.assetId) {
                        self->setMessage(QStringLiteral("The take's media could not be loaded. Check the server connection."));
                        break;
                    }
                }
                return;
            }
            self->m_resolved.insert(request.assetId, media);
            self->m_model->registerMedia(media);
            emit self->mediaResolved(request.assetId);
        }, Qt::QueuedConnection);
    });
    m_worker = thread;
    connect(thread, &QThread::finished, this, [this, thread] {
        if (m_worker == thread) { m_worker = nullptr; }
        thread->deleteLater();
        resolveNext();
    });
    thread->start();
}

QString TakeSwitcher::mediaPath(const QString& assetId, bool audio) const {
    const auto pick = [audio](const nt::Clip& clip) {
        return QString::fromStdString(audio ? clip.audioPath : clip.mediaPath);
    };
    if (const auto it = m_resolved.constFind(assetId); it != m_resolved.constEnd()) { return pick(*it); }
    for (const auto& clip : m_model->timeline().clips) {
        if (clip.raw.value(u"currentAssetId").toString() == assetId && !pick(clip).isEmpty()) { return pick(clip); }
    }
    return {};
}

TakeSwitcher* TakeInfo::switcherFor(TimelineModel* timeline) const { return TakeSwitcher::forTimeline(timeline); }

QString TakeInfo::badge(const QVariantMap& clip) const {
    if (clip.value(QStringLiteral("versions")).toList().size() < 2) { return {}; }
    return takeBadge(QJsonObject::fromVariantMap(clip));
}
