#include "motion/gesture/ClipDelta.h"
#include "model/TimelineModel.h"

#include "model/TimelineJson.h"
#include "app/EditRegistry.h"

#include <QHash>
#include <QJsonDocument>
#include <QUndoCommand>
#include <QUuid>

#include <algorithm>
#include <atomic>
#include <cmath>
#include <exception>
#include <memory>

namespace {

// The media identity of a clip: every field that decides which files a
// loader resolves (the picture, the sound and the asset).
QString mediaKey(const QJsonObject& raw) {
    return raw.value(u"mediaType").toString() + QChar(0x1f) + raw.value(u"mediaPath").toString() + QChar(0x1f) +
           raw.value(u"originalMediaPath").toString() + QChar(0x1f) + raw.value(u"audioPath").toString() +
           QChar(0x1f) + raw.value(u"currentAssetId").toString();
}

// The top-level keys whose values differ between two documents, in one pass.
QSet<QString> differingKeys(const QJsonObject& a, const QJsonObject& b) {
    QSet<QString> keys;
    for (auto it = a.begin(); it != a.end(); ++it) {
        if (b.value(it.key()) != it.value()) keys.insert(it.key());
    }
    for (auto it = b.begin(); it != b.end(); ++it) {
        if (!a.contains(it.key())) keys.insert(it.key());
    }
    return keys;
}

bool onlyKey(const QSet<QString>& keys, const QString& key) {
    return keys.size() == 1 && keys.contains(key);
}

// Every field of `t` but the clips, which the caller sets.
nt::Timeline copyWithoutClips(const nt::Timeline& t) {
    nt::Timeline next;
    next.id = t.id;
    next.name = t.name;
    next.fps = t.fps;
    next.dropFrame = t.dropFrame;
    next.width = t.width;
    next.height = t.height;
    next.durationMs = t.durationMs;
    next.masterVolumeDb = t.masterVolumeDb;
    next.tracks = t.tracks;
    next.scene = t.scene;
    next.raw = t.raw;
    next.revision = t.revision;
    next.clipIndex = t.clipIndex;
    next.matteClipId = t.matteClipId;
    next.matteEffectId = t.matteEffectId;
    return next;
}

quint64 nextCommandToken() {
    // native-rules #14: static mutable revision counter
    static std::atomic<quint64> next{1};
    return next.fetch_add(1, std::memory_order_relaxed);
}

// One edit of the `markers` array.
class MarkersCommand : public QUndoCommand {
public:
    MarkersCommand(TimelineModel* model, QJsonArray before, QJsonArray after, const QString& text)
        : QUndoCommand(text), m_model(model), m_before(std::move(before)), m_after(std::move(after)) {}
    void redo() override { m_model->replaceMarkers(m_after); }
    void undo() override { m_model->replaceMarkers(m_before); }

private:
    TimelineModel* m_model;
    QJsonArray m_before;
    QJsonArray m_after;
};

class DocumentCommand : public QUndoCommand {
public:
    DocumentCommand(QString name, QJsonObject before, QJsonObject after,
                    std::function<void(const QJsonObject&)> replace, quint64 token,
                    int mergeId = 0, bool continuation = false)
        : QUndoCommand(name), m_before(std::move(before)), m_after(std::move(after)),
          m_replace(std::move(replace)), m_token(token), m_id(mergeId > 0 ? mergeId : -1),
          m_continuation(continuation) {}
    void redo() override { m_replace(m_after); }
    void undo() override { m_replace(m_before); }
    int id() const override { return m_id; }
    bool mergeWith(const QUndoCommand* other) override {
        const auto* next = dynamic_cast<const DocumentCommand*>(other);
        if (!next || !next->m_continuation) { return false; }
        m_after = next->m_after;
        m_token = next->m_token;
        return true;
    }
    quint64 token() const { return m_token; }
    void settle(const QJsonObject& document) { m_after = document; }
private:
    QJsonObject m_before;
    QJsonObject m_after;
    std::function<void(const QJsonObject&)> m_replace;
    quint64 m_token;
    int m_id;
    bool m_continuation;
};

}  // namespace

