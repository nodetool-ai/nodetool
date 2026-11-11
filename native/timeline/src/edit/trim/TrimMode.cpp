#include "edit/trim/TrimMode.h"

#include "app/EditRegistry.h"
#include "app/Preferences/PreferencesSettings.h"
#include "edit/ClipGestureController.h"
#include "edit/clipboard/RawDocument.h"
#include "edit/keys/AudioCrossfade.h"
#include "edit/transitions/TransitionEdits.h"
#include "model/TimelineModel.h"
#include "playback/PlaybackClock.h"
#include "ui/MonitorViewState.h"
#include "wiring/SourceDurations.h"

#include <QQuickWindow>
#include <QScopedValueRollback>
#include <QUndoStack>

#include <algorithm>
#include <cmath>

using namespace nt::edit;
using namespace nt::edit::trim;

namespace {
// ClipGestureController and KeyboardActions use 1 to 4.
constexpr int TRIM_MODE_MERGE_ID = 5;
constexpr int DYNAMIC_INTERVAL_MS = 16;
constexpr double DEFAULT_TRANSITION_MS = 500;
constexpr double DEFAULT_AUDIO_TRANSITION_MS = 500;
const QString TRIM_VIEW = QStringLiteral("trim");

QString kindName(Kind kind) {
    switch (kind) {
    case Kind::Ripple: return QStringLiteral("ripple");
    case Kind::Roll: return QStringLiteral("roll");
    case Kind::Trim: break;
    }
    return QStringLiteral("trim");
}
QString editText(Kind kind) {
    switch (kind) {
    case Kind::Ripple: return QStringLiteral("Ripple trim");
    case Kind::Roll: return QStringLiteral("Rolling edit");
    case Kind::Trim: break;
    }
    return QStringLiteral("Trim edit");
}
QVariant sideMap(const std::optional<MonitorSide>& side) {
    if (!side) return {};
    return QVariantMap{{"clipId", side->clipId}, {"name", side->name}, {"trackId", side->trackId},
                       {"mediaType", side->mediaType}, {"frameTimeMs", side->frameTimeMs},
                       {"sourceTimeMs", side->sourceTimeMs}};
}
QJsonObject clipIn(const ClipList& clips, const QString& id) {
    const auto it = std::ranges::find_if(clips, [&](const auto& c) { return clipId(c) == id; });
    return it == clips.end() ? QJsonObject{} : *it;
}
}  // namespace

TrimMode::TrimMode(ClipGestureController& gestures) : QObject(&gestures), m_gestures(gestures) {
    m_elapsed.start();
    m_now = [this] { return static_cast<double>(m_elapsed.nsecsElapsed()) / 1e6; };
    m_timer.setInterval(DYNAMIC_INTERVAL_MS);
    m_timer.setTimerType(Qt::PreciseTimer);
    connect(&m_timer, &QTimer::timeout, this, &TrimMode::advance);
    connect(&m_gestures, &ClipGestureController::changed, this, &TrimMode::rebind);
}

void TrimMode::rebind() {
    if (m_gestures.timeline() != m_timeline) {
        if (m_timeline) disconnect(m_timeline, nullptr, this, nullptr);
        // The old document's undo stack and clips are no longer ours to write.
        endDynamic();
        m_drag.reset();
        setPoints({}, true);
        m_timeline = m_gestures.timeline();
        if (m_timeline) {
            connect(m_timeline, &TimelineModel::clipsChanged, this, &TrimMode::onClipsChanged);
            connect(m_timeline, &TimelineModel::documentReplaced, this, [this] {
                endDynamic();
                m_drag.reset();
                emit dragChanged();
                setPoints({}, true);
            });
            // Someone else's command: this trim goes on the stack first, so its
            // undo entry sits under that command's, which starts from the trimmed clips.
            connect(m_timeline, &TimelineModel::beforeCommand, this, [this] {
                if (!m_writing) settleEdits();
            });
        }
    }
    if (m_gestures.clock() != m_clock) {
        if (m_clock) disconnect(m_clock, nullptr, this, nullptr);
        m_clock = m_gestures.clock();
        if (m_clock) {
            connect(m_clock, &PlaybackClock::playingChanged, this, [this] {
                if (m_looping && !m_clock->playing()) {
                    m_looping = false;
                    emit loopingChanged();
                }
            });
        }
    }
}

