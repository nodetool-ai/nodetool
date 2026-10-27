#include "edit/ClipGestureController.h"

#include "app/EditRegistry.h"
#include "wiring/KeyActions.h"
#include "wiring/SnapProviders.h"
#include "wiring/SourceDurations.h"
#include <QJsonDocument>
#include "edit/Keymap.h"
#include "edit/targeting/TargetingEdits.h"
#include "edit/groups/GroupOps.h"
#include "ui/MediaVersion.h"
#include "preview/FfmpegSource.h"
#include "ui/TimelineWheel.h"

#include <QCoreApplication>
#include <QThreadPool>

#include <QJsonObject>
#include <QSet>
#include <QMouseEvent>
#include <QQuickWindow>

#include <algorithm>
#include <cmath>

using namespace nt::edit;

namespace {

// clipSnap.ts
constexpr double SNAP_THRESHOLD_PX = 8;
constexpr double TICK_INTERVAL_MS = 1000;
// Merge key of a held nudge key's commands.
constexpr int NUDGE_MERGE_ID = 1;

struct WindowSnap {
    double startMs;
    double guideMs;  // -1: no snap
};

// clipSnap.ts snapClipWindow: try both edges, keep the closer hit.
WindowSnap snapClipWindow(double startMs, double durationMs, const std::vector<double>& candidates, double msPerPx) {
    const SnapResolution start = resolveSnap(startMs, candidates, SNAP_THRESHOLD_PX, msPerPx);
    const SnapResolution end = resolveSnap(startMs + durationMs, candidates, SNAP_THRESHOLD_PX, msPerPx);
    if (start.snapped && (!end.snapped || start.distanceMs <= end.distanceMs)) return {start.value, start.value};
    if (end.snapped) return {end.value - durationMs, end.value};
    return {startMs, -1};
}

QJsonArray toArray(const ClipList& clips) {
    QJsonArray out;
    for (const auto& c : clips) out.append(c);
    return out;
}

const QJsonObject* findClip(const ClipList& clips, const QString& id) {
    for (const auto& c : clips) {
        if (clipId(c) == id) return &c;
    }
    return nullptr;
}

// A Qt key event in the DOM terms the keymap reads (`e.key`, `e.code`).
KeyEventLike domKey(int key, const QString& text, int modifiers) {
    KeyEventLike e;
    // On macOS Qt reports Cmd as Control and Ctrl as Meta; the keymap treats
    // both as Ctrl.
    e.ctrlKey = (modifiers & Qt::MetaModifier) != 0;
    e.metaKey = (modifiers & Qt::ControlModifier) != 0;
    e.shiftKey = (modifiers & Qt::ShiftModifier) != 0;
    e.altKey = (modifiers & Qt::AltModifier) != 0;
    if (key >= Qt::Key_A && key <= Qt::Key_Z) {
        const QChar c(u'a' + (key - Qt::Key_A));
        e.key = e.shiftKey ? QString(c.toUpper()) : QString(c);
        e.code = QStringLiteral("Key") + QString(c.toUpper());
        return e;
    }
    if (key >= Qt::Key_0 && key <= Qt::Key_9) {
        e.key = text.isEmpty() ? QString(QChar(u'0' + (key - Qt::Key_0))) : text;
        e.code = QStringLiteral("Digit") + QString(QChar(u'0' + (key - Qt::Key_0)));
        return e;
    }
    switch (key) {
    case Qt::Key_Delete: e.key = QStringLiteral("Delete"); return e;
    case Qt::Key_Backspace: e.key = QStringLiteral("Backspace"); return e;
    case Qt::Key_Left: e.key = QStringLiteral("ArrowLeft"); return e;
    case Qt::Key_Right: e.key = QStringLiteral("ArrowRight"); return e;
    case Qt::Key_Up: e.key = QStringLiteral("ArrowUp"); return e;
    case Qt::Key_Down: e.key = QStringLiteral("ArrowDown"); return e;
    case Qt::Key_Escape: e.key = QStringLiteral("Escape"); return e;
    case Qt::Key_Home: e.key = QStringLiteral("Home"); return e;
    case Qt::Key_End: e.key = QStringLiteral("End"); return e;
    case Qt::Key_Space: e.key = QStringLiteral(" "); return e;
    default: break;
    }
    static const QHash<int, QString> symbolCodes{
        {Qt::Key_Comma, QStringLiteral("Comma")},          {Qt::Key_Period, QStringLiteral("Period")},
        {Qt::Key_Apostrophe, QStringLiteral("Quote")},     {Qt::Key_BracketLeft, QStringLiteral("BracketLeft")},
        {Qt::Key_BracketRight, QStringLiteral("BracketRight")}, {Qt::Key_Semicolon, QStringLiteral("Semicolon")},
        {Qt::Key_Backslash, QStringLiteral("Backslash")}, {Qt::Key_Equal, QStringLiteral("Equal")},
        {Qt::Key_Minus, QStringLiteral("Minus")},          {Qt::Key_QuoteLeft, QStringLiteral("Backquote")},
    };
    e.code = symbolCodes.value(key);
    e.key = text;
    return e;
}

}  // namespace

ClipGestureController::ClipGestureController(QQuickItem* parent) : QQuickItem(parent) {
    setAcceptedMouseButtons(Qt::LeftButton);
}

void ClipGestureController::setTimeline(TimelineModel* m) {
    if (m == m_timeline) return;
    if (m_timeline) disconnect(m_timeline, nullptr, this, nullptr);
    m_timeline = m;
    m_clipData.clear();
    m_clipDataRevision = 0;
    if (m_timeline) {
        // A new document ends a gesture on the old one, with no write.
        connect(m_timeline, &TimelineModel::documentReplaced, this, [this]() {
            dropGesture();
            m_observedEnds.clear();
            // A new document probes its files again: one replaced in place
            // has a new length. Results still in flight are dropped.
            m_sourceMs.clear();
            m_probing.clear();
            ++m_probeGeneration;
        });
        connect(m_timeline, &TimelineModel::timelineChanged, this, &ClipGestureController::probeSources);
        // A clip the document lost leaves the selection.
        connect(m_timeline, &TimelineModel::clipsChanged, this, [this]() {
            if (m_selection.isEmpty()) return;
            QSet<QString> ids;
            for (const QJsonValue& v : m_timeline->clipsJson()) ids.insert(v.toObject().value(u"id").toString());
            QStringList live;
            for (const QString& id : m_selection) {
                if (ids.contains(id)) live.append(id);
            }
            if (live != m_selection) setSelection(live);
        });
    }
    probeSources();
    emit changed();
}
void ClipGestureController::setViewState(TimelineViewState* v) {
    if (m_view == v) { return; }
    if (m_view) { disconnect(m_view, nullptr, this, nullptr); }
    m_view = v;
    if (m_view) {
        connect(m_view, &TimelineViewState::rangeChanged, this, &ClipGestureController::syncPlaybackRange);
    }
    syncPlaybackRange();
    emit changed();
}
void ClipGestureController::setRows(TrackWindowModel* r) {
    m_rows = r;
    emit changed();
}
void ClipGestureController::setClock(PlaybackClock* c) {
    m_clock = c;
    syncPlaybackRange();
    emit changed();
}
void ClipGestureController::syncPlaybackRange() {
    if (!m_clock || !m_view) { return; }
    m_clock->clearRange();
    m_clock->setRangeIn(m_view->rangeInMs());
    m_clock->setRangeOut(m_view->rangeOutMs());
}
void ClipGestureController::setLanesViewport(QQuickItem* v) {
    m_viewport = v;
    emit changed();
}
void ClipGestureController::setSelection(const QStringList& ids) {
    if (ids == m_selection && m_selectedGap.isEmpty()) return;
    m_selectedGap.clear();
    m_selection = ids;
    emit selectionChanged();
}
void ClipGestureController::setRippleMode(bool on) {
    if (on == m_rippleMode) return;
    m_rippleMode = on;
    emit optionsChanged();
}
void ClipGestureController::setSnapEnabled(bool on) {
    if (on == m_snapEnabled) return;
    m_snapEnabled = on;
    emit optionsChanged();
}
void ClipGestureController::setLinkedSelection(bool on) {
    if (on == m_linked) return;
    m_linked = on;
    emit optionsChanged();
}
void ClipGestureController::setDropMode(const QString& mode) {
    if (mode == m_dropMode) return;
    m_dropMode = mode;
    emit optionsChanged();
}
void ClipGestureController::setActiveTool(const QString& tool) {
    if (tool == m_tool) return;
    m_tool = tool;
    emit optionsChanged();
}
void ClipGestureController::setKeyboardPreset(const QString& preset) {
    if (preset == m_preset) return;
    m_preset = preset;
    emit optionsChanged();
}