TimelineModel::TimelineModel(QObject* parent)
    : QObject(parent),
      m_timeline(std::make_shared<const nt::Timeline>()),
      m_tracks(new TrackListModel(this)),
      m_undo(new QUndoStack(this)) {}

void TimelineModel::setEffectMattePreview(const QString& clipId, const QString& effectId) {
    auto nextClip=clipId.toStdString(), nextEffect=effectId.toStdString();
    const auto* clip=m_timeline->findClip(nextClip);
    bool valid=false;
    if (clip) {
        for (const auto& value : clip->raw.value("effects").toArray()) {
            const auto effect=value.toObject();
            valid |= effect.value("id")==effectId && effect.value("type")=="secondaryColor" && effect.value("enabled").toBool();
        }
    }
    if (!valid) { nextClip.clear(); nextEffect.clear(); }
    if (m_timeline->matteClipId==nextClip && m_timeline->matteEffectId==nextEffect) { return; }
    auto next=std::make_shared<nt::Timeline>(*m_timeline);
    next->matteClipId=std::move(nextClip);
    next->matteEffectId=std::move(nextEffect);
    next->revision=nt::nextTimelineRevision();
    m_timeline=std::move(next);
    m_tracks->rebind(m_timeline.get());
    emit effectMatteChanged();
    emit previewChanged();
}

void TimelineModel::setTimeline(nt::Timeline timeline) {
    timeline.matteClipId.clear();
    timeline.matteEffectId.clear();
    m_media.clear();
    m_mattes.clear();
    for (const auto& c : timeline.clips) {
        if (!c.generatedMattePath.empty()) m_mattes.insert(c.raw.value("generatedMatte").toObject().value("assetId").toString(), c.generatedMattePath);
        if (!c.mediaPath.empty() || !c.originalMediaPath.empty() || !c.audioPath.empty())
            m_media.insert(mediaKey(c.raw), {c.mediaPath, c.originalMediaPath, c.audioPath});
    }
    timeline.revision = nt::nextTimelineRevision();
    timeline.indexClips();
    m_timeline = std::make_shared<const nt::Timeline>(std::move(timeline));
    markAllChanged();
    ++m_generation;
    emit effectMatteChanged();
    emit documentReplaced();
    m_undo->clear();
    m_tracks->reset(m_timeline.get());
    // A new document replaces the clips too: lane models that outlive the
    // reset must drop the old snapshot.
    emit clipsChanged();
    emit timelineChanged();
    emit markersChanged();
}

double TimelineModel::contentEndMs() const {
    double end = m_timeline->durationMs;
    for (const auto& c : m_timeline->clips) {
        end = std::max(end, c.endMs());
    }
    return end;
}

QJsonArray TimelineModel::clipsJson() const {
    return m_timeline->raw.value(u"clips").toArray();
}

QByteArray TimelineModel::documentJson() const {
    return QJsonDocument(m_timeline->raw).toJson(QJsonDocument::Compact);
}

bool TimelineModel::replaceClips(const QJsonArray& clips) {
    // Incremental: a clip whose JSON did not change keeps its typed copy, and
    // only the changed clips are parsed. An unchanged clip shares its JSON
    // with the old one, so the comparison is a pointer check.
    const nt::Timeline& old = *m_timeline;
    std::vector<int> reuse(static_cast<size_t>(clips.size()), -1);
    bool sameIds = clips.size() == static_cast<int>(old.clips.size());
    bool same = sameIds;
    for (int i = 0; i < clips.size(); ++i) {
        const QJsonObject c = clips.at(i).toObject();
        // Most clips keep their place: compare at the same index first.
        if (static_cast<size_t>(i) < old.clips.size() && old.clips[static_cast<size_t>(i)].raw == c) {
            reuse[static_cast<size_t>(i)] = i;
            continue;
        }
        const nt::Clip* prev = old.findClip(c.value(u"id").toString().toStdString());
        const int j = prev ? static_cast<int>(prev - old.clips.data()) : -1;
        sameIds = sameIds && j == i;
        if (j >= 0 && prev->raw == c) {
            reuse[static_cast<size_t>(i)] = j;
            same = same && j == i;
        } else {
            same = false;
        }
    }
    if (same) return false;
    return applyClips(clips, reuse, sameIds);
}