QString TrimMode::kind() const { return m_points.empty() ? QString() : kindName(m_points.front().kind); }
double TrimMode::dynamicSpeed() const { return m_dynamic ? m_dynamic->speed() : 0; }
bool TrimMode::atLimit() const { return m_dynamic && m_dynamic->atLimit(); }

Env TrimMode::env() {
    Env result;
    result.fps = m_timeline ? m_timeline->fps() : 30;
    result.linked = m_gestures.linkedSelection();
    result.targeting = nt::targeting::TrackTargeting::current().state();
    result.sourceDuration = [this](const QJsonObject& clip) { return m_gestures.sourceCap(clip); };
    result.edit = [this](const EditDoc& doc, const EdgeRequest& request) { return runEdge(doc, request); };
    return result;
}

// The registered edit, as a pointer trim runs it, so an override applies here too.
ClipList TrimMode::runEdge(const EditDoc& doc, const EdgeRequest& request) {
    const auto edit = nt::app::findEdit(request.action);
    if (!edit || !m_timeline) return plainEdgeEdit(doc, request, nt::targeting::TrackTargeting::current().state());
    QJsonObject raw = m_timeline->timeline().raw;
    raw.insert("clips", structure::clipsToJson(doc.clips));
    QJsonObject payload = m_gestures.targetingPayload();
    payload.insert("clipId", request.clipId);
    payload.insert("deltaMs", request.deltaMs);
    payload.insert("linked", request.linked);
    if (!request.edge.isEmpty()) payload.insert("edge", request.edge);
    if (request.maxSourceDurationMs) payload.insert("maxSourceDurationMs", *request.maxSourceDurationMs);
    ClipList result;
    for (const auto& clip : edit(std::move(raw), payload).value("clips").toArray()) result.push_back(clip.toObject());
    return result;
}

void TrimMode::setPoints(EditPoints points, bool newSession) {
    const bool wasActive = active();
    m_points = std::move(points);
    if (newSession && active() && m_timeline) m_anchor = shiftAnchor(m_gestures.editDoc(), m_points.front());
    if (active() != wasActive) showMonitor(active());
    refresh();
    emit pointsChanged();
}

void TrimMode::refresh() {
    QVariantMap monitor;
    QVariantMap marks;
    if (active() && m_timeline) {
        const EditDoc doc = m_gestures.editDoc();
        const double fps = m_timeline->fps();
        const MonitorInfo info = monitorInfo(doc, m_points.front(), fps);
        const Shift shift = shiftFrom(doc, m_anchor, fps);
        monitor = {{"outgoing", sideMap(info.outgoing)}, {"incoming", sideMap(info.incoming)},
                   {"outgoingMoves", info.outgoingMoves}, {"incomingMoves", info.incomingMoves},
                   {"outShift", shift.outFrames}, {"inShift", shift.inFrames}};
        for (const auto& mark : edgeMarks(doc, m_points)) {
            auto edges = marks.value(mark.clipId).toMap();
            edges.insert(mark.out ? QStringLiteral("end") : QStringLiteral("start"), kindName(mark.kind));
            marks.insert(mark.clipId, edges);
        }
    }
    if (monitor != m_monitor) {
        m_monitor = monitor;
        emit monitorChanged();
    }
    if (marks != m_marks) {
        m_marks = marks;
        emit pointsChanged();
    }
}

void TrimMode::onClipsChanged() {
    if (!active()) return;
    if (!m_writing) {
        // Someone else changed the clips with no command: a running trim stops where it
        // is, and its entry goes from the clips at its start to the clips now.
        settleEdits(true);
        const auto live = prune(m_gestures.editDoc(), m_points);
        if (live != m_points) {
            setPoints(live, false);
            return;
        }
    }
    refresh();
}

void TrimMode::showMonitor(bool on) {
    auto* view = MonitorViewState::forOwner(&m_gestures);
    if (!view) return;
    if (on) {
        if (view->displayMode() != TRIM_VIEW) {
            m_previousDisplay = view->displayMode();
            view->setDisplayMode(TRIM_VIEW);
        }
    } else if (view->displayMode() == TRIM_VIEW) {
        view->setDisplayMode(m_previousDisplay.isEmpty() ? QStringLiteral("composite") : m_previousDisplay);
    }
}

void TrimMode::write(const ClipList& clips) {
    const QScopedValueRollback writing(m_writing, true);
    m_gestures.setDoc(clips);
}

