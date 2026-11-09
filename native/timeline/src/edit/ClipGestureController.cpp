#include "edit/ClipGestureController.h"

#include "app/EditRegistry.h"
#include "wiring/KeyActions.h"
#include "wiring/SnapProviders.h"
#include "wiring/SourceDurations.h"
#include <QJsonDocument>
#include "edit/Keymap.h"
#include "edit/targeting/TargetingEdits.h"
#include "edit/trim/TrimMode.h"
#include "edit/groups/GroupOps.h"
#include "ui/MediaVersion.h"
#include "preview/FfmpegSource.h"
#include "ui/TimelineWheel.h"

#include <QCoreApplication>
#include <QCursor>
#include <QKeyEvent>
#include <QThreadPool>

#include <QJsonObject>
#include <QSet>
#include <QMouseEvent>
#include <QQuickWindow>

#include <algorithm>
#include <cmath>
#include <limits>

using namespace nt::edit;

namespace {
bool hasFiniteSource(const QJsonObject& clip);

// clipSnap.ts
constexpr double SNAP_THRESHOLD_PX = 8;
constexpr double TICK_INTERVAL_MS = 1000;
constexpr double FALLBACK_VIEWPORT_PX = 1200;
// Merge key of a held nudge key's commands.
constexpr int NUDGE_MERGE_ID = 1;
// Merge key of a held keyboard trim's commands.
constexpr int TRIM_KEY_MERGE_ID = 2;

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

// The key under a shifted symbol on a US keyboard: a platform reports Shift+1
// as Qt::Key_Exclam and Shift+= as Qt::Key_Plus. Any other key is itself.
int unshiftedKey(int key) {
    static const QHash<int, int> keys{
        {Qt::Key_Exclam, Qt::Key_1},       {Qt::Key_At, Qt::Key_2},           {Qt::Key_NumberSign, Qt::Key_3},
        {Qt::Key_Dollar, Qt::Key_4},       {Qt::Key_Percent, Qt::Key_5},      {Qt::Key_AsciiCircum, Qt::Key_6},
        {Qt::Key_Ampersand, Qt::Key_7},    {Qt::Key_Asterisk, Qt::Key_8},     {Qt::Key_ParenLeft, Qt::Key_9},
        {Qt::Key_ParenRight, Qt::Key_0},   {Qt::Key_Underscore, Qt::Key_Minus}, {Qt::Key_Plus, Qt::Key_Equal},
        {Qt::Key_BraceLeft, Qt::Key_BracketLeft}, {Qt::Key_BraceRight, Qt::Key_BracketRight},
        {Qt::Key_Bar, Qt::Key_Backslash},  {Qt::Key_Colon, Qt::Key_Semicolon}, {Qt::Key_QuoteDbl, Qt::Key_Apostrophe},
        {Qt::Key_Less, Qt::Key_Comma},     {Qt::Key_Greater, Qt::Key_Period}, {Qt::Key_AsciiTilde, Qt::Key_QuoteLeft},
    };
    return keys.value(key, key);
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
    // Ctrl turns a symbol's text into a control character or nothing.
    const QString printable = !text.isEmpty() && text.at(0).isPrint() ? text
        : key >= Qt::Key_Space && key <= Qt::Key_AsciiTilde ? QString(QChar(key)) : text;
    const int physical = unshiftedKey(key);
    if (physical >= Qt::Key_0 && physical <= Qt::Key_9) {
        e.key = printable;
        e.code = QStringLiteral("Digit") + QString(QChar(u'0' + (physical - Qt::Key_0)));
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
    case Qt::Key_PageUp: e.key = QStringLiteral("PageUp"); return e;
    case Qt::Key_PageDown: e.key = QStringLiteral("PageDown"); return e;
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
    e.code = symbolCodes.value(physical);
    e.key = printable;
    return e;
}

bool presetBindsAction(const QString& preset, const QString& action) {
    return !nt::edit::actionBindingKeys(preset, action).empty();
}

// A registered default key gives way to the preset's own use of that key.
bool presetBindsSequence(const QString& preset, const QKeySequence& sequence) {
    if (sequence.isEmpty()) return false;
    const QKeyCombination combination = sequence[0];
    const int mods = combination.keyboardModifiers().toInt();
    return !resolveTimelineAction(domKey(int(combination.key()), {}, mods), preset).isEmpty();
}

}  // namespace

ClipGestureController::ClipGestureController(QQuickItem* parent) : QQuickItem(parent), m_trimMode(new TrimMode(*this)) {
    setAcceptedMouseButtons(Qt::LeftButton);
    connect(this, &QQuickItem::windowChanged, this, &ClipGestureController::watchWindow);
    watchWindow(window());
    connect(this, &ClipGestureController::optionsChanged, this, [this]() {
        m_hoverPlanId.clear();
        clearToolHover();
    });
    m_autoScrollTimer.setSingleShot(true);
    m_autoScrollTimer.setInterval(16);
    connect(&m_autoScrollTimer, &QTimer::timeout, this, [this]() {
        if (!m_gesture.kind.isEmpty() && m_gesture.dragging) { polish(); }
    });
}

ClipGestureController::~ClipGestureController() {
    // QQuickItem's destructor emits windowChanged after our members are gone.
    disconnect(this, &QQuickItem::windowChanged, this, &ClipGestureController::watchWindow);
    watchWindow(nullptr);
}

void ClipGestureController::watchWindow(QQuickWindow* window) {
    if (m_eventWindow) { m_eventWindow->removeEventFilter(this); }
    m_eventWindow = window;
    if (window) { window->installEventFilter(this); }
}
bool ClipGestureController::eventFilter(QObject*, QEvent* event) {
    if (event->type() != QEvent::KeyPress && event->type() != QEvent::KeyRelease) { return false; }
    const auto* key = static_cast<QKeyEvent*>(event);
    if (key->isAutoRepeat()) { return false; }
    const bool pressed = event->type() == QEvent::KeyPress;
    if (!m_toolPreview.isEmpty()) {
        auto modifiers = key->modifiers();
        const auto flag = key->key() == Qt::Key_Control ? Qt::ControlModifier : key->key() == Qt::Key_Meta ? Qt::MetaModifier :
                          key->key() == Qt::Key_Shift ? Qt::ShiftModifier : key->key() == Qt::Key_Alt ? Qt::AltModifier : Qt::NoModifier;
        if (flag != Qt::NoModifier) {
            modifiers.setFlag(flag, pressed);
            updateToolHover(m_toolPreview.value("clipId").toString(), m_hoverPart, m_hoverScene.x(), m_hoverScene.y(), int(modifiers));
        }
    }
    if (!m_gesture.kind.isEmpty()) {
        if (key->key() == Qt::Key_Alt) {
            m_gesture.alt = pressed;
            if (m_gesture.dragging) {
                if (m_gesture.kind == u"move") { applyMove(); }
                else if (m_gesture.kind == u"trim") { applyTrim(); }
            }
        }
        if (key->key() == Qt::Key_Escape && pressed) {
            cancelGesture();
            return true;
        }
    }
    return false;
}
QString ClipGestureController::snapGuideLabel() const {
    return m_snapGuideMs < 0 ? QString() : m_gesture.candidates.labels.value(m_snapGuideMs, tr("Grid"));
}

void ClipGestureController::setTimeline(TimelineModel* m) {
    if (m == m_timeline) return;
    m_hoverPlanId.clear();
    clearToolHover();
    if (m_timeline) disconnect(m_timeline, nullptr, this, nullptr);
    m_timeline = m;
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
        // One connection serves each edit: clipsChanged and timelineChanged come together.
        // A clip the document lost leaves the selection.
        connect(m_timeline, &TimelineModel::clipsChanged, this, [this]() {
            probeSources(false);
            m_hoverPlanId.clear();
            clearToolHover();
            if (m_selection.isEmpty()) return;
            QStringList live;
            for (const QString& id : m_selection) {
                if (m_timeline->findClip(id)) live.append(id);
            }
            if (live != m_selection) setSelection(live);
        });
    }
    probeSources(true);
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
void ClipGestureController::clearClipSelection() {
    if (m_selection.isEmpty() && m_selectedGap.isEmpty() && m_selectedEdit.isEmpty()) return;
    m_selection.clear();
    m_selectedGap.clear();
    m_selectedEdit.clear();
    emit selectionChanged();
}
void ClipGestureController::setSelection(const QStringList& ids) {
    // Selecting clips ends trim mode. An empty list can be the clean-up after an edit.
    if (!ids.isEmpty()) m_trimMode->leave();
    if (ids == m_selection && m_selectedGap.isEmpty() && m_selectedEdit.isEmpty()) return;
    m_selectedGap.clear();
    m_selectedEdit.clear();
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
void ClipGestureController::setKeyframeRow(const QString& row) {
    if (row == m_keyframeRow) return;
    m_keyframeRow = row;
    emit optionsChanged();
}
void ClipGestureController::setKeyframeRowOnly(bool only) {
    if (only == m_keyframeRowOnly) return;
    m_keyframeRowOnly = only;
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
    // The snapshot's id index, converted once while the ids stay the same.
    const auto& typed = m_timeline->timeline();
    if (m_editIndexSource != typed.clipIndex || !m_editIndex) {
        auto index = std::make_shared<QHash<QString, int>>();
        index->reserve(static_cast<int>(typed.clips.size()));
        for (size_t i = 0; i < typed.clips.size(); ++i) index->insert(QString::fromStdString(typed.clips[i].id), static_cast<int>(i));
        m_editIndex = std::move(index);
        m_editIndexSource = typed.clipIndex;
    }
    doc.idIndex = m_editIndex;
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
    // The built-in move runs the same native edit as `fallback`: call that on
    // the clips and skip the conversion of the whole document to JSON and
    // back on each step of a drag.
    if (!edit || (nt::app::isBuiltinEdit(edit) && (name == u"moveClip" || name == u"moveSelectedClips"))) {
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
    if (!m_timeline) return;
    // A gesture step changes a few clips in place: send only those.
    const auto& live = m_timeline->timeline().clips;
    bool patch = clips.size() == live.size();
    QJsonArray changed;
    for (size_t i = 0; patch && i < clips.size(); ++i) {
        if (live[i].raw == clips[i]) continue;
        patch = clipId(clips[i]).toStdString() == live[i].id;
        changed.append(clips[i]);
    }
    if (patch && changed.isEmpty()) return;
    if (patch ? m_timeline->patchClips(changed) : m_timeline->replaceClips(toArray(clips))) {
        ++m_liveUpdates;
        emit gestureChanged();
    }
}

void ClipGestureController::setLiveDoc(const ClipList& clips) {
    if (!m_timeline) return;
    // A move step changes the lane drawing and, when a changed clip covers
    // the playhead, the program preview. The lanes show it from the live
    // list, against the snapshot they last heard of (`m_liveBase`). The
    // preview gets a transient snapshot that only it hears (previewClips).
    // The other listeners hear the move once, when the gesture ends. Clips
    // that change lanes, appear or disappear need the full document change.
    if (!m_liveBase) m_liveBase = m_timeline->snapshot();
    const auto& base = m_liveBase->clips;
    const auto& doc = m_timeline->timeline().clips;
    bool full = clips.size() != base.size() || clips.size() != doc.size();
    const double t = playheadMs();
    const auto covers = [t](double start, double duration) { return start <= t && t < start + duration; };
    QHash<QString, QPair<double, double>> live;
    QJsonArray preview;
    for (size_t i = 0; !full && i < clips.size(); ++i) {
        const QJsonObject& c = clips[i];
        if (doc[i].raw != c) {
            preview.append(c);
            if (!covers(doc[i].startMs, doc[i].durationMs) && !covers(clipStartMs(c), clipDurationMs(c))) preview.pop_back();
        }
        if (base[i].raw == c) continue;
        full = clipId(c).toStdString() != base[i].id || clipTrackId(c).toStdString() != base[i].trackId;
        live.insert(clipId(c), {clipStartMs(c), clipDurationMs(c)});
    }
    if (full) {
        clearLive();
        setDoc(clips);
        m_timeline->settleTransient();
        return;
    }
    if (!preview.isEmpty()) m_timeline->previewClips(preview);
    if (live.isEmpty() && m_live.isEmpty()) return;
    m_liveClips = live.isEmpty() ? ClipList{} : clips;
    m_live = std::move(live);
    ++m_liveUpdates;
    emit liveChanged();
    emit gestureChanged();
}

void ClipGestureController::flushLive() {
    const ClipList clips = std::move(m_liveClips);
    clearLive();
    if (!clips.empty()) setDoc(clips);
    if (m_timeline) m_timeline->settleTransient();
}

void ClipGestureController::clearLive() {
    m_liveBase.reset();
    if (m_live.isEmpty() && m_liveClips.empty()) return;
    m_live.clear();
    m_liveClips.clear();
    emit liveChanged();
}

double ClipGestureController::liveStartMs(const QString& clipId) const {
    const auto it = m_live.constFind(clipId);
    return it == m_live.constEnd() ? -1 : it->first;
}

double ClipGestureController::liveDurationMs(const QString& clipId) const {
    const auto it = m_live.constFind(clipId);
    return it == m_live.constEnd() ? -1 : it->second;
}

double ClipGestureController::playheadMs() const {
    return m_clock ? m_clock->time() : 0.0;
}

void ClipGestureController::setSnapGuide(double ms) {
    if (ms == m_snapGuideMs) return;
    m_snapGuideMs = ms;
    emit snapGuideChanged();
}

ClipGestureController::SnapCandidates ClipGestureController::collectSnapCandidates(const IdSet& excludeClipIds) const {
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
    if (m_timeline) { request.document = m_timeline->timeline().raw; }
    request.msPerPx = m_view ? m_view->msPerPx() : 10;
    request.fromMs = m_view ? m_view->scrollLeftPx() * request.msPerPx : 0;
    const double widthPx = m_view && m_view->viewportWidthPx() > 0
        ? m_view->viewportWidthPx() : FALLBACK_VIEWPORT_PX;
    request.toMs = request.fromMs + widthPx * request.msPerPx;
    request.gridDivision = m_view ? m_view->gridDivision() : QStringLiteral("beat");
    request.rulerMode = m_view ? m_view->rulerMode() : QStringLiteral("time");
    request.excludedClipIds = QStringList(exclude.begin(), exclude.end());
    const auto extra = nt::wiring::extraSnapCandidates(request);
    candidates.insert(candidates.end(), extra.begin(), extra.end());
    std::ranges::sort(candidates);
    candidates.erase(std::unique(candidates.begin(), candidates.end()), candidates.end());
    QHash<double, QString> labels;
    for (const auto& c : doc.clips) {
        if (exclude.count(clipId(c)) || isGroupClip(c)) { continue; }
        const auto name = c.value("name").toString(tr("Clip"));
        labels.insert(clipStartMs(c), tr("Clip start: %1").arg(name));
        labels.insert(clipEndMs(c), tr("Clip end: %1").arg(name));
    }
    if (m_timeline) {
        for (const auto& value : m_timeline->markersJson()) {
            const auto marker = value.toObject();
            labels.insert(marker.value("timeMs").toDouble(), tr("Marker: %1").arg(marker.value("label").toString()));
        }
    }
    labels.insert(playheadMs(), tr("Playhead"));
    return {std::move(candidates), std::move(labels)};
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

void ClipGestureController::clearToolHover(const QString& id) {
    if (!id.isEmpty() && m_toolPreview.value("clipId").toString() != id) { return; }
    m_razorTargets.clear();
    if (!m_toolPreview.isEmpty()) {
        m_toolPreview.clear();
        emit toolPreviewChanged();
    }
}

void ClipGestureController::updateToolHover(const QString& id, const QString& part, double sceneX, double sceneY, int modifiers) {
    if (!m_timeline || !m_view || !m_gesture.kind.isEmpty()) { clearToolHover(); return; }
    if (m_hoverPlanId != id) {
        m_hoverPlanId = id;
        m_hoverClips.clear();
        m_hoverRollAvailable.clear();
        m_hoverMediaOwners.clear();
        m_hoverReason.clear();
        m_hoverAvailable = false;
        const auto doc = editDoc();
        const auto* clip = findClip(doc.clips, id);
        if (!clip) { m_hoverPlanId.clear(); clearToolHover(); return; }
        m_hoverClip = *clip;
        const bool followLinks = m_tool == u"cut" || m_linked;
        m_hoverAvailable = editableUserTargets(doc, IdSet{id}, followLinks, false).count(id) != 0;
        if (!m_hoverAvailable) { m_hoverReason = tr("Unlock the clip or linked track"); }
        if (m_tool == u"cut") {
            const auto link = clipLinkId(*clip);
            for (const auto& c : doc.clips) {
                if (clipId(c) == id || (!link.isEmpty() && clipLinkId(c) == link)) {
                    m_hoverClips.push_back(c);
                    if (doc.clipsWithMediaTracks.count(clipId(c))) { m_hoverMediaOwners.insert(clipId(c)); }
                }
            }
        } else if (m_hoverAvailable && m_tool == u"slip") {
            const auto cap = sourceCap(*clip);
            const double in = clip->value("inPointMs").toDouble();
            const double out = clip->value("outPointMs").toDouble(in + clipDurationMs(*clip) * sourceRate(*clip));
            m_hoverAvailable = hasFiniteSource(*clip) && (in > 0 || !cap || out < *cap) &&
                clip->value("timeRemap").toObject().value("keyframes").toArray().isEmpty();
            if (!m_hoverAvailable) { m_hoverReason = tr("No source frames available for slipping"); }
        } else if (m_hoverAvailable && m_tool == u"slide") {
            const auto sourceFor = [this](const QJsonObject& c) { return sourceCap(c); };
            m_hoverAvailable = slideClip(doc, id, 1, m_linked, sourceFor) != doc.clips ||
                               slideClip(doc, id, -1, m_linked, sourceFor) != doc.clips;
            if (!m_hoverAvailable) { m_hoverReason = tr("No room between adjacent clips"); }
        }
    }
    m_hoverPart = part;
    m_hoverScene = {sceneX, sceneY};
    const auto mods = Qt::KeyboardModifiers(modifiers);
    const double atMs = laneMsAt(sceneX);
    bool available = m_hoverAvailable;
    QString label = m_hoverReason;
    QStringList ids;
    m_razorTargets.clear();
    if (m_tool == u"cut") {
        if (available) {
            const auto targets = splitTargetIds(m_hoverClips, atMs, {id}, m_hoverMediaOwners);
            ids = QStringList(targets.begin(), targets.end());
            available = targets.count(id) != 0;
            if (available) { m_razorTargets = QSet<QString>(ids.begin(), ids.end()); }
        }
        label = available ? tr("Cut at %1 ms").arg(atMs, 0, 'f', 2) : label.isEmpty() ? tr("Cut unavailable here") : label;
    } else if (available) {
        if (m_tool == u"slip") { label = tr("Slip source"); }
        else if (m_tool == u"slide") { label = tr("Slide clip"); }
        else if (m_tool == u"trackSelect") { label = tr("Select following clips"); }
        else if (m_tool == u"trackSelectBackward") { label = tr("Select preceding clips"); }
        else if (part != u"body") {
            const auto mode = trimModeFor(m_tool, mods & (Qt::ControlModifier | Qt::MetaModifier), m_rippleMode);
            label = mode == u"roll" ? tr("Roll edit") : mode == u"ripple" ? tr("Ripple trim") :
                    mode == u"stretch" ? tr("Rate stretch") : part == u"start" ? tr("Trim start") : tr("Trim end");
            if (!m_hoverClip.value("timeRemap").toObject().value("keyframes").toArray().isEmpty()) {
                available = false;
                label = tr("Bake variable speed before trimming");
            } else if (mode == u"roll") {
                if (!m_hoverRollAvailable.contains(part)) {
                    const auto doc = editDoc();
                    const int n = findRollNeighbour(doc.clips, m_hoverClip, part);
                    const auto cap = part == u"end" ? sourceCap(m_hoverClip) : n >= 0 ? sourceCap(doc.clips[static_cast<size_t>(n)]) : std::nullopt;
                    m_hoverRollAvailable.insert(part,
                        rollClipEdge(doc, id, part, 1, cap, m_linked) != doc.clips ||
                        rollClipEdge(doc, id, part, -1, cap, m_linked) != doc.clips);
                }
                available = m_hoverRollAvailable.value(part);
                if (!available) { label = tr("Roll unavailable at this edge"); }
            }
        }
    }
    const auto point = m_viewport ? m_viewport->mapFromScene({sceneX, sceneY}) : QPointF();
    const QVariantMap preview{{"clipId", id}, {"clipIds", ids}, {"timeMs", atMs}, {"part", part},
                              {"available", available}, {"label", label}, {"x", point.x()}, {"y", point.y()}};
    if (m_toolPreview != preview) { m_toolPreview = preview; emit toolPreviewChanged(); }
}

bool ClipGestureController::pressClip(const QString& id, const QString& pressedPart, double sceneX, double sceneY,
                                      int modifiers) {
    if (!m_timeline || !m_view) return false;
    if (parentItem()) { parentItem()->forceActiveFocus(Qt::MouseFocusReason); }
    m_trimMode->settle();
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
    if (part == u"body") m_trimMode->leave();
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
    g.shiftAtPress = mods & Qt::ShiftModifier;
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
        g.candidates = collectSnapCandidates(exclude);
    } else {
        // A locked clip or track refuses the trim (`interactionLocked`).
        if (!editableUserTargets(doc, IdSet{id}, false, false).count(id)) return false;
        g.kind = QStringLiteral("trim");
        g.edge = part;
        g.mode = trimModeFor(m_tool, mods & (Qt::ControlModifier | Qt::MetaModifier), m_rippleMode);
        g.edgeMsAtStart = part == u"start" ? clipStartMs(*clip) : clipEndMs(*clip);
        g.durationMsAtStart = clipDurationMs(*clip);
        g.inAtStart = clip->value("inPointMs").toDouble();
        g.candidates = collectSnapCandidates(IdSet{id});
    }
    m_gesture = g;
    clearToolHover();
    const auto cursor = locked ? Qt::ForbiddenCursor : g.kind == u"move" ? Qt::ClosedHandCursor :
        g.kind == u"slip" || g.mode == u"roll" ? Qt::SplitHCursor : Qt::SizeHorCursor;
    setCursor(QCursor(cursor));
    setKeepMouseGrab(true);
    if (g.kind == u"trim") { updateTrimFeedback(doc, *clip, g.edgeMsAtStart, true); }
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

    const bool keepOriginalTime = std::abs(g.travelledMs + deltaPx * msPerPx) < nt::ui::DRAG_THRESHOLD_PX * msPerPx;
    const double rawStartMs = keepOriginalTime ? g.dragStartMs : std::max(0.0, g.dragStartMs + g.travelledMs + deltaPx * msPerPx);
    const WindowSnap snapped = keepOriginalTime || (g.alt && !g.copyOnDrag) || !m_snapEnabled
                                   ? WindowSnap{rawStartMs, -1}
                                   : snapClipWindow(rawStartMs, clipDurationMs(*fresh), g.candidates.points, msPerPx);
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
    setLiveDoc(next);
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
    const double rawMs = g.edgeMsAtStart + (g.lastX - g.startX + m_view->scrollLeftPx() - g.scrollLeftAtStart) * msPerPx;
    double valueMs = rawMs;
    double guideMs = -1;
    if (!g.alt && m_snapEnabled) {
        const SnapResolution hit = resolveSnap(rawMs, g.candidates.points, SNAP_THRESHOLD_PX, msPerPx);
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
    if (const auto* trimmed = findClip(next, g.clipId)) { updateTrimFeedback(doc, *trimmed, valueMs, landed); }
}

void ClipGestureController::updateTrimFeedback(const EditDoc& doc, const QJsonObject& clip, double requestedMs, bool landed) {
    const auto& g = m_gesture;
    const bool finiteSource = hasFiniteSource(clip);
    const double rate = sourceRate(clip);
    const double in = clip.value("inPointMs").toDouble();
    const auto cap = finiteSource ? sourceCap(clip) : std::nullopt;
    const double start = finiteSource ? clipStartMs(clip) - in / rate : 0;
    const double end = cap ? clipStartMs(clip) + (*cap - in) / rate : -1;
    QString reason;
    if (!landed) {
        const bool head = g.edge == u"start";
        const double duration = head ? clipEndMs(clip) - requestedMs : requestedMs - clipStartMs(clip);
        if (!editableUserTargets(doc, IdSet{g.clipId}, m_linked, true).count(g.clipId)) { reason = tr("Clip or track locked"); }
        else if (g.mode == u"stretch") { reason = tr("Speed limit"); }
        else if (duration <= 0) { reason = tr("Minimum duration"); }
        else if (head && requestedMs < 0) { reason = tr("Sequence start"); }
        else if (head && finiteSource && requestedMs < g.edgeMsAtStart - g.inAtStart / rate) { reason = tr("Source start"); }
        else if (!head && cap && requestedMs > end) { reason = tr("Source end"); }
        else if (!clip.value("timeRemap").toObject().value("keyframes").toArray().isEmpty()) { reason = tr("Bake variable speed before trimming"); }
        else if (g.mode == u"roll") {
            reason = findRollNeighbour(doc.clips, clip, g.edge) < 0 ? tr("Adjacent clip required") : tr("Neighbour limit");
        } else { reason = tr("Trim unavailable"); }
    }
    const QVariantMap feedback{{"clipId", g.clipId}, {"startMs", start}, {"endMs", end},
                              {"bounded", cap.has_value()}, {"hasSource", finiteSource},
                              {"edge", g.edge}, {"limitReason", reason}};
    if (feedback != m_trimSourceRange) {
        m_trimSourceRange = feedback;
        emit gestureChanged();
    }
}

bool ClipGestureController::pressLane(const QString& trackId, double atMs, int modifiers) {
    m_trimMode->leave();
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
    m_trimMode->leave();
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
    if (parentItem()) { parentItem()->forceActiveFocus(Qt::MouseFocusReason); }
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
    const double wantedIn = g.inAtStart - (g.lastX - g.startX + m_view->scrollLeftPx() - g.scrollLeftAtStart) * m_view->msPerPx() * sourceRate(*fresh);
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
    const double wantedMs = g.dragStartMs + (g.lastX - g.startX + m_view->scrollLeftPx() - g.scrollLeftAtStart) * m_view->msPerPx();
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
    m_gesture.alt = event->modifiers().testFlag(Qt::AltModifier);
    if (m_gesture.kind == u"marquee") {
        updateMarquee();
    } else if (m_gesture.kind == u"resize" || m_gesture.kind == u"reorder") {
        m_gesture.dragging = true;
        if (m_gesture.kind == u"reorder") { updateTrackDrag(); }
    } else if (m_gesture.kind == u"move") {
        applyMove();
    } else if (m_gesture.kind == u"slip") {
        applySlip();
    } else if (m_gesture.kind == u"slide") {
        applySlide();
    } else {
        applyTrim();
    }
    if (m_gesture.dragging && m_gesture.kind != u"resize") { polish(); }
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
    if (m_gesture.kind.isEmpty() || m_gesture.kind == u"resize" || !m_gesture.dragging || !m_viewport || !m_view) { return; }
    const auto point = m_viewport->mapFromScene(QPointF(m_gesture.lastX, m_gesture.lastY));
    const double left = m_view->scrollLeftPx();
    const double top = m_view->scrollTopPx();
    if (m_gesture.kind != u"reorder") {
        m_view->setScrollLeftPx(left + m_view->autoScrollSpeed(point.x()));
    }
    if (m_gesture.kind == u"move" || m_gesture.kind == u"marquee" || m_gesture.kind == u"reorder") {
        m_view->setScrollTopPx(top + nt::ui::autoScrollSpeed(point.y(), 0, m_view->viewportHeightPx()));
    }
    if (m_view->scrollLeftPx() == left && m_view->scrollTopPx() == top) { return; }
    if (m_gesture.kind == u"move") { applyMove(); }
    else if (m_gesture.kind == u"trim") { applyTrim(); }
    else if (m_gesture.kind == u"slip") { applySlip(); }
    else if (m_gesture.kind == u"slide") { applySlide(); }
    else if (m_gesture.kind == u"marquee") { updateMarquee(); }
    else if (m_gesture.kind == u"reorder") { updateTrackDrag(); }
    m_autoScrollTimer.start();
}

void ClipGestureController::dropGesture() {
    unsetCursor();
    setKeepMouseGrab(false);
    m_autoScrollTimer.stop();
    clearLive();
    if (m_gesture.kind.isEmpty()) return;
    m_gesture = Gesture{};
    m_trimSourceRange.clear();
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
    unsetCursor();
    setKeepMouseGrab(false);
    m_autoScrollTimer.stop();
    if (m_timeline && m_gesture.generation != m_timeline->documentGeneration()) {
        dropGesture();
        return;
    }
    Gesture g = m_gesture;
    m_gesture = Gesture{};
    m_trimSourceRange.clear();
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
        flushLive();
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
    clearLive();
    setSnapGuide(-1);
    if (!m_timeline) return;
    if (g.dragging && completed) {
        static const QHash<QString, QString> names{{QStringLiteral("move"), QStringLiteral("Move clips")},
                                                   {QStringLiteral("trim"), QStringLiteral("Trim clip")},
                                                   {QStringLiteral("slip"), QStringLiteral("Slip clip")},
                                                   {QStringLiteral("slide"), QStringLiteral("Slide clip")}};
        m_timeline->commitEdit(names.value(g.kind), g.before, m_timeline->clipsJson());
        selectEditPoint(g);
    } else if (g.dragging) {
        // Cancelled: back to the state at the press, with no entry.
        m_timeline->replaceClips(g.before);
    } else if (g.kind == u"move" && completed && m_tool != u"trackSelect" && m_tool != u"trackSelectBackward") {
        // A track-select tool chose the selection at the press.
        clickSelect(g.clipId, modifiers);
        // A click on the incoming transition's wedge selects the transition, which sits at the clip's start.
        if (m_selection == QStringList{g.clipId}) {
            const EditDoc doc = editDoc();
            if (const QJsonObject* clip = findClip(doc.clips, g.clipId)) {
                const double intoClipMs = laneMsAt(g.startX) - clipStartMs(*clip);
                if (intoClipMs >= 0 && intoClipMs < clip->value(u"transitionIn").toObject().value(u"durationMs").toDouble()) {
                    selectEdit(g.clipId, QStringLiteral("start"));
                }
            }
        }
    } else if (completed) {
        selectEditPoint(g);
    }
    if (window() && window()->mouseGrabberItem() == this) ungrabMouse();
    emit gestureChanged();
}

// useClipTrim handleTrimPointerEnd: the edge just handled is the edit point
// for E and the keyboard trims, whether the press dragged it or only clicked.
void ClipGestureController::selectEditPoint(const Gesture& g) {
    if (g.edge.isEmpty()) return;
    // The Ripple and Rolling tools select in trim mode. The Selection tool keeps one plain edit point.
    if (m_tool == u"ripple" || m_tool == u"roll") {
        m_trimMode->selectEdge(g.clipId, g.edge == u"end", g.mode, g.shiftAtPress, g.dragging);
        return;
    }
    m_trimMode->leave();
    m_selectedEdit = {{"clipId", g.clipId}, {"edge", g.edge}};
    emit selectionChanged();
}

bool ClipGestureController::selectGapAt(const QString& trackId, double timeMs) {
    if (!m_timeline || lockedTrackIds(editDoc()).contains(trackId)) { return false; }
    const auto gap = findGap(editDoc().clips, trackId, timeMs);
    if (!gap) { return false; }
    m_selection.clear();
    m_selectedEdit.clear();
    m_selectedGap = {{"trackId", trackId}, {"startMs", gap->startMs}, {"endMs", gap->endMs}};
    emit selectionChanged();
    return true;
}

void ClipGestureController::selectEdit(const QString& clipId, const QString& edge) {
    m_selectedEdit = {{"clipId", clipId}, {"edge", edge}};
    emit selectionChanged();
}

QVariantMap ClipGestureController::editPointAt(const QString& id, const QString& edge) const {
    const EditDoc doc = editDoc();
    const QJsonObject* clip = findClip(doc.clips, id);
    if (!clip) { return {}; }
    const bool in = edge == u"start";
    const double cut = in ? clipStartMs(*clip) : clipEndMs(*clip);
    QString neighbour;
    for (const auto& c : doc.clips) {
        if (clipTrackId(c) == clipTrackId(*clip) && !isGroupClip(c) && std::abs((in ? clipEndMs(c) : clipStartMs(c)) - cut) < 1) {
            neighbour = clipId(c);
            break;
        }
    }
    return {{"leftId", in ? neighbour : id}, {"rightId", in ? id : neighbour}};
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

bool ClipGestureController::trimEditPoint(double edgeTargetMs, bool merge) {
    if (!m_timeline || m_selectedEdit.isEmpty()) return false;
    const QString id = m_selectedEdit.value("clipId").toString();
    const EditDoc doc = editDoc();
    const QJsonObject* target = findClip(doc.clips, id);
    if (!target) return false;
    const QJsonArray before = m_timeline->clipsJson();
    ClipList next;
    const bool ripple = m_rippleMode || m_tool == u"ripple";
    if (m_selectedEdit.value("edge").toString() == u"start") {
        const double deltaMs = clipStartMs(*target) - edgeTargetMs;
        if (m_tool == u"roll") {
            // Rolling the cut later grows the left neighbour's end: its source caps the roll.
            const int n = findRollNeighbour(doc.clips, *target, QStringLiteral("start"));
            const auto cap = n >= 0 ? sourceCap(doc.clips[static_cast<size_t>(n)]) : std::nullopt;
            next = resolveEdit("rollClipEdge", {{"clipId", id}, {"edge", "start"}, {"deltaMs", -deltaMs}}, [&] {
                return rollClipEdge(doc, id, "start", -deltaMs, cap, m_linked);
            }, cap);
        } else {
            next = resolveEdit(ripple ? "rippleTrimClipStart" : "trimClipStart", {{"clipId", id}, {"deltaMs", deltaMs}}, [&] {
                return ripple ? rippleTrimClipStart(doc, id, deltaMs, m_linked) : trimClipStart(doc, id, deltaMs, m_linked);
            });
        }
    } else {
        const double deltaMs = edgeTargetMs - clipEndMs(*target);
        const auto cap = sourceCap(*target);
        if (m_tool == u"roll") {
            next = resolveEdit("rollClipEdge", {{"clipId", id}, {"edge", "end"}, {"deltaMs", deltaMs}}, [&] {
                return rollClipEdge(doc, id, "end", deltaMs, cap, m_linked);
            }, cap);
        } else {
            next = resolveEdit(ripple ? "rippleTrimClipEnd" : "trimClipEnd", {{"clipId", id}, {"deltaMs", deltaMs}}, [&] {
                return ripple ? rippleTrimClipEnd(doc, id, deltaMs, cap, m_linked) : trimClipEnd(doc, id, deltaMs, cap, m_linked);
            }, cap);
        }
    }
    m_timeline->commitEdit(QStringLiteral("Trim clip"), before, toArray(next), TRIM_KEY_MERGE_ID, merge);
    return true;
}

QString ClipGestureController::resolveKeyAction(int key, const QString& text, int modifiers) const {
    return resolveTimelineAction(domKey(key, text, modifiers), m_preset);
}

bool ClipGestureController::handleKey(int key, const QString& text, int modifiers, bool autoRepeat) {
    if (!m_timeline) { return false; }
    if (m_gesture.kind.isEmpty() && m_trimMode->handleKey(key, modifiers, autoRepeat)) { return true; }
    const QVariantMap context{{"autoRepeat", autoRepeat}};
    const QString action = resolveTimelineAction(domKey(key, text, modifiers), m_preset);
    // A preset's key means that action alone, even when the action refuses.
    if (!action.isEmpty()) { return runAction(action, context); }
    auto mods = Qt::KeyboardModifiers(modifiers) & (Qt::ControlModifier | Qt::MetaModifier | Qt::ShiftModifier | Qt::AltModifier);
    if (mods.testFlag(Qt::MetaModifier)) {
        mods &= ~Qt::MetaModifier;
        mods |= Qt::ControlModifier;
    }
    const QKeySequence sequence(QKeyCombination(mods, static_cast<Qt::Key>(unshiftedKey(key))));
    for (const auto& extension : nt::wiring::keyActions()) {
        if (extension.defaultKeys.contains(sequence) && !presetBindsAction(m_preset, extension.name)) {
            return runAction(extension.name, context);
        }
    }
    return false;
}

bool ClipGestureController::runAction(const QString& action, const QVariantMap& context) {
    if (!m_timeline || action.isEmpty()) { return false; }
    if (m_gesture.kind.isEmpty() && m_trimMode->interceptAction(action, context)) { return true; }
    if (runBuiltinAction(action, context.value("autoRepeat").toBool(), context)) { return true; }
    for (const auto& extension : nt::wiring::keyActions()) {
        if (extension.name == action) { return extension.handler(*this, context); }
    }
    return false;
}

bool ClipGestureController::runBuiltinAction(const QString& action, bool autoRepeat, const QVariantMap& context) {
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
    const bool scoped = context.contains("clipIds") &&
        (action == u"splitAtPlayhead" || action == u"duplicate" || action == u"deleteSelected");
    const QStringList actionSelection = scoped ? context.value("clipIds").toStringList() : m_selection;
    const IdSet selected(actionSelection.begin(), actionSelection.end());
    static const QSet<QString> clipboardActions{"copy", "cut", "paste", "pasteInsert", "duplicate", "duplicateWithGap",
                                                "groupClips", "ungroupClips"};
    if (clipboardActions.contains(action)) {
        if (action == u"paste" || action == u"pasteInsert") {
            if (!nt::edit::clipboard::hasClipboardClips()) { return false; }
        } else if (actionSelection.isEmpty() || (action == u"groupClips" && actionSelection.size() < 2)) { return false; }
        auto payload = targetingPayload();
        payload.insert("selectedIds", QJsonArray::fromStringList(actionSelection));
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
        if (!scoped && actionSelection.isEmpty() && !m_selectedGap.isEmpty()) {
            auto payload = targetingPayload();
            payload.insert("trackId", m_selectedGap.value("trackId").toString());
            payload.insert("timeMs", m_selectedGap.value("startMs").toDouble());
            m_timeline->applyEdit("closeGapAt", payload);
            m_selectedGap.clear();
            emit selectionChanged();
            return true;
        }
        if (actionSelection.isEmpty()) return false;
        const EditDoc doc = editDoc();
        const bool ripple = action == u"rippleDeleteSelected" || (!scoped && m_rippleMode);
        const ClipList next = resolveEdit(ripple ? "rippleDeleteSelected" : "deleteSelected",
                                         {{"selectedIds", QJsonArray::fromStringList(actionSelection)}}, [&] {
            return ripple ? rippleDeleteSelected(doc, selected) : deleteSelected(doc, selected);
        });
        m_timeline->commitEdit(ripple ? QStringLiteral("Ripple delete") : QStringLiteral("Delete clips"), before,
                               toArray(next));
        return true;
    }
    if (action == u"splitAtPlayhead" || action == u"cutAllTracks") {
        // Read before the commit: the commit prunes the split clips' ids.
        const QStringList selection = actionSelection;
        const EditDoc doc = editDoc();
        const double timeMs = playheadMs();
        QStringList requested = action == u"cutAllTracks" ? QStringList{} : selection;
        if (scoped) {
            requested.removeIf([&](const QString& id) {
                const auto* clip = findClip(doc.clips, id);
                return !clip || timeMs <= clipStartMs(*clip) || timeMs >= clipEndMs(*clip);
            });
            if (requested.isEmpty()) { return true; }
        }
        if (!scoped && action == u"splitAtPlayhead" && requested.isEmpty()) {
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
    if (m_view && action == u"zoomSelection") {
        double start = std::numeric_limits<double>::infinity();
        double end = 0;
        for (const auto& clip : m_timeline->timeline().clips) {
            if (selected.contains(QString::fromStdString(clip.id))) {
                start = std::min(start, clip.startMs);
                end = std::max(end, clip.endMs());
            }
        }
        m_view->zoomToRange(start, end);
        return true;
    }
    if (m_view && (action == u"zoomIn" || action == u"zoomOut" || action == u"zoomFit")) {
        if (action == u"zoomFit") {
            m_view->toggleFit();
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

void ClipGestureController::probeSources(bool all) {
    // Probe each media file once, off the GUI thread (a blocking FFmpeg open).
    if (!m_timeline) return;
    QPointer<ClipGestureController> self(this);
    const quint64 generation = m_probeGeneration;
    for (const auto& c : m_timeline->timeline().clips) {
        // An edit names the clips it touched. The others were probed before.
        if (!all && !m_timeline->clipTouched(QString::fromStdString(c.id))) continue;
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
                    self->m_hoverPlanId.clear();
                    emit self->optionsChanged();
                    if (self->m_gesture.kind == u"trim" && self->m_view) {
                        if (self->m_gesture.dragging) {
                            self->applyTrim();
                        } else {
                            const auto doc = self->editDoc();
                            if (const auto* clip = findClip(doc.clips, self->m_gesture.clipId)) {
                                self->updateTrimFeedback(doc, *clip, self->m_gesture.edgeMsAtStart, true);
                            }
                        }
                    }
                    nt::wiring::rememberSourceDuration(file, version, ms);
                }
            });
        });
    }
}

std::optional<double> ClipGestureController::sourceCap(const QJsonObject& clip) {
    // useClipSourceDuration getSourceCapMs: the resolved length, else
    // fallbackSourceDurationMs (the furthest out-point seen on the asset).
    if (isHoldRemap(clip) || !hasFiniteSource(clip) || !m_timeline) return std::nullopt;
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
        if (extension.name == action) {
            for (const auto& key : extension.defaultKeys) {
                if (!presetBindsSequence(m_preset, key)) { return key.toString(QKeySequence::NativeText); }
            }
        }
    }
    return {};

}

bool ClipGestureController::presetUsesKey(const QString& preset, const QKeySequence& sequence) {
    return presetBindsSequence(preset, sequence);
}

QSet<QString> ClipGestureController::availableActions() {
    static const QSet<QString> actions{
        // handleKey
        "escape", "deleteSelected", "rippleDeleteSelected", "splitAtPlayhead", "selectAll", "deselectAll",
        "nudgeLeft", "nudgeRight", "nudgeLeftLarge", "nudgeRightLarge", "undo", "redo", "toggleSnap",
        "toggleShortcuts", "markIn", "markOut", "markClip", "clearRange", "goToIn", "goToOut", "addMarker",
        "nextMarker", "prevMarker", "zoomIn", "zoomOut", "zoomFit", "zoomSelection", "selectTool", "trackSelectTool",
        "trackSelectBackwardTool", "rippleTool", "rollTool", "rateStretchTool", "cutTool", "slipTool", "slideTool",
        "handTool", "zoomTool",
        "copy", "cut", "paste", "pasteInsert", "pasteAttributes", "duplicate", "duplicateWithGap",
        "groupClips", "ungroupClips", "cutAllTracks", "liftRange", "extractRange",
        "rippleTrimPrevToPlayhead", "rippleTrimNextToPlayhead", "shuttleBack", "shuttleStop", "shuttleForward",
        "toggleLoop", "playInToOut", "stepFrameBack", "stepFrameForward", "stepFramesBack", "stepFramesForward",
        // key-only rows: Space in TimelineEditor, and the pointer gestures
        "playPause", "rollCut", "disableSnapping", "insertOnDrop", "selectEditPoint"};
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
    for (const auto& action : nt::wiring::keyActions()) {
        if (listed.contains(action.name)) { continue; }
        QJsonArray combos;
        for (const QStringList& keys : actionBindingKeys(m_preset, action.name)) {
            combos.append(QJsonArray::fromStringList(keys));
        }
        if (combos.isEmpty()) {
            for (const auto& key : action.defaultKeys) {
                if (!presetBindsSequence(m_preset, key)) {
                    combos.append(QJsonArray::fromStringList(key.toString(QKeySequence::NativeText).split('+')));
                }
            }
        }
        if (combos.isEmpty()) { continue; }
        const QJsonObject row{{"id", action.name}, {"label", action.label}, {"combos", combos}, {"available", true}};
        const QString title = action.group.isEmpty() ? QStringLiteral("Extensions") : action.group;
        qsizetype index = 0;
        while (index < groups.size() && groups[index].toObject().value(u"title").toString() != title) { ++index; }
        if (index == groups.size()) { groups.append(QJsonObject{{"title", title}, {"rows", QJsonArray{}}}); }
        auto group = groups[index].toObject();
        auto rows = group.value(u"rows").toArray();
        rows.append(row);
        group.insert(QStringLiteral("rows"), rows);
        groups[index] = group;
    }
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
    m_trimMode->settle();
    if (m_timeline) m_timeline->undoStack()->undo();
}

void ClipGestureController::redo() {
    m_trimMode->settle();
    if (m_timeline) m_timeline->undoStack()->redo();
}

QVariantMap ClipGestureController::clipData(const QString& id) const {
    const nt::Clip* clip = m_timeline ? m_timeline->findClip(id) : nullptr;
    return clip ? clip->raw.toVariantMap() : QVariantMap{};
}
