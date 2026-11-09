// Behaviour ported from FilmCraft (https://github.com/storytold/filmcraft), crates/ui-egui/src/panels/multicam.rs, MIT.
// See licenses/FilmCraft-MIT.txt.
#include "takes/TakeGrid.h"

#include "edit/ClipGestureController.h"
#include "edit/targeting/TrackTargeting.h"
#include "export/FrameCapture.h"
#include "model/TimelineModel.h"
#include "playback/PlaybackClock.h"

#include <QDebug>
#include <algorithm>

using namespace nt::takes;

namespace {
// Stills wait for the playhead to rest. While playing, one round of frames at a
// time, no more than this often, so the helper never competes with playback.
constexpr int SETTLE_MS = 80;
constexpr int PLAYING_ROUND_MS = 1000;
// With no clip here, how often a playing clock looks for one.
constexpr int SEARCH_MS = 250;
constexpr int FRAME_WIDTH = 640;
}

TakeGrid::TakeGrid(QObject* parent) : QObject(parent) {
    m_settle.setSingleShot(true);
    m_settle.setInterval(SETTLE_MS);
    connect(&m_settle, &QTimer::timeout, this, &TakeGrid::startRound);
    connect(&nt::targeting::TrackTargeting::current(), &nt::targeting::TrackTargeting::changed, this, &TakeGrid::refresh);
    m_sinceSearch.start();
}

TakeGrid::~TakeGrid() {
    cancelRound();
    if (m_switcher) { m_switcher->gridClosed(); }
}

void TakeGrid::setGestures(ClipGestureController* gestures) {
    if (m_gestures == gestures) { return; }
    if (m_gestures) { disconnect(m_gestures, nullptr, this, nullptr); }
    if (m_switcher) {
        disconnect(m_switcher, nullptr, this, nullptr);
        disconnect(m_switcher->parent(), nullptr, this, nullptr);
        m_switcher->gridClosed();
    }
    m_gestures = gestures;
    m_switcher = gestures ? TakeSwitcher::forTimeline(gestures->timeline()) : nullptr;
    if (m_gestures && m_switcher) {
        m_switcher->gridOpened();
        connect(m_gestures, &ClipGestureController::selectionChanged, this, &TakeGrid::refresh);
        connect(gestures->timeline(), &TimelineModel::clipsChanged, this, &TakeGrid::refresh);
        connect(m_switcher, &TakeSwitcher::mediaResolved, this, [this] { scheduleFrames(); });
        if (auto* clock = gestures->clock()) {
            connect(clock, &PlaybackClock::timeChanged, this, &TakeGrid::timeMoved);
            connect(clock, &PlaybackClock::playingChanged, this, &TakeGrid::scheduleFrames);
        }
    }
    emit gesturesChanged();
    refresh();
}

void TakeGrid::setCapture(FrameCapture* capture) {
    if (m_capture == capture) { return; }
    cancelRound();
    m_capture = capture;
    emit captureChanged();
    scheduleFrames();
}

int TakeGrid::pageCount() const {
    return std::max(1, static_cast<int>((m_takeIds.size() + TakeSwitcher::PAGE_SIZE - 1) / TakeSwitcher::PAGE_SIZE));
}

double TakeGrid::playheadMs() const {
    auto* clock = m_gestures ? m_gestures->clock() : nullptr;
    return clock ? clock->currentTimeMs() : 0.0;
}

void TakeGrid::refresh() {
    QString id;
    QJsonObject clip;
    if (m_gestures && m_switcher && m_gestures->timeline()) {
        const auto doc = m_gestures->editDoc();
        const auto at = m_switcher->lookup(*m_gestures, playheadMs());
        id = switchTargets(doc, at).value(0);
        for (const auto& candidate : doc.clips) {
            if (nt::edit::clipId(candidate) == id) { clip = candidate; break; }
        }
        m_selectedClip = at.selection.contains(id);
    }
    m_sinceSearch.restart();
    m_rangeStartMs = nt::edit::clipStartMs(clip);
    m_rangeEndMs = nt::edit::clipEndMs(clip);
    const bool clipChanged = id != m_clipId || clip != m_clip;
    m_clipId = id;
    m_clip = clip;
    QStringList ids;
    for (const auto& take : selectableTakes(clip)) { ids.append(take.value(u"id").toString()); }
    // A cut gives the part after it a new id, and the same takes stay on the same page.
    const bool sameTakes = ids == m_takeIds;
    m_takeIds = ids;
    if (m_switcher && !sameTakes) { m_switcher->setPage(0); }
    if (!clip.isEmpty() && m_switcher) { m_switcher->ensureMedia(clip); }
    if (clipChanged || !sameTakes) { showPage(page()); }
}