bool TimelineModel::patchClips(const QJsonArray& changed) {
    return patch(changed, false);
}

bool TimelineModel::previewClips(const QJsonArray& changed) {
    return patch(changed, true);
}

bool TimelineModel::previewTrackEffects(const QJsonArray& tracks) {
    if (tracks == m_timeline->raw.value("tracks").toArray() || tracks.size() != qsizetype(m_timeline->tracks.size())) {
        return false;
    }
    auto next = *m_timeline;
    for (qsizetype i = 0; i < tracks.size(); ++i) {
        const auto raw = tracks[i].toObject();
        auto before = next.tracks[size_t(i)].raw;
        auto after = raw;
        before.remove("effects"); after.remove("effects");
        if (before != after) { return false; }
        next.tracks[size_t(i)].raw = raw;
    }
    next.raw.insert("tracks", tracks);
    next.revision = nt::nextTimelineRevision();
    m_timeline = std::make_shared<const nt::Timeline>(std::move(next));
    m_tracks->rebind(m_timeline.get());
    emit previewChanged();
    return true;
}

void TimelineModel::settleTransient() {
    if (!m_transient) return;
    Transient pending = std::move(*m_transient);
    m_transient.reset();
    m_changedClipIds = std::move(pending.clipIds);
    m_changedTrackIds = std::move(pending.trackIds);
    if (pending.takesChanged) ++m_takesRevision;
    emit clipsChanged();
    emit timelineChanged();
}

bool TimelineModel::patch(const QJsonArray& changed, bool transient) {
    const nt::Timeline& old = *m_timeline;
    QJsonArray clips = old.raw.value(u"clips").toArray();
    std::vector<int> reuse(old.clips.size());
    for (size_t i = 0; i < reuse.size(); ++i) reuse[i] = static_cast<int>(i);
    bool any = false;
    for (const auto& value : changed) {
        const QJsonObject c = value.toObject();
        const nt::Clip* prev = old.findClip(c.value(u"id").toString().toStdString());
        if (!prev) return false;
        if (prev->raw == c) continue;
        const auto i = static_cast<size_t>(prev - old.clips.data());
        clips.replace(static_cast<int>(i), c);
        reuse[i] = -1;
        any = true;
    }
    return any && applyClips(clips, reuse, true, transient);
}