QString ClipGestureController::trimModeFor(const QString& tool, bool rollModifier, bool rippleMode) {
    if (tool == u"rateStretch") return QStringLiteral("stretch");
    if (tool == u"roll" || rollModifier) return QStringLiteral("roll");
    if (tool == u"ripple" || rippleMode) return QStringLiteral("ripple");
    return QStringLiteral("trim");
}

EditDoc ClipGestureController::editDoc() const {
    EditDoc doc;
    if (!m_timeline) return doc;
    for (const QJsonValue& v : m_timeline->clipsJson()) doc.clips.push_back(v.toObject());
    for (const QJsonValue& v : m_timeline->timeline().raw.value(u"tracks").toArray()) {
        const QJsonObject t = v.toObject();
        doc.tracks.push_back({t.value(u"id").toString(), t.value(u"type").toString(), t.value(u"locked").toBool()});
    }
    for (const QJsonValue& v : m_timeline->timeline().raw.value(u"mediaTracks").toArray()) {
        const QString owner = v.toObject().value(u"clipId").toString();
        if (!owner.isEmpty()) doc.clipsWithMediaTracks.insert(owner);
    }
    return doc;
}

ClipList ClipGestureController::resolveEdit(const QString& name, QJsonObject payload,
                                             const std::function<ClipList()>& fallback,
                                             std::optional<double> maxSourceDurationMs) const {
    const auto edit = nt::app::findEdit(name);
    if (!edit) {
        return fallback();
    }
    // Gestures own preview and undo. Registered edits see the live clips,
    // including previews that have not been committed to the raw document.
    QJsonObject raw = m_timeline->timeline().raw;
    raw.insert("clips", m_timeline->clipsJson());
    payload.insert("linked", m_linked);
    const auto targeting = targetingPayload();
    for (auto it = targeting.begin(); it != targeting.end(); ++it) { payload.insert(it.key(), it.value()); }
    if (maxSourceDurationMs) {
        payload.insert("maxSourceDurationMs", *maxSourceDurationMs);
    }
    ClipList result;
    for (const auto& clip : edit(std::move(raw), payload).value("clips").toArray()) {
        result.push_back(clip.toObject());
    }
    return result;
}

void ClipGestureController::setDoc(const ClipList& clips) {
    if (m_timeline && m_timeline->replaceClips(toArray(clips))) {
        ++m_liveUpdates;
        emit gestureChanged();
    }
}

double ClipGestureController::playheadMs() const {
    return m_clock ? m_clock->time() : 0.0;
}

void ClipGestureController::setSnapGuide(double ms) {
    if (ms == m_snapGuideMs) return;
    m_snapGuideMs = ms;
    emit snapGuideChanged();
}

std::vector<double> ClipGestureController::collectSnapCandidates(const IdSet& excludeClipIds) const {
    // clipSnap.ts collectSnapCandidates: the excluded clips with their link
    // groups (groups are not modelled natively), the playhead, the 1 s ticks.
    if (!m_snapEnabled) { return {}; }
    const EditDoc doc = editDoc();
    IdSet exclude = excludeClipIds;
    IdSet links;
    for (const auto& c : doc.clips) {
        if (exclude.count(clipId(c)) && !clipLinkId(c).isEmpty()) links.insert(clipLinkId(c));
    }
    for (const auto& c : doc.clips) {
        if (!clipLinkId(c).isEmpty() && links.count(clipLinkId(c))) exclude.insert(clipId(c));
    }
    SnapPointSource source;
    source.clips = &doc.clips;
    source.excludeClipIds = exclude;
    source.playheadMs = playheadMs();
    source.tickIntervalMs = TICK_INTERVAL_MS;
    source.maxTimeMs = (m_timeline ? m_timeline->durationMs() : 0.0) + TICK_INTERVAL_MS;
    auto candidates = buildSnapPoints(source);
    nt::wiring::SnapRequest request;
    if (m_timeline) { request.document = QJsonDocument::fromJson(m_timeline->documentJson()).object(); }
    request.fromMs = m_view ? m_view->clipWindowStartMs() : 0;
    request.toMs = m_view ? m_view->clipWindowEndMs() : source.maxTimeMs;
    request.msPerPx = m_view ? m_view->msPerPx() : 10;
    request.gridDivision = m_view ? m_view->gridDivision() : QStringLiteral("beat");
    request.rulerMode = m_view ? m_view->rulerMode() : QStringLiteral("time");
    request.excludedClipIds = QStringList(exclude.begin(), exclude.end());
    const auto extra = nt::wiring::extraSnapCandidates(request);
    candidates.insert(candidates.end(), extra.begin(), extra.end());
    std::ranges::sort(candidates);
    candidates.erase(std::unique(candidates.begin(), candidates.end()), candidates.end());
    return candidates;
}

QString ClipGestureController::trackUnderPointer(double sceneX, double sceneY) const {
    if (!m_viewport || !m_rows || !m_rows->tracks() || !m_view) return {};
    const QPointF local = m_viewport->mapFromScene(QPointF(sceneX, sceneY));
    if (local.y() < 0 || local.y() >= m_viewport->height()) return {};
    const double contentY = local.y() + m_view->scrollTopPx();
    const auto& tops = m_rows->rowTops();
    const auto& heights = m_rows->rowHeights();
    for (size_t i = 0; i < tops.size(); ++i) {
        if (contentY >= tops[i] && contentY < tops[i] + heights[i]) {
            const auto* tracks = m_rows->tracks();
            return tracks->data(tracks->index(static_cast<int>(i)), TrackListModel::TrackIdRole).toString();
        }
    }
    return {};
}

double ClipGestureController::laneMsAt(double sceneX) const {
    if (!m_viewport || !m_view) return 0;
    const double x = m_viewport->mapFromScene(QPointF(sceneX, 0)).x() + m_view->scrollLeftPx();
    return x * m_view->msPerPx();
}

bool ClipGestureController::pressClip(const QString& id, const QString& pressedPart, double sceneX, double sceneY,
                                      int modifiers) {
    if (!m_timeline || !m_view) return false;
    const EditDoc doc = editDoc();
    const QJsonObject* clip = findClip(doc.clips, id);
    if (!clip) return false;
    const auto mods = static_cast<Qt::KeyboardModifiers>(modifiers);
    // useClipTrim BODY_TOOLS: these tools act on the whole clip.
    static const QSet<QString> bodyTools{QStringLiteral("cut"),         QStringLiteral("slip"),
                                         QStringLiteral("slide"),       QStringLiteral("trackSelect"),
                                         QStringLiteral("trackSelectBackward"), QStringLiteral("hand"),
                                         QStringLiteral("zoom")};
    const QString part = bodyTools.contains(m_tool) ? QStringLiteral("body") : pressedPart;
    // Hand and Zoom act on the lanes (TracksRegion.qml).
    if (m_tool == u"hand" || m_tool == u"zoom") return false;
    const bool locked = !editableUserTargets(doc, IdSet{id}, false, false).count(id);
    if (m_tool == u"cut") {
        // Split at the pointer; no-op splits at the clip's edges are refused.
        if (locked) return false;
        const double atMs = laneMsAt(sceneX);
        if (atMs > clipStartMs(*clip) && atMs < clipEndMs(*clip)) {
            const QJsonArray before = m_timeline->clipsJson();
            const auto next = resolveEdit("splitClipAtTime", {{"clipId", id}, {"atMs", atMs}},
                                          [&] { return splitClipAtTime(doc, id, atMs); });
            m_timeline->commitEdit(QStringLiteral("Split"), before, toArray(next));
        }
        return true;
    }
    Gesture g;
    g.clipId = id;
    g.startX = g.lastX = sceneX;
    g.startY = g.lastY = sceneY;
    g.alt = mods & Qt::AltModifier;
    g.copyOnDrag = g.alt && part == u"body" && m_tool != u"slip" && m_tool != u"slide" &&
                   static_cast<bool>(nt::app::findEdit("altDragCopy"));
    g.selectionAtStart = m_selection;
    g.scrollLeftAtStart = m_view->scrollLeftPx();
    g.gestureMsPerPx = m_view->msPerPx();
    g.before = m_timeline->clipsJson();
    g.generation = m_timeline->documentGeneration();
    if (part == u"body" && (m_tool == u"slip" || m_tool == u"slide")) {
        if (locked) return false;
        g.kind = m_tool;
        g.dragStartMs = clipStartMs(*clip);
        g.inAtStart = clip->value(u"inPointMs").toDouble(0);
    } else if (part == u"body") {
        if (m_tool == u"trackSelect" || m_tool == u"trackSelectBackward") {
            // trackSelectIds; Shift keeps to the clip's track. The clicked
            // clip leads, so the drag moves the whole block with it.
            const QStringList ids =
                trackSelectIds(doc.clips, laneMsAt(sceneX),
                               m_tool == u"trackSelect" ? QStringLiteral("forward") : QStringLiteral("backward"),
                               (mods & Qt::ShiftModifier) ? clipTrackId(*clip) : QString());
            QStringList next{id};
            for (const QString& other : ids) {
                if (other != id) next.append(other);
            }
            setSelection(next);
        }
        g.kind = QStringLiteral("move");
        g.dragStartMs = clipStartMs(*clip);
        // In a multi-selection the companions move too; their edges are not
        // candidates (useClipDrag snapshots this once at pointerdown).
        IdSet exclude{id};
        if (m_selection.contains(id) && m_selection.size() > 1) exclude.insert(m_selection.begin(), m_selection.end());
        if (!g.alt || g.copyOnDrag) { g.candidates = collectSnapCandidates(exclude); }
    } else {
        // A locked clip or track refuses the trim (`interactionLocked`).
        if (!editableUserTargets(doc, IdSet{id}, false, false).count(id)) return false;
        g.kind = QStringLiteral("trim");
        g.edge = part;
        g.mode = trimModeFor(m_tool, mods & (Qt::ControlModifier | Qt::MetaModifier), m_rippleMode);
        g.edgeMsAtStart = part == u"start" ? clipStartMs(*clip) : clipEndMs(*clip);
        g.durationMsAtStart = clipDurationMs(*clip);
        if (!g.alt) { g.candidates = collectSnapCandidates(IdSet{id}); }
    }
    m_gesture = g;
    emit gestureChanged();
    // Take the pointer: the clip's delegate may move to another lane, or out
    // of the window, while the gesture runs.
    grabMouse();
    return true;
}