bool TrimMode::commit(const QString& text, const QJsonArray& before, const QJsonArray& after, bool mergeable, bool merge) {
    if (!m_timeline) return false;
    const QScopedValueRollback writing(m_writing, true);
    m_timeline->commitEdit(text, before, after, mergeable ? TRIM_MODE_MERGE_ID : 0, merge);
    refresh();
    return true;
}

void TrimMode::commitTrim(const TrimResult& result, const QString& text, bool merge) {
    commit(text, m_timeline->clipsJson(), structure::clipsToJson(result.clips), true, merge);
}

void TrimMode::selectEdge(const QString& clipId, bool out, const QString& mode, bool add, bool dragged) {
    if (!m_timeline) return;
    settle();
    const Kind kind = mode == u"ripple" ? Kind::Ripple : mode == u"roll" ? Kind::Roll : Kind::Trim;
    const EditPoint point{clipId, out, kind};
    const EditDoc doc = m_gestures.editDoc();
    // Dragging a selected edge keeps the selection, and shift only toggles on a click.
    if (dragged && std::ranges::any_of(m_points, [&](const auto& p) { return sameEdge(doc, p, point); })) return;
    auto next = select(doc, m_points, point, add && !dragged, env());
    m_gestures.clearClipSelection();
    setPoints(std::move(next), true);
}

bool TrimMode::selectNearest() {
    if (!m_timeline || !m_clock) return false;
    settle();
    auto next = trim::selectNearest(m_gestures.editDoc(), m_clock->currentTimeMs(), Kind::Roll, env());
    if (next.empty()) return false;
    m_gestures.clearClipSelection();
    setPoints(std::move(next), true);
    return true;
}

bool TrimMode::toggleKind() {
    if (!active()) return false;
    settle();
    setPoints(trim::toggleKind(m_points), false);
    return true;
}

bool TrimMode::nudge(int frames, bool merge) {
    if (!active() || !m_timeline) return false;
    settleEdits();
    commitTrim(nudgeFrames(m_gestures.editDoc(), m_points, frames, env()), editText(m_points.front().kind), merge);
    return true;
}

bool TrimMode::extendToPlayhead(bool merge) {
    if (!active() || !m_timeline || !m_clock) return false;
    settleEdits();
    commitTrim(trim::extendToPlayhead(m_gestures.editDoc(), m_points, m_clock->currentTimeMs(), env()),
               QStringLiteral("Extend edit"), merge);
    return true;
}

// The default transition at each selected cut, in one undo entry: a cross-fade
// into the incoming picture, and a constant power cross-fade across an audio cut.
bool TrimMode::applyDefaultTransition() {
    if (!active() || !m_timeline) return false;
    settle();
    QJsonObject raw = m_timeline->timeline().raw;
    const QJsonArray before = m_timeline->clipsJson();
    raw.insert("clips", before);
    const EditDoc doc = structure::editDocument(raw);
    const Env environment = env();
    QJsonObject caps;
    for (const auto& c : m_timeline->timeline().clips) {
        if (c.mediaType != nt::MediaType::Video && c.mediaType != nt::MediaType::Audio) continue;
        const auto& path = c.mediaType == nt::MediaType::Audio && !c.audioPath.empty() ? c.audioPath : c.mediaPath;
        if (const auto cap = nt::wiring::knownSourceDuration(QString::fromStdString(path))) {
            caps.insert(QString::fromStdString(c.id), *cap);
        }
    }
    IdSet done;
    for (const auto& selected : m_points) {
        for (const auto& point : linkedPoints(doc, selected, environment)) {
            const auto cut = rollPair(doc, point);
            if (!cut || done.contains(cut->second)) continue;
            done.insert(cut->second);
            const auto clips = structure::editDocument(raw).clips;
            const QJsonObject left = clipIn(clips, cut->first);
            const QJsonObject right = clipIn(clips, cut->second);
            // A cross-fade changes both clips, so neither can be locked.
            const IdSet both{cut->first, cut->second};
            if (editableUserTargets(doc, both, false, false).size() != both.size()) continue;
            if (right.value("mediaType").toString() != u"audio") {
                raw = transitions::setTransitionDuration(std::move(raw), {{"clipId", cut->second},
                    {"durationMs", DEFAULT_TRANSITION_MS}, {"sourceCaps", caps}});
                continue;
            }
            // Clips that overlapped already have their cross-fade, and a second would only
            // change its fades. A picture's transition above may have just extended these.
            if (std::abs(clipEndMs(clipIn(doc.clips, cut->first)) - clipStartMs(clipIn(doc.clips, cut->second))) > 1) continue;
            // Only this cut: on these two clips alone, and each keeps its other edge.
            AudioCrossfadeOptions options;
            options.sourceDurationMs = [&caps](const QJsonObject& c) -> std::optional<double> {
                const auto cap = caps.value(clipId(c));
                return cap.isDouble() ? std::optional(cap.toDouble()) : std::nullopt;
            };
            auto faded = applyAudioCrossfades({left, right}, {cut->first, cut->second}, DEFAULT_AUDIO_TRANSITION_MS, options);
            const auto restore = [](QJsonObject& clip, const QJsonObject& from, const char* time, const char* shape) {
                for (const char* field : {time, shape}) {
                    if (from.contains(QLatin1String(field))) clip.insert(QLatin1String(field), from.value(QLatin1String(field)));
                    else clip.remove(QLatin1String(field));
                }
            };
            restore(faded[0], left, "fadeInMs", "fadeInShape");
            restore(faded[1], right, "fadeOutMs", "fadeOutShape");
            QJsonArray next;
            for (const auto& clip : clips) {
                next.append(clipId(clip) == cut->first ? faded[0] : clipId(clip) == cut->second ? faded[1] : clip);
            }
            raw.insert("clips", next);
        }
    }
    commit(QStringLiteral("Apply default transition"), before, raw.value("clips").toArray());
    return true;
}