void TakeGrid::showPage(int value) {
    if (m_switcher) { m_switcher->setPage(std::clamp(value, 0, pageCount() - 1)); }
    const auto takes = selectableTakes(m_clip);
    const int active = activeTakeIndex(m_clip);
    const bool audio = m_clip.value(u"mediaType").toString() == u"audio";
    QVariantList cells;
    const int first = page() * TakeSwitcher::PAGE_SIZE;
    for (int i = first; i < std::min<int>(first + TakeSwitcher::PAGE_SIZE, takes.size()); ++i) {
        cells.append(QVariantMap{{QStringLiteral("key"), i - first + 1}, {QStringLiteral("number"), i + 1},
                                 {QStringLiteral("id"), takes[i].value(u"id").toString()},
                                 {QStringLiteral("name"), takeName(takes[i], i + 1)},
                                 {QStringLiteral("active"), i == active}, {QStringLiteral("audio"), audio}});
    }
    if (cells != m_takes) {
        m_takes = cells;
        emit takesChanged();
    }
    // Frames of takes this clip no longer has are never asked for again.
    for (auto it = m_frames.begin(); it != m_frames.end();) {
        it = m_takeIds.contains(it.key()) ? std::next(it) : m_frames.erase(it);
    }
    emit changed();
    scheduleFrames();
}

void TakeGrid::timeMoved() {
    auto* clock = m_gestures ? m_gestures->clock() : nullptr;
    if (!clock) { return; }
    const double timeMs = clock->time();
    const bool playing = clock->playing();
    if (m_clipId.isEmpty()) {
        // Nothing to compare the time with. Search at a low rate while playing.
        if (!playing || m_sinceSearch.elapsed() >= SEARCH_MS) { refresh(); }
        return;
    }
    if (!m_selectedClip && (timeMs < m_rangeStartMs || timeMs >= m_rangeEndMs)) {
        refresh();
        return;
    }
    scheduleFrames();
}

void TakeGrid::scheduleFrames() {
    auto* clock = m_gestures ? m_gestures->clock() : nullptr;
    if (clock && clock->playing()) {
        m_settle.stop();
        if (m_requests.isEmpty() && (!m_sinceRound.isValid() || m_sinceRound.elapsed() >= PLAYING_ROUND_MS)) { startRound(); }
        return;
    }
    m_settle.start();
}

void TakeGrid::cancelRound() {
    ++m_round;
    if (m_capture) {
        for (const int id : std::as_const(m_requests)) { m_capture->cancel(id); }
    }
    m_requests.clear();
}

void TakeGrid::startRound() {
    cancelRound();
    if (!m_capture || !m_switcher || m_clip.isEmpty()) { return; }
    m_sinceRound.restart();
    const double timeMs = playheadMs();
    const int round = m_round;
    const QPointer<TakeGrid> self(this);
    const auto takes = selectableTakes(m_clip);
    const int first = page() * TakeSwitcher::PAGE_SIZE;
    for (int i = first; i < std::min<int>(first + TakeSwitcher::PAGE_SIZE, takes.size()); ++i) {
        if (m_clip.value(u"mediaType").toString() == u"audio") { break; }
        const auto takeId = takes[i].value(u"id").toString();
        const auto path = m_switcher->mediaPath(takes[i].value(u"assetId").toString(), false);
        if (path.isEmpty()) { continue; }
        // native-rules #1: std::shared_ptr without a comment saying why unique ownership is impossible
        auto requestId = std::make_shared<int>(0);
        *requestId = m_capture->captureSource(path, takeSourceMs(m_clip, takeId, timeMs),
            [self, round, takeId, requestId](const FrameCaptureResult& result) {
                if (!self || self->m_round != round) { return; }
                self->m_requests.removeOne(*requestId);
                if (!result.ok()) {
                    if (!result.cancelled) { qWarning().noquote() << "Take frame failed:" << result.error; }
                    return;
                }
                self->m_frames.insert(takeId, result.image.width() > FRAME_WIDTH
                    ? result.image.scaledToWidth(FRAME_WIDTH, Qt::SmoothTransformation) : result.image);
                ++self->m_framesRevision;
                emit self->framesChanged();
            });
        m_requests.append(*requestId);
    }
}

void TakeGrid::choose(int number, bool cut) {
    if (m_gestures && m_switcher) { m_switcher->press(*m_gestures, number, cut, false); }
}

void TakeGrid::toggleRecording() {
    if (m_gestures && m_switcher) { m_switcher->toggleRecording(*m_gestures); }
}

void TakeGrid::nextPage() { showPage(page() + 1); }
void TakeGrid::previousPage() { showPage(page() - 1); }