void ClipGestureController::applyMove() {
    Gesture& g = m_gesture;
    EditDoc doc = editDoc();
    const QJsonObject* fresh = findClip(doc.clips, g.clipId);
    if (!fresh) return;
    if (!editableUserTargets(doc, IdSet{g.clipId}, false, false).count(g.clipId)) return;

    const double scroll = m_view->scrollLeftPx();
    if (m_view->msPerPx() != g.gestureMsPerPx) {
        // Zoom changed: bank the time moved at the old scale, re-anchor.
        const double oldDeltaPx = g.lastX - g.startX + (scroll - g.scrollLeftAtStart);
        g.travelledMs += oldDeltaPx * g.gestureMsPerPx;
        g.startX = g.lastX;
        g.scrollLeftAtStart = scroll;
        g.gestureMsPerPx = m_view->msPerPx();
    }
    const double msPerPx = g.gestureMsPerPx;
    const double deltaPx = g.lastX - g.startX + (scroll - g.scrollLeftAtStart);
    if (!g.dragging && std::hypot(deltaPx, g.lastY - g.startY) < nt::ui::DRAG_THRESHOLD_PX) return;
    g.dragging = true;
    if (g.copyOnDrag && !g.copiesCreated) {
        setDoc(resolveEdit("altDragCopy", {{"clipId", g.clipId},
                           {"selectedIds", QJsonArray::fromStringList(g.selectionAtStart)},
                           {"deltaMs", 0}, {"mode", "overlap"}}, [&] { return doc.clips; }));
        g.copiesCreated = true;
        doc = editDoc();
        fresh = findClip(doc.clips, g.clipId);
        if (!fresh) { return; }
    }

    const double rawStartMs = std::max(0.0, g.dragStartMs + g.travelledMs + deltaPx * msPerPx);
    const WindowSnap snapped = (g.alt && !g.copyOnDrag) || !m_snapEnabled
                                   ? WindowSnap{rawStartMs, -1}
                                   : snapClipWindow(rawStartMs, clipDurationMs(*fresh), g.candidates, msPerPx);
    const double adjustedDeltaMs = std::max(0.0, snapped.startMs) - clipStartMs(*fresh);

    // The lane under the pointer, when it is another unlocked lane whose type
    // takes the clip.
    QString target;
    const QString lane = trackUnderPointer(g.lastX, g.lastY);
    if (!lane.isEmpty() && lane != clipTrackId(*fresh)) {
        for (const auto& t : doc.tracks) {
            if (t.id == lane && !t.locked && clipFitsTrack(fresh->value(u"mediaType").toString(), t.type)) target = lane;
        }
    }
    const bool multi = m_selection.contains(g.clipId) && m_selection.size() > 1;
    const ClipList next = resolveEdit(multi ? "moveSelectedClips" : "moveClip",
                                     {{"clipId", g.clipId}, {"selectedIds", QJsonArray::fromStringList(m_selection)},
                                      {"deltaMs", adjustedDeltaMs}, {"toTrackId", target}}, [&] {
        return multi ? moveSelectedClips(doc, g.clipId, m_selection, adjustedDeltaMs, target, m_linked)
                     : moveClip(doc, g.clipId, adjustedDeltaMs, target, m_linked);
    });
    setDoc(next);
    const QJsonObject* moved = findClip(next, g.clipId);
    setSnapGuide(moved && clipStartMs(*moved) == snapped.startMs ? snapped.guideMs : -1);
}

void ClipGestureController::applyTrim() {
    Gesture& g = m_gesture;
    const EditDoc doc = editDoc();
    const QJsonObject* fresh = findClip(doc.clips, g.clipId);
    if (!fresh) return;
    g.dragging = true;
    // useClipTrim targetEdge: edge at the press plus the pointer's travel.
    const double msPerPx = m_view->msPerPx();
    const double rawMs = g.edgeMsAtStart + (g.lastX - g.startX) * msPerPx;
    double valueMs = rawMs;
    double guideMs = -1;
    if (!g.alt && m_snapEnabled) {
        const SnapResolution hit = resolveSnap(rawMs, g.candidates, SNAP_THRESHOLD_PX, msPerPx);
        valueMs = hit.value;
        guideMs = hit.snapped ? hit.value : -1;
    }
    ClipList next;
    bool landed = false;
    if (g.mode == u"stretch") {
        // Rate stretch: the edge sets the length, the speed follows.
        if (g.edge == u"start") {
            next = resolveEdit("rateStretchClip",
                               {{"clipId", g.clipId}, {"edge", "start"}, {"durationMs", clipEndMs(*fresh) - valueMs}},
                               [&] {
                return rateStretchClip(doc, g.clipId, "start", clipEndMs(*fresh) - valueMs, m_linked);
            });
            const QJsonObject* t = findClip(next, g.clipId);
            landed = t && clipStartMs(*t) == valueMs;
        } else {
            next = resolveEdit("rateStretchClip",
                               {{"clipId", g.clipId}, {"edge", "end"}, {"durationMs", valueMs - clipStartMs(*fresh)}},
                               [&] {
                return rateStretchClip(doc, g.clipId, "end", valueMs - clipStartMs(*fresh), m_linked);
            });
            const QJsonObject* t = findClip(next, g.clipId);
            landed = t && clipEndMs(*t) == valueMs;
        }
    } else if (g.edge == u"start") {
        if (g.mode == u"ripple") {
            // A ripple head trim keeps the clip parked: the pointer's travel is
            // the total, the duration says how much is applied already.
            const double wantedMs = g.edgeMsAtStart - valueMs;
            const double appliedMs = clipDurationMs(*fresh) - g.durationMsAtStart;
            next = resolveEdit("rippleTrimClipStart", {{"clipId", g.clipId}, {"deltaMs", wantedMs - appliedMs}},
                               [&] { return rippleTrimClipStart(doc, g.clipId, wantedMs - appliedMs, m_linked); });
            const QJsonObject* t = findClip(next, g.clipId);
            landed = t && clipDurationMs(*t) == g.durationMsAtStart + wantedMs;
        } else {
            const double deltaMs = clipStartMs(*fresh) - valueMs;
            if (g.mode == u"roll") {
                // Rolling the cut later grows the left neighbour's end: its
                // source caps the roll.
                const int n = findRollNeighbour(doc.clips, *fresh, QStringLiteral("start"));
                const auto cap = n >= 0 ? sourceCap(doc.clips[static_cast<size_t>(n)]) : std::nullopt;
                next = resolveEdit("rollClipEdge", {{"clipId", g.clipId}, {"edge", "start"}, {"deltaMs", -deltaMs}},
                                   [&] { return rollClipEdge(doc, g.clipId, "start", -deltaMs, cap, m_linked); }, cap);
            } else {
                next = resolveEdit("trimClipStart", {{"clipId", g.clipId}, {"deltaMs", deltaMs}},
                                   [&] { return trimClipStart(doc, g.clipId, deltaMs, m_linked); });
            }
            const QJsonObject* t = findClip(next, g.clipId);
            landed = t && clipStartMs(*t) == valueMs;
        }
    } else {
        const double deltaMs = valueMs - clipEndMs(*fresh);
        const auto cap = sourceCap(*fresh);
        if (g.mode == u"roll") {
            next = resolveEdit("rollClipEdge", {{"clipId", g.clipId}, {"edge", "end"}, {"deltaMs", deltaMs}},
                               [&] { return rollClipEdge(doc, g.clipId, "end", deltaMs, cap, m_linked); }, cap);
        } else if (g.mode == u"ripple") {
            next = resolveEdit("rippleTrimClipEnd", {{"clipId", g.clipId}, {"deltaMs", deltaMs}},
                               [&] { return rippleTrimClipEnd(doc, g.clipId, deltaMs, cap, m_linked); }, cap);
        } else {
            next = resolveEdit("trimClipEnd", {{"clipId", g.clipId}, {"deltaMs", deltaMs}},
                               [&] { return trimClipEnd(doc, g.clipId, deltaMs, cap, m_linked); }, cap);
        }
        const QJsonObject* t = findClip(next, g.clipId);
        landed = t && clipEndMs(*t) == valueMs;
    }
    setDoc(next);
    setSnapGuide(landed ? guideMs : -1);
}