bool TimelineModel::applyClips(const QJsonArray& clips, const std::vector<int>& reuse, bool sameIds, bool transient) {
    const nt::Timeline& old = *m_timeline;
    QJsonObject raw = old.raw;
    raw.insert(QStringLiteral("clips"), clips);
    QJsonArray changed;
    for (size_t i = 0; i < reuse.size(); ++i) {
        if (reuse[i] < 0) changed.append(clips.at(static_cast<int>(i)));
    }
    std::vector<nt::Clip> parsedClips;
    if (!changed.isEmpty()) {
        // The changed clips parse in a document of their own with the
        // sequence's fields and tracks.
        QJsonObject part = raw;
        part.insert(QStringLiteral("clips"), changed);
        nt::ParseResult parsed = nt::parseTimeline(part);
        if (!parsed.timeline || parsed.timeline->clips.size() != static_cast<size_t>(changed.size())) return false;
        parsedClips = std::move(parsed.timeline->clips);
        // The parse knows neither the load's base folder nor the server's
        // asset cache: take the media the document's load resolved.
        for (auto& c : parsedClips) {
            c.generatedMattePath = m_mattes.value(c.raw.value("generatedMatte").toObject().value("assetId").toString());
            const auto it = m_media.constFind(mediaKey(c.raw));
            if (it != m_media.constEnd()) {
                c.mediaPath = it->picture;
                c.originalMediaPath = it->originalPicture;
                c.audioPath = it->audio;
            }
        }
    }
    QSet<QString> changedIds;
    QSet<QString> changedTracks;
    bool takesChanged = !sameIds;
    std::vector<nt::Clip> nextClips;
    nextClips.reserve(reuse.size());
    size_t k = 0;
    for (size_t i = 0; i < reuse.size(); ++i) {
        if (reuse[i] >= 0) {
            nextClips.push_back(old.clips[static_cast<size_t>(reuse[i])]);
            continue;
        }
        nt::Clip& next = parsedClips[k++];
        if (!takesChanged) {
            const nt::Clip* prev = old.findClip(next.id);
            takesChanged = !prev || prev->raw.value(u"versions") != next.raw.value(u"versions");
        }
        changedIds.insert(QString::fromStdString(next.id));
        if (const nt::Clip* prev = old.findClip(next.id)) changedTracks.insert(QString::fromStdString(prev->trackId));
        changedTracks.insert(QString::fromStdString(next.trackId));
        nextClips.push_back(std::move(next));
    }
    // Every other field (the sequence's and the tracks') stays as loaded.
    nt::Timeline full = copyWithoutClips(old);
    full.raw = std::move(raw);
    full.clips = std::move(nextClips);
    full.revision = nt::nextTimelineRevision();
    if (!sameIds) full.indexClips();
    m_timeline = std::make_shared<const nt::Timeline>(std::move(full));
    m_tracks->rebind(m_timeline.get());
    if (transient) {
        if (!m_transient) m_transient.emplace(Transient{});
        m_transient->clipIds.unite(changedIds);
        m_transient->trackIds.unite(changedTracks);
        m_transient->takesChanged = m_transient->takesChanged || takesChanged;
        emit previewChanged();
        return true;
    }
    if (m_transient) {
        // A full change also carries the transient ones before it.
        changedIds.unite(m_transient->clipIds);
        changedTracks.unite(m_transient->trackIds);
        takesChanged = takesChanged || m_transient->takesChanged;
        m_transient.reset();
    }
    m_changedClipIds = sameIds ? std::optional<QSet<QString>>(std::move(changedIds)) : std::nullopt;
    m_changedTrackIds = std::move(changedTracks);
    if (takesChanged) ++m_takesRevision;
    emit clipsChanged();
    emit timelineChanged();
    return true;
}

bool TimelineModel::trackTouched(const QString& trackId) const {
    return !m_changedClipIds || m_changedTrackIds.contains(trackId);
}

bool TimelineModel::clipTouched(const QString& clipId) const {
    return !m_changedClipIds || m_changedClipIds->contains(clipId);
}

const nt::Clip* TimelineModel::findClip(const QString& clipId) const {
    return m_timeline->findClip(clipId.toStdString());
}

void TimelineModel::markAllChanged() {
    m_transient.reset();
    m_changedClipIds.reset();
    ++m_takesRevision;
}

void TimelineModel::markClipsChanged(QSet<QString> clipIds, QSet<QString> trackIds) {
    if (m_transient) {
        // The notification also carries the transient changes before it.
        clipIds.unite(m_transient->clipIds);
        trackIds.unite(m_transient->trackIds);
        if (m_transient->takesChanged) ++m_takesRevision;
        m_transient.reset();
    }
    m_changedClipIds = std::move(clipIds);
    m_changedTrackIds = std::move(trackIds);
}