void TrimMode::leave() {
    if (!active()) return;
    settle();
    setPoints({}, true);
}

void TrimMode::settle() {
    if (m_drag) endDrag(false);
    if (m_dynamic) commitDynamic();
    stopLoop();
}

double TrimMode::editTime() const {
    if (!active() || !m_timeline) return m_clock ? m_clock->currentTimeMs() : 0;
    return editTimeMs(m_gestures.editDoc(), m_points.front()).value_or(m_clock ? m_clock->currentTimeMs() : 0);
}

void TrimMode::seekToEdit() {
    if (m_clock) m_clock->seek(editTime());
}

// ── Looping ──

bool TrimMode::toggleLoop() {
    if (!active() || !m_clock || !m_timeline) return false;
    if (m_dynamic) commitDynamic();
    if (m_looping) {
        stopLoop();
        return true;
    }
    const LoopSpan span = playAround(editTime(), nt::app::playbackPrerollMs(), nt::app::playbackPostrollMs(),
                                     m_timeline->contentEndMs(), m_timeline->fps());
    m_looping = true;
    emit loopingChanged();
    m_clock->playSpan(span.startMs, span.endMs, -1, true);
    return true;
}

void TrimMode::stopLoop() {
    if (!m_looping) return;
    m_looping = false;
    emit loopingChanged();
    if (m_clock) {
        m_clock->pause();
        seekToEdit();
    }
}

// ── Dynamic trim ──

void TrimMode::shuttle(int direction, bool slow) {
    if (!active() || !m_timeline || !m_clock) return;
    if (m_drag) endDrag(false);
    stopLoop();
    if (!m_dynamic) {
        m_clock->pause();
        m_dynamic = std::make_unique<DynamicTrim>(m_gestures.editDoc(), m_points, env());
        m_window = m_gestures.window();
        if (m_window) m_window->installEventFilter(this);
    }
    m_dynamic->shuttle(direction, m_now(), slow);
    writeDynamic();
    if (!m_timer.isActive()) m_timer.start();
    emit dynamicChanged();
}

void TrimMode::advance() {
    if (!m_dynamic) return;
    const bool wasAtLimit = m_dynamic->atLimit();
    if (m_dynamic->tick(m_now())) writeDynamic();
    if (m_dynamic->atLimit() != wasAtLimit) {
        m_timer.stop();
        emit dynamicChanged();
    }
}

void TrimMode::writeDynamic() {
    write(m_dynamic->clips());
    if (const auto at = m_dynamic->editTime(); at && m_clock) m_clock->seek(*at);
}

void TrimMode::stop() {
    if (m_dynamic) {
        if (m_dynamic->tick(m_now())) writeDynamic();
        commitDynamic();
    }
    stopLoop();
}