bool ClipGestureController::pressLane(const QString& trackId, double atMs, int modifiers) {
    if (m_tool != u"trackSelect" && m_tool != u"trackSelectBackward") return false;
    const bool shift = static_cast<Qt::KeyboardModifiers>(modifiers) & Qt::ShiftModifier;
    setSelection(trackSelectIds(editDoc().clips, atMs,
                                m_tool == u"trackSelect" ? QStringLiteral("forward") : QStringLiteral("backward"),
                                shift ? trackId : QString()));
    return true;
}

QJsonObject ClipGestureController::targetingPayload() const {
    const auto& state = nt::targeting::TrackTargeting::current().state();
    return {{"untargetedTrackIds", QJsonArray::fromStringList({state.untargetedTrackIds.begin(), state.untargetedTrackIds.end()})},
            {"syncLockOffTrackIds", QJsonArray::fromStringList({state.syncLockOffTrackIds.begin(), state.syncLockOffTrackIds.end()})}};
}

void ClipGestureController::pressEmptyLane(const QString& trackId, double sceneX, double sceneY, int modifiers) {
    if (!m_timeline || !m_rows || !m_view || !m_viewport) { return; }
    cancelGesture();
    Gesture g;
    g.kind = "marquee";
    g.clipId = trackId;
    g.startX = g.lastX = sceneX;
    g.startY = g.lastY = sceneY;
    g.before = m_timeline->clipsJson();
    g.generation = m_timeline->documentGeneration();
    const auto mods = Qt::KeyboardModifiers(modifiers);
    g.additiveSelection = mods & (Qt::ShiftModifier | Qt::ControlModifier | Qt::MetaModifier);
    if (g.additiveSelection) { g.selectionAtStart = m_selection; }
    const auto p = m_viewport->mapFromScene({sceneX, sceneY});
    g.laneStart = {p.x() + m_view->scrollLeftPx(), p.y() + m_view->scrollTopPx()};
    const auto& tops = m_rows->rowTops();
    const auto& heights = m_rows->rowHeights();
    for (size_t i = 0; i < tops.size(); ++i) {
        const auto id = m_rows->tracks()->data(m_rows->tracks()->index(static_cast<int>(i)), TrackListModel::TrackIdRole).toString();
        g.bandRows.push_back({id, tops[i], tops[i] + heights[i]});
    }
    setSelection(g.selectionAtStart);
    m_gesture = std::move(g);
    if (m_clock) {
        const double time = std::round(std::max(0.0, laneMsAt(sceneX)));
        m_clock->seek(m_timeline->durationMs() > 0 ? std::min(time, m_timeline->durationMs()) : time);
    }
    grabMouse();
    emit gestureChanged();
}

void ClipGestureController::updateMarquee() {
    auto& g = m_gesture;
    const auto p = m_viewport->mapFromScene({g.lastX, g.lastY});
    const double x = p.x() + m_view->scrollLeftPx();
    const double y = p.y() + m_view->scrollTopPx();
    const double left = std::min(g.laneStart.x(), x);
    const double top = std::min(g.laneStart.y(), y);
    const double width = std::abs(g.laneStart.x() - x);
    const double height = std::abs(g.laneStart.y() - y);
    const QVariantMap band{{"left", left}, {"top", top}, {"width", width}, {"height", height}};
    if (m_rubberBand == band) { return; }
    m_rubberBand = band;
    g.dragging = true;
    ClipList clips;
    clips.reserve(static_cast<size_t>(g.before.size()));
    for (const auto& c : g.before) { clips.push_back(c.toObject()); }
    setSelection(nt::edit::clipboard::marqueeSelection(clips, g.bandRows, left * m_view->msPerPx(),
                    (left + width) * m_view->msPerPx(), top, top + height, g.selectionAtStart));
    emit gestureChanged();
}

QVariantMap ClipGestureController::groupSpan(const QString& id) const {
    const auto span = nt::edit::groups::childSpanMs(editDoc().clips, id);
    return span ? QVariantMap{{"startMs", span->startMs}, {"endMs", span->endMs}} : QVariantMap{};
}

void ClipGestureController::pasteAttributes(const QVariantMap& source, const QStringList& ids, const QStringList& groups) {
    if (!m_timeline) { return; }
    m_timeline->applyEdit("pasteAttributes", {{"source", QJsonObject::fromVariantMap(source)},
                         {"selectedIds", QJsonArray::fromStringList(ids)}, {"groups", QJsonArray::fromStringList(groups)}});
}

bool ClipGestureController::pressTrack(const QString& id, const QString& kind, double sceneX, double sceneY) {
    if (!m_timeline || !m_rows || !m_view || (kind != u"resize" && kind != u"reorder")) { return false; }
    cancelGesture();
    for (const auto& value : m_timeline->timeline().raw.value("tracks").toArray()) {
        const auto track = value.toObject();
        if (track.value("id") != id) { continue; }
        Gesture g;
        g.kind = kind;
        g.clipId = id;
        g.startX = g.lastX = sceneX;
        g.startY = g.lastY = sceneY;
        g.trackHeightAtStart = track.value("heightPx").toDouble(64);
        g.trackType = track.value("type").toString();
        g.generation = m_timeline->documentGeneration();
        m_gesture = std::move(g);
        m_trackDropY = -1;
        m_trackOrder.clear();
        grabMouse();
        emit gestureChanged();
        return true;
    }
    return false;
}

void ClipGestureController::updateTrackDrag() {
    m_trackDropY = -1;
    m_trackOrder.clear();
    if (!m_viewport || !m_rows || !m_view) { return; }
    const auto& g = m_gesture;
    const auto local = m_viewport->mapFromScene({g.lastX, g.lastY});
    if (local.x() >= 0 || local.y() < 0 || local.y() >= m_viewport->height()) { emit gestureChanged(); return; }
    const double y = local.y() + m_view->scrollTopPx();
    const auto& tops = m_rows->rowTops();
    const auto& heights = m_rows->rowHeights();
    for (size_t i = 0; i < tops.size(); ++i) {
        if (y < tops[i] || y >= tops[i] + heights[i]) { continue; }
        const auto index = m_rows->tracks()->index(static_cast<int>(i));
        const auto id = m_rows->tracks()->data(index, TrackListModel::TrackIdRole).toString();
        const auto type = m_rows->tracks()->data(index, TrackListModel::TypeRole).toString();
        if (type != g.trackType || id == g.clipId) { break; }
        const bool after = y >= tops[i] + heights[i] / 2;
        QStringList original;
        for (const auto& t : m_timeline->timeline().raw.value("tracks").toArray()) {
            const auto trackId = t.toObject().value("id").toString();
            original.append(trackId);
            if (trackId != g.clipId) { m_trackOrder.append(trackId); }
        }
        m_trackOrder.insert(m_trackOrder.indexOf(id) + (after ? 1 : 0), g.clipId);
        if (m_trackOrder == original) { m_trackOrder.clear(); break; }
        m_trackDropY = tops[i] + (after ? heights[i] - 2 : 0);
        break;
    }
    emit gestureChanged();
}