quint64 TimelineModel::commitEdit(const QString& text, const QJsonArray& before, const QJsonArray& after, int mergeId,
                               bool continuation) {
    const QJsonArray savedBefore = before;
    const QJsonArray savedAfter = after;
    if (savedBefore == savedAfter) return false;
    const auto liveBefore = clipsJson();
    emit beforeCommand();
    const auto restored = clipsJson();
    // An external command may have been computed against a transient preview.
    // Apply only its observable changes to the restored committed clips.
    const bool rebased = liveBefore != restored;
    const auto commandBefore = rebased ? restored : savedBefore;
    const auto commandAfter = rebased ? nt::motion::rebaseClipDelta(restored, savedBefore, savedAfter) : savedAfter;
    if (rebased && commandBefore == commandAfter) return false;
    auto beforeDocument = m_timeline->raw;
    beforeDocument.insert("clips", commandBefore);
    auto afterDocument = m_timeline->raw;
    afterDocument.insert("clips", commandAfter);
    const auto token = nextCommandToken();
    auto command = std::make_unique<DocumentCommand>(text, std::move(beforeDocument), std::move(afterDocument),
        [this](const QJsonObject& raw) { replaceFromHistory(raw); }, token, mergeId, continuation);
    m_undo->push(command.release());
    return token;
}

bool TimelineModel::moveClip(const QString& clipId, double startMs) {
    const nt::Clip* clip = findClip(clipId);
    if (!clip) return false;
    const QJsonArray before = clipsJson();
    // The typed clips keep the raw array's order.
    const auto i = static_cast<int>(clip - m_timeline->clips.data());
    if (i >= before.size() || before.at(i).toObject().value(u"id").toString() != clipId) return false;
    QJsonObject c = clip->raw;
    c.insert(QStringLiteral("startMs"), std::max(0.0, startMs));
    QJsonArray clips = before;
    clips.replace(i, c);
    return commitEdit(QStringLiteral("Move clip"), before, clips);
}

QJsonArray TimelineModel::markersJson() const {
    return m_timeline->raw.value(u"markers").toArray();
}

QVariantList TimelineModel::markers() const {
    return markersJson().toVariantList();
}

bool TimelineModel::replaceMarkers(const QJsonArray& incoming) {
    const QJsonArray markers = incoming;
    emit beforeCommand();
    if (markers == markersJson()) return false;
    nt::Timeline next = *m_timeline;
    next.raw.insert(QStringLiteral("markers"), markers);
    next.revision = nt::nextTimelineRevision();
    m_timeline = std::make_shared<const nt::Timeline>(std::move(next));
    // No clip changed: the clip change state and the takes stay.
    m_tracks->rebind(m_timeline.get());
    emit markersChanged();
    return true;
}

QString TimelineModel::addMarker(double timeMs, const QString& label) {
    // makeMarker: a fresh id, the time rounded to whole ms and not negative.
    const QString id = QUuid::createUuid().toString(QUuid::Id128);
    QJsonArray after = markersJson();
    after.append(QJsonObject{{QStringLiteral("id"), id},
                             {QStringLiteral("timeMs"), std::max(0.0, std::round(timeMs))},
                             {QStringLiteral("label"), label}});
    // native-rules #2: naked new handed to QUndoStack::push, a raw pointer that the stack owns
    m_undo->push(new MarkersCommand(this, markersJson(), after, QStringLiteral("Add marker")));
    return id;
}

bool TimelineModel::deleteMarker(const QString& markerId) {
    QJsonArray after;
    const QJsonArray before = markersJson();
    for (const QJsonValue& m : before) {
        if (m.toObject().value(u"id").toString() != markerId) after.append(m);
    }
    if (after.size() == before.size()) return false;
    // native-rules #2: naked new handed to QUndoStack::push, a raw pointer that the stack owns
    m_undo->push(new MarkersCommand(this, before, after, QStringLiteral("Delete marker")));
    return true;
}

