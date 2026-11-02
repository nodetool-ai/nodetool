#include "SourceViewerState.h"
#include "SourceEdit.h"
#include "assets/AssetClip.h"
#include "edit/Keymap.h"
#include "app/Preferences/PreferencesSettings.h"
#include <QJsonDocument>
#include <QJSValue>
#include <algorithm>
#include <cmath>
#include <limits>
#include <optional>

namespace {
std::optional<double> parseSeconds(QString text) {
    text = text.trimmed();
    if (text.endsWith('s', Qt::CaseInsensitive)) { text.chop(1); text = text.trimmed(); }
    if (text.isEmpty()) { return std::nullopt; }
    const double value = QJSValue(text).toNumber();
    if (!std::isfinite(value) || value < 0) { return std::nullopt; }
    return std::floor(value * 1000 + 0.5);
}
double durationLimit(const QVariantMap& asset) {
    const auto duration = QJsonObject::fromVariantMap(asset).value("duration");
    return duration.isDouble() ? std::floor(duration.toDouble() * 1000 + 0.5) : std::numeric_limits<double>::infinity();
}
QString actionName(const QString& kind) {
    return "source" + kind.first(1).toUpper() + kind.sliced(1);
}
// Saved in the preferences, least recently used first.
constexpr qsizetype kMaxSavedMarks = 500;
}
SourceViewerState::SourceViewerState(QObject* parent) : QObject(parent), m_monitor(new SourceMonitor(this)) {
    connect(m_monitor, &SourceMonitor::opened, this, [this] {
        const double duration = m_asset.value("duration").toDouble();
        if ((!std::isfinite(duration) || duration <= 0) && m_monitor->durationMs() > 0) {
            m_asset.insert("duration", m_monitor->durationMs() / 1000); emit changed();
        }
    });
}
void SourceViewerState::loadMarks() {
    if (m_marksLoaded) { return; }
    m_marksLoaded = true;
    const auto saved = QJsonDocument::fromJson(nt::app::openTimelinePreferences()->value("source/marks").toByteArray()).array();
    for (const auto& value : saved) {
        const auto entry = value.toObject();
        const auto id = entry.value("id").toString();
        QJsonObject valid;
        for (const auto& key : {"inMs", "outMs"}) {
            const auto mark = entry.value(key);
            if (mark.isDouble() && std::isfinite(mark.toDouble()) && mark.toDouble() >= 0) { valid.insert(key, mark); }
        }
        if (id.isEmpty() || valid.isEmpty()) { continue; }
        m_markOrder.removeAll(id);
        m_savedMarks.insert(id, valid); m_markOrder.append(id);
    }
    while (m_markOrder.size() > kMaxSavedMarks) { m_savedMarks.remove(m_markOrder.takeFirst()); }
}
void SourceViewerState::reloadMarksForTest() {
    m_marksLoaded = false; m_savedMarks = {}; m_markOrder.clear(); loadMarks();
    m_marks = m_savedMarks.value(m_asset.value("id").toString()).toObject().toVariantMap();
    if (!m_marks.isEmpty()) { m_marks.insert("assetId", m_asset.value("id")); }
    emit changed();
}
void SourceViewerState::writeMarks(const QVariantMap& value) {
    loadMarks();
    const auto id = m_asset.value("id").toString();
    if (id.isEmpty()) { return; }
    auto next = value;
    if (!next.isEmpty()) { next.insert("assetId", id); }
    if (m_marks == next) { return; }
    m_marks = next;
    auto stored = QJsonObject::fromVariantMap(next); stored.remove("assetId");
    persistMarks(id, stored);
    emit changed();
}
void SourceViewerState::persistMarks(const QString& id, const QJsonObject& stored) {
    m_markOrder.removeAll(id);
    if (stored.isEmpty()) { m_savedMarks.remove(id); }
    else { m_savedMarks.insert(id, stored); m_markOrder.append(id); }
    while (m_markOrder.size() > kMaxSavedMarks) { m_savedMarks.remove(m_markOrder.takeFirst()); }
    QJsonArray saved;
    for (const auto& key : m_markOrder) {
        auto entry = m_savedMarks.value(key).toObject();
        entry.insert("id", key);
        saved.append(entry);
    }
    auto settings = nt::app::openTimelinePreferences();
    settings->setValue("source/marks", QJsonDocument(saved).toJson(QJsonDocument::Compact));
    settings->sync();
}
QJsonObject SourceViewerState::savedMarks(const QString& assetId) { loadMarks(); return m_savedMarks.value(assetId).toObject(); }
bool SourceViewerState::markAsset(const QVariantMap& asset, const QString& edge, double timeMs) {
    const auto id = asset.value("id").toString();
    const bool in = edge == "in";
    if (id.isEmpty() || (!in && edge != "out") || !std::isfinite(timeMs)) { return false; }
    if (nt::assets::assetMediaType(QJsonObject{{"content_type", QJsonValue::fromVariant(asset.value("content_type"))}}) != "video") { return false; }
    if (id == m_asset.value("id").toString()) {
        if (in) { markIn(timeMs); } else { markOut(timeMs); }
        return true;
    }
    // An asset the Source monitor does not show: its frame rate is unknown, so the mark is not snapped.
    loadMarks();
    const auto json = QJsonObject::fromVariantMap(asset);
    auto marks = m_savedMarks.value(id).toObject();
    auto labelled = marks;
    labelled.insert("assetId", id);
    const auto range = nt::sourceedit::sourceRangeFor(json, labelled);
    const double time = std::max(0.0, std::min(timeMs, durationLimit(asset)));
    if (in) {
        marks.insert("inMs", time);
        if (time >= range.outMs) { marks.remove("outMs"); }
    } else {
        marks.insert("outMs", time);
        if (time <= range.inMs) { marks.remove("inMs"); }
    }
    persistMarks(id, marks);
    return true;
}
void SourceViewerState::setError(const QString& error) {
    if (m_error == error) { return; } m_error = error; emit errorChanged();
}
void SourceViewerState::clearError() { setError({}); }
void SourceViewerState::clearMarks() { cancelRangeDrag(); writeMarks({}); clearError(); }
void SourceViewerState::togglePatch(const QString& kind, const QString& trackId) {
    if (kind != "video" && kind != "audio") { return; }
    auto& patch = kind == "video" ? m_videoPatch : m_audioPatch;
    patch = patch == trackId ? QString{} : trackId; emit patchChanged();
}
void SourceViewerState::setMediaBrowser(AssetBrowser* browser) {
    if (m_mediaBrowser == browser) { return; }
    m_mediaBrowser = browser;
    emit changed();
}
void SourceViewerState::setAsset(const QVariantMap& value) {
    loadMarks();
    auto next = value;
    const auto id = next.value("id").toString();
    const bool different = m_asset.value("id").toString() != id;
    const double incomingDuration = next.value("duration").toDouble();
    if (!different && (!std::isfinite(incomingDuration) || incomingDuration <= 0) && m_asset.value("duration").toDouble() > 0) {
        next.insert("duration", m_asset.value("duration"));
    }
    if (m_asset == next) { return; }
    if (different) {
        cancelRangeDrag();
        m_monitor->close();
    }
    m_asset = next;
    if (different) {
        m_marks = m_savedMarks.value(id).toObject().toVariantMap();
        if (!m_marks.isEmpty()) { m_marks.insert("assetId", id); }
    }
    if (!id.isEmpty() && id != m_cueAssetId) { m_cueAssetId.clear(); m_cueMs = 0; }
    clearError(); emit changed();
}
void SourceViewerState::cue(const QVariantMap& asset, double timeMs) {
    m_cueAssetId = asset.value("id").toString();
    m_cueMs = timeMs;
    setAsset(asset);
    emit cued();
}
QString SourceViewerState::mediaType() const {
    return nt::assets::assetMediaType(QJsonObject{{"content_type", QJsonValue::fromVariant(m_asset.value("content_type"))}});
}
double SourceViewerState::inMs() const {
    if (m_drag) { return m_drag->preview.inMs; }
    return nt::sourceedit::sourceRangeFor(QJsonObject::fromVariantMap(m_asset), QJsonObject::fromVariantMap(m_marks)).inMs;
}
double SourceViewerState::outMs() const {
    if (m_drag) { return m_drag->preview.outMs; }
    return nt::sourceedit::sourceRangeFor(QJsonObject::fromVariantMap(m_asset), QJsonObject::fromVariantMap(m_marks)).outMs;
}
double SourceViewerState::durationMs() const {
    const double limit = durationLimit(m_asset);
    return std::isfinite(limit) ? limit : 0;
}
void SourceViewerState::markIn(double timeMs) {
    if (!std::isfinite(timeMs) || mediaType() == "image" ||
        (mediaType() != "video" && !(m_monitor->ready() && mediaType() == "audio"))) { return; }
    cancelRangeDrag();
    double time = std::max(0.0, std::min(timeMs, durationLimit(m_asset)));
    if (m_monitor->ready()) { time = nt::sourceedit::frameFloorMs(time, m_monitor->frameRate()); }
    auto marks = m_marks; marks.insert("inMs", time);
    if (time >= outMs()) { marks.remove("outMs"); }
    writeMarks(marks); clearError();
}
void SourceViewerState::markOut(double timeMs) {
    if (!std::isfinite(timeMs) || mediaType() == "image" ||
        (mediaType() != "video" && !(m_monitor->ready() && mediaType() == "audio"))) { return; }
    cancelRangeDrag();
    double time = std::max(0.0, std::min(timeMs, durationLimit(m_asset)));
    if (m_monitor->ready()) {
        time = std::min(durationLimit(m_asset), nt::sourceedit::frameFloorMs(time, m_monitor->frameRate()) + nt::sourceedit::frameDurationMs(m_monitor->frameRate()));
    }
    auto marks = m_marks; marks.insert("outMs", time);
    if (time <= inMs()) { marks.remove("inMs"); }
    writeMarks(marks); clearError();
}
void SourceViewerState::beginRangeDrag(const QString& edge) {
    if (m_asset.isEmpty() || (mediaType() != "video" && mediaType() != "audio") || durationMs() <= 0 ||
        (edge != "in" && edge != "out" && edge != "move")) { return; }
    cancelRangeDrag();
    const nt::sourceedit::Range range{inMs(), outMs()};
    const auto kind = edge == "in" ? nt::sourceedit::RangeEdge::In : edge == "out" ? nt::sourceedit::RangeEdge::Out : nt::sourceedit::RangeEdge::Move;
    if (!nt::sourceedit::adjustRange(durationMs(), range, m_monitor->frameRate(), kind, 0)) { return; }
    m_monitor->pause(); m_drag = Drag{range, range, kind}; emit changed();
}
void SourceViewerState::updateRangeDrag(double deltaMs) {
    if (!m_drag) { return; }
    const auto preview = nt::sourceedit::adjustRange(durationMs(), m_drag->original, m_monitor->frameRate(), m_drag->edge, deltaMs);
    if (preview) { m_drag->preview = *preview; emit changed(); }
}
void SourceViewerState::commitRangeDrag() {
    if (!m_drag) { return; }
    const auto drag = *m_drag; m_drag.reset();
    if (drag.original.inMs != drag.preview.inMs || drag.original.outMs != drag.preview.outMs) {
        auto marks = m_marks;
        if (drag.edge != nt::sourceedit::RangeEdge::Out) { marks.insert("inMs", drag.preview.inMs); }
        if (drag.edge != nt::sourceedit::RangeEdge::In) { marks.insert("outMs", drag.preview.outMs); }
        writeMarks(marks); clearError();
    }
    emit changed();
}
void SourceViewerState::cancelRangeDrag() { if (m_drag) { m_drag.reset(); emit changed(); } }
QVariantMap SourceViewerState::captureRange() const {
    m_monitor->pause(); return {{"asset", m_asset}, {"inMs", inMs()}, {"outMs", outMs()}};
}
bool SourceViewerState::canPlace(const QString& trackId, bool video, bool audio, ClipGestureController* gestures) const {
    return gestures && gestures->timeline() && !m_asset.isEmpty() &&
        nt::sourceedit::sourceDropDestinations(gestures->timeline()->timeline().raw, trackId, video, audio).error.isEmpty();
}
bool SourceViewerState::applyPlacement(nt::sourceedit::Placement placement, ClipGestureController* gestures) {
    if (!gestures || !gestures->timeline()) { setError("Open a timeline to place this source."); return false; }
    auto* timeline = gestures->timeline();
    placement.videoClipId = nt::edit::newId();
    placement.audioClipId = nt::edit::newId();
    QString error;
    const auto result = nt::sourceedit::placeSource(timeline->timeline().raw, nt::targeting::TrackTargeting::current().state(), placement, &error);
    if (!result) { setError(error); return false; }
    const auto payload = nt::sourceedit::placementToJson(placement);
    const bool applied = m_mediaBrowser && m_mediaBrowser->timeline() == timeline ? m_mediaBrowser->placeSource(payload) : timeline->applyEdit("source.place", payload) != 0;
    if (!applied) { setError("This source could not be placed here."); return false; }
    QStringList selected;
    for (const auto& value : timeline->clipsJson()) {
        const auto id = value.toObject().value("id").toString();
        if (id == placement.videoClipId || id == placement.audioClipId) { selected.append(id); }
    }
    gestures->setSelection(selected); clearError(); return true;
}
bool SourceViewerState::place(const QString& mode, const QString& trackId, double startMs, double snapMs,
                              bool video, bool audio, const QVariantMap& capturedRange, ClipGestureController* gestures) {
    if (!gestures || !gestures->timeline()) { setError("Open a timeline to place this source."); return false; }
    const auto destinations = nt::sourceedit::sourceDropDestinations(gestures->timeline()->timeline().raw, trackId, video, audio);
    if (!destinations.error.isEmpty()) { setError(destinations.error); return false; }
    const auto range = QJsonObject::fromVariantMap(capturedRange);
    if (!range.value("asset").isObject() || !range.value("inMs").isDouble() || !range.value("outMs").isDouble()) {
        setError("Mark a non-empty source range.");
        return false;
    }
    nt::sourceedit::Placement p;
    p.asset = range.value("asset").toObject(); p.inMs = range.value("inMs").toDouble(); p.outMs = range.value("outMs").toDouble();
    p.videoTrackId = destinations.videoTrackId; p.audioTrackId = destinations.audioTrackId;
    p.newVideoTrack = destinations.newVideoTrack; p.newAudioTrack = destinations.newAudioTrack;
    p.mode = mode; p.startMs = startMs; p.snapMs = snapMs;
    return applyPlacement(p, gestures);
}
bool SourceViewerState::runAction(const QString& action, bool autoRepeat) {
    if (mediaType() == "image") { return false; }
    const bool mark = action == "markIn" || action == "markOut";
    if (!m_monitor->ready() && !(mark && mediaType() == "video")) { return false; }
    if (action == "playInToOut") { return false; }
    if (mark) {
        if (action == "markIn") { markIn(m_monitor->clock()->time()); } else { markOut(m_monitor->clock()->time()); }
    } else if (action == "shuttleBack" || action == "shuttleForward") {
        if (!autoRepeat) { m_monitor->shuttle(action == "shuttleBack" ? -1 : 1); }
    } else if (action == "shuttleStop") { m_monitor->shuttleStop(); }
    else if (action == "stepFrameBack" || action == "stepFrameForward" || action == "stepFramesBack" || action == "stepFramesForward") {
        const int frames = action.startsWith("stepFrames") ? 5 : 1;
        m_monitor->stepFrames(action.endsWith("Back") ? -frames : frames);
    } else if (action == "goToIn") { m_monitor->seek(inMs()); }
    else if (action == "goToOut") {
        const double fps = m_monitor->frameRate();
        const double index = std::max(0.0, std::ceil(outMs() * fps / 1000 - 1e-6) - 1);
        m_monitor->seek(index * 1000 / fps);
    } else if (action == "clearRange") { clearMarks(); }
    else if (action == "playPause") { if (!autoRepeat) { m_monitor->togglePlay(); } }
    else { return false; }
    return true;
}
void SourceViewerState::setIn(const QString& seconds) {
    if (const auto value = parseSeconds(seconds)) {
        auto marks = m_marks;
        marks.insert("inMs", std::min(std::min(*value, durationLimit(m_asset)), outMs()));
        writeMarks(marks); clearError();
    }
}
void SourceViewerState::setOut(const QString& seconds) {
    if (const auto value = parseSeconds(seconds)) {
        auto marks = m_marks;
        marks.insert("outMs", std::max(inMs(), std::min(*value, durationLimit(m_asset))));
        writeMarks(marks); clearError();
    }
}
bool SourceViewerState::perform(const QString& kind, ClipGestureController* gestures) {
    if (!gestures || !gestures->timeline() || !gestures->clock() ||
        (kind != "append" && kind != "insert" && kind != "overwrite")) { return false; }
    auto* timeline = gestures->timeline();
    QSet<QString> tracks;
    for (const auto& value : timeline->timeline().raw.value("tracks").toArray()) { tracks.insert(value.toObject().value("id").toString()); }
    bool pruned = false;
    for (auto* patch : {&m_videoPatch, &m_audioPatch}) {
        if (!patch->isEmpty() && !tracks.contains(*patch)) { patch->clear(); pruned = true; }
    }
    if (pruned) {
        emit patchChanged();
        setError("The patched track is no longer in this timeline. Patch another track.");
        return false;
    }
    if (!m_videoPatch.isEmpty() || !m_audioPatch.isEmpty()) {
        nt::sourceedit::Placement p;
        p.asset = QJsonObject::fromVariantMap(m_asset); p.inMs = inMs(); p.outMs = outMs();
        if (mediaType() == "video" || mediaType() == "image") { p.videoTrackId = m_videoPatch; }
        if (mediaType() == "audio" || (mediaType() == "video" && (m_monitor->hasAudio() || m_monitor->mediaType().isEmpty()))) { p.audioTrackId = m_audioPatch; }
        if (p.videoTrackId.isEmpty() && p.audioTrackId.isEmpty()) { setError("Patch a video or audio track to place this source."); return false; }
        p.startMs = gestures->clock()->time(); p.mode = kind;
        return applyPlacement(p, gestures);
    }
    const auto before = timeline->clipsJson();
    const auto result = nt::sourceedit::performSourceEdit(kind, timeline->timeline().raw,
        nt::targeting::TrackTargeting::current().state(), QJsonObject::fromVariantMap(m_marks),
        gestures->clock()->time(), QJsonObject::fromVariantMap(m_asset));
    if (!result) {
        const bool emptyRange = mediaType() != "image" && outMs() <= inMs();
        setError(emptyRange ? "Mark a non-empty source range." : "No unlocked track fits this media. Unlock or target a track.");
        return false;
    }
    const auto label = kind.first(1).toUpper() + kind.sliced(1) + " source";
    if (!timeline->commitEdit(label, before, result->doc.value("clips").toArray())) { return false; }
    if (m_mediaBrowser && m_mediaBrowser->timeline() == timeline) {
        m_mediaBrowser->resolveClipMedia(m_asset, result->id);
    }
    gestures->setSelection({result->id});
    clearError(); return true;
}
QString SourceViewerState::shortcut(const QString& kind, const QString& preset) const {
    return nt::edit::formatActionShortcut(preset, actionName(kind));
}