void ClipGestureController::applySlip() {
    // useClipDrag beginSlipDrag: moving right shows earlier source.
    Gesture& g = m_gesture;
    const EditDoc doc = editDoc();
    const QJsonObject* fresh = findClip(doc.clips, g.clipId);
    if (!fresh) return;
    const double wantedIn = g.inAtStart - (g.lastX - g.startX) * m_view->msPerPx() * sourceRate(*fresh);
    const double sourceDeltaMs = wantedIn - fresh->value(u"inPointMs").toDouble(0);
    const auto cap = sourceCap(*fresh);
    g.dragging = true;
    setDoc(resolveEdit("slipClip", {{"clipId", g.clipId}, {"sourceDeltaMs", sourceDeltaMs}}, [&] {
        const auto patches = planSlip(doc, *fresh, sourceDeltaMs, cap, m_linked);
        return patches ? applyPatches(doc.clips, *patches) : doc.clips;
    }, cap));
}

void ClipGestureController::applySlide() {
    // useClipDrag beginSlideDrag: the store's slideClip with no source lengths.
    Gesture& g = m_gesture;
    const EditDoc doc = editDoc();
    const QJsonObject* fresh = findClip(doc.clips, g.clipId);
    if (!fresh) return;
    const double wantedMs = g.dragStartMs + (g.lastX - g.startX) * m_view->msPerPx();
    g.dragging = true;
    const double deltaMs = wantedMs - clipStartMs(*fresh);
    setDoc(resolveEdit("slideClip", {{"clipId", g.clipId}, {"deltaMs", deltaMs}},
                       [&] { return slideClip(doc, g.clipId, deltaMs, m_linked); }));
}

void ClipGestureController::mouseMoveEvent(QMouseEvent* event) {
    if (m_gesture.kind.isEmpty()) {
        event->ignore();
        return;
    }
    m_gesture.lastX = event->scenePosition().x();
    m_gesture.lastY = event->scenePosition().y();
    if (m_gesture.kind == u"marquee") {
        updateMarquee();
    } else if (m_gesture.kind == u"resize" || m_gesture.kind == u"reorder") {
        m_gesture.dragging = true;
        if (m_gesture.kind == u"reorder") { updateTrackDrag(); }
    } else if (m_gesture.kind == u"move") {
        applyMove();
        if (m_gesture.dragging) polish();  // the edge auto-scroll
    } else if (m_gesture.kind == u"slip") {
        applySlip();
    } else if (m_gesture.kind == u"slide") {
        applySlide();
    } else {
        applyTrim();
    }
    event->accept();
}

void ClipGestureController::mouseReleaseEvent(QMouseEvent* event) {
    if (m_gesture.kind.isEmpty()) {
        event->ignore();
        return;
    }
    m_gesture.lastX = event->scenePosition().x();
    m_gesture.lastY = event->scenePosition().y();
    finishGesture(true, event->modifiers());
    event->accept();
}

void ClipGestureController::mouseUngrabEvent() {
    // Another item took the pointer (or the window lost it): cancel.
    if (!m_gesture.kind.isEmpty()) finishGesture(false, Qt::NoModifier);
}

void ClipGestureController::updatePolish() {
    // Edge auto-scroll, once per frame while the pointer sits in an edge zone.
    if (m_gesture.kind != u"move" || !m_gesture.dragging || !m_viewport || !m_view) return;
    const double vx = m_viewport->mapFromScene(QPointF(m_gesture.lastX, m_gesture.lastY)).x();
    const double speed = m_view->autoScrollSpeed(vx);
    if (speed == 0) return;
    const double before = m_view->scrollLeftPx();
    m_view->setScrollLeftPx(before + speed);
    if (m_view->scrollLeftPx() == before) return;
    applyMove();
    polish();
}

void ClipGestureController::dropGesture() {
    if (m_gesture.kind.isEmpty()) return;
    m_gesture = Gesture{};
    m_trackDropY = -1;
    m_trackOrder.clear();
    m_rubberBand.clear();
    setSnapGuide(-1);
    if (window() && window()->mouseGrabberItem() == this) ungrabMouse();
    emit gestureChanged();
}

void ClipGestureController::cancelGesture() {
    if (m_gesture.kind.isEmpty()) return;
    const Gesture g = m_gesture;
    dropGesture();
    if (m_timeline && g.dragging && g.kind != u"resize" && g.kind != u"reorder" && g.kind != u"marquee" && g.generation == m_timeline->documentGeneration()) {
        m_timeline->replaceClips(g.before);
    }
}

void ClipGestureController::finishGesture(bool completed, Qt::KeyboardModifiers modifiers) {
    if (m_timeline && m_gesture.generation != m_timeline->documentGeneration()) {
        dropGesture();
        return;
    }
    Gesture g = m_gesture;
    m_gesture = Gesture{};
    if (g.kind == u"marquee") {
        const bool click = !g.dragging || m_rubberBand.value("width").toDouble() <= nt::ui::DRAG_THRESHOLD_PX;
        m_rubberBand.clear();
        if (completed && click && !g.additiveSelection && !lockedTrackIds(editDoc()).contains(g.clipId)) {
            const auto gap = findGap(editDoc().clips, g.clipId, g.laneStart.x() * m_view->msPerPx());
            if (gap) {
                m_selectedGap = {{"trackId", g.clipId}, {"startMs", gap->startMs}, {"endMs", gap->endMs}};
                emit selectionChanged();
            }
        }
        if (window() && window()->mouseGrabberItem() == this) { ungrabMouse(); }
        emit gestureChanged();
        return;
    }
    if (g.kind == u"resize" || g.kind == u"reorder") {
        const auto order = m_trackOrder;
        m_trackOrder.clear();
        m_trackDropY = -1;
        if (window() && window()->mouseGrabberItem() == this) { ungrabMouse(); }
        emit gestureChanged();
        if (completed && g.dragging && m_timeline && m_view) {
            if (g.kind == u"resize") {
                const double height = std::clamp(g.trackHeightAtStart + (g.lastY - g.startY) / m_view->verticalZoom(), 48.0, 300.0);
                if (height != g.trackHeightAtStart) {
                    m_timeline->applyEdit("setTrackHeight", {{"trackId", g.clipId}, {"heightPx", height}});
                }
            } else if (!order.isEmpty()) {
                m_timeline->applyEdit("reorderTracks", {{"orderedIds", QJsonArray::fromStringList(order)}});
            }
        }
        return;
    }
    if (g.kind == u"move" && g.dragging && completed) {
        // The last position, then the drop (Ctrl/Cmd on release forces insert).
        m_gesture = g;
        applyMove();
        m_gesture = Gesture{};
        const bool multi = m_selection.contains(g.clipId) && m_selection.size() > 1;
        const IdSet moved = multi ? IdSet(m_selection.begin(), m_selection.end()) : IdSet{g.clipId};
        const bool insert = modifiers & (Qt::ControlModifier | Qt::MetaModifier);
        const QString mode = insert ? QStringLiteral("insert") : m_dropMode;
        const QStringList movedIds = multi ? m_selection : QStringList{g.clipId};
        if (g.copyOnDrag) {
            const auto current = editDoc();
            const auto* primary = findClip(current.clips, g.clipId);
            const auto edit = nt::app::findEdit("altDragCopy");
            if (primary && edit) {
                auto raw = m_timeline->timeline().raw;
                raw.insert("clips", g.before);
                auto payload = targetingPayload();
                payload.insert("clipId", g.clipId);
                payload.insert("selectedIds", QJsonArray::fromStringList(g.selectionAtStart));
                payload.insert("deltaMs", clipStartMs(*primary) - g.dragStartMs);
                payload.insert("toTrackId", clipTrackId(*primary));
                payload.insert("linked", m_linked);
                payload.insert("mode", mode);
                m_timeline->replaceClips(edit(std::move(raw), payload).value("clips").toArray());
            }
        } else {
            setDoc(resolveEdit("resolveDropAction", {{"selectedIds", QJsonArray::fromStringList(movedIds)}, {"mode", mode}},
                               [&] { return resolveDropAction(editDoc(), moved, mode); }));
        }
    }
    setSnapGuide(-1);
    if (!m_timeline) return;
    if (g.dragging && completed) {
        static const QHash<QString, QString> names{{QStringLiteral("move"), QStringLiteral("Move clips")},
                                                   {QStringLiteral("trim"), QStringLiteral("Trim clip")},
                                                   {QStringLiteral("slip"), QStringLiteral("Slip clip")},
                                                   {QStringLiteral("slide"), QStringLiteral("Slide clip")}};
        m_timeline->commitEdit(names.value(g.kind), g.before, m_timeline->clipsJson());
    } else if (g.dragging) {
        // Cancelled: back to the state at the press, with no entry.
        m_timeline->replaceClips(g.before);
    } else if (g.kind == u"move" && completed && m_tool != u"trackSelect" && m_tool != u"trackSelectBackward") {
        // A track-select tool chose the selection at the press.
        clickSelect(g.clipId, modifiers);
    }
    if (window() && window()->mouseGrabberItem() == this) ungrabMouse();
    emit gestureChanged();
}