void TimelineModel::close() {
    nt::Timeline empty;
    empty.name = m_timeline->name;
    empty.fps = m_timeline->fps;
    empty.width = m_timeline->width;
    empty.height = m_timeline->height;
    setTimeline(std::move(empty));
}

quint64 TimelineModel::applyEdit(const QString& name, const QJsonObject& payload) {
    const auto edit = nt::app::findEdit(name);
    if (!edit) {
        return false;
    }
    // False when nothing changed or `after` is not a valid document. `before` is the current document.
    const auto valid = [this](const QJsonObject& before, const QJsonObject& after) {
        const auto keys = differingKeys(before, after);
        if (keys.isEmpty()) {
            return false;
        }
        if (onlyKey(keys, QStringLiteral("clips"))) {
            if (!after.value("clips").isArray()) {
                return false;
            }
            QJsonArray changed;
            for (const auto& value : after.value("clips").toArray()) {
                if (!value.isObject()) {
                    return false;
                }
                const auto clip = value.toObject();
                const nt::Clip* existing = m_timeline->findClip(clip.value("id").toString().toStdString());
                if (!existing || existing->raw != clip) {
                    changed.append(clip);
                }
            }
            if (!changed.isEmpty()) {
                auto part = after;
                part.insert("clips", changed);
                const auto parsed = nt::parseTimeline(part);
                if (!parsed.timeline || parsed.timeline->clips.size() != static_cast<size_t>(changed.size())) {
                    return false;
                }
            }
        } else if (onlyKey(keys, QStringLiteral("markers"))) {
            if (!after.value("markers").isArray()) {
                return false;
            }
        } else if (!nt::parseTimeline(after).timeline) {
            return false;
        }
        return true;
    };
    // An edit that cannot apply to this document throws (ClipOps' OpError).
    // That leaves the document as it was instead of ending the process.
    const auto run = [&](const QJsonObject& raw) -> std::optional<QJsonObject> {
        try {
            return edit(raw, payload);
        } catch (const std::exception& error) {
            qWarning("edit %s failed: %s", qPrintable(name), error.what());
            return std::nullopt;
        }
    };
    const auto snapshot = m_timeline;
    auto before = snapshot->raw;
    auto after = run(before);
    if (!after || !valid(before, *after)) { return false; }
    emit beforeCommand();
    if (m_timeline != snapshot && m_timeline->raw != before) {
        before = m_timeline->raw;
        after = run(before);
        if (!after || !valid(before, *after)) { return false; }
    }
    const auto token = nextCommandToken();
    auto command = std::make_unique<DocumentCommand>(name, before, *after,
        [this](const QJsonObject& raw) { replaceFromHistory(raw); }, token);
    m_undo->push(command.release());
    return token;
}

bool TimelineModel::replaceFromHistory(QJsonObject raw) {
    // No edit changes the project. The server can move the timeline to another
    // project while it is open (setProjectId), and undo must not move it back.
    const auto project = m_timeline->raw.value(QStringLiteral("projectId"));
    if (project.isUndefined()) { raw.remove(QStringLiteral("projectId")); }
    else { raw.insert(QStringLiteral("projectId"), project); }
    return replaceDocument(raw);
}

bool TimelineModel::setProjectId(const QString& projectId) {
    if (projectId.isEmpty() || m_timeline->raw.value(QStringLiteral("projectId")).toString() == projectId) { return false; }
    auto raw = m_timeline->raw;
    raw.insert(QStringLiteral("projectId"), projectId);
    return replaceDocument(raw);
}