void TrimMode::commitDynamic(bool liveClips) {
    if (!m_dynamic) return;
    const auto text = m_dynamic->commit();
    const QJsonArray before = structure::clipsToJson(m_dynamic->baseClips());
    const QJsonArray after = liveClips ? m_timeline->clipsJson() : structure::clipsToJson(m_dynamic->clips());
    endDynamic();
    if (text) commit(*text, before, after);
}

void TrimMode::settleEdits(bool liveClips) {
    if (m_dynamic) commitDynamic(liveClips);
    if (m_drag) endDrag(true);
}

void TrimMode::cancelDynamic() {
    if (!m_dynamic) return;
    const ClipList base = m_dynamic->baseClips();
    endDynamic();
    write(base);
    refresh();
    seekToEdit();
}

void TrimMode::endDynamic() {
    if (!m_dynamic) return;
    m_timer.stop();
    if (m_window) m_window->removeEventFilter(this);
    m_dynamic.reset();
    emit dynamicChanged();
}

bool TrimMode::eventFilter(QObject* watched, QEvent* event) {
    if (event->type() == QEvent::MouseButtonPress && m_dynamic) commitDynamic();
    return QObject::eventFilter(watched, event);
}

// ── Dragging in the Trim Monitor ──

void TrimMode::beginDrag(const QString& side) {
    if (!active() || !m_timeline) return;
    if (m_dynamic) commitDynamic();
    stopLoop();
    const EditDoc doc = m_gestures.editDoc();
    Env environment = env();
    const DragSide dragSide = side == u"outgoing" ? DragSide::Outgoing : side == u"incoming" ? DragSide::Incoming : DragSide::Between;
    const EditPoints previous = m_points;
    // The counters count from the selection, so they carry on across a retarget.
    setPoints(retargetForDrag(doc, m_points, dragSide, environment), false);
    m_drag = Drag{doc, m_timeline->clipsJson(), previous, m_points, std::move(environment)};
    emit dragChanged();
}

void TrimMode::dragFrames(int frames) {
    if (!m_drag) return;
    const auto result = nudgeFrames(m_drag->base, m_drag->points, frames, m_drag->env);
    m_drag->moved = result.clips != m_drag->base.clips;
    write(result.clips);
}

void TrimMode::endDrag(bool completed) {
    if (!m_drag) return;
    Drag drag = std::move(*m_drag);
    m_drag.reset();
    if (completed && drag.moved) {
        commit(editText(drag.points.front().kind), drag.before, m_timeline->clipsJson());
    } else if (!completed) {
        if (drag.moved) write(drag.base.clips);
        setPoints(drag.previous, false);
    }
    emit dragChanged();
}

// ── Keys ──

bool TrimMode::handleKey(int key, int modifiers, bool autoRepeat) {
    if (!active()) return false;
    auto mods = Qt::KeyboardModifiers(modifiers) & (Qt::ControlModifier | Qt::MetaModifier | Qt::ShiftModifier | Qt::AltModifier);
    if (mods.testFlag(Qt::MetaModifier)) mods = (mods & ~Qt::MetaModifier) | Qt::ControlModifier;
    if (key == Qt::Key_T && mods == Qt::ControlModifier) {
        // In trim mode this outranks a preset's use of the chord.
        if (!autoRepeat) toggleKind();
        return true;
    }
    return false;
}

bool TrimMode::interceptAction(const QString& action, const QVariantMap& context) {
    if (!active()) return false;
    const bool repeat = context.value("autoRepeat").toBool();
    if (action == u"shuttleForward" || action == u"shuttleBack") {
        if (!repeat) shuttle(action == u"shuttleForward" ? 1 : -1);
        return true;
    }
    if (action == u"shuttleStop") {
        if (!m_dynamic && !m_looping) return false;
        stop();
        return true;
    }
    if (action == u"escape") {
        if (m_drag) endDrag(false);
        else if (m_dynamic) cancelDynamic();
        else leave();
        return true;
    }
    if (action == u"extendEdit") return extendToPlayhead(repeat);
    if (action == u"trimEditLeft") return nudge(-1, repeat);
    if (action == u"trimEditRight") return nudge(1, repeat);
    if (action == u"trimEditLeftLarge") return nudge(-LARGE_FRAMES, repeat);
    if (action == u"trimEditRightLarge") return nudge(LARGE_FRAMES, repeat);
    if (action == u"applyDefaultTransition") return applyDefaultTransition();
    if (action == u"selectNearestEditPoint" || action == u"toggleTrimType") return false;
    settle();
    return false;
}