void ClipGestureController::clickSelect(const QString& id, Qt::KeyboardModifiers modifiers) {
    QStringList next = m_selection;
    if (modifiers & Qt::ShiftModifier) {
        if (!next.contains(id)) next.append(id);
    } else if (modifiers & (Qt::ControlModifier | Qt::MetaModifier)) {
        if (next.contains(id)) {
            next.removeAll(id);
        } else {
            next.append(id);
        }
    } else {
        next = {id};
    }
    setSelection(next);
}

void ClipGestureController::nudge(double deltaMs, bool merge) {
    if (m_selection.isEmpty() || !m_timeline) return;
    const QJsonArray before = m_timeline->clipsJson();
    const ClipList next = resolveEdit("nudge", {{"clipId", m_selection.first()},
                                              {"selectedIds", QJsonArray::fromStringList(m_selection)},
                                              {"deltaMs", deltaMs}}, [&] {
        return moveSelectedClips(editDoc(), m_selection.first(), m_selection, deltaMs, {}, m_linked);
    });
    m_timeline->commitEdit(QStringLiteral("Nudge clips"), before, toArray(next), NUDGE_MERGE_ID, merge);
}

bool ClipGestureController::handleKey(int key, const QString& text, int modifiers, bool autoRepeat) {
    if (!m_timeline) { return false; }
    const QVariantMap context{{"autoRepeat", autoRepeat}};
    const QString action = resolveTimelineAction(domKey(key, text, modifiers), m_preset);
    if (!action.isEmpty() && runAction(action, context)) { return true; }
    auto mods = Qt::KeyboardModifiers(modifiers) & (Qt::ControlModifier | Qt::MetaModifier | Qt::ShiftModifier | Qt::AltModifier);
    if (mods.testFlag(Qt::MetaModifier)) {
        mods &= ~Qt::MetaModifier;
        mods |= Qt::ControlModifier;
    }
    const QKeySequence sequence(QKeyCombination(mods, static_cast<Qt::Key>(key)));
    for (const auto& extension : nt::wiring::keyActions()) {
        if (extension.defaultKeys.contains(sequence) && runAction(extension.name, context)) { return true; }
    }
    return false;
}

bool ClipGestureController::runAction(const QString& action, const QVariantMap& context) {
    if (!m_timeline || action.isEmpty()) { return false; }
    if (runBuiltinAction(action, context.value("autoRepeat").toBool())) { return true; }
    for (const auto& extension : nt::wiring::keyActions()) {
        if (extension.name == action) { return extension.handler(*this, context); }
    }
    return false;
}