bool TimelineModel::replaceDocument(const QJsonObject& incoming) {
    const QJsonObject raw = incoming;
    emit beforeCommand();
    const auto keys = differingKeys(m_timeline->raw, raw);
    if (keys.isEmpty()) {
        return false;
    }
    if (onlyKey(keys, QStringLiteral("clips")) && raw.contains("clips")) {
        return replaceClips(raw.value("clips").toArray());
    }
    if (onlyKey(keys, QStringLiteral("markers")) && raw.contains("markers")) {
        return replaceMarkers(raw.value("markers").toArray());
    }
    const bool clipsSame = !keys.contains(QStringLiteral("clips"));
    const bool tracksChanged = keys.contains(QStringLiteral("tracks"));
    const bool markersChangedValue = keys.contains(QStringLiteral("markers"));
    // Keeps the old snapshot alive: the track rows compare against it.
    const auto previous = m_timeline;
    nt::Timeline next;
    if (clipsSame) {
        // Only the sequence's fields or the tracks changed: parse them alone and keep the typed clips.
        auto part = raw;
        part.remove(QStringLiteral("clips"));
        auto parsed = nt::parseTimeline(part);
        if (!parsed.timeline) {
            return false;
        }
        QSet<QString> trackIds;
        for (const auto& track : parsed.timeline->tracks) trackIds.insert(QString::fromStdString(track.id));
        for (const auto& clip : previous->clips) {
            if (!trackIds.contains(QString::fromStdString(clip.trackId))) return false;
        }
        next = std::move(*parsed.timeline);
        next.raw = raw;
        next.clips = previous->clips;
        next.clipIndex = previous->clipIndex;
    } else {
        auto parsed = nt::parseTimeline(raw);
        if (!parsed.timeline) {
            return false;
        }
        next = std::move(*parsed.timeline);
        for (auto& clip : next.clips) {
            clip.generatedMattePath = m_mattes.value(clip.raw.value("generatedMatte").toObject().value("assetId").toString());
            const auto media = m_media.constFind(mediaKey(clip.raw));
            if (media != m_media.constEnd()) {
                clip.mediaPath = media->picture;
                clip.originalMediaPath = media->originalPicture;
                clip.audioPath = media->audio;
            }
        }
    }
    next.matteClipId = previous->matteClipId;
    next.matteEffectId = previous->matteEffectId;
    next.revision = nt::nextTimelineRevision();
    m_timeline = std::make_shared<const nt::Timeline>(std::move(next));
    if (clipsSame) {
        // No clip changed: every lane keeps its rows and rebases.
        markClipsChanged({}, {});
    } else {
        markAllChanged();
    }
    if (!tracksChanged) {
        m_tracks->rebind(m_timeline.get());
    } else if (!m_tracks->refresh(m_timeline.get())) {
        m_tracks->reset(m_timeline.get());
    }
    emit clipsChanged();
    emit timelineChanged();
    if (markersChangedValue) {
        emit markersChanged();
    }
    return true;
}

void TimelineModel::registerMedia(const nt::Clip& media) {
    const auto key = mediaKey(media.raw);
    m_media.insert(key, {media.mediaPath, media.originalMediaPath, media.audioPath});
    const QString matteId = media.raw.value("generatedMatte").toObject().value("assetId").toString();
    if (!matteId.isEmpty() && !media.generatedMattePath.empty()) {
        m_mattes.insert(matteId, media.generatedMattePath);
    }
    auto next = *m_timeline;
    QSet<QString> changedIds;
    QSet<QString> changedTracks;
    for (auto& clip : next.clips) {
        bool changed = false;
        if (mediaKey(clip.raw) == key &&
            (clip.mediaPath != media.mediaPath || clip.originalMediaPath != media.originalMediaPath ||
             clip.audioPath != media.audioPath)) {
            clip.mediaPath = media.mediaPath;
            clip.originalMediaPath = media.originalMediaPath;
            clip.audioPath = media.audioPath;
            changed = true;
        }
        if (!matteId.isEmpty() && !media.generatedMattePath.empty() &&
            clip.raw.value("generatedMatte").toObject().value("assetId").toString() == matteId &&
            clip.generatedMattePath != media.generatedMattePath) {
            clip.generatedMattePath = media.generatedMattePath;
            changed = true;
        }
        if (changed) {
            changedIds.insert(QString::fromStdString(clip.id));
            changedTracks.insert(QString::fromStdString(clip.trackId));
        }
    }
    if (changedIds.isEmpty()) { return; }
    next.revision = nt::nextTimelineRevision();
    m_timeline = std::make_shared<const nt::Timeline>(std::move(next));
    // Only the matching clips changed, and no take did.
    markClipsChanged(std::move(changedIds), std::move(changedTracks));
    m_tracks->rebind(m_timeline.get());
    emit clipsChanged();
    emit timelineChanged();
}