bool ClipGestureController::runBuiltinAction(const QString& action, bool autoRepeat) {
    // A key ends the gesture first: Escape cancels it and stops there; any
    // other command cancels it and runs on the press state, so the history
    // never interleaves with an open gesture.
    if (!m_gesture.kind.isEmpty()) {
        cancelGesture();
        if (action == u"escape") return true;
    }
    if (m_clock) {
        if (action == u"shuttleBack" || action == u"shuttleForward") {
            m_clock->shuttle(action == u"shuttleBack" ? -1 : 1);
            return true;
        }
        if (action == u"shuttleStop") {
            m_clock->shuttleStop();
            return true;
        }
        if (action == u"toggleLoop") {
            if (!autoRepeat) { m_clock->setLoop(!m_clock->loop()); }
            return true;
        }
        if (action == u"playInToOut") {
            if (!autoRepeat) { m_clock->playInToOut(); }
            return true;
        }
        if (action == u"stepFrameBack" || action == u"stepFrameForward" ||
            action == u"stepFramesBack" || action == u"stepFramesForward") {
            if (!m_clock->playing()) {
                const double frameMs = 1000.0 / std::max(1.0, m_timeline->fps());
                const int direction = (action.endsWith(u"Back") ? -1 : 1) *
                                      (action.startsWith(u"stepFrames") ? 5 : 1);
                const double target = (std::round(playheadMs() / frameMs) + direction) * frameMs;
                double endMs = 0;
                for (const auto& clip : m_timeline->timeline().clips) { endMs = std::max(endMs, clip.endMs()); }
                m_clock->seek(std::clamp(target, 0.0, endMs));
            }
            return true;
        }
    }
    const QJsonArray before = m_timeline->clipsJson();
    const IdSet selected(m_selection.begin(), m_selection.end());
    static const QSet<QString> clipboardActions{"copy", "cut", "paste", "pasteInsert", "duplicate", "duplicateWithGap",
                                                "groupClips", "ungroupClips"};
    if (clipboardActions.contains(action)) {
        if (action == u"paste" || action == u"pasteInsert") {
            if (!nt::edit::clipboard::hasClipboardClips()) { return false; }
        } else if (m_selection.isEmpty() || (action == u"groupClips" && m_selection.size() < 2)) { return false; }
        auto payload = targetingPayload();
        payload.insert("selectedIds", QJsonArray::fromStringList(m_selection));
        payload.insert("atMs", playheadMs());
        payload.insert("mode", m_dropMode);
        payload.insert("linked", m_linked);
        const bool changed = m_timeline->applyEdit(action, payload);
        if (changed && (action == u"paste" || action == u"pasteInsert" || action == u"duplicate" ||
                        action == u"duplicateWithGap" || action == u"groupClips")) {
            IdSet old;
            for (const auto& c : before) { old.insert(c.toObject().value("id").toString()); }
            QStringList added;
            for (const auto& c : m_timeline->clipsJson()) {
                const auto id = c.toObject().value("id").toString();
                if (!old.contains(id)) { added.append(id); }
            }
            if (!added.isEmpty()) { setSelection(added); }
        } else if (changed && action == u"ungroupClips") { setSelection({}); }
        return true;
    }
    if (action == u"pasteAttributes") {
        const auto source = nt::edit::clipboard::firstClipboardClip();
        if (!source || m_selection.isEmpty()) { return false; }
        QVariantList targets;
        for (const auto& c : before) {
            if (selected.contains(c.toObject().value("id").toString())) { targets.append(c.toObject().toVariantMap()); }
        }
        emit pasteAttributesRequested(source->toVariantMap(), targets);
        return true;
    }
    if (m_view && (action == u"liftRange" || action == u"extractRange" ||
                   action == u"rippleTrimPrevToPlayhead" || action == u"rippleTrimNextToPlayhead")) {
        const bool range = action == u"liftRange" || action == u"extractRange";
        double start = m_view->rangeInMs();
        double end = m_view->rangeOutMs();
        if (range) {
            if (start < 0 || end < 0) { return false; }
        } else {
            const auto doc = editDoc();
            const auto targets = nt::targeting::targetedTrackIds(doc, nt::targeting::TrackTargeting::current().state());
            const bool forward = action == u"rippleTrimNextToPlayhead";
            const double now = playheadMs();
            std::optional<double> neighbour;
            for (const auto& c : doc.clips) {
                if (isGroupClip(c) || !targets.contains(clipTrackId(c))) { continue; }
                for (const double edge : {clipStartMs(c), clipEndMs(c)}) {
                    if ((forward ? edge - now : now - edge) <= 1) { continue; }
                    if (!neighbour || std::abs(edge - now) < std::abs(*neighbour - now)) { neighbour = edge; }
                }
            }
            if (!neighbour) { return false; }
            start = forward ? now : *neighbour;
            end = forward ? *neighbour : now;
        }
        auto payload = targetingPayload();
        payload.insert("startMs", start);
        payload.insert("endMs", end);
        payload.insert("ripple", action != u"liftRange");
        m_timeline->applyEdit("removeRange", payload);
        if (range) { m_view->clearRange(); }
        if (m_clock && (range || action == u"rippleTrimPrevToPlayhead")) { m_clock->seek(start); }
        return true;
    }
    if (action == u"deleteSelected" || action == u"rippleDeleteSelected") {
        if (m_selection.isEmpty() && !m_selectedGap.isEmpty()) {
            auto payload = targetingPayload();
            payload.insert("trackId", m_selectedGap.value("trackId").toString());
            payload.insert("timeMs", m_selectedGap.value("startMs").toDouble());
            m_timeline->applyEdit("closeGapAt", payload);
            m_selectedGap.clear();
            emit selectionChanged();
            return true;
        }
        if (m_selection.isEmpty()) return false;
        const EditDoc doc = editDoc();
        const bool ripple = action == u"rippleDeleteSelected" || m_rippleMode;
        const ClipList next = resolveEdit(ripple ? "rippleDeleteSelected" : "deleteSelected",
                                         {{"selectedIds", QJsonArray::fromStringList(m_selection)}}, [&] {
            return ripple ? rippleDeleteSelected(doc, selected) : deleteSelected(doc, selected);
        });
        m_timeline->commitEdit(ripple ? QStringLiteral("Ripple delete") : QStringLiteral("Delete clips"), before,
                               toArray(next));
        return true;
    }
    if (action == u"splitAtPlayhead" || action == u"cutAllTracks") {
        // Read before the commit: the commit prunes the split clips' ids.
        const QStringList selection = m_selection;
        const EditDoc doc = editDoc();
        const double timeMs = playheadMs();
        QStringList requested = action == u"cutAllTracks" ? QStringList{} : selection;
        if (action == u"splitAtPlayhead" && requested.isEmpty()) {
            const auto tracks = nt::targeting::targetedTrackIds(doc, nt::targeting::TrackTargeting::current().state());
            for (const auto& c : doc.clips) {
                if (tracks.contains(clipTrackId(c))) { requested.append(clipId(c)); }
            }
            if (requested.isEmpty()) { return true; }
        }
        SplitResult r;
        r.clips = resolveEdit("splitSelectedAtPlayhead", {{"timeMs", timeMs},
                              {"selectedIds", QJsonArray::fromStringList(requested)}}, [&] {
            return splitSelectedAtPlayhead(doc, timeMs, requested).clips;
        });
        // The registry returns clips rather than SplitResult. Recover the
        // right halves on tracks whose originals were replaced by the split.
        IdSet oldIds;
        IdSet newIds;
        for (const auto& clip : r.clips) {
            newIds.insert(clipId(clip));
        }
        IdSet splitTracks;
        for (const auto& clip : doc.clips) {
            oldIds.insert(clipId(clip));
            if (!newIds.count(clipId(clip))) {
                splitTracks.insert(clipTrackId(clip));
            }
        }
        for (const auto& clip : r.clips) {
            if (!oldIds.count(clipId(clip)) && splitTracks.count(clipTrackId(clip)) && clipStartMs(clip) == timeMs) {
                r.rightHalfIds.append(clipId(clip));
            }
        }
        m_timeline->commitEdit(QStringLiteral("Split"), before, toArray(r.clips));
        // The halves have new ids: keep the next split on the same clips.
        if (action == u"splitAtPlayhead" && !selection.isEmpty() && !r.rightHalfIds.isEmpty()) {
            QStringList next;
            for (const QString& id : selection) {
                if (findClip(r.clips, id)) next.append(id);
            }
            next.append(r.rightHalfIds);
            setSelection(next);
        }
        return true;
    }
    if (action == u"selectAll") {
        QStringList all;
        for (const auto& c : editDoc().clips) all.append(clipId(c));
        setSelection(all);
        return true;
    }
    if (action == u"deselectAll") {
        setSelection({});
        return true;
    }
    if (action == u"escape") {
        setSelection({});
        setActiveTool(QStringLiteral("select"));
        return false;  // Escape still closes menus elsewhere.
    }
    if (action.startsWith(u"nudge")) {
        if (m_selection.isEmpty()) return false;
        const double direction = action.startsWith(u"nudgeLeft") ? -1 : 1;
        if (action.endsWith(u"Large")) {
            nudge(direction * 1000, autoRepeat);
            return true;
        }
        const EditDoc doc = editDoc();  // `primary` points into it
        const QJsonObject* primary = findClip(doc.clips, m_selection.first());
        if (!primary) return true;
        nudge(frameStepMs(clipStartMs(*primary), direction, m_timeline->fps()) - clipStartMs(*primary), autoRepeat);
        return true;
    }
    if (action == u"undo") {
        undo();
        return true;
    }
    if (action == u"redo") {
        redo();
        return true;
    }
    if (action == u"toggleSnap") {
        setSnapEnabled(!m_snapEnabled);
        return true;
    }
    if (action == u"toggleShortcuts") {
        emit shortcutsToggled();
        return true;
    }
    // The in/out range and the markers (TracksRegion.tsx key handler).
    if (m_view && action == u"markIn") {
        m_view->setRangeIn(std::max(0.0, playheadMs()));
        return true;
    }
    if (m_view && action == u"markOut") {
        m_view->setRangeOut(std::max(0.0, playheadMs()));
        return true;
    }
    if (m_view && action == u"markClip") {
        // markClipRange: the span of the selection, else of the clip under
        // the playhead on the topmost targeted (unlocked) track.
        const EditDoc doc = editDoc();
        std::vector<const QJsonObject*> marked;
        for (const auto& c : doc.clips) {
            if (m_selection.contains(clipId(c))) marked.push_back(&c);
        }
        if (marked.empty()) {
            QHash<QString, int> order;
            for (const QJsonValue& t : m_timeline->timeline().raw.value(u"tracks").toArray()) {
                order.insert(t.toObject().value(u"id").toString(), t.toObject().value(u"index").toInt());
            }
            const IdSet locked = lockedTrackIds(doc);
            const double at = playheadMs();
            const QJsonObject* top = nullptr;
            for (const auto& c : doc.clips) {
                if (isGroupClip(c) || locked.count(clipTrackId(c)) || !(clipStartMs(c) <= at && at < clipEndMs(c)))
                    continue;
                if (!top || order.value(clipTrackId(c)) < order.value(clipTrackId(*top))) top = &c;
            }
            if (top) marked.push_back(top);
        }
        if (marked.empty()) return false;
        double in = clipStartMs(*marked.front());
        double out = clipEndMs(*marked.front());
        for (const QJsonObject* c : marked) {
            in = std::min(in, clipStartMs(*c));
            out = std::max(out, clipEndMs(*c));
        }
        m_view->clearRange();
        m_view->setRangeIn(in);
        m_view->setRangeOut(out);
        return true;
    }
    if (m_view && action == u"clearRange") {
        m_view->clearRange();
        return true;
    }
    if (m_view && m_clock && (action == u"goToIn" || action == u"goToOut")) {
        const double target = action == u"goToIn" ? m_view->rangeInMs() : m_view->rangeOutMs();
        if (target < 0) return false;
        m_clock->seek(target);
        return true;
    }
    if (action == u"addMarker") {
        // Holding the key must not stack a marker per repeat.
        if (!autoRepeat) {
            m_timeline->addMarker(playheadMs(),
                                  QStringLiteral("Marker %1").arg(m_timeline->markersJson().size() + 1));
        }
        return true;
    }
    if (m_clock && (action == u"nextMarker" || action == u"prevMarker")) {
        // seekToNeighbour: the nearest marker more than 1 ms away.
        std::vector<double> times;
        for (const QJsonValue& m : m_timeline->markersJson()) times.push_back(m.toObject().value(u"timeMs").toDouble());
        std::sort(times.begin(), times.end());
        const double now = playheadMs();
        std::optional<double> target;
        if (action == u"nextMarker") {
            for (double t : times) {
                if (t > now + 1) {
                    target = t;
                    break;
                }
            }
        } else {
            for (double t : times) {
                if (t < now - 1) target = t;
            }
        }
        if (target) m_clock->seek(*target);
        return true;
    }
    if (action == u"selectTool") {
        setActiveTool(QStringLiteral("select"));
        return true;
    }
    if (action == u"rippleTool") {
        setActiveTool(QStringLiteral("ripple"));
        return true;
    }
    if (action == u"rollTool") {
        setActiveTool(QStringLiteral("roll"));
        return true;
    }
    // TOOL_FOR_ACTION
    static const QHash<QString, QString> toolFor{
        {QStringLiteral("trackSelectTool"), QStringLiteral("trackSelect")},
        {QStringLiteral("trackSelectBackwardTool"), QStringLiteral("trackSelectBackward")},
        {QStringLiteral("slideTool"), QStringLiteral("slide")},
        {QStringLiteral("handTool"), QStringLiteral("hand")},
        {QStringLiteral("zoomTool"), QStringLiteral("zoom")},
        {QStringLiteral("rateStretchTool"), QStringLiteral("rateStretch")},
        {QStringLiteral("cutTool"), QStringLiteral("cut")},
        {QStringLiteral("slipTool"), QStringLiteral("slip")}};
    if (toolFor.contains(action)) {
        setActiveTool(toolFor.value(action));
        return true;
    }
    if (m_view && (action == u"zoomIn" || action == u"zoomOut" || action == u"zoomFit")) {
        if (action == u"zoomFit") {
            m_view->zoomToFit();
        } else {
            m_view->zoomBy(action == u"zoomIn" ? nt::ui::ZOOM_IN_FACTOR : nt::ui::ZOOM_OUT_FACTOR, playheadMs());
        }
        return true;
    }
    return false;
}