QSet<QString> TimelineModel::resolvedMediaPaths() const {
    QSet<QString> paths;
    for (const auto& media : m_media) {
        if (!media.picture.empty()) paths.insert(QString::fromStdString(media.picture));
        if (!media.originalPicture.empty()) paths.insert(QString::fromStdString(media.originalPicture));
        if (!media.audio.empty()) paths.insert(QString::fromStdString(media.audio));
    }
    for (const auto& matte : m_mattes) {
        if (!matte.empty()) paths.insert(QString::fromStdString(matte));
    }
    return paths;
}

void TimelineModel::registerMatteMedia(const QString& assetId, const std::string& path) {
    if (assetId.isEmpty()) { return; }
    m_mattes.insert(assetId, path);
    auto next = *m_timeline;
    QSet<QString> changedIds;
    QSet<QString> changedTracks;
    for (auto& clip : next.clips) {
        if (clip.raw.value("generatedMatte").toObject().value("assetId").toString() == assetId &&
            clip.generatedMattePath != path) {
            clip.generatedMattePath = path;
            changedIds.insert(QString::fromStdString(clip.id));
            changedTracks.insert(QString::fromStdString(clip.trackId));
        }
    }
    if (changedIds.isEmpty()) { return; }
    next.revision = nt::nextTimelineRevision();
    m_timeline = std::make_shared<const nt::Timeline>(std::move(next));
    // Only the matching clips changed, and no take did.
    markClipsChanged(std::move(changedIds), std::move(changedTracks));
    m_tracks->rebind(m_timeline.get());
    emit clipsChanged();
    emit timelineChanged();
}

bool TimelineModel::settleDocument(const QJsonObject& document) {
    if (!nt::parseTimeline(document).timeline) { return false; }
    const auto before = m_timeline->raw;
    const QJsonObject incoming = document;
    emit beforeCommand();
    const auto restored = m_timeline->raw;
    const auto after = before == restored ? incoming : nt::motion::rebaseDocumentDelta(restored, before, incoming);
    if (!replaceDocument(after)) { return false; }
    emit commandSettled();
    return true;
}

bool TimelineModel::settleCommand(quint64 token, const QJsonObject& document) {
    if (token == 0) { return false; }
    for (int i = 0; i < m_undo->count(); ++i) {
        const auto* command = dynamic_cast<const DocumentCommand*>(m_undo->command(i));
        if (!command || command->token() != token) { continue; }
        if (i + 1 != m_undo->count()) { return false; }
        if (!nt::parseTimeline(document).timeline) {
            return false;
        }
        QJsonObject settled = document;
        const bool current = m_undo->index() == i + 1;
        if (current) {
            const auto before = m_timeline->raw;
            emit beforeCommand();
            // A listener can put its running edit on the stack, and then this token is stale.
            if (i + 1 != m_undo->count()) { return false; }
            const auto restored = m_timeline->raw;
            if (before != restored) { settled = nt::motion::rebaseDocumentDelta(restored, before, settled); }
        }
        if (!nt::parseTimeline(settled).timeline) {
            return false;
        }
        // QUndoStack exposes commands as const, but owns the mutable command.
        const_cast<DocumentCommand*>(command)->settle(settled);
        if (current && replaceDocument(settled)) { emit commandSettled(); }
        return true;
    }
    return false;
}