namespace {

// The media file whose length bounds a clip's source: the audio file of an
// audio clip, else the picture file.
QString sourceFileOf(const nt::Clip& c) {
    if (c.mediaType == nt::MediaType::Audio && !c.audioPath.empty()) return QString::fromStdString(c.audioPath);
    return QString::fromStdString(c.mediaPath);
}

bool hasFiniteSource(const QJsonObject& clip) {
    const QString t = clip.value(u"mediaType").toString();
    return t == u"audio" || t == u"video";
}

// The asset a clip's source belongs to: `currentAssetId`, or for the
// prototype's local files the raw `mediaPath`, else the raw `audioPath` (a
// sound known only by its file).
QString assetKeyOf(const QJsonObject& clip) {
    const QString asset = clip.value(u"currentAssetId").toString();
    if (!asset.isEmpty()) return asset;
    const QString media = clip.value(u"mediaPath").toString();
    return media.isEmpty() ? clip.value(u"audioPath").toString() : media;
}

}  // namespace

void ClipGestureController::probeSources() {
    // Probe each media file once, off the GUI thread (a blocking FFmpeg open).
    if (!m_timeline) return;
    QPointer<ClipGestureController> self(this);
    const quint64 generation = m_probeGeneration;
    for (const auto& c : m_timeline->timeline().clips) {
        const QString file = sourceFileOf(c);
        if (file.isEmpty() || m_sourceMs.contains(file) || m_probing.contains(file)) continue;
        m_probing.insert(file);
        // The version the probe reads: a result for another one is dropped.
        const QString version = nt::ui::mediaVersionKey(file);
        QThreadPool::globalInstance()->start([self, file, version, generation]() {
            const nt::MediaFacts facts = nt::probeMedia(file.toStdString());
            const double ms = facts.opened && facts.durationSec > 0 ? facts.durationSec * 1000.0 : -1.0;
            QMetaObject::invokeMethod(qApp, [self, file, version, generation, ms]() {
                if (!self || generation != self->m_probeGeneration) return;
                self->m_probing.remove(file);
                if (ms > 0 && nt::ui::mediaVersionKey(file) == version) {
                    self->m_sourceMs.insert(file, ms);
                    nt::wiring::rememberSourceDuration(file, version, ms);
                }
            });
        });
    }
}

std::optional<double> ClipGestureController::sourceCap(const QJsonObject& clip) {
    // useClipSourceDuration getSourceCapMs: the resolved length, else
    // fallbackSourceDurationMs (the furthest out-point seen on the asset).
    if (!hasFiniteSource(clip) || !m_timeline) return std::nullopt;
    const QString id = clipId(clip);
    for (const auto& c : m_timeline->timeline().clips) {
        if (QString::fromStdString(c.id) != id) continue;
        const auto it = m_sourceMs.constFind(sourceFileOf(c));
        if (it != m_sourceMs.constEnd()) return it.value();
        break;
    }
    const QString asset = assetKeyOf(clip);
    if (asset.isEmpty()) return std::nullopt;
    const double rate = sourceRate(clip);
    const double inPoint = clip.value(u"inPointMs").isDouble() ? clip.value(u"inPointMs").toDouble() : 0.0;
    const double outPoint = clip.value(u"outPointMs").isDouble() ? clip.value(u"outPointMs").toDouble()
                                                                  : inPoint + clipDurationMs(clip) * rate;
    const double seen = std::max(outPoint, m_observedEnds.value(asset, 0.0));
    m_observedEnds.insert(asset, seen);
    return seen;
}

QString ClipGestureController::shortcutFor(const QString& action) const {
    const auto shortcut = formatActionShortcut(m_preset, action);
    if (!shortcut.isEmpty()) { return shortcut; }
    for (const auto& extension : nt::wiring::keyActions()) {
        if (extension.name == action && !extension.defaultKeys.isEmpty()) {
            return extension.defaultKeys.first().toString(QKeySequence::NativeText);
        }
    }
    return {};

}

QSet<QString> ClipGestureController::availableActions() {
    static const QSet<QString> actions{
        // handleKey
        "escape", "deleteSelected", "rippleDeleteSelected", "splitAtPlayhead", "selectAll", "deselectAll",
        "nudgeLeft", "nudgeRight", "nudgeLeftLarge", "nudgeRightLarge", "undo", "redo", "toggleSnap",
        "toggleShortcuts", "markIn", "markOut", "markClip", "clearRange", "goToIn", "goToOut", "addMarker",
        "nextMarker", "prevMarker", "zoomIn", "zoomOut", "zoomFit", "selectTool", "trackSelectTool",
        "trackSelectBackwardTool", "rippleTool", "rollTool", "rateStretchTool", "cutTool", "slipTool", "slideTool",
        "handTool", "zoomTool",
        "copy", "cut", "paste", "pasteInsert", "pasteAttributes", "duplicate", "duplicateWithGap",
        "groupClips", "ungroupClips", "cutAllTracks", "liftRange", "extractRange",
        "rippleTrimPrevToPlayhead", "rippleTrimNextToPlayhead", "shuttleBack", "shuttleStop", "shuttleForward",
        "toggleLoop", "playInToOut", "stepFrameBack", "stepFrameForward", "stepFramesBack", "stepFramesForward",
        // key-only rows: Space in TimelineEditor, and the drag modifiers
        "playPause", "rollCut", "disableSnapping", "insertOnDrop"};
    auto result = actions;
    for (const auto& action : nt::wiring::keyActions()) { result.insert(action.name); }
    return result;
}

QVariantMap ClipGestureController::shortcutSheet() const {
    QJsonObject sheet = nt::edit::shortcutSheet(m_preset);
    QJsonArray groups;
    QSet<QString> listed;
    const auto available = availableActions();
    for (const QJsonValue& g : sheet.value(u"groups").toArray()) {
        QJsonObject group = g.toObject();
        QJsonArray rows;
        for (const QJsonValue& r : group.value(u"rows").toArray()) {
            QJsonObject row = r.toObject();
            const auto id = row.value(u"id").toString();
            listed.insert(id);
            row.insert(QStringLiteral("available"), available.contains(id));
            rows.append(row);
        }
        group.insert(QStringLiteral("rows"), rows);
        groups.append(group);
    }
    QJsonArray extensions;
    for (const auto& action : nt::wiring::keyActions()) {
        if (listed.contains(action.name)) { continue; }
        QJsonArray combos;
        for (const auto& key : action.defaultKeys) {
            combos.append(QJsonArray::fromStringList(key.toString(QKeySequence::NativeText).split('+')));
        }
        extensions.append(QJsonObject{{"id", action.name}, {"label", action.label},
                                      {"combos", combos}, {"available", true}});
    }
    if (!extensions.isEmpty()) { groups.append(QJsonObject{{"title", "Extensions"}, {"rows", extensions}}); }
    sheet.insert(QStringLiteral("groups"), groups);
    return sheet.toVariantMap();
}

double ClipGestureController::sourceCapMs(const QString& id) {
    const EditDoc doc = editDoc();
    const QJsonObject* clip = findClip(doc.clips, id);
    if (!clip) return -1;
    const auto cap = sourceCap(*clip);
    return cap ? *cap : -1;
}

void ClipGestureController::undo() {
    if (m_timeline) m_timeline->undoStack()->undo();
}

void ClipGestureController::redo() {
    if (m_timeline) m_timeline->undoStack()->redo();
}

QVariantMap ClipGestureController::clipData(const QString& id) const {
    if (!m_timeline) { return {}; }
    if (m_clipDataRevision != m_timeline->timeline().revision) {
        m_clipData.clear();
        m_clipData.reserve(m_timeline->clipCount());
        for (const auto& value : m_timeline->clipsJson()) {
            const auto clip = value.toObject();
            m_clipData.insert(clip.value("id").toString(), clip);
        }
        m_clipDataRevision = m_timeline->timeline().revision;
    }
    return m_clipData.value(id).toVariantMap();
}
